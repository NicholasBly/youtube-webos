/**
 * Behavioural test for spatial navigation: navigate() must pick the same
 * element before and after the caching/gating changes.
 *
 * jsdom has no layout, so getBoundingClientRect is stubbed with a deterministic
 * grid derived from each element's data-x/data-y/data-w/data-h attributes.
 * That makes the geometry real from the algorithm's point of view while
 * staying reproducible.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';

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

win.Element.prototype.getBoundingClientRect = function () {
  const x = +(this.getAttribute && this.getAttribute('data-x') || 0);
  const y = +(this.getAttribute && this.getAttribute('data-y') || 0);
  const w = +(this.getAttribute && this.getAttribute('data-w') || 0);
  const h = +(this.getAttribute && this.getAttribute('data-h') || 0);
  return { x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
};
win.Element.prototype.scrollBy = function () {};

win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
  enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
  enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
}));
applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

setTimeout(() => {
  const d = win.document;
  // A 4x4 grid of focusable cells, laid out on a deterministic geometry.
  const grid = d.createElement('div');
  grid.id = 'grid';
  grid.setAttribute('data-x', '0'); grid.setAttribute('data-y', '0');
  grid.setAttribute('data-w', '800'); grid.setAttribute('data-h', '400');
  const cells = {};
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = d.createElement('div');
      cell.id = `c${r}${c}`;
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('data-x', String(c * 200));
      cell.setAttribute('data-y', String(r * 100));
      cell.setAttribute('data-w', '180');
      cell.setAttribute('data-h', '80');
      cell.textContent = `cell ${r},${c}`;
      grid.appendChild(cell);
      cells[`${r}${c}`] = cell;
    }
  }
  d.body.appendChild(grid);
  // isVisible() -> hitTest() probes three points per candidate; implement
  // elementFromPoint against the same synthetic geometry so visibility is real.
  d.elementFromPoint = (px, py) => {
    let hit = null;
    for (const k in cells) {
      const el = cells[k];
      const r = el.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) hit = el;
    }
    return hit || d.body;
  };
  // documentElement dimensions bound hitTest's early reject.
  Object.defineProperty(d.documentElement, 'clientWidth', { value: 1920, configurable: true });
  Object.defineProperty(d.documentElement, 'clientHeight', { value: 1080, configurable: true });

  win.__spatialNavigation__.trackFocus = true;

  const cases = [
    ['11', 'right', 'c12'], ['11', 'left', 'c10'],
    ['11', 'down',  'c21'], ['11', 'up',   'c01'],
    ['00', 'right', 'c01'], ['00', 'down', 'c10'],
    ['33', 'left',  'c32'], ['33', 'up',   'c23'],
    ['22', 'right', 'c23'], ['22', 'up',   'c12'],
    ['30', 'right', 'c31'], ['03', 'down', 'c13']
  ];

  let pass = 0, fail = 0;
  for (const [from, dir, expect] of cases) {
    cells[from].focus();
    try { win.navigate(dir); } catch (e) {
      fail++; console.log(`FAIL c${from} ${dir}: threw ${e.message}`); continue;
    }
    const got = d.activeElement && d.activeElement.id;
    if (got === expect) { pass++; console.log(`PASS c${from} ${dir.padEnd(5)} -> ${got}`); }
    else { fail++; console.log(`FAIL c${from} ${dir.padEnd(5)} -> got ${got}, expected ${expect}`); }
  }

  // Caches must not leak between navigations: move a cell and navigate again.
  cells['11'].focus();
  win.navigate('right');
  const before = d.activeElement.id;
  cells['12'].setAttribute('data-x', '2000');   // shove it off to the right
  cells['11'].focus();
  win.navigate('right');
  const after = d.activeElement.id;
  if (before === 'c12' && after !== 'c12') { pass++; console.log(`PASS cache does not leak across navigations (${before} -> ${after})`); }
  else { fail++; console.log(`FAIL stale cache: ${before} -> ${after}`); }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
