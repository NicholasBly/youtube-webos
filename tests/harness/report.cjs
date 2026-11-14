/**
 * Shared result reporting for the test scripts.
 *
 * Every script counts with the same `check`, prints the same "N passed, M failed"
 * summary and exits 1 when anything failed, so tests/run-all.mjs can rely on the
 * exit code alone and a reader sees one format everywhere.
 *
 *   const { createReport } = require('../harness/report.cjs');
 *   const report = createReport();
 *   report.check('bundle loads', !threw, err && err.message);
 *   report.eq('three rows', rows.length, 3);
 *   report.near('the width', width, 33.3333333);   // within 1e-6
 *   report.throws('rejects an unknown key', () => read('nope'), /unknown config key/);
 *   report.note('legacy bundle: 230398 bytes');   // shown under the script's name
 *   report.pass('name'); report.fail('name', extra);   // a check decided elsewhere
 *   report.finish();                              // prints the summary, exits
 *
 * `quiet: true` prints failures only, for suites with hundreds of fine-grained
 * checks (polyfill-conformance). `addFinishCheck(fn)` registers a check that
 * every report runs before its summary; the page harness uses it to fail a
 * script whose pages logged errors.
 */
'use strict';

const finishChecks = [];

/** Registers `fn(check)` to run before every report's summary. */
function addFinishCheck(fn) {
  finishChecks.push(fn);
}

function createReport(options) {
  const quiet = !!(options && options.quiet);
  let passed = 0;
  let failed = 0;

  function pass(name) {
    passed++;
    if (!quiet) console.log('PASS ' + name);
  }

  function fail(name, extra) {
    failed++;
    console.log('FAIL ' + name + (extra ? '\n     ' + extra : ''));
  }

  function check(name, ok, extra) {
    if (ok) pass(name);
    else fail(name, extra);
    return !!ok;
  }

  /** `actual === expected`, with both shown on failure. */
  function eq(name, actual, expected) {
    return check(
      name,
      actual === expected,
      `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
    );
  }

  /** Within 1e-6 of `expected`. */
  function near(name, actual, expected) {
    return check(name, Math.abs(actual - expected) < 1e-6, `got ${actual}, want ${expected}`);
  }

  /** `fn` throws, and the message matches `pattern` when one is given. */
  function throws(name, fn, pattern) {
    let error = null;
    try {
      fn();
    } catch (e) {
      error = e;
    }
    const ok = !!error && (!pattern || pattern.test(error.message));
    return check(name, ok, error ? 'threw ' + error.message : 'did not throw');
  }

  /** A line of information under the script's name in the suite output. */
  function note(text) {
    // tests/run-all.mjs shows the lines indented by five spaces.
    console.log('     ' + text);
  }

  function summary() {
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    return failed;
  }

  function finish() {
    for (const fn of finishChecks) fn(check);
    summary();
    process.exit(failed ? 1 : 0);
  }

  return { check, eq, near, throws, note, pass, fail, finish };
}

module.exports = { createReport, addFinishCheck };
