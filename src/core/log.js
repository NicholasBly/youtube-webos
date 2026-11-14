// One logger for every module. `debug` and `info` reach the console only
// while diagnostics are on; `warn` and `error` always do.
//
// Diagnostics are on when localStorage holds `ytaf-debug` = '1' (set it from
// the TV's web inspector; it survives restarts and needs no rebuild), or while
// `window.__ytaf_debug__` is true (set from the devtools console; the tests use it too).
// The stored flag is read once at load: a reload is how it takes effect.
const FLAG_KEY = 'ytaf-debug';

let stored = false;
try {
  stored = window.localStorage.getItem(FLAG_KEY) === '1';
} catch {
  // No storage: diagnostics stay off.
}

/**
 * Whether diagnostics are on: `ytaf-debug` = '1' in localStorage (read at load), or
 * `window.__ytaf_debug__ = true` set from the devtools console.
 */
export function isDebugEnabled() {
  return stored || window.__ytaf_debug__ === true;
}

const slice = Array.prototype.slice;

/** @typedef {(...args: unknown[]) => void} LogMethod */

/** `tag` is what every line from the module is prefixed with, in brackets. */
export function createLogger(tag) {
  const prefix = '[' + tag + ']';
  // `arguments` rather than a rest parameter for the two that are usually
  // off: the legacy build copies a rest parameter into an array on every
  // call, before the check could skip it.
  /** @type {LogMethod} */
  const debug = function () {
    if (isDebugEnabled()) console.log.apply(console, [prefix].concat(slice.call(arguments)));
  };
  /** @type {LogMethod} */
  const info = function () {
    if (isDebugEnabled()) console.info.apply(console, [prefix].concat(slice.call(arguments)));
  };
  return {
    debug,
    info,
    /** console.warn with the module prefix; always printed. */
    warn(...args) {
      console.warn(prefix, ...args);
    },
    /** console.error with the module prefix; always printed. */
    error(...args) {
      console.error(prefix, ...args);
    }
  };
}
