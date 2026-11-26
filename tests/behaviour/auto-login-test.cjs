/**
 * Auto Login against the built bundle, on both flavours: the three localStorage tricks
 * (the account selector's recurring-action date, the Premium upsell records,
 * the inline-playback preference), the active bypass when the account
 * selector shows up anyway (its start-up window on the monotonic clock, not
 * the wall clock the TV may set meanwhile), and the settings changed at runtime through the
 * options panel: Bypass Nag Screens off restores both stores, Force Previews
 * writes the inline-playback key at once.
 *
 * Run: node tests/behaviour/auto-login-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  panelCheckbox,
  cycleRow,
  showPanel,
  clock
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const DAY = 24 * 60 * 60 * 1000;
const RECURRING = 'yt.leanback.default::recurring_actions';
const PROMO_TS = 'yt.leanback.default::promo-coupon-shown-timestamp';
const PROMO_TIMES = 'yt.leanback.default::promo-coupon-shown-times';
const PROFILE_TIMES = 'yt.leanback.profile7::promo-coupon-shown-times';
const INLINE = 'yt.leanback.default::inline-playback-enabled';

/** The feature starts on DOMContentLoaded, which jsdom fires after a tick: boot() resolves then. */
async function boot(cfg, storage, bodyClass, more) {
  const page = createPage({
    allowErrors: more && more.allowErrors,
    url: more && more.url,
    setup: more && more.setup,
    html: `<!doctype html><html><body class="${bodyClass || 'WEB_PAGE_TYPE_BROWSE'}"><ytlr-app></ytlr-app></body></html>`,
    config: Object.assign({ enableAutoLogin: true, forcePreviews: 'disabled' }, cfg),
    storage,
    raf: 'timeout',
    captureKeys: true,
    // The settle before the bypass press (500 ms), the preview write (2.5 s)
    // and the bypass cleanup (2 s) run at a tenth: 50, 250 and 200 ms. The
    // 250 ms between DOWN and ENTER in guest mode is under the threshold and
    // stays.
    timers: { scale: 10, from: 500 }
  });
  await wait(20);
  return { win: page.win, keys: page.keys };
}

/** The page's Date.now() moved by `offset` ms, the monotonic clock left alone. */
function shiftWallClock(win) {
  const c = { offset: 0 };
  const realNow = win.Date.now;
  win.Date.now = () => realNow() + c.offset;
  return c;
}

/** Whether a stylesheet in the page hides the account selector (only while bypassing). */
const hidingSelector = (win) =>
  Array.from(win.document.querySelectorAll('style')).some(
    (st) => st.textContent.indexOf('account-selector') !== -1
  );

const read = (win, key) => {
  const raw = win.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
};

