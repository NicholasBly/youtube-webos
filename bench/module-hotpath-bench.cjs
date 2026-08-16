/**
 * Counts selector-engine and layout work in the three modules that hadn't been
 * looked at: thumbnail-quality.js, return-dislike.js, sponsorblock.js.
 *
 * jsdom can't time a layout, so this counts the calls that cause one, plus
 * querySelectorAll/matches/closest invocations - the selector engine is the
 * expensive part on Chromium 38, especially for descendant selectors which
 * match right-to-left and then walk ancestors.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

function boot(cfg, html, url) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: url || 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class {
    open(){} send(){ this.onerror && this.onerror(); } setRequestHeader(){}
    getResponseHeader(){ return null; } addEventListener(){}
  };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));

  win.localStorage.setItem('ytaf-configuration', win.JSON.stringify(Object.assign({
    enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));

  // Instrument AFTER load: the Chrome 38 downgrade deletes Element#matches and
  // Element#closest, and src/polyfills.js installs fresh functions - wrapping
  // before load would count nothing.
  const c = { qsa: 0, qs: 0, matches: 0, closest: 0, rect: 0, style: 0 };
  const P = win.Element.prototype;
  const wrap = (obj, name, key) => {
    const orig = obj[name];
    obj[name] = function (...a) { c[key]++; return orig.apply(this, a); };
  };
  wrap(P, 'querySelectorAll', 'qsa'); wrap(P, 'querySelector', 'qs');
  wrap(P, 'matches', 'matches');      wrap(P, 'closest', 'closest');
  P.getBoundingClientRect = function () { c.rect++; return { top:0,left:0,right:100,bottom:40,width:100,height:40,x:0,y:0 }; };
  const gcs = win.getComputedStyle;
  win.getComputedStyle = function (...a) { c.style++; return gcs.apply(win, a); };

  return { win, c, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); },
           reset: () => { for (const k in c) c[k] = 0; } };
}

const APP = '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>';
const WATCH = '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
  '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>';

setTimeout(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ---- A. thumbnail-quality: a shelf streaming in ----
  {
    const { win, c, reset, pump } = boot({ upgradeThumbnails: true }, APP);
    await tick(); pump(); await tick();
    const app = win.document.querySelector('ytlr-app');
    reset();
    // 12 shelves x 20 tiles, each tile a small subtree - what a browse response mounts.
    for (let s = 0; s < 12; s++) {
      const shelf = win.document.createElement('div');
      for (let i = 0; i < 20; i++) {
        const tile = win.document.createElement('ytlr-tile-renderer');
        const inner = win.document.createElement('div');
        const details = win.document.createElement('ytlr-thumbnail-details');
        details.style.backgroundImage = `url("https://i.ytimg.com/vi/vid${s}_${i}/hqdefault.jpg")`;
        const label = win.document.createElement('span');
        label.textContent = 'Video ' + i;
        inner.appendChild(details); inner.appendChild(label); tile.appendChild(inner);
        shelf.appendChild(tile);
      }
      app.appendChild(shelf);
      await tick();
    }
    await tick(); pump(); await tick();
    console.log('A. thumbnail-quality — 240 tiles mounted across 12 shelves');
    console.log(`     querySelectorAll: ${c.qsa}   matches: ${c.matches}   getBoundingClientRect: ${c.rect}`);
    console.log(`JSONA:${JSON.stringify({ qsa: c.qsa, matches: c.matches, rect: c.rect })}`);
  }

  // ---- B. return-dislike: focus traffic on a watch page, no panel open ----
  {
    // The hash must be present at construction: RYD binds on hashchange and on a
    // 500ms post-load timer, and jsdom won't fire hashchange for a late assignment.
    const { win, c, reset, pump } = boot({ enableReturnYouTubeDislike: true }, WATCH,
      'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 900));
    pump(); await tick();

    // A realistic watch-page depth: focus moves between controls ~15 levels deep.
    const app = win.document.querySelector('ytlr-app');
    let cursor = app;
    for (let d = 0; d < 15; d++) {
      const n = win.document.createElement('div');
      cursor.appendChild(n); cursor = n;
    }
    const buttons = [];
    for (let i = 0; i < 10; i++) {
      const b = win.document.createElement('div');
      b.setAttribute('tabindex', '0');
      cursor.appendChild(b); buttons.push(b);
    }
    reset();
    const MOVES = 40;
    for (let i = 0; i < MOVES; i++) buttons[i % buttons.length].focus();
    console.log(`\nB. return-dislike — ${MOVES} focus moves on a watch page, description panel closed`);
    console.log(`     instance active: ${!!win.returnYouTubeDislike}`);
    console.log(`     closest(): ${c.closest}   matches: ${c.matches}   querySelector: ${c.qs}`);
    console.log(`JSONB:${JSON.stringify({ closest: c.closest, matches: c.matches, qs: c.qs })}`);
  }

  process.exit(0);
}, 500);
