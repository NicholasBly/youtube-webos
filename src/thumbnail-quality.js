import { configRead, configAddChangeListener } from './config.js';

/**
 * Max Thumbnail Quality — InnerTube response rewriter.
 *
 * Replaces the old DOM pipeline (a subtree MutationObserver over <ytlr-app>, a
 * per-tile style observer, an IntersectionObserver, a request queue and three
 * HEAD probes per *visible* tile, followed by a backgroundImage overwrite) with
 * an in-place rewrite of the parsed JSON, run inside the JSON.parse hook
 * adblock.js already owns.
 *
 * Why this is cheaper:
 *   - One image fetch per thumbnail instead of two. The old path let the app
 *     download YouTube's 320x180 crop and *then* downloaded the upgrade on top
 *     of it. The app never sees the low-quality URL now, so it is never
 *     requested — on a 15-tile shelf that is 15 fewer image fetches.
 *   - No pop-in. The upgrade is not a second background layer that lands a few
 *     hundred ms later; it is the only URL the app has ever been given.
 *   - No observers. The old module kept three alive for the whole session and
 *     did O(N) getBoundingClientRect() work on the webOS 3 polling fallback.
 *   - Off-screen tiles are upgraded too, so scrolling a shelf no longer sets
 *     off a fresh burst of probes and swaps mid-scroll.
 *
 * The one thing the DOM had that JSON does not is a failure signal: a CSS
 * background can list a fallback layer, a JSON string cannot. maxresdefault
 * does not exist for every video, and YouTube answers a miss with a small grey
 * placeholder rather than a 404 (see PLACEHOLDER_MAX_BYTES). That is handled by
 * SPECULATIVE_MODE plus the verification queue below, not by guessing.
 */

const DEBUG = false;

/**
 * What to emit for a video whose real maximum quality is not known yet.
 *
 *   'eager' — jump straight to maxresdefault. One fetch, best quality, no
 *             pop-in. Verification then only has to catch the *misses*, so the
 *             repair sweep stays rare.
 *   'safe'  — re-emit the basename YouTube sent, minus its `sqp` crop. Never
 *             produces a grey tile, but see below before choosing it.
 *
 * 'safe' looks like the conservative option and is a trap on a large surface.
 * It emits hqdefault, verification then finds maxres for nearly every video, so
 * *every* tile disagrees with what was emitted and *every* tile gets promoted:
 * a full-document sweep every PROMOTION_DEBOUNCE ms, and a second background
 * layer per tile that the browser has to go and fetch. That is two image
 * requests per thumbnail plus constant style recalc — precisely the DOM
 * behaviour this module was written to replace.
 *
 * 'eager' inverts it. Emitted and verified agree for nearly every video, so
 * nothing is promoted, nothing is re-fetched, and the sweep only fires for the
 * minority of videos that genuinely have no maxres.
 */
const SPECULATIVE_MODE = 'eager';

/** Emit WebP derivatives (~25-30% smaller) when the runtime can decode them. */
const USE_WEBP = false;

/** Patch already-rendered tiles when verification finds something better. */
const ENABLE_LIVE_PROMOTION = true;

// Verification budget. Probes are HEAD requests fired from an idle callback,
// never from the parse itself, so these bound background work only.
const MAX_CONCURRENT_PROBES = 2;
// Hard ceiling on how many *distinct* videos are ever probed in one session.
// Replaces the old queue-length cap, which dropped videos without recording
// anything — so every later parse re-queued the same ones and scrolling a shelf
// back and forth re-probed videos that had already been probed dozens of times.
const PROBE_ATTEMPT_LIMIT = 4000;
// Verification waits this long after the last response before running. A
// continuation lands on every scroll, so this doubles as a scroll detector
// without needing a scroll listener: while the user is moving, probes stay
// parked and the network is left to the app.
const PROBE_IDLE_DELAY = 1200;
const PROBE_TIMEOUT = 5000;
// A missing derivative comes back 200 OK with a tiny grey placeholder body.
const PLACEHOLDER_MAX_BYTES = 5000;

