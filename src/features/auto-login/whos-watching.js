// The account selector ("Who's watching"): kept from appearing by dating its
// recurring-action record forward, and skipped actively when it shows anyway.
import { SELECTORS } from '../../core/selectors.js';
import { configRead } from '../../core/config.js';
import { REMOTE_KEYS, sendKey } from '../../core/remote.js';
import { isGuestMode, invalidateGuestModeCache } from '../../core/guest-mode.js';
import { log } from './log.js';
import { readRecord, writeRecord } from '../../core/yt-storage.js';

const STORAGE_KEY = 'yt.leanback.default::recurring_actions';
const TARGET_ACTIONS = [
  'startup-screen-account-selector-with-guest',
  'whos_watching_fullscreen_zero_accounts',
  'startup-screen-signed-out-welcome-back'
];

// The rule that hides the account selector while a bypass runs, in the page
// only then: a rule whose right end is an attribute test is tried against
// every element on every style recalculation, so it is not left in for the
// session. Which of these names the TV's selector carries is not known: all
// three are kept.
const BYPASS_STYLE_ID = 'ytaf-bypass-style';
const BYPASS_CSS =
  "ytlr-account-selector, .ytlr-account-selector, [class*='account-selector'] { display: none !important; }";
// How far ahead the selector's recurring action is dated to keep it away.
const SELECTOR_SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;
// The bypass sequence: the first key after the selector shows, the Enter after
// the Down in guest mode, and the body class coming off once it is through.
const BYPASS_START_MS = 500;
const GUEST_ENTER_MS = 200;
const BYPASS_CLEANUP_MS = 2000;
// The selector is bypassed on its own only this long after the start, or after
// a relaunch from the launcher; later, opening it is the user's choice.
const STARTUP_WINDOW_MS = 15000;
// Until when that is, on the monotonic clock (the TV may set its wall clock
// meanwhile): open from the script's start, closed by the bypass.
let bypassUntil = performance.now() + STARTUP_WINDOW_MS;
let pageObserverAttached = false;

/**
 * Keeps "Who's watching" from appearing (`on`) by pushing its lastFired date
 * seven days into the future, or lets it appear again by dating it now.
 * Credit: reisxd || https://github.com/reisxd/TizenTube/
 */
export function setWhosWatchingSuppressed(on) {
  const record = readRecord(STORAGE_KEY);
  const actions = record && record.data && record.data.data;
  if (!actions) {
    log.debug('No recurring actions found');
    return;
  }

  const targetDate = on ? Date.now() + SELECTOR_SUPPRESS_MS : Date.now();
  let isModified = false;
  for (const key of TARGET_ACTIONS) {
    if (actions[key]) {
      actions[key].lastFired = targetDate;
      isModified = true;
    }
  }

  if (!isModified) return;
  if (writeRecord(STORAGE_KEY, record)) {
    log.info(`"Who's watching" screens ${on ? 'disabled' : 'enabled'}`);
  } else {
    log.error('Failed to update the recurring actions');
  }
}

/** Hides the selector, so it does not flash before the synthetic Enter. */
function markBypassing() {
  if (document.getElementById(BYPASS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = BYPASS_STYLE_ID;
  style.textContent = BYPASS_CSS;
  (document.head || document.documentElement).appendChild(style);
}

/** Removes the stylesheet that hid the account selector, a moment after the bypass. */
function finalizeBypass() {
  log.info('Bypass: Done. Cleaning up...');
  setTimeout(() => {
    const style = document.getElementById(BYPASS_STYLE_ID);
    if (style) style.remove();
  }, BYPASS_CLEANUP_MS);
}

/**
 * Picks the account on the account selector with synthetic key presses (Down first for a guest),
 * once per launch window; `force` skips the window and selector checks.
 */
export function attemptActiveBypass(force = false) {
  // Called from the launch and relaunch paths as well, which do not go through
  // initAutoLogin(); the setting has to hold there too.
  if (!configRead('enableAutoLogin')) return;
  const isSelector = document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR);

  // The account selector is looked for on every load, launch parameters or not.
  if (!isSelector && !force) return;
  if (!force && performance.now() > bypassUntil) return;

  log.info('Active Bypass: Selector Detected! Executing sequence...');
  // Once per window: a second appearance is the user's.
  bypassUntil = 0;
  markBypassing();

  setTimeout(() => {
    if (isGuestMode()) {
      sendKey(REMOTE_KEYS.DOWN);
      setTimeout(() => {
        sendKey(REMOTE_KEYS.ENTER);
        finalizeBypass();
      }, GUEST_ENTER_MS);
    } else {
      sendKey(REMOTE_KEYS.ENTER);
      finalizeBypass();
    }
  }, BYPASS_START_MS);
}

/** A relaunch from the launcher: the window opens again, from now. */
export function resetActiveBypass() {
  bypassUntil = performance.now() + STARTUP_WINDOW_MS;
  // Identity may have changed between launches (sign-in/out); drop the cached guest flag.
  invalidateGuestModeCache();
}

/** Runs the bypass whenever the account selector page appears (once). */
export function setupActiveBypassListener() {
  if (pageObserverAttached) return;
  window.addEventListener('ytaf-page-update', (evt) => {
    if (evt.detail && evt.detail.isAccountSelector) {
      attemptActiveBypass();
    }
  });
  pageObserverAttached = true;
}
