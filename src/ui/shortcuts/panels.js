// The watch-page side panels: comments (or live chat), description and the
// save dialog, each toggled like the remote would: Back when it is open,
// its button when it is not.
import { showNotification } from '../toast/index.js';
import {
  simulateBack,
  isEngagementPanelVisible,
  triggerInternal,
  announcePressed
} from './helpers.js';
import { getReturnDislike } from '../../features/return-dislike/bootstrap.js';
import { SELECTORS } from '../../core/selectors.js';
import { log } from './log.js';

/** The first element a candidate selector finds, in the order given (a key press, a few lookups). */
function firstMatch(selectors) {
  for (let i = 0; i < selectors.length; i++) {
    const el = document.querySelector(selectors[i]);
    if (el) return el;
  }
  return null;
}

/** Whether a toggle button shows as on (aria-pressed or aria-selected). */
const isPressed = (button) =>
  !!button &&
  (button.getAttribute('aria-pressed') === 'true' ||
    button.getAttribute('aria-selected') === 'true');

/**
 * Toggles a panel: Back when `isOpen()` says it is up (or its button reads
 * pressed), else a click on `button` with `onOpened` afterwards; a toast when
 * there is no button to click.
 */
function togglePanelButton({ button, name, isOpen = isEngagementPanelVisible, onOpened }) {
  if (isPressed(button) || isOpen()) {
    simulateBack();
    return;
  }
  if (triggerInternal(button, name)) {
    if (onOpened) onOpened();
  } else {
    showNotification(`${name} Unavailable`);
  }
}

/**
 * Opens or closes the comments, or the live chat on a live stream; says so when neither is
 * available.
 */
export function toggleComments() {
  const target = firstMatch(SELECTORS.COMMENTS_BUTTONS);
  const button = target ? target.closest(SELECTORS.BUTTON_SHELLS) : null;
  if (button) {
    togglePanelButton({ button, name: 'Comments' });
    return;
  }
  // A live stream has a chat instead, which the same button turns on and off.
  const chat = document.querySelector(SELECTORS.LIVE_CHAT_BUTTON);
  if (!chat) {
    showNotification('Comments Unavailable');
    return;
  }
  if (!triggerInternal(chat, 'Live Chat')) {
    showNotification('Live Chat Unavailable');
    return;
  }
  announcePressed(chat, 'Live Chat');
}

/** The description button, by its label text, else the generic text button. */
function findDescriptionButton() {
  const candidates = document.querySelectorAll(SELECTORS.DESCRIPTION_LABEL);
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].textContent.trim() === 'Description') {
      return candidates[i].closest(SELECTORS.BUTTON_CONTAINER);
    }
  }
  const generic = document.querySelector(SELECTORS.DESCRIPTION_BUTTON_FALLBACK);
  return generic ? generic.closest(SELECTORS.BUTTON_CONTAINER) : null;
}

/**
 * Opens or closes the description panel; once it is open, the dislike counter is asked to look for
 * it.
 */
export function toggleDescription() {
  togglePanelButton({
    button: findDescriptionButton(),
    name: 'Description',
    onOpened: () => {
      // The dislike counter wants the panel once it has mounted.
      setTimeout(() => {
        const ryd = getReturnDislike();
        if (ryd) {
          log.debug('Polling for the description panel');
          ryd.pollForPanel();
        }
      }, 350);
    }
  });
}

/** Opens or closes the Save (Watch Later, playlists) dialog. */
export function saveToPlaylist() {
  const el = firstMatch(SELECTORS.SAVE_BUTTONS);
  // The match can be the icon inside the button: its button container is the one clicked.
  const button = el && el.tagName === 'YT-ICON' ? el.closest(SELECTORS.BUTTON_CONTAINER) : el;
  togglePanelButton({
    button,
    name: 'Save Button',
    isOpen: () => !!document.querySelector(SELECTORS.OVERLAY_PANEL)
  });
}
