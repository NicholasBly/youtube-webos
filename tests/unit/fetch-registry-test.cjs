/**
 * hooks/fetch.ts (the fetch registry) as a unit, its TypeScript source loaded
 * into a vm sandbox with a stubbed fetch. The registry in the bundle is
 * tests/behaviour/hooks-and-fixes-test.cjs.
 *
 * Run: node tests/unit/fetch-registry-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { rejectsWithTypeError } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

/**
 * hooks/fetch.ts in a sandbox whose window.fetch is `originalFetch`;
 * `debugLines`, when given, turns diagnostics on and collects the debug lines.
 */
function loadFetchRegistry(originalFetch, debugLines) {
  const errors = [];
  let fragments = 0;
  const { sandbox, get } = loadSources(
    [path.join(SRC, 'hooks', 'fetch.ts')],
    {
      CustomEvent,
      createLogger: () => ({
        debug: (...args) => {
          if (debugLines) debugLines.push(args.map(String).join(' '));
        },
        info() {},
        warn() {},
        error: (...args) => errors.push(args)
      }),
      isDebugEnabled: () => !!debugLines,
      URL,
      Request,
      Response,
      Symbol,
      TypeError,
      document: {
        location: { href: 'https://www.youtube.com/tv' },
        // Counted: the registry keeps its listeners itself, with no event target.
        createDocumentFragment: () => {
          fragments++;
          return new EventTarget();
        }
      },
      window: { fetch: originalFetch }
    },
    { ts: true }
  );
  return {
    FetchRegistry: get('FetchRegistry'),
    win: sandbox.window,
    errors,
    fragments: () => fragments
  };
}

(async () => {
  // ---- fetch registry as a unit ---------------------------------------------------
  {
    const calls = [];
    const answer = { ok: true, status: 200 };
    const { FetchRegistry, win, fragments } = loadFetchRegistry((resource, init) => {
      calls.push({ resource, init });
      return Promise.resolve(answer);
    });
    const original = win.fetch;
    const registry = FetchRegistry.getInstance();
    t(
      'unit: getInstance hooks window.fetch once',
      win.fetch !== original && FetchRegistry.getInstance() === registry
    );
    t('unit: the listeners are kept in one place, with no event target', fragments() === 0);

    const init = { method: 'POST' };
    const fast = await win.fetch('/youtubei/v1/next', init);
    t(
      'unit: without listeners the call is handed over untouched',
      fast === answer &&
        calls.length === 1 &&
        calls[0].resource === '/youtubei/v1/next' &&
        calls[0].init === init
    );

    const seen = [];
    const onRequest = (evt) => {
      seen.push(evt.detail);
      if (evt.detail.url.pathname === '/blocked') evt.preventDefault();
    };
    registry.addEventListener('request', onRequest);
    const passed = await win.fetch('/youtubei/v1/browse');
    t(
      'unit: a request listener sees the url resolved against the page',
      passed === answer &&
        seen.length === 1 &&
        seen[0].url.href === 'https://www.youtube.com/youtubei/v1/browse' &&
        seen[0].resource === '/youtubei/v1/browse',
      seen[0] && seen[0].url.href
    );
    t(
      'unit: a cancelled request rejects with TypeError and never reaches the original',
      (await rejectsWithTypeError(win.fetch('https://www.youtube.com/blocked'))) &&
        calls.length === 2
    );

    registry.removeEventListener('request', onRequest);
    await win.fetch('/blocked');
    t(
      'unit: after removing the listener the fast path is back',
      seen.length === 2 && calls.length === 3
    );
  }

  // ---- listeners as an event target keeps them ----
  {
    const answer = { ok: true, status: 200 };
    const { FetchRegistry, win, errors } = loadFetchRegistry(() => Promise.resolve(answer));
    const registry = FetchRegistry.getInstance();
    const order = [];
    const twice = () => order.push('twice');
    registry.addEventListener('request', twice);
    registry.addEventListener('request', twice);
    const once = () => {
      order.push('once');
      registry.removeEventListener('request', once);
    };
    registry.addEventListener('request', once);
    registry.addEventListener('request', () => {
      order.push('throws');
      throw new Error('listener bug');
    });
    const late = () => order.push('late');
    registry.addEventListener('request', () => {
      order.push('adds');
      registry.addEventListener('request', late);
    });
    registry.addEventListener('request', () => order.push('last'));
    const res = await win.fetch('/youtubei/v1/next');
    t(
      'listeners: each runs once in the order added, one added twice included',
      order.join(',') === 'twice,once,throws,adds,last',
      order.join(',')
    );
    t(
      'listeners: one that throws is logged and the request goes on',
      res === answer && errors.length === 1 && /listener bug/.test(String(errors[0])),
      String(errors.length)
    );
    order.length = 0;
    await win.fetch('/youtubei/v1/next');
    t(
      'listeners: one removed while running and one added while running count from the next request',
      order.join(',') === 'twice,throws,adds,last,late',
      order.join(',')
    );
    const skipped = [];
    const victim = () => skipped.push('victim');
    registry.addEventListener('request', () => registry.removeEventListener('request', victim));
    registry.addEventListener('request', victim);
    await win.fetch('/youtubei/v1/next');
    t('listeners: one removed by an earlier one is not called', skipped.length === 0);
  }

  // ---- diagnostics: the request is logged, its body is not read ----
  {
    const lines = [];
    let clones = 0;
    const res = new Response('x'.repeat(100), { status: 200 });
    res.clone = () => {
      clones++;
      return Response.prototype.clone.call(res);
    };
    const { FetchRegistry, win } = loadFetchRegistry(() => Promise.resolve(res), lines);
    FetchRegistry.getInstance();
    const got = await win.fetch('https://www.youtube.com/youtubei/v1/next');
    t(
      'diagnostics: the answer is handed back without its body being read',
      got === res && clones === 0 && !res.bodyUsed,
      clones + ' clone(s)'
    );
    t(
      'diagnostics: the request and the status are logged',
      lines.some((l) => l.indexOf('youtubei/v1/next') !== -1) &&
        lines.some((l) => /\b200\b/.test(l)),
      lines.join(' | ')
    );
  }

  report.finish();
})();
