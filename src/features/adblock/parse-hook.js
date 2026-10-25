// The JSON.parse hook: classifies each InnerTube response and runs the filters,
// the thumbnail rewrite and the text fixes over it before the app sees it.
import { isShortsPage } from '../../core/page-state.js';
import { isDebugEnabled } from '../../core/log.js';
import { upgradeResponseThumbnails } from '../thumbnail-quality/index.js';
import { raiseRowsAhead } from '../rows-ahead.js';
import { IGNORE_ON_SHORTS } from './constants.js';
import { detectResponseType } from '../../core/innertube.js';
import { searchStats } from './search.js';
import { stripTrackingParams } from './text-fixes.js';
import { wrapEmojiInTree, mayNeedEmojiWork } from './emoji-wrap.js';
import { applySchemaFilters } from './response-filters.js';
import { applyFallbackFilters, removeBlockedNavEntries } from './fallback.js';
import { cfgFlags, cfgFlagsNoEmoji, filterState } from './flags.js';
import { filterParsedResponse } from '../force-codec/hooks.js';
import { fc } from '../force-codec/state.js';
import { log } from './log.js';

let origParse = null;

/** Debug log for a large response no schema recognised (the fallback filters ran instead). */
function logSchemaMiss(data, textLength) {
  log.debug(
    `MISS (Fallback used) | Size: ${textLength} | Top-Level Keys: [${Object.keys(data).join(', ')}]`
  );
}

/**
 * The legacy emoji rewrite over frameworkUpdates, the one part of a response
 * the content filters never reach.
 */
function wrapEmojiInFrameworkUpdates(data, flags) {
  if (flags.enableLegacyEmojiFix && data.frameworkUpdates) {
    wrapEmojiInTree(data.frameworkUpdates);
  }
}

// Four functions on purpose. hookedParse runs on every JSON.parse the app
// makes and holds only the cheap guards; parseAndFilter parses and decides
// which flags apply; the try/catch sits alone in filterSafely, since the
// engine of webOS 3 (V8 3.28) does not optimise a function that contains one;
// filterResponse is the work itself.

/**
 * The JSON.parse replacement. Texts under 500 characters (YouTube's many small blobs) go straight
 * to the native parse; the rest through parseAndFilter.
 */
function hookedParse(text, reviver) {
  // YouTube parses thousands of small blobs (localStorage reads, config,
  // per-tile metadata) and none of them can be a response, so those calls
  // must cost as close to nothing as possible on top of the native parse.
  // The rows-ahead pass (on by default) needs every response, so they all go
  // through.
  // JSON.parse reads no `this`.
  if (typeof text !== 'string' || text.length < 500) return origParse(text, reviver);
  return parseAndFilter(text, reviver);
}

/**
 * Parses a large text (with tracking parameters blanked first when Tracking Block is on) and, when
 * it is an InnerTube response, runs the filters on it in place.
 */
function parseAndFilter(text, reviver) {
  const textLength = text.length;
  // Blanked in the text, in one native pass, before the parse: a walk of the
  // parsed tree cost more than the parse itself on a browse response and still
  // stopped at a depth limit. The shape is not known yet, so every text past
  // the size gate is passed through; only InnerTube's carry the key.
  if (cfgFlags.enableTrackingBlock) text = stripTrackingParams(text);

  const data = origParse(text, reviver);
  if (!data || typeof data !== 'object') return data;
  if (
    data.responseContext === undefined &&
    data.playerResponse === undefined &&
    data.continuationContents === undefined
  ) {
    return data;
  }
  if (data.botguardData) return data;

  // The legacy emoji fix walks every item it filters; a text without an emoji
  // in it is filtered with the fix left out (one scan of the text instead).
  const flags =
    cfgFlags.enableLegacyEmojiFix && !mayNeedEmojiWork(text) ? cfgFlagsNoEmoji : cfgFlags;
  filterSafely(data, textLength, flags);
  return data;
}

/**
 * filterResponse, with an error logged instead of thrown: a filter bug must never break YouTube's
 * parse.
 */
function filterSafely(data, textLength, flags) {
  try {
    filterResponse(data, textLength, flags);
  } catch (e) {
    log.warn('Error during filtering:', e);
  }
}

/**
 * Everything done to a parsed response, in order: the codec filter, Load Rows Ahead, the content
 * filters (by schema, the fallback search, or the guide's nav entries), then the thumbnail upgrade
 * and the emoji wrap.
 */
function filterResponse(data, textLength, flags) {
  // The codec filter first: a player response is also one the Shorts guard
  // below leaves alone.
  if (fc.mode !== 'auto') filterParsedResponse(data);

  const responseType = detectResponseType(data);
  // Load Rows Ahead: YouTube's own threshold stays when the setting is off.
  if (cfgFlags.enableRowsAhead) raiseRowsAhead(data, responseType);

  // The rest follows the switches in flags.js: nothing to do while all of
  // them are off. (The codec filter above has its own: fc.mode is the one
  // place that says whether it is on, the platform's refusal included.)
  if (!filterState.anyFilterEnabled) return;
  if (isShortsPage() && responseType && IGNORE_ON_SHORTS.has(responseType)) return;

  // The content filters: nothing to run when only the tracking, thumbnail
  // or codec passes are on.
  const contentFilter =
    flags === cfgFlags ? filterState.anyContentFilter : filterState.anyContentFilterButEmoji;
  if (contentFilter) {
    if (responseType) {
      if (isDebugEnabled()) log.debug(`Schema Match: [${responseType}]`);
      applySchemaFilters(data, responseType, flags);
    } else if (textLength > 10000) {
      if (isDebugEnabled()) logSchemaMiss(data, textLength);
      applyFallbackFilters(data, flags);
    } else if (flags.removeGlobalShorts || flags.removeLiveVideos) {
      // The guide arrives in its own small response, which matches no
      // content schema and is under the fallback's size threshold; the
      // search is depth-bounded.
      removeBlockedNavEntries(data, flags.removeGlobalShorts, flags.removeLiveVideos);
    }
  }

  // Thumbnail rewriting runs after filtering, so shelves and ad slots that
  // were just removed are never rewritten, and it reuses the responseType
  // already resolved above instead of detecting the shape a second time.
  // The thumbnail module keeps its own switch and returns at once when off.
  upgradeResponseThumbnails(data, responseType, textLength);
  wrapEmojiInFrameworkUpdates(data, flags);
}

/**
 * Installs the hook, once, for the life of the page.
 *
 * Every switch that lives on it (ads, Shorts, guest prompts, endcards,
 * trackingParams, the legacy emoji rewrite, the thumbnail upgrade) is a flag
 * in flags.js, and filterResponse stops after the rows-ahead pass (its own
 * switch, Load Rows Ahead) while none of them is on; force-codec's offer filter runs inside it as well.
 */
export function installParseHook() {
  if (JSON.parse === hookedParse) return;
  origParse = JSON.parse;
  // Assigned directly rather than wrapped in a forwarding closure: that
  // wrapper added a call frame to every JSON.parse in the app.
  JSON.parse = hookedParse;
  // The search counters (search.js), read on the TV from the web inspector:
  // `calls` bounded searches of a response, `visits` the nodes they walked. A
  // search is the price of a schema path that missed, so through one video
  // start `calls` should stay at zero.
  window.__ytafAdblockStats = searchStats;
  log.debug('JSON.parse hook installed');
}
