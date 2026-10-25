/**
 * The thumbnail engine's switch, its persistent cache and its budgets against
 * the built bundle: Max Thumbnail Quality turned off and on through the panel
 * must stop and restart the rewrite and reload the stored answers; the cache
 * in localStorage must round-trip, and be dropped when its cap belongs to
 * another ladder; and the caps in constants.js (promotion attempts, tracked
 * entries, cached answers, probed videos) must bound the work the way the
 * code says, with the overflow landing where it lands.
 *
 * Run: node tests/behaviour/thumbnail-cache-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  panelCheckbox,
  sweepCounter,
  showPanel
} = require('../harness/fixtures.cjs');
const {
  sd,
  isHq,
  isSd,
  tileUrl,
  parseIds,
  emitted,
  mount,
  imageStub
} = require('../harness/thumbnails.cjs');

const report = createReport();
const t = report.check;

const CACHE_KEY = 'ytaf-thumb-quality';
const CAP_KEY = 'ytaf-thumb-quality-cap';
// The ladder (sddefault, 3) and the revision of what a saved answer may be (2).
const CAP = '3r2';

/** `count` distinct eleven-character ids with the given prefix. */
const idsFrom = (prefix, count, from = 0) =>
  Array.from({ length: count }, (_, i) => prefix + String(from + i).padStart(10, '0'));

// The HEAD probes answer for sddefault (page.cjs's 'sddefault' stub).
// The scenarios were written for Smooth (SD); Original is the default since 0.8.5,
// so a test that names no strategy asks for Smooth. One that wants another names it.
const boot = (cfg, more) =>
  createPage(
    Object.assign(
      {
        config: Object.assign({ thumbnailQualityMode: 'sd' }, cfg),
        xhr: 'sddefault',
        layout: true
      },
      more
    )
  );

