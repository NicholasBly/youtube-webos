/**
 * Screensaver stall nudge: only a resume after a long pause (when a video
 * screensaver can have taken the decoder) gets the seek-in-place nudge;
 * first plays and short pauses are left alone.
 *
 * Usage: node bench/screensaver-test.cjs [dist/webOSUserScripts/userScript.js]
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');
const dom = new JSDOM('<!doctype html><html><body><ytlr-app></ytlr-app></body></html>', { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
const win = dom.window; setUserAgent(win, UA.webos3); win.launchParams = '{}';
win.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} addEventListener() {} };
applyChrome38Downgrade(win);
win.fetch = () => Promise.reject(new Error('offline'));
let now = 1e12; win.Date.now = () => now;
win.eval(fs.readFileSync(process.argv[2] || path.resolve(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8'));
function run(pauseFor) {
  const v = win.document.createElement('video'); win.document.body.appendChild(v);
  let seeks = 0, t = 5;
  Object.defineProperty(v, 'paused', { get: () => false });
  Object.defineProperty(v, 'seeking', { get: () => false });
  Object.defineProperty(v, 'readyState', { get: () => 4 });
  Object.defineProperty(v, 'currentTime', { get: () => t, set: () => { seeks++; } });
  if (pauseFor != null) { v.dispatchEvent(new win.Event('pause')); now += pauseFor; }
  v.dispatchEvent(new win.Event('playing'));
  return new Promise((r) => setTimeout(() => { v.parentNode.removeChild(v); now += 20000; r(seeks); }, 2300));
}
(async () => {
  const first = await run(null), short = await run(5000), long = await run(120000);
  console.log(JSON.stringify({ first, short, long }) + (first === 0 && short === 0 && long === 1 ? '\n1 passed, 0 failed' : '\n0 passed, 1 failed'));
  process.exit(first === 0 && short === 0 && long === 1 ? 0 : 1);
})();
