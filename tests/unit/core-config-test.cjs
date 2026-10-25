/**
 * core/config as a unit: the option tables and the store are loaded into a vm
 * sandbox with a fake localStorage, so the API is exercised directly: defaults
 * from the table, stored values merged over them, writes with listeners and the
 * debounced persistence, and the guards (unknown key, unchanged value, a
 * listener that throws).
 *
 * Run: node tests/unit/core-config-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { CORE } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { wait } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// text.js supplies capitalize() to config-options.js, which comes before
// config.js, which builds its defaults from configOptions.
const SOURCES = ['text.js', 'config-options.js', 'config.js'].map(CORE);

/** A fresh sandbox with the given stored configuration (object or raw string). */
function load(stored) {
  const store = new Map();
  if (stored !== undefined) {
    store.set('ytaf-configuration', typeof stored === 'string' ? stored : JSON.stringify(stored));
  }
  // How often the config was written, and the page's own listeners (pagehide).
  const writes = { n: 0 };
  const listeners = {};
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      if (k === 'ytaf-configuration') writes.n++;
      store.set(k, String(v));
    }
  };
  // The store writes with `localStorage[KEY] = value`, so the fake is a Proxy
  // that routes property writes into the same map.
  const storageProxy = new Proxy(localStorage, {
    set(target, key, value) {
      store.set(String(key), String(value));
      return true;
    },
    get(target, key) {
      if (key in target) return target[key];
      return store.has(String(key)) ? store.get(String(key)) : undefined;
    }
  });
  const warnings = [];
  const { sandbox, get } = loadSources(SOURCES, {
    // The write debounce (200 ms) at a tenth.
    setTimeout: (cb, ms) => setTimeout(cb, ms / 10),
    clearTimeout,
    JSON,
    Map,
    Set,
    Object,
    Array,
    Error,
    String,
    createLogger: () => ({
      debug() {},
      info() {},
      warn: (...a) => warnings.push(a.join(' ')),
      error() {}
    }),
    localStorage: storageProxy,
    window: {
      localStorage: storageProxy,
      addEventListener(type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
      }
    }
  });
  /** The page fires `type` (pagehide, beforeunload). */
  const fire = (type) => {
    for (const fn of listeners[type] || []) fn();
  };
  return { sb: sandbox, get, store, warnings, writes, fire };
}

