/**
 * Verifies the --env perf bundle:
 *   1. loads without "require is not defined" (the reported crash)
 *   2. installs __PERF
 *   3. toggles on 0-0-0 within the window, and NOT on fewer/slower presses
 *   4. does NOT toggle on YELLOW (real or synthetic) - YouTube owns that key
 *   5. lets presses 1 and 2 reach ui.js, so a user shortcut bound to 0 survives
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2];
const legacy = process.argv[3] !== 'modern';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));

const dom = new JSDOM(
  '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app><div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: vc, pretendToBeVisual: true }
);
const win = dom.window;
setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
win.launchParams = '{}';
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (i) => win.clearTimeout(i);
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
if (legacy) applyChrome38Downgrade(win);

let threw = null;
try { win.eval(fs.readFileSync(bundlePath, 'utf8')); } catch (e) { threw = e; }

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); }
};

// jsdom (correctly, per spec) makes isTrusted an unforgeable own property on
// every Event, so a harness can never simulate a real remote press. perf_mon
// exposes OPTIONS.requireTrustedKeys for exactly this; the SYNTHETIC_KEY_FLAG
// guard that actually matters stays active and is asserted separately below.
function key(code, synthetic = false) {
  const evt = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'keyCode', { get: () => code, configurable: true });
  Object.defineProperty(evt, 'which', { get: () => code, configurable: true });
  if (synthetic) evt.__ytafSynthetic = true;
  win.document.body.dispatchEvent(evt);
  return evt;
}
// The cluster root is created once and shown/hidden via style.display, so
// look at that rather than counting body children.
function findRoot() {
  const kids = win.document.body.children;
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if (el.tagName === 'YTLR-APP') continue;
    if (el.style && el.style.zIndex && +el.style.zIndex > 1000) return el;
    if (el.textContent && el.textContent.indexOf('tab') !== -1) return el;
  }
  return null;
}
const visible = () => { const r = findRoot(); return !!r && r.style.display !== 'none'; };

setTimeout(() => {
  t('bundle loads without throwing', !threw, threw && String(threw.message));
  t('no "require is not defined"', !(threw && /require is not defined/.test(String(threw.message))),
    threw && String(threw.message));
  t('no jsdomError during load', errors.length === 0, errors[0]);
  t('__PERF installed', !!win.__PERF);
  if (!win.__PERF) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  win.__PERF.options.requireTrustedKeys = false;

  // Find the cluster root by probing before/after a toggle.
  const before = false; // cluster starts hidden

  // 1 press: must NOT toggle
  key(48);
  t('single 0 press does not open cluster', visible() === false);

  // 2 presses: must NOT toggle
  key(48);
  t('two 0 presses do not open cluster', visible() === false);

  // 3rd press within the window: MUST toggle
  key(48);
  t('three 0 presses open the cluster', visible() === true,
    'root=' + (findRoot() ? findRoot().tagName + ' display=' + findRoot().style.display : 'not found') +
    ' bodyKids=' + win.document.body.children.length);

  // 3 more closes it
  key(48); key(48); key(48);
  t('three more 0 presses close the cluster', visible() === false);

  // Synthetic (untrusted) presses must be ignored entirely
  key(48, true); key(48, true); key(48, true);
  t('mod-synthesised 0 presses ignored', visible() === false);

  // YELLOW must never toggle - YouTube owns it, and screensaver-fix fakes it
  key(405); key(405); key(405);
  key(170); key(170, true);
  t('YELLOW never opens the cluster', visible() === false);

  // Presses 1 and 2 must reach a downstream capture listener (ui.js does this)
  let seen = 0;
  win.document.addEventListener('keydown', (e) => { if (e.keyCode === 48) seen++; }, true);
  key(48); key(48);
  t('presses 1-2 propagate to other handlers', seen === 2, 'saw ' + seen);
  key(48); // third consumed
  t('third press is consumed', seen === 2, 'saw ' + seen);

  // Timing out the window resets the counter
  key(48); key(48);
  const st = Date.now();
  while (Date.now() - st < 1600) { /* let the 1.5s window lapse */ }
  const beforeSlow = visible();
  key(48);
  t('presses outside the 1.5s window do not toggle', visible() === beforeSlow);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 600);
