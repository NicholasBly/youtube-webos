/**
 * SponsorBlock api.js as a unit, with fetchJsonWithTimeout stubbed:
 * fetchVideoSegments asks for the video's hash prefix and the categories by
 * the API's names, primary server first and the fallback after a failure, and
 * answers with the well-formed segments of that one video (music_offtopic
 * under the settings' name), [] when it has none, or null when no list came
 * back.
 *
 * Run: node tests/unit/sponsorblock-api-test.cjs
 */
'use strict';

const path = require('path');
const sha256 = require('tiny-sha256');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const SB_DIR = path.join(SRC, 'features', 'sponsorblock');
const ID = 'dQw4w9WgXcQ';
const PREFIX = sha256(ID).substring(0, 4);

const ok = (data) => ({ ok: true, status: 200, data });
const status = (code) => ({ ok: false, status: code, data: null });
const good = (start, end) => ({ category: 'sponsor', actionType: 'skip', segment: [start, end] });

/**
 * The module with each server answering as `answers` says: a response, or
 * 'throw' for a network failure. `sb` is the handler's part the module reads.
 */
function load(answers) {
  const requests = [];
  const sb = { isDestroyed: false, abortFetch: null, warnings: [], debugs: [] };
  sb.logger = {
    warn: (...a) => sb.warnings.push(a.join(' ')),
    debug: (...a) => sb.debugs.push(a.join(' ')),
    error() {},
    info() {}
  };
  const { sandbox, get } = loadSources(
    [path.join(SB_DIR, 'constants.js'), path.join(SB_DIR, 'api.js')],
    {
      // What constants.js reads from core/config at load.
      configGetAll: () => ({}),
      segmentTypes: { sponsor: {} },
      sha256,
      fetchJsonWithTimeout: (url) => {
        requests.push(url);
        const API = get('API');
        const answer = url.indexOf(API.primary) === 0 ? answers.primary : answers.fallback;
        const abort = () => {};
        if (answers.destroyDuring) sb.isDestroyed = true;
        return {
          // What the handler holds while the request is out, read before it answers.
          promise: Promise.resolve().then(() => {
            sb.abortDuring = typeof sb.abortFetch;
            if (answer === 'throw') throw new TypeError('Failed to fetch');
            return answer;
          }),
          abort
        };
      }
    }
  );
  return { fetch: () => sandbox.fetchVideoSegments(sb, ID), sb, requests, API: get('API') };
}

(async () => {
  // ---- the request and the answer for this video ----
  {
    const m = load({
      primary: ok([
        { videoID: 'otherVideo1', segments: [good(1, 2)] },
        {
          videoID: ID,
          segments: [
            good(30, 40),
            null,
            { category: 7, segment: [1, 2] },
            { category: 'sponsor', segment: ['10', 20] },
            { category: 'sponsor' },
            good(5, 9)
          ]
        }
      ])
    });
    const segments = await m.fetch();
    t(
      'one request, to the primary server, for the hash prefix of the id',
      m.requests.length === 1 &&
        m.requests[0].indexOf(`${m.API.primary}/skipSegments/${PREFIX}?categories=`) === 0,
      m.requests.join(' | ')
    );
    eq(
      "the answer is this video's entry, without its malformed segments",
      JSON.stringify(segments),
      JSON.stringify([good(30, 40), good(5, 9)])
    );
    t(
      'the request can be aborted while it is out, and not after',
      m.sb.abortDuring === 'function' && m.sb.abortFetch === null,
      m.sb.abortDuring
    );
  }
  {
    const m = load({ primary: ok([{ videoID: 'otherVideo1', segments: [good(1, 2)] }]) });
    const segments = await m.fetch();
    t(
      'no entry for the video: an empty list, logged as such',
      Array.isArray(segments) && segments.length === 0 && m.sb.debugs.length === 1,
      JSON.stringify(segments)
    );
  }
  {
    const m = load({ primary: ok([{ videoID: ID, segments: 'none' }]) });
    const segments = await m.fetch();
    t(
      'an entry without a segment list: an empty list',
      Array.isArray(segments) && segments.length === 0
    );
  }

  {
    const m = load({
      primary: ok([
        { videoID: ID, segments: [Object.assign(good(30, 40), { category: 'music_offtopic' })] }
      ])
    });
    const segments = await m.fetch();
    const query = /[?&]categories=([^&]*)/.exec(m.requests[0] || '');
    eq(
      'the categories asked for, by the names the API knows (music_offtopic, exclusive_access)',
      query ? decodeURIComponent(query[1]) : null,
      JSON.stringify([
        'sponsor',
        'intro',
        'outro',
        'interaction',
        'selfpromo',
        'music_offtopic',
        'preview',
        'poi_highlight',
        'filler',
        'hook',
        'exclusive_access'
      ])
    );
    eq(
      "the API's music_offtopic arrives under the settings' name, musicofftopic",
      segments && segments[0] && segments[0].category,
      'musicofftopic'
    );
  }

  // ---- the servers ----
  {
    const m = load({
      primary: status(404),
      fallback: ok([{ videoID: ID, segments: [good(1, 2)] }])
    });
    const segments = await m.fetch();
    t(
      '404 is the API having nothing for the prefix: an empty list, no fallback',
      Array.isArray(segments) && segments.length === 0 && m.requests.length === 1,
      m.requests.join(' | ')
    );
  }
  {
    const m = load({
      primary: status(502),
      fallback: ok([{ videoID: ID, segments: [good(1, 2)] }])
    });
    const segments = await m.fetch();
    t(
      'a failing primary falls back, and the fallback answers',
      m.requests.length === 2 &&
        m.requests[1].indexOf(m.API.fallback) === 0 &&
        segments &&
        segments.length === 1,
      m.requests.join(' | ')
    );
  }
  {
    const m = load({ primary: 'throw', fallback: 'throw' });
    const segments = await m.fetch();
    t(
      'both servers down: null, with a warning that the API was unreachable',
      segments === null && m.requests.length === 2 && /unreachable/.test(m.sb.warnings.join('|')),
      m.sb.warnings.join(' | ')
    );
  }
  {
    const m = load({ primary: ok({ videoID: ID }) });
    const segments = await m.fetch();
    t(
      'an answer that is not a list: null, with a warning',
      segments === null && /not a list|other than a list/.test(m.sb.warnings.join('|')),
      m.sb.warnings.join(' | ')
    );
  }

  // ---- a handler destroyed ----
  {
    const m = load({ primary: ok([{ videoID: ID, segments: [good(1, 2)] }]) });
    m.sb.isDestroyed = true;
    const segments = await m.fetch();
    t('destroyed before: null and no request', segments === null && m.requests.length === 0);
  }
  {
    const m = load({
      primary: ok([{ videoID: ID, segments: [good(1, 2)] }]),
      destroyDuring: true
    });
    const segments = await m.fetch();
    t('destroyed while the request is out: null', segments === null, JSON.stringify(segments));
  }

  report.finish();
})();
