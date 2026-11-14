// Shared by the shortcut actions: the Back press, the robust click on a
// YouTube button, and whether an engagement panel (comments, description) is up.
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { SELECTORS } from '../../core/selectors.js';
import { showNotification } from '../toast/index.js';
import { log } from './log.js';

/** Sends the remote's Back key to YouTube. */
export const simulateBack = () => sendKey(REMOTE_KEYS.BACK);

// Engagement panel detection: whichever of the two shells exists.
const getEngagementPanel = () => document.querySelector(SELECTORS.ENGAGEMENT_PANELS);

/** Whether YouTube's engagement panel (comments, description) is on screen. */
export const isEngagementPanelVisible = () => {
  const panel = getEngagementPanel();
  return !!(panel && window.getComputedStyle(panel).display !== 'none');
};

/** "<label>: ON" or "OFF" from the button's aria-pressed, once a click on it has taken effect (250 ms). */
export function announcePressed(button, label) {
  setTimeout(() => {
    showNotification(`${label}: ${button.getAttribute('aria-pressed') === 'true' ? 'ON' : 'OFF'}`);
  }, 250);
}

/** Clicks a YouTube button, and calls its component's onSelect() when it has one. */
export function triggerInternal(element, name) {
  if (!element) return false;
  element.click();
  log.debug(`Standard click triggered for ${name}`);

  const instance = element.__instance;
  if (instance && typeof instance.onSelect === 'function') {
    log.debug(`Also calling internal onSelect() for ${name}`);
    try {
      instance.onSelect({
        type: 'click',
        stopPropagation: () => {},
        preventDefault: () => {},
        target: element,
        currentTarget: element,
        bubbles: true,
        cancelable: true
      });
    } catch (e) {
      log.warn(`Internal call failed for ${name}:`, e);
      return false;
    }
  }
  return true;
}
