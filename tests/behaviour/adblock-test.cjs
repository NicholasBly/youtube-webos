/**
 * The JSON.parse filtering hook against the built bundle, every filter on:
 * ad removal, Shorts removal, shelf-title removal, endcard and attestation
 * stripping, trackingParams blanking, emoji wrapping (whole sequences, and
 * the runs of an attributed string moved with its text), received actions and
 * endpoints in one body, the bounded search as a budget, and the guards that
 * must NOT fire. The Live filter and the guide
 * on pages of their own, and the hook's life as the switches change, are
 * adblock-lifecycle-test.cjs.
 *
 * Run: node tests/behaviour/adblock-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  PAD,
  browseResponse,
  shelfOf,
  sectionsOf,
  shelfItemsOf
} = require('../harness/gen-payload.cjs');

const legacy = flavour === 'legacy';

// Every filter on: the most work the hook can be configured to do.
const page = createPage({
  raf: 'timeout',
  config: {
    enableTrackingBlock: true,
    removeGlobalShorts: true,
    removeLiveVideos: true,
    removeTopLiveGames: true,
    removeMostRelevant: true,
    hideGuestSignInPrompts: true,
    hideEndcards: true,
    enableLegacyEmojiFix: true
  }
});
const win = page.win;
const nativeStringify = page.NS;

const report = createReport();
const t = report.check;
const pad = PAD; // keeps every payload over the 500-byte gate

(async () => {
  const P = win.JSON.parse;

  // ---- HOME_BROWSE: ads, Shorts shelves, titled shelves ----
  const browse = {
    responseContext: { visitorData: 'x', _pad: pad },
    contents: {
      tvBrowseRenderer: {
        content: {
          tvSurfaceContentRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    shelfRenderer: {
                      title: { runs: [{ text: 'Keep me' }] },
                      content: {
                        horizontalListRenderer: {
                          items: [
                            {
                              tileRenderer: {
                                style: 'TILE_STYLE_YTLR_DEFAULT',
                                trackingParams: 'tp-tile'
                              }
                            },
                            { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
                            { adSlotRenderer: {} }
                          ]
                        }
                      }
                    }
                  },
                  { shelfRenderer: { title: { runs: [{ text: 'Shorts' }] } } },
                  {
                    shelfRenderer: {
                      tvhtml5ShelfRendererType: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS'
                    }
                  },
                  { shelfRenderer: { title: { runs: [{ text: 'Top live games' }] } } },
                  { shelfRenderer: { title: { runs: [{ text: 'Most relevant' }] } } },
                  { adSlotRenderer: {} },
                  { tvMastheadRenderer: {} },
                  { feedNudgeRenderer: {} }
                ]
              }
            }
          }
        }
      }
    },
    trackingParams: 'tp-root'
  };
  const b = P(nativeStringify(browse));
  const secs =
    b.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer
      .contents;
  t(
    'browse: only the keepable shelf survives',
    secs.length === 1,
    'got ' + secs.length + ' sections'
  );
  t('browse: shelf title preserved', secs[0]?.shelfRenderer?.title?.runs?.[0]?.text === 'Keep me');
  const inner = secs[0]?.shelfRenderer?.content?.horizontalListRenderer?.items || [];
  t(
    'browse: nested ad + shorts tile removed',
    inner.length === 1,
    'got ' + inner.length + ' tiles'
  );
  t('browse: trackingParams blanked at root', b.trackingParams === '');
  t('browse: trackingParams blanked nested', inner[0]?.tileRenderer?.trackingParams === '');

  // ---- trackingParams: every depth, and what the blanking must leave alone ----
  {
    let deep = { trackingParams: 'CAEQ_deep' };
    for (let i = 0; i < 18; i++) deep = { child: deep, trackingParams: 'CAEQ_' + i };
    const resp = {
      responseContext: { _pad: pad },
      contents: { singleColumnWatchNextResults: { deep } },
      clickTrackingParams: 'CAEQ_click',
      odd: { trackingParams: 'has a " quote', clickTrackingParams: 'CAEQ_odd' }
    };
    const out = P(nativeStringify(resp));
    let node = out.contents.singleColumnWatchNextResults.deep;
    let left = 0;
    for (let depth = 0; node; depth++) {
      if (node.trackingParams !== '') left++;
      node = node.child;
    }
    t(
      'trackingParams is blanked at every depth, 20 levels down included',
      left === 0,
      String(left)
    );
    t(
      'clickTrackingParams is left alone',
      out.clickTrackingParams === 'CAEQ_click' && out.odd.clickTrackingParams === 'CAEQ_odd'
    );
    t(
      'a trackingParams holding an escaped quote is left as it was',
      out.odd.trackingParams === 'has a " quote',
      String(out.odd.trackingParams)
    );
  }

  // ---- PLAYER: ads, endcards, attestation, QR overlay ----
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
  t(
    'player: QR timelyActionRenderers removed',
    p.playerOverlays.playerOverlayRenderer.timelyActionRenderers === undefined
  );
  t('player: streamingData untouched', p.streamingData.formats[0].itag === 18);

  // ---- CONTINUATION grid ----
  const cont = {
    responseContext: { _pad: pad },
    continuationContents: {
      gridContinuation: {
        items: [
          { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
          { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
          { adSlotRenderer: {} },
          { tileRenderer: { onSelectCommand: { reelWatchEndpoint: {} } } }
        ]
      }
    }
  };
  const c = P(nativeStringify(cont));
  t(
    'continuation: shorts + ads filtered from grid',
    c.continuationContents.gridContinuation.items.length === 1,
    'got ' + c.continuationContents.gridContinuation.items.length
  );

  // ---- CONTINUATION: a horizontal list, and a TV surface's section list ----
  const keepTile = { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } };
  const shortsTile = { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } };
  const horizontal = P(
    nativeStringify({
      responseContext: { _pad: pad },
      continuationContents: {
        horizontalListContinuation: { items: [keepTile, { adSlotRenderer: {} }, shortsTile] }
      }
    })
  );
  t(
    'continuation: a horizontal list continuation is filtered',
    horizontal.continuationContents.horizontalListContinuation.items.length === 1,
    'got ' + horizontal.continuationContents.horizontalListContinuation.items.length
  );
  const surface = P(
    nativeStringify({
      responseContext: { _pad: pad },
      continuationContents: {
        tvSurfaceContentContinuation: {
          content: { sectionListRenderer: { contents: [shelfOf([keepTile, shortsTile])] } }
        }
      }
    })
  );
  const surfaceItems =
    surface.continuationContents.tvSurfaceContentContinuation.content.sectionListRenderer
      .contents[0].shelfRenderer.content.horizontalListRenderer.items;
  t(
    "continuation: a TV surface continuation's shelves are filtered",
    surfaceItems.length === 1,
    'got ' + surfaceItems.length
  );

  // ---- the item shapes: an expanded shelf, a reel item, a reel ad, a guest prompt ----
  const expanded = P(
    nativeStringify(
      browseResponse([
        {
          shelfRenderer: {
            content: {
              expandedShelfContentsRenderer: {
                items: [
                  keepTile,
                  { reelItemRenderer: { videoId: 'shortsreel1' } },
                  { command: { reelWatchEndpoint: { adClientParams: { isAd: 'true' } } } },
                  { command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } },
                  { alertWithActionsRenderer: { title: { simpleText: 'Sign in' } } }
                ]
              }
            }
          }
        }
      ])
    )
  );
  const expandedItems =
    sectionsOf(expanded)[0].shelfRenderer.content.expandedShelfContentsRenderer.items;
  t(
    'an expanded shelf: the reel item, both reel ads and the guest prompt go, the tile stays',
    expandedItems.length === 1 && !!expandedItems[0].tileRenderer,
    JSON.stringify(expandedItems.map((i) => Object.keys(i)[0]))
  );

  // ---- ACTION: appended continuation items ----
  const action = {
    responseContext: { _pad: pad },
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
            { adSlotRenderer: {} }
          ]
        }
      }
    ]
  };
  const a = P(nativeStringify(action));
  t(
    'action: ads filtered from appended items',
    a.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems.length === 1
  );

  // ---- a continuation or received actions beside the main content ----
  const nextWithCont = {
    responseContext: { _pad: pad },
    contents: { singleColumnWatchNextResults: {} },
    continuationContents: {
      gridContinuation: {
        items: [
          { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
          { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
          { adSlotRenderer: {} }
        ]
      }
    }
  };
  const nc = P(nativeStringify(nextWithCont));
  t(
    'a continuation beside a NEXT body is filtered too',
    nc.continuationContents.gridContinuation.items.length === 1,
    'got ' + nc.continuationContents.gridContinuation.items.length
  );
  const contWithActions = {
    responseContext: { _pad: pad },
    continuationContents: {
      gridContinuation: { items: [{ tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } }] }
    },
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
            { adSlotRenderer: {} }
          ]
        }
      }
    ]
  };
  const ca = P(nativeStringify(contWithActions));
  t(
    'received actions beside a CONTINUATION body are filtered too',
    ca.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems.length === 1
  );

  // ---- both received-action arrays in one body ----
  const bothArrays = {
    responseContext: { _pad: pad },
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
            { adSlotRenderer: {} }
          ]
        }
      }
    ],
    onResponseReceivedEndpoints: [
      {
        reloadContinuationItemsCommand: {
          continuationItems: [
            { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
            { adSlotRenderer: {} }
          ]
        }
      }
    ]
  };
  const both = P(nativeStringify(bothArrays));
  t(
    'a body with received actions and endpoints: the items of both are filtered',
    both.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems.length ===
      1 &&
      both.onResponseReceivedEndpoints[0].reloadContinuationItemsCommand.continuationItems
        .length === 1
  );

  // ---- SEARCH: bare items in the section list get the rule the shelf items get ----
  const search = {
    responseContext: { _pad: pad },
    contents: {
      sectionListRenderer: {
        contents: [
          { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } },
          { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
          { tileRenderer: { contentType: 'TILE_CONTENT_TYPE_LIVE' } },
          { adSlotRenderer: {} }
        ]
      }
    }
  };
  const s = P(nativeStringify(search));
  t(
    'search: a bare Shorts tile, a live stream and an ad go, the plain tile stays',
    s.contents.sectionListRenderer.contents.length === 1 &&
      s.contents.sectionListRenderer.contents[0].tileRenderer.style === 'TILE_STYLE_YTLR_DEFAULT',
    'got ' + s.contents.sectionListRenderer.contents.length
  );

  // ---- NEXT: the pivot's guest prompt, the QR prompt, text in the watch-next tree ----
  const next = {
    responseContext: { _pad: pad },
    contents: {
      singleColumnWatchNextResults: {
        pivot: {
          sectionListRenderer: {
            contents: [
              { feedNudgeRenderer: {} },
              { shelfRenderer: { title: { runs: [{ text: 'Up next' }] } } }
            ]
          }
        },
        results: { title: { simpleText: 'Watch 😀 next' } }
      }
    },
    playerOverlays: { playerOverlayRenderer: { timelyActionRenderers: [{ qr: 1 }] } }
  };
  const n = P(nativeStringify(next));
  t(
    'next: the guest prompt in the pivot goes',
    n.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents.length === 1
  );
  t(
    'next: the QR prompt goes',
    n.playerOverlays.playerOverlayRenderer.timelyActionRenderers === undefined
  );

  // ---- SHORTS_SEQUENCE: reel ads go, the rest of the sequence stays ----
  const shortsSeq = {
    responseContext: { _pad: pad },
    entries: [
      { command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } },
      { command: { reelWatchEndpoint: { videoType: 'REEL_VIDEO_TYPE_AD' } } },
      { command: { reelWatchEndpoint: { videoId: 'x' } } }
    ]
  };
  const sq = P(nativeStringify(shortsSeq));
  t('shorts sequence: the reel ads go', sq.entries.length === 1, 'got ' + sq.entries.length);

  // ---- the fallback: a large body no schema path matches is searched ----
  const miss = {
    responseContext: { _pad: 'z'.repeat(10500) },
    somewhere: {
      deeper: {
        sectionListRenderer: {
          contents: [
            { shelfRenderer: { title: { runs: [{ text: 'Shorts' }] } } },
            { shelfRenderer: { title: { runs: [{ text: 'Keep' }] } } }
          ]
        },
        gridRenderer: {
          items: [{ adSlotRenderer: {} }, { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } }]
        }
      }
    }
  };
  const fb = P(nativeStringify(miss));
  t(
    'fallback: the Shorts shelf and the ad are found by the bounded search',
    fb.somewhere.deeper.sectionListRenderer.contents.length === 1 &&
      fb.somewhere.deeper.gridRenderer.items.length === 1
  );

  // ---- frameworkUpdates: trackingParams blanked in the walk (the emoji: the legacy section) ----
  const updates = {
    responseContext: { _pad: pad },
    contents: { singleColumnWatchNextResults: {} },
    frameworkUpdates: {
      entityBatchUpdate: {
        mutations: [{ trackingParams: 'tp', payload: { title: { simpleText: 'Hi 😀' } } }]
      }
    }
  };
  const fu = P(nativeStringify(updates));
  const mutation = fu.frameworkUpdates.entityBatchUpdate.mutations[0];
  t('frameworkUpdates: trackingParams blanked', mutation.trackingParams === '');

  // ---- a guest prompt as a grid button, received endpoints, an emptied shelf, a live tile ----
  const home = (items) => browseResponse([shelfOf(items, 'Row')]);
  const rowItems = shelfItemsOf;
  const gb = P(
    nativeStringify(
      home([
        {
          gridButtonRenderer: { title: { runs: [{ text: 'Sign in for better recommendations' }] } }
        },
        {
          tileRenderer: {
            header: {
              tileHeaderRenderer: {
                thumbnailOverlays: [{ thumbnailOverlayTimeStatusRenderer: { style: 'LIVE' } }]
              }
            }
          }
        },
        { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } }
      ])
    )
  );
  t(
    'the sign-in grid button and a tile with the LIVE time status go',
    rowItems(gb).length === 1 && rowItems(gb)[0].tileRenderer.style === 'TILE_STYLE_YTLR_DEFAULT',
    'got ' + rowItems(gb).length
  );
  const emptied = P(nativeStringify(home([{ adSlotRenderer: {} }])));
  t('a shelf emptied by the filter goes with its items', sectionsOf(emptied).length === 0);
  // A shelf that arrives with an empty list (filled in later) was not emptied here.
  const arrivedEmpty = P(nativeStringify(home([])));
  t(
    'a shelf that arrives with an empty list stays',
    sectionsOf(arrivedEmpty).length === 1,
    'got ' + sectionsOf(arrivedEmpty).length
  );
  const endpoints = {
    responseContext: { _pad: pad },
    onResponseReceivedEndpoints: [
      {
        reloadContinuationItemsCommand: {
          continuationItems: [
            { tileRenderer: { style: 'TILE_STYLE_YTLR_SHORTS' } },
            { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT' } }
          ]
        }
      }
    ]
  };
  const ep = P(nativeStringify(endpoints));
  t(
    'received endpoints: the reload command items are filtered',
    ep.onResponseReceivedEndpoints[0].reloadContinuationItemsCommand.continuationItems.length === 1
  );

  // ---- a reviver is honoured on a body that is also filtered ----
  const revived = P(
    nativeStringify(
      home([
        { adSlotRenderer: {} },
        { tileRenderer: { style: 'TILE_STYLE_YTLR_DEFAULT', marker: 1 } }
      ])
    ),
    (k, v) => (k === 'marker' ? 'revived' : v)
  );
  t(
    'a reviver runs and the filter still applies',
    rowItems(revived).length === 1 && rowItems(revived)[0].tileRenderer.marker === 'revived',
    'got ' + rowItems(revived).length
  );

  // ---- the bounded search as a budget: a schema hit costs no search at all ----
  {
    const dbg = createPage({
      config: { removeGlobalShorts: true, hideGuestSignInPrompts: true, enableTrackingBlock: true },
      raf: 'timeout',
      setup(win) {
        win.__ytaf_debug__ = true;
      }
    });
    const stats = dbg.win.__ytafAdblockStats;
    t('diagnostics expose the search counters', !!stats && typeof stats.calls === 'number');
    const snapshot = () => ({ calls: stats.calls, visits: stats.visits });
    const delta = (before) => ({
      calls: stats.calls - before.calls,
      visits: stats.visits - before.visits
    });
    let before = snapshot();
    dbg.win.JSON.parse(nativeStringify(browse));
    dbg.win.JSON.parse(nativeStringify(search));
    dbg.win.JSON.parse(nativeStringify(next));
    dbg.win.JSON.parse(nativeStringify(cont));
    let d = delta(before);
    t(
      'browse, search, next and continuation bodies cost no search',
      d.calls === 0,
      JSON.stringify(d)
    );
    before = snapshot();
    dbg.win.JSON.parse(nativeStringify(miss));
    d = delta(before);
    t(
      'a schema miss costs one search within its node budget',
      d.calls === 1 && d.visits > 0 && d.visits <= 400,
      JSON.stringify(d)
    );
    before = snapshot();
    dbg.win.JSON.parse(
      nativeStringify({
        responseContext: { _pad: pad },
        items: [
          {
            guideEntryRenderer: { navigationEndpoint: { browseEndpoint: { browseId: 'FEshorts' } } }
          }
        ]
      })
    );
    d = delta(before);
    t(
      'the small guide response costs one bounded search',
      d.calls === 1 && d.visits <= 50,
      JSON.stringify(d)
    );

    // A player response is parsed at every video start: with the guest-prompt
    // filter on, the pivot (NEXT's) is not searched for in it, and the QR
    // overlay is read along its path only.
    before = snapshot();
    dbg.win.JSON.parse(
      nativeStringify({
        responseContext: { _pad: pad },
        streamingData: { formats: [] },
        videoDetails: { videoId: 'x' }
      })
    );
    d = delta(before);
    t('a player response without the overlay costs no search', d.calls === 0, JSON.stringify(d));
    before = snapshot();
    dbg.win.JSON.parse(nativeStringify(player));
    d = delta(before);
    t(
      'a player response with the overlay at its path costs no search either',
      d.calls === 0,
      JSON.stringify(d)
    );
  }

  // ---- only the thumbnail pass on: the content filters are not run at all ----
  {
    // No diagnostics switch: the counters are on the page anyway.
    const thumbs = createPage({
      config: { enableAdBlock: false, enableLegacyEmojiFix: false, upgradeThumbnails: true },
      raf: 'timeout'
    });
    const stats = thumbs.win.__ytafAdblockStats || { calls: NaN };
    t(
      'the search counters are on window with diagnostics off too',
      typeof stats.calls === 'number' && !isNaN(stats.calls),
      JSON.stringify(stats)
    );
    const before = { calls: stats.calls };
    const out = thumbs.win.JSON.parse(nativeStringify(miss));
    t(
      'with no content filter on, a schema miss costs no search and keeps its items',
      stats.calls === before.calls &&
        out.somewhere.deeper.gridRenderer.items.length === 2 &&
        out.somewhere.deeper.sectionListRenderer.contents.length === 2,
      `${stats.calls - before.calls} searches`
    );
  }

  // ---- the Shorts guard: a search body parsed while a Short plays is left alone ----
  {
    const shorts = createPage({
      html: '<!doctype html><html><body class="WEB_PAGE_TYPE_SHORTS"><ytlr-app></ytlr-app></body></html>',
      config: { removeGlobalShorts: true, removeLiveVideos: true },
      raf: 'timeout'
    });
    const out = shorts.win.JSON.parse(nativeStringify(search));
    t(
      'on a Shorts page a search body is not filtered: the player would lose its list',
      out.contents.sectionListRenderer.contents.length === 4,
      'got ' + out.contents.sectionListRenderer.contents.length
    );
  }

  // ---- Guards that must NOT fire ----
  t(
    'guard: small payload passes through untouched',
    P('{"adPlacements":[{"a":1}],"responseContext":{}}').adPlacements.length === 1
  );
  t(
    'guard: botguardData payload untouched',
    P(
      nativeStringify({
        responseContext: { _pad: pad },
        botguardData: { p: 1 },
        adPlacements: [{ a: 1 }]
      })
    ).adPlacements.length === 1
  );
  t(
    'guard: unrelated large JSON untouched',
    P(nativeStringify({ someOtherApi: true, adPlacements: [{ a: 1 }], _pad: pad })).adPlacements
      .length === 1
  );
  t('guard: arrays parse cleanly', Array.isArray(P(nativeStringify([1, 2, 3, pad]))));
  t('guard: primitives still parse', P('5') === 5 && P('"s"') === 's' && P('null') === null);
  t(
    'guard: reviver still honoured',
    P('{"a":1,"b":2}', (k, v) => (typeof v === 'number' ? v * 2 : v)).a === 2
  );

  // ---- the legacy emoji rewrite: webOS 3 and 4 only, the webOS 22+ bundle has none ----
  if (legacy) {
    {
      // videoDetails.title is a bare string field; the emoji walker only rewrites
      // simpleText / sectionString / content / runs[].text, so it is left alone.
      t(
        'player: bare string fields left alone',
        p.videoDetails.title === 'Hello \uD83D\uDE00 world'
      );

      // Positive case: a runs[] title in a browse shelf must get sentinel-wrapped
      // so emoji-font.js can find it.
      const emojiShelf = {
        shelfRenderer: {
          title: { runs: [{ text: 'Music \uD83D\uDE00 mix' }] },
          content: {
            horizontalListRenderer: {
              items: [
                {
                  tileRenderer: {
                    tileMetadata: {
                      tileMetadataRenderer: {
                        title: { simpleText: 'Song \uD83C\uDFB5 one' }
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      };
      const eb = P(nativeStringify(browseResponse([emojiShelf])));
      const shelf = sectionsOf(eb)[0].shelfRenderer;
      const runsText = (shelf.title.runs || []).map((r) => r.text).join('');
      t(
        'emoji: runs[].text sentinel-wrapped',
        /\u200B\uD83D\uDE00\u200C/.test(runsText),
        JSON.stringify(runsText)
      );
      const tileTitle =
        shelf.content.horizontalListRenderer.items[0].tileRenderer.tileMetadata.tileMetadataRenderer
          .title;
      const tileText = tileTitle.runs
        ? tileTitle.runs.map((r) => r.text).join('')
        : tileTitle.simpleText;
      t(
        'emoji: simpleText split into wrapped runs',
        /\u200B\uD83C\uDFB5\u200C/.test(tileText),
        JSON.stringify(tileText)
      );
    }
    t(
      'next: emoji in the watch-next tree are wrapped',
      nativeStringify(n.contents.singleColumnWatchNextResults.results).indexOf('\u200B') !== -1
    );
    t(
      'frameworkUpdates: emoji wrapped in the same walk',
      nativeStringify(mutation.payload).indexOf('\u200B') !== -1
    );
    // The emoji gate over the raw text: an escaped emoji is still found.
    {
      const bs = String.fromCharCode(92);
      const tileTitled = (title) => ({
        tileRenderer: { metadata: { tileMetadataRenderer: { title: { simpleText: title } } } }
      });
      const text = nativeStringify(
        browseResponse([shelfOf([tileTitled('Hi \uD83D\uDE00 there')], 'Row')])
      ).replace('\uD83D\uDE00', bs + 'ud83d' + bs + 'ude00');
      t('setup: the emoji is escaped in the text', text.indexOf('\uD83D') === -1);
      const out = P(text);
      const title = shelfItemsOf(out)[0].tileRenderer.metadata.tileMetadataRenderer.title;
      t(
        'an emoji that arrives as an escape is wrapped all the same',
        nativeStringify(title).indexOf('\u200B') !== -1,
        nativeStringify(title)
      );
    }
    {
      // An emoji made of several code points is one region: twemoji has one
      // image for the whole sequence.
      const titled = (title) => ({
        tileRenderer: { metadata: { tileMetadataRenderer: { title: { simpleText: title } } } }
      });
      const sequences = {
        'a skin tone': '\uD83D\uDC4D\uD83C\uDFFD',
        'a flag (two regional indicators)': '\uD83C\uDDFA\uD83C\uDDF8',
        'a ZWJ family': '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67',
        'a keycap': '#\uFE0F\u20E3',
        'a variation selector': '\u2764\uFE0F',
        'a tag sequence (England)':
          '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F'
      };
      for (const label of Object.keys(sequences)) {
        const seq = sequences[label];
        const out = P(
          nativeStringify(browseResponse([shelfOf([titled('a ' + seq + ' b')], 'Row')]))
        );
        const title = shelfItemsOf(out)[0].tileRenderer.metadata.tileMetadataRenderer.title;
        const text = title.runs ? title.runs.map((r) => r.text).join('') : title.simpleText;
        t(
          `emoji: ${label} is wrapped as one region`,
          text === 'a \u200B' + seq + '\u200C b',
          JSON.stringify(text)
        );
      }
    }
    {
      // An attributed string: its runs name UTF-16 offsets into `content`,
      // which move with the sentinels put in before them.
      const content = '\uD83D\uDE00 @creator 1:23 nice \uD83D\uDC4D\uD83C\uDFFD';
      const at = content.indexOf('@creator');
      const ts = content.indexOf('1:23');
      const thumb = content.indexOf('\uD83D\uDC4D');
      const body = {
        responseContext: { _pad: pad },
        frameworkUpdates: {
          entityBatchUpdate: {
            mutations: [
              {
                payload: {
                  commentEntityPayload: {
                    properties: {
                      content: {
                        content,
                        commandRuns: [{ startIndex: at, length: 8, onTap: {} }],
                        styleRuns: [
                          { startIndex: ts, length: 4, fontColor: 1 },
                          { startIndex: thumb, length: 4 }
                        ]
                      }
                    }
                  }
                }
              }
            ]
          }
        }
      };
      const a = P(nativeStringify(body)).frameworkUpdates.entityBatchUpdate.mutations[0].payload
        .commentEntityPayload.properties.content;
      const span = (run) =>
        a.content.substr(run.startIndex, run.length).replace(/[\u200B\u200C]/g, '');
      t(
        'attributed string: the emoji in content are wrapped',
        a.content.indexOf('\u200B\uD83D\uDE00\u200C') === 0,
        JSON.stringify(a.content)
      );
      t(
        'attributed string: a run after an emoji still names its text',
        span(a.commandRuns[0]) === '@creator' && span(a.styleRuns[0]) === '1:23',
        JSON.stringify([span(a.commandRuns[0]), span(a.styleRuns[0])])
      );
      t(
        'attributed string: a run over an emoji takes its sentinels with it',
        a.content.substr(a.styleRuns[1].startIndex, a.styleRuns[1].length) ===
          '\u200B\uD83D\uDC4D\uD83C\uDFFD\u200C',
        JSON.stringify(a.content.substr(a.styleRuns[1].startIndex, a.styleRuns[1].length))
      );
      const again = P(
        nativeStringify({
          responseContext: { _pad: pad },
          frameworkUpdates: {
            entityBatchUpdate: {
              mutations: [{ payload: { commentEntityPayload: { properties: { content: a } } } }]
            }
          }
        })
      ).frameworkUpdates.entityBatchUpdate.mutations[0].payload.commentEntityPayload.properties
        .content;
      t(
        'attributed string: a second pass changes neither content nor runs',
        nativeStringify(again) === nativeStringify(a),
        nativeStringify(again)
      );
    }
    {
      // Idempotency: running the emoji rewrite over its own output must be a no-op.
      const mk = () => {
        const sh = {
          shelfRenderer: {
            title: { runs: [{ text: 'Music \uD83D\uDE00 mix' }] },
            content: {
              horizontalListRenderer: {
                items: [
                  {
                    tileRenderer: {
                      tileMetadata: {
                        tileMetadataRenderer: {
                          title: { simpleText: 'Song \uD83C\uDFB5 one' }
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        };
        return browseResponse([sh]);
      };
      const once = P(nativeStringify(mk()));
      const twice = P(nativeStringify(once));
      const thrice = P(nativeStringify(twice));
      t(
        'emoji rewrite is idempotent (2nd pass)',
        nativeStringify(once) === nativeStringify(twice),
        nativeStringify(twice).slice(0, 200)
      );
      t(
        'emoji rewrite is idempotent (3rd pass)',
        nativeStringify(twice) === nativeStringify(thrice)
      );

      // A title that ships the sentinels verbatim must not be able to forge an
      // already-wrapped region: the forged chars are stripped before output.
      const forged = browseResponse([
        { shelfRenderer: { title: { runs: [{ text: '\u200Bnot-an-emoji\u200C plain' }] } } }
      ]);
      const f = P(nativeStringify(forged));
      const ftxt = sectionsOf(f)[0]
        .shelfRenderer.title.runs.map((r) => r.text)
        .join('');
      t(
        'forged sentinels stripped, not honoured',
        ftxt === 'not-an-emoji plain',
        JSON.stringify(ftxt)
      );
    }
  }

  report.finish();
})();
