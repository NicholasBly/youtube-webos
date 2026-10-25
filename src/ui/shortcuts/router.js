// The global keydown router: the remote key, the shortcut bound to it, the
// page it may run on (any, for a global one), the debounce, the call.
import { keyCodeOf } from '../../core/remote.js';
import { isWatchPage, isShortsPage, isSearchPage } from '../../core/page-state.js';
import { getVideo } from '../../core/dom.js';
import { shortcutCache, getKeyColor, shortcutState } from './bindings.js';
import { isOptionsPanelVisible } from '../panel/panel.js';
import { ACTIONS } from './actions.js';

/** Whether `el` takes typed text: a textarea, or an input other than a checkbox or a colour. */
function isTextBox(el) {
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'color';
}

/** The shortcut key a keydown stands for ('red', '3', ...), or null. */
function keyNameOf(evt) {
  const color = getKeyColor(keyCodeOf(evt));
  if (color) return color;
  // A plain key in a text box is YouTube's; a digit elsewhere is a shortcut,
  // with the focus on one of the panel's checkboxes too.
  if (isTextBox(evt.target)) return null;
  if (evt.keyCode >= 48 && evt.keyCode <= 57) {
    return isSearchPage() ? null : String(evt.keyCode - 48);
  }
  return null;
}

/** Whether the action may run on the current page. */
function inScope(action) {
  return action.global || isWatchPage() || isShortsPage();
}

/**
 * The shortcut router (capture phase, before YouTube): runs the action bound to the key, drops a
 * repeat of the same press, and leaves the keys to the options panel while it is open (apart from
 * the key that closes it).
 */
function onKeyDown(evt) {
  const keyName = keyNameOf(evt);
  if (!keyName) return;

  const actionName = shortcutCache[keyName];
  if (!actionName || actionName === 'none') return;
  // Every bindable action has an entry (tests/unit/shortcut-actions-test.cjs),
  // and bindings.js turns any other stored name into None.
  const action = ACTIONS[actionName];
  if (!inScope(action)) return;

  // The same key again within the debounce is one press, and so is a held
  // key's repeat: neither reaches YouTube (a held digit would seek the app).
  // The seeks batch their presses, repeats included, themselves.
  const now = Date.now();
  const repeated =
    !action.burst &&
    (evt.repeat ||
      (now - shortcutState.lastTime < shortcutState.debounceMs &&
        shortcutState.lastKey === keyName));
  // With the panel open the keys are the panel's, apart from the one that closes it.
  const panelOwnsKeys = isOptionsPanelVisible() && actionName !== 'config_menu';
  if (repeated || panelOwnsKeys) {
    // A key held on a remote without the repeat flag keeps sliding the window.
    if (repeated) shortcutState.lastTime = now;
    evt.preventDefault();
    evt.stopPropagation();
    return;
  }

  shortcutState.debounceMs = 100;
  shortcutState.lastTime = now;
  shortcutState.lastKey = keyName;
  evt.preventDefault();
  evt.stopPropagation();

  if (action.global) {
    action.run();
    return;
  }
  const video = getVideo();
  if (video) action.run(video);
}

document.addEventListener('keydown', onKeyDown, true);
