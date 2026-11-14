/**
 * Times the bundle's JSON.parse / JSON.stringify hooks against the natives on
 * realistic YouTube payloads, with every filter on (the most work a user can
 * configure). A measurement, not a check: run it before and after a change
 * and compare the rows.
 *
 * Run after `npm run build`: node tests/bench/hook-bench.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { makeBrowse, makePlayer, makeStringifyBody } = require('../harness/gen-payload.cjs');

const legacy = flavour === 'legacy';

const page = createPage({
  ua: legacy ? 'webos3' : 'webos23',
  raf: 'timeout',
  config: {
    enableTrackingBlock: true,
    removeGlobalShorts: true,
    removeTopLiveGames: true,
    removeMostRelevant: true,
    hideGuestSignInPrompts: true,
    hideEndcards: true,
    enableLegacyEmojiFix: legacy
  }
});
const { win, NS: nativeStringify, NP: nativeParse } = page;

setTimeout(() => {
  const hookedParse = win.JSON.parse;
  const hookedStringify = win.JSON.stringify;
  if (hookedParse === nativeParse) console.log('WARNING: JSON.parse not hooked');

  const browseText = nativeStringify(makeBrowse());
  const playerText = nativeStringify(makePlayer());
  const smallText = nativeStringify({ a: 1, b: [1, 2, 3] });
  const bodyObj = makeStringifyBody();
  const noCtxObj = {
    logs: Array.from({ length: 30 }, (_, i) => ({
      id: i,
      t: Date.now(),
      nested: { a: { b: { c: i } } }
    }))
  };
  // An InnerTube body that is not a player request: a context, no videoId.
  const ctxNoPlayerObj = {
    context: bodyObj.context,
    browseId: 'FEwhat_to_watch',
    logs: noCtxObj.logs
  };

  // Hooked and native runs are interleaved and the median of several reps is
  // taken: the run-to-run JIT and GC drift of one pass is larger than the
  // effect being measured.
  const REPS = 7;
  const once = (fn, iters) => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    return Number(process.hrtime.bigint() - t0) / 1e6 / iters;
  };
  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const rows = [];
  const compare = (name, hookedFn, nativeFn, iters) => {
    for (let i = 0; i < 50; i++) {
      hookedFn();
      nativeFn();
    }
    const hs = [];
    const ns = [];
    for (let r = 0; r < REPS; r++) {
      hs.push(once(hookedFn, iters));
      ns.push(once(nativeFn, iters));
    }
    rows.push({ name, hooked: median(hs), native: median(ns) });
  };

  compare(
    'parse browse 150KB',
    () => hookedParse(browseText),
    () => nativeParse(browseText),
    60
  );
  compare(
    'parse player 10KB',
    () => hookedParse(playerText),
    () => nativeParse(playerText),
    300
  );
  compare(
    'parse small (<500B)',
    () => hookedParse(smallText),
    () => nativeParse(smallText),
    3000
  );
  compare(
    'stringify player body',
    () => hookedStringify(bodyObj),
    () => nativeStringify(bodyObj),
    1500
  );
  compare(
    'stringify no-ctx obj',
    () => hookedStringify(noCtxObj),
    () => nativeStringify(noCtxObj),
    1500
  );
  compare(
    'stringify ctx, no player',
    () => hookedStringify(ctxNoPlayerObj),
    () => nativeStringify(ctxNoPlayerObj),
    1500
  );

  console.log(`\n=== JSON hooks, ${flavour} bundle ===`);
  console.log('operation                 hooked(ms)  native(ms)   overhead      x native');
  for (const r of rows) {
    console.log(
      r.name.padEnd(24),
      r.hooked.toFixed(4).padStart(10),
      r.native.toFixed(4).padStart(11),
      ((r.hooked - r.native).toFixed(4) + ' ms').padStart(12),
      ((r.hooked / r.native).toFixed(2) + 'x').padStart(12)
    );
  }
  process.exit(0);
}, 500);
