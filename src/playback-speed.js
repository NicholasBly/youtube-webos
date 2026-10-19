import { AudioEngine } from './speed/audio-engine.js';
import { installMseHook, isSupportedSpeed, SUPPORTED_SPEEDS } from './speed/mse-hook.js';
import { showNotification } from './notifications.js';
import { configRead } from './config.js';
import { SELECTORS } from './utils.js';

export const SPEED_BUTTON_TYPE = 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED_BUTTON';
export const SPEED_OVERLAY_TYPE = 'CLIENT_OVERLAY_TYPE_VIDEO_PLAYBACK_SPEED';

export function enableSpeedButton(response) {
  const holder =
    response && response.transportControls
      ? response
      : response &&
        response.playerOverlays &&
        response.playerOverlays.playerOverlayRenderer;
  const renderer =
    holder &&
    holder.transportControls &&
    holder.transportControls.transportControlsRenderer;
  if (!renderer || typeof renderer !== 'object') return 0;
  let enabled = 0;
  for (const key of Object.keys(renderer)) {
    const actions = renderer[key];
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      if (!action || action.type !== SPEED_BUTTON_TYPE) continue;
      const button = action.button && action.button.buttonRenderer;
      if (!button || !button.isDisabled) continue;
      button.isDisabled = false;
      if (!button.command) {
        button.command = {
          openClientOverlayAction: { type: SPEED_OVERLAY_TYPE }
        };
      }
      enabled++;
    }
  }
  return enabled;
}

export function installSpeedButtonPatch(win, isOn) {
  const json = win.JSON || JSON;
  const original = json.parse;
  const patched = function () {
    const r = original.apply(this, arguments);
    if (
      r &&
      typeof r === 'object' &&
      (r.transportControls ||
        (r.playerOverlays &&
          r.playerOverlays.playerOverlayRenderer &&
          r.playerOverlays.playerOverlayRenderer.transportControls)) &&
      isOn()
    ) {
      enableSpeedButton(r);
    }
    return r;
  };
  json.parse = patched;
  return () => {
    if (json.parse === patched) json.parse = original;
  };
}

