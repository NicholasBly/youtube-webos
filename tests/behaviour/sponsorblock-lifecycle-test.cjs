/**
 * SponsorBlock's life against the built bundle, with a fake <video>, a fetch
 * stub for the API and a progress bar in the page: the player state events
 * replay the chain and pause the watching, a short video clamps the segments
 * (and a longer duration later gives them their end back), a skip never
 * touches playback, a `mute` segment mutes and unmutes, a disabled category
 * is neither drawn nor skipped, the setting off and toggled while watching,
 * the API having nothing, failing (asked again after 2 s and 4 s), never
 * answering or stalling in the middle of its body, a teardown during the
 * fetch, a <video> replaced (its listeners gone, the bar still watched) or
 * mounting late (the highlight jump waiting for it), and a handler that is
 * done staying done under a new hash for the same video.
 * The skipping itself is sponsorblock-skip-test.cjs.
 *
 * The skip after a landing differs by flavour (webOS 3 to 6 stop short of the
 * end), so the script runs on both.
 *
 * Run: node tests/behaviour/sponsorblock-lifecycle-test.cjs [bundle] [legacy|modern]
 */
const { flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { seg, sponsorBlockPage, VIDEO } = require('../harness/sponsorblock.cjs');
const {
  wait,
  waitFor,
  KEYS,
  videoModel,
  panelCheckbox,
  showPanel
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;
const legacy = flavour === 'legacy';

(async () => {
  // ---- the player state events: pause, resume, replay --------------------------------------
  {
    // The 3 s toast at a 25th: the first chain toast is gone within 150 ms.
    const p = sponsorBlockPage([seg('sponsor', 0, 5), seg('intro', 100, 110)], {}, 0, {
      timers: { scale: 25, from: 500 }
    });
    await p.ready();
    t(
      'the chain at 0 s is skipped on load',
      p.model.currentTime === 5,
      String(p.model.currentTime)
    );
    p.seeked();
    p.state(2); // paused
    p.timeupdate(101);
    await wait(40);
    t(
      'after the PAUSED state a timeupdate inside a segment is ignored',
      p.model.currentTime === 101,
      String(p.model.currentTime)
    );
    p.state(1); // playing
    p.timeupdate(101.5);
    await wait(40);
    t(
      'the PLAYING state arms the listener again: the segment is skipped',
      p.model.currentTime === 110,
      String(p.model.currentTime)
    );
    p.seeked();
    // The video ends, the end screen tears the chrome down, a replay rebuilds
    // it and starts from 0: the chain is skipped again on the new bar.
    await wait(150); // the first chain toast is gone by now
    p.model.currentTime = 300;
    p.state(0); // ended
    p.rebuildBar();
    p.model.currentTime = 0;
    p.state(1);
    await wait(40);
    t(
      'a replay skips the chain at 0 s again',
      p.model.currentTime === 5,
      String(p.model.currentTime)
    );
    // The toast goes up on the next frame, which a loaded machine delays.
    await waitFor(() => p.toasts().some((m) => m === 'Skipped sponsored segment'));
    t(
      'and announces it again',
      p.toasts().some((m) => m === 'Skipped sponsored segment'),
      p.toasts().join(' | ')
    );
  }

  // ---- the duration: clamping and durationchange ---------------------------------------
  {
    // The API has the segment running past the video's end.
    const p = sponsorBlockPage([seg('sponsor', 200, 290)], {}, 10, { duration: 250 });
    await p.ready();
    const end = () => p.sb().segments[0].segment[1];
    const width = () => parseFloat(p.overlay().children[0].style.width);
    if (legacy) {
      report.near(
        'webOS 3 to 6: a segment reaching the end is clamped 0.3 s short of it',
        end(),
        249.7
      );
    } else {
      t('a segment past the end is clamped to the duration', end() === 250, String(end()));
    }
    t(
      'the mark is drawn with the clamped width',
      Math.abs(width() - ((end() - 200) / 250) * 100) < 0.01,
      String(width())
    );
    p.durationchange(220);
    await wait(40);
    report.near(
      'durationchange clamps the segment to the new duration',
      end(),
      legacy ? 219.7 : 220
    );
    t(
      'and redraws the mark',
      Math.abs(width() - ((end() - 200) / 220) * 100) < 0.01,
      String(width())
    );
    p.timeupdate(201);
    await wait(40);
    if (legacy) {
      report.near(
        'webOS 3 to 6: the skip stops where the clamp put the segment end, 0.3 s short',
        p.model.currentTime,
        219.7
      );
    } else {
      t(
        'webOS 22+: the skip lands on the end itself',
        p.model.currentTime === 220,
        String(p.model.currentTime)
      );
    }
    p.seeked();
    // Playback resumes inside the clamped segment: `playing` re-arms the
    // listener, which the skip dropped with nothing left ahead to aim at.
    p.model.currentTime = 219.6;
    p.playing();
    p.timeupdate(219.6);
    await wait(40);
    if (legacy) {
      t(
        'webOS 3 to 6: within the last second the clamped segment is not skipped again',
        p.model.currentTime === 219.6,
        String(p.model.currentTime)
      );
    } else {
      t(
        'webOS 22+: re-entering the segment skips to the end again',
        p.model.currentTime === 220,
        String(p.model.currentTime)
      );
    }
  }

  if (legacy) {
    // A segment already clamped short of the end: the same duration again
    // moves nothing, so a muted segment stays muted.
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30, 'mute'), seg('outro', 280, 300)],
      { enableMutedSegments: true },
      10
    );
    await p.ready();
    p.timeupdate(21);
    await wait(40);
    t('setup: the muted segment mutes', p.model.muted === true);
    p.durationchange(300);
    await wait(40);
    t(
      'webOS 3 to 6: a durationchange to the same duration keeps the muted segment muted',
      p.model.muted === true
    );
  }

  {
    // The player reports a short duration first and the real one later: the
    // segment gets back the end the API gave it.
    const p = sponsorBlockPage([seg('sponsor', 120, 180)], {}, 10, { duration: 15 });
    await p.ready();
    const end = () => p.sb().segments[0].segment[1];
    report.near('setup: the short first duration clamps the segment', end(), legacy ? 14.7 : 15);
    p.durationchange(600);
    await wait(40);
    t('a longer duration later restores the end the API gave', end() === 180, String(end()));
    const mark = p.overlay() && p.overlay().children[0];
    t(
      'and the mark is drawn at its full width again (60 s of 600)',
      !!mark && Math.abs(parseFloat(mark.style.width) - 10) < 0.01,
      mark ? mark.style.width : 'no mark'
    );
    p.timeupdate(126);
    await wait(40);
    t(
      'the segment is skipped to its end',
      p.model.currentTime === 180,
      String(p.model.currentTime)
    );
  }

  // ---- a skip never touches playback --------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30), seg('outro', 280, 300)], {}, 10);
    await p.ready();
    p.timeupdate(15);
    // The player reports paused (a stall) without a pause event, so the
    // listener is still on when the segment starts.
    p.model.paused = true;
    p.timeupdate(21);
    await wait(40);
    t('the skip lands at the segment end', p.model.currentTime === 30, String(p.model.currentTime));
    t(
      'a skip never calls play(): the player owns playback',
      p.model.plays === 0,
      String(p.model.plays)
    );
    p.seeked();
    p.timeupdate(281);
    await wait(40);
    if (legacy) {
      report.near(
        'webOS 3 to 6: the end segment is left 0.3 s before the end',
        p.model.currentTime,
        299.7
      );
    } else {
      t(
        'webOS 22+: the end segment is skipped to the very end',
        p.model.currentTime === 300,
        String(p.model.currentTime)
      );
    }
  }

  // ---- muted segments --------------------------------------------------------------------
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30, 'mute'), seg('intro', 50, 60)],
      { enableMutedSegments: true },
      10
    );
    await p.ready();
    t(
      'a mute segment is drawn like any other',
      !!p.overlay() && p.overlay().children.length === 2,
      p.overlay() && String(p.overlay().children.length)
    );
    p.timeupdate(21);
    await wait(40);
    t(
      'entering a mute segment mutes the video instead of skipping',
      p.model.muted === true && p.model.currentTime === 21,
      `muted ${p.model.muted} at ${p.model.currentTime}`
    );
    t('no skip toast for a muted segment', !p.toasts().some((m) => /Skipped/.test(m)));
    p.timeupdate(25);
    t('still muted inside it', p.model.muted === true);
    p.timeupdate(31);
    t('leaving the segment unmutes', p.model.muted === false);
    // The viewer's own mute comes back, not an unmute.
    p.model.muted = true;
    p.seekTo(22);
    await wait(40);
    p.seekTo(40);
    await wait(40);
    t('a viewer who was muted stays muted after the segment', p.model.muted === true);
    p.model.muted = false;
    p.seekTo(23);
    await wait(40);
    t('a seek into the segment mutes', p.model.muted === true);
    p.seekTo(45);
    await wait(40);
    t('a seek out of it unmutes', p.model.muted === false);
    p.seekTo(24);
    await wait(40);
    p.win.location.hash = '#/';
    await waitFor(() => p.sb() === null);
    t('leaving the video while muted restores the sound', p.model.muted === false);
  }
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30, 'mute')],
      { enableMutedSegments: false },
      10
    );
    await p.ready();
    p.timeupdate(21);
    await wait(40);
    t(
      'with muted segments off a mute segment does nothing',
      p.model.muted === false && p.model.currentTime === 21,
      `muted ${p.model.muted} at ${p.model.currentTime}`
    );
  }
  {
    // The intro after them keeps the handler listening past the landing.
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30, 'mute'), seg('selfpromo', 25, 35), seg('intro', 50, 60)],
      { enableMutedSegments: true },
      10
    );
    await p.ready();
    p.timeupdate(21);
    p.timeupdate(26);
    await wait(40);
    t(
      'a skip segment inside a muted one is skipped, muted part and all',
      p.model.currentTime === 35,
      String(p.model.currentTime)
    );
    t('the jump out of the muted segment unmutes at once', p.model.muted === false);
    p.seeked();
    p.timeupdate(36);
    t('and the next timeupdate keeps it unmuted', p.model.muted === false);
  }

  // ---- a disabled category ------------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], { sbMode_sponsor: 'disable' }, 40);
    await p.ready();
    t('a disabled category draws nothing', !p.overlay());
    p.seekTo(21);
    await wait(40);
    t('and skips nothing', p.model.currentTime === 21, String(p.model.currentTime));
  }

  // ---- the setting off ----------------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], { enableSponsorBlock: false }, 40);
    await wait(150); // past the per-video start, 100 ms here
    t(
      'SponsorBlock off: no request, no handler',
      p.requests.length === 0 && !p.sb(),
      p.requests.join(' | ')
    );
  }

  // ---- the setting toggled while watching --------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40);
    await p.ready();
    t('setup: a handler is running before the toggle', !!p.sb());
    await showPanel(p.win);
    const box = panelCheckbox(p.win, 'SponsorBlock');
    t('the SponsorBlock checkbox is on the panel', !!box && box.checked === true);
    box.click();
    await wait(80);
    t('off: the handler is torn down at once', p.sb() === null);
    box.click();
    await waitFor(() => p.sb() && p.requests.length === 2);
    t(
      'on again: a new handler fetches for the video being watched',
      !!p.sb() && p.requests.length === 2,
      p.requests.join(' | ')
    );
  }

  // ---- the API has nothing, or is down ------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, { apiStatus: 404 });
    await p.ready();
    t(
      '404 means no segments: the fallback server is not asked and the handler is gone',
      p.requests.length === 1 && p.sb() === null && !p.overlay(),
      p.requests.join(' | ')
    );
    const d = p.win.document;
    t(
      "a video without segments leaves YouTube's bar alone: no style on the track or around the renderer",
      d.querySelector('[idomkey="progress-bar"]').getAttribute('style') === null &&
        d.getElementById('bar-host').getAttribute('style') === null,
      d.querySelector('[idomkey="progress-bar"]').getAttribute('style') +
        ' / ' +
        d.getElementById('bar-host').getAttribute('style')
    );
    p.press(KEYS.BLUE);
    await wait(30);
    t(
      'with the handler gone the blue key says SponsorBlock is not loaded',
      p.toasts().some((m) => m === 'SponsorBlock not loaded'),
      p.toasts().join(' | ')
    );
  }
  {
    // A 200 whose body is not the list the endpoint returns. The retries
    // after 2 s and 4 s at a 20th.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      body: { message: 'not a list' },
      timers: { scale: 20, from: 500 }
    });
    await p.ready();
    await waitFor(() => p.sb() === null, 3000);
    t(
      'an answer that is not a list is asked for twice more, then ends the handler, with no error',
      p.sb() === null && !p.overlay() && p.requests.length === 3,
      p.requests.length + ' request(s)'
    );
  }
  {
    // The retries after 2 s and 4 s at a 20th. The timers are recorded
    // unscaled, each with the number of API requests made before it.
    const timers = [];
    let asked = 0;
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      apiStatus: 500,
      timers: { scale: 20, from: 500 },
      setup(w) {
        const setTimeout = w.setTimeout;
        const fetch = w.fetch;
        w.setTimeout = (cb, ms, ...args) => {
          timers.push({ ms, asked });
          return setTimeout(cb, ms, ...args);
        };
        w.fetch = (url, opts) => {
          if (String(url).indexOf('/skipSegments/') !== -1) asked++;
          return fetch(url, opts);
        };
      }
    });
    await p.ready();
    await waitFor(() => p.sb() === null, 3000);
    const servers = p.requests.map((u) => (/sponsorblock\.inf\.re/.test(u) ? 'p' : 'f')).join('');
    t(
      '500 from both servers: both asked again twice, primary first each time, then the handler gives up',
      servers === 'pfpfpf' && p.sb() === null && !p.overlay(),
      servers
    );
    const after = (n, ms) => timers.some((x) => x.asked === n && x.ms === ms);
    t(
      'the second round waits 2 s and the third 4 s',
      after(2, 2000) && after(4, 4000),
      timers.map((x) => x.asked + ':' + x.ms).join(',')
    );
  }
  {
    // Both servers answer 503 once, then the API is back: the retry gets the segments.
    let asked = 0;
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, {
      timers: { scale: 20, from: 500 },
      setup(w) {
        const fetch = w.fetch;
        w.fetch = (url, opts) => {
          if (String(url).indexOf('/skipSegments/') === -1) return fetch(url, opts);
          asked++;
          return asked <= 2
            ? Promise.resolve({ ok: false, status: 503, json: async () => [] })
            : fetch(url, opts);
        };
      }
    });
    await waitFor(() => !!p.overlay(), 3000);
    t(
      'both servers failing and then back: the retry draws the segments',
      asked === 3 && !!p.sb() && !!p.overlay() && p.overlay().children.length === 1,
      asked + ' request(s)'
    );
  }
  {
    // Leaving the page during the wait for a retry. The 2 s timer after the
    // first round is held (it never runs by itself), so the teardown always
    // lands inside the wait.
    let asked = 0;
    let held = null;
    const cleared = [];
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      apiStatus: 500,
      timers: { scale: 20, from: 500 },
      setup(w) {
        const setTimeout = w.setTimeout;
        const clearTimeout = w.clearTimeout;
        const fetch = w.fetch;
        w.setTimeout = (cb, ms, ...args) => {
          if (ms !== 2000 || asked !== 2) return setTimeout(cb, ms, ...args);
          held = setTimeout(() => {}, 60000);
          return held;
        };
        w.clearTimeout = (id) => {
          cleared.push(id);
          return clearTimeout(id);
        };
        w.fetch = (url, opts) => {
          if (String(url).indexOf('/skipSegments/') !== -1) asked++;
          return fetch(url, opts);
        };
      }
    });
    await waitFor(() => held !== null, 3000);
    p.win.location.hash = '#/';
    await waitFor(() => p.sb() === null);
    t(
      'a teardown while a retry waits clears its timer',
      held !== null && cleared.indexOf(held) !== -1 && p.requests.length === 2,
      p.requests.length + ' request(s)'
    );
  }

  // ---- the API never answers ------------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      hang: true,
      timers: { scale: 20, from: 500 }
    });
    await p.ready();
    t('one request is pending', p.pending.length === 1 && !!p.sb(), String(p.pending.length));
    // The 5 s timeout, at a 20th (250 ms): at a 50th it could run out before
    // the check above under a loaded machine.
    await waitFor(() => p.pending.length === 2);
    t(
      'after the timeout the fallback server is asked',
      p.pending.length === 2 && !!p.sb(),
      String(p.pending.length)
    );
    if (legacy) {
      t(
        'webOS 3 to 6: without AbortController the request is raced against a timer',
        p.pending[0].signal === undefined && p.pending[0].aborted === false
      );
    } else {
      t('webOS 22+: the timed-out request is aborted', p.pending[0].aborted === true);
    }
    // 2 s later at a 20th the primary is asked again, and answers this time.
    await waitFor(() => p.pending.length === 3, 3000);
    t(
      'both servers timing out: the primary is asked again',
      p.pending.length === 3 && !!p.sb() && /sponsorblock\.inf\.re/.test(p.pending[2].url),
      String(p.pending.length)
    );
    if (p.pending[2]) p.pending[2].resolve([seg('sponsor', 20, 30)]);
    await waitFor(() => !!p.overlay());
    t('the late answer of the retry is drawn', !!p.sb() && !!p.overlay());
  }

  // ---- the primary answers and stalls in the middle of the body ----
  {
    // The 5 s timeout at a twentieth: the body read is inside it too.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, {
      stallBody: 1,
      timers: { scale: 20, from: 500 }
    });
    await waitFor(() => !!p.overlay());
    t(
      'a primary that stalls mid-body runs into the timeout: the fallback is asked and answers',
      p.requests.length === 2 && !!p.overlay(),
      p.requests.length + ' request(s)'
    );
  }

  // ---- a teardown during the fetch --------------------------------------------------------
  {
    // The 5 s timeout at a twentieth, 250 ms: the teardown lands well before
    // it even on a loaded machine, and the wait below goes past it.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      hang: true,
      timers: { scale: 20, from: 500 }
    });
    await p.ready();
    p.win.location.hash = '#/';
    await waitFor(() => p.sb() === null);
    t('leaving the page while the fetch is pending destroys the handler', p.sb() === null);
    if (!legacy) t('webOS 22+: the pending request is aborted', p.pending[0].aborted === true);
    await wait(300); // past the timeout
    t(
      'a destroyed handler does not ask the fallback server',
      p.pending.length === 1,
      String(p.pending.length)
    );
    // The API answering late changes nothing.
    p.pending[0].resolve([seg('sponsor', 20, 30)]);
    await wait(40);
    t('a late answer draws nothing', !p.overlay() && p.overlays() === 0);
  }

  // ---- the <video> is replaced: the old element keeps no listeners ----------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10);
    await p.ready();
    const old = p.win.document.querySelector('video');
    const removed = { timeupdate: 0 };
    const realRemove = old.removeEventListener.bind(old);
    old.removeEventListener = (type, ...rest) => {
      if (type === 'timeupdate') removed.timeupdate++;
      return realRemove(type, ...rest);
    };
    old.remove();
    p.addVideo();
    // The PLAYING state re-finds the bar, which sees the old element gone and rebinds.
    p.state(1);
    await wait(40);
    t(
      'the replaced <video> loses its timeupdate listener and the new one is bound',
      removed.timeupdate >= 1,
      `${removed.timeupdate} removed`
    );
    p.timeupdate(21);
    await wait(40);
    t('skipping works on the replacement', p.model.currentTime === 30, String(p.model.currentTime));
  }

  // ---- the <video> mounts after the handler started ----------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, { noVideo: true });
    await p.ready();
    t('without a <video> the handler waits: nothing is drawn yet', !!p.sb() && !p.overlay());
    p.addVideo();
    await waitFor(() => p.overlay());
    t(
      'the mounted <video> is bound: the overlay is drawn beside the bar',
      p.overlays() === 1 && p.overlay().children.length === 1,
      String(p.overlays())
    );
    p.timeupdate(21);
    await wait(40);
    t('skipping works on the late video', p.model.currentTime === 30, String(p.model.currentTime));
  }
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, { noVideo: true });
    await p.ready();
    // The player mounts as a subtree with the <video> inside it.
    const wrapper = p.win.document.createElement('div');
    const video = p.win.document.createElement('video');
    wrapper.appendChild(video);
    p.win.document.getElementById('ytlr-player__player-container').appendChild(wrapper);
    // The playback model goes on before the observer's microtask binds the element.
    videoModel(p.win, { currentTime: 10, duration: 300, paused: false });
    await waitFor(() => p.overlay());
    t(
      'a <video> mounted inside a player subtree is bound too: the overlay is drawn',
      p.overlays() === 1,
      String(p.overlays())
    );
  }
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, { noVideo: true });
    await p.ready();
    p.win.location.hash = '#/';
    await wait(100);
    p.addVideo();
    await wait(100);
    t('a <video> mounting after the teardown is not bound', p.sb() === null && !p.overlay());
  }
  {
    // The highlight's auto jump waits for the <video>.
    const p = sponsorBlockPage(
      [seg('poi_highlight', 200, 200)],
      { sbMode_highlight: 'auto_skip' },
      10,
      { noVideo: true }
    );
    await p.ready();
    p.addVideo();
    await waitFor(() => p.model.currentTime === 200);
    await wait(40);
    t(
      'a highlight in auto mode is jumped to once the late <video> is bound',
      p.model.currentTime === 200,
      String(p.model.currentTime)
    );
    t(
      'and the jump is announced',
      p.toasts().some((m) => m === 'Jumped to Highlight'),
      p.toasts().join(' | ')
    );
  }
  {
    // The bar is tracked before the <video> mounts: binding the video draws.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, { noVideo: true });
    await p.ready();
    await waitFor(() => p.sb() && p.sb().progressBar);
    t('setup: the bar is tracked with no <video> yet', !!p.sb().progressBar && !p.overlay());
    p.addVideo();
    await waitFor(() => p.overlay());
    t(
      'a <video> bound after the bar was tracked gets the overlay, with no durationchange',
      p.overlays() === 1,
      String(p.overlays())
    );
  }
  {
    // The <video> mounts after the wait for it gave up (10 s, here 500 ms): the
    // next PLAYING state binds it.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, {
      noVideo: true,
      timers: { scale: 20, from: 500 }
    });
    await p.ready();
    await wait(700);
    p.addVideo();
    await wait(60);
    p.state(1);
    p.playing();
    await wait(40);
    p.timeupdate(21);
    await wait(40);
    t(
      'a <video> mounting after the wait gave up is bound on PLAYING: the segment is skipped',
      p.model.currentTime === 30,
      String(p.model.currentTime)
    );
  }

  // ---- the <video> is replaced: the bar stays watched ----------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10);
    await p.ready();
    p.win.document.querySelector('video').remove();
    p.addVideo();
    p.state(1);
    await wait(60);
    t(
      'setup: the replacement is bound, the overlay is shown',
      p.overlays() === 1 && p.overlay().style.opacity === '1',
      p.overlay() && p.overlay().style.opacity
    );
    // YouTube hides the bar with no player event: only the bar's own
    // attribute observer can see it.
    p.win.document
      .querySelector('ytlr-multi-markers-player-bar-renderer')
      .classList.add('zylon-hidden');
    await waitFor(() => p.overlay().style.opacity === '0');
    t(
      'after a video rebind the bar is still watched: hiding it hides the overlay',
      p.overlay().style.opacity === '0',
      p.overlay().style.opacity
    );
  }
  for (const wrapped of [false, true]) {
    // The replacement mounts a moment after the old <video> is gone.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, { wrapped });
    await p.ready();
    const d = p.win.document;
    d.querySelector('video').remove();
    p.state(1);
    await wait(60);
    p.addVideo();
    await wait(60);
    d.querySelector('ytlr-multi-markers-player-bar-renderer').classList.add('zylon-hidden');
    await waitFor(() => p.overlay() && p.overlay().style.opacity === '0');
    t(
      `a <video> mounting late after a rebind keeps the bar watched (${wrapped ? 'with' : 'without'} ytlr-progress-bar)`,
      !!p.overlay() && p.overlay().style.opacity === '0',
      p.overlay() && p.overlay().style.opacity
    );
  }

  // ---- the same video under a new hash: a handler that is done stays done ----------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, { apiStatus: 404 });
    await p.ready();
    t('setup: 404, the handler is gone after one request', p.requests.length === 1 && !p.sb());
    p.win.location.hash = '#/watch?v=' + VIDEO + '&t=15s';
    await wait(150);
    t(
      'a hash change within the same video does not ask the API again',
      p.requests.length === 1 && !p.sb(),
      p.requests.join(' | ')
    );
  }

  // ---- back from another app: a plain relaunch keeps the handler ----------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 5);
    await p.ready();
    const before = p.sb();
    // The URL the app runs under on a TV: the start URL's flags, the video in
    // the hash. A relaunch that went to the start URL would change the hash only.
    p.win.history.replaceState(
      null,
      '',
      'https://www.youtube.com/tv?env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1#/watch?v=' +
        VIDEO
    );
    p.win.document.dispatchEvent(new p.win.CustomEvent('webOSRelaunch', { detail: {} }));
    await wait(150);
    t(
      'a relaunch without a target stays on the video: same handler, no new request',
      !!before && p.sb() === before && p.requests.length === 1,
      p.win.location.hash + ' / ' + p.requests.length
    );
    t(
      'a relaunch without a target leaves the hash alone',
      p.win.location.hash === '#/watch?v=' + VIDEO,
      p.win.location.hash
    );
  }

  report.finish();
})();
