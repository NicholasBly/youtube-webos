/**
 * Behaviour of thumbnail-quality.js and return-dislike.js after the hot-path
 * changes: the tile tracker must still find the same elements, and the dislike
 * panel must still be detected by focus and navigate the same way.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

function boot(cfg, html, url) {
  const dom = new JSDOM(html, { runScripts: 'outside-only',
    url: url || 'https://www.youtube.com/tv', virtualConsole: new VirtualConsole(),
    pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  const probed = [];
  win.XMLHttpRequest = class {
    open(m, u) { this._u = u; } send() { probed.push(this._u); if (this.onerror) this.onerror(); }
    setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {}
  };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));
  win.Element.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0 };
  };
  win.Element.prototype.scrollIntoView = function () {};
  // jsdom never loads images, so the module's WebP feature-detect would await a
  // promise that never settles and no upgrade would ever run. Resolve it as
  // "no webp", which is the Chromium 38 answer anyway.
  win.Image = class { set src(_v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  win.localStorage.setItem('ytaf-configuration', win.JSON.stringify(Object.assign({
    enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, probed, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const tick = () => new Promise((r) => setTimeout(r, 0));

setTimeout(async () => {
  // ---- thumbnail-quality: does the tracker still find every shape? ----
  {
    const { win, probed, pump } = boot({ upgradeThumbnails: true },
      '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>');
    await tick(); pump(); await tick();
    const d = win.document;
    const app = d.querySelector('ytlr-app');

    const mk = (tag, parentTag) => {
      const host = d.createElement(parentTag || 'div');
      const el = d.createElement(tag);
      el.style.backgroundImage = 'url("https://i.ytimg.com/vi/abc123XYZ_-/hqdefault.jpg")';
      host.appendChild(el);
      return { host, el };
    };
    // All three clauses of 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image'
    const a = mk('ytlr-thumbnail-details');
    const b = mk('ytlr-surface-page');
    const c = mk('image', 'thumbnail');            // descendant clause
    const nested = d.createElement('div');          // found via querySelectorAll
    const nestedInner = d.createElement('ytlr-thumbnail-details');
    nestedInner.style.backgroundImage = 'url("https://i.ytimg.com/vi/nested00000/hqdefault.jpg")';
    nested.appendChild(d.createElement('div')).appendChild(nestedInner);
    const notAThumb = d.createElement('image');     // <image> with NO <thumbnail> ancestor
    notAThumb.style.backgroundImage = 'url("https://i.ytimg.com/vi/skipme00000/hqdefault.jpg")';

    for (const n of [a.host, b.host, c.host, nested, notAThumb]) app.appendChild(n);
    await tick(); await new Promise((r) => setTimeout(r, 60)); pump(); await tick();
    await new Promise((r) => setTimeout(r, 60)); pump(); await tick();

    const probedIds = probed.join(' ');
    t('tracks <ytlr-thumbnail-details>', probedIds.indexOf('abc123XYZ_-') !== -1);
    t('tracks nested thumbnails via querySelectorAll', probedIds.indexOf('nested00000') !== -1);
    t('does NOT track <image> without a <thumbnail> ancestor',
      probedIds.indexOf('skipme00000') === -1);
    // The source tile is already hqdefault, and getThumbnailUrl() returns null
    // when the rewritten path equals the original - so only the two higher
    // qualities are probed. Asserting that keeps the no-op skip honest.
    t('probes the higher qualities only',
      /maxresdefault/.test(probedIds) && /sddefault/.test(probedIds) &&
      probed.filter((u) => /hqdefault/.test(u)).length === 0,
      'probed: ' + probed.slice(0, 4).join(' | '));

    // Removal must untrack without throwing.
    let threw = null;
    try { app.removeChild(a.host); await tick(); } catch (e) { threw = e; }
    t('removal untracks cleanly', !threw, threw && threw.message);
  }

  // ---- return-dislike: panel detection + navigation ----
  {
    const { win, pump } = boot({ enableReturnYouTubeDislike: true },
      '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
      '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>',
      'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ');
    await new Promise((r) => setTimeout(r, 900));
    const d = win.document;
    const ryd = win.returnYouTubeDislike;
    t('RYD instance created', !!ryd);

    // Build a description panel a few levels below <ytlr-app>, as YouTube does.
    const app = d.querySelector('ytlr-app');
    const wrap1 = d.createElement('div'); const wrap2 = d.createElement('div');
    const panel = d.createElement('ytlr-structured-description-content-renderer');
    const items = [];
    for (let i = 0; i < 4; i++) {
      const it = d.createElement('div');
      it.setAttribute('role', 'menuitem');
      it.setAttribute('tabindex', '0');
      const inner = d.createElement('span');       // focus lands on a child
      inner.setAttribute('tabindex', '0');
      it.appendChild(inner);
      panel.appendChild(it); items.push({ it, inner });
    }
    wrap2.appendChild(panel); wrap1.appendChild(wrap2); app.appendChild(wrap1);
    await tick(); pump(); await tick();

    // Focus a descendant: panel must be discovered by ancestor walk.
    items[1].inner.focus();
    await tick();
    t('panel detected by focus (ancestor walk)', ryd.panelElement === panel,
      ryd.panelElement ? ryd.panelElement.tagName : 'null');
    t('panel marked focused', ryd.isPanelFocused === true);
    t('menu item resolved from a focused child',
      ryd.lastFocusedElement === items[1].it,
      ryd.lastFocusedElement ? ryd.lastFocusedElement.getAttribute('role') : 'null');

    // Arrow key navigation still moves within the panel.
    // jsdom makes Event#isTrusted an unforgeable own property, so a dispatched
    // event can never look like a real remote press. Call the handler directly
    // with a plain object for the "real press" cases; the dispatch path is still
    // exercised by the synthetic-marker case below.
    const key = (code, synthetic) => {
      const e = { isTrusted: true, keyCode: code,
                  key: code === 40 ? 'ArrowDown' : code === 38 ? 'ArrowUp' : 'Enter',
                  preventDefault() {}, stopPropagation() {} };
      if (synthetic) e.__ytafSynthetic = true;
      ryd.handleNavigation(e);
      return e;
    };
    const before = ryd.focusedIndex;
    key(40);   // ArrowDown
    await tick();
    t('ArrowDown advances the focused item', ryd.focusedIndex === (before + 1) % 4,
      `${before} -> ${ryd.focusedIndex}`);

    // A key this mod synthesised must be ignored - both via the direct call and
    // through a real dispatched event carrying the marker.
    const idx = ryd.focusedIndex;
    key(40, true);
    await tick();
    t('mod-synthesised ArrowDown is ignored (marker)', ryd.focusedIndex === idx,
      `${idx} -> ${ryd.focusedIndex}`);

    const de = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(de, 'keyCode', { get: () => 40, configurable: true });
    de.__ytafSynthetic = true;
    d.activeElement.dispatchEvent(de);
    await tick();
    t('mod-synthesised ArrowDown ignored through real dispatch',
      ryd.focusedIndex === idx, `${idx} -> ${ryd.focusedIndex}`);

    // Focus leaving the panel clears the flag.
    const outside = d.createElement('div');
    outside.setAttribute('tabindex', '0');
    app.appendChild(outside);
    outside.focus();
    await tick();
    t('focus outside the panel clears isPanelFocused', ryd.isPanelFocused === false);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
