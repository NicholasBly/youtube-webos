import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';

const DEBUG = false;

function debugLog(msg, ...args) {
  if (DEBUG) console.log(`[AdBlock] ${msg}`, ...args);
}

let origParse = JSON.parse;
let isHooked = false;

let isShortsContext = false;
let bodyObserver = null;

function updateShortsContext() {
  if (document.body) {
    isShortsContext = document.body.classList.contains('WEB_PAGE_TYPE_SHORTS');
  }
}

function initBodyObserver() {
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', initBodyObserver);
    return;
  }
  
  updateShortsContext();

  bodyObserver = new MutationObserver((mutations) => {
    updateShortsContext();
  });

  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

let configCache = {
  enableAdBlock: true,
  removeGlobalShorts: false,
  removeTopLiveGames: false,
  hideGuestPrompts: false,
  lastUpdate: 0
};

const PATTERN_CACHE = {
  shorts: 'shorts',
  topLiveGames: 'top live games'
};

const SCHEMA_REGISTRY = {
  enabled: true, 
  
  typeSignatures: {
    SHORTS_SEQUENCE: {
      textPattern: '"reelWatchEndpoint"',
      matchFn: (data) => Array.isArray(data.entries) 
    },
    PLAYER: { 
      textPattern: '"streamingData"' 
    },
    GUEST: {
      textPattern: '"currentVideoThumbnail"' 
    },
    HOME_BROWSE: { 
      textPattern: '"tvSurfaceContentRenderer"',
      excludePattern: '"tvSecondaryNavRenderer"' 
    },
    BROWSE_TABS: { 
      textPattern: '"tvSecondaryNavRenderer"' 
    },
    SEARCH: {
      textPattern: '"sectionListRenderer"',
      excludePattern: '"tvSurfaceContentRenderer"'
    },
    CONTINUATION: { 
      textPattern: '"continuationContents"' 
    },
    ACTION: { 
      textPattern: '"onResponseReceivedActions"' 
    },
    IGNORED: {
      textPattern: '"logEntry"'
    }
  },
  
  paths: {
    SHORTS_SEQUENCE: {
        listPath: 'entries'
    },
    GUEST: {
      pivotPath: 'contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents'
    },
    HOME_BROWSE: {
      mainContent: 'contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents'
    },
    BROWSE_TABS: {
      tabsPath: 'contents.tvBrowseRenderer.content.tvSecondaryNavRenderer.sections.0.tvSecondaryNavSectionRenderer.tabs'
    },
    SEARCH: {
      mainContent: 'contents.sectionListRenderer.contents'
    },
    CONTINUATION: {
      sectionPath: 'continuationContents.sectionListContinuation.contents',
      gridPath: 'continuationContents.gridContinuation.items'
    }
  }
};

function updateConfigCache() {
  configCache = {
    enableAdBlock: configRead('enableAdBlock'),
    removeGlobalShorts: configRead('removeGlobalShorts'),
    removeTopLiveGames: configRead('removeTopLiveGames'),
    hideGuestPrompts: configRead('hideGuestSignInPrompts'),
    lastUpdate: Date.now()
  };
}

function getCachedConfig() {
  return configCache;
}

/**
 * Main JSON.parse hook
 */
function hookedParse(text, reviver) {
  let data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    return origParse.call(this, text, reviver);
  }
  
  if (!text || text.length < 500) return data;
   
  const config = getCachedConfig();
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts } = config;

  if (!enableAdBlock && !removeGlobalShorts && !removeTopLiveGames && !hideGuestPrompts) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const isAPIResponse = !!(
    data.responseContext ||
    data.playerResponse ||
    data.onResponseReceivedActions ||
    data.sectionListRenderer ||
    data.reloadContinuationItemsCommand ||
    data.entries 
  );

  if (!isAPIResponse || data.botguardData) {
    return data;
  }

  // const startTime = DEBUG ? performance.now() : 0;
  
  try {
    const responseType = detectResponseType(text, data);
    const needsContentFiltering = enableAdBlock || hideGuestPrompts;

    if (isShortsContext) {
        const IGNORE_ON_SHORTS = ['SEARCH', 'PLAYER', 'ACTION'];
        if (responseType && IGNORE_ON_SHORTS.includes(responseType)) {
             return data;
        }
    }

    if (responseType === 'IGNORED') {
       return data;
    }
    else if (responseType && SCHEMA_REGISTRY.paths[responseType]) {
      if (DEBUG) debugLog(`Schema Match: [${responseType}] - Payload size: ${text.length} chars`);
      applySchemaFilters(data, responseType, config, needsContentFiltering);
    } 
    else if (responseType === 'ACTION' || responseType === 'PLAYER' || responseType === 'GUEST') {
      if (DEBUG) debugLog(`Schema Match: [${responseType}] - Payload size: ${text.length} chars`);
      applySchemaFilters(data, responseType, config, needsContentFiltering);
    } 
    else {
      if(text.length > 10000) { 
        if (DEBUG) logSchemaMiss(data, text.length);
        if (!Array.isArray(data)) {
            applyFallbackFilters(data, config, needsContentFiltering);
        }
      }
    }
  } catch (e) {
    console.error('[AdBlock] Error during filtering:', e);
  }

  // if (DEBUG) {
    // const duration = (performance.now() - startTime).toFixed(2);
    // if (duration > 1.0) debugLog(`Filtering completed in ${duration}ms`);
  // }

  return data;
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
  } catch (e) {
    debugLog(`MISS (Fallback used) | Size: ${textLength} | Error analyzing structure`);
  }
}

