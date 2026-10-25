/**
 * core/log.js as a unit in a vm sandbox: the debug gate on debug() and info(),
 * warn() and error() always. The tagged lines of the bundle are checked in
 * tests/smoke/smoke.cjs.
 *
 * Run: node tests/unit/core-log-test.cjs
 */
'use strict';

const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { CORE, storageStub } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/log.js as a unit --------------------------------------------------------------
  {
    const loadLog = (windowObject) => {
      const out = { log: [], info: [], warn: [], error: [] };
      const consoleStub = {};
      for (const level of Object.keys(out)) {
        consoleStub[level] = (...a) => out[level].push(a.join(' '));
      }
      const { sandbox } = loadSources([CORE('log.js')], {
        window: windowObject,
        console: consoleStub
      });
      return { sb: sandbox, out, win: windowObject };
    };
    const total = (out) => out.log.length + out.info.length + out.warn.length + out.error.length;

    let r = loadLog({ localStorage: storageStub({}) });
    const log = r.sb.createLogger('Unit');
    t('fresh: diagnostics are off', r.sb.isDebugEnabled() === false);
    log.debug('d1');
    log.info('i1');
    t(
      'debug() and info() print nothing while diagnostics are off',
      total(r.out) === 0,
      JSON.stringify(r.out)
    );
    log.warn('w1', 2);
    log.error('e1');
    t(
      'warn() goes to console.warn and error() to console.error, prefixed with the tag in brackets',
      r.out.warn.join() === '[Unit] w1 2' &&
        r.out.error.join() === '[Unit] e1' &&
        r.out.log.length === 0,
      JSON.stringify(r.out)
    );
    r.win.__ytaf_debug__ = true;
    t(
      'window.__ytaf_debug__ = true turns diagnostics on without a reload',
      r.sb.isDebugEnabled() === true
    );
    log.debug('d2', { a: 1 });
    log.info('i2');
    t(
      'debug() then prints through console.log and info() through console.info, with the prefix',
      r.out.log.join() === '[Unit] d2 [object Object]' && r.out.info.join() === '[Unit] i2',
      JSON.stringify(r.out)
    );
    r.win.__ytaf_debug__ = 'yes';
    t('only the boolean true counts for the window flag', r.sb.isDebugEnabled() === false);
    log.debug('d3');
    t('and debug() is silent again', r.out.log.length === 1);

    r = loadLog({ localStorage: storageStub({ 'ytaf-debug': '1' }) });
    t("stored ytaf-debug = '1' turns diagnostics on at load", r.sb.isDebugEnabled() === true);
    r.sb.createLogger('Stored').debug('x');
    t('and debug() prints', r.out.log.join() === '[Stored] x');
    r.win.localStorage.setItem('ytaf-debug', '0');
    t(
      'the stored flag is read once: clearing it later changes nothing',
      r.sb.isDebugEnabled() === true
    );

    r = loadLog({ localStorage: storageStub({ 'ytaf-debug': 'true' }) });
    t("a stored value other than '1' does not count", r.sb.isDebugEnabled() === false);

    let threw = null;
    try {
      r = loadLog({
        get localStorage() {
          throw new Error('SecurityError');
        }
      });
    } catch (e) {
      threw = e;
    }
    t(
      'a localStorage that throws at load leaves diagnostics off instead of breaking the module',
      threw === null && r.sb.isDebugEnabled() === false,
      threw && threw.message
    );
  }

  report.finish();
})();
