/**
 * Force High Resolution Video against the built bundle on both flavours, with a fake
 * player element standing in for YouTube's: the localStorage quality key (kept
 * while it has months left, written again near its expiration and over the
 * app's own pair), the player API call (its counters always on window), the intercept of an already-playing video, the state event
 * the other features depend on, and the teardown when the watch page is left.
 * Then the webOS 25 first-playback kick (kickstart.js, on a webOS 25 user
 * agent), the setting flipped at runtime while a player is attached or with
 * none, and an inline preview player, which is never forced.
 *
 * Run: node tests/behaviour/video-quality-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, panelCheckbox, KEYS, showPanel, clock } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const PLAYER_ID = 'ytlr-player__player-container-player';
const QUALITY_KEY = 'yt-player-quality';
const DAY = 24 * 60 * 60 * 1000;
const forcedRecord = (creation, expiration) =>
  JSON.stringify({
    data: JSON.stringify({ quality: 4320, previousQuality: 4320 }),
    creation,
    expiration
  });
const appRecord = () =>
  JSON.stringify({
    data: JSON.stringify({ quality: 720, previousQuality: 1080 }),
    creation: Date.now(),
    expiration: Date.now() + 300 * DAY
  });

/**
 * A player element with the subset of the YouTube API the module touches.
 *
 * Note the quality model: the module treats every named level (highres down to
 * tiny) as "already settled" and only pushes highres through the API while the
 * player reports no quality yet ('unknown', as before playback). The
 * localStorage key is what carries the preference into the player.
 */
function fakePlayer(d, opts) {
  const el = d.createElement('div');
  el.id = PLAYER_ID;
  const calls = { range: [], quality: [], play: 0, pause: 0, removed: 0 };
  let current = opts.quality || 'unknown';
  let state = opts.state === undefined ? -1 : opts.state;
  let videoId = opts.videoId || 'vid00000001';
  let onStateChange = null;
  Object.assign(el, {
    isInline: () => false,
    getPlayerState: () => state,
    getVideoData: () => ({ video_id: videoId }),
    getAvailableQualityLevels: () => ['hd1080', 'large', 'medium'],
    getPlaybackQuality: () => current,
    getPlaybackQualityLabel: () => (current === 'highres' ? '2160p' : '480p'),
    setPlaybackQualityRange: (lo, hi) => {
      calls.range.push([lo, hi]);
      current = hi;
    },
    setPlaybackQuality: (q) => {
      calls.quality.push(q);
      current = q;
    },
    playVideo: () => {
      calls.play++;
      state = 1;
    },
    pauseVideo: () => {
      calls.pause++;
      state = 2;
    },
    addEventListener: (type, cb) => {
      if (type === 'onStateChange') onStateChange = cb;
    },
    removeEventListener: (type) => {
      if (type === 'onStateChange') {
        onStateChange = null;
        calls.removed++;
      }
    }
  });
  return {
    el,
    calls,
    /** YouTube's player reports a new state (and optionally a new video). */
    fire(next, nextVideoId) {
      state = next;
      if (nextVideoId) videoId = nextVideoId;
      if (onStateChange) onStateChange(next);
    },
    get quality() {
      return current;
    },
    get listening() {
      return !!onStateChange;
    }
  };
}

/**
 * A watch page whose bundle runs on `run()`, once the fake player is in place.
 * `more` goes to createPage (the user agent, key capture, timers), apart from
 * `more.extraHtml`, which is markup placed inside <ytlr-app>. The timers of
 * 500 ms and more (the quality toast's delay, the panel's build gate, the
 * once-a-second poll, the toasts) run at a tenth unless `more.timers` says
 * otherwise; the 200 ms player poll keeps its length.
 */
