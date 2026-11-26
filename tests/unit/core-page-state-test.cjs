/**
 * core/page-state.js as a unit in a vm sandbox over a jsdom document: the page
 * kinds read off the body's classes and published as `ytaf-page-update`, once
 * per change of page, not per class flip, and a second page class beside the
 * first counted too.
 *
 * Run: node tests/unit/core-page-state-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { flush } = require('../harness/fixtures.cjs');
const { CORE, blankDom } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  const win = blankDom().window;
  const d = win.document;
  d.body.className = 'WEB_PAGE_TYPE_BROWSE';
  const events = [];
  win.addEventListener('ytaf-page-update', (e) => events.push(e.detail));
  const { get } = loadSources([CORE('selectors.js'), CORE('page-state.js')], {
    window: win,
    document: d,
    MutationObserver: win.MutationObserver,
    CustomEvent: win.CustomEvent
  });

  t('a browse page at start is the default state: nothing to publish', events.length === 0);

  d.body.className = 'WEB_PAGE_TYPE_WATCH';
  await flush();
  t(
    'a change of page class publishes the new kind',
    events.length === 1 && events[0].isWatch === true && get('isWatchPage')(),
    JSON.stringify(events)
  );

  d.body.classList.add('zylon-focus');
  d.body.classList.remove('zylon-focus');
  await flush();
  t('a class flip on the same page publishes nothing', events.length === 1, String(events.length));

  // A second page class beside the first.
  d.body.className = 'WEB_PAGE_TYPE_WATCH WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
  await flush();
  t(
    'a second page class beside the first is a page change too',
    events.length === 2 && events[1].isAccountSelector === true && events[1].isWatch === true,
    JSON.stringify(events[events.length - 1])
  );

  d.body.className = 'WEB_PAGE_TYPE_SHORTS';
  await flush();
  t(
    'Shorts',
    events.length === 3 && events[2].isShorts && !events[2].isWatch && get('isShortsPage')()
  );

  report.finish();
})();
