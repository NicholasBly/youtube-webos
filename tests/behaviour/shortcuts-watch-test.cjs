/**
 * Remote shortcuts and the clock, against the built bundle on both flavours: burst
 * seeking batches rapid presses into one jump (a reversed press keeps the part
 * not applied yet), chapter skip reads the progress bar (markers of no width
 * are no chapters), play/pause toggles the video, shortcuts respect their page scope, the
 * clock shows and hides with YouTube's player UI (its focus attribute at once,
 * with no fade, and the player state and focus), keeps the look of
 * the theme classes, and turning Display Time off at runtime destroys the
 * clock with its timers.
 *
 * Run: node tests/behaviour/shortcuts-watch-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  tick,
  waitFor,
  KEYS,
  press: pressOn,
  toasts: toastsOf,
  videoModel,
  progressBar,
  DIGIT,
  showPanel,
  clock,
  flush,
  cycleRow
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// The digit keys the shortcuts are bound to below. The seek_15_* actions
// seek by 5 s per press (shortcuts/actions.js); the names are the stored keys.
const KEY = {
  seekFwd: DIGIT(1),
  seekBack: DIGIT(2),
  playPause: DIGIT(3),
  chapterNext: DIGIT(4),
  chapterPrev: DIGIT(5)
};

/**
 * A page with the player container, a <video> under a playback model and a
 * focusable element. The timers of 150 ms and more (the seek buffer and its
 * reset, the forced chapter UI, the hide-controls window, the clock's
 * debounce, the toasts) run at a tenth unless `timers` says otherwise; the
 * shortcut router's 100 ms key debounce keeps its length.
 */
function boot(cfg, bodyClass, timers) {
  let model;
  const page = createPage({
    timers: timers === undefined ? { scale: 10, from: 150 } : timers,
    html: `<!doctype html><html><body class="${bodyClass}"><ytlr-app>
       <div id="ytlr-player__player-container"><video></video></div>
       <div id="other" tabindex="0"></div>
     </ytlr-app></body></html>`,
    url: 'https://www.youtube.com/tv#/watch?v=vid00000001',
    config: Object.assign(
      {
        showWatch: true,
        shortcut_key_1: 'seek_15_fwd',
        shortcut_key_2: 'seek_15_back',
        shortcut_key_3: 'play_pause',
        shortcut_key_4: 'chapter_skip',
        shortcut_key_5: 'chapter_skip_prev'
      },
      cfg
    ),
    raf: 'timeout',
    captureKeys: true,
    // The playback model goes on before the bundle runs.
    setup(win) {
      model = videoModel(win, { currentTime: 10, duration: 100, paused: true });
    }
  });
  const win = page.win;
  return {
    win,
    model,
    keys: page.keys,
    press: (keyCode) => pressOn(win, keyCode, win.document.body),
    toasts: () => toastsOf(win)
  };
}

