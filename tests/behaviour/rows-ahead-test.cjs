/**
 * Rows loaded ahead (features/rows-ahead.js) against the built bundle: the
 * next rows of a vertical list are asked for four rows before its end, on
 * every section list a response carries (home, each browse tab, search, both
 * continuation shapes), with every other switch off as well. A larger
 * threshold YouTube sent stays, a row's own continuation (more tiles) and
 * a reload continuation are left alone, a player response is not touched,
 * and the counters say what was sent. With Load Rows Ahead off (at start or
 * from the panel) YouTube's own threshold stays.
 *
 * Run: node tests/behaviour/rows-ahead-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, showPanel, panelCheckbox } = require('../harness/fixtures.cjs');
const { browseResponse, shelfOf, PAD } = require('../harness/gen-payload.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

// Every switch that turns the parse hook's filters on, off.
const ALL_OFF = {
  enableAdBlock: false,
  enableTrackingBlock: false,
  hideEndcards: false,
  upgradeThumbnails: false,
  enableLegacyEmojiFix: false,
  forceVideoCodec: 'auto'
};

function boot(cfg) {
  return createPage({
    config: cfg,
    xhr: 'error',
    setup(win) {
      // What the app's page carries (window.environment.flags).
      win.environment = { flags: { section_list_continuation_threshold: 1 } };
    }
  });
}

const next = (extra) => ({
  nextContinuationData: Object.assign({ continuation: 'next-rows-token' }, extra)
});
/** A section list with one row and the continuations given. */
const sectionList = (continuations) => ({ contents: [shelfOf([])], continuations });
const homeWith = (continuations) => {
  const body = browseResponse([shelfOf([])]);
  body.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.continuations =
    continuations;
  return body;
};
const homeList = (body) =>
  body.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer;
const thresholdOf = (list, i) =>
  list.continuations[i || 0].nextContinuationData.autoloadThresholdItemsFromEnd;
/** The body through the page's JSON.parse, as the app reads a response. */
const parse = (win, body) => win.JSON.parse(JSON.stringify(body));

