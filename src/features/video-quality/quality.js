// Quality forcing: the yt-player-quality localStorage key the app reads when it
// creates the player, and the player API for a video that is already playing.
import { showNotification } from '../../ui/toast/index.js';
import {
  KNOWN_QUALITIES,
  QUALITY_KEY,
  ONE_YEAR_MS,
  RENEW_BEFORE_MS,
  vq,
  qualitySetForVideo,
  qualityStats,
  isForceEnabled
} from './state.js';
import { log } from './log.js';
import { readRecord, writeRecord, removeRecord } from '../../core/yt-storage.js';
import { PLAYER_STATE } from '../../core/player-state.js';

/** True once the player reports any negotiated quality (see KNOWN_QUALITIES). */
function isPlayerQualityKnown() {
  if (!vq.player) return false;
  try {
    const currentQuality = vq.player.getPlaybackQuality?.();
    return KNOWN_QUALITIES.has(currentQuality);
  } catch {
    return false;
  }
}

/** The 4320/4320 pair this module writes: the app's own preference is any other. */
function isForcedPair(inner) {
  return !!inner && inner.quality === 4320 && inner.previousQuality === 4320;
}

/** The quality pair inside a stored record (its `data` is a JSON string), or null. */
function pairOf(record) {
  if (!record || typeof record.data !== 'string') return null;
  try {
    return JSON.parse(record.data);
  } catch {
    return null;
  }
}

/**
 * Stores the 4320 pair, unless ours is there with more than RENEW_BEFORE_MS
 * left. Read every time: the app stores its own pair whenever the viewer
 * picks a quality.
 */
export function setLocalStorageQuality() {
  if (!isForceEnabled()) return;

  const now = Date.now();
  if (now - vq.lastWriteTime < 2000) return;

  const record = readRecord(QUALITY_KEY);
  if (isForcedPair(pairOf(record)) && record.expiration - now > RENEW_BEFORE_MS) return;

  const written = writeRecord(QUALITY_KEY, {
    data: JSON.stringify({ quality: 4320, previousQuality: 4320 }),
    creation: now,
    expiration: now + ONE_YEAR_MS
  });
  if (!written) {
    log.warn('Failed to set localStorage quality');
    return;
  }
  vq.lastWriteTime = now;
  log.debug('Set localStorage quality to 4320p');
}

/**
 * The setting turned off: removes the 4320 preference written above, so the
 * app chooses the quality itself again. A preference of any other shape is
 * the app's own and stays.
 */
export function clearLocalStorageQuality() {
  vq.lastWriteTime = 0;
  if (isForcedPair(pairOf(readRecord(QUALITY_KEY)))) {
    removeRecord(QUALITY_KEY);
    log.debug('Removed the 4320p preference');
  }
}

/**
 * Asks the player for the highest quality, unless it already plays at it; says whether that was an
 * upgrade and to what.
 */
export function setQualityOnPlayer() {
  if (!vq.player || !isForceEnabled()) {
    return { success: false, upgraded: false };
  }

  try {
    if (!vq.player.setPlaybackQualityRange) {
      return { success: false, upgraded: false };
    }

    if (isPlayerQualityKnown()) {
      return { success: true, upgraded: false };
    }

    log.debug('Upgrading quality from:', vq.player.getPlaybackQuality?.());

    vq.player.setPlaybackQualityRange('highres', 'highres');
    vq.player.setPlaybackQuality?.('highres');
    qualityStats.apiUpgrades++;

    const afterQuality = vq.player.getPlaybackQuality?.();
    const qualityLabel = vq.player.getPlaybackQualityLabel?.();

    log.debug('Quality upgraded to:', afterQuality, qualityLabel);

    return {
      success: true,
      upgraded: true,
      newQuality: qualityLabel || afterQuality
    };
  } catch (e) {
    log.warn('Error setting quality:', e);
    return { success: false, upgraded: false };
  }
}

/**
 * Toasts the new quality half a second after an upgrade (dropped when the watch page was left
 * meanwhile).
 */
export function notifyIfUpgraded(result) {
  // Through the attach's bag: a toast due after the watch page was left is dropped.
  if (result && result.upgraded && vq.bag) {
    vq.bag.timeout(() => {
      try {
        const finalQuality =
          vq.player.getPlaybackQualityLabel?.() || result.newQuality || 'high quality';
        showNotification(`Video quality upgraded to ${finalQuality}`);
        log.debug('Notification shown:', finalQuality);
      } catch {
        showNotification('Video quality upgraded to high quality');
      }
    }, 500);
  }
}

/** Marks the video settled when the player already reports a quality; else runs `force(videoId)`. */
export function settleVideo(videoId, force) {
  if (isPlayerQualityKnown()) qualitySetForVideo.add(videoId);
  else force(videoId);
}

/** A video already playing without a quality: pause, force, resume. */
export function interceptAndUpgradeQuality(videoId) {
  if (!vq.player || !isForceEnabled()) return;
  if (vq.videoBeingProcessed === videoId) return;

  vq.videoBeingProcessed = videoId;
  qualityStats.intercepts++;
  log.debug('Intercepting playback to upgrade quality:', videoId);

  const currentState = vq.player.getPlayerState?.();
  const wasPlaying = currentState === PLAYER_STATE.PLAYING;

  try {
    if (wasPlaying) vq.player.pauseVideo?.();
  } catch {
    /* ignore */
  }

  requestAnimationFrame(() => {
    const result = setQualityOnPlayer();

    if (result.success) {
      qualitySetForVideo.add(videoId);
    }

    requestAnimationFrame(() => {
      if (wasPlaying) {
        try {
          vq.player.playVideo?.();
        } catch {
          /* ignore */
        }
      }
      notifyIfUpgraded(result);
      vq.videoBeingProcessed = null;
    });
  });
}
