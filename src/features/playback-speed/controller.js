// The playback speed: what it is, changing it, and the audio engine that plays
// the sound at it. A change reloads the video (loadVideoById at the current
// position): the engine decides a MediaSource's speed once, when YouTube
// creates its buffers (vendor/playback-speed/mse-hook.js). Rapid changes
// within RELOAD_DELAY_MS are one reload.
import { AudioEngine } from '../../vendor/playback-speed/audio-engine.js';
import { isSupportedSpeed, SUPPORTED_SPEEDS } from '../../vendor/playback-speed/mse-hook.js';
import { configRead } from '../../core/config.js';
import { setQualityCappedBySpeed } from '../../core/speed-cap.js';
import { PLAYER_STATE } from '../../core/player-state.js';
import { log } from './log.js';

// How long a burst of changes settles before the one reload.
const RELOAD_DELAY_MS = 800;
// Above this speed the video plays at 1080p at most: a TV cannot decode 2160p
// fast enough (at 1.5x it dropped 85% of the frames and reached 1.43x).
export const CAP_ABOVE = 1.25;
// After a reload, how often and how long to wait for the video to play again.
const RESTORE_POLL_MS = 250;
const RESTORE_TRIES = 40;
// When the menu's own value is brought in line after a reload.
const MENU_SYNC_MS = 2500;

/**
 * On webOS 25 loadVideoById(id, at) starts up to ~25 s before `at`, even at
 * 1x: once the reloaded video plays it is sent back to `at`. When `capped()`
 * the 1080p cap is set again then too: the reload drops it, and YouTube then
 * falls to 480p on a 60 fps video (the frames a 60 Hz screen cannot show
 * count as dropped).
 */
function restorePosition(player, at, capped) {
  let tries = RESTORE_TRIES;
  const timer = setInterval(() => {
    let state;
    let now;
    try {
      state = player.getPlayerState();
      now = player.getCurrentTime();
    } catch {
      state = null;
    }
    if (state === PLAYER_STATE.PLAYING) {
      if (Math.abs(now - at) > 2) player.seekTo(at, true);
      if (capped()) player.setPlaybackQualityRange('hd1080', 'hd1080');
      clearInterval(timer);
    } else if (--tries <= 0 || state === null) {
      clearInterval(timer);
    }
  }, RESTORE_POLL_MS);
}

/**
 * The audio engines, one at a time: `create({ speed, element })` starts one
 * for a new MediaSource at `speed`, playing along with `element` (its volume
 * and mute followed), and stops the previous one; `release()` stops it.
 * `onError` is the engine's: a video it cannot play.
 */
function createAudioSinks(onError) {
  let active = null;

  /** Stops the engine of the previous MediaSource, if one is playing. */
  const release = () => {
    if (!active) return;
    active.engine.destroy();
    if (active.element) active.element.removeEventListener('volumechange', active.listener);
    active = null;
  };

  /** A new engine for a MediaSource at `speed`, following `element`'s volume. */
  const create = ({ speed, element }) => {
    release();
    const engine = new AudioEngine({ win: window, speed, onError });
    if (element) {
      engine.attachVideo(element);
      engine.setVolume(element.volume, element.muted);
      /** Follows the <video>'s volume and mute. */
      const listener = () => engine.setVolume(element.volume, element.muted);
      element.addEventListener('volumechange', listener);
      active = { engine, element, listener };
    } else {
      active = { engine, element: null, listener: null };
    }
    return engine;
  };

  /** The engine playing, or null. */
  const current = () => (active ? active.engine : null);

  return { create, release, current };
}

/**
 * The controller: `getPlayer()` is YouTube's player element (or null),
 * `notify(text)` shows a toast, `isOn()` whether the setting is on, and
 * `isSupported()` whether this TV can (WebCodecs' AudioDecoder).
 */