const PROMOTION_DEBOUNCE = 150;
const CACHE_KEY = 'ytaf-thumb-quality';
const CACHE_LIMIT = 1200;
const CACHE_SAVE_DEBOUNCE = 4000;
const EMITTED_LIMIT = 600;

// Bounds the fallback scan used when no schema path matched. A browse response
// is a few thousand nodes; anything past this is not a shelf we know about.
// Depth 16 is not arbitrary: a tile container sits at depth 13
// (continuationContents > sectionListContinuation > contents > [] >
// shelfRenderer > content > horizontalListRenderer > items > [] > tileRenderer
// > header > tileHeaderRenderer > thumbnail), and the playlistPanelVideoWrapper
// shape adds two more. A cap of 12 made this scan unable to rescue the exact
// shapes it exists to rescue.
const SCAN_MAX_NODES = 6000;
const SCAN_MAX_DEPTH = 16;

// --- Quality ladder -------------------------------------------------------
// Ordered worst to best; the index is the rank stored in the cache.
//   hqdefault     480x360   4:3, letterboxed — exists for every video ever
//   sddefault     640x480   4:3, letterboxed
//   hq720        1280x720   16:9 native crop
//   maxresdefault 1280x720+ 16:9, only when the source was >= 720p
const QUALITY_NAMES = ['default', 'mqdefault', 'hqdefault', 'sddefault', 'hq720', 'maxresdefault'];
const RANK = { default: 0, mqdefault: 1, hqdefault: 2, sddefault: 3, hq720: 4, maxresdefault: 5 };

/** The rung that is always present. Nothing is ever emitted below this. */
const FLOOR_RANK = RANK.hqdefault;

/**
 * A single rung, deliberately. maxresdefault and hq720 are both 1280x720 for
 * the overwhelming majority of uploads, so probing the second rung doubled
 * verification traffic to distinguish two files of identical size. A miss now
 * falls straight to the guaranteed floor.
 */
const PROBE_LADDER = [RANK.maxresdefault];

// Anchored so it cannot match mid-string, and `\w+` on the basename so
// A/B-test variants (hqdefault_custom_2) are captured and then rejected by the
// RANK lookup rather than being rewritten to a name that has no custom-variant
// equivalent.
const THUMB_URL_RE = /^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\/(\w+)\.(?:jpg|jpeg|webp|png)/;
const THUMB_IN_CSS_RE = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\//;

const DOM_SELECTOR = 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image';

// --- Runtime capability ---------------------------------------------------
// Synchronous, unlike the old Image-decode probe: the first browse response can
// arrive before an async detection settles, and a mid-session flip would emit
// two URL families for the same video and halve the HTTP cache hit rate.
const webpSupported = (() => {
  if (!USE_WEBP) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
})();

// --- State ----------------------------------------------------------------
let enabled = !!configRead('upgradeThumbnails');

/** videoId -> verified rank. Survives navigation and restarts. */
const qualityCache = new Map();
/** videoId -> rank last written into a response, for promotion comparisons. */
const emittedRank = new Map();
/** Insertion-ordered probe backlog: videoId -> true. */
const probeQueue = new Map();
const inFlight = new Set();
/** Every videoId ever enqueued this session. Nothing is probed twice. */
const probeAttempted = new Set();
const pendingPromotions = new Map();

let activeProbes = 0;
let saveTimer = null;
let promoteTimer = null;
let probePump = null;
let probeTimer = null;
let lastParseAt = 0;

const idle =
  typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 500 })
    : (cb) => setTimeout(cb, 32);

function debugLog(...args) {
  if (DEBUG) console.info('[ThumbQuality]', ...args);
}

function capSet(map, key, value, limit) {
  if (map.size >= limit) map.delete(map.keys().next().value);
  map.set(key, value);
}

// --- Persistent cache -----------------------------------------------------
// Compact "id:rank,id:rank" rather than JSON: it parses with one split on
// startup and avoids the hooked JSON.stringify entirely.

function loadCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parts = raw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      const sep = entry.lastIndexOf(':');
      if (sep < 1) continue;
      const rank = +entry.slice(sep + 1);
      if (rank >= 0 && rank < QUALITY_NAMES.length) qualityCache.set(entry.slice(0, sep), rank);
    }
    debugLog(`loaded ${qualityCache.size} cached qualities`);
  } catch {
    // Private mode / quota / storage disabled — the cache is an optimisation.
  }
}

function saveCache() {
  saveTimer = null;
  try {
    const out = [];
    // Map iteration is insertion-ordered, so dropping from the front evicts the
    // oldest entries.
    let skip = qualityCache.size - CACHE_LIMIT;
    qualityCache.forEach((rank, id) => {
      if (skip-- > 0) return;
      out.push(id + ':' + rank);
    });
    window.localStorage.setItem(CACHE_KEY, out.join(','));
  } catch {
    // Ignore.
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveCache, CACHE_SAVE_DEBOUNCE);
}

// --- URL rewriting --------------------------------------------------------

function buildUrl(videoId, name) {
  return webpSupported
    ? 'https://i.ytimg.com/vi_webp/' + videoId + '/' + name + '.webp'
    : 'https://i.ytimg.com/vi/' + videoId + '/' + name + '.jpg';
}

/**
 * Resolve one thumbnail URL to its upgraded form, or null to leave it alone.
 *
 * Width/height on the surrounding entry are deliberately left untouched. The
 * app uses them to choose between rungs and to size the tile; rewriting them to
 * the new file's real dimensions would hand a 4:3 aspect ratio to a 16:9 tile
 * and change the app's own selection. The image simply arrives sharper than
 * advertised, which is exactly what the old backgroundImage swap did.
 */
function upgradeUrl(url) {
  // Cheap rejection first: almost every string in a response is not a URL.
  if (typeof url !== 'string' || url.charCodeAt(0) !== 104 /* h */) return null;
  if (url.indexOf('i.ytimg.com/vi') === -1) return null;

  const match = THUMB_URL_RE.exec(url);
  if (!match) return null;

  const videoId = match[1];
  const currentRank = RANK[match[2]];
  // Unknown basename: an A/B custom variant, a storyboard, something new. There
  // is no safe mapping to a different name, so leave it exactly as sent.
  if (currentRank === undefined) return null;

  let target = qualityCache.get(videoId);
  if (target === undefined) {
    target = SPECULATIVE_MODE === 'eager' ? RANK.maxresdefault : FLOOR_RANK;
    scheduleProbe(videoId);
  }
  // Never hand back something worse than YouTube offered. Matters on the watch
  // page, where tiles already arrive as hq720 (rank 4) and the safe floor
  // (rank 2) would be a downgrade.
  if (target < currentRank) target = currentRank;

  // Recorded before the no-op check below, not after: a URL that already sits at
  // the target rung is still a rung the app is about to render, and verification
  // has to be able to compare against it. Skipping this was why an already-plain
  // hqdefault (the watch-page replay background) could never be promoted.
  const previous = emittedRank.get(videoId);
  if (previous === undefined || target > previous) capSet(emittedRank, videoId, target, EMITTED_LIMIT);

  const next = buildUrl(videoId, QUALITY_NAMES[target]);
  // Covers every no-op case in one comparison: same rung, already unsuffixed,
  // already the right file family. A URL that still carries ?sqp= differs here
  // even at an equal rank, which is the point — dropping the crop is itself the
  // upgrade in 'safe' mode.
  if (next === url) return null;
  return next;
}

/**
 * Rewrite every URL in a thumbnail container in place. Handles both
 * `{ thumbnails: [...] }` (tileRenderer and friends) and `{ sources: [...] }`
 * (the newer *ViewModel schema).
 */
function upgradeContainer(container) {
  if (!container) return 0;
  const list = container.thumbnails || container.sources;
  if (!Array.isArray(list)) return 0;

  let changed = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;
    const next = upgradeUrl(entry.url);
    if (next) {
      entry.url = next;
      changed++;
    }
  }
  return changed;
}