function detectResponseType(text, data) {
  if (typeof text !== 'string') return null;
  const types = SCHEMA_REGISTRY.typeSignatures;
  
  for (const type in types) {
    const config = types[type];
    if (text.indexOf(config.textPattern) !== -1) {
      if (config.excludePattern && text.indexOf(config.excludePattern) !== -1) {
        continue;
      }
      if (config.matchFn && !config.matchFn(data)) {
          continue;
      }
      return type;
    }
  }
  return null;
}

function applySchemaFilters(data, responseType, config, needsContentFiltering) {
  const schema = SCHEMA_REGISTRY.paths[responseType];
  
  switch (responseType) {
    case 'SHORTS_SEQUENCE':
        if (config.enableAdBlock && schema && schema.listPath) {
            const entries = data[schema.listPath];
            if (Array.isArray(entries)) {
                const oldLen = entries.length;
                data[schema.listPath] = filterItemsOptimized(entries, config, needsContentFiltering);
                if (DEBUG && data[schema.listPath].length !== oldLen) {
                    debugLog(`SHORTS_SEQUENCE: Removed ${oldLen - data[schema.listPath].length} items`);
                }
            }
        }
        break;

    case 'GUEST':
        if (config.hideGuestPrompts && schema && schema.pivotPath) {
            const pivot = getByPath(data, schema.pivotPath);
            if (Array.isArray(pivot)) {
                processSectionListOptimized(pivot, config, needsContentFiltering, 'GUEST');
            }
        }
        break;

    case 'HOME_BROWSE':
      if (schema && schema.mainContent) {
        let contents = getByPath(data, schema.mainContent);
        
        if (!contents) {
            const sectionList = findFirstObject(data, 'sectionListRenderer', 15);
            if (sectionList && sectionList.contents) {
                contents = sectionList.contents;
                if (DEBUG) debugLog('HOME_BROWSE: Using fallback search');
            }
        }

        if (Array.isArray(contents)) {
          processSectionListOptimized(contents, config, needsContentFiltering, 'HOME_BROWSE');
        }
      }
      break;

    case 'BROWSE_TABS':
      if (schema && schema.tabsPath) {
        const tabs = getByPath(data, schema.tabsPath);
        if (Array.isArray(tabs)) {
          for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const gridContents = 
                tab.tabRenderer?.content?.sectionListRenderer?.contents ||
                tab.tabRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
            if (Array.isArray(gridContents)) {
              processSectionListOptimized(gridContents, config, needsContentFiltering, 'BROWSE_TAB_GENERIC');
            }
          }
        }
      }
      break;

    case 'SEARCH':
      if (schema && schema.mainContent) {
        let contents = getByPath(data, schema.mainContent);
        
        if (!contents) {
             const sectionList = findFirstObject(data, 'sectionListRenderer', 15);
             if (sectionList && sectionList.contents) {
                 contents = sectionList.contents;
                 if (DEBUG) debugLog('SEARCH: Using fallback search');
             }
        }

        if (Array.isArray(contents)) {
          processSectionListOptimized(contents, config, needsContentFiltering, 'SEARCH');
        }
      }
      break;

    case 'CONTINUATION':
      if (schema) {
        if (schema.sectionPath) {
          const secList = getByPath(data, schema.sectionPath);
          if (Array.isArray(secList)) {
            processSectionListOptimized(secList, config, needsContentFiltering, 'CONTINUATION (Section)');
          }
        }
        if (schema.gridPath) {
          const gridItems = getByPath(data, schema.gridPath);
          if (Array.isArray(gridItems)) {
            const oldLen = gridItems.length;
            const filtered = filterItemsOptimized(gridItems, config, needsContentFiltering);
            setByPath(data, schema.gridPath, filtered);
            if (DEBUG && oldLen !== filtered.length) {
              debugLog(`CONTINUATION (Grid): Removed ${oldLen - filtered.length} items`);
            }
          }
        }
      }
      break;

    case 'ACTION':
      if (Array.isArray(data.onResponseReceivedActions)) {
        for (let i = 0; i < data.onResponseReceivedActions.length; i++) {
          const action = data.onResponseReceivedActions[i];
          
          if (action.reloadContinuationItemsCommand?.continuationItems) {
            action.reloadContinuationItemsCommand.continuationItems = filterItemsOptimized(
              action.reloadContinuationItemsCommand.continuationItems,
              config,
              needsContentFiltering
            );
          }
          
          if (action.appendContinuationItemsAction?.continuationItems) {
            action.appendContinuationItemsAction.continuationItems = filterItemsOptimized(
              action.appendContinuationItemsAction.continuationItems,
              config,
              needsContentFiltering
            );
          }
        }
      }
      break;

    case 'PLAYER':
      if (config.enableAdBlock) {
        removePlayerAdsOptimized(data);
      }
      break;

    default:
      break;
  }
}

