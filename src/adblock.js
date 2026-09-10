import { configGetAll, configAddChangeListener } from './config';
import { isShortsPage } from './utils';
import { getWebOSVersion } from './webos-utils';
import { FetchRegistry } from './hooks';
import { upgradeResponseThumbnails, thumbnailHookRequired } from './thumbnail-quality.js';

const DEBUG = false;
const EMOJI_DEBUG = false; 
const FORCE_FALLBACK = false;

let isFetchHooked = false;
let isXHRHooked = false;
let originalXHROpen = null;
let originalXHRSend = null;
const cachedWebOSVersion = getWebOSVersion();

// --- CONSTANTS & CONFIGURATION ---

// TELEMETRY_REGEX is derived from this list. '/api/stats/watchtime' and
// '/api/stats/playback' are deliberately absent: they register the view against
// the creator and leak nothing the player has not already sent.
const BLOCKED_TELEMETRY_PATHS = [
  '/youtubei/v1/log_event',
  '/ptracking',
  '/api/stats/atr',
  '/api/stats/qoe',
  '/pagead/',
  '/eligibility_check'
];

const TELEMETRY_REGEX = new RegExp(
  BLOCKED_TELEMETRY_PATHS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
);

const UI_STRINGS = {
  SHORTS_TITLE: 'Shorts',
  TOP_LIVE_GAMES_TITLE: 'Top live games',
  MOST_RELEVANT_TITLE: 'Most relevant',
  GUEST_PROMPT_TEXT: 'Sign in for better recommendations'
};

const YT_CONSTANTS = {
  SHELF_TYPE_SHORTS: 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS',
  TILE_STYLE_SHORTS: 'TILE_STYLE_YTLR_SHORTS',
  BADGE_STYLE_LIVE: 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE',
  CONTENT_TYPE_SHORTS: 'TILE_CONTENT_TYPE_SHORTS',
  VIDEO_TYPE_REEL_AD: 'REEL_VIDEO_TYPE_AD'
};

const CONFIG_KEYS = {
  ADBLOCK: 'enableAdBlock',
  TRACKING: 'enableTrackingBlock',
  SHORTS: 'removeGlobalShorts',
  LIVE: 'removeLiveVideos',
  LIVE_GAMES: 'removeTopLiveGames',
  MOST_RELEVANT: 'removeMostRelevant',
  GUEST_PROMPTS: 'hideGuestSignInPrompts',
  EMOJI_FIX: 'enableLegacyEmojiFix',
  ENDCARDS: 'hideEndcards',
  THUMBNAILS: 'upgradeThumbnails'
};

const EMOJI_RE = /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
const EMOJI_RE_CAP = new RegExp(`(${EMOJI_RE.source})`, 'g');
const EMOJI_RE_GLOBAL = new RegExp(EMOJI_RE.source, 'g');
// Includes our own sentinels: a title that ships \u200B/\u200C verbatim could
// otherwise forge an "already wrapped" region that emoji-font.js then treats
// as its own output. Stripping first also makes processEmojiString idempotent.
const CLEAN_TEXT_RE = /[\u200B\u200C\u2060\uFEFF]/g;
// Single-scan gate for "does this string need any emoji work at all" - most
// YouTube titles are plain text and reject here.
const NEEDS_TEXT_WORK_RE = new RegExp(EMOJI_RE.source + '|[\\u200B\\u200C\\u2060\\uFEFF]');

const IGNORE_ON_SHORTS = new Set(['SEARCH', 'PLAYER', 'ACTION']);

// configGetAll() returns the live reference, so this binds once at load.
const cfgSnapshot = configGetAll();
let anyFilterEnabled = false;
let cfgNeedsContentFiltering = false;
let cfgEmojiFixEffective = false;

// Singleton passed to the filters, refreshed by recomputeFilterFlags() rather
// than re-allocated on every JSON.parse.
const cfgFlags = {
  enableAdBlock: false,
  enableTrackingBlock: false,
  removeGlobalShorts: false,
  removeLiveVideos: false,
  removeTopLiveGames: false,
  removeMostRelevant: false,
  hideGuestPrompts: false,
  enableLegacyEmojiFix: false,
  hideEndcards: false,
  upgradeThumbnails: false
};

function recomputeFilterFlags() {
  cfgEmojiFixEffective = !!cfgSnapshot[CONFIG_KEYS.EMOJI_FIX] && cachedWebOSVersion <= 4;
  cfgNeedsContentFiltering = !!(cfgSnapshot[CONFIG_KEYS.ADBLOCK] || cfgSnapshot[CONFIG_KEYS.GUEST_PROMPTS] || cfgEmojiFixEffective);

  cfgFlags.enableAdBlock = !!cfgSnapshot[CONFIG_KEYS.ADBLOCK];
  cfgFlags.enableTrackingBlock = !!cfgSnapshot[CONFIG_KEYS.TRACKING];
  cfgFlags.removeGlobalShorts = !!cfgSnapshot[CONFIG_KEYS.SHORTS];
  cfgFlags.removeLiveVideos = !!cfgSnapshot[CONFIG_KEYS.LIVE];
  cfgFlags.removeTopLiveGames = !!cfgSnapshot[CONFIG_KEYS.LIVE_GAMES];
  cfgFlags.removeMostRelevant = !!cfgSnapshot[CONFIG_KEYS.MOST_RELEVANT];
  cfgFlags.hideGuestPrompts = !!cfgSnapshot[CONFIG_KEYS.GUEST_PROMPTS];
  cfgFlags.enableLegacyEmojiFix = cfgEmojiFixEffective;
  cfgFlags.hideEndcards = !!cfgSnapshot[CONFIG_KEYS.ENDCARDS];
  cfgFlags.upgradeThumbnails = !!cfgSnapshot[CONFIG_KEYS.THUMBNAILS];

  anyFilterEnabled = !!(
    cfgFlags.enableAdBlock ||
    cfgFlags.enableTrackingBlock ||
    cfgFlags.removeGlobalShorts ||
    cfgFlags.removeLiveVideos ||
    cfgFlags.removeTopLiveGames ||
    cfgFlags.removeMostRelevant ||
    cfgFlags.hideGuestPrompts ||
    cfgFlags.enableLegacyEmojiFix ||
    cfgFlags.hideEndcards ||
    cfgFlags.upgradeThumbnails
  );
}

