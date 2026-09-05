/**
 * Complexity probe for the spatial-navigation candidate walk.
 *
 * Builds a YouTube-TV-shaped tree (shelf > row > tile, tiles focusable, the
 * wrappers not) at increasing sizes and times one navigate('down') on each.
 * A linear walk keeps ms/candidate flat; a quadratic one makes it climb.
 *
 * Usage: node bench/spatnav-scaling.cjs [bundle] [label]
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const label = process.argv[3] || 'run';

// shelves x tiles-per-shelf. Last entry is the 819 KB home page the TV saw.
const SIZES = [
  [4, 8],
  [8, 8],
  [16, 8],
  [24, 16],
  [42, 32]
];
const WARMUP = 20;
const REPS = 30;
const ROUNDS = 3;

// DOM traffic caused by one navigate(), counted rather than timed - a call
// count is hardware-independent, a jsdom millisecond is not.
const counts = { rect: 0, style: 0, elementFromPoint: 0, contains: 0, getElementsByTagName: 0 };

const dom = new JSDOM(
  '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window;
setUserAgent(win, UA.webos3);
win.launchParams = '{}';
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(0), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (i) => win.clearTimeout(i);

// Deterministic geometry so the distance maths is real, and cheap so the
// numbers reflect the walk rather than jsdom's rect stub.
const ZERO_RECT = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
// Rect precomputed onto the node: reading four data-* attributes per call would
// route through jsdom's NamedNodeMap and cost more than the code under test.
win.Element.prototype.getBoundingClientRect = function () {
  counts.rect++;
  return this.__rect || ZERO_RECT;
};
win.Element.prototype.scrollBy = function () {};
const realContains = win.Node.prototype.contains;
win.Node.prototype.contains = function (o) { counts.contains++; return realContains.call(this, o); };
const realGEBTN = win.Element.prototype.getElementsByTagName;
win.Element.prototype.getElementsByTagName = function (t) { counts.getElementsByTagName++; return realGEBTN.call(this, t); };

// jsdom recomputes the whole cascade on every getComputedStyle, which costs
// ~100x what Chrome's cached lookup does and would otherwise be ~99% of the
// samples here - the profile of an unstubbed run is jsdom's CSS engine, not
// this polyfill. A flat stub keeps the measurement on the polyfill's own JS,
// which is what the change touches.
const FLAT_STYLE = { getPropertyValue: () => '', display: 'block', visibility: 'visible', height: '80px', width: '110px', overflow: 'visible', overflowX: 'visible', overflowY: 'visible' };
win.getComputedStyle = () => { counts.style++; return FLAT_STYLE; };

win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
  enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
  enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
}));
applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

function buildTree(shelves, tilesPer) {
  const d = win.document;
  const root = d.createElement('div');
  root.setAttribute('tabindex', '0');
  let first = null;
  for (let s = 0; s < shelves; s++) {
    // Non-focusable wrappers are what drive the recursive branch of the walk.
    const shelf = d.createElement('ytlr-shelf');
    const row = d.createElement('ytlr-item-section');
    for (let t = 0; t < tilesPer; t++) {
      const tile = d.createElement('div');
      tile.setAttribute('tabindex', '0');
      const x = t * 120, y = s * 90;
      tile.__rect = { x, y, left: x, top: y, right: x + 110, bottom: y + 80, width: 110, height: 80 };
      row.appendChild(tile);
      if (!first) first = tile;
    }
    shelf.appendChild(row);
    root.appendChild(shelf);
  }
  return { root, first };
}

setTimeout(() => {
  win.document.elementFromPoint = () => { counts.elementFromPoint++; return win.document.body; };
  const rows = [];

  for (const [shelves, tilesPer] of SIZES) {
    const { root, first } = buildTree(shelves, tilesPer);
    win.document.body.appendChild(root);
    first.focus();

    for (let w = 0; w < WARMUP; w++) win.navigate('down'); // let the JIT settle

    for (const k in counts) counts[k] = 0;
    win.navigate('down');
    const perNav = Object.assign({}, counts);

    let ms = Infinity;
    for (let round = 0; round < ROUNDS; round++) {
      const t0 = process.hrtime.bigint();
      for (let r = 0; r < REPS; r++) win.navigate('down');
      const took = Number(process.hrtime.bigint() - t0) / 1e6 / REPS;
      if (took < ms) ms = took;
    }

    const n = shelves * tilesPer;
    rows.push({ shelves, tilesPer, n, ms, perNav });
    win.document.body.removeChild(root);
  }

  const base = rows[0];
  console.log(`\n${label}: one navigate('down') over a shelf/row/tile tree\n`);
  console.log('  tiles   shape      ms/navigate   us/tile   vs smallest');
  for (const r of rows) {
    const perTile = (r.ms * 1000) / r.n;
    const growth = (r.ms / base.ms) / (r.n / base.n);
    console.log(
      `  ${String(r.n).padStart(5)}   ${String(r.shelves + 'x' + r.tilesPer).padEnd(8)}` +
      `  ${r.ms.toFixed(3).padStart(10)}  ${perTile.toFixed(3).padStart(8)}` +
      `  ${growth.toFixed(2).padStart(8)}x per tile`
    );
  }
  console.log('\n  DOM calls per navigate()\n');
  console.log('  tiles     rects   styles   elemFromPoint   contains   getElsByTag');
  for (const r of rows) {
    const c = r.perNav;
    console.log(
      `  ${String(r.n).padStart(5)}  ${String(c.rect).padStart(6)}  ${String(c.style).padStart(7)}` +
      `  ${String(c.elementFromPoint).padStart(14)}  ${String(c.contains).padStart(9)}` +
      `  ${String(c.getElementsByTagName).padStart(12)}`
    );
  }
  console.log(`\nJSON:${JSON.stringify({ label, rows })}`);
  process.exit(0);
}, 500);