(async () => {
  // ---- the three localStorage tricks ----------------------------------------
  {
    const before = Date.now();
    const { win } = await boot(
      { forcePreviews: 'force_on' },
      {
        [RECURRING]: {
          data: {
            data: {
              'startup-screen-account-selector-with-guest': { lastFired: 1000 },
              whos_watching_fullscreen_zero_accounts: { lastFired: 1000 },
              'some-other-action': { lastFired: 1000 }
            }
          }
        },
        [PROMO_TS]: { data: 0, creation: 5, expiration: 6 },
        [PROFILE_TIMES]: { data: 2 }
      }
    );

    const actions = read(win, RECURRING).data.data;
    const pushed = actions['startup-screen-account-selector-with-guest'].lastFired;
    t(
      '"Who\'s watching" actions are dated about 7 days ahead',
      pushed > before + 6.9 * DAY && pushed < before + 7.1 * DAY + 1000,
      String(pushed - before)
    );
    t(
      'both selector actions moved together',
      actions['whos_watching_fullscreen_zero_accounts'].lastFired === pushed
    );
    t(
      'an unrelated recurring action is left alone',
      actions['some-other-action'].lastFired === 1000
    );

    const ts = read(win, PROMO_TS);
    t(
      'promo timestamp dated about a year ahead, envelope kept',
      ts.data > before + 364 * DAY && ts.creation === 5,
      JSON.stringify(ts)
    );
    t(
      'promo envelope expiry refreshed (about 360 days)',
      ts.expiration > before + 359 * DAY && ts.expiration < before + 361 * DAY,
      String(ts.expiration - before)
    );
    t(
      'promo shown-times seeded in the default namespace',
      read(win, PROMO_TIMES) && read(win, PROMO_TIMES).data === 99,
      JSON.stringify(read(win, PROMO_TIMES))
    );
    t(
      'a profile-namespaced promo record is matched on its suffix',
      read(win, PROFILE_TIMES).data === 99,
      JSON.stringify(read(win, PROFILE_TIMES))
    );

    t(
      'inline playback is not written before the 2.5 s delay',
      win.localStorage.getItem(INLINE) === null
    );
    await waitFor(() => read(win, INLINE) && read(win, INLINE).data === true);
    t(
      'force_on writes inline-playback-enabled true after the delay',
      read(win, INLINE) && read(win, INLINE).data === true,
      win.localStorage.getItem(INLINE)
    );
  }

  // ---- previews disabled: nothing written --------------------------------------
  {
    const { win } = await boot({ forcePreviews: 'disabled' }, {});
    // Past the 2.5 s delay (250 ms here).
    await wait(300);
    t(
      'forcePreviews disabled leaves the inline-playback key alone',
      win.localStorage.getItem(INLINE) === null
    );
  }

  // ---- setting off: the stores are not touched --------------------------------
  {
    const { win } = await boot(
      { enableAutoLogin: false },
      {
        [RECURRING]: {
          data: { data: { 'startup-screen-account-selector-with-guest': { lastFired: 1000 } } }
        }
      }
    );
    t(
      'Auto Login off: recurring action untouched',
      read(win, RECURRING).data.data['startup-screen-account-selector-with-guest'].lastFired ===
        1000
    );
    t('Auto Login off: no promo records seeded', win.localStorage.getItem(PROMO_TIMES) === null);
  }

  // ---- setting off: a relaunch on the account selector presses nothing ----------
  {
    // The relaunch path reloads the app, which jsdom cannot do: that error is expected.
    const { win, keys } = await boot(
      { enableAutoLogin: false },
      {},
      'WEB_PAGE_TYPE_ACCOUNT_SELECTOR',
      {
        allowErrors: /navigation to another Document/
      }
    );
    win.document.dispatchEvent(new win.CustomEvent('webOSRelaunch', { detail: {} }));
    await wait(200);
    t(
      'Auto Login off: the relaunch path sends no key and adds no bypass class',
      keys.length === 0 && !hidingSelector(win),
      keys.join(',')
    );
  }

  // ---- active bypass of the account selector ---------------------------------
  {
    const { win, keys } = await boot({}, {});
    t(
      'no rule for the account selector in the page outside a bypass (none tried on every element)',
      !hidingSelector(win)
    );
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await wait(10);
    t('selector detected: the selector is hidden while it is bypassed', hidingSelector(win));
    t('no key sent before the settle (500 ms, 50 here)', keys.length === 0, keys.join(','));
    await waitFor(() => keys.length >= 1);
    t('signed-in: a single ENTER selects the account', keys.join(',') === '13', keys.join(','));
    await waitFor(() => !hidingSelector(win));
    t('the hiding rule goes about 2 s after the press', !hidingSelector(win));

    // A second appearance in the same session is not bypassed again.
    win.document.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(20);
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await wait(200);
    t('the selector is bypassed once per session', keys.join(',') === '13', keys.join(','));
  }

  // ---- the start-up window, measured in time; a relaunch opens it again ----
  {
    let c;
    // Launched with the parameters a relaunch would rebuild: the relaunch
    // changes only the hash, as on the TV.
    const { win, keys } = await boot({}, {}, null, {
      url: 'https://www.youtube.com/tv?env_forceFullAnimation=1&env_enableWebSpeech=1&env_enableVoice=1#/browse',
      setup: (w) => {
        c = clock(w);
      }
    });
    const body = win.document.body;
    const relaunch = () =>
      win.document.dispatchEvent(new win.CustomEvent('webOSRelaunch', { detail: {} }));
    c.offset += 16000;
    body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await wait(150);
    t(
      'after the 15 s start-up window the selector is left alone',
      keys.length === 0,
      keys.join(',')
    );
    body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(20);

    relaunch();
    await wait(20);
    body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await waitFor(() => keys.length >= 1);
    t(
      'a relaunch from the launcher opens the window again',
      keys.join(',') === '13',
      keys.join(',')
    );
    await waitFor(() => !hidingSelector(win));
    body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(20);

    relaunch();
    await wait(20);
    c.offset += 16000;
    body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await wait(150);
    t(
      'and the window closes again: the account switcher opened later is the user’s',
      keys.join(',') === '13',
      keys.join(',')
    );
  }

  // ---- launched with parameters straight onto the account selector ----
  {
    const { keys } = await boot({}, {}, 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR', {
      setup: (w) => {
        w.launchParams = JSON.stringify({ contentTarget: 'v=dQw4w9WgXcQ' });
      }
    });
    await waitFor(() => keys.length >= 1);
    t(
      'launched with parameters onto the selector: bypassed at once',
      keys.join(',') === '13',
      keys.join(',')
    );
  }

  // ---- the start-up window does not follow the wall clock ----
  {
    // The TV sets its clock right after the start (here an hour back) and 16 s
    // pass: the selector opened then is the user's.
    let wall;
    let mono;
    const { win, keys } = await boot({}, {}, null, {
      setup: (w) => {
        wall = shiftWallClock(w);
        mono = clock(w);
      }
    });
    wall.offset -= 3600000;
    mono.offset += 16000;
    // clock() moved the wall clock too: this undoes it, leaving it an hour back.
    wall.offset -= 16000;
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await wait(150);
    t(
      'the wall clock set back an hour does not keep the start-up window open',
      keys.length === 0,
      keys.join(',')
    );
  }
  {
    // The clock jumps a minute ahead right after the start: the selector that
    // shows at once is still bypassed.
    let wall;
    const { win, keys } = await boot({}, {}, null, {
      setup: (w) => {
        wall = shiftWallClock(w);
      }
    });
    wall.offset += 60000;
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await waitFor(() => keys.length >= 1);
    t(
      'the wall clock a minute ahead does not close the start-up window',
      keys.join(',') === '13',
      keys.join(',')
    );
  }

  // ---- guest mode: DOWN to the guest entry, then ENTER ------------------------
  {
    const { win, keys } = await boot(
      {},
      {
        'yt.leanback.default::last-identity-used': {
          data: { identityType: 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST' }
        }
      }
    );
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    await waitFor(() => keys.length >= 2);
    t('guest: DOWN then ENTER', keys.join(',') === '40,13', keys.join(','));
  }

  // ---- the setting turned off at runtime restores both stores -------------------
  {
    const before = Date.now();
    const { win } = await boot(
      {},
      {
        [RECURRING]: {
          data: {
            data: {
              'startup-screen-account-selector-with-guest': { lastFired: 1000 },
              whos_watching_fullscreen_zero_accounts: { lastFired: 1000 },
              'some-other-action': { lastFired: 1000 }
            }
          }
        },
        [PROMO_TS]: { data: 0, creation: 5, expiration: 6 }
      }
    );
    const selector = () => read(win, RECURRING).data.data;
    t(
      'setup: suppressed on boot',
      selector()['startup-screen-account-selector-with-guest'].lastFired > before + 6 * DAY
    );
    await showPanel(win);
    const box = panelCheckbox(win, 'Bypass Nag Screens');
    t('setup: the Bypass Nag Screens checkbox is on', !!box && box.checked === true);
    box.click();
    await wait(20);
    const now = Date.now();
    const restored = selector()['startup-screen-account-selector-with-guest'].lastFired;
    t(
      'turned off: the "Who\'s watching" actions are dated now, so the selector may show again',
      restored >= before && restored <= now,
      String(restored - before)
    );
    t(
      'turned off: both selector actions restored together',
      selector()['whos_watching_fullscreen_zero_accounts'].lastFired === restored
    );
    t(
      'turned off: the unrelated action is still untouched',
      selector()['some-other-action'].lastFired === 1000
    );
    const ts = read(win, PROMO_TS);
    const times = read(win, PROMO_TIMES);
    t(
      'turned off: the promo records are zeroed so the app decides again',
      ts.data === 0 && times.data === 0,
      JSON.stringify([ts, times])
    );
    t(
      'turned off: the promo envelope is kept, with its expiry refreshed',
      ts.creation === 5 && ts.expiration > now + 359 * DAY,
      JSON.stringify(ts)
    );

    box.click();
    await wait(20);
    t(
      'turned on again: the selector is suppressed once more',
      selector()['startup-screen-account-selector-with-guest'].lastFired > now + 6.9 * DAY
    );
    t('turned on again: the promo count is raised again', read(win, PROMO_TIMES).data === 99);
  }

  // ---- Force Previews changed at runtime: the inline-playback key is written at once ----
  {
    const { win } = await boot({ forcePreviews: 'disabled' }, {});
    await showPanel(win);
    const row = cycleRow(win, 'Force Previews');
    t('setup: the Force Previews row reads Disabled', !!row && /Disabled/.test(row.textContent));
    t('setup: nothing written while disabled', win.localStorage.getItem(INLINE) === null);

    row.click(); // Disabled -> Force On
    t(
      'Force On chosen: inline-playback-enabled is written true at once, without the startup delay',
      !!read(win, INLINE) && read(win, INLINE).data === true,
      win.localStorage.getItem(INLINE)
    );
    row.click(); // Force On -> Force Off
    t(
      'Force Off chosen: the key is rewritten false',
      read(win, INLINE).data === false,
      win.localStorage.getItem(INLINE)
    );
    win.localStorage.setItem(INLINE, JSON.stringify({ data: 'untouched' }));
    row.click(); // Force Off -> Disabled
    t(
      'Disabled chosen: the key is left as it is',
      read(win, INLINE).data === 'untouched',
      win.localStorage.getItem(INLINE)
    );
    await wait(300);
    t(
      'and no delayed write follows either',
      read(win, INLINE).data === 'untouched',
      win.localStorage.getItem(INLINE)
    );
  }

  report.finish();
})();