(async () => {
  // ---- the home feed ----------------------------------------------------------------
  {
    const { win } = boot({});
    await wait(20);
    const out = parse(win, homeWith([next()]));
    eq('home: the next rows are asked for four rows before the end', thresholdOf(homeList(out)), 4);
    const kept = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 6 })]));
    eq('a larger threshold YouTube sent stays', thresholdOf(homeList(kept)), 6);
    const raised = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 2 })]));
    eq('a smaller one is raised', thresholdOf(homeList(raised)), 4);
    const reload = parse(win, homeWith([{ reloadContinuationData: { continuation: 'r' } }]));
    t(
      'a reload continuation is left alone',
      homeList(reload).continuations[0].reloadContinuationData.autoloadThresholdItemsFromEnd ===
        undefined
    );
  }

  // ---- with every other switch off ---------------------------------------------------
  {
    const { win } = boot(ALL_OFF);
    await wait(20);
    const out = parse(win, homeWith([next()]));
    eq('with every filter off the home feed still gets it', thresholdOf(homeList(out)), 4);
  }

  // ---- Load Rows Ahead off ------------------------------------------------------------
  {
    const { win } = boot({ enableRowsAhead: false });
    await wait(20);
    const out = parse(win, homeWith([next()]));
    t(
      'setting off: the home feed keeps the threshold YouTube sent (none)',
      thresholdOf(homeList(out)) === undefined,
      String(thresholdOf(homeList(out)))
    );
    const sent = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 1 })]));
    eq('setting off: a threshold of 1 stays 1', thresholdOf(homeList(sent)), 1);
    eq('setting off: nothing is counted as seen', (win.__ytafContinuationStats || {}).seen, 0);
  }
  {
    // Every filter off too: the hook still runs (it cannot know), and changes nothing.
    const { win } = boot(Object.assign({}, ALL_OFF, { enableRowsAhead: false }));
    await wait(20);
    const sent = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 1 })]));
    eq('setting and every filter off: the threshold stays 1', thresholdOf(homeList(sent)), 1);
  }
  {
    // Switched from the panel while the app runs: the next response follows it.
    const page = boot({ enableRowsAhead: false });
    const { win } = page;
    await wait(20);
    await showPanel(win, page.pump);
    const box = panelCheckbox(win, 'Load Rows Ahead');
    t(
      'the Load Rows Ahead row is on the UI Tweaks page, unchecked',
      !!box && !!box.closest('#ytaf-page-ui-tweaks') && !box.checked
    );
    box.click();
    const on = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 1 })]));
    eq('switched on in the panel: the next response gets 4', thresholdOf(homeList(on)), 4);
    box.click();
    const off = parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 1 })]));
    eq('switched off again: the next response keeps 1', thresholdOf(homeList(off)), 1);
  }

  // ---- every section list a response carries ------------------------------------------
  {
    const { win } = boot({});
    await wait(20);
    const ctx = { responseContext: { _pad: PAD } };

    const more = parse(
      win,
      Object.assign({}, ctx, {
        continuationContents: { sectionListContinuation: sectionList([next()]) }
      })
    );
    eq(
      'a continuation of the rows gets it for the rows after it',
      thresholdOf(more.continuationContents.sectionListContinuation),
      4
    );

    const surface = parse(
      win,
      Object.assign({}, ctx, {
        continuationContents: {
          tvSurfaceContentContinuation: { content: { sectionListRenderer: sectionList([next()]) } }
        }
      })
    );
    eq(
      'and so does a surface continuation',
      thresholdOf(
        surface.continuationContents.tvSurfaceContentContinuation.content.sectionListRenderer
      ),
      4
    );

    const search = parse(
      win,
      Object.assign({}, ctx, { contents: { sectionListRenderer: sectionList([next()]) } })
    );
    eq('search results', thresholdOf(search.contents.sectionListRenderer), 4);

    const tab = (content) => ({ tabRenderer: { title: 'Tab', content } });
    const tabs = parse(
      win,
      Object.assign({}, ctx, {
        contents: {
          tvBrowseRenderer: {
            content: {
              tvSecondaryNavRenderer: {
                sections: [
                  {
                    tvSecondaryNavSectionRenderer: {
                      tabs: [
                        tab({
                          tvSurfaceContentRenderer: {
                            content: { sectionListRenderer: sectionList([next()]) }
                          }
                        }),
                        tab({ sectionListRenderer: sectionList([next()]) })
                      ]
                    }
                  },
                  {
                    tvSecondaryNavSectionRenderer: {
                      tabs: [tab({ sectionListRenderer: sectionList([next()]) })]
                    }
                  }
                ]
              }
            }
          }
        }
      })
    );
    const sections = tabs.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections;
    const tabsOf = (i) => sections[i].tvSecondaryNavSectionRenderer.tabs;
    t(
      'every browse tab, in either shape and in every section',
      thresholdOf(
        tabsOf(0)[0].tabRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer
      ) === 4 &&
        thresholdOf(tabsOf(0)[1].tabRenderer.content.sectionListRenderer) === 4 &&
        thresholdOf(tabsOf(1)[0].tabRenderer.content.sectionListRenderer) === 4,
      JSON.stringify(tabsOf(0)[1].tabRenderer.content.sectionListRenderer.continuations)
    );

    // A row's own continuation (more tiles to the right) keeps its own rule.
    const row = shelfOf([]);
    row.shelfRenderer.content.horizontalListRenderer.continuations = [next()];
    const home = browseResponse([row]);
    const out = parse(win, home);
    const rowOut = homeList(out).contents[0].shelfRenderer.content.horizontalListRenderer;
    t(
      'a row of tiles is left alone',
      thresholdOf(rowOut) === undefined,
      String(thresholdOf(rowOut))
    );
  }

  // ---- the counters ------------------------------------------------------------------
  {
    const { win } = boot({});
    await wait(20);
    const stats = () => win.__ytafContinuationStats || {};
    parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 2, autoloadEnabled: true })]));
    parse(win, homeWith([next({ autoloadThresholdItemsFromEnd: 6 })]));
    // A player response carries no section list: nothing counted, nothing touched.
    const player = parse(win, {
      responseContext: { _pad: PAD },
      streamingData: { formats: [] },
      continuations: [next()]
    });
    eq('two section lists seen', stats().seen, 2);
    eq('one threshold raised', stats().raised, 1);
    t(
      'the last one as YouTube sent it',
      JSON.stringify(stats().lastSent) ===
        JSON.stringify({
          autoloadThresholdItemsFromEnd: 6,
          autoloadEnabled: false,
          autoloadOnVisible: false
        }),
      JSON.stringify(stats().lastSent)
    );
    eq("and the app's own flag", stats().appFlag, 1);
    t(
      'a player response is not touched',
      player.continuations[0].nextContinuationData.autoloadThresholdItemsFromEnd === undefined
    );
  }

  report.finish();
})();
