import './ai-content-filter.css';
import { configRead, configAddChangeListener } from './config.js';
import { getAiLabel, cancelAiLabelRequests } from './youtube-ai-label.js';
import { extractAiVideoId } from './ai-video-id.js';
import { recordAiVideo, removeAiVideo } from './ai-video-store.js';

/**
 * Checks rendered cards in the background: the first confirmed AI result is
 * badged and learned here; removal of learned IDs before render lives in adblock.js.
 */

const BADGE_ATTR = 'data-ytaf-ai-badge';
// Custom elements of YouTube's TV client that render one video card; each
// carries its data in `element.__instance.props.data`:
//  - ytlr-tile-renderer: the older tile (data: tileRenderer);
//  - yt-lockup-view-model: the newer lockup (data: lockupViewModel);
//  - ytlr-playlist-panel-video-wrapper-renderer: a playlist/queue row that
//    wraps one of the two above (data.primaryRenderer).
const INNER_CARD_SELECTOR = 'ytlr-tile-renderer, yt-lockup-view-model';
const WRAPPER_NAME = 'YTLR-PLAYLIST-PANEL-VIDEO-WRAPPER-RENDERER';
const CARD_SELECTOR = INNER_CARD_SELECTOR + ', ' + WRAPPER_NAME.toLowerCase();
const CARD_ATTRIBUTES = ['style', 'src', 'href', 'idomkey'];
const SWEEP_DELAY_MS = 50;

let initialized = false;
let enabled = false;
let generation = 0;
let rootObserver = null;
let cardObserver = null;
let observedCards = new WeakSet();
let sweepTimer = null;
let fullSweepPending = false;
const dirtyCards = new Set();
const records = new WeakMap();
const markedCards = new Set();

function isCardHost(node) {
  const name = node.nodeName;
  return name === 'YTLR-TILE-RENDERER' || name === 'YT-LOCKUP-VIEW-MODEL' || name === WRAPPER_NAME;
}

function ownerOf(node) {
  let found = null;
  for (let n = node; n; n = n.parentNode) if (n.nodeType === 1 && isCardHost(n)) found = n;
  return found;
}

function instanceData(el) {
  const instance = el.__instance;
  const props = instance && instance.props;
  return (props && props.data) || null;
}

function extractVideoId(owner) {
  try {
    const data = instanceData(owner);
    if (owner.nodeName === WRAPPER_NAME) {
      const primary = data && data.primaryRenderer;
      if (primary && primary.tileRenderer) return extractAiVideoId(primary.tileRenderer);
      if (primary && primary.lockupViewModel) return extractAiVideoId(primary.lockupViewModel);
      const inner = owner.querySelector(INNER_CARD_SELECTOR);
      return inner ? extractVideoId(inner) : null;
    }
    return extractAiVideoId(data);
  } catch { return null; }
}

function ownersIn(scope) {
  const nodes = scope.querySelectorAll(CARD_SELECTOR);
  const owners = [];
  for (let i = 0; i < nodes.length; i++) {
    let wrapped = false;
    for (let n = nodes[i].parentNode; n; n = n.parentNode) {
      if (n.nodeName === WRAPPER_NAME) { wrapped = true; break; }
    }
    if (!wrapped) owners.push(nodes[i]);
  }
  return owners;
}

function newRecord() { return { id: null, result: null, pendingId: null, pendingGen: -1, badged: false }; }

function markCard(owner, rec) {
  if (rec.badged) return;
  rec.badged = true;
  markedCards.add(owner);
  owner.setAttribute(BADGE_ATTR, window.getComputedStyle(owner).position === 'static' ? 'static' : '');
}

function unmarkCard(owner, rec) {
  if (!rec.badged) return;
  rec.badged = false;
  markedCards.delete(owner);
  owner.removeAttribute(BADGE_ATTR);
}

function applyResult(owner, rec) {
  const result = rec.result;
  if (result && result.status === 'ai' && result.expiresAt > Date.now()) markCard(owner, rec);
  else unmarkCard(owner, rec);
}

function onResult(owner, id, gen, result) {
  const rec = records.get(owner);
  if (rec && rec.pendingId === id && rec.pendingGen === gen) rec.pendingId = null;
  if (result.status === 'ai') recordAiVideo(id);
  else if (result.status === 'not_ai') removeAiVideo(id);
  if (!rec || gen !== generation || !enabled || !owner.isConnected) return;
  if (extractVideoId(owner) !== id) { scheduleSweep(owner); return; }
  rec.id = id;
  rec.result = result;
  applyResult(owner, rec);
}