(async () => {
  // ---- defaults and stored values ------------------------------------------
  {
    const { sb, get } = load(undefined);
    t(
      'a fresh store answers with the table defaults',
      sb.configRead('enableAdBlock') === true &&
        sb.configRead('thumbnailQualityMode') === 'safe' &&
        sb.configRead('videoShelfOpacity') === 100,
      [sb.configRead('enableAdBlock'), sb.configRead('thumbnailQualityMode')].join(',')
    );
    t('configGetDefault reads the table', sb.configGetDefault('uiTheme') === 'blue-force-field');
    // Top-level const bindings of a vm script are not globals: read them in the context.
    const options = get('configOptions');
    t(
      'configGetDesc reads the label',
      sb.configGetDesc('enableSponsorBlock') === 'SponsorBlock',
      sb.configGetDesc('enableSponsorBlock')
    );
    t(
      'every option has a default and a description',
      options.size > 30 &&
        [...options].every(([, v]) => 'default' in v && typeof v.desc === 'string'),
      String(options.size)
    );
  }
  {
    const { sb } = load({
      enableAdBlock: false,
      thumbnailQualityMode: 'eager',
      unknownLeftover: 1
    });
    t(
      'stored values win over the defaults',
      sb.configRead('enableAdBlock') === false && sb.configRead('thumbnailQualityMode') === 'eager'
    );
    t(
      'keys the store does not know are still defaults',
      sb.configRead('enableSponsorBlock') === true
    );
    report.throws(
      'a leftover key in storage does not become readable',
      () => sb.configRead('unknownLeftover'),
      /unknown config key/
    );
    t(
      'nor is it kept in the live object, which every write serialises',
      !('unknownLeftover' in sb.configGetAll()),
      Object.keys(sb.configGetAll()).length + ' keys'
    );
  }
  {
    const { sb, store } = load({ enableAdBlock: false, unknownLeftover: 1 });
    sb.configWrite('enableOledCareMode', true);
    await wait(40);
    const saved = JSON.parse(store.get('ytaf-configuration'));
    t(
      'the next write stores the known keys only: the leftover is gone from storage',
      !('unknownLeftover' in saved) && saved.enableAdBlock === false,
      Object.keys(saved).join(',')
    );
  }
  {
    const { sb } = load('{not json');
    t('corrupt storage falls back to the defaults', sb.configRead('enableAdBlock') === true);
  }

  // ---- writes, listeners and persistence ----------------------------------
  {
    const { sb, store, warnings, writes, fire } = load(undefined);
    const seen = [];
    sb.configAddChangeListener('enableOledCareMode', (evt) => seen.push(evt.detail));
    sb.configAddChangeListener('enableOledCareMode', () => {
      throw new Error('listener boom');
    });
    const other = [];
    sb.configAddChangeListener('uiTheme', (evt) => other.push(evt.detail.newValue));

    sb.configWrite('enableOledCareMode', true);
    t(
      'configWrite updates the in-memory value at once',
      sb.configRead('enableOledCareMode') === true
    );
    t(
      'listeners get key, newValue and oldValue',
      seen.length === 1 &&
        seen[0].key === 'enableOledCareMode' &&
        seen[0].newValue === true &&
        seen[0].oldValue === false,
      JSON.stringify(seen)
    );
    t(
      'a listener that throws does not stop the write or the others',
      sb.configRead('enableOledCareMode') === true &&
        warnings.some((w) => /listener failed/.test(w)),
      warnings.join(' | ')
    );
    t('listeners on other keys are not called', other.length === 0);
    t('the write is not persisted synchronously', !store.has('ytaf-configuration'));
    await wait(40);
    const persisted = JSON.parse(store.get('ytaf-configuration') || '{}');
    t(
      'the write is persisted after the debounce, with the whole config',
      persisted.enableOledCareMode === true && persisted.enableAdBlock === true,
      store.get('ytaf-configuration') && store.get('ytaf-configuration').slice(0, 80)
    );

    sb.configWrite('enableOledCareMode', true);
    t('writing the same value again does nothing', seen.length === 1);

    // Ending on a value other than the stored one: the burst's write is seen.
    const before = writes.n;
    sb.configWrite('uiTheme', 'classic-red');
    sb.configWrite('uiTheme', 'blue-force-field');
    sb.configWrite('uiTheme', 'classic-red');
    t(
      'three quick writes fire three events',
      other.join(',') === 'classic-red,blue-force-field,classic-red',
      other.join(',')
    );
    await wait(40);
    t(
      'three quick writes are persisted once, as the last state',
      writes.n === before + 1 &&
        JSON.parse(store.get('ytaf-configuration')).uiTheme === 'classic-red',
      `${writes.n - before} write(s)`
    );

    // Leaving the page with a write still due: it is made at once.
    sb.configWrite('uiTheme', 'blue-force-field');
    fire('pagehide');
    t(
      'pagehide writes a pending change at once',
      JSON.parse(store.get('ytaf-configuration')).uiTheme === 'blue-force-field' &&
        writes.n === before + 2,
      `${writes.n - before} write(s)`
    );
    await wait(40);
    t(
      'and the debounce then writes nothing more',
      writes.n === before + 2,
      String(writes.n - before)
    );

    const cb = () => seen.push('late');
    sb.configAddChangeListener('enableOledCareMode', cb);
    sb.configRemoveChangeListener('enableOledCareMode', cb);
    sb.configWrite('enableOledCareMode', false);
    t('a removed listener is not called', !seen.includes('late'));

    report.throws(
      'configAddChangeListener rejects unknown keys',
      () => sb.configAddChangeListener('nope', () => {}),
      /unknown config key/
    );
    report.throws(
      'configWrite rejects unknown keys',
      () => sb.configWrite('nope', 1),
      /unknown config key/
    );
    t(
      'configGetAll is the live object the store mutates',
      sb.configGetAll() === sb.configGetAll() && sb.configGetAll().enableOledCareMode === false
    );
  }

  report.finish();
})();
