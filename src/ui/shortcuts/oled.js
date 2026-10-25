// The OLED black overlay, with a keep-alive so the TV does not sleep under it.
import './oled.css';
import { showNotification } from '../toast/index.js';
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { createElement } from '../dom.js';

const OVERLAY_ID = 'ytaf-oled-overlay';
const KEEP_ALIVE_MS = 30 * 60 * 1000;

let keepAliveTimer = null;

/** Whether the black OLED overlay is showing. */
export function isOledOverlayActive() {
  return !!document.getElementById(OVERLAY_ID);
}

/** The OLED black overlay with its keep-alive, toggled by the oled_toggle shortcut. */
export function toggleOledOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.remove();
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    showNotification('OLED Mode Deactivated');
    return;
  }

  document.body.appendChild(createElement('div', { id: OVERLAY_ID }));
  // A synthetic press now and then keeps the TV awake under the overlay.
  keepAliveTimer = setInterval(() => {
    sendKey(REMOTE_KEYS.UP);
    setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
  }, KEEP_ALIVE_MS);
  // No "activated" toast: it would sit under the overlay, never seen.
}
