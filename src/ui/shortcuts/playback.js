// Playback: play/pause with the controls bar kept out of the way, and the
// subtitles toggle through the player API with a UI fallback.
import { showNotification } from '../toast/index.js';
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { isShortsPage } from '../../core/page-state.js';
import { shortcutState } from './bindings.js';
import { isEngagementPanelVisible, triggerInternal, announcePressed } from './helpers.js';
import { SELECTORS } from '../../core/selectors.js';
import { hideControlsFor } from '../hide-controls.js';
import { log } from './log.js';

/**
 * Turns the captions on (the first track) or off through the player's API, or by pressing the
 * captions button when the API has no answer; a toast says the result.
 */
export function toggleSubtitles(player) {
  let toggledViaApi = false;
  if (player) {
    if (typeof player.loadModule === 'function') player.loadModule('captions');
    if (typeof player.getOption === 'function' && typeof player.setOption === 'function') {
      try {
        const currentTrack = player.getOption('captions', 'track');
        const isEnabled = currentTrack && (currentTrack.languageCode || currentTrack.vssId);
        if (isEnabled) {
          player.setOption('captions', 'track', {});
          showNotification('Subtitles: OFF');
          toggledViaApi = true;
        } else {
          const trackList = player.getOption('captions', 'tracklist');
          const videoData = player.getVideoData ? player.getVideoData() : null;
          const targetTrack =
            (trackList && trackList[0]) ||
            (videoData && videoData.captionTracks && videoData.captionTracks[0]);
          if (targetTrack) {
            player.setOption('captions', 'track', targetTrack);
            showNotification(
              `Subtitles: ON (${targetTrack.languageName || targetTrack.name || targetTrack.languageCode})`
            );
            toggledViaApi = true;
          }
        }
      } catch (e) {
        log.warn('Subtitle API Error:', e);
      }
    }
  }
  // The player API had no answer: the captions button instead.
  if (!toggledViaApi) {
    const capsBtn =
      document.querySelector(SELECTORS.CAPTIONS_BUTTON) ||
      document.querySelector(SELECTORS.CAPTIONS_BUTTON_LEGACY);
    if (capsBtn) {
      if (triggerInternal(capsBtn, 'Captions')) {
        announcePressed(capsBtn, 'Subtitles');
        return;
      }
    }
    showNotification('Subtitles unavailable');
  }
}

/** The play/pause toast, one at a time: a live one takes the new text. */
function notifyPlayPause(msg) {
  showNotification(msg, 3000, 'play-pause');
}

/** Whether YouTube's controls bar holds the focus. */
function controlsFocused() {
  const controls = document.querySelector(SELECTORS.CONTROLS);
  return !!controls && controls.classList.contains(SELECTORS.FOCUS_CLASS);
}

/**
 * A pause brings the controls bar up. Unless it was up already, it is kept
 * hidden for 750 ms with the shadows and the clock (ui/hide-controls.js) and,
 * on the watch page with no side panel open, dismissed with a Back once it
 * has taken the focus.
 */
function hideControlsAfterPause() {
  if (controlsFocused()) return;
  hideControlsFor(750);
  if (isShortsPage() || isEngagementPanelVisible()) return;
  shortcutState.debounceMs = 650;
  if (document.activeElement) document.activeElement.blur();
  setTimeout(() => {
    if (controlsFocused()) sendKey(REMOTE_KEYS.BACK, document.activeElement);
  }, 250);
}

/** Plays or pauses `video`, with a toast; after a pause the player controls are hidden again. */
export function playPause(video) {
  if (video.paused) {
    video.play();
    notifyPlayPause('Playing');
    return;
  }
  video.pause();
  notifyPlayPause('Paused');
  hideControlsAfterPause();
}