function request(owner, rec, id) {
  const gen = generation;
  rec.pendingId = id;
  rec.pendingGen = gen;
  getAiLabel(id).then((result) => { onResult(owner, id, gen, result); });
}

function processCard(owner) {
  let rec = records.get(owner);
  if (!rec) { rec = newRecord(); records.set(owner, rec); }
  const id = extractVideoId(owner);
  if (id !== rec.id) {
    rec.id = id;
    rec.result = null;
    unmarkCard(owner, rec);
  }
  if (id === null) return;
  if (rec.result) {
    if (rec.result.expiresAt > Date.now()) { applyResult(owner, rec); return; }
    rec.result = null;
    unmarkCard(owner, rec);
  }
  if (rec.pendingId === id && rec.pendingGen === generation) return;
  request(owner, rec, id);
}

function observeCard(owner) {
  if (!cardObserver || observedCards.has(owner)) return;
  cardObserver.observe(owner, { attributes: true, attributeFilter: CARD_ATTRIBUTES, characterData: true, subtree: true });
  observedCards.add(owner);
}

function runSweep() {
  sweepTimer = null;
  if (!enabled) return;
  const full = fullSweepPending;
  fullSweepPending = false;
  let owners;
  if (full) { dirtyCards.clear(); owners = ownersIn(document); pruneDetached(); }
  else {
    owners = [];
    dirtyCards.forEach((owner) => { if (owner.isConnected) owners.push(owner); });
    dirtyCards.clear();
  }
  for (let i = 0; i < owners.length; i++) { observeCard(owners[i]); processCard(owners[i]); }
}

function scheduleSweep(owner, delay) {
  if (!enabled) return;
  if (owner) dirtyCards.add(owner);
  else fullSweepPending = true;
  if (sweepTimer === null) sweepTimer = setTimeout(runSweep, delay === undefined ? SWEEP_DELAY_MS : delay);
}

function touchesCards(node) {
  return node.nodeType === 1 && (isCardHost(node) || node.querySelector(CARD_SELECTOR) !== null);
}

function onRootMutations(mutations) {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    if (mutation.type !== 'childList') continue;
    for (let j = 0; j < mutation.addedNodes.length; j++) {
      if (touchesCards(mutation.addedNodes[j])) { scheduleSweep(null); return; }
    }
    for (let j = 0; j < mutation.removedNodes.length; j++) {
      if (touchesCards(mutation.removedNodes[j])) { scheduleSweep(null); return; }
    }
  }
}

function onCardMutations(mutations) {
  for (let i = 0; i < mutations.length; i++) {
    const mutation = mutations[i];
    const target = mutation.type === 'characterData' ? mutation.target.parentNode : mutation.target;
    const owner = target && ownerOf(target);
    if (owner) scheduleSweep(owner);
  }
}

function clearBadges() {
  markedCards.forEach((owner) => {
    const rec = records.get(owner);
    if (rec) unmarkCard(owner, rec);
  });
}

function pruneDetached() {
  markedCards.forEach((owner) => {
    if (owner.isConnected) return;
    const rec = records.get(owner);
    if (rec) unmarkCard(owner, rec);
    else markedCards.delete(owner);
  });
}

function teardown() {
  generation++;
  cancelAiLabelRequests();
  clearTimeout(sweepTimer);
  sweepTimer = null;
  fullSweepPending = false;
  dirtyCards.clear();
  clearBadges();
  if (rootObserver) rootObserver.disconnect();
  if (cardObserver) cardObserver.disconnect();
  observedCards = new WeakSet();
}

function refresh() {
  if (!document.body) return;
  const next = !!(configRead('markAiVideos') || (configRead('removeAiVideos') && configRead('enableAdBlock')));
  if (next === enabled) { if (enabled) scheduleSweep(null); return; }
  teardown();
  enabled = next;
  if (!enabled || typeof MutationObserver !== 'function') return;
  if (!rootObserver) rootObserver = new MutationObserver(onRootMutations);
  if (!cardObserver) cardObserver = new MutationObserver(onCardMutations);
  rootObserver.observe(document.body, { childList: true, subtree: true });
  scheduleSweep(null, 0);
}

export function initAiContentFilter() {
  if (initialized) return;
  initialized = true;
  configAddChangeListener('removeAiVideos', refresh);
  configAddChangeListener('markAiVideos', refresh);
  configAddChangeListener('enableAdBlock', refresh);
  if (document.body) refresh();
  else document.addEventListener('DOMContentLoaded', refresh);
}