recomputeFilterFlags();
for (const k of Object.values(CONFIG_KEYS)) {
  configAddChangeListener(k, recomputeFilterFlags);
}

const SCHEMA_REGISTRY = {
  typeSignatures: [
    { type: 'SHORTS_SEQUENCE', detectionPath: ['entries'], matchFn: (data) => Array.isArray(data.entries) },
    { type: 'PLAYER', detectionPath: ['streamingData'] },
    { type: 'NEXT', detectionPath: ['contents', 'singleColumnWatchNextResults'] },
    { type: 'HOME_BROWSE', detectionPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer'] },
    { type: 'BROWSE_TABS', detectionPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer'] },
    { type: 'SEARCH', detectionPath: ['contents', 'sectionListRenderer'], excludePath: ['contents', 'tvBrowseRenderer'] },
    { type: 'CONTINUATION', detectionPath: ['continuationContents'] },
    { type: 'ACTION', detectionPath: ['onResponseReceivedActions'] },
    { type: 'ACTION', detectionPath: ['onResponseReceivedEndpoints'] }
  ],
  paths: {
    PLAYER: { overlayPath: ['playerOverlays', 'playerOverlayRenderer'] },
    NEXT: { overlayPath: ['playerOverlays', 'playerOverlayRenderer'], pivotPath: ['contents', 'singleColumnWatchNextResults', 'pivot', 'sectionListRenderer', 'contents'] },
    SHORTS_SEQUENCE: { listPath: ['entries'] },
    HOME_BROWSE: { mainContent: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer', 'content', 'sectionListRenderer', 'contents'] },
    BROWSE_TABS: { tabsPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer', 'sections', '0', 'tvSecondaryNavSectionRenderer', 'tabs'] },
    SEARCH: { mainContent: ['contents', 'sectionListRenderer', 'contents'] },
    CONTINUATION: { 
      sectionPath: ['continuationContents', 'sectionListContinuation', 'contents'], 
      gridPath: ['continuationContents', 'gridContinuation', 'items'],
      horizontalPath: ['continuationContents', 'horizontalListContinuation', 'items'],
      tvSurfacePath: ['continuationContents', 'tvSurfaceContentContinuation', 'content', 'sectionListRenderer', 'contents']
    }
  }
};

let origParse = JSON.parse;
let isHooked = false;

// --- CORE FUNCTIONS ---

function debugLog(msg, ...args) {
  if (DEBUG) console.log(`[AdBlock] ${msg}`, ...args);
}

function processEmojiString(str) {
  if (typeof str !== 'string' || !str) return str;
  if (!NEEDS_TEXT_WORK_RE.test(str)) return str;
  let cleanedStr = str.replace(CLEAN_TEXT_RE, '');

  const replaced = cleanedStr.replace(EMOJI_RE_GLOBAL, '\u200B$&\u200C');
  if (EMOJI_DEBUG && replaced !== str) {
    console.log(`[AdBlock-Emoji] Wrapped emoji in string: "${str}"`);
  }
  return replaced;
}

// Idempotent by construction: the sentinels are stripped first, then re-wrapped
// from the cleaned text. That also stops a title shipping \u200B/\u200C verbatim
// from forging an "already wrapped" region.
function splitIntoRuns(text, originalRun = {}) {
    if (!NEEDS_TEXT_WORK_RE.test(text)) return null;

    const cleanText = text.replace(CLEAN_TEXT_RE, '');
    if (!EMOJI_RE.test(cleanText)) return null;

    const parts = cleanText.split(EMOJI_RE_CAP);
    const newRuns = [];
    
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        if (i % 2 === 1) { 
            newRuns.push(Object.assign({}, originalRun, { text: '\u200B' + parts[i] + '\u200C' }));
        } else {
            newRuns.push(Object.assign({}, originalRun, { text: parts[i] }));
        }
    }
    return newRuns;
}

// Non-recursive: the emoji/text fields of a single node, in place.
// walkAndProcess guarantees obj is a non-null object.
function processTextFieldsInPlace(obj) {
  // Set when the runs array below came from simpleText in this same call;
  // re-splitting it would be work for an identical result.
  let justBuiltRuns = false;

  if (typeof obj.simpleText === 'string' && NEEDS_TEXT_WORK_RE.test(obj.simpleText)) {
    const runs = splitIntoRuns(obj.simpleText);
    if (runs) {
        obj.runs = runs;
        delete obj.simpleText; 
        justBuiltRuns = true;
    } else {
        obj.simpleText = obj.simpleText.replace(CLEAN_TEXT_RE, '');
    }
  }

  if (typeof obj.sectionString === 'string') {
    obj.sectionString = processEmojiString(obj.sectionString); 
  }
  
  if (typeof obj.content === 'string' && EMOJI_RE.test(obj.content)) {
     obj.content = processEmojiString(obj.content);
  }
  
  if (!justBuiltRuns && Array.isArray(obj.runs)) {
    const src = obj.runs;
    // Lazily allocated: a runs array only needs rebuilding if a run actually
    // splits, which is rare.
    let newRuns = null;
    for (let i = 0, len = src.length; i < len; i++) {
      const run = src[i];
      if (!run || typeof run.text !== 'string') {
        if (newRuns) newRuns.push(run);
        continue;
      }
      if (!NEEDS_TEXT_WORK_RE.test(run.text)) {
        if (newRuns) newRuns.push(run);
        continue;
      }
      const split = splitIntoRuns(run.text, run);
      if (split) {
        if (!newRuns) newRuns = src.slice(0, i);
        for (let j = 0; j < split.length; j++) newRuns.push(split[j]);
      } else {
        run.text = run.text.replace(CLEAN_TEXT_RE, '');
        if (newRuns) newRuns.push(run);
      }
    }
    if (newRuns) obj.runs = newRuns;
  }
}

// Depth-limited walk doing emoji text processing (doEmoji) and/or trackingParams
// stripping (doTracking) in one traversal rather than two.
function walkAndProcess(obj, doEmoji, doTracking, maxDepth, currentDepth = 0) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return;

  if (doTracking && typeof obj.trackingParams === 'string') obj.trackingParams = '';
  // NOTE: do NOT strip clickTrackingParams here — that breaks clicking endcards.

  if (doEmoji) processTextFieldsInPlace(obj);

  const nextDepth = currentDepth + 1;

  if (Array.isArray(obj)) {
    for (let i = 0, len = obj.length; i < len; i++) {
      const v = obj[i];
      if (v && typeof v === 'object') walkAndProcess(v, doEmoji, doTracking, maxDepth, nextDepth);
    }
  } else {
    // for-in, not Object.keys(): identical visited set for JSON.parse output,
    // without allocating an array at every node of the response tree.
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') walkAndProcess(v, doEmoji, doTracking, maxDepth, nextDepth);
    }
  }
}

// Per-item entry point for the filter functions.
function findAndProcessText(obj, maxDepth = 20) {
  walkAndProcess(obj, true, false, maxDepth);
}

const telemetryFetchHandler = (evt) => {
  const { url } = evt.detail;
  // .pathname avoids the .href getter rebuilding the whole URL string, and all
  // BLOCKED_TELEMETRY_PATHS are path-only.
  if (TELEMETRY_REGEX.test(url.pathname)) {
    if (DEBUG) console.info('[AdBlock] Blocked telemetry Fetch request:', url.pathname);
    evt.preventDefault();
  }
};

export function initTrackingBlock() {
  if (isFetchHooked || isXHRHooked) return;

  // 1. Hook Fetch (Wrapped separately so webOS 3 EventTarget failures don't break XHR)
  try {
    if (typeof FetchRegistry !== 'undefined' && FetchRegistry.getInstance) {
      FetchRegistry.getInstance().addEventListener('request', telemetryFetchHandler);
      isFetchHooked = true; // set here — nothing between this and add() can throw
    }
  } catch (e) {
    console.warn('[AdBlock] Fetch hook failed (expected behavior on webOS 3):', e.message);
  }

  // 2. Hook XMLHttpRequest
  try {
    originalXHROpen = window.XMLHttpRequest.prototype.open;
    originalXHRSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function(method, url) {
      // Fallback for older engines that might not support optional chaining properly
      const urlStr = typeof url === 'string' ? url : (url && url.toString ? url.toString() : '');
      this.__adblockBlocked = !!urlStr && TELEMETRY_REGEX.test(urlStr);

      if (this.__adblockBlocked) {
        if (DEBUG) console.info('[AdBlock] Blocked telemetry XHR request:', urlStr);
        // Point the request at an empty data: URL instead of refusing to send.
        const isAsync = arguments.length > 2 ? arguments[2] : true;
        return originalXHROpen.call(this, 'GET', 'data:text/plain,', isAsync);
      }

      // Use standard 'arguments' instead of spread syntax (...args) for webOS 3 compatibility
      return originalXHROpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function(body) {
      if (this.__adblockBlocked) {
        return originalXHRSend.call(this); // drop the telemetry body
      }
      return originalXHRSend.apply(this, arguments);
    };

    isXHRHooked = true;
    console.info('[AdBlock] Telemetry network hooks enabled (XHR)');
  } catch (e) {
    console.error('[AdBlock] Failed to initialize XHR telemetry blockers:', e);
  }
}

export function destroyTrackingBlock() {
  if (!isFetchHooked && !isXHRHooked) return;

  // 1. Unhook Fetch
  if (isFetchHooked) {
    try {
      if (typeof FetchRegistry !== 'undefined' && FetchRegistry.getInstance) {
        FetchRegistry.getInstance().removeEventListener('request', telemetryFetchHandler);
      }
    } catch (e) {
      console.warn('[AdBlock] Fetch unhook failed (expected on older engines):', e.message);
    } finally {
      isFetchHooked = false;
    }
  }

  // 2. Unhook XMLHttpRequest
  if (isXHRHooked) {
    try {
      if (originalXHROpen && originalXHRSend) {
        window.XMLHttpRequest.prototype.open = originalXHROpen;
        window.XMLHttpRequest.prototype.send = originalXHRSend;
        originalXHROpen = null;
        originalXHRSend = null;
      }
    } catch (e) {
      console.error('[AdBlock] Failed to remove XHR network blockers:', e);
    } finally {
      isXHRHooked = false;
      if (DEBUG) console.info('[AdBlock] Telemetry network hooks disabled');
    }
  }
}

function logSchemaMiss(data, textLength) {
  try {
    let info = '';
    const keys = Array.isArray(data) ? '[Array]' : Object.keys(data);
    if (textLength < 1000) {
      info = `Content: ${JSON.stringify(data)}`;
    } else {
      info = `Top-Level Keys: [${Array.isArray(keys) ? keys.join(', ') : 'Array'}]`;
    }
    debugLog(`MISS (Fallback used) | Size: ${textLength} | ${info}`);
  } catch {
    debugLog(`MISS (Fallback used) | Size: ${textLength} | Error analyzing structure`);
  }
}

function hookedParse(text, reviver) {
  // Guards ordered cheapest-first. YouTube parses thousands of small blobs
  // (localStorage reads, config, per-tile metadata) and none of them can be a
  // filterable response, so those calls must cost as close to nothing as
  // possible on top of the native parse.
  if (!anyFilterEnabled || !text || text.length < 500) {
    return origParse.call(this, text, reviver);
  }

  const data = origParse.call(this, text, reviver);
  if (!data || typeof data !== 'object') return data;
  if (
    data.responseContext === undefined &&
    data.playerResponse === undefined &&
    data.continuationContents === undefined
  )
    return data;
  if (data.botguardData) return data;

  try {
    const responseType = detectResponseType(data);
    const needsContentFiltering = cfgNeedsContentFiltering;

    if (isShortsPage() && responseType && IGNORE_ON_SHORTS.has(responseType)) return data;

    if (FORCE_FALLBACK) {
      if (DEBUG) debugLog('FORCE_FALLBACK active. Using fallback filters.');
      if (!Array.isArray(data)) applyFallbackFilters(data, cfgFlags, needsContentFiltering);
    } else if (responseType && SCHEMA_REGISTRY.paths[responseType]) {
      if (DEBUG) debugLog(`Schema Match: [${responseType}]`);
      applySchemaFilters(data, responseType, cfgFlags, needsContentFiltering);
    } else if (responseType === 'ACTION' || responseType === 'PLAYER') {
      if (DEBUG) debugLog(`Schema Match: [${responseType}]`);
      applySchemaFilters(data, responseType, cfgFlags, needsContentFiltering);
    } else if(text.length > 10000 && !Array.isArray(data)) {
      if (DEBUG) logSchemaMiss(data, text.length);
      applyFallbackFilters(data, cfgFlags, needsContentFiltering);
    } else if ((cfgFlags.removeGlobalShorts || cfgFlags.removeLiveVideos) && !Array.isArray(data)) {
      // The guide arrives in its own small response, which matches no content
      // schema and is under the fallback's size threshold - so without this it
      // was never looked at. removeBlockedNavEntries() early-returns when the
      // settings are off, and its search is depth-bounded.
      removeBlockedNavEntries(data, cfgFlags.removeGlobalShorts, cfgFlags.removeLiveVideos);
    }

    // Thumbnail rewriting runs after filtering, so shelves and ad slots that
    // were just removed are never rewritten, and it reuses the responseType
    // already resolved above instead of detecting the shape a second time.
    if (cfgFlags.upgradeThumbnails) upgradeResponseThumbnails(data, responseType);

    if (cfgFlags.enableTrackingBlock) {
        // trackingParams across the whole tree at depth 15, then emoji on
        // frameworkUpdates as a small targeted walk at depth 20.
        walkAndProcess(data, false, true, 15);
        if (DEBUG) debugLog('Stripped trackingParams globally');
        if (cfgFlags.enableLegacyEmojiFix && data.frameworkUpdates) {
            walkAndProcess(data.frameworkUpdates, true, false, 20);
        }
    } else if (cfgFlags.enableLegacyEmojiFix && data.frameworkUpdates) {
        walkAndProcess(data.frameworkUpdates, true, false, 20);
    }

  } catch (e) {
    if (DEBUG) console.error('[AdBlock] Error during filtering:', e);
  }
  return data;
}

function detectResponseType(data) {
  const signatures = SCHEMA_REGISTRY.typeSignatures;
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    if (sig.excludePath && getByPath(data, sig.excludePath) !== undefined) continue;
    if (getByPath(data, sig.detectionPath) !== undefined) {
      if (sig.matchFn && !sig.matchFn(data)) continue;
      return sig.type;
    }
  }
  return null;
}

function applySchemaFilters(data, responseType, config, needsContentFiltering) {
  removeBlockedNavEntries(data, config.removeGlobalShorts, config.removeLiveVideos);
  const schema = SCHEMA_REGISTRY.paths[responseType];
  switch (responseType) {
    case 'SHORTS_SEQUENCE':
        if (config.enableAdBlock && schema?.listPath) {
            const entries = getByPath(data, schema.listPath);
            if (Array.isArray(entries)) {
                const oldLen = entries.length;
                filterItemsOptimized(entries, config, needsContentFiltering);
                if (DEBUG && entries.length !== oldLen) debugLog(`SHORTS_SEQUENCE: Removed ${oldLen - entries.length} items`);
            }
        }
        break;
    case 'HOME_BROWSE':
      if (schema?.mainContent) {
        let contents = getByPath(data, schema.mainContent);
        if (!contents) {
            contents = findObjects(data, ['sectionListRenderer'], 8).sectionListRenderer?.contents;
            if (DEBUG && contents) debugLog(`${responseType}: Using fallback search`);
        }
        if (Array.isArray(contents)) processSectionListOptimized(contents, config, needsContentFiltering, responseType);
      }
      break;
    case 'BROWSE_TABS':
      if (schema?.tabsPath) {
        const tabs = getByPath(data, schema.tabsPath);
        if (Array.isArray(tabs)) {
          for (let i = 0; i < tabs.length; i++) {
            const gridContents = tabs[i].tabRenderer?.content?.sectionListRenderer?.contents || tabs[i].tabRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
            if (Array.isArray(gridContents)) processSectionListOptimized(gridContents, config, needsContentFiltering, 'BROWSE_TAB_GENERIC');
          }
        }
      }
      break;
    case 'SEARCH':
      if (schema?.mainContent) {
        let contents = getByPath(data, schema.mainContent);
        if (!contents) {
            contents = findObjects(data, ['sectionListRenderer'], 8).sectionListRenderer?.contents;
            if (DEBUG && contents) debugLog(`${responseType}: Using fallback search`);
        }
        if (Array.isArray(contents)) processSectionListOptimized(contents, config, needsContentFiltering, responseType);
      }
      break;
    case 'CONTINUATION':
      if (schema?.sectionPath) {
        const secList = getByPath(data, schema.sectionPath);
        if (Array.isArray(secList)) processSectionListOptimized(secList, config, needsContentFiltering, 'CONTINUATION (Section)');
      }
      if (schema?.tvSurfacePath) {
        const tvList = getByPath(data, schema.tvSurfacePath);
        if (Array.isArray(tvList)) processSectionListOptimized(tvList, config, needsContentFiltering, 'CONTINUATION (TV Surface)');
      }
      if (schema?.gridPath) {
        const gridItems = getByPath(data, schema.gridPath);
        if (Array.isArray(gridItems)) {
            const oldLen = gridItems.length;
            filterItemsOptimized(gridItems, config, needsContentFiltering);
            if (DEBUG && oldLen !== gridItems.length) debugLog(`CONTINUATION (Grid): Removed ${oldLen - gridItems.length} items`);
        }
      }
      if (schema?.horizontalPath) {
        const horizItems = getByPath(data, schema.horizontalPath);
        if (Array.isArray(horizItems)) {
            const oldLen = horizItems.length;
            filterItemsOptimized(horizItems, config, needsContentFiltering);
            if (DEBUG && oldLen !== horizItems.length) debugLog(`CONTINUATION (Horizontal): Removed ${oldLen - horizItems.length} items`);
        }
      }
      if (config.enableLegacyEmojiFix && data.continuationContents) {
          findAndProcessText(data.continuationContents, 20);
      }
      break;
    case 'ACTION': {
      const actions = data.onResponseReceivedActions || data.onResponseReceivedEndpoints;
      if (Array.isArray(actions)) {
        processActions(actions, config, needsContentFiltering);
        if (config.enableLegacyEmojiFix) {
            findAndProcessText(actions, 20);
        }
      }
      break;
    }
    case 'PLAYER':
    case 'NEXT':
      if (config.enableAdBlock) {
        if (responseType === 'PLAYER') removePlayerAdsOptimized(data);
        let overlay = getByPath(data, schema?.overlayPath);
        if (!overlay) {
            overlay = findObjects(data, ['playerOverlayRenderer'], 8).playerOverlayRenderer;
            if (DEBUG && overlay) debugLog(`${responseType}: Path failed, found overlay via fallback`);
        }
        if (overlay?.timelyActionRenderers) {
            delete overlay.timelyActionRenderers;
            if (DEBUG) debugLog(`${responseType}: Removed timelyActionRenderers (QR Code)`);
        }
      }
	  if (config.hideEndcards) {
          removeEndcardsOptimized(data);
      }
      if (config.hideGuestPrompts) {
         let pivotContents = getByPath(data, schema?.pivotPath);
         if (!pivotContents) {
            pivotContents = findObjects(data, ['pivot'], 8).pivot?.sectionListRenderer?.contents;
            if (DEBUG && pivotContents) debugLog(`${responseType}: Found pivot via fallback search`);
         }
         if (Array.isArray(pivotContents)) processSectionListOptimized(pivotContents, config, needsContentFiltering, `${responseType} (Pivot)`);
      }
      if (config.enableLegacyEmojiFix) {
        if (responseType === 'NEXT') {
          findAndProcessText(getByPath(data, ['contents', 'singleColumnWatchNextResults']));
          findAndProcessText(getByPath(data, ['playerOverlays']));
          findAndProcessText(getByPath(data, ['engagementPanels']), 20); 
        } else if (responseType === 'PLAYER') {
          findAndProcessText(getByPath(data, ['videoDetails']));
        }
      }
      break;
  }
}

/**
 * Remove blocked entries (Shorts, Live) from the left-hand guide.
 *
 * Identified by endpoint first - browseId FEshorts / a reelWatchEndpoint for Shorts, 
 * or FEtopics_live for Live - and only then by title text.
 */
function isNavEntryBlocked(entry, removeGlobalShorts, removeLiveVideos) {
  if (!entry || typeof entry !== 'object') return false;

  const renderer =
    entry.guideEntryRenderer ||
    entry.tabRenderer ||
    entry.pivotBarItemRenderer ||
    entry;

  const endpoint = renderer.navigationEndpoint || renderer.endpoint || renderer.onSelectCommand;
  if (endpoint) {
    if (removeGlobalShorts && endpoint.reelWatchEndpoint) return true;
    const browseId = endpoint.browseEndpoint?.browseId;
    if (removeGlobalShorts && (browseId === 'FEshorts' || browseId === 'FEshorts_tv')) return true;
    if (removeLiveVideos && browseId === 'FEtopics_live') return true;
  }

  if (removeGlobalShorts) {
    const title =
      renderer.title?.simpleText ||
      renderer.title?.runs?.[0]?.text ||
      renderer.tabIdentifier ||
      (typeof renderer.title === 'string' ? renderer.title : undefined);
    return title === UI_STRINGS.SHORTS_TITLE;
  }
  return false;
}

function removeBlockedNavEntries(data, removeGlobalShorts, removeLiveVideos) {
  if ((!removeGlobalShorts && !removeLiveVideos) || !data || typeof data !== 'object') return;

  const found = findObjects(
    data,
    ['tvSecondaryNavRenderer', 'guideRenderer', 'pivotBarRenderer', 'items', 'tabs', 'sections'],
    8
  );

  const lists = [
    found.tvSecondaryNavRenderer?.sections,
    found.guideRenderer?.items,
    found.pivotBarRenderer?.items,
    found.tabs,
    found.sections,
    found.items
  ];

  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (!Array.isArray(list)) continue;

    for (let j = 0; j < list.length; j++) {
      const inner =
        list[j]?.tvSecondaryNavSectionRenderer?.tabs ||
        list[j]?.guideSectionRenderer?.items;
      if (Array.isArray(inner)) {
        const before = inner.length;
        let w = 0;
        for (let k = 0; k < inner.length; k++) {
          if (!isNavEntryBlocked(inner[k], removeGlobalShorts, removeLiveVideos)) inner[w++] = inner[k];
        }
        inner.length = w;
        if (DEBUG && before !== w) debugLog(`Guide: removed ${before - w} blocked entr(ies)`);
      }
    }

    const before = list.length;
    let w = 0;
    for (let j = 0; j < list.length; j++) {
      if (!isNavEntryBlocked(list[j], removeGlobalShorts, removeLiveVideos)) list[w++] = list[j];
    }
    list.length = w;
    if (DEBUG && before !== w) debugLog(`Guide: removed ${before - w} blocked entr(ies)`);
  }
}

