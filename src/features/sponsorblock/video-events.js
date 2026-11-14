// The listeners a handler binds: the player state event the quality module
// publishes and resize, once per handler; and the <video> events that reset
// or re-arm segment tracking, once per <video> element.
import { PLAYER_STATE } from '../../core/player-state.js';
import { acquireProgressBar, redrawOverlay } from './bar.js';
import { resyncOverlay, forgetAnchor } from './overlay.js';
import { clampSegments } from './segments.js';
import {
  clearSkipWatchdog,
  stopHighFreqLoop,
  detachTimeListener,
  resetSegmentTracking,
  refreshSkipSegments,
  handleTimeUpdate
} from './skipping.js';
import { executeChainSkip } from './chain.js';

/** Called once, when the segments arrive; undone by the handler's bag. */
export function bindWindowEvents(sb) {
  sb.bag.listen(window, 'yt-player-state-change', (e) => {
    const state = e.detail.state;
    if (state === PLAYER_STATE.ENDED) {
      detachTimeListener(sb);
      // The end screen is about to tear down the player chrome. Drop the
      // cached drawing context so a replay rebuilds from scratch: every input
      // to the overlay hash is identical on replay, so a stale hash would
      // suppress the redraw.
      sb.lastOverlayHash = null;
      forgetAnchor(sb);
      sb.lastSyncSig = null;
    } else if (state === PLAYER_STATE.PLAYING) {
      // A <video> that mounted after the wait for it gave up is bound now.
      if (!sb.video) sb.bindOrWaitForVideo();
      // The chrome may have been rebuilt (a side panel, say): re-find the bar.
      acquireProgressBar(sb);
      // Both the state event and the DOM playing event re-arm the segment
      // tracking: a player that reports only one of them must still skip.
      resetSegmentTracking(sb);
      executeChainSkip(sb, sb.video);
    } else if (state === PLAYER_STATE.PAUSED) {
      stopHighFreqLoop(sb);
      detachTimeListener(sb);
    }
  });

  // Resize forces an immediate overlay re-sync (bypassing the timeupdate throttle).
  sb.bag.listen(window, 'resize', () => resyncOverlay(sb));
}

/** Called from bindVideo(); undone by the per-video bag. */
export function bindVideoEvents(sb) {
  const video = sb.video;

  /** A listener on the bound <video> that goes with the per-video bag. */
  const listen = (type, handler) => sb.videoBag.listen(video, type, handler);

  // destroy() disposes this bag first: no listener here runs on a destroyed handler.
  listen('seeked', () => {
    clearSkipWatchdog(sb);
    stopHighFreqLoop(sb);
    // A skip of ours landed: it aimed past its landing point already.
    if (sb.isSkipping) {
      sb.isSkipping = false;
      return;
    }
    // The viewer's seek: tracking starts over from where it landed, and a
    // landing at the very start takes the chain there.
    sb.lastSkipTime = -1;
    sb.lastSkippedSegmentIndex = -1;
    resetSegmentTracking(sb);
    executeChainSkip(sb, video);
    if (!video.paused) handleTimeUpdate(sb);
  });

  listen('durationchange', () => {
    if (!video.duration) return;
    if (clampSegments(sb, video.duration)) refreshSkipSegments(sb);
    redrawOverlay(sb);
    sb.updateLabels();
  });

  listen('playing', () => {
    resetSegmentTracking(sb);
  });

  listen('pause', () => {
    stopHighFreqLoop(sb);
    detachTimeListener(sb);
  });
}