export function createSpeedController({ getPlayer, notify, isOn, isSupported }) {
  let currentSpeed = 1;
  let pending = null;
  let lastReloadAt = 0;
  // The engine's errors go to onError (a function declaration, hoisted).
  const sinks = createAudioSinks(onError);

  /** The speed in effect: 1 while the setting is off or the TV cannot. */
  const getSpeed = () => (isOn() && isSupported() ? currentSpeed : 1);

  /** Records a new speed, and whether it holds the video at 1080p (core/speed-cap.js). */
  function setCurrent(speed) {
    currentSpeed = speed;
    setQualityCappedBySpeed(speed > CAP_ABOVE);
  }

  /** The player's position in seconds, 0 when it cannot say. */
  function position(player) {
    try {
      return player.getCurrentTime();
    } catch {
      return 0;
    }
  }

  /** Reloads the video at the new speed, unless the burst came back to where it started. */
  function applyReload({ position: at, fromSpeed }) {
    // Back where the burst started: the MediaSource playing is already right.
    if (currentSpeed === fromSpeed) return;
    // The previous engine goes now, or it plays on while the new one starts.
    sinks.release();
    const player = getPlayer();
    if (!player) return;
    if (currentSpeed > CAP_ABOVE) {
      player.setPlaybackQualityRange('hd1080', 'hd1080');
    } else if (fromSpeed > CAP_ABOVE) {
      const quality = configRead('forceHighResVideo') ? 'highres' : 'auto';
      player.setPlaybackQualityRange(quality, quality);
    }
    const videoData = player.getVideoData && player.getVideoData();
    if (!videoData || !videoData.video_id) return;
    lastReloadAt = Date.now();
    log.info(`Reloading at ${currentSpeed}x from ${at.toFixed(1)} s`);
    player.loadVideoById(videoData.video_id, at);
    restorePosition(player, at, () => currentSpeed > CAP_ABOVE);
    // YouTube's own menu shows what the player was told: keep it in line.
    const setRate = player.__ytafOriginalSetPlaybackRate;
    if (setRate && typeof player.getPlaybackRate === 'function') {
      setTimeout(() => {
        try {
          if (player.getPlaybackRate() !== currentSpeed) setRate.call(player, currentSpeed);
        } catch {
          // The menu shows a stale value; playback is not affected.
        }
      }, MENU_SYNC_MS);
    }
  }

  /** Reloads RELOAD_DELAY_MS from now (at once with `immediate`), keeping the burst's start. */
  function scheduleReload(fromSpeed, immediate) {
    const player = getPlayer();
    if (!player) return;
    if (pending) clearTimeout(pending.timer);
    else pending = { position: position(player), fromSpeed, timer: null };
    if (immediate) {
      const p = pending;
      pending = null;
      applyReload(p);
      return;
    }
    pending.timer = setTimeout(() => {
      const p = pending;
      pending = null;
      applyReload(p);
    }, RELOAD_DELAY_MS);
  }

  /**
   * Plays at `speed` (one of SUPPORTED_SPEEDS): says so, and reloads (at once
   * with `immediate`, for a pick from YouTube's menu). Says why not when the
   * setting is off or the TV cannot.
   */
  function setSpeed(speed, { immediate = false } = {}) {
    if (speed === currentSpeed || !isSupportedSpeed(speed)) return;
    if (!isOn()) {
      notify('Turn on Playback Speed in the settings first (UI Tweaks)');
      return;
    }
    if (!isSupported()) {
      notify('Playback speed is not supported on this TV');
      return;
    }
    const previousSpeed = currentSpeed;
    setCurrent(speed);
    notify(`Playback speed ${speed}x`);
    scheduleReload(pending ? pending.fromSpeed : previousSpeed, immediate);
  }

  /** One step up (dir >= 0) or down the speeds, stopping at the ends. */
  function step(dir) {
    let idx = SUPPORTED_SPEEDS.indexOf(currentSpeed);
    if (idx === -1) idx = SUPPORTED_SPEEDS.indexOf(1);
    const next = Math.min(SUPPORTED_SPEEDS.length - 1, Math.max(0, idx + (dir >= 0 ? 1 : -1)));
    setSpeed(SUPPORTED_SPEEDS[next]);
  }

  /** Back to 1x. */
  function reset() {
    setSpeed(1);
  }

  /** The setting was turned off: back to 1x at once, not on the next video. */
  function stop() {
    if (currentSpeed === 1) return;
    const previousSpeed = currentSpeed;
    setCurrent(1);
    scheduleReload(pending ? pending.fromSpeed : previousSpeed, true);
  }

  /** The engine cannot play this video (an audio codec WebCodecs lacks): back to 1x. */
  function onError(e) {
    log.warn('Speed engine error:', e && e.message);
    if (currentSpeed === 1) return;
    const previousSpeed = currentSpeed;
    setCurrent(1);
    notify('Playback speed is not available for this video');
    scheduleReload(pending ? pending.fromSpeed : previousSpeed);
  }

  return {
    getSpeed,
    setSpeed,
    step,
    reset,
    stop,
    onError,
    createAudioSink: sinks.create,
    releaseAudioSink: sinks.release,
    activeEngine: sinks.current,
    /** When the last speed change reloaded the video (Date.now()), 0 before any. */
    lastReloadAt: () => lastReloadAt
  };
}
