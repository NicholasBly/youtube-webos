/**
 * Reproduces (and then guards against) the self-feeding emoji observer loop
 * seen on a real webOS 3 session: ~30 MutationObserver records per second on a
 * completely idle home screen, with domNodes flat.
 *
 * Loads the built bundle, plants ONE sentinel-wrapped emoji title of the kind
 * adblock.js produces, then leaves the page completely alone and counts how
 * many mutation records the emoji observer generates.
 *
 * On a page nothing is touching, a correct implementation converges to zero.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const FRAMES = +(process.argv[3] || 60);

const dom = new JSDOM(
  '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
  { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true }
);
const win = dom.window;
setUserAgent(win, UA.webos3);
win.launchParams = '{}';
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };

// Drive rAF manually so "one frame" is deterministic.
let rafQueue = [];
win.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
win.cancelAnimationFrame = () => {};
function pumpFrame() {
  const q = rafQueue; rafQueue = [];
  for (const cb of q) cb(Date.now());
}

win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
  enableLegacyEmojiFix: true, enableAdBlock: true, enableSponsorBlock: false,
  enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
}));
applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

setTimeout(() => {
  // Independent observer that counts everything the emoji observer would see.
  let records = 0;
  const spy = new win.MutationObserver((muts) => { records += muts.length; });
  spy.observe(win.document.body, { childList: true, subtree: true, characterData: true });

  const app = win.document.querySelector('ytlr-app');
  // Exactly what adblock.js emits into a title: emoji wrapped in \u200B..\u200C
  const title = win.document.createElement('span');
  title.textContent = 'Chill beats \u200B\uD83C\uDFB5\u200C and lofi \u200B\uD83D\uDE00\u200C mix';
  app.appendChild(title);

  const nodeCount = () => win.document.getElementsByTagName('*').length;
  const injected = () => win.document.querySelectorAll('.twemoji-injected').length;

  // MutationObserver records are delivered in a microtask, so each "frame"
  // must yield before the next one or nothing is ever observed.
  const samples = [];
  const tick = () => new Promise((r) => setTimeout(r, 0));
  (async () => {
    for (let f = 0; f < FRAMES; f++) {
      pumpFrame();
      await tick();
      samples.push({ f, records, nodes: nodeCount(), injected: injected() });
    }
    report();
  })();
  return;

  function report() {

  const early = samples[4], mid = samples[(FRAMES >> 1)], late = samples[FRAMES - 1];
  const tailRecords = late.records - mid.records;   // records in the SECOND half
  console.log(`frame ${String(early.f).padStart(3)}: records=${String(early.records).padStart(5)} nodes=${early.nodes} injected=${early.injected}`);
  console.log(`frame ${String(mid.f).padStart(3)}: records=${String(mid.records).padStart(5)} nodes=${mid.nodes} injected=${mid.injected}`);
  console.log(`frame ${String(late.f).padStart(3)}: records=${String(late.records).padStart(5)} nodes=${late.nodes} injected=${late.injected}`);
  console.log(`\nrecords generated in the second half (nothing external touched the DOM): ${tailRecords}`);

  const converged = tailRecords === 0;
  console.log(converged
    ? 'PASS  observer converged - an untouched page generates no further work'
    : `FAIL  observer is self-feeding - ${tailRecords} records over ${FRAMES >> 1} idle frames`);
  process.exit(converged ? 0 : 1);
  }
}, 400);