function applyFallbackFilters(data, config, needsContentFiltering) {
  removeBlockedNavEntries(data, config.removeGlobalShorts, config.removeLiveVideos);
  if (config.enableAdBlock) removePlayerAdsOptimized(data);
  if (config.hideEndcards) removeEndcardsOptimized(data);
  const needles = ['playerOverlayRenderer', 'pivot', 'sectionListRenderer', 'gridRenderer', 'gridContinuation', 'sectionListContinuation', 'entries'];
  const found = findObjects(data, needles, 10);
  
  if (config.enableAdBlock && found.playerOverlayRenderer?.timelyActionRenderers) {
      delete found.playerOverlayRenderer.timelyActionRenderers;
      if (DEBUG) debugLog('FALLBACK: Removed timelyActionRenderers');
  }
  if (Array.isArray(found.pivot?.sectionListRenderer?.contents)) processSectionListOptimized(found.pivot.sectionListRenderer.contents, config, needsContentFiltering, 'Fallback Pivot');
  if (Array.isArray(found.sectionListRenderer?.contents)) processSectionListOptimized(found.sectionListRenderer.contents, config, needsContentFiltering, 'Fallback sectionListRenderer');
  if (Array.isArray(found.sectionListContinuation?.contents)) processSectionListOptimized(found.sectionListContinuation.contents, config, needsContentFiltering, 'Fallback sectionListContinuation');
  
  if (found.gridRenderer?.items) {
      const oldLen = found.gridRenderer.items.length;
      filterItemsOptimized(found.gridRenderer.items, config, needsContentFiltering);
      if (DEBUG && oldLen !== found.gridRenderer.items.length) debugLog(`FALLBACK (Grid): Removed ${oldLen - found.gridRenderer.items.length} items`);
  }
  if (found.gridContinuation?.items) {
      const oldLen = found.gridContinuation.items.length;
      filterItemsOptimized(found.gridContinuation.items, config, needsContentFiltering);
      if (DEBUG && oldLen !== found.gridContinuation.items.length) debugLog(`FALLBACK (Grid Continuation): Removed ${oldLen - found.gridContinuation.items.length} items`);
  }
  if (Array.isArray(found.entries)) {
      const oldLen = found.entries.length;
      filterItemsOptimized(found.entries, config, needsContentFiltering);
      if (DEBUG && oldLen !== found.entries.length) debugLog(`FALLBACK (Entries): Removed ${oldLen - found.entries.length} items`);
  }
  
  const actions = data.onResponseReceivedActions || data.onResponseReceivedEndpoints;
  processActions(actions, config, needsContentFiltering);
}

