/**
 * screensaver-fix against the built bundle on both flavours. On the watch page the
 * <video> is kept at the screen origin and size, corrected on one animation
 * frame per burst of style writes, a hidden or parked player is left alone,
 * and the observer follows the page: a <video> remounted on the same page, or
 * mounting after the wait for it ran out, is bound, leaving the page unbinds. On Shorts a synthetic YELLOW press (and its
 * alternate code a quarter second later) every 30 s keeps the screensaver
 * away while the player reports PLAYING, nothing is pressed while paused, and
 * the keep-alive stops with the page change and restarts on the next Shorts.
 *
 * Run: node tests/behaviour/screensaver-fix-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, tick, flush, KEYS, ALT } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const PLAYER_ID = 'ytlr-player__player-container-player';
// GAP_TIMERS: the 30 s keep-alive interval at a fiftieth, 600 ms, and the
// 250 ms between the two halves of the press kept, for the cases about that
// gap; the interval leaves room on both sides of it on a loaded machine.
// FAST_TIMERS: the interval at a hundredth, 300 ms, the gap at 2.5 ms.
// IDLE_TIMERS: the interval at a thousandth, 30 ms, for a case that checks
// nothing is pressed: a short window then spans several intervals.
const GAP_TIMERS = { scale: 50, from: 10000 };
const FAST_TIMERS = { scale: 100, from: 200 };
const IDLE_TIMERS = { scale: 1000, from: 200 };

/** A Shorts page with a player element reporting `player.state`, every keydown recorded. */
function bootShorts(initialState, timers) {
  const player = { state: initialState };
  const page = createPage({
    html:
      '<!doctype html><html><body class="WEB_PAGE_TYPE_SHORTS"><ytlr-app>' +
      `<div id="${PLAYER_ID}"></div></ytlr-app></body></html>`,
    url: 'https://www.youtube.com/tv#/shorts/abcdefghijk',
    captureKeys: true,
    timers: timers || FAST_TIMERS,
    setup(win) {
      win.document.getElementById(PLAYER_ID).getPlayerState = () => player.state;
    }
  });
  return { win: page.win, keys: page.keys, pump: page.pump, player };
}

