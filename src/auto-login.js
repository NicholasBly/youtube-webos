import { configRead, configAddChangeListener } from './config.js';
import { SELECTORS, REMOTE_KEYS, isGuestMode, sendKey, invalidateGuestModeCache } from './utils';
import './auto-login.css';

const STORAGE_KEY = 'yt.leanback.default::recurring_actions';
const TARGET_ACTIONS = [
  'startup-screen-account-selector-with-guest',
  'whos_watching_fullscreen_zero_accounts',
  'startup-screen-signed-out-welcome-back'
];

const BYPASS_BODY_CLASS = 'ytaf-bypassing-login';
let hasBypassed = false;
let pageObserverAttached = false;

/**
 * Disables "Who's watching" by pushing the lastFired date 7 days into the future.
 * Credit: reisxd || https://github.com/reisxd/TizenTube/
 */
function disableWhosWatching(enable = true) {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (!storedData) return console.warn('Auto login: No recurring actions found');

    const json = JSON.parse(storedData);
    const actions = json.data?.data;

    if (!actions) return;

    // Use a future date if enabling, or Date.now() if disabling
    const targetDate = enable ? Date.now() + (7 * 24 * 60 * 60 * 1000) : Date.now();
    let isModified = false;

    for (const key of TARGET_ACTIONS) {
      if (actions[key]) {
        actions[key].lastFired = targetDate;
        isModified = true;
      }
    }

    if (isModified) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
      console.info(`Auto login: "Who's watching" screens ${enable ? 'disabled' : 'enabled'}`);
    }
  } catch (error) {
    console.error('Auto login: Failed to update settings:', error);
  }
}

/**
 * Suppresses the Premium / Premium Lite upsell interstitial.
 *
 * Same trick as disableWhosWatching() above, against the app's own gate. The
 * leanback client records when it last showed the promo and how many times, and
 * consults both before showing it again:
 *
 *   yt.leanback.default::promo-coupon-shown-timestamp  {"data":0,...}
 *   yt.leanback.default::promo-coupon-shown-times      {"data":0,...}
 *
 * Dating the timestamp forward and raising the count means the app decides for
 * itself not to show the page - so there is no request to intercept, no empty
 * screen where the ad used to be, and nothing to go stale when YouTube moves
 * the endpoint or renames the page type.
 */
const PROMO_SUFFIXES = ['promo-coupon-shown-timestamp', 'promo-coupon-shown-times'];
const LEANBACK_PREFIX = 'yt.leanback.default::';
// Longer than the 7 days used for the account selector, which only has to
// survive until the next launch. A promo check can happen mid-session, and a TV
// app can stay open for weeks.
const PROMO_SUPPRESS_MS = 365 * 24 * 60 * 60 * 1000;
const PROMO_SHOWN_TIMES = 99;
// The app stamps these records to expire about 360 days out. An expired record
// reads back as absent, which would quietly hand the promo a clean slate, so
// the envelope's own TTL is refreshed alongside the value.
const PROMO_ENVELOPE_TTL_MS = 360 * 24 * 60 * 60 * 1000;

function promoValueFor(suffix) {
  return suffix === 'promo-coupon-shown-times'
    ? PROMO_SHOWN_TIMES
    : Date.now() + PROMO_SUPPRESS_MS;
}

function disablePromoUpsell(enable = true) {
  try {
    const targets = new Set();

    // Matched on the suffix rather than the full key: the namespace is not
    // always `default`, and a record written under a profile-specific one would
    // otherwise be missed while the promo kept firing.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      for (const suffix of PROMO_SUFFIXES) {
        if (key.slice(-suffix.length) === suffix) targets.add(key);
      }
    }

    // On a fresh install neither record exists yet, so seed the default
    // namespace - otherwise the very first launch is the one that gets nagged.
    for (const suffix of PROMO_SUFFIXES) targets.add(LEANBACK_PREFIX + suffix);

    let count = 0;
    for (const key of targets) {
      let suffix = null;
      for (const candidate of PROMO_SUFFIXES) {
        if (key.slice(-candidate.length) === candidate) suffix = candidate;
      }
      if (!suffix) continue;

      let envelope = null;
      const existing = localStorage.getItem(key);
      if (existing) {
        try {
          envelope = JSON.parse(existing);
        } catch (e) {
          envelope = null;
        }
      }
      if (!envelope || typeof envelope !== 'object') {
        envelope = { data: 0, creation: Date.now() };
      }

      // Only `data` is ours to decide; the rest of the record is left as the
      // app wrote it, apart from the refreshed expiry.
      envelope.data = enable ? promoValueFor(suffix) : 0;
      envelope.expiration = Date.now() + PROMO_ENVELOPE_TTL_MS;
      localStorage.setItem(key, JSON.stringify(envelope));
      count++;
    }

    if (count) console.info(`[Auto Login] Premium upsell ${enable ? 'suppressed' : 'restored'} (${count} records)`);
  } catch (error) {
    console.error('[Auto Login] Failed to update promo settings:', error);
  }
}

