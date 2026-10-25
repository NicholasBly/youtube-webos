// Player state transitions: publishes `yt-player-state-change` for the other
// features and drives quality forcing from it.
import { vq, qualitySetForVideo } from './state.js';
import {
  settleVideo,
  setLocalStorageQuality,
  setQualityOnPlayer,
  notifyIfUpgraded,
  interceptAndUpgradeQuality
} from './quality.js';
import { ensurePlaybackStarts } from './kickstart.js';
import { log } from './log.js';
import { PLAYER_STATE } from '../../core/player-state.js';

/**
 * The player's state change: published as yt-player-state-change for the clock and SponsorBlock,
 * then, with Force Max Quality on, the quality is forced for a new video.
 */
export function handleStateChange(state) {
  if (!vq.player) return;

  const actualState = state && state.data !== undefined ? state.data : state;

  // Published first, whatever the quality setting: the clock (features/watch)
  // and SponsorBlock (sponsorblock/video-events.js) follow the player state
  // through it.
  window.dispatchEvent(
    new CustomEvent('yt-player-state-change', { detail: { state: actualState } })
  );

  // Everything below is quality forcing only.
  if (!vq.shouldForce) return;

  try {
    const videoData = vq.player.getVideoData?.();
    const videoId = videoData?.video_id;

    if (!videoId) return;

    const isNewVideo = videoId !== vq.lastVideoId;

    if (isNewVideo) {
      vq.lastVideoId = videoId;
      log.debug('New video:', videoId);

      if (actualState === PLAYER_STATE.UNSTARTED) {
        setLocalStorageQuality();
      }
    }

    if (qualitySetForVideo.has(videoId)) {
      if (actualState === PLAYER_STATE.PLAYING) ensurePlaybackStarts();
      return;
    }

    switch (actualState) {
      // Either is the first state of a new video: with its levels known the
      // quality is set now; without them the PLAYING state below intercepts
      // it. At the top already, setQualityOnPlayer() reports no upgrade and
      // notifyIfUpgraded() says nothing.
      case PLAYER_STATE.UNSTARTED:
      case PLAYER_STATE.BUFFERING:
        if (isNewVideo && vq.player.getAvailableQualityLevels?.()?.length > 0) {
          settleVideo(videoId, () => notifyIfUpgraded(setQualityOnPlayer()));
          qualitySetForVideo.add(videoId);
        }
        break;

      case PLAYER_STATE.PLAYING:
        settleVideo(videoId, interceptAndUpgradeQuality);
        break;
      default:
        // Ended, paused and cued need no quality work.
        break;
    }

    ensurePlaybackStarts();
  } catch (e) {
    log.warn('Error in state change handler:', e);
  }
}
