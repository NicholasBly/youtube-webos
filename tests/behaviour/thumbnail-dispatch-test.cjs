/**
 * Where the thumbnail engine finds the thumbnails of each response, against
 * the built bundle: every response type the dispatch knows, the shapes that
 * must cost no scan (a reel sequence, comments, live chat, a small unknown
 * body), the bounded scan for an unknown shape and for a renamed section list
 * or shelf (from the deepest level the home path reaches), a URL already at
 * its rung left as YouTube sent it, and a container of two videos, each held
 * to its own proof. The probes and promotions are
 * thumbnail-quality-test.cjs.
 *
 * Run: node tests/behaviour/thumbnail-dispatch-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor } = require('../harness/fixtures.cjs');
const { browseResponse, shelfOf, shelfItemsOf, PAD } = require('../harness/gen-payload.cjs');
const { hq, sd, isHq, isSd, thumbs, tile, tileUrl } = require('../harness/thumbnails.cjs');

const report = createReport();
const t = report.check;

// The scenarios were written for Smooth (SD); Original is the default since 0.8.5,
// so a test that names no strategy asks for Smooth. One that wants another names it.
const boot = (cfg, more) =>
  createPage(
    Object.assign(
      { config: Object.assign({ thumbnailQualityMode: 'sd' }, cfg), xhr: 'error', layout: true },
      more
    )
  );

(async () => {
  // ---- a URL already at the rung it would get is left as YouTube sent it ----
  {
    const { win } = boot({ upgradeThumbnails: true }, { xhr: 'sddefault' });
    await wait(20);
    const webp = 'https://i.ytimg.com/vi_webp/webpsamerk1/hq720.webp';
    const query = 'https://i.ytimg.com/vi/qrystring01/sddefault.jpg?sqp=abc&rs=def';
    const item = (url) => ({
      tileRenderer: {
        header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url, width: 480 }] } } }
      }
    });
    const out = shelfItemsOf(
      win.JSON.parse(win.JSON.stringify(browseResponse([shelfOf([item(webp), item(query)])])))
    ).map(tileUrl);
    t(
      'a vi_webp hq720 is not rewritten to the /vi/ JPEG of the same rung (a new download)',
      out[0] === webp,
      out[0]
    );
    t('a URL at its rung keeps the query YouTube signed it with', out[1] === query, out[1]);
  }

  // ---- a thumbnail test variant is replaced by the video's own rung ----
  {
    // "Test & Compare" variants exist only at the small signed size the
    // response names; every larger rung of that name is a 404.
    const variant = (id, n) =>
      'https://i.ytimg.com/vi/' + id + '/hqdefault_custom_' + n + '.jpg?sqp=abc&rs=def';
    const item = (url) => ({
      tileRenderer: {
        header: {
          tileHeaderRenderer: { thumbnail: { thumbnails: [{ url, width: 320, height: 180 }] } }
        }
      }
    });
    const parseOne = (win, url) =>
      tileUrl(
        shelfItemsOf(win.JSON.parse(win.JSON.stringify(browseResponse([shelfOf([item(url)])]))))[0]
      );
    const smooth = boot({ upgradeThumbnails: true }, { xhr: 'record' });
    await wait(20);
    const a = parseOne(smooth.win, variant('customvar01', 1));
    t(
      "a test variant (hqdefault_custom_1) is replaced by the video's own sddefault in Smooth",
      a === sd('customvar01'),
      a
    );
    const original = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: 'safe' },
      { xhr: 'record' }
    );
    await wait(20);
    const b = parseOne(original.win, variant('customvar02', 3));
    t('and by its own hqdefault in Original, the rung every video has', b === hq('customvar02'), b);
    const shorts = 'https://i.ytimg.com/vi/shortsoar01/oar2.jpg?sqp=abc&rs=def';
    const c = parseOne(smooth.win, shorts);
    t('a name the ladder does not know (a Shorts oar2) stays as sent', c === shorts, c);
  }

  // ---- a live-chat continuation is not scanned for thumbnails ----
  {
    const { win, requests } = boot({ upgradeThumbnails: true }, { xhr: 'sddefault' });
    await wait(20);
    const continuation = (key, id) =>
      win.JSON.stringify({
        responseContext: { _pad: PAD },
        continuationContents: {
          [key]: {
            actions: Array.from({ length: 40 }, (_, i) => ({
              addChatItemAction: { item: { text: 'message ' + i + ' ' + PAD.slice(0, 200) } }
            })),
            // Planted where only the bounded scan would find it.
            deep: { a: { b: thumbs(id) } }
          }
        }
      });
    win.JSON.parse(continuation('liveChatContinuation', 'livechatsc1'));
    win.JSON.parse(continuation('commentRepliesContinuation', 'replies0001'));
    await wait(150);
    t(
      'live chat and comment replies cost no scan: the planted thumbnails are never probed',
      requests.length === 0,
      requests.map((r) => r.url).join(' | ')
    );
    win.JSON.parse(continuation('someNewContinuation', 'unknownkey1'));
    await waitFor(() => requests.length === 1);
    t(
      'a continuation of an unknown shape is still scanned',
      requests.length === 1 && requests[0].url.indexOf('unknownkey1') !== -1,
      requests.map((r) => r.url).join(' | ')
    );
  }

  // ---- every response type finds its thumbnails ----
  {
    const { win, requests } = boot({ upgradeThumbnails: true }, { xhr: 'sddefault' });
    await wait(20);
    const ctx = { responseContext: { _pad: PAD } };
    const shelfTileUrl = (contents) =>
      tileUrl(contents[0].shelfRenderer.content.horizontalListRenderer.items[0]);
    const autoplaySet = (id) => ({
      nextVideoRenderer: {
        autoplayVideoWrapperRenderer: {
          primaryEndpointRenderer: { autoplayEndpointRenderer: { item: tile(id) } }
        }
      }
    });
    const autoplayUrl = (set) =>
      tileUrl(
        set.nextVideoRenderer.autoplayVideoWrapperRenderer.primaryEndpointRenderer
          .autoplayEndpointRenderer.item
      );
    const tab = (contents) => ({ tabRenderer: { content: { sectionListRenderer: { contents } } } });
    const navSections = (body) =>
      body.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections;
    const cases = [
      [
        'NEXT (pivot shelf, autoplay set, current thumbnail)',
        {
          contents: {
            singleColumnWatchNextResults: {
              pivot: { sectionListRenderer: { contents: [shelfOf([tile('nosdpivot01')])] } },
              autoplay: { autoplay: { sets: [autoplaySet('nosdautopl1')] } }
            }
          },
          currentVideoThumbnail: thumbs('nosdcurren1')
        },
        (o) => [
          shelfTileUrl(o.contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents),
          autoplayUrl(o.contents.singleColumnWatchNextResults.autoplay.autoplay.sets[0]),
          o.currentVideoThumbnail.thumbnails[0].url
        ]
      ],
      [
        'PLAYER (videoDetails, microformat)',
        {
          streamingData: { formats: [] },
          videoDetails: { videoId: 'nosdplayer1', thumbnail: thumbs('nosdplayer1') },
          microformat: { playerMicroformatRenderer: { thumbnail: thumbs('nosdmicro01') } }
        },
        (o) => [
          o.videoDetails.thumbnail.thumbnails[0].url,
          o.microformat.playerMicroformatRenderer.thumbnail.thumbnails[0].url
        ]
      ],
      [
        'ACTION (appended continuation items)',
        {
          onResponseReceivedActions: [
            { appendContinuationItemsAction: { continuationItems: [tile('nosdaction1')] } }
          ]
        },
        (o) => [
          tileUrl(o.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems[0])
        ]
      ],
      [
        'BROWSE_TABS (a tab\u2019s section list)',
        {
          contents: {
            tvBrowseRenderer: {
              content: {
                tvSecondaryNavRenderer: {
                  sections: [
                    {
                      tvSecondaryNavSectionRenderer: {
                        tabs: [tab([shelfOf([tile('nosdbtabs01')])])]
                      }
                    }
                  ]
                }
              }
            }
          }
        },
        (o) => [
          shelfTileUrl(
            navSections(o)[0].tvSecondaryNavSectionRenderer.tabs[0].tabRenderer.content
              .sectionListRenderer.contents
          )
        ]
      ],
      [
        'a continuation typed as NEXT (watch-next results still attached)',
        {
          contents: { singleColumnWatchNextResults: {} },
          continuationContents: {
            sectionListContinuation: { contents: [shelfOf([tile('nosdcontas1')])] }
          }
        },
        (o) => [shelfTileUrl(o.continuationContents.sectionListContinuation.contents)]
      ]
    ];
    for (const [name, body, urls] of cases) {
      const text = win.JSON.stringify(Object.assign(body, ctx));
      const out = win.JSON.parse(text);
      const first = urls(out);
      // The probes land (an idle callback, then the HEAD answers): none of
      // these videos has an sddefault, and the miss is written back into the
      // first response's objects.
      await waitFor(() => urls(out).every(isHq), 2000);
      const second = urls(win.JSON.parse(text));
      t(
        name + ': sddefault on first sight, the verified hqdefault on the next parse',
        first.every(isSd) && second.every(isHq),
        first.join(' ') + ' -> ' + second.join(' ')
      );
      t(
        name + ': the miss is written back into the objects of the first response',
        urls(out).every(isHq),
        urls(out).join(' ')
      );
    }
    t(
      'every video of every response type was probed exactly once',
      requests.length === 8 && new Set(requests.map((r) => r.url)).size === 8,
      requests.map((r) => r.url).join(' | ')
    );
    const probedFor = (id) => requests.some((r) => r.url.indexOf(id) !== -1);

    // Shapes that must cost no scan: a reel sequence (its thumbnails have no
    // ladder), a comments continuation (a list, with avatars in it) and a
    // small body of an unknown shape.
    const reel = {
      entries: [
        {
          command: {
            reelWatchEndpoint: { videoId: 'shortsentr1', thumbnail: thumbs('shortsentr1') }
          }
        }
      ]
    };
    const reelOut = win.JSON.parse(win.JSON.stringify(Object.assign(reel, ctx)));
    await wait(100);
    t(
      'a reel sequence is left alone: not rewritten, not probed, not scanned',
      isHq(reelOut.entries[0].command.reelWatchEndpoint.thumbnail.thumbnails[0].url) &&
        !probedFor('shortsentr1')
    );
    const comments = {
      onResponseReceivedEndpoints: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              { commentThreadRenderer: { comment: { authorThumbnail: thumbs('commentava1') } } }
            ]
          }
        }
      ]
    };
    win.JSON.parse(win.JSON.stringify(Object.assign(comments, ctx)));
    await wait(100);
    t(
      'a comments continuation is a list the paths reached: no scan, so its avatar is not probed',
      !probedFor('commentava1')
    );
    const small = {
      responseContext: { _pad: 'z'.repeat(600) },
      novelSurface: { rows: [{ novelTile: { thumbnail: thumbs('scansmall01') } }] }
    };
    win.JSON.parse(win.JSON.stringify(small));
    await wait(100);
    t('an unknown shape under 10 KB is not worth a scan', !probedFor('scansmall01'));
    // A home response whose shelves moved under a key no path names: a known
    // type whose paths reach no list at all is scanned, whatever its size.
    const movedHome = {
      responseContext: { _pad: 'z'.repeat(600) },
      contents: {
        tvBrowseRenderer: {
          content: {
            tvSurfaceContentRenderer: {
              content: {
                novelGrid: { items: [{ novelTile: { thumbnail: thumbs('movedhome01') } }] }
              }
            }
          }
        }
      }
    };
    win.JSON.parse(win.JSON.stringify(movedHome));
    await waitFor(() => probedFor('movedhome01'));
    t(
      'a known type whose paths reach no list is scanned: the moved home tile is probed',
      probedFor('movedhome01')
    );
    // The section list renamed: from the root its tile's container sits at
    // depth 17, past the scan's bound of 16. The scan starts as far down the
    // home path as the response still goes.
    const renamedList = browseResponse([shelfOf([tile('renamedlst1')])]);
    const surface = renamedList.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content;
    surface.sectionListRendererV2 = surface.sectionListRenderer;
    delete surface.sectionListRenderer;
    win.JSON.parse(win.JSON.stringify(renamedList));
    await waitFor(() => probedFor('renamedlst1'), 3000);
    t(
      'a renamed section list is scanned from the deepest level the path reaches: its tile is probed',
      probedFor('renamedlst1')
    );
    // A shelf renamed inside the known list: the list is there, no item list in it.
    const renamedShelf = browseResponse([
      { richShelfRenderer: shelfOf([tile('renamedshl1')]).shelfRenderer }
    ]);
    win.JSON.parse(win.JSON.stringify(renamedShelf));
    await waitFor(() => probedFor('renamedshl1'), 3000);
    t(
      'a section list holding no item list the paths know is scanned: the renamed shelf is probed',
      probedFor('renamedshl1')
    );

    // A search response with one shelf the walk reads and results in shapes
    // it does not (an item section, a vertical list): the known shelf must
    // not hide them, each such section gets its own scan.
    const search = {
      responseContext: { _pad: PAD },
      contents: {
        sectionListRenderer: {
          contents: [
            shelfOf([tile('srchshelf01')]),
            { itemSectionRenderer: { contents: [tile('srchitems01'), tile('srchitems02')] } },
            {
              shelfRenderer: {
                content: { verticalListRenderer: { items: [tile('srchvlist01')] } }
              }
            }
          ]
        }
      }
    };
    win.JSON.parse(win.JSON.stringify(search));
    await waitFor(
      () => ['srchshelf01', 'srchitems01', 'srchitems02', 'srchvlist01'].every(probedFor),
      3000
    );
    t(
      'search: results in an item section and a vertical list are reached beside a known shelf',
      ['srchshelf01', 'srchitems01', 'srchitems02', 'srchvlist01'].every(probedFor),
      ['srchshelf01', 'srchitems01', 'srchitems02', 'srchvlist01']
        .filter((id) => !probedFor(id))
        .join(' ')
    );

    // No known path: the bounded scan finds the container at depth 4 and
    // stops before one buried at depth 20.
    const nest = (node, depth) => {
      let out = node;
      for (let i = 0; i < depth; i++) out = { a: out };
      return out;
    };
    const unknown = {
      responseContext: { _pad: 'z'.repeat(10500) },
      novelSurface: { rows: [{ novelTile: { thumbnail: thumbs('scanfound01') } }] },
      buried: nest({ thumbnail: thumbs('scantoodeep') }, 19)
    };
    const foundUrl = (o) => o.novelSurface.rows[0].novelTile.thumbnail.thumbnails[0].url;
    const deepUrl = (o) => {
      let n = o.buried;
      for (let i = 0; i < 19; i++) n = n.a;
      return n.thumbnail.thumbnails[0].url;
    };
    const firstScan = foundUrl(win.JSON.parse(win.JSON.stringify(unknown)));
    // The probe goes out and its answer (the next tick) is cached.
    await waitFor(() => probedFor('scanfound01'));
    await wait(30);
    const secondScan = win.JSON.parse(win.JSON.stringify(unknown));
    t(
      'an unknown shape: the scan finds the thumbnail under a key no path names',
      isSd(firstScan) && isSd(foundUrl(secondScan)),
      firstScan + ' -> ' + foundUrl(secondScan)
    );
    t(
      'the scan stops at its depth bound: a container at depth 20 is neither rewritten nor probed',
      isHq(deepUrl(secondScan)) && !requests.some((r) => r.url.indexOf('scantoodeep') !== -1),
      deepUrl(secondScan)
    );
  }

  // ---- received actions and endpoints in one body: the tiles of both are rewritten ----
  {
    const { win, requests } = boot({ upgradeThumbnails: true }, { xhr: 'record' });
    await wait(20);
    const body = {
      responseContext: { _pad: 'z'.repeat(600) },
      onResponseReceivedActions: [
        { appendContinuationItemsAction: { continuationItems: [tile('bothactns01')] } }
      ],
      onResponseReceivedEndpoints: [
        { reloadContinuationItemsCommand: { continuationItems: [tile('bothendpt01')] } }
      ]
    };
    win.JSON.parse(win.JSON.stringify(body));
    const probed = (id) => requests.some((r) => r.url.indexOf(id) !== -1);
    await waitFor(() => probed('bothactns01') && probed('bothendpt01'), 3000);
    t(
      'a body with received actions and endpoints: the videos of both are probed',
      probed('bothactns01') && probed('bothendpt01'),
      requests.map((r) => r.url).join(' | ')
    );
  }

  // ---- a container holding two videos: each is held to what was shipped for it ----
  {
    // Original: the strategy that holds an unproven video to its proof.
    const { win, requests } = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: 'safe' },
      { xhr: 'record' }
    );
    await wait(20);
    const url = (id, name) => `https://i.ytimg.com/vi/${id}/${name}.jpg`;
    const item = {
      tileRenderer: {
        header: {
          tileHeaderRenderer: {
            thumbnail: {
              thumbnails: [
                { url: url('twovideosA1', 'maxresdefault'), width: 1280, height: 720 },
                { url: url('twovideosB1', 'hqdefault'), width: 480, height: 360 }
              ]
            }
          }
        }
      }
    };
    const out = shelfItemsOf(win.JSON.parse(win.JSON.stringify(browseResponse([shelfOf([item])]))));
    const list = out[0].tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails;
    const probedB = () => requests.some((r) => r.url.indexOf('twovideosB1') !== -1);
    await waitFor(probedB, 3000);
    t(
      "the second video stays at the rung shipped for it, not the first one's",
      isHq(list[1].url),
      list[1].url
    );
    t('and is probed for a better one', probedB(), requests.map((r) => r.url).join(' | '));
  }

  report.finish();
})();