// --- Item-level paths -----------------------------------------------------
// Everything below is O(1) per item: no recursion, no searching. These are the
// shapes seen in real home / continuation / watch responses, plus the legacy
// renderers kept as cheap insurance.

function upgradeItem(item) {
  if (!item || typeof item !== 'object') return 0;
  let changed = 0;

  // A watch-page playlist row wraps the tile one level deeper.
  const tile = item.tileRenderer || item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.tileRenderer;

  if (tile) {
    const header = tile.header?.tileHeaderRenderer;
    changed += upgradeContainer(header?.thumbnail);
    changed += upgradeContainer(header?.thumbnailViewModel?.image);
    // The long-press menu carries its own copy of the same URL. Rewriting it
    // too keeps both pointing at one file, so opening the menu is an HTTP cache
    // hit instead of a fresh download of the original 320x180.
    changed += upgradeContainer(tile.onLongPressCommand?.showMenuCommand?.thumbnail);
    return changed;
  }

  changed += upgradeContainer(item.previewButtonRenderer?.thumbnail);
  changed += upgradeContainer(item.pivotVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.lockupViewModel?.contentImage?.thumbnailViewModel?.image);
  // Legacy renderers — not produced by current tvhtml5 builds, but free.
  changed += upgradeContainer(item.gridVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.compactVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.videoRenderer?.thumbnail);
  return changed;
}

function upgradeItems(items) {
  if (!Array.isArray(items)) return 0;
  let changed = 0;
  for (let i = 0; i < items.length; i++) changed += upgradeItem(items[i]);
  return changed;
}

function upgradeSectionList(contents) {
  if (!Array.isArray(contents)) return 0;
  let changed = 0;

  for (let i = 0; i < contents.length; i++) {
    const section = contents[i];
    if (!section) continue;

    const shelf = section.shelfRenderer;
    if (shelf) {
      const content = shelf.content;
      if (content) {
        changed += upgradeItems(content.horizontalListRenderer?.items);
        changed += upgradeItems(content.gridRenderer?.items);
        changed += upgradeItems(content.expandedShelfContentsRenderer?.items);
      }
      continue;
    }

    if (section.gridRenderer) {
      changed += upgradeItems(section.gridRenderer.items);
      continue;
    }
    if (section.horizontalListRenderer) {
      changed += upgradeItems(section.horizontalListRenderer.items);
      continue;
    }
    // Search interleaves bare items among the shelves.
    changed += upgradeItem(section);
  }
  return changed;
}

function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

// --- Response-type dispatch ----------------------------------------------
// Paths mirror SCHEMA_REGISTRY in adblock.js so both engines agree on where a
// given response keeps its content.

const P = {
  HOME: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer', 'content', 'sectionListRenderer', 'contents'],
  TABS: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer', 'sections'],
  SEARCH: ['contents', 'sectionListRenderer', 'contents'],
  CONT_SECTION: ['continuationContents', 'sectionListContinuation', 'contents'],
  CONT_TVSURFACE: ['continuationContents', 'tvSurfaceContentContinuation', 'content', 'sectionListRenderer', 'contents'],
  CONT_GRID: ['continuationContents', 'gridContinuation', 'items'],
  CONT_HORIZ: ['continuationContents', 'horizontalListContinuation', 'items'],
  PIVOT: ['contents', 'singleColumnWatchNextResults', 'pivot', 'sectionListRenderer', 'contents'],
  AUTOPLAY: ['contents', 'singleColumnWatchNextResults', 'autoplay', 'autoplay'],
  REPLAY_BG: ['playerOverlays', 'playerOverlayRenderer', 'replay', 'playerOverlayReplayRenderer', 'background'],
  CURRENT_THUMB: ['currentVideoThumbnail'],
  MICROFORMAT: ['microformat', 'playerMicroformatRenderer', 'thumbnail'],
  VIDEO_DETAILS: ['videoDetails', 'thumbnail']
};

