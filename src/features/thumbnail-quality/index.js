/**
 * Max Thumbnail Quality - rewrites thumbnail URLs in the parsed InnerTube
 * response, inside the JSON.parse hook adblock already owns, so the app is
 * only ever handed the high-quality URL and never fetches the 320x180 crop.
 *
 * JSON carries no failure signal the way a CSS background fallback does, and
 * maxresdefault does not exist for every video - YouTube answers a miss with a
 * small grey placeholder rather than a 404 (see PLACEHOLDER_MAX_BYTES). Hence
 * the modes in state.js and the verification queue in probes.js. This file
 * wires the switches, the cache's lifetime and the arrow-key pause.
 */
import { configAddChangeListener } from '../../core/config.js';
import { usefulRankFor } from './ladder.js';
import {
  state,
  clearStateTimer,
  qualityCache,
  probeQueue,
  probeAttempted,
  pendingEntries,
  provenFloor,
  pendingPromotions,
  promotionAttempts,
  unconfirmed,
  thumbStats
} from './state.js';
import { loadCache, flushCache, cancelSave, dropStoredCache } from './cache.js';
import { deferProbes, clearProbeTiers } from './probes.js';
import { onNavKey } from './navigation-pause.js';

export { upgradeResponseThumbnails } from './dispatch.js';

/**
 * Saves the cache when the app goes to the background; back in the foreground, holds the probes off
 * for a moment.
 */
function handleVisibilityChange() {
  if (document.hidden) {
    // webOS does not reliably fire pagehide when the app is closed from the
    // launcher, so backgrounding is the last dependable moment to persist.
    flushCache();
  } else {
    deferProbes();
  }
}

/** Stops everything in flight; `keepCache` false drops the pending save instead of writing it. */
function cleanup(keepCache = true) {
  probeQueue.clear();
  state.visibleSample = null;
  state.visibleBudget = 0;
  pendingEntries.clear();
  provenFloor.clear();
  promotionAttempts.clear();
  probeAttempted.clear();
  clearProbeTiers();
  clearStateTimer('probeTimer');
  pendingPromotions.clear();
  clearStateTimer('promoteTimer');
  if (keepCache) flushCache();
  else cancelSave();
  // In-flight probes are left to settle on their own. Switched off, their
  // answers are still cached; after a strategy change (resetVerification) the
  // generation they carry is stale and they are dropped.
}

/**
 * Forget every verified rank. The cache is only meaningful against the ladder
 * that produced it: 'sd' records sddefault as a video's answer, the other modes
 * record maxres or the floor. A cached answer is never re-probed, so crossing
 * that line would freeze every known video at the old mode's ceiling. Starting
 * over costs one re-probe per video, spread over normal use.
 */
function resetVerification() {
  state.probeGeneration++;
  cleanup(false);
  qualityCache.clear();
  unconfirmed.clear();
  dropStoredCache();
}

if (state.enabled) loadCache();
window.__ytafThumbStats = thumbStats;
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', flushCache);
// Unconditional and passive: one property read per key press. Registering it
// only while enabled would need matching teardown for no measurable gain.
document.addEventListener('keydown', onNavKey, { capture: true, passive: true });

configAddChangeListener('thumbnailQualityMode', (evt) => {
  const previousUseful = state.usefulRank;
  state.qualityMode = evt.detail.newValue;
  state.usefulRank = usefulRankFor(state.qualityMode);
  if (state.usefulRank !== previousUseful) resetVerification();
});

configAddChangeListener('upgradeThumbnails', (evt) => {
  state.enabled = !!evt.detail.newValue;
  // Turned off, the cache stays in memory (cleanup keeps it): only a first
  // start parses it from storage.
  if (!state.enabled) cleanup();
  else if (qualityCache.size === 0) loadCache();
});