(async () => {
  // ---- the switch: off, then on, then off again through the panel ----
  {
    const { win, requests, pump } = boot(
      { upgradeThumbnails: false },
      { storage: { [CACHE_KEY]: 'cachedvid01:3', [CAP_KEY]: CAP } }
    );
    await wait(20);
    const off = parseIds(win, ['cachedvid01', 'freshvideo1']).map(tileUrl);
    await wait(100);
    t(
      'off: nothing is rewritten, not even a video the stored cache knows, and nothing is probed',
      off.every(isHq) && requests.length === 0,
      off.join(' ') + ' / ' + requests.length + ' probes'
    );

    await showPanel(win, pump);
    const box = panelCheckbox(win, 'Max Thumbnail Quality');
    t('setup: the Max Thumbnail Quality checkbox is on the panel and off', !!box && !box.checked);
    box.click();
    const on = parseIds(win, ['cachedvid01', 'freshvideo1']).map(tileUrl);
    // Its answer is in before the switch goes off again below.
    await waitFor(() => requests.length >= 1 && requests[0].answered);
    t(
      'on: the stored cache is loaded, so the known video is emitted at sddefault at once',
      isSd(on[0]),
      on[0]
    );
    t(
      'on: the unknown video is emitted at sddefault at once, and its probe goes out now',
      isSd(on[1]) && requests.length === 1 && requests[0].url === sd('freshvideo1'),
      on[1] + ' / ' + requests.map((r) => r.url).join(' | ')
    );

    box.click();
    const offAgain = parseIds(win, ['cachedvid01', 'freshvideo1']).map(tileUrl);
    t('off again: the verified videos are emitted as YouTube sent them', offAgain.every(isHq));
    t(
      'off again: the pending save is flushed, so the probe answer is kept for next time',
      win.localStorage.getItem(CACHE_KEY) === 'cachedvid01:3,freshvideo1:3',
      String(win.localStorage.getItem(CACHE_KEY))
    );

    // On once more: the cache never left memory, so storage is not parsed again.
    const reads = { n: 0 };
    const realGet = win.Storage.prototype.getItem;
    win.Storage.prototype.getItem = function (key) {
      if (key === CACHE_KEY) reads.n++;
      return realGet.call(this, key);
    };
    box.click();
    const onAgain = parseIds(win, ['cachedvid01', 'freshvideo1']).map(tileUrl);
    win.Storage.prototype.getItem = realGet;
    t(
      'on again: the cache still in memory is used, storage is not read again',
      reads.n === 0 && onAgain.every(isSd),
      reads.n + ' reads / ' + onAgain.join(' ')
    );
  }

  // ---- the cap: a stored cache is only trusted against its own ladder ----
  {
    // Written by a session in Original mode (cap 5, maxresdefault); this one is Smooth.
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { storage: { [CACHE_KEY]: 'capmismatc1:3', [CAP_KEY]: '5' } }
    );
    await wait(20);
    const url = emitted(win, 'capmismatc1');
    await waitFor(() => requests.length >= 1);
    t(
      'a cache whose cap is another ladder’s is dropped at load and the video is probed afresh',
      isSd(url) && requests.length === 1 && win.localStorage.getItem(CAP_KEY) === CAP,
      url + ' / cap ' + win.localStorage.getItem(CAP_KEY)
    );
  }
  {
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { storage: { [CACHE_KEY]: 'nocapvideo1:3' } }
    );
    await wait(20);
    const url = emitted(win, 'nocapvideo1');
    await waitFor(() => requests.length >= 1);
    t(
      'a cache with no cap at all (a build before the Smooth mode) is dropped the same way',
      isSd(url) && requests.length === 1 && win.localStorage.getItem(CAP_KEY) === CAP,
      url + ' / cap ' + win.localStorage.getItem(CAP_KEY)
    );
  }

  {
    // Saved by a build that read a network error as a miss: dropped once.
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { storage: { [CACHE_KEY]: 'oldrevisn01:2', [CAP_KEY]: '3' } }
    );
    await wait(20);
    const url = emitted(win, 'oldrevisn01');
    await waitFor(() => requests.length >= 1);
    t(
      'a cache saved before revision 2 (a network error read as a miss) is dropped at load: the video is probed afresh',
      isSd(url) && requests.length === 1 && win.localStorage.getItem(CAP_KEY) === CAP,
      url + ' / cap ' + win.localStorage.getItem(CAP_KEY)
    );
  }

  // ---- the round trip: saved by the debounce, read back by the next session ----
  {
    // The 4 s save debounce at a hundredth.
    const first = boot({ upgradeThumbnails: true }, { timers: { scale: 100, from: 1000 } });
    await wait(20);
    emitted(first.win, 'roundtrip01');
    await waitFor(() => first.win.localStorage.getItem(CACHE_KEY) !== null);
    const stored = first.win.localStorage.getItem(CACHE_KEY);
    t(
      'a verified answer is written to localStorage as id:rank once the save debounce elapses',
      stored === 'roundtrip01:3' && first.win.localStorage.getItem(CAP_KEY) === CAP,
      String(stored)
    );

    const next = boot(
      { upgradeThumbnails: true },
      { storage: { [CACHE_KEY]: stored, [CAP_KEY]: CAP } }
    );
    await wait(20);
    const url = emitted(next.win, 'roundtrip01');
    await wait(100);
    t(
      'the next session reads it back: sddefault at once and no probe',
      isSd(url) && next.requests.length === 0,
      url + ' / ' + next.requests.length + ' probes'
    );
  }

  // ---- a correction written into the app's objects is swept once ----
  {
    // The 900 ms retry at a tenth: five sweeps would fit in a second.
    let sweeps;
    const { win } = boot(
      { upgradeThumbnails: true },
      {
        timers: { scale: 10, from: 500 },
        setup(w) {
          sweeps = sweepCounter(w);
        }
      }
    );
    await wait(20);
    // No sddefault: the gamble misses and the correction is hqdefault.
    const items = parseIds(win, ['nosdnever01']);
    const drawn = tileUrl(items[0]);
    // The first sweep, then long enough for two of the 90 ms retries.
    await waitFor(() => sweeps.length >= 1);
    await wait(250);
    t(
      'a correction whose tile is not on screen is swept once, not retried: the objects already carry it',
      sweeps.length === 1 && isSd(drawn) && isHq(tileUrl(items[0])),
      sweeps.length + ' sweeps; ' + drawn + ' -> ' + tileUrl(items[0])
    );
    const late = mount(win, 'nosdnever01', sd('nosdnever01'));
    emitted(win, 'nosdnever01');
    await wait(300);
    t(
      'a tile drawn later from the old URL is not patched and nothing sweeps: the app reads the corrected objects',
      sweeps.length === 1 && isSd(late.style.backgroundImage) && !isHq(late.style.backgroundImage),
      sweeps.length + ' sweeps; ' + late.style.backgroundImage
    );
  }

  // ---- PENDING_LIMIT: one response past the cap of tracked entries ----
  {
    const { win, requests } = boot({ upgradeThumbnails: true });
    await wait(20);
    // No sddefault for any of them: each answer is a correction to hqdefault.
    const ids = idsFrom('nosd', 1501);
    const items = parseIds(win, ids);
    // The urgent burst: the first four probes go out and are answered.
    await waitFor(() => requests.length >= 4 && requests.slice(0, 4).every((r) => r.answered));
    t(
      'setup: the first probes landed, in response order',
      requests.length >= 4 && requests[0].url === sd(ids[0]),
      requests
        .map((r) => r.url)
        .slice(0, 4)
        .join(' | ')
    );
    t(
      'past 1500 tracked videos the oldest loses its write-back: its object keeps the gamble',
      isSd(tileUrl(items[0])) && isHq(tileUrl(items[1])),
      tileUrl(items[0]) + ' ' + tileUrl(items[1])
    );
    t('while its answer is still cached for the next parse', isHq(emitted(win, ids[0])));
  }

  // ---- CACHE_LIMIT: the 1201st answer evicts the oldest ----
  {
    const stored = idsFrom('s', 1200);
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { storage: { [CACHE_KEY]: stored.map((id) => id + ':3').join(','), [CAP_KEY]: CAP } }
    );
    await wait(20);
    t(
      'setup: all 1200 stored answers are loaded',
      isSd(emitted(win, stored[0])) && isSd(emitted(win, stored[1199])) && requests.length === 0
    );
    emitted(win, 'answer1201x');
    await waitFor(() => requests.length >= 1 && requests[0].answered);
    t(
      'setup: the new video was probed',
      requests.length === 1 && isSd(emitted(win, 'answer1201x'))
    );
    const evicted = emitted(win, stored[0]);
    const kept = emitted(win, stored[1]);
    t(
      'the 1201st answer evicts the oldest: unproven again, it is the gamble once more',
      isSd(evicted),
      evicted
    );
    t('and the one after it is still known', isSd(kept), kept);
    win.dispatchEvent(new win.Event('pagehide'));
    const saved = win.localStorage.getItem(CACHE_KEY).split(',');
    t(
      'the saved cache holds the 1200 newest, oldest first',
      saved.length === 1200 && saved[0] === stored[1] + ':3' && saved[1199] === 'answer1201x:3',
      saved.length + ' entries, first ' + saved[0] + ', last ' + saved[1199]
    );
    await waitFor(() => requests.length >= 2);
    t(
      'the evicted video is probed afresh the next time it is seen',
      requests.length === 2 && requests[1].url === sd(stored[0]),
      requests.map((r) => r.url).join(' | ')
    );
  }

  // ---- PROBE_ATTEMPT_LIMIT: the 4001st distinct video is never probed ----
  {
    const srcs = [];
    const { win } = boot({ upgradeThumbnails: true }, { setup: (w) => imageStub(w, srcs) });
    await wait(20);
    // The control: a rendered tile among six queued ids is probed at once, by image.
    mount(win, 'visibleone1');
    parseIds(win, ['visibleone1'].concat(idsFrom('c', 5)));
    await waitFor(() => srcs.length >= 1);
    t(
      'setup: a rendered tile is probed through its image as soon as it is queued',
      srcs.length === 1 && srcs[0] === sd('visibleone1'),
      srcs.join(' | ')
    );
    parseIds(win, idsFrom('q', 3994)); // 4000 distinct videos enqueued this session
    mount(win, 'overlimit01');
    await wait(300); // the rendered sample is reused for 250 ms
    parseIds(win, ['overlimit01']);
    await wait(100);
    t(
      'the 4001st video is not probed even though its tile is on screen',
      srcs.length === 1,
      srcs.join(' | ')
    );
  }

  report.finish();
})();