function upgradeAutoplaySets(sets) {
  if (!Array.isArray(sets)) return 0;
  let changed = 0;
  for (let i = 0; i < sets.length; i++) {
    const item =
      sets[i]?.nextVideoRenderer?.autoplayVideoWrapperRenderer?.primaryEndpointRenderer?.autoplayEndpointRenderer?.item;
    if (item) changed += upgradeItem(item);
  }
  return changed;
}

function upgradeAutoplay(autoplay) {
  if (!autoplay) return 0;
  let changed = 0;
  changed += upgradeAutoplaySets(autoplay.sets);
  changed += upgradeAutoplaySets(autoplay.modifiedSets);
  changed += upgradeContainer(autoplay.replayVideoRenderer?.pivotVideoRenderer?.thumbnail);
  return changed;
}

function upgradeBrowseTabs(sections) {
  if (!Array.isArray(sections)) return 0;
  let changed = 0;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      changed += upgradeSectionList(content.sectionListRenderer?.contents);
      changed += upgradeSectionList(content.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents);
    }
  }
  return changed;
}

function upgradeActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let changed = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    changed += upgradeItems(action.reloadContinuationItemsCommand?.continuationItems);
    changed += upgradeItems(action.appendContinuationItemsAction?.continuationItems);
  }
  return changed;
}

/**
 * Continuation payloads, in all four shapes.
 *
 * Called for every response rather than only for responseType 'CONTINUATION',
 * because a continuation is not always classified as one. A shelf continuation
 * under the playing video arrives with `contents.singleColumnWatchNextResults`
 * still attached, and detectResponseType() checks NEXT before CONTINUATION — so
 * the response is typed NEXT while every thumbnail in it lives under
 * `continuationContents.sectionListContinuation`.
 */
function upgradeContinuation(data) {
  let changed = 0;
  changed += upgradeSectionList(getByPath(data, P.CONT_SECTION));
  changed += upgradeSectionList(getByPath(data, P.CONT_TVSURFACE));
  changed += upgradeItems(getByPath(data, P.CONT_GRID));
  changed += upgradeItems(getByPath(data, P.CONT_HORIZ));
  return changed;
}

/**
 * Last-resort bounded walk, used only when the schema paths produced nothing.
 * Keeps the module working through an InnerTube reshuffle instead of silently
 * doing nothing, without ever putting a full traversal on the hot path.
 */
function scanForThumbnails(root) {
  if (!root || typeof root !== 'object') return 0;
  const queue = [root, 0];
  let index = 0;
  let visited = 0;
  let changed = 0;

  while (index < queue.length) {
    if (++visited > SCAN_MAX_NODES) break;
    const node = queue[index++];
    const depth = queue[index++];
    if (!node || typeof node !== 'object' || depth > SCAN_MAX_DEPTH) continue;

    if (Array.isArray(node.thumbnails) || Array.isArray(node.sources)) changed += upgradeContainer(node);

    const nextDepth = depth + 1;
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') queue.push(value, nextDepth);
    }
  }
  if (DEBUG && changed) debugLog(`fallback scan upgraded ${changed} (visited ${visited})`);
  return changed;
}

/**
 * Entry point called from adblock.js's JSON.parse hook. `responseType` is the
 * type adblock already detected, so this costs no extra detection pass.
 */
