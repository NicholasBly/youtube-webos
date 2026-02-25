import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { isShortsPage } from './utils';
import { isLegacyWebOS } from './webos-utils'; 

const DEBUG = false;
const EMOJI_DEBUG = false; 
const FORCE_FALLBACK = false;

const EMOJI_RE = /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
const EMOJI_RE_CAP = new RegExp(`(${EMOJI_RE.source})`, 'g');
const CLEAN_TEXT_RE = /[\u2060\uFEFF]/g;

function debugLog(msg, ...args) {
  if (DEBUG) console.log(`[AdBlock] ${msg}`, ...args);
}

let origParse = JSON.parse;
let isHooked = false;

let configCache = {
  enableAdBlock: true,
  removeGlobalShorts: false,
  removeTopLiveGames: false,
  hideGuestPrompts: false,
  enableLegacyEmojiFix: false,
  lastUpdate: 0
};

const PATTERN_CACHE = {
  shorts: 'Shorts',
  topLiveGames: 'Top live games'
};

const IGNORE_ON_SHORTS = ['SEARCH', 'PLAYER', 'ACTION'];

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

function updateConfigCache() {
  configCache = {
    enableAdBlock: configRead('enableAdBlock'),
    removeGlobalShorts: configRead('removeGlobalShorts'),
    removeTopLiveGames: configRead('removeTopLiveGames'),
    hideGuestPrompts: configRead('hideGuestSignInPrompts'),
    enableLegacyEmojiFix: configRead('enableLegacyEmojiFix') && isLegacyWebOS(),
    lastUpdate: Date.now()
  };
}

function getCachedConfig() {
  return configCache;
}

function processEmojiString(str) {
  if (typeof str !== 'string' || !str) return str;
  let cleanedStr = str.replace(CLEAN_TEXT_RE, '');
  if (cleanedStr.includes('\u200B') && cleanedStr.includes('\u200C')) return cleanedStr;

  const replaced = cleanedStr.replace(new RegExp(EMOJI_RE.source, 'g'), '\u200B$&\u200C');
  if (EMOJI_DEBUG && replaced !== str) {
    console.log(`[AdBlock-Emoji] Wrapped emoji in string: "${str}"`);
  }
  return replaced;
}

