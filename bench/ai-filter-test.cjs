/** Behaviour tests for learned AI labels, persistence, card badges and removal. */
/* global __dirname */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');
const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
const legacy = process.argv[3] !== 'modern';
const BADGE = 'data-ytaf-ai-badge';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pass = 0, fail = 0;
const t = (name, ok, extra) => { if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); } };
const wrap = (contents) => ({ contents: { twoColumnWatchNextResults: { results: { results: { contents } } } } });
const aiBody = wrap([{ videoPrimaryInfoRenderer: { badges: [{ metadataBadgeRenderer: {
  icon: { iconType: 'INFO' }, label: 'AI', accessibilityData: { label: 'AI: Content was made with AI' } } }] } }]);
const plainBody = wrap([{ videoPrimaryInfoRenderer: {} }]);
function boot(cfg, opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app><div id="root"></div></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/', virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, legacy ? UA.webos3 : UA.webos23);
  win.launchParams = '{}';
  const requests = [];
  const answers = opts.answers || {};
  win.XMLHttpRequest = class {
    open(m, u) { this.url = u; }
    setRequestHeader() {}
    getResponseHeader() { return null; }
    addEventListener() {}
    send(body) {
      const id = JSON.parse(body).videoId;
      requests.push(id);
      const answer = answers[id] || 'plain';
      const delay = opts.delayFor && opts.delayFor[id] !== undefined ? opts.delayFor[id] : (opts.delay || 0);
      setTimeout(() => {
        if (answer === 'timeout') { this.ontimeout && this.ontimeout(); return; }
        if (answer === 'network') { this.onerror && this.onerror(); return; }
        this.status = typeof answer === 'number' ? answer : answer === '403' || answer === '429' || answer === '500' ? Number(answer) : 200;
        this.responseText = answer === 'invalidjson' ? '<html>' : JSON.stringify(answer === 'ai' ? aiBody : plainBody);
        this.onload && this.onload();
      }, delay);
    }
  };
  const NS = win.JSON.stringify;
  win.localStorage.setItem('ytaf-configuration', NS(Object.assign({
    enableAdBlock: true, enableTrackingBlock: false, removeGlobalShorts: false,
    removeLiveVideos: false, removeAiVideos: false, removeTopLiveGames: false,
    removeMostRelevant: false, markAiVideos: false, hideGuestSignInPrompts: false,
    hideEndcards: false, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false
  }, cfg)));
  if (opts.aiStore !== undefined) win.localStorage.setItem('ytaf-ai-videos', opts.aiStore);
  if (legacy) applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  const doc = win.document;
  const makeLockupData = (id, contentType, commandId) => ({
    contentId: id, contentType: contentType || 'LOCKUP_CONTENT_TYPE_VIDEO',
    rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: commandId || id } } } } }
  });
  const card = (id, tag, data) => {
    const el = doc.createElement(tag || 'ytlr-tile-renderer');
    const payload = data || (tag === 'yt-lockup-view-model'
      ? makeLockupData(id)
      : { contentType: 'TILE_CONTENT_TYPE_VIDEO', onSelectCommand: { watchEndpoint: { videoId: id } } });
    el.__instance = { props: { data: payload } };
    el.setAttribute('tabindex', '0');
    doc.getElementById('root').appendChild(el);
    return el;
  };
  const wrapperLockup = (id) => {
    const wrapper = doc.createElement('ytlr-playlist-panel-video-wrapper-renderer');
    wrapper.__instance = { props: { data: { primaryRenderer: { lockupViewModel: makeLockupData(id) } } } };
    const inner = doc.createElement('yt-lockup-view-model');
    inner.__instance = { props: { data: makeLockupData(id) } };
    wrapper.appendChild(inner);
    doc.getElementById('root').appendChild(wrapper);
    return { wrapper, inner };
  };
  return { win, doc, NS, requests, card, wrapperLockup, close: () => win.close() };
}
const id = (n) => 'vid' + String(n).padStart(8, '0');
const storedIds = (win) => {
  try { return JSON.parse(win.localStorage.getItem('ytaf-ai-videos') || '[]').map((x) => x.id); }
  catch { return []; }
};
const watchBadge = (win, el) => {
  const observed = { added: false };
  const observer = new win.MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === BADGE && mutations[i].oldValue === null) observed.added = true;
    }
  });
  observer.observe(el, { attributes: true, attributeFilter: [BADGE], attributeOldValue: true });
  return { observed, stop: () => observer.disconnect() };
};
const openMarkBox = async (h) => {
  const event = new h.win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'keyCode', { get: () => 404, configurable: true });
  h.doc.body.dispatchEvent(event);
  await wait(20);
  return h.doc.querySelector('#ytaf-mark-ai');
};
const lockup = (videoId, contentType) => ({ lockupViewModel: {
  contentType: contentType || 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: videoId,
  rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId } } } } }
} });
const tile = (videoId, contentType) => ({ tileRenderer: { contentType: contentType || 'TILE_CONTENT_TYPE_VIDEO',
  onSelectCommand: { watchEndpoint: { videoId } } } });
