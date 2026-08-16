/**
 * Load the built userScript.js in a jsdom page that has been downgraded to a
 * Chrome 38 feature set, with a fake YouTube-TV DOM, and report:
 *   - any exception thrown during evaluation
 *   - whether the app's expected side effects are present
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const legacyMode = process.argv[3] !== 'modern';

const HTML = `<!doctype html><html><head><title>YouTube</title></head>
<body class="WEB_PAGE_TYPE_BROWSE">
<ytlr-app>
  <ytlr-tv-surface-content>
    <ytlr-thumbnail-details style="background-image:url('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')"></ytlr-thumbnail-details>
    <ytlr-thumbnail-details style="background-image:url('https://i.ytimg.com/vi/aQw4w9WgXcQ/mqdefault.jpg')"></ytlr-thumbnail-details>
    <div id="ytlr-player__player-container">
      <video id="v1"></video>
    </div>
    <span>plain text \u200B\uD83D\uDE00\u200C emoji</span>
  </ytlr-tv-surface-content>
</ytlr-app>
</body></html>`;

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(HTML, {
  runScripts: 'outside-only',
  url: 'https://www.youtube.com/tv',
  virtualConsole: vc,
  pretendToBeVisual: true,
});

const win = dom.window;
setUserAgent(win, legacyMode ? UA.webos3 : UA.webos23);

// Minimal webOS/YT host surface the script pokes at.
win.launchParams = JSON.stringify({});
win.webOS = { deviceInfo: (cb) => cb({ modelName: 'sim' }), platformBack: () => {} };
win.__ytaf_debug__ = false;
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (id) => win.clearTimeout(id);
win.XMLHttpRequest = class { open(){} send(){ this.onerror && this.onerror(); } setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };

if (legacyMode) {
  const removed = applyChrome38Downgrade(win);
  console.log(`[env] downgraded ${removed.length} APIs to Chrome 38 baseline`);
}

const code = fs.readFileSync(bundlePath, 'utf8');
let threw = null;
try {
  win.eval(code);
} catch (e) {
  threw = e;
}

// Let deferred work (rAF/timers/microtasks) run.
const done = () => {
  const checks = [];
  const push = (name, ok, extra) => checks.push({ name, ok, extra });

  push('no exception during evaluation', !threw, threw && (threw.stack || String(threw)).split('\n').slice(0, 4).join(' | '));
  push('JSON.parse was hooked', win.JSON.parse.toString().indexOf('native code') === -1);
  push('JSON.stringify was hooked', win.JSON.stringify.toString().indexOf('native code') === -1);
  push('CSS injected by style-loader', win.document.querySelectorAll('style').length > 0,
       'style tags: ' + win.document.querySelectorAll('style').length);
  push('Element#matches polyfilled', typeof win.Element.prototype.matches === 'function');
  push('Node#isConnected polyfilled', 'isConnected' in win.Node.prototype);
  push('spatial navigation installed', !!win.__spatialNavigation__);

  // Exercise the hooked JSON.parse with a realistic YouTube payload.
  let parseOk = true, parseErr = '';
  try {
    const payload = JSON.stringify({
      responseContext: { visitorData: 'x', serviceTrackingParams: [{ service: 'GFEEDBACK' }] },
      contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [
        { shelfRenderer: { title: { runs: [{ text: 'Shorts' }] }, tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS', content: { horizontalListRenderer: { items: [{ tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } }] } } } },
        { adSlotRenderer: { x: 1 } },
        { shelfRenderer: { title: { runs: [{ text: 'Recommended \uD83D\uDE00' }] }, content: { gridRenderer: { items: Array.from ? [] : [] } } } }
      ] } } } } } },
      trackingParams: 'abc'.repeat ? 'abcabcabc' : 'abc',
      padding: 'y'.length ? new Array(600).join('y') : ''
    });
    const out = win.JSON.parse(payload);
    parseOk = !!out && !!out.contents;
  } catch (e) { parseOk = false; parseErr = String(e); }
  push('hooked JSON.parse handles a browse payload', parseOk, parseErr);

  let strOk = true, strErr = '';
  try {
    const body = { context: { client: {} }, videoId: 'abc', playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } } };
    const s = win.JSON.stringify(body);
    strOk = s.indexOf('isInlinePlaybackNoAd') !== -1 && body.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd === undefined;
  } catch (e) { strOk = false; strErr = String(e); }
  push('hooked JSON.stringify injects+restores flag', strOk, strErr);

  push('no console.error / jsdomError', errors.length === 0, errors.slice(0, 3).join(' || '));

  let fail = 0;
  for (const c of checks) {
    if (!c.ok) fail++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.extra ? '' : '\n        -> ' + c.extra}`);
  }
  console.log(`\n${checks.length - fail}/${checks.length} checks passed`);
  process.exit(fail ? 1 : 0);
};

setTimeout(done, 700);