function splitIntoRuns(text, originalRun = {}) {
    if (text.includes('\u200B') || text.includes('\u200C')) return null;

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

function findAndProcessText(obj, maxDepth = 40, currentDepth = 0) {
  if (!obj || typeof obj !== 'object' || currentDepth > maxDepth) return;
  
  if (typeof obj.simpleText === 'string') {
    const runs = splitIntoRuns(obj.simpleText);
    if (runs) {
        obj.runs = runs;
        delete obj.simpleText; 
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
  
  if (Array.isArray(obj.runs)) {
    let newRuns = [];
    let changed = false;
    for (let i = 0; i < obj.runs.length; i++) {
      let run = obj.runs[i];
      if (run && typeof run.text === 'string') {
          const split = splitIntoRuns(run.text, run);
          if (split) {
              newRuns.push(...split);
              changed = true;
          } else {
              run.text = run.text.replace(CLEAN_TEXT_RE, '');
              newRuns.push(run);
          }
      } else {
          newRuns.push(run);
      }
    }
    if (changed) obj.runs = newRuns;
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        findAndProcessText(val, maxDepth, currentDepth + 1);
      }
    }
  }
}

function hookedParse(text, reviver) {
  const data = origParse.call(this, text, reviver);
  if (!text || text.length < 500) return data;
   
  const config = getCachedConfig();
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts, enableLegacyEmojiFix } = config;

  if (!enableAdBlock && !removeGlobalShorts && !removeTopLiveGames && !hideGuestPrompts && !enableLegacyEmojiFix) return data;
  if (!data || typeof data !== 'object') return data;
  
  const isAPIResponse = !!(data.responseContext || data.playerResponse || data.onResponseReceivedActions || data.onResponseReceivedEndpoints || data.frameworkUpdates || data.sectionListRenderer || data.entries || data.continuationContents);
  if (!isAPIResponse || data.botguardData) return data;

  try {
    const responseType = detectResponseType(data);
    const needsContentFiltering = enableAdBlock || hideGuestPrompts || enableLegacyEmojiFix;

    if (isShortsPage() && responseType && IGNORE_ON_SHORTS.includes(responseType)) return data;

    if (FORCE_FALLBACK) {
      if (!Array.isArray(data)) applyFallbackFilters(data, config, needsContentFiltering);
    } else if (responseType && SCHEMA_REGISTRY.paths[responseType]) {
      applySchemaFilters(data, responseType, config, needsContentFiltering);
    } else if (responseType === 'ACTION' || responseType === 'PLAYER') {
      applySchemaFilters(data, responseType, config, needsContentFiltering);
    } else {
      if(text.length > 10000 && !Array.isArray(data)) applyFallbackFilters(data, config, needsContentFiltering);
    }
    
    if (config.enableLegacyEmojiFix && data.frameworkUpdates) {
        findAndProcessText(data.frameworkUpdates, 50);
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
  const schema = SCHEMA_REGISTRY.paths[responseType];
  switch (responseType) {
    case 'SHORTS_SEQUENCE':
        if (config.enableAdBlock && schema?.listPath) {
            const entries = getByPath(data, schema.listPath);
            if (Array.isArray(entries)) filterItemsOptimized(entries, config, needsContentFiltering);
        }
        break;
    case 'HOME_BROWSE':
      if (schema?.mainContent) {
        let contents = getByPath(data, schema.mainContent) || findObjects(data, ['sectionListRenderer'], 8).sectionListRenderer?.contents;
        if (Array.isArray(contents)) processSectionListOptimized(contents, config, needsContentFiltering);
      }
      break;
    case 'BROWSE_TABS':
      if (schema?.tabsPath) {
        const tabs = getByPath(data, schema.tabsPath);
        if (Array.isArray(tabs)) {
          for (let i = 0; i < tabs.length; i++) {
            const gridContents = tabs[i].tabRenderer?.content?.sectionListRenderer?.contents || tabs[i].tabRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
            if (Array.isArray(gridContents)) processSectionListOptimized(gridContents, config, needsContentFiltering);
          }
        }
      }
      break;
    case 'SEARCH':
      if (schema?.mainContent) {
        let contents = getByPath(data, schema.mainContent) || findObjects(data, ['sectionListRenderer'], 8).sectionListRenderer?.contents;
        if (Array.isArray(contents)) processSectionListOptimized(contents, config, needsContentFiltering);
      }
      break;
    case 'CONTINUATION':
      if (schema?.sectionPath) {
        const secList = getByPath(data, schema.sectionPath);
        if (Array.isArray(secList)) processSectionListOptimized(secList, config, needsContentFiltering);
      }
      if (schema?.tvSurfacePath) {
        const tvList = getByPath(data, schema.tvSurfacePath);
        if (Array.isArray(tvList)) processSectionListOptimized(tvList, config, needsContentFiltering);
      }
      if (schema?.gridPath) {
        const gridItems = getByPath(data, schema.gridPath);
        if (Array.isArray(gridItems)) filterItemsOptimized(gridItems, config, needsContentFiltering);
      }
      if (schema?.horizontalPath) {
        const horizItems = getByPath(data, schema.horizontalPath);
        if (Array.isArray(horizItems)) filterItemsOptimized(horizItems, config, needsContentFiltering);
      }
      if (config.enableLegacyEmojiFix && data.continuationContents) {
          findAndProcessText(data.continuationContents, 50);
      }
      break;
    case 'ACTION':
      const actions = data.onResponseReceivedActions || data.onResponseReceivedEndpoints;
      if (Array.isArray(actions)) {
        processActions(actions, config, needsContentFiltering);
        if (config.enableLegacyEmojiFix) {
            findAndProcessText(actions, 50);
        }
      }
      break;
    case 'PLAYER':
    case 'NEXT':
      if (config.enableAdBlock) {
        if (responseType === 'PLAYER') removePlayerAdsOptimized(data);
        let overlay = getByPath(data, schema?.overlayPath) || findObjects(data, ['playerOverlayRenderer'], 8).playerOverlayRenderer;
        if (overlay?.timelyActionRenderers) delete overlay.timelyActionRenderers;
      }
      if (config.hideGuestPrompts) {
         let pivotContents = getByPath(data, schema?.pivotPath) || findObjects(data, ['pivot'], 8).pivot?.sectionListRenderer?.contents;
         if (Array.isArray(pivotContents)) processSectionListOptimized(pivotContents, config, needsContentFiltering);
      }
      if (config.enableLegacyEmojiFix) {
        if (responseType === 'NEXT') {
          findAndProcessText(getByPath(data, ['contents', 'singleColumnWatchNextResults']));
          findAndProcessText(getByPath(data, ['playerOverlays']));
          findAndProcessText(getByPath(data, ['engagementPanels']), 40); 
        } else if (responseType === 'PLAYER') {
          findAndProcessText(getByPath(data, ['videoDetails']));
        }
      }
      break;
  }
}

function applyFallbackFilters(data, config, needsContentFiltering) {
  if (config.enableAdBlock) removePlayerAdsOptimized(data);
  const needles = ['playerOverlayRenderer', 'pivot', 'sectionListRenderer', 'gridRenderer', 'gridContinuation', 'sectionListContinuation', 'entries'];
  const found = findObjects(data, needles, 10);
  if (config.enableAdBlock && found.playerOverlayRenderer?.timelyActionRenderers) delete found.playerOverlayRenderer.timelyActionRenderers;
  if (Array.isArray(found.pivot?.sectionListRenderer?.contents)) processSectionListOptimized(found.pivot.sectionListRenderer.contents, config, needsContentFiltering);
  if (Array.isArray(found.sectionListRenderer?.contents)) processSectionListOptimized(found.sectionListRenderer.contents, config, needsContentFiltering);
  if (Array.isArray(found.sectionListContinuation?.contents)) processSectionListOptimized(found.sectionListContinuation.contents, config, needsContentFiltering);
  if (found.gridRenderer?.items) filterItemsOptimized(found.gridRenderer.items, config, needsContentFiltering);
  if (found.gridContinuation?.items) filterItemsOptimized(found.gridContinuation.items, config, needsContentFiltering);
  if (Array.isArray(found.entries)) filterItemsOptimized(found.entries, config, needsContentFiltering);
  
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

function isReelAd(item, enableAdBlock) {
  if (!enableAdBlock) return false;
  const endpoint = item.command?.reelWatchEndpoint;
  return endpoint?.adClientParams?.isAd === true || endpoint?.adClientParams?.isAd === 'true' || endpoint?.videoType === 'REEL_VIDEO_TYPE_AD';
}

function hasAdRenderer(item, enableAdBlock) {
  return enableAdBlock && (item.adSlotRenderer || item.tvMastheadRenderer);
}

function hasGuestPromptRenderer(item, hideGuestPrompts) {
  return hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer);
}

function processSectionListOptimized(contents, config, needsContentFiltering) {
  if (!Array.isArray(contents) || contents.length === 0) return;
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts, enableLegacyEmojiFix } = config;
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (item.shelfRenderer) {
      const shelf = item.shelfRenderer;
      if (removeGlobalShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') keepItem = false;
      else if (removeGlobalShorts || removeTopLiveGames) {
        const title = getShelfTitleOptimized(shelf);
        if (removeGlobalShorts && title === PATTERN_CACHE.shorts) keepItem = false;
        else if (removeTopLiveGames && title === PATTERN_CACHE.topLiveGames) keepItem = false;
      }
      if (keepItem && shelf.content) {
        if (shelf.content.horizontalListRenderer?.items) filterItemsOptimized(shelf.content.horizontalListRenderer.items, config, needsContentFiltering);
        if (shelf.content.gridRenderer?.items) filterItemsOptimized(shelf.content.gridRenderer.items, config, needsContentFiltering);
      }
    } 
    else if (hasAdRenderer(item, enableAdBlock) || hasGuestPromptRenderer(item, hideGuestPrompts) || isReelAd(item, enableAdBlock)) {
      keepItem = false;
    }

    if (keepItem) {
      if (enableLegacyEmojiFix) findAndProcessText(item);
      if (writeIdx !== i) contents[writeIdx] = item;
      writeIdx++;
    }
  }
  contents.length = writeIdx;
}

function filterItemsOptimized(items, config, needsContentFiltering) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const { enableAdBlock, removeGlobalShorts, hideGuestPrompts, enableLegacyEmojiFix } = config;
  if (!removeGlobalShorts && !needsContentFiltering) return items;

  let writeIdx = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    if (needsContentFiltering) {
      if (hasAdRenderer(item, enableAdBlock) || isReelAd(item, enableAdBlock) || hasGuestPromptRenderer(item, hideGuestPrompts)) keep = false;
      else if (hideGuestPrompts && item.gridButtonRenderer?.title?.runs?.[0]?.text === 'Sign in for better recommendations') keep = false;
    }

    if (keep && removeGlobalShorts) {
      const tile = item.tileRenderer;
      if (tile && (tile.style === 'TILE_STYLE_YTLR_SHORTS' || tile.contentType === 'TILE_CONTENT_TYPE_SHORTS' || tile.onSelectCommand?.reelWatchEndpoint)) keep = false;
      else if (item.reelItemRenderer || item.contentType === 'TILE_CONTENT_TYPE_SHORTS' || item.onSelectCommand?.reelWatchEndpoint) keep = false;
    }

    if (keep) {
      if (enableLegacyEmojiFix) findAndProcessText(item);
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

function removePlayerAdsOptimized(data) {
  clearArrayIfExists(data, 'adPlacements'); clearArrayIfExists(data, 'playerAds'); clearArrayIfExists(data, 'adSlots');
  if (data.playerResponse) {
    clearArrayIfExists(data.playerResponse, 'adPlacements'); clearArrayIfExists(data.playerResponse, 'playerAds'); clearArrayIfExists(data.playerResponse, 'adSlots');
  }
}

function findObjects(haystack, needlesArray, maxDepth = 10) {
  if (!haystack || typeof haystack !== 'object' || maxDepth <= 0 || !needlesArray.length) return {};
  const results = {};
  let foundCount = 0;
  const targetCount = needlesArray.length;
  const queue = [{ obj: haystack, depth: 0 }];
  let idx = 0;

  while (idx < queue.length && foundCount < targetCount) {
    const current = queue[idx++];
    if (current.depth > maxDepth) continue;

    for (let i = 0; i < targetCount; i++) {
      const needle = needlesArray[i];
      if (!results[needle] && current.obj[needle] !== undefined) {
        results[needle] = current.obj[needle];
        foundCount++;
      }
    }
    if (foundCount === targetCount) break;

    const keys = Object.keys(current.obj);
    for (let i = 0; i < keys.length; i++) {
      if (current.obj[keys[i]] && typeof current.obj[keys[i]] === 'object') {
        queue.push({ obj: current.obj[keys[i]], depth: current.depth + 1 });
      }
    }
  }
  return results;
}

export function initAdblock() {
  if (isHooked) return;
  updateConfigCache();
  origParse = JSON.parse;
  JSON.parse = function (text, reviver) { return hookedParse.call(this, text, reviver); };
  isHooked = true;
  configAddChangeListener('enableAdBlock', updateConfigCache);
  configAddChangeListener('removeGlobalShorts', updateConfigCache);
  configAddChangeListener('removeTopLiveGames', updateConfigCache);
  configAddChangeListener('hideGuestSignInPrompts', updateConfigCache);
  configAddChangeListener('enableLegacyEmojiFix', updateConfigCache);
}

export function destroyAdblock() {
  if (!isHooked) return;
  JSON.parse = origParse;
  isHooked = false;
  configRemoveChangeListener('enableAdBlock', updateConfigCache);
  configRemoveChangeListener('removeGlobalShorts', updateConfigCache);
  configRemoveChangeListener('removeTopLiveGames', updateConfigCache);
  configRemoveChangeListener('hideGuestSignInPrompts', updateConfigCache);
  configRemoveChangeListener('enableLegacyEmojiFix', updateConfigCache);
}

initAdblock();