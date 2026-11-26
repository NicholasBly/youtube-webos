/**
 * core/fetch-timeout as a unit in a vm sandbox, with and without an
 * AbortController (webOS 3 and 4 have none): a request that answers in time,
 * an error status (no body read), a body that stalls after the headers, one
 * that passes its deadline, and one dropped early by abort(), whose answer
 * must not reach the caller either way.
 *
 * Run: node tests/unit/core-fetch-timeout-test.cjs
 */
'use strict';

const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { wait } = require('../harness/fixtures.cjs');
const { CORE } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

/** A fetch whose answers the test gives: every call is recorded with its resolve. */
function heldFetch() {
  const calls = [];
  const fetch = (url, options) =>
    new Promise((resolve, reject) => {
      const call = { url, signal: options && options.signal, resolve };
      if (call.signal) {
        call.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted by signal'), { name: 'AbortError' }))
        );
      }
      calls.push(call);
    });
  return { fetch, calls };
}

function load(withController) {
  const held = heldFetch();
  const { sandbox } = loadSources([CORE('fetch-timeout.js')], {
    HAS_ABORT_CONTROLLER: withController,
    AbortController,
    fetch: held.fetch,
    setTimeout,
    clearTimeout,
    Promise
  });
  return { fetchJson: sandbox.fetchJsonWithTimeout, calls: held.calls };
}

const settle = (p) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, name: error.name, message: error.message })
  );

(async () => {
  for (const withController of [true, false]) {
    const label = withController ? 'with AbortController' : 'without AbortController';

    // An answer in time is handed through, its body parsed.
    {
      const { fetchJson, calls } = load(withController);
      const r = fetchJson('https://api.test/a', 200);
      calls[0].resolve({ ok: true, status: 200, json: async () => ({ tag: 'answer' }) });
      const out = await settle(r.promise);
      t(
        `${label}: an answer in time is handed through with its body`,
        out.ok &&
          out.value.ok === true &&
          out.value.status === 200 &&
          out.value.data.tag === 'answer',
        JSON.stringify(out)
      );
      t(
        `${label}: the request carries a signal only when the engine has a controller`,
        !!calls[0].signal === withController
      );
    }

    // An error status: no body is read.
    {
      const { fetchJson, calls } = load(withController);
      const r = fetchJson('https://api.test/e', 200);
      let read = false;
      calls[0].resolve({
        ok: false,
        status: 404,
        json: async () => {
          read = true;
          return {};
        }
      });
      const out = await settle(r.promise);
      t(
        `${label}: an error status comes back as such, its body unread`,
        out.ok &&
          out.value.ok === false &&
          out.value.status === 404 &&
          out.value.data === null &&
          !read,
        JSON.stringify(out)
      );
    }

    // The headers come in time and the body stalls: the deadline covers the body.
    {
      const { fetchJson, calls } = load(withController);
      const r = fetchJson('https://api.test/s', 30);
      calls[0].resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
      const out = await Promise.race([settle(r.promise), wait(300).then(() => 'pending')]);
      t(
        `${label}: a body that stalls after the headers runs into the deadline`,
        out !== 'pending' && out.message === 'timeout',
        JSON.stringify(out)
      );
    }

    // Past the deadline: a timeout error, and a late answer is not handed out.
    {
      const { fetchJson, calls } = load(withController);
      const r = fetchJson('https://api.test/b', 30);
      const out = await settle(r.promise);
      eq(`${label}: past the deadline the promise rejects with timeout`, out.message, 'timeout');
      calls[0].resolve({ ok: true, json: async () => ({}) });
    }

    // abort(): the promise rejects at once as an AbortError, the answer is dropped.
    {
      const { fetchJson } = load(withController);
      const r = fetchJson('https://api.test/c', 5000);
      const outcome = settle(r.promise);
      r.abort();
      const raced = await Promise.race([outcome, wait(50).then(() => 'pending')]);
      t(
        `${label}: abort() rejects the promise as an AbortError`,
        raced !== 'pending' && raced.ok === false && raced.name === 'AbortError',
        JSON.stringify(raced)
      );
    }
  }

  report.finish();
})();
