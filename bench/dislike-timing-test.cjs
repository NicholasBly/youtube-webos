/**
 * The webOS 25 report: opening the description panel showed no dislike count
 * for ~2s, then it appeared as 0 on every video. Works on the simulator.
 *
 * Root cause: injection was gated on the network (`if (!this.dataReady) return`)
 * so a slow first request meant the panel rendered with no factoid at all, and
 * it only appeared when some later mutation or focus change happened to re-run
 * the injection - by which time a FAILED fetch had already settled
 * dislikesCount to 0, permanently, with no retry.
 *
 * These cases run the built bundle with a deliberately slow and a deliberately
 * failing RYD API.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const legacy = process.argv[3] !== 'modern';

function boot(fetchImpl) {
  const dom = new JSDOM(
    '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
    '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
    enableReturnYouTubeDislike: true, enableAdBlock: true, enableSponsorBlock: false,
    enableLegacyEmojiFix: false, upgradeThumbnails: false, enableAutoLogin: false
  }));
  if (legacy) applyChrome38Downgrade(win);
  // AFTER the downgrade: it deletes window.fetch (Chrome 38 has none), which
  // would wipe the mock and hand the request to the whatwg-fetch polyfill.
  win.fetch = fetchImpl;
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

// A description panel shaped like YouTube's, mounted when the user opens it.
function openPanel(win) {
  const d = win.document;
  const panel = d.createElement('ytlr-structured-description-content-renderer');
  const container = d.createElement('div');
  container.className = 'ytLrVideoDescriptionHeaderRendererFactoidContainer';
  const likes = d.createElement('div');
  likes.className = 'ytLrVideoDescriptionHeaderRendererFactoid';
  likes.setAttribute('idomkey', 'factoid-0');
  likes.setAttribute('aria-label', '1.2M Likes');
  const v = d.createElement('span');
  v.className = 'ytLrVideoDescriptionHeaderRendererValue';
  v.textContent = '1.2M';
  const l = d.createElement('span');
  l.className = 'ytLrVideoDescriptionHeaderRendererLabel';
  l.textContent = 'Likes';
  likes.appendChild(v); likes.appendChild(l);
  container.appendChild(likes);
  panel.appendChild(container);
  d.querySelector('ytlr-app').appendChild(panel);
  return panel;
}
const factoid = (win) => win.document.getElementById('ryd-dislike-factoid');
const valueOf = (win) => {
  const f = factoid(win);
  if (!f) return null;
  const v = f.querySelector('.ytLrVideoDescriptionHeaderRendererValue');
  return v ? v.textContent : null;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };

(async () => {
  // ---- 1. Slow API: panel must still get a factoid immediately ----
  {
    let resolveFetch;
    const { win, pump } = boot(() => new Promise((res) => { resolveFetch = res; }));
    await wait(800); pump();
    openPanel(win);
    await wait(700); pump(); await wait(100);   // observeBodyForPanel polls at 500ms

    t('slow API: factoid injected before the fetch returns', !!factoid(win),
      'instance=' + !!win.returnYouTubeDislike +
      ' enableDislikes=' + (win.returnYouTubeDislike && win.returnYouTubeDislike.enableDislikes) +
      ' cachedMode=' + (win.returnYouTubeDislike && !!win.returnYouTubeDislike.cachedMode) +
      ' panel=' + (win.returnYouTubeDislike && !!win.returnYouTubeDislike.panelElement));
    t('slow API: shows a placeholder, not a fake 0', valueOf(win) === '\u2014', valueOf(win));

    t('slow API: fetch was actually issued', typeof resolveFetch === 'function');
    if (typeof resolveFetch === 'function') {
      resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ dislikes: 4321 }) });
    }
    await wait(120); pump(); await wait(60);
    t('slow API: value filled in when the fetch lands', valueOf(win) === '4.3K', valueOf(win));
    t('slow API: aria-label updated too',
      factoid(win) && factoid(win).getAttribute('aria-label') === '4.3K Dislikes',
      factoid(win) && factoid(win).getAttribute('aria-label'));
  }

  // ---- 2. Failing API: must retry, and must not render a permanent 0 ----
  {
    let calls = 0;
    const { win, pump } = boot(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('network down'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dislikes: 987 }) });
    });
    await wait(600); pump();
    openPanel(win);
    await wait(700); pump(); await wait(100);

    t('failing API: factoid still injected', !!factoid(win));
    t('failing API: does NOT claim zero dislikes', valueOf(win) !== '0', valueOf(win));

    // Retries are 1.2s and 2.4s apart.
    await wait(4200); pump(); await wait(100);
    t('failing API: retried and recovered', valueOf(win) === '987', valueOf(win) + ' after ' + calls + ' calls');
  }

  // ---- 3. Healthy API: unchanged behaviour ----
  {
    const { win, pump } = boot(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ dislikes: 12 }) }));
    await wait(800); pump();
    openPanel(win);
    await wait(700); pump(); await wait(100);
    t('healthy API: correct count on first paint', valueOf(win) === '12', valueOf(win));
    t('healthy API: exactly one factoid injected',
      win.document.querySelectorAll('#ryd-dislike-factoid').length === 1);
  }

  // ---- 4. A genuine zero must still read as 0 ----
  {
    const { win, pump } = boot(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ dislikes: 0 }) }));
    await wait(800); pump();
    openPanel(win);
    await wait(700); pump(); await wait(100);
    t('a real zero still renders as 0', valueOf(win) === '0', valueOf(win));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
