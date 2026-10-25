// Persisted settings: one localStorage entry, read into memory once, written
// back debounced, with change listeners per key. The option tables themselves
// live in config-options.js and are re-exported here so callers import one module.
import { configOptions } from './config-options.js';
import { createLogger } from './log.js';

export {
  segmentTypes,
  logoStyles,
  thumbnailQualityModes,
  shortcutActions,
  sbModes,
  sbModesHighlight,
  forcePreviewModes,
  videoCodecModes,
  uiThemes
} from './config-options.js';

const CONFIG_KEY = 'ytaf-configuration';
const log = createLogger('Config');

const changeListeners = new Map();

/** The stored settings as an object, or null when there are none or they do not parse. */
function loadStoredConfig() {
  const storage = window.localStorage.getItem(CONFIG_KEY);
  if (storage === null) return null;
  try {
    return JSON.parse(storage);
  } catch {
    return null;
  }
}

/**
 * Every option of this build: the stored value where there is one, else the
 * default. A key the store holds that this build does not have (a setting
 * from an older one) is left out, so the next write drops it from storage.
 */
function buildConfig(stored) {
  const config = {};
  for (const [key, option] of configOptions) {
    config[key] =
      stored && Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : option.default;
  }
  if (stored && typeof stored === 'object') {
    const leftover = Object.keys(stored).filter((key) => !configOptions.has(key));
    if (leftover.length) {
      log.info('Dropping settings this build does not have:', leftover.join(', '));
    }
  }
  return config;
}

// Mutated in place, never reassigned: adblock and other modules hold this very
// object through configGetAll().
const localConfig = buildConfig(loadStoredConfig());

// The localStorage write is debounced: a burst of changes (a colour picker
// drag) serialises the whole config once rather than once per change.
let pendingWriteTimer = null;
/**
 * Writes the whole config to localStorage now; a full or refused storage keeps it in memory only.
 */
function writeNow() {
  pendingWriteTimer = null;
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(localConfig));
  } catch {
    /* A full or refused storage: the config lives on in memory. */
  }
}
/**
 * Writes a pending debounced change at once (on beforeunload and pagehide), so leaving the app does
 * not lose it.
 */
const flushPendingWrite = () => {
  if (pendingWriteTimer !== null) {
    clearTimeout(pendingWriteTimer);
    writeNow();
  }
};
/** Starts the 200 ms debounced write unless one is already pending. */
const scheduleWrite = () => {
  if (pendingWriteTimer === null) pendingWriteTimer = setTimeout(writeNow, 200);
};
window.addEventListener('beforeunload', flushPendingWrite);
window.addEventListener('pagehide', flushPendingWrite);

/** Whether this build has a setting called `key`. */
function configExists(key) {
  return configOptions.has(key);
}

/** Throws for a key no option defines: a typo, or a key a build removed. */
function assertKey(key, verb) {
  if (!configExists(key)) throw new Error(`tried to ${verb} unknown config key: ${key}`);
}

/** The label the options panel shows for `key`. */
export function configGetDesc(key) {
  assertKey(key, 'get desc for');
  return configOptions.get(key).desc;
}

/** The current value of setting `key` (from memory: no storage read). Throws for an unknown key. */
export function configRead(key) {
  assertKey(key, 'read');
  return localConfig[key];
}

// The per-write log is debug level: configWrite fires per event during
// colour-picker drags and opacity scrubs (the localStorage write itself is
// debounced).
export function configWrite(key, value) {
  assertKey(key, 'write');
  const oldValue = localConfig[key];
  if (oldValue === value) return;

  log.debug('Changing key', key, 'from', oldValue, 'to', value);
  localConfig[key] = value;
  scheduleWrite();

  const listeners = changeListeners.get(key);
  if (listeners) {
    const syntheticEvent = { detail: { key, newValue: value, oldValue } };
    for (const callback of listeners) {
      try {
        callback(syntheticEvent);
      } catch (err) {
        log.warn('change listener failed for', key, err);
      }
    }
  }
}

/**
 * Calls `callback({ detail: { key, newValue, oldValue } })` whenever `key` changes through
 * configWrite.
 */
export function configAddChangeListener(key, callback) {
  assertKey(key, 'listen to');
  if (!changeListeners.has(key)) changeListeners.set(key, new Set());
  changeListeners.get(key).add(callback);
}

/** Stops calling `callback` for changes of `key`. */
export function configRemoveChangeListener(key, callback) {
  if (changeListeners.has(key)) changeListeners.get(key).delete(callback);
}

/** The default value of setting `key`, as config-options.js declares it. */
export function configGetDefault(key) {
  assertKey(key, 'get default for');
  return configOptions.get(key).default;
}

// Export the live object reference directly for zero-overhead caching
export function configGetAll() {
  return localConfig;
}
