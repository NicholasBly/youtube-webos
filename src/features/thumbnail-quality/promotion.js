// Live promotion: patches tiles already on screen once verification found a
// better rung than the one they were drawn with.
import { PROMOTION_MAX_ATTEMPTS, PROMOTION_RETRY_DELAY } from './constants.js';
import { QUALITY_NAMES, buildUrl } from './ladder.js';
import { state, pendingPromotions, promotionAttempts } from './state.js';
import { navPauseLeft } from './navigation-pause.js';
import { renderedThumbnails } from './rendered.js';
import { log } from './log.js';

/** The one sweep timer: a sweep already pending keeps its time. */
export function schedulePromotionSweep(delay) {
  if (state.promoteTimer) return;
  state.promoteTimer = setTimeout(runPromotionSweep, delay);
}

// Only runs when verification disagrees with what was already emitted, which
// after the first session is rare. Batched into one sweep so N corrections cost
// one querySelectorAll, not N.
function runPromotionSweep() {
  state.promoteTimer = null;
  if (!state.enabled || pendingPromotions.size === 0) return;
  if (document.hidden) {
    pendingPromotions.clear();
    promotionAttempts.clear();
    return;
  }

  // Mid-navigation: a promotion is a style write that decodes a bigger image
  // and re-rasterises the tile while the rows are moving. Wait for the remote
  // to go quiet; nothing is lost, the pending map keeps the corrections.
  const paused = navPauseLeft();
  if (paused > 0) {
    schedulePromotionSweep(paused);
    return;
  }

  const applied = new Set();
  let patched = 0;
  renderedThumbnails((element, videoId, background) => {
    const rank = pendingPromotions.get(videoId);
    if (rank === undefined) return;

    const next = buildUrl(videoId, QUALITY_NAMES[rank]);
    // Already on the right URL counts as applied, or the correction would be
    // retried against this tile until it expired.
    applied.add(videoId);
    if (background.indexOf(next) !== -1) return;

    // Layered, not replaced: the current image stays visible underneath until
    // the new one has decoded, so a promotion never flashes an empty tile.
    element.style.backgroundImage = 'url("' + next + '"), ' + background;
    patched++;
  });

  // A correction is NOT discarded just because this sweep found no home for it:
  // the list is virtualised, so when a probe lands its tile is often not in the
  // DOM yet. Entries survive a few rounds and then expire, bounding the map. A
  // correction that was written into the app's own objects (probes.js) comes
  // in on its last round: a tile drawn later reads it from there.
  pendingPromotions.forEach((rank, videoId) => {
    const attempts = (promotionAttempts.get(videoId) || 0) + 1;
    if (attempts >= PROMOTION_MAX_ATTEMPTS || applied.has(videoId)) {
      pendingPromotions.delete(videoId);
      promotionAttempts.delete(videoId);
    } else {
      promotionAttempts.set(videoId, attempts);
    }
  });
  if (pendingPromotions.size > 0) schedulePromotionSweep(PROMOTION_RETRY_DELAY);
  if (patched) log.debug(`promotion sweep patched ${patched} tiles`);
}