function processActions(actions, config, needsContentFiltering) {
  if (!Array.isArray(actions)) return;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.reloadContinuationItemsCommand?.continuationItems) {
      filterItemsOptimized(action.reloadContinuationItemsCommand.continuationItems, config, needsContentFiltering);
    }
    if (action.appendContinuationItemsAction?.continuationItems) {
      filterItemsOptimized(action.appendContinuationItemsAction.continuationItems, config, needsContentFiltering);
    }
  }
}

function getShelfTitleOptimized(shelf) {
  if (!shelf) return '';
  return shelf.title?.runs?.[0]?.text || shelf.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer?.title?.runs?.[0]?.text || '';
}

/**
 * Is this item a live stream?
 *
 * The badge lives at, from an item in a shelf's item list:
 *   lockupViewModel.contentImage.thumbnailViewModel
 *     .overlays[].thumbnailBottomOverlayViewModel
 *     .badges[].thumbnailBadgeViewModel.badgeStyle
 *
 * Both arrays are searched rather than indexed at [0]: a thumbnail carries
 * several overlays (duration, progress, badges) and their order is not
 * guaranteed, so hardcoding the first entry would miss the badge whenever
 * anything else is attached to the thumbnail.
 *
 * The older tileRenderer shape and a plain text check are kept as fallbacks so
 * this keeps working if the viewModel schema is swapped out again.
 */