function boot(cfg, bodyClass, more) {
  const stateEvents = [];
  const o = Object.assign({}, more);
  const extraHtml = o.extraHtml || '';
  delete o.extraHtml;
  const page = createPage(
    Object.assign(
      {
        html: `<!doctype html><html><body class="${bodyClass || 'WEB_PAGE_TYPE_WATCH'}"><ytlr-app>
       <div id="ytlr-player__player-container"></div>${extraHtml}</ytlr-app></body></html>`,
        url: 'https://www.youtube.com/tv#/watch?v=vid00000001',
        config: Object.assign({ forceHighResVideo: true }, cfg),
        raf: 'timeout',
        timers: { scale: 10, from: 500 },
        setup: (win) =>
          win.addEventListener('yt-player-state-change', (e) => stateEvents.push(e.detail)),
        autoRun: false
      },
      o
    )
  );
  const run = () => {
    const error = page.run();
    if (error) throw error;
  };
  return { win: page.win, stateEvents, keys: page.keys, run };
}

/** The module has attached to `player`: the poll found it. */
const attached = (player) => waitFor(() => player.listening);

const storedQuality = (win) => {
  const raw = win.localStorage.getItem(QUALITY_KEY);
  if (!raw) return null;
  const env = JSON.parse(raw);
  return { env, inner: JSON.parse(env.data) };
};

// The kick loop waits KICKSTART_INTERVAL_MS (500) between attempts and the
// controls are dismissed with presses 250 ms apart, the hiding lifted 750
// ms after the first: all at a tenth (50, 25 and 75 ms).
const KICK_TIMERS = { scale: 10, from: 250 };
const CONTROLS_HTML =
  '<yt-focus-container idomkey="controls" class="MFDzfe--focused"></yt-focus-container>';
// The controls bar hidden while it is dismissed (ui/hide-controls.js).
const controlsHidden = (d) => d.body.classList.contains('ytaf-hide-controls');