(async () => {
  // ---- a window with no size yet at startup --------------------------------------
  {
    let size = 0;
    const { win, pump } = createPage({
      page: 'watch',
      layout: true,
      setup(w) {
        Object.defineProperty(w, 'innerWidth', {
          get: () => (size ? 1920 : 0),
          configurable: true
        });
        Object.defineProperty(w, 'innerHeight', {
          get: () => (size ? 1080 : 0),
          configurable: true
        });
      }
    });
    await wait(50);
    const video = win.document.querySelector('#ytlr-player__player-container video');
    video.style.width = '640px';
    await flush();
    pump();
    await flush();
    t(
      'no window size yet: the <video> is left alone, not shrunk to 0px',
      video.style.width === '640px',
      video.style.cssText
    );
    size = 1;
    video.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'once the window has a size it is read again and the <video> fills it',
      video.style.width === '1920px' && video.style.height === '1080px',
      video.style.cssText
    );
  }

  // ---- the watch-page <video>: origin, size, one frame per burst ------------------
  {
    const { win, pump } = createPage({ page: 'watch', layout: true });
    await wait(50);
    const d = win.document;
    const container = d.getElementById('ytlr-player__player-container');
    const first = container.querySelector('video');

    first.style.left = '5px';
    first.style.width = '640px';
    await flush();
    t(
      'a style write is corrected on the next animation frame, not synchronously',
      first.style.left === '5px',
      first.style.cssText
    );
    pump();
    await flush();
    t(
      'the watch-page <video> is kept at the screen origin',
      first.style.left === '0px' && first.style.top === '0px',
      first.style.cssText
    );
    t(
      'and sized to the screen',
      first.style.width === `${win.innerWidth}px` && first.style.height === `${win.innerHeight}px`,
      first.style.cssText
    );

    // The correction itself mutates the style, which asks for one more (idle)
    // frame: drain it before counting.
    for (let i = 0; i < 3; i++) {
      pump();
      await flush();
    }
    let frames = 0;
    const realRaf = win.requestAnimationFrame;
    win.requestAnimationFrame = (cb) => {
      frames++;
      return realRaf(cb);
    };
    first.style.left = '1px';
    first.style.left = '2px';
    first.style.top = '3px';
    await flush();
    t('a burst of style writes is coalesced into one frame', frames === 1, `${frames} frames`);
    pump();
    await flush();
    t(
      'the burst is corrected in that frame',
      first.style.left === '0px' && first.style.top === '0px',
      first.style.cssText
    );
    win.requestAnimationFrame = realRaf;

    // A player the app hid, or parked off-screen, is not dragged back.
    first.style.display = 'none';
    first.style.left = '7px';
    await flush();
    pump();
    await flush();
    t(
      'a hidden player (display: none) is left alone',
      first.style.left === '7px',
      first.style.cssText
    );
    first.style.display = '';
    first.style.top = '-9999px';
    await flush();
    pump();
    await flush();
    t(
      'a player parked at a negative top is left alone',
      first.style.top === '-9999px' && first.style.left === '7px',
      first.style.cssText
    );

    // The same page with a remounted <video>, and no page event (page-state
    // sends none for a watch-to-watch change): the old element's next style
    // write tells the observer it is gone, and the new one is waited for.
    // The wait runs on timers, so these are timer ticks.
    first.remove();
    first.style.left = '1px';
    await tick();
    await tick();
    const second = d.createElement('video');
    container.appendChild(second);
    await tick();
    second.style.left = '5px';
    await tick();
    pump();
    await tick();
    t(
      'a <video> remounted within the watch page is bound too',
      second.style.left === '0px',
      second.style.cssText
    );

    // A video-to-video navigation: the hash changes, the <video> is replaced.
    second.remove();
    const third = d.createElement('video');
    container.appendChild(third);
    win.location.hash = '#/watch?v=next0000001';
    await wait(30);
    third.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'a <video> replaced on a hash change is bound too',
      third.style.left === '0px',
      third.style.cssText
    );

    // Leaving the watch page unbinds it.
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await flush();
    third.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'after leaving the watch page the <video> is no longer corrected',
      third.style.left === '5px',
      third.style.cssText
    );
  }

  // ---- the watch page entered later: the <video> that mounts afterwards is bound ----
  {
    const { win, pump } = createPage({ layout: true });
    await wait(50);
    const d = win.document;
    const app = d.querySelector('ytlr-app');
    const container = d.createElement('div');
    container.id = 'ytlr-player__player-container';
    app.appendChild(container);
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await flush();
    const video = d.createElement('video');
    container.appendChild(video);
    await flush();
    video.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'a <video> that mounts after the watch page is entered is waited for and bound',
      video.style.left === '0px',
      video.style.cssText
    );
  }
  {
    // The player mounts as a subtree with the <video> inside, in one append.
    const { win, pump } = createPage({ layout: true });
    await wait(50);
    const d = win.document;
    const app = d.querySelector('ytlr-app');
    const container = d.createElement('div');
    container.id = 'ytlr-player__player-container';
    app.appendChild(container);
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await flush();
    const wrapper = d.createElement('div');
    const video = d.createElement('video');
    wrapper.appendChild(video);
    container.appendChild(wrapper);
    await flush();
    video.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'a <video> mounting inside a player subtree is the element bound, not the subtree',
      video.style.left === '0px',
      video.style.cssText
    );
  }

  {
    // The wait for the <video> runs out (30 s, here 300 ms); one that mounts
    // later is bound on the next watch-to-watch navigation.
    const { win, pump } = createPage({ layout: true, timers: { scale: 100, from: 30000 } });
    await wait(50);
    const d = win.document;
    const container = d.createElement('div');
    container.id = 'ytlr-player__player-container';
    d.querySelector('ytlr-app').appendChild(container);
    win.location.hash = '#/watch?v=first000001';
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await wait(450);
    const video = d.createElement('video');
    container.appendChild(video);
    win.location.hash = '#/watch?v=next0000001';
    await wait(50);
    video.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'a <video> mounting after the wait ran out is bound on the next navigation',
      video.style.left === '0px',
      video.style.cssText
    );
  }

  // ---- Shorts: YELLOW every 30 s while playing, nothing while paused ---------------
  {
    // The interval is 300 ms here, the alternate code 250 ms after each press.
    const { keys, player } = bootShorts(1, GAP_TIMERS);
    await wait(300);
    t('Shorts: nothing is pressed before the first 30 s pass', keys.length === 0, keys.join(','));
    // Timers run late under load, never early: the lower bounds are fixed
    // waits, the presses that are due are waited for.
    await waitFor(() => keys.length >= 1, 2000);
    t(
      'Shorts, playing: a YELLOW press after 30 s',
      keys.length === 1 && keys[0] === KEYS.YELLOW,
      keys.join(',')
    );
    await waitFor(() => keys.length >= 2, 2000);
    t(
      'the alternate yellow code follows 250 ms later',
      keys.join(',') === `${KEYS.YELLOW},${ALT.YELLOW}`,
      keys.join(',')
    );
    player.state = 2;
    // A whole interval passes paused.
    await wait(700);
    t('Shorts, paused: the next 30 s pass without a press', keys.length === 2, keys.join(','));
    player.state = 1;
    await waitFor(() => keys.length >= 4, 2000);
    t(
      'playing again: the presses resume on the running interval',
      keys.join(',') === [KEYS.YELLOW, ALT.YELLOW, KEYS.YELLOW, ALT.YELLOW].join(','),
      keys.join(',')
    );
  }
  {
    // Paused for some six intervals.
    const { keys } = bootShorts(2, IDLE_TIMERS);
    await wait(200);
    t('Shorts paused from the start: no press at all', keys.length === 0, keys.join(','));
  }

  // ---- Shorts: the keep-alive follows the page ---------------------------------------
  {
    const { win, keys } = bootShorts(1, GAP_TIMERS);
    await waitFor(() => keys.length >= 1, 2000);
    t('setup: the first YELLOW went out', keys.join(',') === String(KEYS.YELLOW), keys.join(','));
    // Away from Shorts before the alternate code is due (250 ms after the
    // press): it is dropped with the interval.
    win.document.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(400);
    t(
      'leaving Shorts stops the keep-alive and drops the pending alternate code',
      keys.join(',') === String(KEYS.YELLOW),
      keys.join(',')
    );
    win.document.body.className = 'WEB_PAGE_TYPE_SHORTS';
    await waitFor(() => keys.length >= 2, 2000);
    t(
      'back on Shorts the keep-alive starts again',
      keys.join(',') === `${KEYS.YELLOW},${KEYS.YELLOW}`,
      keys.join(',')
    );
  }
  {
    // Shorts straight to a watch page: the keep-alive stops and the <video> fix takes over.
    const { win, keys, pump } = bootShorts(1, IDLE_TIMERS);
    const d = win.document;
    const container = d.createElement('div');
    container.id = 'ytlr-player__player-container';
    const video = d.createElement('video');
    container.appendChild(video);
    d.querySelector('ytlr-app').appendChild(container);
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await flush();
    await flush();
    video.style.left = '5px';
    await flush();
    pump();
    await flush();
    t(
      'Shorts to the watch page: the <video> fix takes over',
      video.style.left === '0px',
      video.style.cssText
    );
    await wait(200);
    t(
      'Shorts to the watch page: no keep-alive press on the watch page',
      keys.length === 0,
      keys.join(',')
    );
  }

  // ---- a frozen picture after a video screensaver: one seek in place ---------------
  {
    // The 2 s check at a twentieth (100 ms); Date.now() is the test's own clock.
    let now = 1e12;
    const { win } = createPage({
      page: 'watch',
      timers: { scale: 20, from: 1500 },
      setup(w) {
        w.Date.now = () => now;
      }
    });
    await wait(50);
    const d = win.document;
    // A <video> standing at 5 s (or moving, with `moving`), with `readyState`; counts the seeks.
    const makeVideo = ({ moving = false, readyState = 4 } = {}) => {
      const v = d.createElement('video');
      d.body.appendChild(v);
      const rec = { v, seeks: [], time: 5 };
      Object.defineProperty(v, 'paused', { get: () => false });
      Object.defineProperty(v, 'seeking', { get: () => false });
      Object.defineProperty(v, 'readyState', { get: () => readyState });
      Object.defineProperty(v, 'currentTime', {
        get: () => (moving ? (rec.time += 0.25) : rec.time),
        set: (value) => {
          rec.seeks.push(value);
        }
      });
      return rec;
    };
    const fire = (v, type) => v.dispatchEvent(new win.Event(type));
    // Paused for `pauseFor` ms (none: a first play), then playing; the seeks after the check.
    const resume = async (pauseFor, options) => {
      const rec = makeVideo(options);
      if (pauseFor != null) {
        fire(rec.v, 'pause');
        now += pauseFor;
      }
      fire(rec.v, 'playing');
      await wait(250);
      rec.v.remove();
      return rec;
    };

    t('a first play is left alone', (await resume(null)).seeks.length === 0);
    t('a resume after a short pause (5 s) is left alone', (await resume(5000)).seeks.length === 0);
    const frozen = await resume(120000);
    t(
      'a resume after a long pause that stands still: one seek, to where it stands',
      frozen.seeks.length === 1 && frozen.seeks[0] === 5,
      JSON.stringify(frozen.seeks)
    );
    t(
      'a resume after a long pause whose clock moves is left alone',
      (await resume(120000, { moving: true })).seeks.length === 0
    );
    t(
      'buffering for real (readyState 2) is left to YouTube',
      (await resume(120000, { readyState: 2 })).seeks.length === 0
    );

    // A pause before the check runs cancels it.
    {
      const rec = makeVideo();
      fire(rec.v, 'pause');
      now += 120000;
      fire(rec.v, 'playing');
      fire(rec.v, 'pause');
      await wait(250);
      t(
        'paused again before the check: no seek',
        rec.seeks.length === 0,
        JSON.stringify(rec.seeks)
      );
      rec.v.remove();
    }
    // The nudge's own 'playing' is not checked again: no loop.
    {
      const rec = makeVideo();
      fire(rec.v, 'pause');
      now += 120000;
      fire(rec.v, 'playing');
      await wait(250);
      fire(rec.v, 'playing');
      await wait(250);
      t(
        "the 'playing' after the nudge is not nudged again",
        rec.seeks.length === 1,
        JSON.stringify(rec.seeks)
      );
      rec.v.remove();
    }
  }

  report.finish();
})();
