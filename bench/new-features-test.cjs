/**
 * Logo selector, Live-video filter, Shorts guide entry, and page-1 sizing.
 * DOM fixtures are copied verbatim from real webOS 25 captures.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

const PREMIUM_URL = 'https://www.gstatic.com/youtube/img/branding/livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png';
const DEFAULT_URL = 'https://www.gstatic.com/youtube/img/branding/livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png';

// Verbatim from the capture (the "Normal" variant).
const LOGO_HTML =
  '<ytlr-logo-entity tabindex="-1" class="wnwire lJjg6 bYrvBd" style="left: 66.375rem; width: 10.125rem;">' +
  '<ytlr-thumbnail-details tabindex="-1" class="cFXl0 XVmJGe cFrowd" ' +
  `style="background-image: url(&quot;${DEFAULT_URL}&quot;);"></ytlr-thumbnail-details></ytlr-logo-entity>`;

function boot(cfg, extraHtml = '') {
  const dom = new JSDOM(
    `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>${extraHtml}</ytlr-app></body></html>`,
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos23);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));
  const NS = win.JSON.stringify;
  win.localStorage.setItem('ytaf-configuration', NS(Object.assign({
    enableAdBlock: true, enableTrackingBlock: false, removeGlobalShorts: false,
    removeLiveVideos: false, removeTopLiveGames: false, removeMostRelevant: false,
    hideGuestSignInPrompts: false, hideEndcards: false, enableLegacyEmojiFix: false,
    enableSponsorBlock: false, enableReturnYouTubeDislike: false,
    upgradeThumbnails: false, enableAutoLogin: false, logoStyle: 'default'
  }, cfg)));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, NS, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = 'z'.repeat(600);

// A shelf item in the lockupViewModel shape, with an optional LIVE badge.
function lockupItem(id, live, extraOverlayFirst) {
  const overlays = [];
  // Deliberately put a non-badge overlay first: the badge is not always [0].
  if (extraOverlayFirst) overlays.push({ thumbnailOverlayProgressBarViewModel: { p: 1 } });
  overlays.push({ thumbnailBottomOverlayViewModel: { badges: [
    { thumbnailBadgeViewModel: { badgeStyle: live
        ? 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE'
        : 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT', text: live ? 'LIVE' : '12:34' } }
  ] } });
  return { lockupViewModel: { contentId: id, contentImage: { thumbnailViewModel: { overlays } } } };
}

function browse(items, extra) {
  const o = { responseContext: { _pad: pad } };
  o.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: {
    sectionListRenderer: { contents: [
      { shelfRenderer: { title: { runs: [{ text: 'Recommended' }] },
        content: { horizontalListRenderer: { items } } } }
    ] } } } } } };
  if (extra) Object.assign(o, extra);
  return o;
}
const shelfItems = (r) => r.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer
  .content.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items;

(async () => {
  // ---------- 1. Logo selector ----------
  for (const [style, expectUrl, expectLeft, expectWidth] of [
    ['default', DEFAULT_URL, '66.375rem', '10.125rem'],
    ['premium', PREMIUM_URL, '65.75rem', '10.75rem']
  ]) {
    const { win } = boot({ logoStyle: style }, LOGO_HTML);
    await wait(400);
    const logo = win.document.querySelector('ytlr-logo-entity');
    const img = logo.querySelector('ytlr-thumbnail-details');
    t(`[logo:${style}] correct wordmark`, img.style.backgroundImage.indexOf(expectUrl) !== -1,
      img.style.backgroundImage);
    t(`[logo:${style}] left repositioned`, logo.style.left === expectLeft, logo.style.left);
    t(`[logo:${style}] width matches the asset`, logo.style.width === expectWidth, logo.style.width);
    t(`[logo:${style}] not hidden`,
      !win.document.documentElement.classList.contains('ytaf-hide-logo'));
  }
  {
    const { win } = boot({ logoStyle: 'hidden' }, LOGO_HTML);
    await wait(400);
    t('[logo:hidden] hide class applied',
      win.document.documentElement.classList.contains('ytaf-hide-logo'));
  }
  {
    // Header not painted yet at startup: must still apply once it appears.
    const { win } = boot({ logoStyle: 'premium' }, '');
    await wait(300);
    const app = win.document.querySelector('ytlr-app');
    app.innerHTML = LOGO_HTML;
    await wait(900);
    const img = win.document.querySelector('ytlr-thumbnail-details');
    t('[logo] applied to a header that appears late',
      img.style.backgroundImage.indexOf(PREMIUM_URL) !== -1, img.style.backgroundImage);
  }

  // ---------- 2. Live filter ----------
  {
    const { win, NS } = boot({ removeLiveVideos: true });
    await wait(300);
    const out = win.JSON.parse(NS(browse([
      lockupItem('a', false), lockupItem('b', true),
      lockupItem('c', true, true),           // badge NOT at overlays[0]
      lockupItem('d', false)
    ])));
    const ids = shelfItems(out).map((i) => i.lockupViewModel.contentId);
    t('[live] live items removed', JSON.stringify(ids) === JSON.stringify(['a', 'd']), JSON.stringify(ids));
    t('[live] badge found even when it is not overlays[0]', ids.indexOf('c') === -1);
  }
  {
    const { win, NS } = boot({ removeLiveVideos: false });
    await wait(300);
    const out = win.JSON.parse(NS(browse([lockupItem('a', false), lockupItem('b', true)])));
    t('[live] nothing removed when the filter is off', shelfItems(out).length === 2);
  }
  {
    // Fallback shapes, for when the viewModel schema changes again.
    const { win, NS } = boot({ removeLiveVideos: true });
    await wait(300);
    const out = win.JSON.parse(NS(browse([
      { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_VIDEO', x: 1 } },
      { tileRenderer: { header: { tileHeaderRenderer: { thumbnailOverlays: [
        { thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }] } } } },
      { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_LIVE' } }
    ])));
    t('[live] tileRenderer fallbacks also filtered', shelfItems(out).length === 1,
      'left ' + shelfItems(out).length);
  }

  // ---------- 4. Shorts guide entry ----------
  {
    const { win, NS } = boot({ removeGlobalShorts: true });
    await wait(300);
    const guide = { responseContext: { _pad: pad }, contents: { tvBrowseRenderer: { content: {
      tvSecondaryNavRenderer: { sections: [{ tvSecondaryNavSectionRenderer: { tabs: [
        { tabRenderer: { title: 'Home', endpoint: { browseEndpoint: { browseId: 'FEwhat_to_watch' } } } },
        { tabRenderer: { title: 'Shorts', endpoint: { browseEndpoint: { browseId: 'FEshorts' } } } },
        { tabRenderer: { title: 'Subscriptions', endpoint: { browseEndpoint: { browseId: 'FEsubscriptions' } } } }
      ] } }] } } } } };
    const out = win.JSON.parse(NS(guide));
    const tabs = out.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer
      .sections[0].tvSecondaryNavSectionRenderer.tabs.map((x) => x.tabRenderer.title);
    t('[guide] Shorts tab removed', JSON.stringify(tabs) === JSON.stringify(['Home', 'Subscriptions']),
      JSON.stringify(tabs));
  }
  {
    const { win, NS } = boot({ removeGlobalShorts: true });
    await wait(300);
    // guideEntryRenderer shape, identified by endpoint rather than title.
    const guide = { responseContext: { _pad: pad }, items: [
      { guideEntryRenderer: { title: { simpleText: 'Home' } } },
      { guideEntryRenderer: { title: { simpleText: 'Kurzfilme' },
        navigationEndpoint: { browseEndpoint: { browseId: 'FEshorts' } } } },
      { guideEntryRenderer: { title: { simpleText: 'Library' } } }
    ] };
    const out = win.JSON.parse(NS(guide));
    const titles = out.items.map((x) => x.guideEntryRenderer.title.simpleText);
    t('[guide] localized Shorts entry removed by endpoint',
      JSON.stringify(titles) === JSON.stringify(['Home', 'Library']), JSON.stringify(titles));
  }
  {
    const { win, NS } = boot({ removeGlobalShorts: false });
    await wait(300);
    const guide = { responseContext: { _pad: pad }, items: [
      { guideEntryRenderer: { title: { simpleText: 'Shorts' },
        navigationEndpoint: { browseEndpoint: { browseId: 'FEshorts' } } } }
    ] };
    const out = win.JSON.parse(NS(guide));
    t('[guide] left alone when Remove Shorts is off', out.items.length === 1);
  }

  // ---------- 3. Page 1 sizing ----------
  {
    const { win, pump } = boot({});
    await wait(300);
    const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => 404, configurable: true });
    win.document.body.dispatchEvent(e);
    for (let i = 0; i < 20; i++) pump();
    const main = win.document.querySelector('#ytaf-page-main');
    t('[panel] Remove Live Videos row present',
      !!main && /Remove Live Videos/.test(main.textContent), main && main.textContent.slice(0, 80));
    t('[panel] YouTube Logo is now a selector, not a checkbox',
      !!main && /YouTube Logo/.test(main.textContent) &&
      !/Hide YouTube Logo/.test(main.textContent));
    const css = Array.from(win.document.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    t('[panel] page-1 density rules shipped', /#ytaf-page-main label/.test(css));
    t('[panel] settings page can scroll rather than clip', /overflow-y:\s*auto/.test(css));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