function responseFor(surface, items) {
  const shelf = { shelfRenderer: { content: { horizontalListRenderer: { items } } } };
  const root = { responseContext: { pad: 'z'.repeat(600) } };
  if (surface === 'HOME') root.contents = { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: { content: { sectionListRenderer: { contents: [shelf] } } } } } };
  else if (surface === 'SEARCH') root.contents = { sectionListRenderer: { contents: [shelf] } };
  else if (surface === 'CONTINUATION') root.continuationContents = { gridContinuation: { items } };
  else root.contents = { tvBrowseRenderer: { content: { tvSecondaryNavRenderer: { sections: [{ tvSecondaryNavSectionRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [shelf] } } } }] } }] } } } };
  return root;
}
function resultItems(win, out, surface) {
  if (surface === 'HOME') return out.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items;
  if (surface === 'SEARCH') return out.contents.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items;
  if (surface === 'CONTINUATION') return out.continuationContents.gridContinuation.items;
  return out.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections[0].tvSecondaryNavSectionRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].shelfRenderer.content.horizontalListRenderer.items;
}

(async () => {
  // Disabled mode must not query the label service.
  {
    const h = boot({}, { answers: { [id(20)]: 'ai' } });
    const card = h.card(id(20));
    await wait(300);
    t('off: no lookups or badges when both options are off', h.requests.length === 0 && !card.hasAttribute(BADGE));
    h.close();
  }

  // A late answer for a recycled component must never badge its new video.
  {
    const h = boot({ markAiVideos: true }, { delay: 180, answers: { [id(21)]: 'ai' } });
    const card = h.card(id(21));
    await wait(80);
    const watch = watchBadge(h.win, card);
    card.__instance.props.data = { contentType: 'TILE_CONTENT_TYPE_VIDEO', onSelectCommand: { watchEndpoint: { videoId: id(22) } } };
    await wait(450);
    t('stale answer: recycled card is never badged, even briefly', !watch.observed.added && !card.hasAttribute(BADGE));
    watch.stop();
    h.close();
  }

  // Only video renderer kinds are looked up; collection commands may point at an AI first video.
  {
    const answers = {};
    const h = boot({ markAiVideos: true }, { answers });
    const musicId = id(23), shortId = id(24), reelId = id(25), playlistId = id(26), mixId = id(27), channelId = id(28), tilePlaylistId = id(29);
    [musicId, shortId, reelId].forEach((videoId) => { answers[videoId] = 'ai'; });
    const music = h.card(musicId, 'yt-lockup-view-model');
    music.__instance.props.data.contentType = 'LOCKUP_CONTENT_TYPE_MUSIC';
    const short = h.card(shortId, 'yt-lockup-view-model');
    short.__instance.props.data.contentType = 'LOCKUP_CONTENT_TYPE_SHORT';
    const reel = h.card(reelId, 'ytlr-tile-renderer', { contentType: 'TILE_CONTENT_TYPE_SHORT', onSelectCommand: { reelWatchEndpoint: { videoId: reelId } } });
    const playlist = h.card(playlistId, 'yt-lockup-view-model');
    playlist.__instance.props.data.contentType = 'LOCKUP_CONTENT_TYPE_PLAYLIST';
    playlist.__instance.props.data.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId = musicId;
    const mix = h.card(mixId, 'yt-lockup-view-model');
    mix.__instance.props.data.contentType = 'LOCKUP_CONTENT_TYPE_MIX';
    mix.__instance.props.data.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId = musicId;
    const channel = h.card(channelId, 'yt-lockup-view-model');
    channel.__instance.props.data.contentType = 'LOCKUP_CONTENT_TYPE_CHANNEL';
    channel.__instance.props.data.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId = musicId;
    const tilePlaylist = h.card(tilePlaylistId, 'ytlr-tile-renderer', { contentType: 'TILE_CONTENT_TYPE_PLAYLIST', onSelectCommand: { watchEndpoint: { videoId: musicId } } });
    const tileMix = h.card(id(31), 'ytlr-tile-renderer', { contentType: 'TILE_CONTENT_TYPE_MIX', onSelectCommand: { watchEndpoint: { videoId: musicId } } });
    const tileChannel = h.card(id(32), 'ytlr-tile-renderer', { contentType: 'TILE_CONTENT_TYPE_CHANNEL', onSelectCommand: { watchEndpoint: { videoId: musicId } } });
    await wait(800);
    t('kinds: MUSIC and SHORT lockups plus reel tile receive badges', music.hasAttribute(BADGE) && short.hasAttribute(BADGE) && reel.hasAttribute(BADGE));
    t('kinds: playlist/mix/channel lockups and playlist tile are not queried or badged',
      !playlist.hasAttribute(BADGE) && !mix.hasAttribute(BADGE) && !channel.hasAttribute(BADGE) &&
      !tilePlaylist.hasAttribute(BADGE) && !tileMix.hasAttribute(BADGE) && !tileChannel.hasAttribute(BADGE) &&
      [playlistId, mixId, channelId, tilePlaylistId, id(31), id(32)].every((videoId) => h.requests.indexOf(videoId) === -1));
    h.close();
  }

  // Duplicate cards and wrapper ownership share one request.
  {
    const h = boot({ markAiVideos: true }, { answers: { [id(30)]: 'ai' } });
    const tileCard = h.card(id(30));
    const lockupCard = h.card(id(30), 'yt-lockup-view-model');
    const wrapped = h.wrapperLockup(id(30));
    await wait(700);
    t('duplicates: one lookup marks each card owner, including the wrapper once',
      h.requests.filter((videoId) => videoId === id(30)).length === 1 &&
      tileCard.hasAttribute(BADGE) && lockupCard.hasAttribute(BADGE) && wrapped.wrapper.hasAttribute(BADGE) && !wrapped.inner.hasAttribute(BADGE));
    h.close();
  }

  // Errors never count as a negative or positive AI classification.
  {
    const failures = ['403', '429', '500', 'invalidjson', 'timeout', 'network'];
    const answers = {};
    const cards = [];
    const h = boot({ markAiVideos: true }, { answers });
    for (let i = 0; i < failures.length; i++) {
      const videoId = id(40 + i);
      answers[videoId] = failures[i];
      cards.push(h.card(videoId));
    }
    await wait(900);
    t('failures: HTTP, invalid JSON, timeout and network errors leave cards unbadged and IDs unstored',
      cards.every((card) => !card.hasAttribute(BADGE)) && failures.every((_, i) => storedIds(h.win).indexOf(id(40 + i)) === -1));
    h.close();
  }

  // Turning Mark off restores prior badges and prevents a late pending answer from adding one.
  {
    const h = boot({ markAiVideos: true }, {
      answers: { [id(50)]: 'ai', [id(51)]: 'ai' }, delayFor: { [id(50)]: 0, [id(51)]: 400 }
    });
    const existing = h.card(id(50));
    const pending = h.card(id(51));
    await wait(150);
    const watch = watchBadge(h.win, pending);
    t('toggle setup: first AI card is already badged while second lookup is pending', existing.hasAttribute(BADGE) && !pending.hasAttribute(BADGE));
    const mark = await openMarkBox(h);
    mark.click();
    await wait(500);
    t('toggle off: existing badge removed and late AI reply never badges pending card',
      !existing.hasAttribute(BADGE) && !pending.hasAttribute(BADGE) && !watch.observed.added,
      JSON.stringify({ existing: existing.getAttribute(BADGE), pending: pending.getAttribute(BADGE), added: watch.observed.added, mark: mark.checked, disabled: mark.disabled }));
    watch.stop();
    h.close();
  }

  // Badge work must not affect video playback or navigation.
  {
    const h = boot({ markAiVideos: true }, { answers: { [id(60)]: 'ai' } });
    const card = h.card(id(60));
    const video = h.doc.createElement('video');
    video.src = 'blob:https://www.youtube.com/playing';
    h.doc.body.appendChild(video);
    let pauses = 0;
    video.pause = () => { pauses++; };
    const href = h.win.location.href;
    await wait(700);
    t('player: video playback and location are untouched', video.getAttribute('src') === 'blob:https://www.youtube.com/playing' && pauses === 0 && h.win.location.href === href && card.hasAttribute(BADGE));
    h.close();
  }

  // Static cards need a containing block; positioned cards preserve the empty attribute value.
  {
    const h = boot({ markAiVideos: true }, { answers: { [id(70)]: 'ai', [id(71)]: 'ai' } });
    const staticCard = h.card(id(70));
    staticCard.style.position = 'static';
    const positionedCard = h.card(id(71));
    positionedCard.style.position = 'absolute';
    await wait(700);
    t('badge positioning: static card gets static value and positioned card gets empty value',
      staticCard.getAttribute(BADGE) === 'static' && positionedCard.getAttribute(BADGE) === '',
      JSON.stringify({ staticValue: staticCard.getAttribute(BADGE), staticComputed: h.win.getComputedStyle(staticCard).position, positionedValue: positionedCard.getAttribute(BADGE), positionedComputed: h.win.getComputedStyle(positionedCard).position }));
    h.close();
  }

  {
    const learned = id(9), unknown = id(10), expired = id(11);
    const store = JSON.stringify([{ id: learned, expiresAt: Date.now() + 86400000 }, { id: expired, expiresAt: Date.now() - 1 }]);
    const cases = [
      ['HOME', [lockup(learned), tile(learned), tile(unknown), tile(expired), lockup(learned, 'LOCKUP_CONTENT_TYPE_PLAYLIST'), lockup(learned, 'LOCKUP_CONTENT_TYPE_MIX'), tile(learned, 'TILE_CONTENT_TYPE_PLAYLIST'), tile(learned, 'TILE_CONTENT_TYPE_MIX'), { lockupViewModel: { contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentId: unknown, rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: learned } } } } } } }]],
      ['SEARCH', [lockup(learned), tile(unknown)]],
      ['CONTINUATION', [tile(learned), lockup(unknown)]],
      ['BROWSE_TABS', [lockup(learned), tile(unknown)]]
    ];
    for (let c = 0; c < cases.length; c++) {
      const surface = cases[c][0];
      const h = boot({ removeAiVideos: true }, { aiStore: store });
      const out = h.win.JSON.parse(h.NS(responseFor(surface, cases[c][1])));
      const actual = resultItems(h.win, out, surface);
      const expectedLength = surface === 'HOME' ? 7 : 1;
      t('JSON ' + surface + ': removes learned video ids and keeps non-video/unknown/expired items', actual.length === expectedLength, 'items: ' + actual.length);
      h.close();
    }
    for (const cfg of [{ removeAiVideos: false }, { removeAiVideos: true, enableAdBlock: false }]) {
      const h = boot(cfg, { aiStore: store });
      const out = h.win.JSON.parse(h.NS(responseFor('CONTINUATION', [tile(learned)])));
      t('JSON removal disabled by option or Ad Blocking', resultItems(h.win, out, 'CONTINUATION').length === 1);
      h.close();
    }
  }

  // First encounter learns and marks; the persisted result is available after restart.
  {
    const startedAt = Date.now();
    const h = boot({ removeAiVideos: true }, { answers: { [id(1)]: 'ai' } });
    const ai = h.card(id(1));
    const plain = h.card(id(2));
    await wait(700);
    t('first encounter: confirmed AI card receives badge', ai.hasAttribute(BADGE));
    t('first encounter: card remains visible while label is learned', h.win.getComputedStyle(ai).display !== 'none');
    t('first encounter: confirmed id persisted', storedIds(h.win).indexOf(id(1)) !== -1, h.win.localStorage.getItem('ytaf-ai-videos'));
    const learned = JSON.parse(h.win.localStorage.getItem('ytaf-ai-videos')).filter((entry) => entry.id === id(1))[0];
    t('first encounter: learned id gets a 30-day TTL', learned.expiresAt > startedAt + 29 * 86400000 && learned.expiresAt <= Date.now() + 30 * 86400000);
    t('first encounter: ordinary card remains unmarked', !plain.hasAttribute(BADGE));
    const saved = h.win.localStorage.getItem('ytaf-ai-videos');
    h.close();

    const h2 = boot({ removeAiVideos: true }, { aiStore: saved });
    const response = responseFor('HOME', [lockup(id(1))]);
    const out = h2.win.JSON.parse(h2.NS(response));
    const sections = out.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
    t('second encounter: stored id filters before render', sections.length === 0);
    h2.close();
  }

  {
    const h = boot({ enableAdBlock: false, markAiVideos: true }, {
      aiStore: JSON.stringify([{ id: id(5), expiresAt: Date.now() + 86400000 }]),
      answers: { [id(6)]: 'ai' }
    });
    const card = h.card(id(6));
    const out = h.win.JSON.parse(h.NS(responseFor('CONTINUATION', [tile(id(5))])));
    await wait(700);
    t('Mark mode: badge works without Ad Blocking', card.hasAttribute(BADGE));
    t('Mark mode: AI result persists learned id', storedIds(h.win).indexOf(id(6)) !== -1);
    t('Mark mode: badges do not remove learned JSON items', resultItems(h.win, out, 'CONTINUATION').length === 1);
    h.close();
  }

  {
    const h = boot({ markAiVideos: true }, { delay: 150, answers: { [id(7)]: 'ai' } });
    const card = h.card(id(7));
    await wait(80);
    card.__instance.props.data = { contentType: 'TILE_CONTENT_TYPE_VIDEO', onSelectCommand: { watchEndpoint: { videoId: id(8) } } };
    await wait(500);
    t('stale confirmed result: ID is learned after the rendered card is recycled', storedIds(h.win).indexOf(id(7)) !== -1);
    h.close();
  }

  // Unconfirmed results and corrupt storage are safe; "not AI" retracts a learned id.
  {
    const h = boot({ markAiVideos: true }, { aiStore: '{broken', answers: { [id(3)]: 'plain' } });
    const c = h.card(id(3));
    await wait(700);
    t('corrupt storage: starts empty without throwing', storedIds(h.win).length === 0);
    t('not AI: card is not marked', !c.hasAttribute(BADGE));
    h.close();
  }
  {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const expired = JSON.stringify([{ id: id(4), expiresAt: old }]);
    const h = boot({ removeAiVideos: true }, { aiStore: expired });
    const response = { responseContext: { pad: 'z'.repeat(600) }, continuationContents: { gridContinuation: { items: [
      { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_VIDEO', onSelectCommand: { watchEndpoint: { videoId: id(4) } } } }
    ] } } };
    const out = h.win.JSON.parse(h.NS(response));
    t('expired id: kept in continuation', out.continuationContents.gridContinuation.items.length === 1);
    h.close();
  }

  {
    const h = boot({ markAiVideos: true }, {
      aiStore: JSON.stringify([{ id: id(5), expiresAt: Date.now() + 86400000 }]),
      answers: { [id(5)]: 'plain' }
    });
    h.card(id(5));
    await wait(800);
    t('not AI result: removes previously learned id', storedIds(h.win).indexOf(id(5)) === -1, h.win.localStorage.getItem('ytaf-ai-videos'));
    h.close();
  }

  // Persistence shape is bounded and TTLs are refreshed at confirmation.
  {
    const entries = [];
    for (let i = 0; i < 2001; i++) entries.push({ id: 'saved' + i, expiresAt: Date.now() + 100000 + i });
    const h = boot({ removeAiVideos: true }, { aiStore: JSON.stringify(entries) });
    h.win.JSON.parse(h.NS(responseFor('CONTINUATION', [tile(id(999))])));
    await wait(300);
    const valid = storedIds(h.win);
    t('store cap: at most 2000 ids retained', valid.length <= 2000, String(valid.length));
    t('store cap: oldest id evicted', valid.indexOf('saved0') === -1);
    h.close();
  }

  console.log(`AI filter tests: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
