// Verification: the queue of videos whose best rung is unproven, its budgets
// and gates (it yields to scrolling, key navigation and whatever is on screen),
// and what happens when a probe lands.
import {
  MAX_CONCURRENT_PROBES,
  PROBE_ATTEMPT_LIMIT,
  PROBE_IDLE_DELAY,
  PROBE_URGENT_BURST,
  PROBE_VISIBLE_BURST,
  RENDERED_SAMPLE_MIN_QUEUE,
  PROMOTION_DEBOUNCE,
  PROMOTION_MAX_ATTEMPTS,
  CACHE_LIMIT
} from './constants.js';
import { QUALITY_NAMES, FLOOR_RANK, buildUrl, drawsUnproven } from './ladder.js';
import {
  state,
  qualityCache,
  probeQueue,
  probeAttempted,
  pendingPromotions,
  promotionAttempts,
  pendingEntries,
  provenFloor,
  unconfirmed,
  thumbStats,
  clearStateTimer
} from './state.js';
import { capSet, scheduleSave } from './cache.js';
import { navPauseLeft } from './navigation-pause.js';
import { resolveQuality } from './probe-transport.js';
import { sampleRenderedIds } from './rendered.js';
import { schedulePromotionSweep } from './promotion.js';

const idle =
  typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 500 })
    : (cb) => setTimeout(cb, 32);

// The videos the current parse queued; deferProbes() makes them the latest
// parse and empties it.
const queuedByParse = [];
// The videos the latest parse queued: the only ones the urgent budget (the
// probes allowed past the idle gate, PROBE_URGENT_BURST per parse) is spent
// on, so a parse never pays for the backlog of the ones before it.
const latestParse = new Set();
let urgentLeft = 0;

/** Forgets the latest parse and its budget; part of the module's cleanup. */
export function clearProbeTiers() {
  queuedByParse.length = 0;
  latestParse.clear();
  urgentLeft = 0;
}

/**
 * Queues a probe of `videoId`'s thumbnail sizes, unless its answer is cached, it was tried this
 * session, or the session's probe limit is reached.
 */
export function scheduleProbe(videoId) {
  if (!state.enabled) return;
  if (qualityCache.has(videoId)) return;
  // One attempt per video per session, whatever the outcome. A video that was
  // enqueued and never reached, or probed and failed, must not come back: the
  // same tiles stream past on every scroll, and re-queueing them was what
  // turned a settled surface into a permanent trickle of requests.
  if (probeAttempted.has(videoId)) return;
  if (probeAttempted.size >= PROBE_ATTEMPT_LIMIT) return;
  probeAttempted.add(videoId);
  probeQueue.add(videoId);
  queuedByParse.push(videoId);
}

/**
 * Rewrites the entries we gambled on now that the answer is known; true when
 * there were entries to write to. An entry already drawn at that rung stays
 * as it is: its URL may be a signed or vi_webp form of the same file, and the
 * /vi/ JPEG a new download.
 */
function applyCorrection(videoId, rank) {
  const entries = pendingEntries.get(videoId);
  if (!entries) return false;
  pendingEntries.delete(videoId);
  const url = buildUrl(videoId, QUALITY_NAMES[rank]);
  // Each entry is followed by the rung it is drawn at (rewrite.js).
  for (let i = 0; i < entries.length; i += 2) {
    if (entries[i + 1] !== rank && entries[i].url !== url) entries[i].url = url;
  }
  return true;
}

/** Resolved rank clamped to what the video was already known to support. */
function settledRank(videoId, resolved) {
  const floor = provenFloor.get(videoId);
  provenFloor.delete(videoId);
  return floor !== undefined && floor > resolved ? floor : resolved;
}

/**
 * A probe's answer: counts it, drops it when the strategy changed meanwhile, saves a real answer to
 * the cache, corrects the tiles on screen, and starts the next probe.
 */
