/**
 * End-to-end benchmark of the shipped bundle's JSON.parse / JSON.stringify
 * hooks. Loads dist/webOSUserScripts/userScript.js into jsdom, captures the
 * native implementations before the bundle installs its hooks, then times
 * hooked vs native on realistic YouTube payloads.
 *
 * Usage: node bench/hook-bench.cjs [bundle] [legacy|modern] [label]
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');
const { makeBrowse, makePlayer, makeStringifyBody } = require('./gen-payload.cjs');

const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const legacy = process.argv[3] !== 'modern';
const label = process.argv[4] || (legacy ? 'legacy' : 'modern');

const vc = new VirtualConsole(); // swallow the bundle's console noise
const dom = new JSDOM(
  `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>`,
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: vc,
    pretendToBeVisual: true }
);
const win = dom.window;
setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
win.launchParams = JSON.stringify({});
win.__ytaf_debug__ = false;
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (id) => win.clearTimeout(id);
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
if (legacy) applyChrome38Downgrade(win);

const nativeParse = win.JSON.parse;
const nativeStringify = win.JSON.stringify;

win.eval(fs.readFileSync(bundlePath, 'utf8'));

// Turn on every filter so the hook does its maximum work (the worst case a
// user can actually configure).
const cfg = JSON.parse(win.localStorage.getItem('ytaf-configuration') || '{}');
Object.assign(cfg, {
  enableAdBlock: true, enableTrackingBlock: true, removeGlobalShorts: true,
  removeTopLiveGames: true, removeMostRelevant: true, hideGuestSignInPrompts: true,
  hideEndcards: true, enableLegacyEmojiFix: legacy
});
win.localStorage.setItem('ytaf-configuration', JSON.stringify(cfg));

setTimeout(() => {
  const hookedParse = win.JSON.parse;
  const hookedStringify = win.JSON.stringify;
  if (hookedParse === nativeParse) { console.log('WARNING: JSON.parse not hooked'); }

  const browseText = nativeStringify(makeBrowse());
  const playerText = nativeStringify(makePlayer());
  const smallText = nativeStringify({ a: 1, b: [1, 2, 3] });
  const bodyObj = makeStringifyBody();
  const noCtxObj = { logs: Array.from({ length: 30 }, (_, i) => ({ id: i, t: Date.now(), nested: { a: { b: { c: i } } } })) };

  const rows = [];

  // Interleave hooked and native measurements and take the median of several
  // reps: run-to-run JIT/GC drift on a single pass was larger than the effect
  // being measured.
  const REPS = 7;
  function once(fn, iters) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) fn();
    return Number(process.hrtime.bigint() - t0) / 1e6 / iters;
  }
  function median(a) { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; }

  function compare(name, hookedFn, nativeFn, iters) {
    for (let i = 0; i < 50; i++) { hookedFn(); nativeFn(); }   // warm both
    const hs = [], ns = [];
    for (let r = 0; r < REPS; r++) {
      hs.push(once(hookedFn, iters));
      ns.push(once(nativeFn, iters));
    }
    const h = median(hs), n = median(ns);
    rows.push({ name, hooked: h, native: n, overheadMs: h - n });
  }

  compare('parse browse 150KB', () => hookedParse(browseText), () => nativeParse(browseText), 60);
  compare('parse player 10KB', () => hookedParse(playerText), () => nativeParse(playerText), 300);
  compare('parse small (<500B)', () => hookedParse(smallText), () => nativeParse(smallText), 3000);
  compare('stringify player body', () => hookedStringify(bodyObj), () => nativeStringify(bodyObj), 1500);
  compare('stringify no-ctx obj', () => hookedStringify(noCtxObj), () => nativeStringify(noCtxObj), 1500);

  console.log(`\n=== ${label} ===`);
  console.log('operation                 hooked(ms)  native(ms)   overhead      x native');
  for (const r of rows) {
    console.log(
      r.name.padEnd(24),
      r.hooked.toFixed(4).padStart(10),
      r.native.toFixed(4).padStart(11),
      (r.overheadMs.toFixed(4) + ' ms').padStart(12),
      ((r.hooked / r.native).toFixed(2) + 'x').padStart(12)
    );
  }
  // Machine-readable line for diffing runs
  console.log('JSON:' + JSON.stringify(rows.map((r) => [r.name, +r.hooked.toFixed(5), +r.native.toFixed(5)])));
  process.exit(0);
}, 500);
