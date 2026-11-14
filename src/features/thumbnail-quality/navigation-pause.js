// Holds probes and promotions still while the remote's arrow keys are moving.
import { NAV_PAUSE_MS, NAV_KEY_CODES } from './constants.js';
import { state } from './state.js';

/** Arrow keydown, capture phase: just a timestamp, nothing else runs here. */
export function onNavKey(e) {
  if (NAV_KEY_CODES[e.keyCode]) state.lastNavAt = performance.now();
}

/** Milliseconds left on the navigation pause; 0 when the remote is quiet. */
export function navPauseLeft() {
  const left = NAV_PAUSE_MS - (performance.now() - state.lastNavAt);
  return left > 0 ? left : 0;
}
