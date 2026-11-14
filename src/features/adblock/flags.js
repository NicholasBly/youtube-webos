// The filter switches as one mutable snapshot, refreshed when a setting changes
// rather than re-read on every JSON.parse.
import { configGetAll, configAddChangeListener } from '../../core/config.js';
import { getWebOSVersion } from '../../core/webos.js';
import { CONFIG_KEYS } from './constants.js';

// configGetAll() returns the live reference, so this binds once at load.
const cfgSnapshot = configGetAll();

// The switches the parse hook reads on its hot path: whether any filter below
// is on at all, and whether any of them edits the content of a response
// (Tracking Block and the thumbnail pass do not: they have switches of their
// own).
export const filterState = {
  anyFilterEnabled: false,
  anyContentFilter: false,
  // The same, with the legacy emoji fix left out: for a response with no emoji in it.
  anyContentFilterButEmoji: false
};

// Singleton passed to the filters, refreshed by recomputeFilterFlags() rather
// than re-allocated on every JSON.parse.
export const cfgFlags = {
  enableAdBlock: false,
  enableTrackingBlock: false,
  removeGlobalShorts: false,
  removeLiveVideos: false,
  removeTopLiveGames: false,
  removeMostRelevant: false,
  hideGuestSignInPrompts: false,
  enableLegacyEmojiFix: false,
  hideEndcards: false,
  upgradeThumbnails: false,
  enableRowsAhead: false,
  enableDeArrow: false
};

// cfgFlags with the legacy emoji fix off: what the filters get for a response
// whose text holds nothing the fix would change (parse-hook.js).
export const cfgFlagsNoEmoji = Object.assign({}, cfgFlags);

// Called after every recompute: what has to follow the flags outside the hook.
const flagListeners = [];

/** Calls `fn` whenever the flags were recomputed (a setting changed). */
export function onFlagsChange(fn) {
  flagListeners.push(fn);
}

/**
 * Recomputes cfgFlags, cfgFlagsNoEmoji and filterState from the settings, then calls the
 * onFlagsChange listeners. Runs at load and on every change of a key in CONFIG_KEYS.
 */
function recomputeFilterFlags() {
  const adBlock = !!cfgSnapshot[CONFIG_KEYS.ADBLOCK];

  cfgFlags.enableAdBlock = adBlock;
  // Tracking Block, the Shorts, Live, Top live games and Most relevant filters
  // and the guest-prompt filter are Ad Blocking's own: the panel greys them out
  // while Ad Blocking is off, so they genuinely do nothing then.
  cfgFlags.enableTrackingBlock = adBlock && !!cfgSnapshot[CONFIG_KEYS.TRACKING];
  cfgFlags.removeGlobalShorts = adBlock && !!cfgSnapshot[CONFIG_KEYS.SHORTS];
  cfgFlags.removeLiveVideos = adBlock && !!cfgSnapshot[CONFIG_KEYS.LIVE];
  cfgFlags.removeTopLiveGames = adBlock && !!cfgSnapshot[CONFIG_KEYS.LIVE_GAMES];
  cfgFlags.removeMostRelevant = adBlock && !!cfgSnapshot[CONFIG_KEYS.MOST_RELEVANT];
  cfgFlags.hideGuestSignInPrompts = adBlock && !!cfgSnapshot[CONFIG_KEYS.GUEST_PROMPTS];
  // Independent switches on the same hook. The emoji rewrite is for webOS 3
  // and 4 only, where the system font has no colour emoji.
  cfgFlags.enableLegacyEmojiFix = !!cfgSnapshot[CONFIG_KEYS.EMOJI_FIX] && getWebOSVersion() <= 4;
  cfgFlags.hideEndcards = !!cfgSnapshot[CONFIG_KEYS.ENDCARDS];
  cfgFlags.upgradeThumbnails = !!cfgSnapshot[CONFIG_KEYS.THUMBNAILS];
  // DeArrow's titles and thumbnails (features/dearrow), after the thumbnail pass.
  cfgFlags.enableDeArrow = !!cfgSnapshot[CONFIG_KEYS.DEARROW];
  // Rows ahead is not a filter: it runs before the filter gate in parse-hook.js.
  cfgFlags.enableRowsAhead = !!cfgSnapshot[CONFIG_KEYS.ROWS_AHEAD];

  // The other content filters count only with Ad Blocking on (above), so it
  // and the endcards stand for all of them.
  filterState.anyContentFilterButEmoji = cfgFlags.enableAdBlock || cfgFlags.hideEndcards;
  filterState.anyContentFilter =
    filterState.anyContentFilterButEmoji || cfgFlags.enableLegacyEmojiFix;
  Object.assign(cfgFlagsNoEmoji, cfgFlags);
  cfgFlagsNoEmoji.enableLegacyEmojiFix = false;
  filterState.anyFilterEnabled = !!(
    filterState.anyContentFilter ||
    cfgFlags.enableTrackingBlock ||
    cfgFlags.upgradeThumbnails ||
    cfgFlags.enableDeArrow
  );
  // Last: a listener sees every switch above already recomputed.
  for (let i = 0; i < flagListeners.length; i++) flagListeners[i]();
}

recomputeFilterFlags();
for (const k of Object.values(CONFIG_KEYS)) {
  configAddChangeListener(k, recomputeFilterFlags);
}
