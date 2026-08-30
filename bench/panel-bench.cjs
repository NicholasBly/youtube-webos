/**
 * Measures the cost of building the options panel, which currently happens
 * synchronously inside the keydown handler that opens it. On the webOS 3
 * capture this showed up as a single 170.4 ms call and an fps drop 60 -> 32.
 *
 * Reports wall time and, more usefully for a slow device, the number of DOM
 * elements created per page - element creation and the resulting style/layout
 * work is what actually costs on Chromium 38.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const label = process.argv[3] || 'panel';

const dom = new JSDOM(
  '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window;
setUserAgent(win, UA.webos3);
win.launchParams = '{}';
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };

let rafQ = [];
win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
win.cancelAnimationFrame = () => {};
const pumpFrame = () => { const q = rafQ; rafQ = []; for (const cb of q) cb(Date.now()); };

let created = 0;
const realCreate = win.document.createElement.bind(win.document);
win.document.createElement = function (t) { created++; return realCreate(t); };

win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
  enableAdBlock: true, enableLegacyEmojiFix: true, enableSponsorBlock: true,
  enableReturnYouTubeDislike: true, upgradeThumbnails: false, enableAutoLogin: true
}));
applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

setTimeout(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const GREEN = 404; // shortcut_key_green -> config_menu

  const before = created;
  const t0 = process.hrtime.bigint();
  const evt = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'keyCode', { get: () => GREEN, configurable: true });
  win.document.body.dispatchEvent(evt);
  const openMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const openCreated = created - before;

  const panel = win.document.querySelector('.ytaf-ui-container');
  const visible = !!panel && panel.style.display === 'block';
  const count = (sel) => { const p = panel && panel.querySelector(sel); return p ? p.getElementsByTagName('*').length : 0; };

  console.log(`=== ${label} ===`);
  console.log(`panel visible after the keypress : ${visible}`);
  console.log(`createElement calls IN the handler: ${openCreated}`);
  console.log(`handler wall time                 : ${openMs.toFixed(2)} ms`);

  // Let any deferred build work run.
  const beforeDefer = created;
  for (let f = 0; f < 30; f++) { pumpFrame(); await tick(); }
  console.log(`createElement calls deferred to later frames: ${created - beforeDefer}`);

  console.log(`\nelements per page (after everything settles):`);
  for (const [name, sel] of [['Main', '#ytaf-page-main'], ['SponsorBlock', '#ytaf-page-sponsor'],
                             ['Shortcuts', '#ytaf-page-shortcuts'], ['UI Tweaks', '#ytaf-page-ui-tweaks']]) {
    console.log(`  ${name.padEnd(13)} ${String(count(sel)).padStart(4)}`);
  }
  console.log(`  ${'TOTAL panel'.padEnd(13)} ${String(panel ? panel.getElementsByTagName('*').length : 0).padStart(4)}`);
  console.log(`\nJSON:${JSON.stringify({ openCreated, openMs: +openMs.toFixed(2), deferred: created - beforeDefer, visible })}`);
  process.exit(0);
}, 500);
