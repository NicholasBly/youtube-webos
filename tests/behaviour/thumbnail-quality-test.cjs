/**
 * The thumbnail engine against the built bundle: the JSON rewrite, the
 * verification probes (a refused tile never holds the latest parse's), the
 * write-back (an entry already at the answer stays as sent) and the promotion
 * sweep must do what the modes promise;
 * the two probe transports (a HEAD off screen, an image load on screen) must
 * read every answer the way probe-transport.js documents it; a strategy change
 * through the options panel must start verification over and drop the probes
 * that were in flight. Where each response keeps its thumbnails is
 * thumbnail-dispatch-test.cjs.
 *
 * Run: node tests/behaviour/thumbnail-quality-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  tick,
  waitFor,
  instrument,
  sweepCounter,
  cycleRow,
  showPanel,
  panelCheckbox,
  clock
} = require('../harness/fixtures.cjs');
const { browseResponse, shelfOf, shelfItemsOf } = require('../harness/gen-payload.cjs');
const {
  hq,
  sd,
  isHq,
  isSd,
  isMax,
  tile,
  tileUrl,
  lockup,
  browsePayload,
  emitted,
  mount,
  imageStub
} = require('../harness/thumbnails.cjs');

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

// The idle delay (1200 ms) alone stretched to 12 s, for a case that checks what
// waits behind it: on a loaded machine the real one could pass before the check.
const HOLD_IDLE = { scale: 0.1, from: 1200, to: 1201 };

(async () => {
  // ---- the default strategy is Original ----
  {
    // No strategy stored (undefined is left out of the stored JSON): the
    // bundle's own default applies. Original draws only what is proven, so the
    // first parse keeps the hqdefault YouTube listed, where Smooth would draw
    // sddefault and Fast maxresdefault.
    const { win, pump } = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: undefined },
      { xhr: 'sddefault', image: 'error' }
    );
    await tick();
    pump();
    await tick();
    const out = win.JSON.parse(
      win.JSON.stringify(browseResponse([shelfOf([tile('ccccccccccc')])]))
    );
    const url = tileUrl(shelfItemsOf(out)[0]);
    t('default strategy (Original): the first parse keeps hqdefault', isHq(url), url);
  }

  // ---- the JSON engine rewrites, probes and promotes ----
  {
    // The probe mock: sddefault exists (HEAD 200 with a real-sized body),
    // every other rung is missing.
    const { win, requests, pump } = boot(
      { upgradeThumbnails: true },
      { xhr: 'sddefault', image: 'error' }
    );
    await tick();
    pump();
    await tick();
    const d = win.document;
    const app = d.querySelector('ytlr-app');

    const payload = () =>
      win.JSON.stringify(browseResponse([shelfOf([tile('aaaaaaaaaaa'), lockup('bbbbbbbbbbb')])]));
    const urlsOf = (out) => {
      const items = shelfItemsOf(out);
      return [
        tileUrl(items[0]),
        items[1].lockupViewModel.contentImage.thumbnailViewModel.image.sources[0].url
      ];
    };
    const probed = () => requests.map((r) => r.url);
    // Tiles the app has already drawn with the original hqdefault, in every
    // shape the promotion sweep looks for, plus one it must leave alone.
    const mountAs = (tag, id, parentTag) => {
      const host = d.createElement(parentTag || 'div');
      const el = d.createElement(tag);
      el.style.backgroundImage = 'url("' + hq(id) + '")';
      host.appendChild(el);
      app.appendChild(host);
      return el;
    };
    const details = mountAs('ytlr-thumbnail-details', 'aaaaaaaaaaa');
    const surface = mountAs('ytlr-surface-page', 'bbbbbbbbbbb');
    const image = mountAs('image', 'aaaaaaaaaaa', 'thumbnail');
    const bare = mountAs('image', 'bbbbbbbbbbb');

    const first = urlsOf(win.JSON.parse(payload()));
    t(
      'Smooth mode: sddefault is emitted on first sight, before its probe',
      first.every(isSd),
      first.join(' ')
    );

    await waitFor(() => {
      pump();
      return probed().length >= 2;
    });
    t(
      'Smooth mode: probes sddefault only, once per video',
      probed().length === 2 && probed().every(isSd),
      probed().join(' | ')
    );

    await waitFor(() => {
      pump();
      return [details, surface, image].every((el) => isSd(el.style.backgroundImage));
    });
    const promoted = [details, surface, image].map((el) => el.style.backgroundImage);
    t(
      'promotes rendered tiles once the probe confirms the rung',
      promoted.every(isSd),
      promoted.join(' | ')
    );
    t(
      'does NOT touch an <image> without a <thumbnail> ancestor',
      !isSd(bare.style.backgroundImage),
      bare.style.backgroundImage
    );

    const second = urlsOf(win.JSON.parse(payload()));
    t(
      'a verified rung is emitted directly on the next parse',
      second.every(isSd),
      second.join(' ')
    );

    // Fast mode gambles on maxresdefault before anything is verified.
    const fast = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: 'eager' },
      { image: 'error' }
    );
    await tick();
    fast.pump();
    await tick();
    const eager = urlsOf(fast.win.JSON.parse(payload()));
    t('Fast mode: emits maxresdefault before verification', eager.every(isMax), eager.join(' '));
  }

  // ---- Smooth gambles on sddefault as Fast does on maxres: a miss is corrected ----
  {
    // The probe mock: a video whose id starts with "nosd" has no sddefault.
    const { win, pump } = boot({ upgradeThumbnails: true }, { xhr: 'sddefault' });
    await tick();
    pump();
    await tick();
    const items = shelfItemsOf(win.JSON.parse(browsePayload(win, ['nosdsmooth1'])));
    const drawn = tileUrl(items[0]);
    // The app draws the tile from the URL it was handed.
    const el = mount(win, 'nosdsmooth1', sd('nosdsmooth1'));
    await waitFor(() => {
      pump();
      return isHq(el.style.backgroundImage);
    }, 3000);
    t(
      'Smooth mode: a video with no sddefault is drawn at sddefault first all the same',
      isSd(drawn),
      drawn
    );
    t(
      "the miss is written back into the app's objects",
      isHq(tileUrl(items[0])),
      tileUrl(items[0])
    );
    t(
      'and the tile drawn at the gamble is swept to hqdefault',
      isHq(el.style.backgroundImage),
      el.style.backgroundImage
    );
    const stats = win.__ytafThumbStats || {};
    t(
      '__ytafThumbStats: one probe answered, one miss, nothing unknown',
      stats.answered === 1 && stats.missed === 1 && stats.unknown === 0,
      JSON.stringify(stats)
    );
  }

  // ---- the HEAD answers that settle a probe without an image ----
  {
    const srcs = [];
    const { win, requests: held } = boot(
      { upgradeThumbnails: true },
      { xhr: 'held', setup: (w) => imageStub(w, srcs, 640) }
    );
    await wait(20);
    const ids = ['miss4040000', 'timedout000', 'tinybody000', 'realbody000'];
    win.JSON.parse(browsePayload(win, ids));
    await waitFor(() => held.length === 3);
    t('setup: three HEADs in flight, the concurrency cap', held.length === 3, String(held.length));
    const byId = (id) => held.find((x) => x.url.indexOf('/vi/' + id + '/') !== -1);
    byId('miss4040000').answer(404, 48000);
    byId('timedout000').expire();
    byId('tinybody000').answer(200, 4000);
    await waitFor(() => held.length === 4);
    t('the fourth HEAD goes out once a slot frees up', held.length === 4, String(held.length));
    byId('realbody000').answer(200, 6000);
    await wait(20);
    const urls = shelfItemsOf(win.JSON.parse(browsePayload(win, ids))).map(tileUrl);
    t(
      'a 404 and a 200 with a placeholder-sized body settle on hqdefault',
      isHq(urls[0]) && isHq(urls[2]),
      urls.join(' ')
    );
    t('a timeout learns nothing: Smooth keeps the sddefault it drew', isSd(urls[1]), urls[1]);
    t('a 200 with a body over the placeholder size proves the rung', isSd(urls[3]), urls[3]);
    t('none of them needed the image: no src was set', srcs.length === 0, srcs.join(' | '));
    t(
      'the settled answers are not probed again',
      held.length === 4,
      held.map((x) => x.url).join(' | ')
    );
    // A timeout saw nothing: it is not saved.
    win.dispatchEvent(new win.Event('pagehide'));
    const saved = String(win.localStorage.getItem('ytaf-thumb-quality'));
    t(
      'the answers are saved, the timeout is not',
      saved.indexOf('miss4040000:2') !== -1 &&
        saved.indexOf('tinybody000:2') !== -1 &&
        saved.indexOf('timedout000') === -1,
      saved
    );
  }

  // ---- a network error is not a miss: it learns nothing and is not saved ----
  {
    const { win, requests: held } = boot({ upgradeThumbnails: true }, { xhr: 'held' });
    await wait(20);
    win.JSON.parse(browsePayload(win, ['neterror001']));
    await waitFor(() => held.length === 1);
    held[0].fail();
    await wait(20);
    const url = emitted(win, 'neterror001');
    t('a HEAD that fails on the network leaves Smooth on the sddefault it drew', isSd(url), url);
    win.dispatchEvent(new win.Event('pagehide'));
    const saved = String(win.localStorage.getItem('ytaf-thumb-quality'));
    t(
      'and is not saved as a miss: the next session asks again',
      saved.indexOf('neterror001') === -1,
      saved
    );
    const stats = win.__ytafThumbStats || {};
    t(
      '__ytafThumbStats counts it as unknown, not as an answer or a miss',
      stats.unknown === 1 && stats.answered === 0 && stats.missed === 0,
      JSON.stringify(stats)
    );
  }
  {
    // Original holds the floor; the failed probe is not saved there either.
    const { win, requests: held } = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: 'safe' },
      { xhr: 'held' }
    );
    await wait(20);
    win.JSON.parse(browsePayload(win, ['neterror002']));
    await waitFor(() => held.length === 1);
    held[0].fail();
    await wait(20);
    const url = emitted(win, 'neterror002');
    win.dispatchEvent(new win.Event('pagehide'));
    const saved = String(win.localStorage.getItem('ytaf-thumb-quality'));
    t(
      'Original: a network error holds the floor for this session and is not saved',
      isHq(url) && saved.indexOf('neterror002') === -1,
      url + ' / ' + saved
    );
  }
  {
    // On screen the probe is an image load; a network error there is no miss either.
    const srcs = [];
    const { win } = boot(
      { upgradeThumbnails: true },
      { xhr: 'sddefault', setup: (w) => imageStub(w, srcs, 'error') }
    );
    await wait(20);
    mount(win, 'imgneterr01');
    const others = ['imgother001', 'imgother002', 'imgother003', 'imgother004', 'imgother005'];
    win.JSON.parse(browsePayload(win, ['imgneterr01'].concat(others)));
    await waitFor(() => srcs.settled >= 1, 2000);
    await wait(50);
    win.dispatchEvent(new win.Event('pagehide'));
    const saved = String(win.localStorage.getItem('ytaf-thumb-quality'));
    t(
      'an image probe that fails on the network is not saved as a miss',
      srcs[0] === sd('imgneterr01') && saved.indexOf('imgneterr01') === -1,
      srcs.join(' | ') + ' / ' + saved
    );
  }

  // ---- the image decides when the HEAD carried no length ----
  {
    // An image that loads at the placeholder's width is a miss.
    const srcs = [];
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { xhr: { mode: 'sddefault', noLength: true }, setup: (w) => imageStub(w, srcs, 120) }
    );
    await wait(20);
    win.JSON.parse(browsePayload(win, ['placeholde1']));
    await waitFor(() => requests.length === 1 && srcs.length === 1);
    t(
      'no length: the HEAD is followed by an image load of the same URL',
      requests.length === 1 && srcs.length === 1 && srcs[0] === sd('placeholde1'),
      requests.map((r) => r.url).join(' | ') + ' / ' + srcs.join(' | ')
    );
    // Read once the image has loaded and its answer is in.
    await waitFor(() => srcs.settled === 1);
    await wait(10);
    const url = emitted(win, 'placeholde1');
    t(
      'an image that decodes at the placeholder width (120) does not prove the rung',
      isHq(url),
      url
    );
  }
  {
    // An image that never settles: the probe timeout (5 s, here at a hundredth)
    // learned nothing. Smooth keeps the sddefault it drew, this session does
    // not ask again, and the next session asks afresh.
    const srcs = [];
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      {
        xhr: { mode: 'sddefault', noLength: true },
        timers: { scale: 100, from: 1000 },
        setup: (w) => imageStub(w, srcs, 'never')
      }
    );
    await wait(20);
    win.JSON.parse(browsePayload(win, ['neverloads1']));
    await waitFor(() => requests.length >= 1 && srcs.length >= 1);
    t('setup: the HEAD and the image were both tried', requests.length === 1 && srcs.length === 1);
    // Past the probe's timeout (50 ms here).
    await wait(100);
    const url = emitted(win, 'neverloads1');
    t('an image that never answers learns nothing: Smooth keeps its sddefault', isSd(url), url);
    t(
      'and is not asked again in this session',
      requests.length === 1 && srcs.length === 1,
      requests.length + ' HEAD, ' + srcs.length + ' image'
    );
    win.dispatchEvent(new win.Event('pagehide'));
    const stored = win.localStorage.getItem('ytaf-thumb-quality');
    t(
      'the timeout is not saved: the next session asks again',
      !stored || stored.indexOf('neverloads1') === -1,
      String(stored)
    );
  }

  // ---- a tile on screen is asked through the image, not a HEAD ----
  {
    const srcs = [];
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { xhr: 'sddefault', timers: HOLD_IDLE, setup: (w) => imageStub(w, srcs, 640) }
    );
    await wait(20);
    const el = mount(win, 'onscreen000');
    // Six queued ids is where the on-screen ones are picked first.
    const ids = ['onscreen000'].concat([1, 2, 3, 4, 5].map((i) => 'offscreen0' + i));
    win.JSON.parse(browsePayload(win, ids));
    await waitFor(() => srcs.length === 1 && requests.length === 4);
    // The rest are held for the idle delay: nothing more comes now.
    await wait(100);
    const heads = requests.map((r) => r.url);
    t(
      'the rendered tile is probed by loading its sddefault image and no HEAD is sent for it',
      srcs.length === 1 &&
        srcs[0] === sd('onscreen000') &&
        !heads.some((u) => u === sd('onscreen000')),
      srcs.join(' | ') + ' / ' + heads.join(' | ')
    );
    t(
      'the others go by HEAD, four of them: the urgent burst, the rest waits for the surface to settle',
      heads.length === 4 && heads.every(isSd),
      heads.join(' | ')
    );
    await waitFor(() => isSd(el.style.backgroundImage));
    t(
      'and the image answer promotes the tile it was loaded for',
      isSd(el.style.backgroundImage),
      el.style.backgroundImage
    );
  }

  // ---- the urgent tier is the latest parse's, not the queue's head ----
  {
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { xhr: 'sddefault', timers: HOLD_IDLE }
    );
    await wait(20);
    const first = [1, 2, 3, 4, 5, 6].map((i) => 'firstparse' + i);
    win.JSON.parse(browsePayload(win, first));
    // Three probes go at once, the fourth as soon as one of them lands.
    await waitFor(() => requests.length >= 4);
    await wait(50);
    t(
      'the first parse sends the urgent four and parks the other two behind the idle gate',
      requests.length === 4 && requests.every((r) => r.url.indexOf('firstparse') !== -1),
      requests.map((r) => r.url).join(' | ')
    );
    win.JSON.parse(browsePayload(win, ['secondparse']));
    await waitFor(() => requests.length >= 5);
    t(
      'a parse right after sends its own video, not the two the first parse parked',
      requests.length === 5 && requests[4].url.indexOf('secondparse') !== -1,
      requests.map((r) => r.url).join(' | ')
    );
  }

  {
    // Tiles of an older parse on screen past the visible budget, the idle gate
    // held: they wait, and the next parse's urgent ones still go.
    const srcs = [];
    let c;
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      {
        xhr: 'sddefault',
        timers: HOLD_IDLE,
        setup: (w) => {
          imageStub(w, srcs, 640);
          c = clock(w);
        }
      }
    );
    await wait(20);
    const older = [];
    for (let i = 10; i < 22; i++) older.push('olderparse' + i);
    win.JSON.parse(browsePayload(win, older));
    // The urgent four answered, and the round after the last answer run: no
    // drain is due until the next parse.
    await waitFor(() => requests.length >= 4 && requests.every((r) => r.answered));
    await wait(100);
    // The eight it parked scroll on screen.
    for (const id of older.slice(4)) mount(win, id);
    // Past the 250 ms the rendered sample is reused for.
    await wait(300);
    const newer = [1, 2, 3, 4].map((i) => 'newerparse' + i);
    win.JSON.parse(browsePayload(win, newer));
    // The first round sampled the screen and started on the older tiles. Then
    // the clock goes a minute back: the idle gate (1200 ms after the last
    // parse) stays shut however slow the machine, and the sample is kept.
    await waitFor(() => srcs.length > 0);
    c.offset -= 60000;
    const went = await waitFor(
      () => requests.some((r) => r.url.indexOf('newerparse') !== -1),
      1500
    );
    t(
      "an on-screen tile the tiers refuse does not hold the latest parse's urgent ones",
      went,
      'images ' + srcs.length + ', heads ' + requests.map((r) => r.url).join(' | ')
    );
  }

  // ---- the on-screen tier is found through the rendered set, not by scanning the queue ----
  {
    const srcs = [];
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      { xhr: 'sddefault', setup: (w) => imageStub(w, srcs, 640) }
    );
    await wait(20);
    mount(win, 'lastonscrn0');
    // The rendered tile is the last id the parse queues: the old scan of the
    // whole queue found it last, the rendered set finds it first either way.
    const ids = [1, 2, 3, 4, 5].map((i) => 'queuedfirst' + i).concat(['lastonscrn0']);
    win.JSON.parse(browsePayload(win, ids));
    await waitFor(() => srcs.length === 1 && requests.length === 4);
    const heads = requests.map((r) => r.url);
    t(
      'the rendered tile at the tail of the queue is probed first, through its image',
      srcs.length === 1 &&
        srcs[0] === sd('lastonscrn0') &&
        !heads.some((u) => u === sd('lastonscrn0')),
      srcs.join(' | ') + ' / ' + heads.join(' | ')
    );
    t(
      'the urgent four follow in the order the parse queued them, the fifth waits',
      heads.length === 4 &&
        heads.every(isSd) &&
        heads.map((u, i) => u === sd('queuedfirst' + (i + 1))).every(Boolean),
      heads.join(' | ')
    );
  }

  // ---- past the tiers, the head of the queue goes in queue order ----
  {
    // The idle delay (1200 ms) on the page's clock and its timer at a tenth.
    let c;
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      {
        xhr: 'sddefault',
        timers: { scale: 10, from: 1200, to: 1201 },
        setup: (w) => {
          c = clock(w);
        }
      }
    );
    await wait(20);
    const ids = [1, 2, 3, 4, 5, 6, 7].map((i) => 'headorder0' + i);
    win.JSON.parse(browsePayload(win, ids));
    await waitFor(() => requests.length === 4);
    t(
      'setup: the urgent four went, three wait for the surface to settle',
      requests.length === 4 && requests.every((r) => r.url.indexOf('headorder0') !== -1),
      requests.map((r) => r.url).join(' | ')
    );
    // The surface settles: the rest go, oldest first.
    c.offset += 1200;
    await waitFor(() => requests.length === 7, 2500);
    const tail = requests.slice(4).map((r) => r.url);
    t(
      'the parked three go in the order they were queued',
      tail.length === 3 && tail.map((u, i) => u === sd('headorder0' + (i + 5))).every(Boolean),
      tail.join(' | ')
    );
  }

  // ---- more unverified tiles on screen than the visible budget ----
  {
    const srcs = [];
    let c;
    const { win, requests } = boot(
      { upgradeThumbnails: true },
      {
        xhr: 'sddefault',
        timers: { scale: 10, from: 1200, to: 1201 },
        setup: (w) => {
          imageStub(w, srcs, 640);
          c = clock(w);
        }
      }
    );
    await wait(20);
    const ids = [];
    for (let i = 10; i < 22; i++) ids.push('manyonscr' + i);
    for (const id of ids) mount(win, id);
    win.JSON.parse(browsePayload(win, ids));
    // Six go on the visible budget, four on the urgent one; the last two wait
    // for the surface to settle (1200 ms after the parse, on the page's
    // clock), then go too.
    await waitFor(() => srcs.length + requests.length === 10);
    c.offset += 1200;
    const all = await waitFor(() => srcs.length + requests.length === 12, 3000);
    t(
      'twelve tiles on screen: all twelve are probed once the surface settles, not six',
      all,
      'images ' + srcs.length + ', heads ' + requests.length
    );
  }

  // ---- every slot busy: a drain does not sample the rendered tiles ----
  {
    const { win, requests: held } = boot({ upgradeThumbnails: true }, { xhr: 'held' });
    await wait(20);
    const ids = [];
    for (let i = 10; i < 20; i++) ids.push('slotsbusy' + i);
    win.JSON.parse(browsePayload(win, ids));
    await waitFor(() => held.length === 3);
    t('setup: three probes in flight, seven queued', held.length === 3);
    // The sample of the first drain is reused for 250 ms: past that, a drain samples anew.
    await wait(300);
    const samples = sweepCounter(win);
    // Another parse drains with every slot taken.
    win.JSON.parse(browsePayload(win, ['slotsbusy99']));
    await wait(150);
    t(
      'with every probe slot taken a drain samples nothing on screen',
      samples.length === 0 && held.length === 3,
      samples.length + ' samples, ' + held.length + ' in flight'
    );
    // A slot frees: the next drain samples and sends one more.
    held[0].answer(200, 48000);
    await waitFor(() => held.length === 4);
    t('a probe answered: the next one goes out', held.length === 4, String(held.length));
  }

  // ---- a strategy change through the panel starts verification over ----
  {
    const { win, pump, requests: held } = boot({ upgradeThumbnails: true }, { xhr: 'held' });
    await wait(20);
    win.JSON.parse(browsePayload(win, ['modechange1']));
    await waitFor(() => held.length === 1);
    t('setup: the Smooth probe for sddefault is in flight', held.length === 1 && isSd(held[0].url));

    await showPanel(win, pump);
    const row = cycleRow(win, 'Thumbnail Strategy', '#ytaf-page-main');
    const shown = () => row.querySelector('.ytaf-value').textContent;
    t('setup: the strategy row shows Smooth (SD)', !!row && shown() === 'Smooth (SD)');
    row.click(); // the row steps to the next strategy: Original
    t('the row stepped to Original', shown() === 'Original', shown());
    t(
      'the stored cache is dropped and the cap rewritten for the new ladder',
      win.localStorage.getItem('ytaf-thumb-quality') === null &&
        win.localStorage.getItem('ytaf-thumb-quality-cap') === '5r2',
      win.localStorage.getItem('ytaf-thumb-quality-cap')
    );
    held[0].answer(200, 48000); // the old ladder's answer lands after the change
    await wait(20);
    const after = emitted(win, 'modechange1');
    t(
      'the in-flight sddefault answer is discarded: the video is unproven again',
      isHq(after),
      after
    );
    await waitFor(() => held.length === 2);
    t(
      'and it is probed again, now for the new ladder’s rung',
      held.length === 2 && isMax(held[1].url),
      held.map((x) => x.url).join(' | ')
    );
    held[1].answer(404, 48000);
    await wait(20);
    row.click(); // Original -> Fast: the same ladder, so nothing is reset
    t('the row stepped to Fast', shown() === 'Fast', shown());
    const known = emitted(win, 'modechange1');
    const fresh = emitted(win, 'modechange2');
    t(
      'Original to Fast keeps the verified answers: the known miss stays on hqdefault',
      isHq(known) && held.length === 2,
      known
    );
    t('while an unknown video gets the Fast gamble', isMax(fresh), fresh);
  }

  // ---- the write-back leaves an entry already at the settled rung as YouTube sent it ----
  {
    // Original: the tile is drawn at the hq720 YouTube shipped (a signed
    // vi_webp URL) while maxres is probed; every probe misses.
    const { win, requests } = boot({ upgradeThumbnails: true, thumbnailQualityMode: 'safe' });
    await wait(20);
    const webp = 'https://i.ytimg.com/vi_webp/webpsigned1/hq720.webp?sqp=signed';
    const item = {
      tileRenderer: {
        header: {
          tileHeaderRenderer: {
            thumbnail: {
              thumbnails: [
                { url: 'https://i.ytimg.com/vi/webpsigned1/hqdefault.jpg', width: 480 },
                { url: webp, width: 1280 }
              ]
            }
          }
        }
      }
    };
    const list = shelfItemsOf(
      win.JSON.parse(win.JSON.stringify(browseResponse([shelfOf([item])])))
    )[0].tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails;
    await waitFor(() => requests.some((r) => r.answered), 3000);
    await wait(50);
    t(
      'after the maxres miss the signed hq720 entry stays as sent (its /vi/ JPEG is a new download)',
      list[1].url === webp,
      list[1].url
    );
    t(
      'the hqdefault entry beside it is drawn at hq720',
      /\/hq720\.jpg$/.test(list[0].url),
      list[0].url
    );
  }

  // ---- Fast mode guessed wrong: the parsed entries and the drawn tile come back down ----
  {
    // Every HEAD misses: maxres does not exist (a 404; the stub has sddefault only).
    const { win, requests } = boot(
      { upgradeThumbnails: true, thumbnailQualityMode: 'eager' },
      { xhr: 'sddefault' }
    );
    await wait(20);
    const item = shelfItemsOf(win.JSON.parse(browsePayload(win, ['fastmiss001'])))[0];
    t('setup: Fast mode emits maxres', isMax(tileUrl(item)), tileUrl(item));
    // The app has already drawn the tile with the URL it was handed.
    const drawn = mount(win, 'fastmiss001', tileUrl(item));
    await waitFor(() => requests.some((r) => r.answered), 3000);
    t("the miss is written back into the app's own entry", isHq(tileUrl(item)), tileUrl(item));
    await waitFor(() => isHq(drawn.style.backgroundImage), 3000);
    t(
      'and the tile drawn at maxres is put back on hqdefault',
      isHq(drawn.style.backgroundImage),
      drawn.style.backgroundImage
    );
  }

  // ---- the app goes to the background: the answers are saved at once ----
  {
    const { win, requests } = boot({ upgradeThumbnails: true }, { xhr: 'sddefault' });
    await wait(20);
    win.JSON.parse(browsePayload(win, ['hiddensave1']));
    await waitFor(() => requests.some((r) => r.answered));
    await wait(20);
    Object.defineProperty(win.document, 'hidden', { configurable: true, get: () => true });
    win.document.dispatchEvent(new win.Event('visibilitychange'));
    const saved = String(win.localStorage.getItem('ytaf-thumb-quality'));
    t(
      'hidden: the cache is written without waiting for its debounce',
      saved.indexOf('hiddensave1') !== -1,
      saved
    );
  }

  // ---- switched off while a probe is out: its answer is kept, nothing is redrawn ----
  {
    const page = boot({ upgradeThumbnails: true }, { xhr: 'held' });
    const { win, requests: held } = page;
    await wait(20);
    win.JSON.parse(browsePayload(win, ['offmidprob1']));
    const drawn = mount(win, 'offmidprob1');
    await waitFor(() => held.length === 1);
    await showPanel(page);
    const box = panelCheckbox(win, 'Max Thumbnail Quality');
    box.click();
    await wait(20);
    t('setup: switched off with the probe out', box.checked === false && held.length === 1);
    held[0].answer(200, 6000);
    await wait(100);
    t(
      'the answer that comes in afterwards redraws nothing',
      isHq(drawn.style.backgroundImage),
      drawn.style.backgroundImage
    );
    box.click();
    await wait(20);
    const url = emitted(win, 'offmidprob1');
    t('switched on again: the answer was kept, the rung is emitted at once', isSd(url), url);
  }

  // ---- the hot path: a browse response mounting, 12 shelves of 20 tiles ----
  {
    const { win, pump } = boot({ upgradeThumbnails: true }, { image: 'error' });
    await tick();
    pump();
    await tick();
    const c = instrument(win);
    const app = win.document.querySelector('ytlr-app');
    for (let s = 0; s < 12; s++) {
      const shelf = win.document.createElement('div');
      for (let i = 0; i < 20; i++) {
        const tileEl = win.document.createElement('ytlr-tile-renderer');
        const inner = win.document.createElement('div');
        const details = win.document.createElement('ytlr-thumbnail-details');
        details.style.backgroundImage = 'url("' + hq('vid' + s + '_' + i) + '")';
        const label = win.document.createElement('span');
        label.textContent = 'Video ' + i;
        inner.appendChild(details);
        inner.appendChild(label);
        tileEl.appendChild(inner);
        shelf.appendChild(tileEl);
      }
      app.appendChild(shelf);
      await tick();
    }
    await tick();
    pump();
    await tick();
    t(
      'mounting 240 tiles costs the thumbnail engine no selector or layout work',
      c.qsa === 0 && c.qs === 0 && c.matches === 0 && c.rect === 0,
      JSON.stringify(c)
    );
  }

  report.finish();
})();
