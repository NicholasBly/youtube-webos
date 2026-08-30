/**
 * Ad Blocking off must NOT take the emoji fix down with it (webOS 3/4 needs it
 * regardless), and Tracking Block must genuinely stop when Ad Blocking is off
 * rather than merely looking enabled.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';

function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  const opened = [];
  win.XMLHttpRequest = class {
    open(m, u) { opened.push(String(u)); } send() {} setRequestHeader() {}
    getResponseHeader() { return null; } addEventListener() {}
  };
  const NS = win.JSON.stringify;
  win.localStorage.setItem('ytaf-configuration', NS(Object.assign({
    enableAdBlock: true, enableTrackingBlock: false, enableLegacyEmojiFix: true,
    enableSponsorBlock: false, enableReturnYouTubeDislike: false,
    upgradeThumbnails: false, enableAutoLogin: false
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, NS, opened, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

const pad = 'z'.repeat(600);
function emojiPayload(NS) {
  const shelf = { shelfRenderer: {
    title: { runs: [{ text: 'Music \uD83D\uDE00 mix' }] },
    content: { horizontalListRenderer: { items: [
      { tileRenderer: { trackingParams: 'tp-tile' } }, { adSlotRenderer: {} }
    ] } } } };
  const o = { responseContext: { _pad: pad }, trackingParams: 'tp-root' };
  o.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {
    content: { sectionListRenderer: { contents: [shelf] } } } } } };
  return NS(o);
}
const shelfOf = (r) => r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer
  .content.sectionListRenderer.contents[0].shelfRenderer;

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };

setTimeout(() => {
  // --- Ad Blocking OFF, emoji fix ON: emoji must still be wrapped ---
  {
    const { win, NS } = boot({ enableAdBlock: false, enableLegacyEmojiFix: true });
    t('JSON.parse still hooked with Ad Blocking off',
      win.JSON.parse.toString().indexOf('native code') === -1);
    const out = win.JSON.parse(emojiPayload(NS));
    const txt = shelfOf(out).title.runs.map((r) => r.text).join('');
    t('emoji fix runs with Ad Blocking off', /\u200B\uD83D\uDE00\u200C/.test(txt), JSON.stringify(txt));
    const items = shelfOf(out).content.horizontalListRenderer.items;
    t('ads NOT filtered with Ad Blocking off', items.length === 2, 'items ' + items.length);
  }

  // --- Both off: hook should come off entirely ---
  {
    const { win } = boot({ enableAdBlock: false, enableLegacyEmojiFix: false,
                           hideGuestSignInPrompts: false, hideEndcards: false });
    t('JSON.parse unhooked when nothing needs it',
      win.JSON.parse.toString().indexOf('native code') !== -1);
  }

  // --- Ad Blocking ON: everything works as before ---
  {
    const { win, NS } = boot({ enableAdBlock: true, enableLegacyEmojiFix: true });
    const out = win.JSON.parse(emojiPayload(NS));
    const items = shelfOf(out).content.horizontalListRenderer.items;
    t('ads filtered with Ad Blocking on', items.length === 1, 'items ' + items.length);
    const txt = shelfOf(out).title.runs.map((r) => r.text).join('');
    t('emoji fix also runs with Ad Blocking on', /\u200B\uD83D\uDE00\u200C/.test(txt));
  }

  // --- Tracking Block is gated on Ad Blocking ---
  {
    const { win, opened } = boot({ enableAdBlock: false, enableTrackingBlock: true });
    const x = new win.XMLHttpRequest();
    x.open('POST', 'https://www.youtube.com/youtubei/v1/log_event?k=1');
    t('telemetry NOT blocked when Ad Blocking is off',
      opened[0].indexOf('log_event') !== -1, opened[0]);
  }
  {
    const { win, opened } = boot({ enableAdBlock: true, enableTrackingBlock: true });
    const x = new win.XMLHttpRequest();
    x.open('POST', 'https://www.youtube.com/youtubei/v1/log_event?k=1');
    t('telemetry blocked when both are on',
      opened[0].indexOf('log_event') === -1, opened[0]);
  }

  // --- The settings UI must show Tracking Block as unavailable ---
  {
    const { win, pump } = boot({ enableAdBlock: false, enableTrackingBlock: true });
    const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => 404, configurable: true });
    win.document.body.dispatchEvent(e);
    for (let i = 0; i < 20; i++) pump();
    const inputs = win.document.querySelectorAll('#ytaf-page-main input[type=checkbox]');
    // Cosmetic Filtering order: Ad Block, Tracking Block, Shorts, LiveGames, MostRelevant
    const tracking = inputs[1];
    t('Tracking Block checkbox disabled when Ad Blocking is off',
      !!tracking && tracking.disabled === true);
    t('Tracking Block row greyed out',
      !!tracking && tracking.closest('label').style.opacity === '0.5',
      tracking && tracking.closest('label').style.opacity);
    t('Ad Blocking checkbox itself stays enabled', inputs[0].disabled === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