function onProbeDone(videoId, rank, generation) {
  // The visible-tile sample stays valid: a correction changes a tile's URL,
  // not which videoIds are on screen, and the sample is keyed on videoId.
  state.activeProbes--;

  // Answered against a ladder that no longer applies (mode changed mid-flight).
  // Dropping it is cheaper than reasoning about which cap it was measured for;
  // the video is simply re-probed the next time a parse mentions it.
  if (generation !== state.probeGeneration) {
    drainProbes();
    return;
  }

  // Nothing learned (null: a timeout or a network error): nothing is saved,
  // so the next session asks again. The modes that draw unproven rungs keep
  // what they drew; 'safe' holds the floor for this session, which probes a
  // video once (probeAttempted). A miss is an answer, and saved.
  const unknown = rank === null;
  if (unknown) {
    thumbStats.unknown++;
    if (drawsUnproven(state.qualityMode)) {
      pendingEntries.delete(videoId);
      provenFloor.delete(videoId);
      drainProbes();
      return;
    }
  } else {
    thumbStats.answered++;
    if (rank < state.usefulRank) thumbStats.missed++;
  }
  const resolved = unknown ? FLOOR_RANK : rank;
  // A video the cache no longer remembers may be probed again when it comes
  // back; the one-attempt rule is for videos that were never answered.
  const evicted = capSet(qualityCache, videoId, resolved, CACHE_LIMIT);
  if (evicted) {
    probeAttempted.delete(evicted);
    unconfirmed.delete(evicted);
  }
  if (unknown) unconfirmed.add(videoId);
  else scheduleSave();

  // Switched off while the probe was in flight: the answer is kept for the
  // cache, nothing is corrected or promoted.
  if (!state.enabled) return;

  // 1. Write the truth back into the response objects the app still holds. A
  //    tile that has not scrolled into view yet reads `.url` at render time, so
  //    this corrects it before it is ever drawn - no grey frame at all.
  const drawnRank = provenFloor.get(videoId);
  const settled = settledRank(videoId, resolved);
  const corrected = applyCorrection(videoId, settled);

  // 2. Queue a DOM sweep for tiles that were already on screen. In the mode
  //    that waits for proof the tiles were drawn at `drawnRank`, so a probe that
  //    settles there has nothing to patch; the modes that draw unproven rungs
  //    may need a downgrade.
  if (drawsUnproven(state.qualityMode) || drawnRank === undefined || settled !== drawnRank) {
    pendingPromotions.set(videoId, settled);
    // With the app's own objects corrected, a tile not on screen yet reads the
    // right URL when it renders: one sweep, for the tiles already drawn, is
    // all the DOM work this correction needs.
    if (corrected) promotionAttempts.set(videoId, PROMOTION_MAX_ATTEMPTS - 1);
    schedulePromotionSweep(PROMOTION_DEBOUNCE);
  }

  drainProbes();
}

/**
 * Called from the parse. The first videos this parse queued are the top of
 * the response - what the user is looking at - so a small burst of them goes
 * through immediately; everything else waits for the surface to settle.
 */
export function deferProbes() {
  if (!state.enabled || probeQueue.size === 0) {
    queuedByParse.length = 0;
    return;
  }
  // A parse that queued nothing (a small response among the ones the surface
  // keeps fetching) leaves the latest parse and its budget as they are: its
  // head is still the freshest content on screen.
  if (queuedByParse.length > 0) {
    latestParse.clear();
    for (let i = 0; i < queuedByParse.length; i++) latestParse.add(queuedByParse[i]);
    queuedByParse.length = 0;
    urgentLeft = PROBE_URGENT_BURST;
  }
  state.visibleBudget = PROBE_VISIBLE_BURST;
  drainProbes();
  // drainProbes() cleared any earlier timer; the only one it can leave behind is
  // the short navigation-pause retry, which must win over the idle delay.
  if (!state.probeTimer) state.probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY);
}

/** Appends to `picked`, up to `limit`, the ids of `set` that are queued (or all of them when `inQueue` is false). */
function takeFrom(set, picked, limit, inQueue) {
  const iterator = set.values();
  let step = iterator.next();
  while (!step.done && picked.length < limit) {
    const id = step.value;
    if ((!inQueue || probeQueue.has(id)) && picked.indexOf(id) === -1) picked.push(id);
    step = iterator.next();
  }
}

/**
 * Up to `limit` queued ids: the on-screen ones first, then the latest
 * parse's in the order it queued them, then the head of the queue. Each tier
 * is read from its own small set against the queue, so a drain costs the size
 * of those sets plus `limit`, not a pass over the whole queue (up to
 * PROBE_ATTEMPT_LIMIT ids, drained three at a time).
 */
