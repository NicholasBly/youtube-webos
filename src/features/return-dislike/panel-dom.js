// DOM helpers with no instance state: ancestor walks, number formatting and
// the synthetic Enter press.
import { PANEL } from './constants.js';
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';

// closest() runs the selector engine at every level of the ancestor chain, and
// handleFocusIn runs on every focus change in the app while a watch page is
// open. Both selectors here are trivial (a tag name, an attribute), so a
// hand-rolled walk gives the same answer without the engine.
export function closestPanel(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.localName === PANEL.panel) return n;
  }
  return null;
}

/** The closest ancestor of `el` (or `el` itself) with role=menuitem, or null. */
export function closestMenuItem(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.getAttribute('role') === 'menuitem') return n;
  }
  return null;
}

/** A count as YouTube writes it: 950, 1.2k, 3.4m. */
export function formatNumber(num) {
  // From 999,950 up the thousands would round to "1000k".
  if (num >= 999950) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return num.toString();
}

/** A synthetic Enter on the element; sendKey() flags it, so handleNavigation ignores it. */
export function triggerEnter(element) {
  if (element) sendKey(REMOTE_KEYS.ENTER, element);
}