export function enableNativeSpeedMenu(win) {
  const proto = (win.Object || Object).prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'enableSpeedOptions');
  Object.defineProperty(proto, 'enableSpeedOptions', {
    configurable: true,
    enumerable: false,
    get() {
      return true;
    },
    set(value) {
      Object.defineProperty(this, 'enableSpeedOptions', {
        value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  });
  return () => {
    if (previous) Object.defineProperty(proto, 'enableSpeedOptions', previous);
    else delete proto.enableSpeedOptions;
  };
}

export function hookRateAssignments(win, controller, now = () => Date.now()) {
  const proto = (win.Object || Object).prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'setPlaybackRate');
  Object.defineProperty(proto, 'setPlaybackRate', {
    configurable: true,
    enumerable: false,
    get() {
      return undefined;
    },
    set(fn) {
      if (Object(this) !== this) return;
      const plain =
        Object.getPrototypeOf(this) === proto &&
        !Object.hasOwn(this, 'constructor');
      Object.defineProperty(this, 'setPlaybackRate', {
        value:
          plain && typeof fn === 'function'
            ? wrapRate(fn, controller, now)
            : fn,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  });
  return () => {
    if (previous) Object.defineProperty(proto, 'setPlaybackRate', previous);
    else delete proto.setPlaybackRate;
  };
}

export function bindPlayerRate(player, controller, now = () => Date.now()) {
  if (
    !player ||
    typeof player.setPlaybackRate !== 'function' ||
    player.__ytafSpeedBound
  )
    return false;
  const original = player.setPlaybackRate;
  player.__ytafOriginalSetPlaybackRate = original.__ytafUnwrapped || original;
  if (!original.__ytafUnwrapped)
    player.setPlaybackRate = wrapRate(original, controller, now);
  player.__ytafSpeedBound = true;
  return true;
}

function wrapRate(original, controller, now) {
  if (original.__ytafUnwrapped) return original;
  const wrapped = function (rate) {
    const result = original.apply(this, arguments);
    const r = Number(rate);
    const sinceReload = now() - controller.lastReloadAt();
    if (
      isSupportedSpeed(r) &&
      r !== controller.getSpeed() &&
      sinceReload > IGNORE_AFTER_RELOAD_MS
    ) {
      controller.setSpeed(r, { immediate: true });
    }
    return result;
  };
  wrapped.__ytafUnwrapped = original;
  return wrapped;
}

export const IGNORE_AFTER_RELOAD_MS = 3000;

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

export const RELOAD_DELAY_MS = 800;

export function createSpeedController({ win, getPlayer, notify, configRead }) {
  let currentSpeed = 1;
  let activeSink = null;
  let pending = null;
  let lastReloadAt = 0;

  function isSupported() {
    return typeof win.AudioDecoder !== 'undefined';
  }

  function enabled() {
    return configRead('enablePlaybackSpeed') !== false;
  }

    function getSpeed() {
    return enabled() && isSupported() ? currentSpeed : 1;
  }

    function position(player) {
    try {
      return player.getCurrentTime();
    } catch {
      return 0;
    }
  }

  function scheduleReload(fromSpeed, immediate = false) {
    const player = getPlayer();
    if (!player) return;
    if (pending) {
      win.clearTimeout(pending.timer);
    } else {
      pending = { position: position(player), fromSpeed, timer: null };
    }
    if (immediate) {
      const p = pending;
      pending = null;
      applyReload(p);
      return;
    }
    pending.timer = win.setTimeout(() => {
      const p = pending;
      pending = null;
      applyReload(p);
    }, RELOAD_DELAY_MS);
  }

  function applyReload({ position: at, fromSpeed }) {
    // Back where the burst started: the playing MediaSource is already right.
    if (currentSpeed === fromSpeed) return;
    // Stop any previous Web Audio engine immediately so it doesn't keep playing
    // while the new MediaSource is being set up.
    releaseAudioSink();
    const player = getPlayer();
    if (!player) return;
    if (currentSpeed > 1.25) {
      player.setPlaybackQualityRange('hd1080', 'hd1080');
    } else if (fromSpeed > 1.25) {
      const quality = configRead('forceHighResVideo') ? 'highres' : 'auto';
      player.setPlaybackQualityRange(quality, quality);
    }
    const videoData = player.getVideoData && player.getVideoData();
    if (!videoData || !videoData.video_id) return;
    lastReloadAt = Date.now();
    player.loadVideoById(videoData.video_id, at);
    // If YouTube's own menu is bound (native-menu.js), keep what it shows in
    // line with the real speed once the reloaded video has started.
    const setRate = player.__ytafOriginalSetPlaybackRate;
    if (setRate && typeof player.getPlaybackRate === 'function') {
      win.setTimeout(() => {
        try {
          if (player.getPlaybackRate() !== currentSpeed)
            setRate.call(player, currentSpeed);
        } catch {
          // The menu only shows a stale value; playback itself is unaffected.
        }
      }, 2500);
    }
  }

  function setSpeed(speed, { immediate = false } = {}) {
    if (speed === currentSpeed || !isSupportedSpeed(speed)) return;
    if (!enabled()) {
      notify('Playback speed is disabled in YTAF settings');
      return;
    }
    if (!isSupported()) {
      notify('Playback speed is not supported on this TV');
      return;
    }
    const previousSpeed = currentSpeed;
    currentSpeed = speed;
    notify(`Playback speed ${speed}×`);
    scheduleReload(pending ? pending.fromSpeed : previousSpeed, immediate);
  }

  function cycle() {
    const idx = SPEEDS.indexOf(currentSpeed);
    const nextIdx = (idx + 1) % SPEEDS.length;
    setSpeed(SPEEDS[nextIdx]);
  }

  function step(dir) {
    let idx = SUPPORTED_SPEEDS.indexOf(currentSpeed);
    if (idx === -1) idx = SUPPORTED_SPEEDS.indexOf(1);
    const nextIdx = Math.min(
      SUPPORTED_SPEEDS.length - 1,
      Math.max(0, idx + (dir >= 0 ? 1 : -1))
    );
    setSpeed(SUPPORTED_SPEEDS[nextIdx]);
  }

  function reset() {
    setSpeed(1);
  }

    function onRateRequest() {}

  function onError(_err) {
    if (currentSpeed !== 1) {
      const previousSpeed = currentSpeed;
      currentSpeed = 1;
      notify('Playback speed not available for this video');
      scheduleReload(pending ? pending.fromSpeed : previousSpeed);
    }
  }

    function releaseAudioSink() {
    if (!activeSink) return;
    activeSink.engine.destroy();
    if (activeSink.element)
      activeSink.element.removeEventListener(
        'volumechange',
        activeSink.listener
      );
    activeSink = null;
  }

  function createAudioSink({ speed, element }) {
    releaseAudioSink();

    const engine = new AudioEngine({ win, speed, onError });
    if (element) {
      engine.attachVideo(element);
      engine.setVolume(element.volume, element.muted);
      const listener = () => {
        engine.setVolume(element.volume, element.muted);
      };
      element.addEventListener('volumechange', listener);
      activeSink = { engine, element, listener };
    } else {
      activeSink = { engine, element: null, listener: null };
    }
    return engine;
  }

  function handleKey(evt) {
    // YTAF's ui.js reads colour keys from charCode, the webOS docs from keyCode:
    // accept both.
    const code = evt.keyCode || evt.charCode;
    if (code === 405 || code === 170) {
      if (evt.type === 'keydown') {
        evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
        // YouTube re-dispatches remote keys from its own listeners on document
        // (seen on the TV: one press cycled twice); ours runs first, so stop them.
        if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
        cycle();
        return true;
      } else if (evt.type === 'keypress' || evt.type === 'keyup') {
        evt.preventDefault();
        return true;
      }
    }
    return false;
  }

  return {
        activeEngine: () => (activeSink ? activeSink.engine : null),
    lastReloadAt: () => lastReloadAt,
    isSupported,
    getSpeed,
    setSpeed,
    cycle,
    step,
    reset,
    onRateRequest,
    onError,
    createAudioSink,
    releaseAudioSink,
    handleKey
  };
}

let speedInstance = null;

export function installSpeedFeature(win, { notify, configRead: cfgRead, getPlayer }) {
  if (
    typeof win.AudioDecoder === 'undefined' ||
    typeof win.AudioContext === 'undefined' ||
    typeof win.MediaSource === 'undefined'
  ) {
    return null;
  }

  const ctrl = createSpeedController({ win, getPlayer, notify, configRead: cfgRead });
  const mseHook = installMseHook(win, {
    getSpeed: ctrl.getSpeed,
    createAudioSink: ctrl.createAudioSink,
    onRateRequest: ctrl.onRateRequest,
    onError: ctrl.onError,
    onNativeAudio: ctrl.releaseAudioSink
  });

  const restoreMenu = enableNativeSpeedMenu(win);
  const restoreRateHook = hookRateAssignments(win, ctrl);
  const restoreButton = installSpeedButtonPatch(
    win,
    () => cfgRead('enablePlaybackSpeed') !== false
  );
  const bindTimer =
    typeof win.setInterval === 'function'
      ? win.setInterval(() => bindPlayerRate(getPlayer(), ctrl), 1000)
      : null;

  const keyHandler = (evt) => ctrl.handleKey(evt);
  win.document.addEventListener('keydown', keyHandler, true);
  win.document.addEventListener('keypress', keyHandler, true);
  win.document.addEventListener('keyup', keyHandler, true);

  return {
    controller: ctrl,
    uninstall() {
      mseHook.uninstall();
      restoreMenu();
      restoreRateHook();
      restoreButton();
      if (bindTimer !== null) win.clearInterval(bindTimer);
      win.document.removeEventListener('keydown', keyHandler, true);
      win.document.removeEventListener('keypress', keyHandler, true);
      win.document.removeEventListener('keyup', keyHandler, true);
    }
  };
}

export function initPlaybackSpeed() {
  if (speedInstance || typeof window === 'undefined') return speedInstance;
  speedInstance = installSpeedFeature(window, {
    notify: showNotification,
    configRead,
    getPlayer: () =>
      document.getElementById(SELECTORS.PLAYER_ID) ||
      document.querySelector('.html5-video-player')
  });
  window.ytafSpeed = speedInstance ? speedInstance.controller : null;
  return speedInstance;
}

export function stepSpeed(direction) {
  initPlaybackSpeed()?.controller?.step(direction);
}

export function resetSpeed() {
  initPlaybackSpeed()?.controller?.reset();
}

initPlaybackSpeed();