function isLiveItem(item, removeLiveVideos) {
  if (!removeLiveVideos || !item) return false;

  const overlays = item.lockupViewModel?.contentImage?.thumbnailViewModel?.overlays;
  if (Array.isArray(overlays)) {
    for (let i = 0; i < overlays.length; i++) {
      const badges = overlays[i]?.thumbnailBottomOverlayViewModel?.badges;
      if (!Array.isArray(badges)) continue;
      for (let b = 0; b < badges.length; b++) {
        if (badges[b]?.thumbnailBadgeViewModel?.badgeStyle === YT_CONSTANTS.BADGE_STYLE_LIVE) {
          return true;
        }
      }
    }
  }

  // Fallback 1: the tileRenderer schema this app already handles elsewhere.
  const tileBadges = item.tileRenderer?.header?.tileHeaderRenderer?.thumbnailOverlays;
  if (Array.isArray(tileBadges)) {
    for (let i = 0; i < tileBadges.length; i++) {
      const style = tileBadges[i]?.thumbnailOverlayTimeStatusRenderer?.style;
      if (style === 'LIVE' || style === 'THUMBNAIL_OVERLAY_TIME_STATUS_RENDERER_STYLE_LIVE') return true;
    }
  }

  // Fallback 2: an explicit live badge anywhere on the item.
  if (item.tileRenderer?.contentType === 'TILE_CONTENT_TYPE_LIVE') return true;

  return false;
}

