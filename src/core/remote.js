// The remote control: key codes, the colour-key lookup, and synthetic key
// presses dispatched on the app's behalf.

import { createLogger } from './log.js';

const log = createLogger('Remote');

// The second yellow code some webOS remotes emit alongside 405; the Shorts
// keep-alive sends both halves of the burst.
const YELLOW_ALT_CODE = 170;

export const REMOTE_KEYS = {
  ENTER: { code: 13, key: 'Enter' },
  BACK: { code: 461, key: 'Back' },
  LEFT: { code: 37, key: 'ArrowLeft' },
  UP: { code: 38, key: 'ArrowUp' },
  RIGHT: { code: 39, key: 'ArrowRight' },
  DOWN: { code: 40, key: 'ArrowDown' },
  RED: { code: 403, key: 'Red', alt: [166] },
  GREEN: { code: 404, key: 'Green', alt: [172] },
  YELLOW: { code: 405, key: 'Yellow', alt: [YELLOW_ALT_CODE] },
  YELLOW_ALT: { code: YELLOW_ALT_CODE, key: 'Yellow', charCode: YELLOW_ALT_CODE },
  BLUE: { code: 406, key: 'Blue', alt: [167, 191] }
};

// Colour-key codes, including the alternate codes some webOS remotes emit;
// the shortcut router reads this table.
export const COLOR_CODE_MAP = new Map();
for (const name of ['RED', 'GREEN', 'YELLOW', 'BLUE']) {
  const def = REMOTE_KEYS[name];
  const lower = name.toLowerCase();
  COLOR_CODE_MAP.set(def.code, lower);
  if (def.alt) {
    def.alt.forEach((code) => {
      COLOR_CODE_MAP.set(code, lower);
    });
  }
}

/**
 * The code of a key press. webOS 3 reports the alternate colour-key codes
 * (REMOTE_KEYS.*.alt) in charCode with keyCode 0, so charCode wins when set.
 */
export const keyCodeOf = (evt) => evt.charCode || evt.keyCode;

// Getters for keyCode, which and charCode on every synthetic event: neither
// the constructor nor initKeyboardEvent sets them, and YouTube reads them.
const createDescriptor = (val) => ({ get: () => val });

// Detected once: whether the KeyboardEvent constructor works on this engine.
let createEventStrategy;

try {
  // Check if modern constructor works
  new KeyboardEvent('keydown');
  createEventStrategy = (type, opts) => new KeyboardEvent(type, opts);
} catch {
  // Fallback for webOS 3.0 / Legacy
  createEventStrategy = (type, opts) => {
    const evt = document.createEvent('KeyboardEvent');
    if (evt.initKeyboardEvent) {
      evt.initKeyboardEvent(type, true, false, window, opts.key, 0, '', false);
    } else {
      evt.initEvent(type, true, true);
    }
    return evt;
  };
}

// Property stamped onto every KeyboardEvent this module dispatches, for
// anything that must react to a real remote press only. Such a listener
// checks the flag as well as isTrusted: on Chromium 38 an event from
// document.createEvent can report isTrusted as undefined, which a test for
// isTrusted === false would take for a real press.
export const SYNTHETIC_KEY_FLAG = '__ytafSynthetic';

/**
 * Dispatches a synthetic keydown and keyup for a remote key (REMOTE_KEYS entry) on `target`, with
 * keyCode/which forced the way Chromium 38 needs; marked so real-press-only listeners ignore it.
 */
export function sendKey(keyDef, target = document.body) {
  if (!keyDef?.code) {
    log.warn('Invalid key definition');
    return;
  }

  const eventOpts = {
    bubbles: true,
    cancelable: false,
    composed: true,
    view: window,
    key: keyDef.key,
    code: keyDef.key,
    keyCode: keyDef.code,
    which: keyDef.code,
    charCode: keyDef.charCode || 0
  };

  const keyDownEvt = createEventStrategy('keydown', eventOpts);
  const keyUpEvt = createEventStrategy('keyup', eventOpts);

  // Marked for the listeners that react to a real press only (SYNTHETIC_KEY_FLAG).
  keyDownEvt[SYNTHETIC_KEY_FLAG] = true;
  keyUpEvt[SYNTHETIC_KEY_FLAG] = true;

  const codeDesc = createDescriptor(keyDef.code);
  const charDesc = createDescriptor(keyDef.charCode || 0);

  Object.defineProperties(keyDownEvt, { keyCode: codeDesc, which: codeDesc, charCode: charDesc });
  Object.defineProperties(keyUpEvt, { keyCode: codeDesc, which: codeDesc, charCode: charDesc });

  target.dispatchEvent(keyDownEvt);
  target.dispatchEvent(keyUpEvt);
}
