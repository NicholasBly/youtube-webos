/**
 * The launcher page (dist/index.js) builds the YouTube URL from the launch
 * parameters, each build's under the oldest engine it runs on: the legacy one
 * under a simulated Chromium 38, the webOS 22+ one under Chrome 87.
 *
 * Run: node tests/smoke/launch-test.cjs [index.js] [legacy|modern]   (default dist/index.js, legacy)
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
// The launcher page under test: the first argument, else dist/index.js.
const LAUNCHER =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ROOT + '/dist/index.js';
const { applyChrome38Downgrade, applyChrome87Downgrade } = require('../harness/chrome38-env.cjs');

const modern = process.argv[3] === 'modern';

// Three shapes of launch parameters, enough to show the launcher runs under
// the downgrade; the URL grammar itself is tests/unit/core-launch-test.cjs.
const cases = [
  [{}, ['env_forceFullAnimation=1', 'env_enableWebSpeech=1', 'env_enableVoice=1']],
  [{ contentTarget: 'https://www.youtube.com/tv?v=abc&t=5' }, ['v=abc', 't=5']],
  [
    { contentTarget: { intent: 'PlayContent', intentParam: 'lofi beats' } },
    ['inApp=true', 'vs=9', 'va=play', 'launch=voice', 'vq=lofi+beats']
  ]
];

const { createReport } = require('../harness/report.cjs');
const report = createReport();
for (const [params, expects] of cases) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://example.com/',
    runScripts: 'outside-only'
  });
  const w = dom.window;
  w.launchParams = JSON.stringify(params);

  // jsdom's window.location is non-configurable, so shadow `window` inside the
  // bundle with a proxy that forwards everything except location; methods are
  // bound to the real window.
  w.eval(`
    var __href = null;
    var __fakeLocation = { get href() { return 'https://example.com/'; },
                           set href(v) { __href = v; } };
    var __fakeWindow = new Proxy(window, {
      get: function (t, k) {
        if (k === 'location') return __fakeLocation;
        var v = t[k];
        // Constructors (URL, for one) keep their prototype: the polyfills extend it.
        return typeof v === 'function' && !('prototype' in v) ? v.bind(t) : v;
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
    function __getHref() { return __href; }
  `);

  // Downgrade only after the Proxy shim is built (Proxy itself is Chrome 49).
  if (modern) applyChrome87Downgrade(w);
  else applyChrome38Downgrade(w);

  try {
    w.eval('(function(window){' + fs.readFileSync(LAUNCHER, 'utf8') + '})(__fakeWindow)');
  } catch (e) {
    report.fail(JSON.stringify(params).slice(0, 58), 'threw ' + e.message);
    continue;
  }
  const href = w.eval('__getHref()');

  const missing = expects.filter((e) => !href || href.indexOf(e) === -1);
  report.check(
    JSON.stringify(params).slice(0, 58),
    missing.length === 0,
    `href    ${href}\n     missing ${missing.join(', ')}`
  );
}
report.finish();