function isReelAd(item, enableAdBlock) {
  if (!enableAdBlock) return false;
  const endpoint = item.command?.reelWatchEndpoint;
  return endpoint?.adClientParams?.isAd === true || endpoint?.adClientParams?.isAd === 'true' || endpoint?.videoType === YT_CONSTANTS.VIDEO_TYPE_REEL_AD;
}

function hasAdRenderer(item, enableAdBlock) {
  return enableAdBlock && (item.adSlotRenderer || item.tvMastheadRenderer);
}

function hasGuestPromptRenderer(item, hideGuestPrompts) {
  return hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer);
}

function processSectionListOptimized(contents, config, needsContentFiltering, contextName = '') {
  if (!Array.isArray(contents) || contents.length === 0) return;
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, removeMostRelevant, hideGuestPrompts, enableLegacyEmojiFix } = config;
  const initialCount = contents.length;
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (item.shelfRenderer) {
      const shelf = item.shelfRenderer;
      if (removeGlobalShorts && shelf.tvhtml5ShelfRendererType === YT_CONSTANTS.SHELF_TYPE_SHORTS) keepItem = false;
      else if (removeGlobalShorts || removeTopLiveGames || removeMostRelevant) {
        const title = getShelfTitleOptimized(shelf);
        if (removeGlobalShorts && title === UI_STRINGS.SHORTS_TITLE) keepItem = false;
        else if (removeTopLiveGames && title === UI_STRINGS.TOP_LIVE_GAMES_TITLE) keepItem = false;
        else if (removeMostRelevant && title === UI_STRINGS.MOST_RELEVANT_TITLE) keepItem = false;
      }
      if (keepItem && shelf.content) {
        // skipEmoji: the `findAndProcessText(item, 20)` below walks this whole
        // shelf, nested items included, so doing it per-item here as well was
        // pure duplicate work.
        const horizItems = shelf.content.horizontalListRenderer?.items;
        const gridItems = shelf.content.gridRenderer?.items;
        if (horizItems) filterItemsOptimized(horizItems, config, needsContentFiltering, true);
        if (gridItems) filterItemsOptimized(gridItems, config, needsContentFiltering, true);

        // A shelf we emptied has to go with its items. Left in place it still
        // has a title and a content box, so the app renders the header plus a
        // <ytlr-ghost-surface> of skeleton tiles and waits forever for content
        // that was already removed - the "Live now" row of grey boxes.
        // Guarded on the lists having existed: a shelf whose content uses some
        // other renderer was never filtered here and must not be judged empty.
        if ((horizItems || gridItems) && !horizItems?.length && !gridItems?.length) {
          keepItem = false;
          if (DEBUG) debugLog(`${contextName ? contextName + ': ' : ''}Dropped emptied shelf "${getShelfTitleOptimized(shelf)}"`);
        }
      }
    } 
    else if (hasAdRenderer(item, enableAdBlock) || hasGuestPromptRenderer(item, hideGuestPrompts) || isReelAd(item, enableAdBlock)) {
      keepItem = false;
    }

    if (keepItem) {
      if (enableLegacyEmojiFix) findAndProcessText(item, 20);
      if (writeIdx !== i) contents[writeIdx] = item;
      writeIdx++;
    }
  }
  contents.length = writeIdx;
  
  if (DEBUG) {
    const removed = initialCount - writeIdx;
    if (removed > 0) debugLog(`${contextName ? contextName + ': ' : ''}Filtered ${removed} top-level items from ${initialCount}`);
  }
}