(async () => {
  // ---- forcing on: key, API call, state event -------------------------------
  {
    const { win, stateEvents, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);

    const q = storedQuality(win);
    t(
      'writes yt-player-quality as the 4320p envelope',
      !!q && q.inner.quality === 4320 && q.inner.previousQuality === 4320,
      JSON.stringify(q)
    );
    t(
      'envelope carries creation and a one-year expiration',
      !!q && q.env.expiration - q.env.creation === 31536000000,
      q && String(q.env.expiration - q.env.creation)
    );
    t('attaches to the player and listens for onStateChange', player.listening);
    t(
      'UNSTARTED with no quality reported yet: setPlaybackQualityRange(highres, highres)',
      player.calls.range.length === 1 && player.calls.range[0].join(',') === 'highres,highres',
      JSON.stringify(player.calls.range)
    );
    t(
      'publishes yt-player-state-change with the state',
      stateEvents.length >= 1 && stateEvents[0].state === -1,
      JSON.stringify(stateEvents[0])
    );

    // The same video starts playing: nothing more to force, no pause/play dance.
    player.fire(1);
    await wait(30);
    t(
      'PLAYING on an already-forced video leaves playback alone',
      player.calls.pause === 0 && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
    t(
      'state events keep flowing (PLAYING published)',
      stateEvents.some((e) => e.state === 1),
      JSON.stringify(stateEvents.map((e) => e.state))
    );

    // A new video already playing with no quality reported gets intercepted.
    player.calls.range.length = 0;
    player.el.setPlaybackQuality('unknown');
    player.calls.quality.length = 0;
    player.fire(1, 'vid00000002');
    await waitFor(() => player.calls.play === 1);
    t(
      'new PLAYING video without a quality: paused, upgraded, resumed',
      player.calls.pause === 1 && player.calls.play === 1 && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
    // The toast follows the resume after the notification delay (500 ms, 50 here).
    const toast = () => (d.body.textContent || '').trim();
    await waitFor(() => toast().indexOf('Video quality upgraded to 2160p') !== -1);
    t(
      'a notification names the new quality',
      toast().indexOf('Video quality upgraded to 2160p') !== -1,
      toast().slice(0, 120)
    );

    // Leaving the watch page tears the listener down.
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await waitFor(() => !player.listening);
    t(
      'leaving the watch page detaches from the player',
      player.calls.removed === 1 && !player.listening,
      JSON.stringify(player.calls)
    );
  }
  {
    // The 4320 pair already stored (an earlier session), months from its
    // expiration: nothing to write.
    const stored = forcedRecord(Date.now() - 100 * DAY, Date.now() + 200 * DAY);
    const { win, run } = boot({}, null, { storage: { [QUALITY_KEY]: stored } });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t(
      'a stored 4320 pair is left as it is: nothing is written again',
      win.localStorage.getItem(QUALITY_KEY) === stored,
      win.localStorage.getItem(QUALITY_KEY)
    );
  }
  for (const [label, expiration] of [
    ['expired', Date.now() - 1000],
    ['ten days from expiring', Date.now() + 10 * DAY]
  ]) {
    // The app reads an expired record as no preference: ours is written again
    // before that, dated from now.
    const stored = forcedRecord(Date.now() - 360 * DAY, expiration);
    const { win, run } = boot({}, null, { storage: { [QUALITY_KEY]: JSON.parse(stored) } });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    const before = Date.now();
    run();
    await attached(player);
    const q = storedQuality(win);
    t(
      `a stored 4320 pair ${label} is written again with a new year`,
      !!q &&
        q.inner.quality === 4320 &&
        q.env.creation >= before &&
        q.env.expiration - q.env.creation === 31536000000,
      JSON.stringify(q && q.env)
    );
  }
  {
    // A record whose data does not parse is no preference at all.
    const broken = JSON.stringify({ data: '{not json', creation: 1, expiration: 2 });
    const { win, run } = boot({}, null, { storage: { [QUALITY_KEY]: broken } });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    const q = storedQuality(win);
    t(
      'a stored record whose data does not parse is replaced by the 4320 pair',
      !!q && q.inner.quality === 4320 && q.env.creation !== 1,
      JSON.stringify(q)
    );
  }

  // ---- the app's own preference written mid-session --------------------------------
  {
    const { win, run } = boot({});
    const d = win.document;
    // Past the 2 s between two writes without waiting for it.
    const c = clock(win);
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t('setup: the 4320 pair is written', storedQuality(win).inner.quality === 4320);
    // The viewer picks 720p: the app stores its own pair.
    win.localStorage.setItem(QUALITY_KEY, appRecord());
    c.offset += 3000;
    player.fire(-1, 'vid00000002');
    await wait(30);
    t(
      "the next video's start writes the 4320 pair over the app's own",
      storedQuality(win).inner.quality === 4320,
      win.localStorage.getItem(QUALITY_KEY)
    );
    // The same after leaving the watch page and coming back.
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await waitFor(() => !player.listening);
    win.localStorage.setItem(QUALITY_KEY, appRecord());
    c.offset += 3000;
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await attached(player);
    t(
      'and so does the next visit of the watch page',
      storedQuality(win).inner.quality === 4320,
      win.localStorage.getItem(QUALITY_KEY)
    );
  }

  // ---- diagnostics: how often the player API path forces the quality ----
  {
    // No diagnostics switch: the counters are on the page from the start.
    const { win, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    await waitFor(() => player.calls.range.length === 1);
    const stats = win.__ytafQualityStats;
    t(
      'each quality forced through the player API is counted on window, diagnostics off',
      !!stats && stats.apiUpgrades === 1 && stats.intercepts === 0,
      JSON.stringify(stats)
    );
  }

  // ---- a new video that reports BUFFERING first ------------------------------
  {
    const { win, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: 3 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t(
      'BUFFERING as the first state, levels known: the quality is set then, not on PLAYING',
      player.calls.range.length === 1 && player.calls.pause === 0,
      JSON.stringify(player.calls)
    );
  }

  // ---- already at max: no call, no toast -------------------------------------
  {
    const { win, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: -1, quality: 'large' });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t(
      'a player that already reports a quality level is not pushed through the API',
      player.calls.range.length === 0,
      JSON.stringify(player.calls.range)
    );
  }

  // ---- forcing off: the shared event still fires, nothing else ---------------
  {
    const { win, stateEvents, run } = boot({ forceHighResVideo: false });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    player.fire(1);
    await wait(30);
    t(
      'off: no yt-player-quality key',
      win.localStorage.getItem(QUALITY_KEY) === null,
      win.localStorage.getItem(QUALITY_KEY)
    );
    t(
      'off: player API untouched',
      player.calls.range.length === 0 && player.calls.quality.length === 0,
      JSON.stringify(player.calls)
    );
    t(
      'off: yt-player-state-change is still published for the other features',
      stateEvents.length >= 2 && stateEvents.some((e) => e.state === 1),
      JSON.stringify(stateEvents.map((e) => e.state))
    );
  }

  // ---- the setting turned off while the poll is still looking for the player ----
  {
    const { win, run } = boot({});
    const d = win.document;
    run();
    await wait(50);
    await showPanel(win);
    const box = panelCheckbox(win, 'Force Max Quality');
    t('setup: the Force Max Quality checkbox is on', !!box && box.checked === true);
    box.click();
    await wait(50);
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    await attached(player);
    player.fire(1);
    await wait(30);
    t(
      'turned off during the poll: the player is attached but nothing is forced',
      player.listening && player.calls.range.length === 0 && player.calls.quality.length === 0,
      JSON.stringify(player.calls)
    );
  }

  // ---- player arrives late: the poll finds it --------------------------------
  {
    const { win, run } = boot({});
    const d = win.document;
    run();
    await wait(50);
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    await attached(player);
    t(
      'a player mounted after the page loads is picked up by the poll',
      player.listening && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
  }

  // ---- a player that takes longer than the ten-second poll is still attached ----
  {
    // The 200 ms poll at a fiftieth: its fifty attempts are over in 200 ms,
    // then the once-a-second poll (20 ms here) carries on.
    const { win, run } = boot({}, null, { timers: { scale: 50, from: 200 } });
    const d = win.document;
    run();
    await wait(300);
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    await attached(player);
    t(
      'a player mounted after the first ten seconds is still picked up',
      player.listening && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
  }

  // ---- only the watch page looks for the player ----
  {
    const lookups = { n: 0 };
    const { win, run } = boot({}, 'WEB_PAGE_TYPE_BROWSE', {
      setup(w) {
        const real = w.document.getElementById.bind(w.document);
        w.document.getElementById = (id) => {
          if (id === PLAYER_ID) lookups.n++;
          return real(id);
        };
      }
    });
    const d = win.document;
    run();
    // Longer than the 200 ms poll interval.
    await wait(250);
    t('a start on the home screen never looks for the player', lookups.n === 0, String(lookups.n));
    // The watch page entered and left again before the deferred attach ran.
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await Promise.resolve();
    await Promise.resolve();
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(250);
    t(
      'the watch page left before the attach ran: no lookup follows on the home screen',
      lookups.n === 0,
      String(lookups.n)
    );
  }

  // ---- a player that never mounts is given up on after a minute ----
  {
    // The 200 ms poll at a fiftieth and the once-a-second one too (4 and 20 ms,
    // nearer 16 and 31 on a coarse timer): over in one to three seconds.
    const lookups = { n: 0 };
    const { run } = boot({}, null, {
      timers: { scale: 50, from: 200 },
      setup(w) {
        const real = w.document.getElementById.bind(w.document);
        w.document.getElementById = (id) => {
          if (id === PLAYER_ID) lookups.n++;
          return real(id);
        };
      }
    });
    run();
    await waitFor(() => lookups.n >= 101, 6000);
    const settled = lookups.n;
    await wait(300);
    t(
      'no player for a minute: the poll stops (101 lookups, then none)',
      lookups.n === settled && settled === 101,
      settled + ' then ' + lookups.n
    );
  }

  // ---- leaving right after the upgrade: no toast on the next page ----
  {
    const { win, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t('setup: the quality was pushed', player.calls.range.length === 1);
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(200);
    t(
      'the upgrade toast is dropped with the watch page',
      (d.body.textContent || '').indexOf('Video quality upgraded') === -1,
      (d.body.textContent || '').trim().slice(0, 120)
    );
  }

  // webOS 25 runs the webOS 22+ bundle: the kick is not in the legacy one.
  if (flavour === 'legacy') {
    report.note('legacy: no webOS 25 kick in this bundle, its cases are not run');
  }

  // ---- webOS 25: the first playback is kicked until the player reports PLAYING ----
  if (flavour === 'modern') {
    const { win, keys, run } = boot({}, null, {
      ua: 'webos25',
      captureKeys: true,
      timers: KICK_TIMERS,
      extraHtml: CONTROLS_HTML
    });
    const d = win.document;
    // The fake answers a playVideo() with PLAYING, as the real player does once kicked.
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await waitFor(() => player.calls.play === 1);
    t(
      'webOS 25: a player stuck in UNSTARTED after the quality switch gets a playVideo()',
      player.calls.play === 1 && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
    // The next attempt (500 ms, 50 here) sees PLAYING and stops; the controls
    // the kick raised are hidden and dismissed on the following frame, and the
    // hiding is lifted 750 ms (75 here) after that.
    const ups = () => keys.filter((k) => k === KEYS.UP).length;
    await waitFor(() => controlsHidden(d));
    t(
      'once PLAYING is reported no further kick is sent',
      player.calls.play === 1,
      JSON.stringify(player.calls)
    );
    t('focused controls: the bar is hidden', controlsHidden(d), String(controlsHidden(d)));
    t('focused controls: a first UP is sent at once', ups() >= 1, keys.join(','));
    await waitFor(() => ups() === 3 && !controlsHidden(d));
    t('three UP presses dismiss the controls (0, 250 and 500 ms)', ups() === 3, keys.join(','));
    t('and shown again after 750 ms', !controlsHidden(d));

    // The kick is once per session: a later video, even after the watch page
    // was left and entered again, is not kicked.
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(30);
    t('setup: leaving the watch page detaches', !player.listening);
    player.el.setPlaybackQuality('unknown');
    player.calls.quality.length = 0;
    player.fire(-1, 'vid00000002');
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await attached(player);
    t('setup: back on the watch page the player is attached again', player.listening);
    await wait(100);
    t(
      'the kick runs once per session: the next video on a fresh attach is not kicked',
      player.calls.play === 1 && player.calls.range.length === 2,
      JSON.stringify(player.calls)
    );
  }

  // ---- webOS 25: leaving while the controls are dismissed stops the presses ----
  if (flavour === 'modern') {
    const { win, keys, run } = boot({}, null, {
      ua: 'webos25',
      captureKeys: true,
      timers: KICK_TIMERS,
      extraHtml: CONTROLS_HTML
    });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    const ups = () => keys.filter((k) => k === KEYS.UP).length;
    await waitFor(() => ups() === 1);
    d.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(200);
    t(
      'the watch page left after the first UP: the other two are not sent, the style goes',
      ups() === 1 && !controlsHidden(d),
      keys.join(',') + ' / ' + controlsHidden(d)
    );
  }

  // ---- webOS 25: controls not focused, nothing to dismiss -------------------------
  if (flavour === 'modern') {
    const { win, keys, run } = boot({}, null, {
      ua: 'webos25',
      captureKeys: true,
      timers: KICK_TIMERS,
      extraHtml: '<yt-focus-container idomkey="controls"></yt-focus-container>'
    });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await wait(100);
    t(
      'controls not focused after the kick: no UP is sent and no hiding style added',
      player.calls.play === 1 && keys.length === 0 && !controlsHidden(d),
      keys.join(',') + ' / ' + controlsHidden(d)
    );
  }

  // ---- webOS 25: a player that never starts is given up on after ten kicks ----------
  if (flavour === 'modern') {
    const { win, run } = boot({}, null, { ua: 'webos25', timers: KICK_TIMERS });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    // This player ignores playVideo(): the state never leaves UNSTARTED.
    const plays = { n: 0 };
    player.el.playVideo = () => {
      plays.n++;
    };
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    // Ten attempts 50 ms apart.
    await waitFor(() => plays.n >= 10, 3000);
    t('a player that ignores the kick is kicked ten times', plays.n === 10, String(plays.n));
    await wait(100);
    t('and then left alone (KICKSTART_MAX_ATTEMPTS)', plays.n === 10, String(plays.n));
  }

  // ---- not webOS 25: no kick at all ------------------------------------------------
  {
    const { win, run } = boot({}, null, { timers: KICK_TIMERS });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await wait(100);
    t(
      'not webOS 25: a player left in UNSTARTED is not kicked (the fix is webOS 25 only)',
      player.calls.play === 0 && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
  }

  // ---- the setting turned on while a player is attached ----------------------------
  {
    const { win, run } = boot({ forceHighResVideo: false });
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    player.fire(1);
    await wait(30);
    t(
      'setup: off, attached, playing: nothing forced yet',
      player.listening && player.calls.range.length === 0 && player.calls.pause === 0,
      JSON.stringify(player.calls)
    );
    await showPanel(win);
    const box = panelCheckbox(win, 'Force Max Quality');
    t('setup: the Force Max Quality checkbox is off', !!box && box.checked === false);
    box.click();
    await wait(50);
    t(
      'turned on while attached: the yt-player-quality key is written at once',
      !!storedQuality(win) && storedQuality(win).inner.quality === 4320,
      win.localStorage.getItem(QUALITY_KEY)
    );
    // The video that was playing unforced is intercepted on its next state report.
    player.fire(1);
    await waitFor(() => player.calls.play === 1);
    t(
      'turned on while attached: the playing video is paused, upgraded and resumed',
      player.calls.pause === 1 && player.calls.range.length === 1 && player.calls.play === 1,
      JSON.stringify(player.calls)
    );

    // And off again: the next video is left alone.
    box.click();
    await wait(50);
    player.el.setPlaybackQuality('unknown');
    player.calls.quality.length = 0;
    player.fire(1, 'vid00000002');
    await wait(60);
    t(
      'turned off while attached: the next video is not intercepted',
      player.calls.pause === 1 && player.calls.range.length === 1,
      JSON.stringify(player.calls)
    );
    t(
      'turned off: the 4320 preference it wrote is removed, so the app chooses again',
      win.localStorage.getItem(QUALITY_KEY) === null,
      win.localStorage.getItem(QUALITY_KEY)
    );
    // On again: written again at once.
    box.click();
    await wait(50);
    t(
      'on again: the preference is written again',
      !!storedQuality(win) && storedQuality(win).inner.quality === 4320,
      win.localStorage.getItem(QUALITY_KEY)
    );
  }
  {
    // Turned on away from the watch page: the preference is written at once,
    // for the player the app creates next.
    const { win, run } = boot({ forceHighResVideo: false }, 'WEB_PAGE_TYPE_BROWSE');
    run();
    await wait(50);
    await showPanel(win);
    panelCheckbox(win, 'Force Max Quality').click();
    await wait(50);
    t(
      'turned on with no player: the yt-player-quality key is written at once',
      !!storedQuality(win) && storedQuality(win).inner.quality === 4320,
      win.localStorage.getItem(QUALITY_KEY)
    );
  }
  {
    // Off with no player attached, and a preference the app wrote itself.
    const own = JSON.stringify({
      data: JSON.stringify({ quality: 1080, previousQuality: 720 }),
      creation: 1,
      expiration: Date.now() + 1000000
    });
    const { win, run } = boot({ forceHighResVideo: true }, 'WEB_PAGE_TYPE_BROWSE', {
      storage: { [QUALITY_KEY]: JSON.parse(own) }
    });
    run();
    await wait(50);
    await showPanel(win);
    panelCheckbox(win, 'Force Max Quality').click();
    await wait(50);
    t(
      'turned off: a preference the app wrote itself is left alone',
      win.localStorage.getItem(QUALITY_KEY) === own,
      win.localStorage.getItem(QUALITY_KEY)
    );
  }

  // ---- an inline preview player is never forced ------------------------------------
  {
    const { win, run } = boot({});
    const d = win.document;
    const player = fakePlayer(d, { state: -1 });
    player.el.isInline = () => true;
    d.getElementById('ytlr-player__player-container').appendChild(player.el);
    run();
    await attached(player);
    t('inline player: attached and listening', player.listening);
    t(
      'inline player: no quality pushed through the API on UNSTARTED',
      player.calls.range.length === 0 && player.calls.quality.length === 0,
      JSON.stringify(player.calls)
    );
    player.fire(1, 'vid00000002');
    await wait(60);
    t(
      'inline player: a playing video is not paused for an upgrade',
      player.calls.pause === 0 && player.calls.range.length === 0,
      JSON.stringify(player.calls)
    );
  }

  report.finish();
})();
