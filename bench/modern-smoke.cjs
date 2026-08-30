/**
 * Loads the MODERN bundle in a webOS 25-shaped window and asserts it survives
 * evaluation.
 *
 * This exists because the suite only ever smoke-tested the legacy bundle, and a
 * modern-only crash shipped: spatial-navigation.modern.js seals its API object,
 * ui.js assigned a property that only the legacy polyfill had, and webOS 25 died
 * with "Cannot add property trackFocus, object is not extensible".
 *
 * No Chromium 38 downgrade here - the point is to exercise the code paths that
 * ONLY run on a modern engine (the modern spatial-nav shim, no polyfills.js, no
 * emoji-font.js, no buffer-limit).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(
  `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>
     <div id="ytlr-player__player-container"><video></video></div>
   </ytlr-app></body></html>`,
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: vc, pretendToBeVisual: true });
const win = dom.window;
setUserAgent(win, UA.webos23);   // webOS 23+ -> modern code paths
win.launchParams = JSON.stringify({});
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (id) => win.clearTimeout(id);

let threw = null;
try { win.eval(fs.readFileSync(bundlePath, 'utf8')); } catch (e) { threw = e; }

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); }
};

setTimeout(() => {
  t('modern bundle loads without throwing', !threw,
    threw && (threw.message + ' | ' + (threw.stack || '').split('\n')[1]));
  t('no "not extensible" error', !(threw && /not extensible/.test(threw.message)), threw && threw.message);
  t('no jsdomError during load', errors.length === 0, errors[0]);
  t('JSON.parse hooked', win.JSON.parse.toString().indexOf('native code') === -1);
  t('JSON.stringify hooked', win.JSON.stringify.toString().indexOf('native code') === -1);
  t('spatial navigation installed', !!win.__spatialNavigation__);

  const sn = win.__spatialNavigation__;
  t('__spatialNavigation__ is sealed (as the shim intends)', sn && !Object.isExtensible(sn));
  t('keyMode was applied by ui.js', sn && sn.keyMode === 'NONE', sn && sn.keyMode);
  t('trackFocus exists on the sealed object', sn && 'trackFocus' in sn);
  t('trackFocus was turned off by ui.js', sn && sn.trackFocus === false, sn && String(sn.trackFocus));

  // Writing it must not throw even though the object is sealed.
  let setThrew = null;
  try { sn.trackFocus = true; } catch (e) { setThrew = e; }
  t('trackFocus is writable on the sealed object', !setThrew, setThrew && setThrew.message);
  t('trackFocus round-trips', sn && sn.trackFocus === true);

  // The legacy-only modules must be aliased out of this build.
  const src = fs.readFileSync(bundlePath, 'utf8');
  t('polyfills.js excluded from modern build', src.indexOf('Array.from requires an array-like') === -1);
  t('no bare require() in modern bundle', !/(?:^|[^.\w$])require\s*\(/.test(src));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 600);