function applyFallbackFilters(data, config, needsContentFiltering) {
  if (config.enableAdBlock) {
    removePlayerAdsOptimized(data);
  }

  const foundRenderer = findFirstObject(data, 'sectionListRenderer', 10);
  if (foundRenderer?.contents) {
    if (Array.isArray(foundRenderer.contents)) {
      processSectionListOptimized(foundRenderer.contents, config, needsContentFiltering, 'Fallback sectionListRenderer');
    }
  }

  const gridRenderer = findFirstObject(data, 'gridRenderer', 10);
  if (gridRenderer?.items) {
    gridRenderer.items = filterItemsOptimized(gridRenderer.items, config, needsContentFiltering);
  }

  const gridContinuation = findFirstObject(data, 'gridContinuation', 10);
  if (gridContinuation?.items) {
    gridContinuation.items = filterItemsOptimized(gridContinuation.items, config, needsContentFiltering);
  }

  if (Array.isArray(data.onResponseReceivedActions)) {
    for (let i = 0; i < data.onResponseReceivedActions.length; i++) {
      const action = data.onResponseReceivedActions[i];
      
      if (action.reloadContinuationItemsCommand?.continuationItems) {
        action.reloadContinuationItemsCommand.continuationItems = filterItemsOptimized(
          action.reloadContinuationItemsCommand.continuationItems,
          config,
          needsContentFiltering
        );
      }
      
      if (action.appendContinuationItemsAction?.continuationItems) {
        action.appendContinuationItemsAction.continuationItems = filterItemsOptimized(
          action.appendContinuationItemsAction.continuationItems,
          config,
          needsContentFiltering
        );
      }
    }
  }
}

// ============================================================================
// CORE FILTERING LOGIC
// ============================================================================

function getShelfTitleOptimized(shelf) {
  if (!shelf) return '';
  let text = shelf.title?.runs?.[0]?.text;
  if (text) return text.toLowerCase();
  text = shelf.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer?.title?.runs?.[0]?.text;
  return text ? text.toLowerCase() : '';
}

function isReelAd(item, enableAdBlock) {
  if (!enableAdBlock) return false;
  const endpoint = item.command?.reelWatchEndpoint;
  if (!endpoint) return false;
  
  return endpoint.adClientParams?.isAd === true || 
         endpoint.adClientParams?.isAd === 'true' ||
         endpoint.videoType === 'REEL_VIDEO_TYPE_AD';
}

function hasAdRenderer(item, enableAdBlock) {
  return enableAdBlock && (item.adSlotRenderer || item.tvMastheadRenderer);
}

function hasGuestPromptRenderer(item, hideGuestPrompts) {
  return hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer);
}

function processSectionListOptimized(contents, config, needsContentFiltering, contextName = '') {
  if (!Array.isArray(contents) || contents.length === 0) return;

  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts } = config;
  const initialCount = contents.length;
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (item.shelfRenderer) {
      const shelf = item.shelfRenderer;
      
      if (removeGlobalShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
        keepItem = false;
      } else if (removeGlobalShorts || removeTopLiveGames) {
        const title = getShelfTitleOptimized(shelf);
        if (removeGlobalShorts && title === PATTERN_CACHE.shorts) keepItem = false;
        else if (removeTopLiveGames && title === PATTERN_CACHE.topLiveGames) keepItem = false;
      }
      
      if (keepItem && shelf.content) {
        const hList = shelf.content.horizontalListRenderer;
        if (hList?.items) {
          hList.items = filterItemsOptimized(hList.items, config, needsContentFiltering);
        }
        
        const gList = shelf.content.gridRenderer;
        if (gList?.items) {
          gList.items = filterItemsOptimized(gList.items, config, needsContentFiltering);
        }
      }
    } 
    else if (hasAdRenderer(item, enableAdBlock)) {
      keepItem = false;
    } 
    else if (hasGuestPromptRenderer(item, hideGuestPrompts)) {
      keepItem = false;
    }
    
    if (keepItem && isReelAd(item, enableAdBlock)) {
      keepItem = false;
    }

    if (keepItem) {
      if (writeIdx !== i) contents[writeIdx] = item;
      writeIdx++;
    }
  }

  contents.length = writeIdx;
  
  if (DEBUG) {
    const removed = initialCount - writeIdx;
    if (removed > 0) {
      debugLog(`${contextName}: Filtered ${removed} top-level items from ${initialCount}`);
    }
  }
}

