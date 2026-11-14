// YouTube's own speed controls on the TV app, which it turns off for webOS:
// the Speed button of the player's controls (switched on in the response that
// carries it) and the speed options of its Settings menu (a flag YouTube
// reads off its config objects). A speed picked there reaches the controller
// through the player's setPlaybackRate, which is wrapped wherever YouTube
// creates it. Everything here follows `isOn()`: with the feature off, YouTube
// sees what it would have seen.
import { isSupportedSpeed } from '../../vendor/playback-speed/mse-hook.js';

const SPEED_BUTTON_TYPE = 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED_BUTTON';
const SPEED_OVERLAY_TYPE = 'CLIENT_OVERLAY_TYPE_VIDEO_PLAYBACK_SPEED';
// A rate set by YouTube this soon after a speed change's reload is the
// reloaded player restoring its own state, not a pick from the menu.
const IGNORE_AFTER_RELOAD_MS = 3000;

/**
 * Switches on the Speed button of a parsed response's transport controls (top
 * level, or under playerOverlays), giving it the command that opens YouTube's
 * speed overlay when it has none. Returns how many buttons it switched on.
 */
export function enableSpeedButton(response) {
  const holder =
    response && response.transportControls
      ? response
      : response && response.playerOverlays && response.playerOverlays.playerOverlayRenderer;
  const renderer =
    holder && holder.transportControls && holder.transportControls.transportControlsRenderer;
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
        button.command = { openClientOverlayAction: { type: SPEED_OVERLAY_TYPE } };
      }
      enabled++;
    }
  }
  return enabled;
}

/**
 * Makes YouTube offer its speed options while `isOn()`: `enableSpeedOptions`
 * reads true on every object that does not set it itself (an object that
 * assigns it keeps its own value). Returns the function that takes it away.
 */
export function enableNativeSpeedMenu(isOn) {
  const proto = Object.prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'enableSpeedOptions');
  Object.defineProperty(proto, 'enableSpeedOptions', {
    configurable: true,
    enumerable: false,
    /** True while the feature is on; nothing otherwise, as without the hook. */
    get() {
      return isOn() ? true : undefined;
    },
    /** An object assigning the flag gets its own property, as without the hook. */
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

/**
 * The player's setPlaybackRate, wrapped: YouTube's own call goes through, and
 * a supported speed other than the current one (a pick from its menu) is
 * passed to the controller, unless it came right after a reload.
 */
function wrapRate(original, controller) {
  if (original.__ytafUnwrapped) return original;
  /** setPlaybackRate as YouTube calls it, with the pick passed on. */
  const wrapped = function (rate) {
    const result = original.apply(this, arguments);
    const r = Number(rate);
    if (
      isSupportedSpeed(r) &&
      r !== controller.getSpeed() &&
      Date.now() - controller.lastReloadAt() > IGNORE_AFTER_RELOAD_MS
    ) {
      controller.setSpeed(r, { immediate: true });
    }
    return result;
  };
  wrapped.__ytafUnwrapped = original;
  return wrapped;
}

/**
 * Wraps setPlaybackRate where YouTube assigns it on a plain object (its player
 * API is built that way): an accessor on Object.prototype catches the
 * assignment and stores the wrapped function as the object's own property.
 * Returns the function that takes the accessor away.
 */
export function hookRateAssignments(controller) {
  const proto = Object.prototype;
  const previous = Object.getOwnPropertyDescriptor(proto, 'setPlaybackRate');
  Object.defineProperty(proto, 'setPlaybackRate', {
    configurable: true,
    enumerable: false,
    /** Nothing, as on an object without the property. */
    get() {
      return undefined;
    },
    /** Stores the function as the object's own property, wrapped on a plain object. */
    set(fn) {
      if (Object(this) !== this) return;
      const plain =
        Object.getPrototypeOf(this) === proto &&
        !Object.prototype.hasOwnProperty.call(this, 'constructor');
      Object.defineProperty(this, 'setPlaybackRate', {
        value: plain && typeof fn === 'function' ? wrapRate(fn, controller) : fn,
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

/**
 * Wraps the setPlaybackRate of the player element itself (once), keeping the
 * original for the controller to set the menu's value with. Returns whether it
 * wrapped it now.
 */
export function bindPlayerRate(player, controller) {
  if (!player || typeof player.setPlaybackRate !== 'function' || player.__ytafSpeedBound) {
    return false;
  }
  const original = player.setPlaybackRate;
  player.__ytafOriginalSetPlaybackRate = original.__ytafUnwrapped || original;
  if (!original.__ytafUnwrapped) player.setPlaybackRate = wrapRate(original, controller);
  player.__ytafSpeedBound = true;
  return true;
}