export function upgradeResponseThumbnails(data, responseType) {
  if (!enabled || !data || typeof data !== 'object' || Array.isArray(data)) return 0;

  // Stamped on every parse, including ones that rewrite nothing: an empty
  // continuation is still evidence the surface is moving. drainProbes() reads
  // this to decide whether the app has gone quiet, so without it the whole
  // scroll gate is inert and probes drain straight into an active scroll.
  lastParseAt = Date.now();

  // Checked before the switch: any response type can carry a continuation
  // alongside its own contents, and the type it gets classified as depends on
  // whichever signature detectResponseType() happens to test first.
  let changed = data.continuationContents ? upgradeContinuation(data) : 0;

  switch (responseType) {
    case 'HOME_BROWSE':
      changed += upgradeSectionList(getByPath(data, P.HOME));
      break;
    case 'BROWSE_TABS':
      changed += upgradeBrowseTabs(getByPath(data, P.TABS));
      break;
    case 'SEARCH':
      changed += upgradeSectionList(getByPath(data, P.SEARCH));
      break;
    case 'CONTINUATION':
      // Already handled above.
      break;
    case 'SHORTS_SEQUENCE':
      changed += upgradeItems(data.entries);
      break;
    case 'ACTION':
      changed += upgradeActions(data.onResponseReceivedActions || data.onResponseReceivedEndpoints);
      break;
    case 'NEXT':
      changed += upgradeSectionList(getByPath(data, P.PIVOT));
      changed += upgradeAutoplay(getByPath(data, P.AUTOPLAY));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      changed += upgradeContainer(getByPath(data, P.CURRENT_THUMB));
      break;
    case 'PLAYER':
      changed += upgradeContainer(getByPath(data, P.VIDEO_DETAILS));
      changed += upgradeContainer(getByPath(data, P.MICROFORMAT));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      break;
    default:
      changed += scanForThumbnails(data);
      if (changed) deferProbes();
      return changed;
  }

  // A known response type that yielded nothing means the shape moved.
  if (changed === 0) changed += scanForThumbnails(data);

  if (DEBUG && changed) debugLog(`${responseType}: rewrote ${changed} thumbnail URLs`);
  if (changed) deferProbes();
  return changed;
}

/** Whether adblock.js needs to keep its JSON.parse hook installed for us. */
export function thumbnailHookRequired() {
  return enabled;
}

// --- Verification ---------------------------------------------------------

function headExists(url) {
  return new Promise((resolve) => {
    let xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, true);
    } catch {
      resolve(false);
      return;
    }
    xhr.timeout = PROBE_TIMEOUT;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(false);
      const length = parseInt(xhr.getResponseHeader('Content-Length'), 10);
      // A grey placeholder answers 200 with a tiny body; treat it as missing.
      resolve(isNaN(length) ? true : length > PLACEHOLDER_MAX_BYTES);
    };
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.onabort = () => resolve(false);
    try {
      xhr.send();
    } catch {
      resolve(false);
    }
  });
}

function scheduleProbe(videoId) {
  if (!enabled) return;
  if (qualityCache.has(videoId)) return;
  // One attempt per video per session, whatever the outcome. A video that was
  // enqueued and never reached, or probed and failed, must not come back: the
  // same tiles stream past on every scroll, and re-queueing them was what
  // turned a settled surface into a permanent trickle of requests.
  if (probeAttempted.has(videoId)) return;
  if (probeAttempted.size >= PROBE_ATTEMPT_LIMIT) return;
  probeAttempted.add(videoId);
  probeQueue.set(videoId, true);
}

/** Walk the ladder high-to-low, stopping at the first rung that exists. */
async function resolveQuality(videoId) {
  for (let i = 0; i < PROBE_LADDER.length; i++) {
    const rank = PROBE_LADDER[i];
    if (await headExists(buildUrl(videoId, QUALITY_NAMES[rank]))) return rank;
    if (!enabled) break;
  }
  return FLOOR_RANK;
}

function onProbeDone(videoId, rank) {
  inFlight.delete(videoId);
  activeProbes--;

  // A network error is cached as the floor rather than left blank. An unknown
  // video is re-scheduled by the next parse that mentions it, and on a surface
  // where the same tiles scroll past repeatedly that is an endless retry loop.
  const resolved = typeof rank === 'number' ? rank : FLOOR_RANK;
  capSet(qualityCache, videoId, resolved, CACHE_LIMIT);
  scheduleSave();

  const alreadyEmitted = emittedRank.get(videoId);
  if (ENABLE_LIVE_PROMOTION && alreadyEmitted !== undefined && resolved !== alreadyEmitted) {
    // Covers both directions: a better rung became available, or 'eager'
    // guessed maxres on a video that has none and the tile needs repairing.
    pendingPromotions.set(videoId, resolved);
    capSet(emittedRank, videoId, resolved, EMITTED_LIMIT);
    if (!promoteTimer) promoteTimer = setTimeout(runPromotionSweep, PROMOTION_DEBOUNCE);
  }

  drainProbes();
}