function filterItemsOptimized(items, config, needsContentFiltering) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const { enableAdBlock, removeGlobalShorts, hideGuestPrompts } = config;
  if (needsContentFiltering === undefined) needsContentFiltering = enableAdBlock || hideGuestPrompts;
  if (!removeGlobalShorts && !needsContentFiltering) return items;

  const result = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    if (needsContentFiltering) {
      if (hasAdRenderer(item, enableAdBlock) || isReelAd(item, enableAdBlock)) {
        continue;
      }
      if (hasGuestPromptRenderer(item, hideGuestPrompts)) {
        continue;
      }
    }

    if (keep && removeGlobalShorts) {
      const tile = item.tileRenderer;
      if (tile) {
        if (tile.style === 'TILE_STYLE_YTLR_SHORTS' ||
            tile.contentType === 'TILE_CONTENT_TYPE_SHORTS' ||
            tile.onSelectCommand?.reelWatchEndpoint) {
          keep = false;
          continue;
        }
      } 
      else if (item.reelItemRenderer ||
                 item.contentType === 'TILE_CONTENT_TYPE_SHORTS' ||
                 item.onSelectCommand?.reelWatchEndpoint) {
        keep = false;
        continue;
      }
    }

    if (keep) result.push(item);
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const pathCache = new Map();
const PATH_CACHE_LIMIT = 20;

function parsePath(path) {
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');
    if (pathCache.size < PATH_CACHE_LIMIT) pathCache.set(path, parts);
  }
  return parts;
}

function getByPath(obj, path) {
  if (!path) return undefined;
  const parts = parsePath(path);
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function setByPath(obj, path, value) {
  if (!path) return;
  const parts = parsePath(path);
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) return;
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function clearArrayIfExists(obj, key) {
  if (obj[key]?.length) {
    obj[key].length = 0;
    return 1;
  }
  return 0;
}

function removePlayerAdsOptimized(data) {
  let cleared = 0;
  cleared += clearArrayIfExists(data, 'adPlacements');
  cleared += clearArrayIfExists(data, 'playerAds');
  cleared += clearArrayIfExists(data, 'adSlots');
  
  const pr = data.playerResponse;
  if (pr) {
    cleared += clearArrayIfExists(pr, 'adPlacements');
    cleared += clearArrayIfExists(pr, 'playerAds');
    cleared += clearArrayIfExists(pr, 'adSlots');
  }
  if (DEBUG && cleared > 0) debugLog('Cleaned Player Ads/Placements');
}

function findFirstObject(haystack, needle, maxDepth = 10) {
  if (!haystack || typeof haystack !== 'object' || maxDepth <= 0) return null;
  if (haystack[needle]) return haystack[needle];
  for (const key in haystack) {
    if (haystack.hasOwnProperty(key) && typeof haystack[key] === 'object') {
      const result = findFirstObject(haystack[key], needle, maxDepth - 1);
      if (result) return result;
    }
  }
  return null;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initAdblock() {
  if (isHooked) return;
  console.info('[AdBlock] Initializing hybrid hook (Debug Mode: ' + DEBUG + ')');
  
  updateConfigCache();
  initBodyObserver();
  
  origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    return hookedParse.call(this, text, reviver);
  };
  
  isHooked = true;

  configAddChangeListener('enableAdBlock', updateConfigCache);
  configAddChangeListener('removeGlobalShorts', updateConfigCache);
  configAddChangeListener('removeTopLiveGames', updateConfigCache);
  configAddChangeListener('hideGuestSignInPrompts', updateConfigCache);
}

export function destroyAdblock() {
  if (!isHooked) return;
  console.info('[AdBlock] Restoring JSON.parse');
  
  JSON.parse = origParse;
  isHooked = false;

  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }

  configRemoveChangeListener('enableAdBlock', updateConfigCache);
  configRemoveChangeListener('removeGlobalShorts', updateConfigCache);
  configRemoveChangeListener('removeTopLiveGames', updateConfigCache);
  configRemoveChangeListener('hideGuestSignInPrompts', updateConfigCache);
}

initAdblock();