export function setInlinePlayback(mode) {
  if (mode === 'disabled') return;
  
  const isEnabled = mode === 'force_on';
  try {
    localStorage.setItem('yt.leanback.default::inline-playback-enabled', JSON.stringify({ data: isEnabled }));
    console.info(`[Auto Login] Inline playback (previews) forced to: ${isEnabled}`);
  } catch (error) {
    console.error('[Auto Login] Failed to update inline playback setting:', error);
  }
}

export function initPreviews() {
  const mode = configRead('forcePreviews');
  if (mode === 'disabled') return;

  // Delay by 2.5 seconds to ensure it applies after YouTube's initial load overrides
  setTimeout(() => {
    setInlinePlayback(mode);
  }, 2500); 
}

// CSS rules live in auto-login.css and are scoped by body.ytaf-bypassing-login,
// so toggling the body class activates/deactivates the page-hide instantly with
// no <style> element churn.
function injectBypassCSS() {
    if (document.body) document.body.classList.add(BYPASS_BODY_CLASS);
}

function finalizeBypass() {
    console.info('[Auto Login] Bypass: Done. Cleaning up...');
    setTimeout(() => {
        if (document.body) document.body.classList.remove(BYPASS_BODY_CLASS);
    }, 2000);
}

export function attemptActiveBypass(force = false) {
    const isSelector = document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR);

    // Note: launch-param gating was removed deliberately — we check for the
    // account selector page on normal loads too, not just parameterised ones.
    if (!isSelector && !force) return;
    if (hasBypassed && !force) return;
	
    console.info('[Auto Login] Active Bypass: Selector Detected! Executing sequence...');
    hasBypassed = true;
    injectBypassCSS();

    setTimeout(() => {
        if (isGuestMode()) {
            sendKey(REMOTE_KEYS.DOWN);
            setTimeout(() => { sendKey(REMOTE_KEYS.ENTER); finalizeBypass(); }, 200);
        } else {
            sendKey(REMOTE_KEYS.ENTER);
            finalizeBypass();
        }
    }, 500);
}

export function resetActiveBypass() {
    hasBypassed = false;
    // Identity may have changed between launches (sign-in/out); drop the cached guest flag.
    invalidateGuestModeCache();
}

function setupActiveBypassListener() {
    if (pageObserverAttached) return;
    window.addEventListener('ytaf-page-update', (evt) => {
        if (evt.detail && evt.detail.isAccountSelector) {
            attemptActiveBypass();
        } 
    });
    pageObserverAttached = true;
}

export function initAutoLogin() {
  if (configRead('enableAutoLogin')) {
    console.info('[Auto Login] Initializing...');
    disableWhosWatching();
    disablePromoUpsell();
    setupActiveBypassListener();
    
    setTimeout(() => {
        if (!hasBypassed) {
            console.info('[Auto Login] Startup window closed');
            hasBypassed = true;
        }
    }, 15000);
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', () => { initAutoLogin(); initPreviews(); })
  : (initAutoLogin(), initPreviews());

configAddChangeListener('enableAutoLogin', ({ detail }) => {
  if (detail.newValue) {
    console.info('Auto login setting enabled');
    initAutoLogin();
  } else {
    console.info('Auto login disabled');
    disableWhosWatching(false); // Reset local storage time value
    disablePromoUpsell(false);
  }
});

configAddChangeListener('forcePreviews', ({ detail }) => {
  setInlinePlayback(detail.newValue);
});