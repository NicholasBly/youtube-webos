/**
 * The arrow-key pause in the thumbnail engine: for NAV_PAUSE_MS (350 ms) after
 * an arrow press neither verification probes nor promotion sweeps may run, and
 * both must resume once the remote goes quiet. This is the change that keeps
 * row-to-row navigation smooth, so it gets its own checks.
 *
 * Run: node tests/behaviour/thumbnail-nav-pause-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, KEYS, clock: shiftClock, sweepCounter } = require('../harness/fixtures.cjs');
const { sd, browsePayload, mount } = require('../harness/thumbnails.cjs');

const report = createReport();
const t = report.check;

/**
 * The HEAD probes answer for sddefault except ids that start with "nosd"
 * (page.cjs's 'sddefault' stub); every image load fails.
 *
 * The pause is measured on performance.now(): `clock.offset` ms are added to
 * the page's clocks, so a test moves past the 350 ms without waiting them out. The
 * timers of 200 ms and more (most pause retries, the promotion retry, the
 * idle gate) run at a tenth; the 150 ms promotion sweep keeps its length.
 */
function boot(cfg) {
  // Document-wide tile queries (the visibility sample and the promotion sweeps).
  let sweeps;
  let clock;
  const page = createPage({
    // Smooth unless a case names another strategy (Original is the default).
    config: Object.assign({ upgradeThumbnails: true, thumbnailQualityMode: 'sd' }, cfg),
    xhr: 'sddefault',
    raf: 'timeout',
    image: 'error',
    timers: { scale: 10, from: 200 },
    setup(win) {
      clock = shiftClock(win);
      sweeps = sweepCounter(win);
    }
  });
  /**
   * The remote has been quiet for longer than the pause; resolves once `fn`
   * holds (the pending pause retry may be an unscaled one of up to 200 ms).
   */
  const quiet = (fn) => {
    clock.offset += 400;
    return waitFor(fn);
  };
  return { win: page.win, probed: () => page.requests.map((r) => r.url), sweeps, quiet };
}

const arrow = (win, keyCode) =>
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { keyCode, bubbles: true }));

(async () => {
  // ---- probes wait out the pause --------------------------------------------
  {
    const { win, probed, quiet } = boot({});
    await wait(20);
    win.JSON.parse(browsePayload(win, ['aaaaaaaaaaa', 'bbbbbbbbbbb']));
    arrow(win, KEYS.DOWN); // ArrowDown right after the parse: the user is scrolling
    await wait(80);
    t(
      'Smooth: no probe fires within 350 ms of an arrow press',
      probed().length === 0,
      probed().join(' | ')
    );
    await quiet(() => probed().length === 2);
    t(
      'Smooth: probes resume once the remote is quiet',
      probed().length === 2,
      probed().join(' | ')
    );
  }

  // ---- repeated presses keep extending the pause ---------------------------
  {
    const { win, probed, quiet } = boot({});
    await wait(20);
    win.JSON.parse(browsePayload(win, ['ccccccccccc']));
    for (let i = 0; i < 4; i++) {
      arrow(win, i % 2 ? KEYS.UP : KEYS.DOWN);
      await wait(40); // faster than the pause, like key repeat
    }
    t(
      'key repeat: still no probe after a run of presses',
      probed().length === 0,
      probed().join(' | ')
    );
    await quiet(() => probed().length === 1);
    t(
      'key repeat: probe fires after the last press settles',
      probed().length === 1,
      probed().join(' | ')
    );
  }

  // ---- the wall clock set back during the pause --------------------------------
  {
    const { win, probed } = boot({});
    await wait(20);
    win.JSON.parse(browsePayload(win, ['eeeeeeeeeee']));
    arrow(win, KEYS.DOWN);
    // A network time sync sets the wall clock back ten seconds; the
    // monotonic clock runs on.
    const wall = win.Date.now;
    win.Date.now = () => wall() - 10000;
    await waitFor(() => probed().length === 1, 2000);
    t(
      'a wall clock set back during the pause does not stretch it',
      probed().length === 1,
      probed().join(' | ')
    );
  }

  // ---- promotions wait too --------------------------------------------------
  {
    const { win, probed, quiet } = boot({});
    await wait(20);
    const el = mount(win, 'ddddddddddd');
    win.JSON.parse(browsePayload(win, ['ddddddddddd']));
    await wait(40); // the probe is in flight and answered by now
    t('setup: probe sent', probed().length === 1, probed().join(' | '));
    arrow(win, KEYS.RIGHT); // ArrowRight well before the 150 ms promotion sweep
    await wait(200);
    t(
      'promotion sweep is held while the remote is active',
      el.style.backgroundImage.indexOf('/sddefault.jpg') === -1,
      el.style.backgroundImage
    );
    await quiet(() => el.style.backgroundImage.indexOf('/sddefault.jpg') !== -1);
    t(
      'promotion lands once the pause is over',
      el.style.backgroundImage.indexOf('/sddefault.jpg') !== -1,
      el.style.backgroundImage
    );
  }

  // ---- a tile already on the right URL ends the correction -------------------
  {
    const { win, probed, sweeps } = boot({});
    await wait(20);
    const el = mount(win, 'ggggggggggg', sd('ggggggggggg'));
    win.JSON.parse(browsePayload(win, ['ggggggggggg']));
    await wait(400); // the 150 ms sweep, then the 900 ms retry window at a tenth
    t('setup: the sddefault probe ran', probed().length === 1, probed().join(' | '));
    t(
      'one sweep finds the tile already correct and does not retry',
      sweeps.length === 1 && (el.style.backgroundImage.match(/url\(/g) || []).length === 1,
      sweeps.length + ' sweeps; ' + el.style.backgroundImage
    );
  }

  // ---- a probe that settles on what was drawn queues no sweep ---------------
  {
    // Original draws the proven rung and waits; the maxres probe misses.
    const { win, probed, sweeps } = boot({ thumbnailQualityMode: 'safe' });
    await wait(20);
    mount(win, 'nosdnosdnos');
    win.JSON.parse(browsePayload(win, ['nosdnosdnos']));
    await wait(250);
    t('setup: the probe missed', probed().length === 1, probed().join(' | '));
    t(
      'Original: no sweep when the tile stays on hqdefault',
      sweeps.length === 0,
      sweeps.join(' | ')
    );
  }

  // ---- only arrows pause; other keys do not ---------------------------------
  {
    const { win, probed } = boot({});
    await wait(20);
    win.JSON.parse(browsePayload(win, ['eeeeeeeeeee']));
    arrow(win, KEYS.ENTER); // Enter
    await wait(80);
    t('Enter does not pause the probes', probed().length === 1, probed().join(' | '));
  }

  // ---- Fast mode is paused the same way -------------------------------------
  {
    const { win, probed, quiet } = boot({ thumbnailQualityMode: 'eager' });
    await wait(20);
    win.JSON.parse(browsePayload(win, ['fffffffffff']));
    arrow(win, KEYS.LEFT);
    await wait(80);
    t('Fast: no probe within the pause', probed().length === 0, probed().join(' | '));
    await quiet(() => probed().length === 1);
    t(
      'Fast: maxresdefault probe fires afterwards',
      probed().length === 1 && probed()[0].indexOf('/maxresdefault.jpg') !== -1,
      probed().join(' | ')
    );
  }

  report.finish();
})();