(async () => {
  // ---- burst seek -------------------------------------------------------------
  {
    const { model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    press(KEY.seekFwd);
    press(KEY.seekFwd);
    press(KEY.seekFwd);
    // Read before any timer can run: on a stalled event loop the seek's own
    // timer may already be due by the time a tick comes back.
    const before = model.currentTime;
    await tick();
    t('three quick presses: the video has not been seeked yet', before === 10, String(before));
    t(
      'the toast shows the accumulated amount',
      toasts().some((m) => m === 'Skipped +15s'),
      toasts().join(' | ')
    );
    await waitFor(() => model.currentTime === 25);
    t(
      'one seek of the total lands after the 200 ms buffer (20 here)',
      model.currentTime === 25,
      String(model.currentTime)
    );
    press(KEY.seekBack);
    await waitFor(() => model.currentTime === 20);
    t(
      'a reversed direction resets the accumulator and seeks back',
      model.currentTime === 20,
      String(model.currentTime)
    );
  }
  {
    // Two presses 1.2 s apart (here 120 ms) are two bursts, not one. The
    // burst's reset is set with its seek (20 ms here): a wait started once the
    // seek has landed is due after the reset, and Node runs timers in the
    // order they are due, however late the page handles the press.
    const { model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    press(KEY.seekFwd);
    await waitFor(() => model.currentTime === 15, 10000);
    await wait(300);
    press(KEY.seekFwd);
    await waitFor(() => model.currentTime === 20, 10000);
    t(
      'a press after the burst has ended starts a new one: the toast counts from zero',
      model.currentTime === 20 && !toasts().some((m) => m === 'Skipped +10s'),
      model.currentTime + ' / ' + toasts().join(' | ')
    );
  }
  {
    // Forward, then back before the forward one is applied: they cancel out.
    const { model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    model.currentTime = 50;
    press(KEY.seekFwd);
    press(KEY.seekBack);
    await wait(80);
    t(
      'a reversed burst keeps the part not yet applied: +5 then -5 leaves the video where it was',
      model.currentTime === 50,
      String(model.currentTime)
    );
    t(
      'the toast counts the new direction from zero',
      toasts().some((m) => m === 'Skipped -5s'),
      toasts().join(' | ')
    );
  }
  {
    // The seek key held: the remote's repeats are presses of the burst.
    const { win, model } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    const held = (repeat) => {
      const e = new win.KeyboardEvent('keydown', {
        keyCode: KEY.seekFwd,
        repeat,
        bubbles: true,
        cancelable: true
      });
      win.document.body.dispatchEvent(e);
      return e;
    };
    held(false);
    const r1 = held(true);
    held(true);
    await waitFor(() => model.currentTime === 25, 10000);
    t(
      'a held seek key: the repeats join the burst, one seek of the total',
      model.currentTime === 25 && r1.defaultPrevented,
      String(model.currentTime)
    );
  }

  {
    // A stalled event loop can run the burst's reset (1.2 s) before its seek
    // (200 ms): Node runs the timers of one length together, whatever is due
    // in another. Here the reset is shortened to 1.2 ms and the seek keeps its
    // 200 ms; the part not applied yet must still land.
    const { model, press } = boot({}, 'WEB_PAGE_TYPE_WATCH', { scale: 1000, from: 1000 });
    press(KEY.seekFwd);
    await waitFor(() => model.currentTime === 15, 5000);
    t(
      'a burst whose reset runs before its seek still seeks',
      model.currentTime === 15,
      String(model.currentTime)
    );
  }

  // ---- chapters: a second press while the first waits for the forced UI ----------
  {
    // Real timers: the second press must come after the 100 ms key debounce
    // and inside the 500 ms wait for the forced UI.
    const { press, toasts, keys } = boot({}, 'WEB_PAGE_TYPE_WATCH', null);
    press(KEY.chapterNext);
    await wait(150); // past the repeated-key debounce, inside the 500 ms wait
    press(KEY.chapterNext);
    await wait(650);
    t(
      'without chapters the second press is ignored, not answered with a second toast',
      toasts().filter((m) => m === 'Loading chapters...').length === 1 &&
        toasts().filter((m) => m === 'No chapters found').length === 1,
      toasts().join(' | ')
    );
    // The player UI was forced open for the markers: a Back closes it 250 ms later.
    await waitFor(() => keys.includes(KEYS.BACK));
    t(
      'the forced player UI is dismissed with a Back once the lookup is over',
      keys.filter((k) => k === KEYS.BACK).length === 1,
      keys.join(',')
    );
  }

  // ---- chapters: a bar that holds only the playhead and the buffer ----
  {
    const { win, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    const track = progressBar(win, []).firstChild;
    for (const key of ['playhead', 'buffer']) {
      const el = win.document.createElement('div');
      el.setAttribute('idomkey', key);
      track.appendChild(el);
    }
    press(KEY.chapterNext);
    await waitFor(() => toasts().some((m) => m === 'No chapters found'));
    t(
      'a bar without chapter markers: the player UI is tried, then "No chapters found"',
      toasts().some((m) => m === 'Loading chapters...') &&
        toasts().some((m) => m === 'No chapters found'),
      toasts().join(' | ')
    );
  }

  // ---- chapters: markers without a width ----
  {
    const { win, model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    progressBar(win, [0, 0]);
    press(KEY.chapterNext);
    await waitFor(() => toasts().some((m) => m === 'No chapters found'));
    t(
      'chapter markers of no width: "No chapters found", the video left alone',
      toasts().some((m) => m === 'No chapters found') && model.currentTime === 10,
      toasts().join(' | ')
    );
  }

  // ---- chapters ---------------------------------------------------------------
  {
    const { win, model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    progressBar(win, [30, 30, 40]);

    press(KEY.chapterNext);
    await wait(50);
    t(
      'chapter skip jumps to the next chapter start',
      model.currentTime === 30,
      String(model.currentTime)
    );
    t(
      'chapter skip announces itself',
      toasts().some((m) => m === 'Next Chapter'),
      toasts().join(' | ')
    );
    model.currentTime = 32;
    press(KEY.chapterPrev);
    await wait(150);
    t(
      'chapter back within 3 s of a start goes to the previous chapter',
      model.currentTime === 0 && toasts().some((m) => m === 'Previous Chapter'),
      String(model.currentTime)
    );
    model.currentTime = 35;
    press(KEY.chapterPrev);
    await wait(150);
    t(
      'chapter back more than 3 s in restarts the current chapter',
      model.currentTime === 30,
      String(model.currentTime)
    );
    model.currentTime = 80;
    press(KEY.chapterNext);
    await wait(150);
    t(
      'no next chapter: time unchanged, toast says so',
      model.currentTime === 80 && toasts().some((m) => m === 'No next chapter'),
      toasts().join(' | ')
    );
  }

  // ---- play / pause ------------------------------------------------------------
  {
    const { win, model, press, toasts } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    // A player shadow with no class of its own, as the older layout draws it.
    const shadow = win.document.createElement('div');
    shadow.setAttribute('idomkey', 'shadow');
    win.document.querySelector('ytlr-app').appendChild(shadow);
    const styleText = Array.from(win.document.querySelectorAll('style'))
      .map((st) => st.textContent)
      .join('');
    t(
      "no hide rule ends in the shadow's attribute (a toggle would restyle every element with one)",
      !/ytaf-hide-controls[^{,]*\[idomkey/.test(styleText)
    );
    // What the pause does to the page, recorded as it happens: the hide
    // window (75 ms here) can be over before a check after a fixed wait.
    const seen = { hidden: false, shadowHidden: false };
    new win.MutationObserver(() => {
      if (win.document.body.classList.contains('ytaf-hide-controls')) seen.hidden = true;
      if (shadow.style.opacity === '0') seen.shadowHidden = true;
    }).observe(win.document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      subtree: true
    });
    press(KEY.playPause);
    await waitFor(() => model.plays === 1 && toasts().some((m) => m === 'Playing'), 10000);
    t(
      'paused video: play() and a "Playing" toast',
      model.plays === 1 && !model.paused && toasts().some((m) => m === 'Playing'),
      JSON.stringify(model) + ' ' + toasts().join(' | ')
    );
    await wait(150); // past the 100 ms debounce of a repeated key
    press(KEY.playPause);
    await waitFor(() => model.pauses === 1 && toasts().some((m) => m === 'Paused'), 10000);
    t(
      'playing video: pause() and a "Paused" toast',
      model.pauses === 1 && model.paused && toasts().some((m) => m === 'Paused'),
      JSON.stringify(model)
    );
    t('while pausing, the controls are hidden through the body class', seen.hidden);
    t('and the shadow without a class through its own style', seen.shadowHidden);
    await waitFor(() => !win.document.body.classList.contains('ytaf-hide-controls'), 10000);
    t(
      'the hide class is lifted again (750 ms, 75 here)',
      !win.document.body.classList.contains('ytaf-hide-controls')
    );
    t('and the shadow gets its style back', shadow.style.opacity === '', shadow.style.cssText);
  }

  // ---- play / pause on Shorts: the hide class is lifted there too ----------------
  {
    const { win, model, press } = boot({}, 'WEB_PAGE_TYPE_SHORTS');
    model.paused = false;
    press(KEY.playPause);
    await wait(50);
    t('setup: Shorts, playing video paused', model.pauses === 1 && model.paused);
    await wait(150);
    t(
      'on Shorts the hide class is lifted again too, not left on the body for the session',
      !win.document.body.classList.contains('ytaf-hide-controls')
    );
  }

  // ---- scope: video shortcuts do nothing off the watch page ---------------------
  {
    const { model, press } = boot({}, 'WEB_PAGE_TYPE_BROWSE');
    press(KEY.seekFwd);
    press(KEY.playPause);
    await wait(60);
    t(
      'on a browse page the player shortcuts are ignored',
      model.currentTime === 10 && model.plays === 0,
      JSON.stringify(model)
    );
  }
  {
    // A global action runs anywhere, and without a video.
    const { win, press } = boot({ shortcut_key_6: 'oled_toggle' }, 'WEB_PAGE_TYPE_BROWSE');
    press(DIGIT(6));
    t(
      'on a browse page a global shortcut runs (the OLED overlay goes up)',
      !!win.document.getElementById('ytaf-oled-overlay')
    );
  }

  // ---- the clock -----------------------------------------------------------------
  {
    const { win } = boot({}, 'WEB_PAGE_TYPE_BROWSE');
    const d = win.document;
    const clock = d.querySelector('.ytaf-watch');
    const hidden = () => clock.classList.contains('ytaf-watch-hidden');
    t(
      'showWatch: the clock element exists and shows the time',
      !!clock && /\d/.test(clock.textContent),
      clock && clock.textContent
    );
    t('on a browse page (no player) the clock is visible', !hidden());

    // The player is mounted and the page becomes the watch page.
    const player = d.createElement('ytlr-watch-default');
    d.body.appendChild(player);
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    d.getElementById('other').focus();
    await wait(60); // the 200 ms debounce after focusin, 20 here
    t('player mounted, focus elsewhere: clock stays visible', !hidden());
    player.setAttribute('hybridnavfocusable', 'true');
    win.dispatchEvent(
      new win.CustomEvent('yt-player-state-change', { detail: { state: 1, videoId: 'x' } })
    );
    await waitFor(() => hidden());
    t('player focused for navigation: clock hides on the state event', hidden());
    player.removeAttribute('hybridnavfocusable');
    d.getElementById('other').focus();
    d.getElementById('other').blur();
    d.getElementById('other').focus();
    await waitFor(() => !hidden());
    t('focus back on another element: clock shows again', !hidden());
  }

  // ---- the clock follows YouTube's own switch at once, with no fade ------------------
  {
    const { win } = boot({}, 'WEB_PAGE_TYPE_WATCH');
    const d = win.document;
    const player = d.createElement('ytlr-watch-default');
    // The controls fade as YouTube fades them; the clock does not copy it.
    player.innerHTML =
      '<div class="fader" style="transition-property: transform, opacity; transition-duration: 0.5s, 0.35s; ' +
      'transition-timing-function: ease, cubic-bezier(0.4, 0, 0.2, 1)">' +
      '<yt-focus-container idomkey="controls"><div id="ctl" tabindex="0"></div></yt-focus-container></div>';
    d.querySelector('ytlr-app').appendChild(player);
    d.getElementById('ctl').focus();
    await wait(60);
    const clock = d.querySelector('.ytaf-watch');
    const hidden = () => clock.classList.contains('ytaf-watch-hidden');
    t('watch page, focus on the controls: the clock is visible', !hidden());
    // YouTube hides its UI: only the attribute changes, no event, no focus move.
    player.setAttribute('hybridnavfocusable', 'true');
    await flush();
    t('the attribute alone hides the clock, in the same turn (no debounce)', hidden());
    t(
      "the clock does not take the controls' fade: it shows and hides at once",
      clock.style.transition === '' &&
        win
          .getComputedStyle(clock)
          .transitionDuration.split(',')
          .every((d) => parseFloat(d) === 0 || d.trim() === ''),
      clock.style.transition + ' / ' + win.getComputedStyle(clock).transitionDuration
    );
    player.setAttribute('hybridnavfocusable', 'false');
    await flush();
    t('YouTube shows its UI again: the clock is back at once', !hidden());
    // A side panel over the player keeps the clock away whatever the attribute says.
    const panel = d.createElement('div');
    panel.className = 'AmQJbe';
    d.body.appendChild(panel);
    player.setAttribute('hybridnavfocusable', 'true');
    await flush();
    player.setAttribute('hybridnavfocusable', 'false');
    await flush();
    t('with a side panel open the clock stays hidden', hidden());
    panel.remove();
    // A new player (the watch page re-rendered) is observed in its place.
    player.remove();
    const next = d.createElement('ytlr-watch-default');
    d.querySelector('ytlr-app').appendChild(next);
    // No page event: YouTube re-rendered the player on the same page; the next
    // focus check finds the old one gone and looks again.
    d.getElementById('ctl') && d.getElementById('ctl').blur();
    d.getElementById('other').focus();
    await waitFor(() => !hidden());
    next.setAttribute('hybridnavfocusable', 'true');
    await flush();
    t('a re-mounted player is watched too', hidden());
    t(
      'a re-mounted player sets no fade on the clock either',
      clock.style.transition === '',
      clock.style.transition
    );
  }

  // ---- a language tag Intl refuses still gives a clock ------------------------------
  {
    const page = createPage({
      html: '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
      config: { showWatch: true },
      setup(w) {
        Object.defineProperty(w.navigator, 'language', { get: () => 'en-US@posix' });
      }
    });
    const clockEl = page.win.document.querySelector('.ytaf-watch');
    t(
      'navigator.language "en-US@posix": the clock falls back to the default locale',
      !!clockEl && /\d/.test(clockEl.textContent),
      clockEl && clockEl.textContent
    );
  }

  // ---- the clock's look follows the theme classes --------------------------------
  {
    const { win } = boot({}, 'WEB_PAGE_TYPE_BROWSE');
    const d = win.document;
    // The stylesheet goes in once the bundle has run.
    await wait(50);
    const clock = d.querySelector('.ytaf-watch');
    const bg = () => win.getComputedStyle(clock).backgroundColor;
    const plain = bg();
    d.documentElement.classList.add('ytaf-oled');
    const oled = bg();
    d.documentElement.classList.add('ytaf-remove-borders');
    // Off the watch page the clock keeps its plain look under Liquid Glass.
    const browseGlass = bg();
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    const glass = win.getComputedStyle(clock);
    t(
      'default, OLED and Liquid Glass each have their own backdrop',
      plain === 'rgba(15, 15, 15, 0.3)' && oled === 'rgb(0, 0, 0)',
      plain + ' / ' + oled
    );
    t(
      'Liquid Glass off the watch page: no glass (here the OLED black it was)',
      browseGlass === 'rgb(0, 0, 0)',
      browseGlass
    );
    t(
      'Liquid Glass on the watch page wins over OLED, with the glass gradient and shadow of the chips',
      glass.backgroundColor === 'rgba(45, 45, 45, 0.45)' &&
        /linear-gradient/.test(glass.backgroundImage) &&
        /1px 4px/.test(glass.boxShadow),
      glass.backgroundColor + ' | ' + glass.backgroundImage + ' | ' + glass.boxShadow
    );
  }
  {
    const { win } = boot({ showWatch: false }, 'WEB_PAGE_TYPE_BROWSE');
    t('showWatch off: no clock element', !win.document.querySelector('.ytaf-watch'));
  }
  {
    const { win } = boot({ showWatch: 'off' }, 'WEB_PAGE_TYPE_BROWSE');
    t("Display Time in UI 'off': no clock element", !win.document.querySelector('.ytaf-watch'));
  }

  // ---- Date + Time, in the TV's language and date order ------------------------------
  {
    /** The clock's text on a page whose language is `lang`, showing `mode`. */
    const clockIn = (lang, mode) => {
      const page = createPage({
        html: '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
        config: { showWatch: mode },
        setup(w) {
          Object.defineProperty(w.navigator, 'language', { get: () => lang });
          // 27 October, 00:49 local time.
          const fixed = new Date(2026, 9, 27, 0, 49).getTime();
          const RealDate = w.Date;
          w.Date = class extends RealDate {
            constructor(...args) {
              super(...(args.length ? args : [fixed]));
            }
            static now() {
              return fixed;
            }
          };
        }
      });
      const el = page.win.document.querySelector('.ytaf-watch');
      return { page, text: el && el.textContent };
    };
    const us = clockIn('en-US', 'datetime').text;
    t('Date + Time in American English: "10/27 12:49 AM"', us === '10/27 12:49 AM', us);
    const gb = clockIn('en-GB', 'datetime').text;
    t(
      'Date + Time in British English: day first, 24-hour: "27/10 00:49"',
      gb === '27/10 00:49',
      gb
    );
    const de = clockIn('de-DE', 'datetime').text;
    t('Date + Time in German: "27.10. 00:49"', de === '27.10. 00:49', de);
    const time = clockIn('en-US', 'time').text;
    t('Time alone: "12:49 AM"', time === '12:49 AM', time);

    // Switching in the panel rebuilds the clock with the date.
    const { page } = clockIn('en-US', 'time');
    const w = page.win;
    pressOn(w, KEYS.GREEN, w.document.body);
    for (let i = 0; i < 20; i++) page.pump();
    const row = cycleRow(w, 'Display Time in UI', '#ytaf-page-main');
    row.focus();
    pressOn(w, KEYS.RIGHT, row);
    t(
      'setup: the row now reads Date + Time',
      /Date \+ Time/.test(row.textContent),
      row.textContent
    );
    const clocks = w.document.querySelectorAll('.ytaf-watch');
    t(
      'switched to Date + Time in the panel: one clock, now with the date',
      clocks.length === 1 && clocks[0].textContent === '10/27 12:49 AM',
      clocks.length + ' ' + (clocks[0] && clocks[0].textContent)
    );
    pressOn(w, KEYS.RIGHT, row);
    t(
      'and Off removes it',
      /Off/.test(row.textContent) && !w.document.querySelector('.ytaf-watch'),
      row.textContent
    );
  }

  // ---- the clock keeps to the minute, and is right again on return ----
  {
    let fixedIntervals = 0;
    // Every delay of a second or more asked for, unscaled.
    const delays = [];
    const page = createPage({
      html: '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
      config: { showWatch: true },
      // The wait to the next minute at a thousandth: under 60 ms.
      timers: { scale: 1000, from: 1000 },
      setup(w) {
        // The page's clock stands 5 s before a minute.
        const c = clock(w);
        c.offset = 60000 - (w.Date.now() % 60000) - 5000;
        const realInterval = w.setInterval;
        w.setInterval = function (fn, ms) {
          if (ms === 60000) fixedIntervals++;
          return realInterval.apply(this, arguments);
        };
        const realTimeout = w.setTimeout;
        w.setTimeout = function (fn, ms) {
          if (ms >= 1000) delays.push(ms);
          return realTimeout.apply(this, arguments);
        };
      }
    });
    const d = page.win.document;
    const watch = d.querySelector('.ytaf-watch');
    await wait(150);
    t(
      'each tick is aimed at the next minute, not a fixed 60 s interval a late tick would shift',
      fixedIntervals === 0 && delays.some((ms) => ms > 4800 && ms <= 5000),
      'intervals ' + fixedIntervals + ', delays ' + delays.join(',')
    );
    // Back from the background, before the next tick: the time is set at once.
    watch.textContent = 'stale';
    page.win.document.dispatchEvent(new page.win.Event('visibilitychange'));
    t('visible again: the time is set at once', /\d/.test(watch.textContent), watch.textContent);
  }

  // ---- the clock on a browse page: focus traffic costs no query -------------------
  {
    const { win } = boot({}, 'WEB_PAGE_TYPE_BROWSE');
    const d = win.document;
    // Queries for the player element (other modules poll for their own).
    const queries = { n: 0 };
    const realQs = d.querySelector.bind(d);
    d.querySelector = (sel) => {
      if (sel === 'ytlr-watch-default') queries.n++;
      return realQs(sel);
    };
    const pages = { n: 0 };
    win.addEventListener('ytaf-page-update', () => pages.n++);
    const other = d.getElementById('other');
    for (let i = 0; i < 5; i++) {
      other.blur();
      other.focus();
    }
    // Body classes flip for focus and animation state without the page changing.
    d.body.classList.add('focused-row');
    d.body.classList.remove('focused-row');
    await wait(60);
    t(
      'off the watch page a burst of focus changes runs no document query for the player',
      queries.n === 0,
      String(queries.n)
    );
    t('a body class flip that keeps the page class publishes no page update', pages.n === 0);
    d.body.className = 'WEB_PAGE_TYPE_WATCH';
    await waitFor(() => queries.n > 0);
    t(
      'the page class changing publishes one page update, and the clock looks for the player',
      pages.n === 1 && queries.n > 0,
      `${pages.n} updates, ${queries.n} queries`
    );
  }

  // ---- the clock destroyed when Display Time is turned off at runtime ------------
  {
    // Every time the clock formats the time: once at start and once per tick.
    const formats = { n: 0 };
    const page = createPage({
      html: `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>
         <div id="other" tabindex="0"></div></ytlr-app></body></html>`,
      config: { showWatch: true },
      raf: 'timeout',
      // The page's clock stands 50 ms before a minute; the minutes after it run
      // at a thousandth (60 ms).
      timers: { scale: 1000, from: 1000 },
      setup(win) {
        const c = clock(win);
        c.offset = 60000 - (win.Date.now() % 60000) - 50;
        const RealIntl = win.Intl;
        win.Intl = Object.create(RealIntl, {
          DateTimeFormat: {
            value: function (...args) {
              const real = new RealIntl.DateTimeFormat(...args);
              return {
                format: (date) => {
                  formats.n++;
                  return real.format(date);
                }
              };
            }
          }
        });
      }
    });
    const win = page.win;
    const d = win.document;
    await waitFor(() => formats.n >= 3);
    t(
      'setup: the clock is on the page and ticks on the minute',
      !!d.querySelector('.ytaf-watch') && formats.n >= 3,
      String(formats.n)
    );
    await showPanel(win);
    const row = cycleRow(win, 'Display Time in UI', '#ytaf-page-main');
    t(
      'setup: the Display Time in UI row reads Time',
      !!row && row.querySelector('.ytaf-value').textContent === 'Time'
    );
    row.focus();
    pressOn(win, KEYS.LEFT, row);
    await wait(20);
    t('turned off at runtime: the clock element is removed', !d.querySelector('.ytaf-watch'));
    const ticksAtDestroy = formats.n;
    d.getElementById('other').focus();
    await wait(150);
    t(
      'no further ticks after the clock is destroyed',
      formats.n === ticksAtDestroy,
      `${formats.n - ticksAtDestroy} more`
    );
    t(
      'a focus change after the destroy does not bring the clock back',
      !d.querySelector('.ytaf-watch')
    );
    pressOn(win, KEYS.RIGHT, row);
    await wait(20);
    const again = d.querySelector('.ytaf-watch');
    t(
      'turned on again: a fresh clock element shows the time',
      !!again && /\d/.test(again.textContent),
      again && again.textContent
    );
  }

  report.finish();
})();
