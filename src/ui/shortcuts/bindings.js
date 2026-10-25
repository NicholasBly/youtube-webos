// Which remote key runs which shortcut: the configurable bindings, the
// colour-key lookup and the debounce state shared with the actions.
import {
  configRead,
  configWrite,
  configAddChangeListener,
  shortcutActions
} from '../../core/config.js';
import { COLOR_CODE_MAP } from '../../core/remote.js';
import { showNotification } from '../toast/index.js';
import { SHORTCUT_KEYS } from '../../core/config-options.js';
import { log } from './log.js';

// Shortcut key name -> action name, kept current by the config listeners.
export const shortcutCache = {};

/**
 * Reads one binding. An action this build does not have (a binding stored by
 * an older one) becomes None, in the cache and in the config, so the key is
 * the app's again and the panel shows a value it knows; warned once, here.
 */
function updateShortcutCache(key) {
  const configKey = `shortcut_key_${key}`;
  const action = configRead(configKey);
  if (Object.prototype.hasOwnProperty.call(shortcutActions, action)) {
    shortcutCache[key] = action;
    return;
  }
  log.warn(`Unknown action "${action}" on key ${key}: set to None`);
  shortcutCache[key] = 'none';
  configWrite(configKey, 'none');
}

SHORTCUT_KEYS.forEach((key) => {
  updateShortcutCache(key);
  configAddChangeListener(`shortcut_key_${key}`, () => updateShortcutCache(key));
});

/**
 * The settings must stay reachable: with no key bound to the menu, Green is
 * bound to it again, said with `announce`. The key that opens the menu, and
 * whether Green was just bound to it. Run at the start and whenever the panel
 * closes (a binding changed on it may have unbound the menu).
 */
export function ensureMenuKey(announce) {
  const key = SHORTCUT_KEYS.find((k) => shortcutCache[k] === 'config_menu');
  if (key) return { key, rebound: false };
  log.warn('No menu keybind found. Forcing Green button to Open Settings.');
  configWrite('shortcut_key_green', 'config_menu');
  if (announce) showNotification('Press [GREEN] to open the settings');
  return { key: 'green', rebound: true };
}

// Colour-key code to name, alternates included, from REMOTE_KEYS in core/remote.js.
export const getKeyColor = (code) => COLOR_CODE_MAP.get(code) || null;

// Debounce between repeated presses of the same shortcut. playPause widens it
// briefly after a pause so the controls-dismiss dance is not interrupted.
export const shortcutState = {
  lastTime: 0,
  lastKey: null,
  debounceMs: 100
};

// The action names (config-options.js shortcutActions) are stored in the
// user's config, so they stay as they are: seek_15_fwd and seek_15_back seek
// by 5 s per press (shortcuts/actions.js), not 15.