function pickProbeIds(rendered, limit) {
  const picked = [];
  if (limit <= 0) return picked;
  if (rendered) takeFrom(rendered, picked, limit, true);
  // Every id of the latest parse is queued: startProbe takes one out of both.
  if (picked.length < limit) takeFrom(latestParse, picked, limit, false);
  if (picked.length < limit) takeFrom(probeQueue, picked, limit, false);
  return picked;
}

/** Whether a picked video may go now, spending the budget of its tier. */
function admitToTier(videoId, onScreen) {
  // The tiers, which is the debounce split expressed through the gate that is
  // already here: on-screen work goes now, the latest parse's head next,
  // everything else waits for the surface to settle so it never competes with
  // an active scroll. An on-screen tile past the visible budget falls through
  // to the tiers below rather than holding the queue.
  if (onScreen && state.visibleBudget > 0) {
    state.visibleBudget--;
    return true;
  }
  if (urgentLeft > 0 && latestParse.has(videoId)) {
    urgentLeft--;
    return true;
  }
  return performance.now() - state.lastParseAt >= PROBE_IDLE_DELAY;
}

/** Starts the probe of one video, unless the cache has the answer already. */
function startProbe(videoId, onScreen, generation) {
  probeQueue.delete(videoId);
  latestParse.delete(videoId);
  // Never cached: it was queued only uncached, and only its own probe caches it.
  state.activeProbes++;
  resolveQuality(videoId, onScreen).then(
    (rank) => onProbeDone(videoId, rank, generation),
    () => onProbeDone(videoId, FLOOR_RANK, generation)
  );
}

/** One round of the queue, from the idle callback: as many probes as the slots and tiers allow. */
function runProbeRound() {
  state.probePump = null;
  if (!state.enabled || document.hidden) return;

  // The idle callback can land after a key press that arrived in between.
  const pausedNow = navPauseLeft();
  if (pausedNow > 0) {
    // Replace the idle timer, not defer to it: the urgent tier is meant to
    // resume as soon as the remote is quiet, not when the surface settles.
    if (state.probeTimer) clearTimeout(state.probeTimer);
    state.probeTimer = setTimeout(drainProbes, pausedNow);
    return;
  }
  // Every slot taken: the probe that lands next drains again, so there is
  // nothing to pick and nothing to sample the screen for.
  const limit = MAX_CONCURRENT_PROBES - state.activeProbes;
  if (limit <= 0) return;

  // Document order is a decent proxy for visibility at first paint and a poor
  // one afterwards: scroll far enough and the tiles on screen sit behind a
  // few hundred earlier entries, which at three concurrent probes is minutes
  // of waiting for a correction the user is looking at right now.
  const rendered = probeQueue.size >= RENDERED_SAMPLE_MIN_QUEUE ? sampleRenderedIds() : null;
  const generation = state.probeGeneration;
  const ids = pickProbeIds(rendered, limit);
  let heldByIdle = false;
  for (let i = 0; i < ids.length; i++) {
    const onScreen = rendered ? rendered.has(ids[i]) : false;
    // One the tiers refuse (an on-screen tile past the visible budget, say)
    // waits; the ones after it may still be in a tier, the latest parse's.
    if (!admitToTier(ids[i], onScreen)) {
      heldByIdle = true;
      continue;
    }
    startProbe(ids[i], onScreen, generation);
  }

  // Whatever the gate held back gets picked up once the surface goes quiet:
  // for the idle gate that is the rest of its delay, not a whole new one.
  if (probeQueue.size > 0 && !state.probeTimer) {
    const delay = heldByIdle
      ? Math.max(50, PROBE_IDLE_DELAY - (performance.now() - state.lastParseAt))
      : PROBE_IDLE_DELAY;
    state.probeTimer = setTimeout(drainProbes, delay);
  }
}

/** Starts the probe pump in idle time, or waits while the remote is moving through rows. */
function drainProbes() {
  clearStateTimer('probeTimer');
  if (!state.enabled || probeQueue.size === 0) return;

  // Mid-navigation: not even the on-screen tier. A probe for a visible tile is
  // an <img> load that competes with the row animation for decode time, and
  // its result queues a promotion on top. Come back once the remote is quiet.
  const paused = navPauseLeft();
  if (paused > 0) {
    state.probeTimer = setTimeout(drainProbes, paused);
    return;
  }
  if (!state.probePump) state.probePump = idle(runProbeRound);
}
