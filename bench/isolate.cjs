/** Measures the marginal cost of each filter group by toggling config. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');
const { makeBrowse } = require('./gen-payload.cjs');
// Matches the 819 KB HOME_BROWSE response the webOS 3 session actually saw.
const BROWSE_OPTS = { shelves: 42, tilesPer: 32, withEmoji: true };

const combos = [
  ['all off',            {}],
  ['tracking only',      { enableTrackingBlock: true }],
  ['adblock only',       { enableAdBlock: true }],
  ['emoji only',         { enableLegacyEmojiFix: true }],
  ['adblock+shorts',     { enableAdBlock: true, removeGlobalShorts: true }],
  ['TV session config',  { enableAdBlock: true, enableLegacyEmojiFix: true,
                           enableSponsorBlock: true, enableReturnYouTubeDislike: true }],
  ['TV + tracking on',   { enableAdBlock: true, enableLegacyEmojiFix: true, enableTrackingBlock: true }],
  ['everything',         { enableAdBlock: true, enableTrackingBlock: true, removeGlobalShorts: true,
                           removeTopLiveGames: true, removeMostRelevant: true,
                           hideGuestSignInPrompts: true, hideEndcards: true, enableLegacyEmojiFix: true }]
];

const bundle = fs.readFileSync(process.argv[2] || 'dist/webOSUserScripts/userScript.js', 'utf8');
const results = [];
let idx = 0;

function run() {
  if (idx >= combos.length) {
    const base = results[0].ms;
    console.log('\nmarginal cost on an 819 KB HOME_BROWSE response - the size the TV actually saw');
    console.log('config                 parse(ms)   vs all-off');
    for (const r of results) {
      console.log(r.name.padEnd(22), r.ms.toFixed(4).padStart(9),
        (r.ms === base ? '     -' : '+' + (r.ms - base).toFixed(4) + ' ms').padStart(14));
    }
    process.exit(0);
  }
  const [name, cfg] = combos[idx++];
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
  if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (i) => win.clearTimeout(i);
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  const NS = win.JSON.stringify;
  win.localStorage.setItem('ytaf-configuration', NS(Object.assign({
    enableAdBlock: false, enableTrackingBlock: false, removeGlobalShorts: false,
    removeTopLiveGames: false, removeMostRelevant: false, hideGuestSignInPrompts: false,
    hideEndcards: false, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(bundle);

  setTimeout(() => {
    const text = NS(makeBrowse(BROWSE_OPTS));
    const P = win.JSON.parse;
    for (let i = 0; i < 25; i++) P(text);
    const runs = [];
    for (let r = 0; r < 7; r++) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 25; i++) P(text);
      runs.push(Number(process.hrtime.bigint() - t0) / 1e6 / 60);
    }
    runs.sort((a, b) => a - b);
    results.push({ name, ms: runs[3] });
    dom.window.close();
    run();
  }, 300);
}
run();