// skipEmoji: set when the caller is about to run its own findAndProcessText
// over an ancestor of these items. Without it every tile in a shelf was walked
// twice - once here and once again as part of the shelf's own walk - which on a
// 150 KB browse response meant ~10k redundant node visits per parse.
function filterItemsOptimized(items, config, needsContentFiltering, skipEmoji) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const { enableAdBlock, removeGlobalShorts, removeLiveVideos, hideGuestPrompts } = config;
  const enableLegacyEmojiFix = skipEmoji ? false : config.enableLegacyEmojiFix;
  if (!removeGlobalShorts && !removeLiveVideos && !needsContentFiltering) return items;

  let writeIdx = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    if (needsContentFiltering) {
      if (hasAdRenderer(item, enableAdBlock) || isReelAd(item, enableAdBlock) || hasGuestPromptRenderer(item, hideGuestPrompts)) keep = false;
      else if (hideGuestPrompts && item.gridButtonRenderer?.title?.runs?.[0]?.text === UI_STRINGS.GUEST_PROMPT_TEXT) keep = false;
    }

    if (keep && removeGlobalShorts) {
      const tile = item.tileRenderer;
      if (tile && (tile.style === YT_CONSTANTS.TILE_STYLE_SHORTS || tile.contentType === YT_CONSTANTS.CONTENT_TYPE_SHORTS || tile.onSelectCommand?.reelWatchEndpoint)) keep = false;
      else if (item.reelItemRenderer || item.contentType === YT_CONSTANTS.CONTENT_TYPE_SHORTS || item.onSelectCommand?.reelWatchEndpoint) keep = false;
    }

    if (keep && removeLiveVideos && isLiveItem(item, true)) keep = false;

    if (keep) {
      if (enableLegacyEmojiFix) findAndProcessText(item, 20);
      if (writeIdx !== i) items[writeIdx] = item;
      writeIdx++;
    }
  }
  items.length = writeIdx;
  return items;
}

