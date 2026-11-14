// On Shorts the player never fills the screen, so a synthetic YELLOW press
// every 30 s keeps the screensaver away while a video is actually playing.
import { SELECTORS } from '../../core/selectors.js';
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { log } from './log.js';
import { PLAYER_STATE } from '../../core/player-state.js';

let shortsKeepAliveTimer = null;
let shortsBufferTimer = null;

/**
 * Starts (or stops) the Shorts keep-alive: every 30 s while a Short plays, a yellow key press keeps
 * the TV's screensaver away.
 */
export function setShortsKeepAlive(enable) {
  if (enable) {
    if (shortsKeepAliveTimer) return;
    log.debug('Shorts detected: Starting keep-alive (Yellow Key / 30s)');
    shortsKeepAliveTimer = window.setInterval(() => {
      // Check player state to ensure we only keep awake if actually playing
      const player = document.getElementById(SELECTORS.PLAYER_ID);
      const isPlaying =
        player &&
        typeof player.getPlayerState === 'function' &&
        player.getPlayerState() === PLAYER_STATE.PLAYING;
      if (!isPlaying) return;

      // NOTE: never log the element itself here. console.log(msg, node) makes
      // the console retain a strong reference to a DOM node that may since
      // have been removed — a slow leak firing every 30s for the whole
      // Shorts session on a runtime with no way to drain the buffer.
      log.debug('keep-alive tick');

      // activeElement is document.body when nothing else has focus, null only pre-load.
      const target = document.activeElement || document.body;

      sendKey(REMOTE_KEYS.YELLOW, target);

      if (shortsBufferTimer) clearTimeout(shortsBufferTimer);
      shortsBufferTimer = window.setTimeout(() => {
        sendKey(REMOTE_KEYS.YELLOW_ALT, target);
        shortsBufferTimer = null;
      }, 250);
    }, 30000);
  } else {
    if (shortsKeepAliveTimer) {
      log.debug('Stopping Shorts keep-alive');
      clearInterval(shortsKeepAliveTimer);
      shortsKeepAliveTimer = null;
    }
    if (shortsBufferTimer) {
      clearTimeout(shortsBufferTimer);
      shortsBufferTimer = null;
    }
  }
}
