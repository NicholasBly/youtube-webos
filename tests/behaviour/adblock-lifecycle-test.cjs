/**
 * The JSON.parse hook's life against the built bundle: the Live filter and
 * the Shorts guide entry on pages of their own, then the hook installed once
 * with the flags doing the switching: every switch off, the dependent filters
 * idle without Ad Blocking, the emoji fix on its own, Tracking Block's XHR
 * hooks coming and going with Ad Blocking, a reused XHR object, and Ad
 * Blocking toggled through the panel, for both the parse and the stringify
 * hook.
 *
 * Run: node tests/behaviour/adblock-lifecycle-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, panelCheckbox, showPanel } = require('../harness/fixtures.cjs');
const {
  PAD,
  browseResponse,
  shelfOf,
  sectionsOf,
  shelfItemsOf
} = require('../harness/gen-payload.cjs');

const legacy = flavour === 'legacy';
const report = createReport();
const t = report.check;
const pad = PAD; // keeps every payload over the 500-byte gate
const nativeStringify = JSON.stringify;

(async () => {
  // ---- the Live filter and the Shorts guide entry, on pages of their own ---------------
  // A shelf item in the lockupViewModel shape, with an optional LIVE badge.
  const lockupItem = (id, live, extraOverlayFirst) => {
    const overlays = [];
    // Deliberately put a non-badge overlay first: the badge is not always [0].
    if (extraOverlayFirst) overlays.push({ thumbnailOverlayProgressBarViewModel: { p: 1 } });
    overlays.push({
      thumbnailBottomOverlayViewModel: {
        badges: [
          {
            thumbnailBadgeViewModel: {
              badgeStyle: live
                ? 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE'
                : 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT',
              text: live ? 'LIVE' : '12:34'
            }
          }
        ]
      }
    });
    return {
      lockupViewModel: { contentId: id, contentImage: { thumbnailViewModel: { overlays } } }
    };
  };
  const shelfBody = (items) => nativeStringify(browseResponse([shelfOf(items)]));
  {
    const { win } = createPage({ config: { removeLiveVideos: true } });
    const out = win.JSON.parse(
      shelfBody([
        lockupItem('a', false),
        lockupItem('b', true),
        lockupItem('c', true, true), // badge NOT at overlays[0]
        lockupItem('d', false)
      ])
    );
    const ids = shelfItemsOf(out).map((i) => i.lockupViewModel.contentId);
    t(
      'live: live lockup items are removed, the badge found even when it is not overlays[0]',
      JSON.stringify(ids) === JSON.stringify(['a', 'd']),
      JSON.stringify(ids)
    );
    const fallbacks = win.JSON.parse(
      shelfBody([
        { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_VIDEO', x: 1 } },
        {
          tileRenderer: {
            header: {
              tileHeaderRenderer: {
                thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }]
              }
            }
          }
        },
        { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_LIVE' } }
      ])
    );
    t(
      'live: the tileRenderer fallback shapes are filtered too',
      shelfItemsOf(fallbacks).length === 1,
      'left ' + shelfItemsOf(fallbacks).length
    );
  }
  {
    const { win } = createPage({ config: { removeLiveVideos: false } });
    const out = win.JSON.parse(shelfBody([lockupItem('a', false), lockupItem('b', true)]));
    t('live: nothing removed when the filter is off', shelfItemsOf(out).length === 2);
  }
  const tab = (title, browseId) => ({
    tabRenderer: { title, endpoint: { browseEndpoint: { browseId } } }
  });
  const guideTabs = (tabs) => ({
    responseContext: { _pad: pad },
    contents: {
      tvBrowseRenderer: {
        content: {
          tvSecondaryNavRenderer: { sections: [{ tvSecondaryNavSectionRenderer: { tabs } }] }
        }
      }
    }
  });
  const guideEntries = (items) => ({ responseContext: { _pad: pad }, items });
  const shortsEntry = (title) => ({
    guideEntryRenderer: {
      title: { simpleText: title },
      navigationEndpoint: { browseEndpoint: { browseId: 'FEshorts' } }
    }
  });
  {
    const { win } = createPage({ config: { removeGlobalShorts: true } });
    const out = win.JSON.parse(
      nativeStringify(
        guideTabs([
          tab('Home', 'FEwhat_to_watch'),
          tab('Shorts', 'FEshorts'),
          tab('Subscriptions', 'FEsubscriptions')
        ])
      )
    );
    const titles =
      out.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections[0].tvSecondaryNavSectionRenderer.tabs.map(
        (x) => x.tabRenderer.title
      );
    t(
      'guide: the Shorts tab is removed from the secondary nav',
      JSON.stringify(titles) === JSON.stringify(['Home', 'Subscriptions']),
      JSON.stringify(titles)
    );
    // guideEntryRenderer shape, identified by endpoint rather than title.
    const entries = win.JSON.parse(
      nativeStringify(
        guideEntries([
          { guideEntryRenderer: { title: { simpleText: 'Home' } } },
          shortsEntry('Kurzfilme'),
          { guideEntryRenderer: { title: { simpleText: 'Library' } } }
        ])
      )
    );
    const names = entries.items.map((x) => x.guideEntryRenderer.title.simpleText);
    t(
      'guide: a localized Shorts entry is removed by its endpoint',
      JSON.stringify(names) === JSON.stringify(['Home', 'Library']),
      JSON.stringify(names)
    );
  }
  {
    const { win } = createPage({ config: { removeGlobalShorts: false } });
    const out = win.JSON.parse(nativeStringify(guideEntries([shortsEntry('Shorts')])));
    t('guide: left alone when Remove Shorts is off', out.items.length === 1);
  }
  {
    // The other guide and tab shapes: a section of entries, the pivot bar,
    // a tab named by its identifier, and the Live entry.
    const { win } = createPage({ config: { removeGlobalShorts: true, removeLiveVideos: true } });
    const home = { guideEntryRenderer: { title: { simpleText: 'Home' } } };
    const live = {
      guideEntryRenderer: {
        title: { simpleText: 'Live' },
        navigationEndpoint: { browseEndpoint: { browseId: 'FEtopics_live' } }
      }
    };
    const out = win.JSON.parse(
      nativeStringify(
        guideEntries([
          { guideSectionRenderer: { items: [home, shortsEntry('Shorts'), live] } },
          { pivotBarItemRenderer: { title: 'Shorts' } },
          { tabRenderer: { tabIdentifier: 'Shorts' } },
          { pivotBarItemRenderer: { title: 'Library' } }
        ])
      )
    );
    const section = out.items[0].guideSectionRenderer.items.map(
      (x) => x.guideEntryRenderer.title.simpleText
    );
    t(
      'guide: inside a section the Shorts and Live entries go',
      JSON.stringify(section) === JSON.stringify(['Home']),
      JSON.stringify(section)
    );
    t(
      'guide: a pivot bar item and a tab named Shorts go, the others stay',
      out.items.length === 2 && out.items[1].pivotBarItemRenderer.title === 'Library',
      JSON.stringify(out.items.map((x) => Object.keys(x)[0]))
    );
  }

  // ---- the hook is installed once; the flags do the switching ----
  const browseWith = (items) => JSON.stringify(browseResponse(items));
  const shortsShelf = {
    shelfRenderer: { tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS' }
  };
  const keep = { shelfRenderer: { title: { runs: [{ text: 'Keep' }] } } };
  const sections = sectionsOf;
  const allOff = {
    enableAdBlock: false,
    enableTrackingBlock: false,
    removeGlobalShorts: false,
    removeLiveVideos: false,
    removeTopLiveGames: false,
    removeMostRelevant: false,
    hideGuestSignInPrompts: false,
    hideEndcards: false,
    enableLegacyEmojiFix: false,
    upgradeThumbnails: false
  };

  // Every switch off: the hook stays installed and lets everything through.
  {
    const page = createPage({ config: allOff });
    const w = page.win;
    t('all off: JSON.parse is still the hook', w.JSON.parse !== page.NP);
    const out = w.JSON.parse(browseWith([shortsShelf, { adSlotRenderer: {} }, keep]));
    t('all off: nothing is filtered', sections(out).length === 3, String(sections(out).length));
  }

  // Ad Blocking off: its dependent filters stay idle, as the panel says.
  {
    const cfg = Object.assign({}, allOff, {
      removeGlobalShorts: true,
      hideGuestSignInPrompts: true
    });
    const page = createPage({ config: cfg });
    const out = page.win.JSON.parse(browseWith([shortsShelf, { feedNudgeRenderer: {} }, keep]));
    t(
      'Ad Blocking off: Shorts and guest prompts are left alone',
      sections(out).length === 3,
      String(sections(out).length)
    );
  }

  // The legacy emoji fix has its own switch and works without Ad Blocking.
  if (legacy) {
    const cfg = Object.assign({}, allOff, { enableLegacyEmojiFix: true });
    const page = createPage({ config: cfg });
    const out = page.win.JSON.parse(
      browseWith([{ shelfRenderer: { title: { runs: [{ text: 'Music 😀 mix' }] } } }])
    );
    const text = sections(out)[0]
      .shelfRenderer.title.runs.map((r) => r.text)
      .join('|');
    t('emoji fix without Ad Blocking: the title is wrapped', text.indexOf('\u200B') !== -1, text);
  }

  // Tracking Block rides on Ad Blocking: without it the XHR hooks are not installed.
  {
    const telemetry = 'https://www.youtube.com/youtubei/v1/log_event?k=1';
    const off = createPage({
      config: Object.assign({}, allOff, { enableTrackingBlock: true }),
      xhr: 'record'
    });
    new off.win.XMLHttpRequest().open('POST', telemetry);
    const offUrls = off.requests.map((r) => r.url);
    t(
      'Tracking Block without Ad Blocking: telemetry is not blocked',
      offUrls.length === 1 && offUrls[0] === telemetry,
      offUrls.join(' | ')
    );
    const on = createPage({
      config: Object.assign({}, allOff, { enableAdBlock: true, enableTrackingBlock: true }),
      xhr: 'record'
    });
    new on.win.XMLHttpRequest().open('POST', telemetry);
    const onUrls = on.requests.map((r) => r.url);
    t(
      'with both on: telemetry never reaches the request',
      !onUrls.some((u) => u.indexOf('log_event') !== -1),
      onUrls.join(' | ')
    );
    // The path decides, as for fetch: a blocked path inside the query is not telemetry.
    const query = 'https://www.youtube.com/youtubei/v1/next?ref=/pagead/x';
    new on.win.XMLHttpRequest().open('POST', query);
    t(
      'an XHR with a blocked path only in its query string is not blocked',
      on.requests.some((r) => r.url === query),
      on.requests.map((r) => r.url).join(' | ')
    );
  }

  // A reused XHR object: the flag set while the block was on does not outlive it.
  {
    const telemetry = 'https://www.youtube.com/youtubei/v1/log_event?k=1';
    const opened = [];
    const sent = [];
    const page = createPage({
      config: Object.assign({}, allOff, { enableAdBlock: true, enableTrackingBlock: true }),
      xhr: class {
        open(method, url) {
          opened.push(String(url));
        }
        send(body) {
          sent.push(body);
        }
        setRequestHeader() {}
        getResponseHeader() {
          return null;
        }
        addEventListener() {}
      }
    });
    const w = page.win;
    const x = new w.XMLHttpRequest();
    x.open('POST', telemetry);
    x.send('telemetry body');
    t(
      'setup: with the block on the telemetry body is dropped',
      opened[0] !== telemetry && sent[0] === undefined,
      opened.join(' | ') + ' / ' + sent.join(' | ')
    );
    await showPanel(page);
    panelCheckbox(w, 'Ad Blocking').click();
    await wait(20);
    x.open('POST', telemetry);
    x.send('next body');
    t(
      'with the block off again the same XHR object sends its body',
      opened[opened.length - 1] === telemetry && sent[sent.length - 1] === 'next body',
      opened.join(' | ') + ' / ' + sent.join(' | ')
    );
  }

  // Ad Blocking turned on at runtime with Tracking Block already on: the block starts.
  {
    const telemetry = 'https://www.youtube.com/youtubei/v1/log_event?k=1';
    const page = createPage({
      config: Object.assign({}, allOff, { enableTrackingBlock: true }),
      xhr: 'record'
    });
    const w = page.win;
    new w.XMLHttpRequest().open('POST', telemetry);
    t('setup: without Ad Blocking telemetry passes', page.requests.length === 1);
    await showPanel(page);
    panelCheckbox(w, 'Ad Blocking').click();
    await wait(20);
    new w.XMLHttpRequest().open('POST', telemetry);
    const urls = page.requests.map((r) => r.url);
    t(
      'Ad Blocking turned on: Tracking Block takes effect at once',
      urls.length === 2 && urls[1].indexOf('log_event') === -1,
      urls.join(' | ')
    );
  }

  // webOS 3 to 6: fetch is the bundle's whatwg-fetch polyfill (over XMLHttpRequest),
  // and Tracking Block cancels telemetry through the same fetch registry.
  if (legacy) {
    const page = createPage({
      config: Object.assign({}, allOff, { enableAdBlock: true, enableTrackingBlock: true }),
      xhr: 'record',
      fetch: false
    });
    const w = page.win;
    let rejected = null;
    await w.fetch('https://www.youtube.com/api/stats/qoe?ns=yt').then(
      () => (rejected = false),
      (e) => (rejected = !!e && e.name === 'TypeError')
    );
    const urls = page.requests.map((r) => r.url);
    t(
      'legacy: telemetry through the whatwg-fetch polyfill is cancelled as a failed fetch',
      rejected === true && !urls.some((u) => u.indexOf('api/stats') !== -1),
      rejected + ' / ' + urls.join(' | ')
    );
    w.fetch('https://www.youtube.com/youtubei/v1/browse?key=x').catch(() => {});
    await wait(20);
    t(
      'legacy: an ordinary request goes out through the polyfill',
      page.requests.some((r) => r.url.indexOf('youtubei/v1/browse') !== -1),
      page.requests.map((r) => r.url).join(' | ')
    );
  }

  // Ad Blocking toggled off and on through the panel: the hooks survive and work again.
  {
    const cfg = Object.assign({}, allOff, { enableAdBlock: true });
    const page = createPage({ config: cfg });
    const w = page.win;
    // Whether JSON.stringify puts the no-ad flag into a player request.
    const flagged = () => {
      const body = {
        videoId: 'abc',
        context: { client: {} },
        playbackContext: { contentPlaybackContext: {} }
      };
      return JSON.parse(w.JSON.stringify(body)).playbackContext.contentPlaybackContext
        .isInlinePlaybackNoAd;
    };
    t('toggle: with Ad Blocking on, a player request goes out flagged', flagged() === true);
    await showPanel(page);
    const box = panelCheckbox(w, 'Ad Blocking');
    t('toggle: the Ad Blocking checkbox is on the panel', !!box && box.checked === true);
    box.click();
    await wait(20);
    const off = w.JSON.parse(browseWith([{ adSlotRenderer: {} }, keep]));
    t('toggle off: ads pass through', sections(off).length === 2, String(sections(off).length));
    t('toggle off: the player request goes out as built', flagged() === undefined);
    box.click();
    await wait(20);
    const on = w.JSON.parse(browseWith([{ adSlotRenderer: {} }, keep]));
    t(
      'toggle on: ads are removed again by the same hook',
      sections(on).length === 1 && w.JSON.parse !== page.NP,
      String(sections(on).length)
    );
    t('toggle on: the player request is flagged again', flagged() === true);
  }

  report.finish();
})();