function getByPath(obj, parts) {
  if (!parts) return undefined;
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function clearArrayIfExists(obj, key) {
  if (obj[key]?.length) { obj[key].length = 0; return 1; }
  return 0;
}

function removeEndcardsOptimized(data) {
  let cleared = 0;
  if (data.endscreen) {
      delete data.endscreen;
      cleared++;
  }
  if (data.playerResponse && data.playerResponse.endscreen) {
      delete data.playerResponse.endscreen;
      cleared++;
  }
  if (DEBUG && cleared > 0) debugLog('Cleaned Player Endcards');
}

function removePlayerAdsOptimized(data) {
  let cleared = 0;
  cleared += clearArrayIfExists(data, 'adPlacements'); 
  cleared += clearArrayIfExists(data, 'playerAds'); 
  cleared += clearArrayIfExists(data, 'adSlots');

  // Strip attestation and telemetry mismatches
  if (data.attestation) {
      delete data.attestation;
      cleared++;
      if (DEBUG) debugLog('Cleaned Player Attestation Challenge');
  }
  if (data.adBreakHeartbeatParams) {
      delete data.adBreakHeartbeatParams;
      cleared++;
      if (DEBUG) debugLog('Cleaned Ad Break Heartbeat');
  }
  if (data.playerResponse) {
    cleared += clearArrayIfExists(data.playerResponse, 'adPlacements'); cleared += clearArrayIfExists(data.playerResponse, 'playerAds'); cleared += clearArrayIfExists(data.playerResponse, 'adSlots');
  }
  if (DEBUG && cleared > 0) debugLog('Cleaned Player Ads/Placements');
}

function findObjects(haystack, needlesArray, maxDepth = 10) {
  if (!haystack || typeof haystack !== 'object' || maxDepth <= 0 || !needlesArray.length) return {};
  const results = {};
  let foundCount = 0;
  const targetCount = needlesArray.length;
  // Flat queue to reduce GC pressure: [obj, depth, obj, depth, ...]
  const queue = [haystack, 0];
  let idx = 0;

  while (idx < queue.length && foundCount < targetCount) {
    const currentObj = queue[idx++];
    const currentDepth = queue[idx++];
    
    if (currentDepth > maxDepth) continue;

    for (let i = 0; i < targetCount; i++) {
      const needle = needlesArray[i];
      if (!results[needle] && currentObj[needle] !== undefined) {
        results[needle] = currentObj[needle];
        foundCount++;
      }
    }
    if (foundCount === targetCount) break;

    const nextDepth = currentDepth + 1;
    for (const k in currentObj) {
      const val = currentObj[k];
      if (val && typeof val === 'object') {
        queue.push(val, nextDepth);
      }
    }
  }
  return results;
}

/**
 * Is the JSON.parse hook needed at all?
 *
 * It carries two independent things: the response filters (ads, Shorts, guest
 * prompts, endcards, trackingParams) and the legacy emoji rewrite. Ad Blocking
 * being off must not take the emoji fix down with it - on webOS 3 and 4 that is
 * what stops titles rendering as tofu boxes, and it has its own setting.
 */
export function parseHookRequired() {
  return !!(
    cfgSnapshot[CONFIG_KEYS.ADBLOCK] ||
    cfgSnapshot[CONFIG_KEYS.GUEST_PROMPTS] ||
    cfgSnapshot[CONFIG_KEYS.ENDCARDS] ||
    cfgEmojiFixEffective ||
    thumbnailHookRequired()
  );
}

/** Install or remove the JSON.parse hook to match the current settings. */
export function syncAdblockHook() {
  if (parseHookRequired()) initAdblock();
  else destroyAdblock();
}

export function initAdblock() {
  if (isHooked) return;
  if (DEBUG) console.info('[AdBlock] Initializing hybrid hook (Debug Mode: ' + DEBUG + ')');

  origParse = JSON.parse;
  // Assigned directly rather than wrapped in a forwarding closure: that
  // wrapper added a call frame to every JSON.parse in the app.
  JSON.parse = hookedParse;
  isHooked = true;
}

export function destroyAdblock() {
  if (!isHooked) return;
  if (DEBUG) console.info('[AdBlock] Restoring JSON.parse');
  
  JSON.parse = origParse;
  isHooked = false;
}

initAdblock();

if (cfgSnapshot[CONFIG_KEYS.TRACKING]) {
  try {
    initTrackingBlock();
  } catch (e) {
    console.warn('[AdBlock] Early tracking block install failed:', e.message);
  }
}