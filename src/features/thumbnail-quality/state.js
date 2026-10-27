// Everything the thumbnail modules share and mutate: the current mode, the
// verification caches and queues, timers and budgets. Scalars live on `state`
// so every module reads the same value; collections are exported directly.
import { configRead } from '../../core/config.js';
import { usefulRankFor } from './ladder.js';

/**
 * How far above the "known to exist" line the module is willing to reach,
 * driven by the `thumbnailQualityMode` setting: 'safe' emits only rungs
 * YouTube shipped or a probe confirmed, 'eager' goes straight to maxresdefault
 * and relies on the correction path, 'sd' is 'eager' with the ladder stopped at
 * sddefault (see usefulRank below and drawsUnproven in ladder.js). The user-facing wording and the reasoning
 * behind each mode are with thumbnailQualityModes in core/config-options.js.
 */
const qualityMode = configRead('thumbnailQualityMode');

export const state = {
  enabled: !!configRead('upgradeThumbnails'),
  qualityMode,
  // The best rung the current mode will emit or probe for; see ladder.js.
  usefulRank: usefulRankFor(qualityMode),
  activeProbes: 0,
  saveTimer: null,
  promoteTimer: null,
  probePump: null,
  probeTimer: null,
  // On performance.now(): a wall clock set back would stretch these waits.
  lastParseAt: -Infinity,
  lastNavAt: -Infinity,
  // Bumped when the verification cache is reset (mode change). A probe that was
  // in flight against the old ladder must not write its answer into the new one.
  probeGeneration: 0,
  visibleBudget: 0,
  visibleSample: null,
  visibleSampleAt: 0,
  // Item lists and thumbnail lists the known paths reached in the current
  // response. Distinct from `changed`: in the 'safe' mode a brand-new video
  // stays on hqdefault until its probe lands, and a list may hold no
  // thumbnails at all, so a response can be fully understood and still
  // rewrite nothing.
  listsSeen: 0,
  // Thumbnail lists alone (upgradeContainer), so a section of a shape the
  // walk does not know can be told from one it read (dispatch.js).
  containersSeen: 0
};

// Read on the TV from the web inspector as window.__ytafThumbStats (index.js):
// the probes answered, those whose answer fell below the mode's rung (a tile
// the modes that draw unproven rungs showed grey until the correction), and
// the ones that learned nothing (a timeout or a network error). The share of
// misses among the answers is the price of drawing sddefault unproven, about
// 1 % expected.
export const thumbStats = { answered: 0, missed: 0, unknown: 0 };

/** Clears the timer in `state[name]`, if one is set. */
export function clearStateTimer(name) {
  if (state[name]) {
    clearTimeout(state[name]);
    state[name] = null;
  }
}

/** videoId -> verified rank. Survives navigation and restarts. */
export const qualityCache = new Map();
// The cached entries a probe that learned nothing put there ('safe' only):
// the floor for this session, left out of the saved cache.
export const unconfirmed = new Set();
/** Insertion-ordered probe backlog of videoIds. */
export const probeQueue = new Set();
/**
 * Every videoId enqueued this session: one attempt each, answered or not. A
 * video the verification cache evicts is taken out (probes.js), so it may be
 * probed again when it comes back.
 */
export const probeAttempted = new Set();
export const pendingPromotions = new Map();
export const promotionAttempts = new Map();
/**
 * videoId -> the thumbnail entry objects we wrote an unverified URL into.
 *
 * These are the very objects the app holds: JSON.parse handed it the same
 * references, and a virtualised list reads `.url` off them when a tile finally
 * scrolls into view, not at parse time. Keeping them means a correction can be
 * written back into the app's own model, so a tile that has not rendered yet
 * never gets the chance to be grey. The DOM sweep only has to cover tiles that
 * were already on screen when the probe landed.
 */
export const pendingEntries = new Map();
/** videoId -> highest rank already known good, so corrections cannot regress. */
export const provenFloor = new Map();
