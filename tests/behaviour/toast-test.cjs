/**
 * The toasts (ui/toast) as only the bundle shows them: a shortcut's toast
 * fading in, the play/pause toast updated in place, the SponsorBlock
 * manual-skip prompt (time 0) staying up until the handler takes it down, and
 * Disable Notifications read from the real config. The timers, the dedupe
 * and the fade are the module's own: tests/unit/toast-test.cjs.
 *
 * The 3 s toast timer and the 1 s fade are shortened by the timer scale; the
 * 100 ms shortcut debounce keeps its length.
 *
 * Run: node tests/behaviour/toast-test.cjs [bundle]
 */
const { createPage } = require('../harness/page.cjs');
const { VIDEO } = require('../harness/sponsorblock-data.cjs');
const { seg, sponsorBlockPage } = require('../harness/sponsorblock.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  KEYS,
  press: pressOn,
  toasts: toastsOf,
  videoModel,
  DIGIT
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// Timers of 1 s and more at a twentieth: the toast lives 150 ms.
const SCALE = 20;
const TOAST_MS = 3000 / SCALE;

/**
 * A watch page with a paused video and no SponsorBlock handler: Blue, the
 * default sb_manual_skip binding, shows 'SponsorBlock not loaded' on every
 * press; key 3 is play/pause. The bundle's own welcome toast ('Press [GREEN]
 * to open the settings', 2 s after load) shows up in every page, so the
 * checks look at a toast by its text. `scale` divides the timers of 1 s and
 * more, SCALE unless given.
 */
function boot(cfg, scale) {
  let model;
  const page = createPage({
    html: `<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
       <div id="ytlr-player__player-container"><video></video></div>
       <ytlr-multi-markers-player-bar-renderer><div idomkey="progress-bar"></div></ytlr-multi-markers-player-bar-renderer>
     </ytlr-app></body></html>`,
    url: 'https://www.youtube.com/tv#/watch?v=' + VIDEO,
    config: Object.assign({ enableSponsorBlock: false, shortcut_key_3: 'play_pause' }, cfg),
    timers: { scale: scale || SCALE, from: 1000 },
    setup(win) {
      model = videoModel(win, { currentTime: 0, duration: 300, paused: true });
    }
  });
  const win = page.win;
  const d = win.document;
  return {
    win,
    d,
    model,
    press: (code) => pressOn(win, code, d.body),
    toasts: () => toastsOf(win),
    /** The toast elements reading `text`. */
    elements: (text) =>
      Array.from(d.querySelectorAll('.ytaf-toasts .ytaf-toast')).filter(
        (el) => el.textContent === text
      ),
    /** The toast is on screen once its fade-in has run: two animation frames. */
    settle: () => {
      page.pump();
      page.pump();
    }
  };
}

const hidden = (el) => el.classList.contains('ytaf-toast-hidden');
const NOT_LOADED = 'SponsorBlock not loaded';

(async () => {
  // ---- a shortcut's toast fades in ------------------------------------------------------
  {
    const { press, toasts, elements, settle } = boot();
    press(KEYS.BLUE);
    t(
      'a shortcut toast is created hidden, for the fade-in',
      elements(NOT_LOADED).length === 1 && hidden(elements(NOT_LOADED)[0]),
      toasts().join(' | ')
    );
    await settle();
    t('two frames later it is shown', !hidden(elements(NOT_LOADED)[0]));
  }

  // ---- update(): the play/pause toast changes its text in place ------------------------
  {
    // A fifth: the toast lives 600 ms, well past the 100 ms debounce before
    // the second press.
    const { press, toasts, elements, settle, model } = boot({}, 5);
    press(DIGIT(3));
    await settle();
    t(
      'play/pause: a "Playing" toast',
      model.plays === 1 && elements('Playing').length === 1,
      toasts().join(' | ')
    );
    await wait(150); // past the shortcut debounce
    press(DIGIT(3));
    t(
      'the second press updates the same toast to "Paused"',
      model.pauses === 1 && elements('Paused').length === 1 && elements('Playing').length === 0,
      toasts().join(' | ')
    );
    t('the updated toast stays shown', !hidden(elements('Paused')[0]));
  }

  // ---- time 0: the manual-skip prompt stays up ---------------------------------------
  {
    const PROMPT = 'Sponsored: Press Blue to skip';
    // The SponsorBlock page, its timers at the scale of the toasts here.
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], { sbMode_sponsor: 'manual_skip' }, 10, {
      timers: { scale: SCALE, from: 500 }
    });
    await p.ready();
    const prompts = () =>
      Array.from(p.win.document.querySelectorAll('.ytaf-toasts .ytaf-toast')).filter(
        (el) => el.textContent === PROMPT
      );
    p.timeupdate(21);
    await waitFor(() => prompts().length === 1 && !hidden(prompts()[0]));
    t(
      'entering a manual-skip segment shows the prompt',
      prompts().length === 1,
      p.toasts().join(' | ')
    );
    await wait(TOAST_MS * 2);
    t(
      'the prompt has no timer: still shown well past the usual toast time',
      prompts().length === 1 && !hidden(prompts()[0]),
      prompts().length ? prompts()[0].className : 'gone'
    );
    // Blue skips the segment: the handler removes the prompt through its handle.
    p.press(KEYS.BLUE);
    await waitFor(
      () =>
        p.model.currentTime === 30 &&
        prompts().every(hidden) &&
        p.toasts().indexOf('Skipped Segment') !== -1
    );
    t(
      'the manual skip takes the prompt down and announces the skip',
      p.model.currentTime === 30 &&
        prompts().every(hidden) &&
        p.toasts().filter((m) => m === 'Skipped Segment').length === 1,
      `time ${p.model.currentTime}: ${p.toasts().join(' | ')}`
    );
  }

  // ---- Disable Notifications ---------------------------------------------------------
  {
    const { d, press, model } = boot({ disableNotifications: true });
    press(KEYS.BLUE);
    await wait(150);
    press(DIGIT(3));
    await wait(50);
    t('setup: the shortcuts ran', model.plays === 1);
    t(
      'with notifications disabled no toast and no container are created',
      !d.querySelector('.ytaf-toasts') && !d.querySelector('.ytaf-toast')
    );
  }

  report.finish();
})();
