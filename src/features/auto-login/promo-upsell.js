// The Premium / Premium Lite upsell interstitial, suppressed through the
// records the app itself keeps about having shown it.

/**
 * Suppresses the Premium / Premium Lite upsell interstitial.
 *
 * Same trick as setWhosWatchingSuppressed() in whos-watching.js, against the app's own gate. The
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
import { log } from './log.js';
import { readRecord, writeRecord } from '../../core/yt-storage.js';

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

/**
 * The value stored for a promo record: the shown-times count, or a timestamp far enough ahead to
 * keep the promo away.
 */
function promoValueFor(suffix) {
  return suffix === 'promo-coupon-shown-times' ? PROMO_SHOWN_TIMES : Date.now() + PROMO_SUPPRESS_MS;
}

/** Suppresses the Premium upsell records (`on`), or restores them to let the app decide. */
export function setPromoUpsellSuppressed(on) {
  try {
    // key -> its suffix. Matched on the suffix rather than the full key: the
    // namespace is not always `default`, and a record written under a
    // profile-specific one would otherwise be missed while the promo kept firing.
    const targets = new Map();
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      for (const suffix of PROMO_SUFFIXES) {
        if (key.slice(-suffix.length) === suffix) targets.set(key, suffix);
      }
    }

    // On a fresh install neither record exists yet, so seed the default
    // namespace - otherwise the very first launch is the one that gets nagged.
    for (const suffix of PROMO_SUFFIXES) targets.set(LEANBACK_PREFIX + suffix, suffix);

    let count = 0;
    for (const [key, suffix] of targets) {
      const envelope = readRecord(key) || { data: 0, creation: Date.now() };

      // Only `data` is ours to decide; the rest of the record is left as the
      // app wrote it, apart from the refreshed expiry.
      envelope.data = on ? promoValueFor(suffix) : 0;
      envelope.expiration = Date.now() + PROMO_ENVELOPE_TTL_MS;
      if (writeRecord(key, envelope)) count++;
    }

    if (count) log.info(`Premium upsell ${on ? 'suppressed' : 'restored'} (${count} records)`);
  } catch (error) {
    log.error('Failed to update promo settings:', error);
  }
}
