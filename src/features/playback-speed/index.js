// Playback speed (experimental, off by default; webOS 23 and newer, the
// webOS 22+ build only). webOS's media pipeline ignores video.playbackRate,
// so the engine (src/vendor/playback-speed) keeps the decoder at 1x and
// rescales the video's own timeline instead, and plays the sound through
// WebCodecs and Web Audio, time-stretched with the pitch kept. 0.25x to 2x.
//
// Picked in YouTube's own Settings > Speed menu (native-menu.js) or with the
// Playback Speed +, - and 1x shortcuts. Nothing is installed until the setting
// is on; turned off, the speed goes back to 1x at once and everything installed
// stands aside. The legacy build has playback-speed-absent.js in its place.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { SELECTORS } from '../../core/selectors.js';
import { PLAYER_STATE } from '../../core/player-state.js';
import { showNotification } from '../../ui/toast/index.js';
import { installMseHook } from '../../vendor/playback-speed/mse-hook.js';
import { setParsedObjectStep } from '../adblock/parse-hook.js';
import { createSpeedController, CAP_ABOVE } from './controller.js';
import {
  enableSpeedButton,
  enableNativeSpeedMenu,
  hookRateAssignments,
  bindPlayerRate
} from './native-menu.js';
import { log } from './log.js';

// The qualities above 1080p, which the cap brings down.
const ABOVE_1080 = ['highres', 'hd4320', 'hd2880', 'hd2160', 'hd1440'];
// How often the player element is checked for a setPlaybackRate to wrap.
const BIND_INTERVAL_MS = 1000;

/** Whether this TV can: WebCodecs' AudioDecoder (Chrome 94, webOS 23), Web Audio and MSE. */
export const playbackSpeedSupported =
  typeof window !== 'undefined' &&
  typeof window.AudioDecoder !== 'undefined' &&
  typeof window.AudioContext !== 'undefined' &&
  typeof window.MediaSource !== 'undefined';

/** Whether the setting is on. */
const isOn = () => !!configRead('enablePlaybackSpeed');

/** YouTube's player element, or null. */
const getPlayer = () =>
  document.getElementById(SELECTORS.PLAYER_ID) ||
  document.querySelector(SELECTORS.HTML5_PLAYER_FALLBACK);

let controller = null;

/**
 * Installs everything, once, the first time the setting is on: the engine's
 * MediaSource hook, YouTube's speed menu and button, and the cap of the next
 * video at 1080p above 1.25x.
 */
function install() {
  if (controller || !playbackSpeedSupported) return;
  controller = createSpeedController({
    getPlayer,
    notify: showNotification,
    isOn,
    isSupported: () => playbackSpeedSupported
  });
  installMseHook(window, {
    getSpeed: controller.getSpeed,
    createAudioSink: controller.createAudioSink,
    onRateRequest: () => {},
    onError: controller.onError,
    onNativeAudio: controller.releaseAudioSink
  });
  enableNativeSpeedMenu(isOn);
  hookRateAssignments(controller);
  setParsedObjectStep((data) => {
    if (!isOn()) return;
    try {
      enableSpeedButton(data);
    } catch (e) {
      log.warn('Speed button:', e.message);
    }
  });
  setInterval(() => bindPlayerRate(getPlayer(), controller), BIND_INTERVAL_MS);
  // The next video (autoplay, a tile) keeps the speed but starts at the
  // quality YouTube picks, 2160p on a 4K TV: capped once it plays.
  window.addEventListener('yt-player-state-change', (evt) => {
    const detail = evt.detail;
    if (!detail || detail.state !== PLAYER_STATE.PLAYING) return;
    if (!(controller.getSpeed() > CAP_ABOVE)) return;
    const player = getPlayer();
    if (player && ABOVE_1080.indexOf(player.getPlaybackQuality()) !== -1) {
      player.setPlaybackQualityRange('hd1080', 'hd1080');
    }
  });
  // Diagnostics on the TV, from the web inspector.
  window.ytafSpeed = controller;
  log.info('Installed');
}

/** One step up (+1) or down (-1) the speeds: the Playback Speed + and - shortcuts. */
export function stepSpeed(direction) {
  if (!playbackSpeedSupported) {
    showNotification('Playback speed needs webOS 23 or newer');
    return;
  }
  if (!isOn()) {
    showNotification('Turn on Playback Speed in the settings first (UI Tweaks)');
    return;
  }
  install();
  controller.step(direction);
}

/** Back to 1x: the Playback Speed 1x shortcut. */
export function resetSpeed() {
  if (controller) controller.reset();
}

configAddChangeListener('enablePlaybackSpeed', (evt) => {
  if (evt.detail.newValue) install();
  else if (controller) controller.stop();
});
if (isOn()) install();
