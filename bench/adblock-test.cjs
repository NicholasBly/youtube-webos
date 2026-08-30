/**
 * Functional test for the JSON.parse filtering hook, run against the built
 * bundle. Asserts every filter still does what it did: ad removal, Shorts
 * removal, shelf-title removal, endcard/attestation stripping, trackingParams
 * blanking, emoji wrapping, and the guards that must NOT fire.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const legacy = process.argv[3] !== 'modern';

const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>', {
  runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
  virtualConsole: new VirtualConsole(), pretendToBeVisual: true
});
const win = dom.window;
setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
win.launchParams = JSON.stringify({});
if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 16);
if (!win.cancelAnimationFrame) win.cancelAnimationFrame = (id) => win.clearTimeout(id);
win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };

const nativeStringify = win.JSON.stringify;
win.localStorage.setItem('ytaf-configuration', nativeStringify({
  enableAdBlock: true, enableTrackingBlock: true, removeGlobalShorts: true,
  removeTopLiveGames: true, removeMostRelevant: true, hideGuestSignInPrompts: true,
  hideEndcards: true, enableLegacyEmojiFix: true, enableSponsorBlock: false,
  enableReturnYouTubeDislike: false, upgradeThumbnails: false
}));
if (legacy) applyChrome38Downgrade(win);
win.eval(fs.readFileSync(bundlePath, 'utf8'));

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); }
};

setTimeout(() => {
  const P = win.JSON.parse;
  const pad = 'z'.repeat(600); // keep every payload over the 500-byte gate

  // --- HOME_BROWSE: ads, Shorts shelves, titled shelves ---
  const browse = {
    responseContext: { visitorData: 'x', _pad: pad },
    contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [
      { shelfRenderer: { title: { runs: [{ text: 'Keep me' }] }, content: { horizontalListRenderer: { items: [
        { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT', trackingParams: 'tp-tile' } },
        { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
        { adSlotRenderer: {} }
      ] } } } },
      { shelfRenderer: { title: { runs: [{ text: 'Shorts' }] } } },
      { shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS' } },
      { shelfRenderer: { title: { runs: [{ text: 'Top live games' }] } } },
      { shelfRenderer: { title: { runs: [{ text: 'Most relevant' }] } } },
      { adSlotRenderer: {} },
      { tvMastheadRenderer: {} },
      { feedNudgeRenderer: {} }
    ] } } } } } },
    trackingParams: 'tp-root'
  };
  const b = P(nativeStringify(browse));
  const secs = b.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
  t('browse: only the keepable shelf survives', secs.length === 1, 'got ' + secs.length + ' sections');
  t('browse: shelf title preserved', secs[0]?.shelfRenderer?.title?.runs?.[0]?.text === 'Keep me');
  const inner = secs[0]?.shelfRenderer?.content?.horizontalListRenderer?.items || [];
  t('browse: nested ad + shorts tile removed', inner.length === 1, 'got ' + inner.length + ' tiles');
  t('browse: trackingParams blanked at root', b.trackingParams === '');
  t('browse: trackingParams blanked nested', inner[0]?.tileRenderer?.trackingParams === '');

  // --- PLAYER: ads, endcards, attestation, QR overlay ---
  const player = {
    responseContext: { visitorData: 'x', _pad: pad },
    streamingData: { formats: [{ itag: 18 }] },
    adPlacements: [{ a: 1 }, { b: 2 }],
    playerAds: [{ c: 3 }],
    adSlots: [{ d: 4 }],
    attestation: { challenge: 'x' },
    adBreakHeartbeatParams: 'x',
    endscreen: { endscreenRenderer: {} },
    playerOverlays: { playerOverlayRenderer: { timelyActionRenderers: [{ qr: 1 }] } },
    videoDetails: { videoId: 'abc', title: 'Hello \uD83D\uDE00 world' },
    trackingParams: 'tp'
  };
  const p = P(nativeStringify(player));
  t('player: adPlacements cleared', p.adPlacements.length === 0);
  t('player: playerAds cleared', p.playerAds.length === 0);
  t('player: adSlots cleared', p.adSlots.length === 0);
  t('player: attestation removed', p.attestation === undefined);
  t('player: adBreakHeartbeatParams removed', p.adBreakHeartbeatParams === undefined);
  t('player: endscreen removed', p.endscreen === undefined);
  t('player: QR timelyActionRenderers removed', p.playerOverlays.playerOverlayRenderer.timelyActionRenderers === undefined);
  t('player: streamingData untouched', p.streamingData.formats[0].itag === 18);
  if (legacy) {
    // videoDetails.title is a bare string field; the emoji walker only rewrites
    // simpleText / sectionString / content / runs[].text, so it is left alone.
    t('player: bare string fields left alone', p.videoDetails.title === 'Hello \uD83D\uDE00 world');

    // Positive case: a runs[] title in a browse shelf must get sentinel-wrapped
    // so emoji-font.js can find it.
    const emojiShelf = { shelfRenderer: {
      title: { runs: [{ text: 'Music \uD83D\uDE00 mix' }] },
      content: { horizontalListRenderer: { items: [
        { tileRenderer: { tileMetadata: { tileMetadataRenderer: {
          title: { simpleText: 'Song \uD83C\uDFB5 one' } } } } }
      ] } } } };
    const emojiBrowse = { responseContext: { _pad: pad } };
    emojiBrowse.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {
      content: { sectionListRenderer: { contents: [emojiShelf] } } } } } };
    const eb = P(nativeStringify(emojiBrowse));
    const shelf = eb.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents[0].shelfRenderer;
    const runsText = (shelf.title.runs || []).map((r) => r.text).join('');
    t('emoji: runs[].text sentinel-wrapped', /\u200B\uD83D\uDE00\u200C/.test(runsText), JSON.stringify(runsText));
    const tileTitle = shelf.content.horizontalListRenderer.items[0].tileRenderer.tileMetadata.tileMetadataRenderer.title;
    const tileText = tileTitle.runs ? tileTitle.runs.map((r) => r.text).join('') : tileTitle.simpleText;
    t('emoji: simpleText split into wrapped runs', /\u200B\uD83C\uDFB5\u200C/.test(tileText), JSON.stringify(tileText));
  }

  // --- CONTINUATION grid ---
  const cont = {
    responseContext: { _pad: pad },
    continuationContents: { gridContinuation: { items: [
      { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
      { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
      { adSlotRenderer: {} },
      { tileRenderer: { onSelectCommand: { reelWatchEndpoint: {} } } }
    ] } }
  };
  const c = P(nativeStringify(cont));
  t('continuation: shorts + ads filtered from grid',
    c.continuationContents.gridContinuation.items.length === 1,
    'got ' + c.continuationContents.gridContinuation.items.length);

  // --- ACTION: appended continuation items ---
  const action = {
    responseContext: { _pad: pad },
    onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
      { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } }, { adSlotRenderer: {} }
    ] } }]
  };
  const a = P(nativeStringify(action));
  t('action: ads filtered from appended items',
    a.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems.length === 1);

  // --- Guards that must NOT fire ---
  t('guard: small payload passes through untouched',
    P('{"adPlacements":[{"a":1}],"responseContext":{}}').adPlacements.length === 1);
  t('guard: botguardData payload untouched',
    P(nativeStringify({ responseContext: { _pad: pad }, botguardData: { p: 1 }, adPlacements: [{ a: 1 }] })).adPlacements.length === 1);
  t('guard: unrelated large JSON untouched',
    P(nativeStringify({ someOtherApi: true, adPlacements: [{ a: 1 }], _pad: pad })).adPlacements.length === 1);
  t('guard: arrays parse cleanly', Array.isArray(P(nativeStringify([1, 2, 3, pad]))));
  t('guard: primitives still parse', P('5') === 5 && P('"s"') === 's' && P('null') === null);
  t('guard: reviver still honoured',
    P('{"a":1,"b":2}', (k, v) => (typeof v === 'number' ? v * 2 : v)).a === 2);

  if (legacy) {
    // Idempotency: running the emoji rewrite over its own output must be a
    // no-op. The old splitIntoRuns bailed on already-wrapped text and the
    // caller then stripped the sentinels, so a single pass was destructive and
    // only an accidental second walk made it correct.
    const mk = () => {
      const sh = { shelfRenderer: {
        title: { runs: [{ text: 'Music \uD83D\uDE00 mix' }] },
        content: { horizontalListRenderer: { items: [
          { tileRenderer: { tileMetadata: { tileMetadataRenderer: {
            title: { simpleText: 'Song \uD83C\uDFB5 one' } } } } }
        ] } } } };
      const o = { responseContext: { _pad: pad } };
      o.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {
        content: { sectionListRenderer: { contents: [sh] } } } } } };
      return o;
    };
    const once = P(nativeStringify(mk()));
    const twice = P(nativeStringify(once));
    const thrice = P(nativeStringify(twice));
    t('emoji rewrite is idempotent (2nd pass)', nativeStringify(once) === nativeStringify(twice),
      nativeStringify(twice).slice(0, 200));
    t('emoji rewrite is idempotent (3rd pass)', nativeStringify(twice) === nativeStringify(thrice));

    // A title that ships the sentinels verbatim must not be able to forge an
    // already-wrapped region: the forged chars are stripped before output.
    const forged = { responseContext: { _pad: pad },
      contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [
        { shelfRenderer: { title: { runs: [{ text: '\u200Bnot-an-emoji\u200C plain' }] } } }
      ] } } } } } } };
    const f = P(nativeStringify(forged));
    const ftxt = f.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents[0]
      .shelfRenderer.title.runs.map((r) => r.text).join('');
    t('forged sentinels stripped, not honoured', ftxt === 'not-an-emoji plain', JSON.stringify(ftxt));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 400);
