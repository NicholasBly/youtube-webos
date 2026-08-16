/**
 * Counts forced-layout reads caused by spatial-navigation-polyfill.js.
 *
 * jsdom cannot TIME a layout (its getBoundingClientRect is a stub), but it can
 * count the calls - and on Chromium 38 each uncached getBoundingClientRect on a
 * dirty tree is a synchronous layout flush. Call count is the honest proxy.
 *
 * Two things are measured:
 *   A. app-wide focus traffic: the polyfill's focusin listener does one
 *      getBoundingClientRect per focus change ANYWHERE in YouTube, purely to
 *      serve findSearchOrigin(), which is only reachable from navigate().
 *   B. one navigate() call from the options panel: ui.js calls navigate(dir)
 *      directly rather than through the polyfill's own keydown wrapper, which
 *      is the only place mapOfBoundRect is armed - so the per-navigation rect
 *      cache never applies to the calls that actually happen.
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

// Count every layout read, before the bundle can capture a reference.
let rects = 0, styles = 0;
const realRect = win.Element.prototype.getBoundingClientRect;
win.Element.prototype.getBoundingClientRect = function () {
  rects++;
  return { top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 };
};
const realStyle = win.getComputedStyle;
win.getComputedStyle = function (...a) { styles++; return realStyle.apply(win, a); };

win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
  enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
  enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
}));
applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

setTimeout(() => {
  const app = win.document.querySelector('ytlr-app');

  // --- A. app-wide focus traffic (a YouTube shelf, nothing to do with us) ---
  const tiles = [];
  for (let i = 0; i < 30; i++) {
    const b = win.document.createElement('div');
    b.setAttribute('tabindex', '0');
    b.textContent = 'Tile ' + i;
    app.appendChild(b);
    tiles.push(b);
  }
  rects = 0; styles = 0;
  const FOCUS_MOVES = 30;
  for (let i = 0; i < FOCUS_MOVES; i++) tiles[i].focus();
  const focusRects = rects;

  // --- B. one navigate() from an options-panel-shaped tree ---
  const panel = win.document.createElement('div');
  panel.setAttribute('tabindex', '0');
  const rows = [];
  for (let i = 0; i < 50; i++) {
    const row = win.document.createElement('div');
    row.setAttribute('tabindex', '0');
    row.className = 'ytaf-ui-row';
    const label = win.document.createElement('label');
    label.textContent = 'Setting ' + i;
    row.appendChild(label);
    panel.appendChild(row);
    rows.push(row);
  }
  win.document.body.appendChild(panel);
  rows[10].focus();

  rects = 0; styles = 0;
  // jsdom has no layout engine, so elementFromPoint / scrollBy are missing.
  // Stub them so navigate() can run its full candidate search.
  if (!win.document.elementFromPoint) win.document.elementFromPoint = () => rows[10];
  win.Element.prototype.scrollBy = win.Element.prototype.scrollBy || function () {};
  try { win.navigate('down'); } catch (e) { console.log('navigate threw:', e.message, '\n', (e.stack||'').split('\n')[1]); }
  const navRects = rects, navStyles = styles;

  // Same traffic again, but with the panel "open" (trackFocus armed), which is
  // the only time the bookkeeping is actually needed.
  win.__spatialNavigation__.trackFocus = true;
  rects = 0;
  for (let i = 0; i < FOCUS_MOVES; i++) tiles[i].blur(), tiles[i].focus();
  const focusRectsArmed = rects;
  win.__spatialNavigation__.trackFocus = false;

  console.log(`A. ${FOCUS_MOVES} focus moves on a YouTube shelf (panel closed):`);
  console.log(`     getBoundingClientRect calls: ${focusRects}   (${(focusRects / FOCUS_MOVES).toFixed(2)} per focus change)`);
  console.log(`   same ${FOCUS_MOVES} focus moves with the panel open (armed):`);
  console.log(`     getBoundingClientRect calls: ${focusRectsArmed}`);
  console.log(`\nB. one navigate('down') across a 50-row settings panel:`);
  console.log(`     getBoundingClientRect calls: ${navRects}`);
  console.log(`     getComputedStyle calls:      ${navStyles}`);
  console.log(`\nJSON:${JSON.stringify({ focusRects, focusRectsArmed, navRects, navStyles })}`);
  process.exit(0);
}, 500);