/**
 * Called from the parse. Pushes verification out past the current scroll:
 * every continuation restarts the clock, so probes only run once responses stop
 * arriving.
 */
function deferProbes() {
  if (!enabled || probeQueue.size === 0) return;
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY);
}

function drainProbes() {
  probeTimer = null;
  if (!enabled || probePump || probeQueue.size === 0) return;

  // Re-check on the way in as well as on the way out. A probe that finishes
  // mid-scroll calls straight back here, and without this the queue would keep
  // draining into the middle of the scroll it was supposed to stay out of.
  const quietFor = Date.now() - lastParseAt;
  if (quietFor < PROBE_IDLE_DELAY) {
    probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY - quietFor);
    return;
  }

  probePump = idle(() => {
    probePump = null;
    if (!enabled || document.hidden) return;

    while (activeProbes < MAX_CONCURRENT_PROBES && probeQueue.size > 0) {
      const videoId = probeQueue.keys().next().value;
      probeQueue.delete(videoId);
      if (qualityCache.has(videoId)) continue;

      inFlight.add(videoId);
      activeProbes++;
      resolveQuality(videoId).then(
        (rank) => onProbeDone(videoId, rank),
        () => onProbeDone(videoId, null)
      );
    }
  });
}

// --- Live promotion -------------------------------------------------------
// Only runs when verification disagrees with what was already emitted, which
// after the first session is rare. Batched into one sweep so N corrections cost
// one querySelectorAll, not N.

function runPromotionSweep() {
  promoteTimer = null;
  if (!enabled || pendingPromotions.size === 0) return;
  if (document.hidden) {
    pendingPromotions.clear();
    return;
  }

  let nodes;
  try {
    nodes = document.querySelectorAll(DOM_SELECTOR);
  } catch {
    pendingPromotions.clear();
    return;
  }

  let patched = 0;
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    const background = element.style && element.style.backgroundImage;
    if (!background) continue;

    const match = THUMB_IN_CSS_RE.exec(background);
    if (!match) continue;

    const rank = pendingPromotions.get(match[1]);
    if (rank === undefined) continue;

    const next = buildUrl(match[1], QUALITY_NAMES[rank]);
    if (background.indexOf(next) !== -1) continue;

    // Layered, not replaced: the current image stays visible underneath until
    // the new one has decoded, so a promotion never flashes an empty tile.
    element.style.backgroundImage = 'url("' + next + '"), ' + background;
    patched++;
  }

  pendingPromotions.clear();
  if (DEBUG && patched) debugLog(`promotion sweep patched ${patched} tiles`);
}

// --- Lifecycle ------------------------------------------------------------

function handleVisibilityChange() {
  if (document.hidden) {
    // webOS does not reliably fire pagehide when the app is closed from the
    // launcher, so backgrounding is the last dependable moment to persist.
    flushCache();
  } else {
    deferProbes();
  }
}

function flushCache() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveCache();
  }
}

export function cleanup() {
  probeQueue.clear();
  probeAttempted.clear();
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  pendingPromotions.clear();
  emittedRank.clear();
  if (promoteTimer) {
    clearTimeout(promoteTimer);
    promoteTimer = null;
  }
  flushCache();
  // In-flight probes are left to settle on their own; their results are still
  // worth caching, and the sweep is a no-op once disabled.
}

if (enabled) loadCache();
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', flushCache);

configAddChangeListener('upgradeThumbnails', (evt) => {
  enabled = !!evt.detail.newValue;
  if (enabled) loadCache();
  else cleanup();
});
