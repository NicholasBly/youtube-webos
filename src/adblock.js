import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';

// ============================================================================
// DEBUG CONFIGURATION
// ============================================================================
const DEBUG = true;

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
  lastUpdate: 0
};

const PATTERN_CACHE = {
  shorts: 'shorts',
  topLiveGames: 'top live games'
};

const SCHEMA_REGISTRY = {
  enabled: true, 
  
  typeSignatures: {
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
    // Explicitly ignore common logging/heartbeat packets to silence debug noise
    IGNORED: {
      textPattern: '"logEntry"'
    }
  },
  
  paths: {
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
  // 1. Native Parse
  let data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    return origParse.call(this, text, reviver);
  }

  // 2. Early exit for non-objects
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const isAPIResponse = !!(
    data.responseContext ||
    data.playerResponse ||
    data.onResponseReceivedActions ||
    data.sectionListRenderer ||
    data.reloadContinuationItemsCommand
  );

  if (!isAPIResponse) {
    return data;
  }

  // 3. Get Config
  const config = getCachedConfig();
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts } = config;

  if (!enableAdBlock && !removeGlobalShorts && !removeTopLiveGames && !hideGuestPrompts) {
    return data;
  }

  // 4. Apply Filters with Debug Timing
  const startTime = DEBUG ? performance.now() : 0;
  
  try {
    const responseType = detectResponseTypeFromText(text);
    const needsContentFiltering = enableAdBlock || hideGuestPrompts;

    if (responseType === 'IGNORED') {
       // Do nothing, just skip
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
      // Fallback & Miss Analysis
	  if(text.length > 10000) { // indicates real page refresh
		if (DEBUG) logSchemaMiss(data, text.length);
		if (!Array.isArray(data)) {
            applyFallbackFilters(data, config, needsContentFiltering);
        }
	  }
    }
  } catch (e) {
    console.error('[AdBlock] Error during filtering:', e);
  }

  if (DEBUG) {
    const duration = (performance.now() - startTime).toFixed(2);
    if (duration > 1.0) debugLog(`Filtering completed in ${duration}ms`);
  }

  return data;
}

/**
 * Analyzes missed payloads to help the user identify new schemas
 */
function logSchemaMiss(data, textLength) {
  try {
    let info = '';
    const keys = Array.isArray(data) ? '[Array]' : Object.keys(data);
    
    // If it's small, show the whole thing so we can see what it is
    if (textLength < 1000) {
      info = `Content: ${JSON.stringify(data)}`;
    } else {
      // If it's big, show the keys so we can find a signature
      info = `Top-Level Keys: [${Array.isArray(keys) ? keys.join(', ') : 'Array'}]`;
    }

    debugLog(`MISS (Fallback used) | Size: ${textLength} | ${info}`);
  } catch (e) {
    debugLog(`MISS (Fallback used) | Size: ${textLength} | Error analyzing structure`);
  }
}

function detectResponseTypeFromText(text) {
  if (typeof text !== 'string') return null;
  const types = SCHEMA_REGISTRY.typeSignatures;
  
  for (const type in types) {
    const config = types[type];
    if (text.indexOf(config.textPattern) !== -1) {
      if (config.excludePattern && text.indexOf(config.excludePattern) !== -1) {
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
    case 'PLAYER':
      if (config.enableAdBlock) removePlayerAdsOptimized(data);
	  break;
	  
	  case 'GUEST':
	  if (config.hideGuestPrompts) {
          let pivotContents = schema && schema.pivotPath ? getByPath(data, schema.pivotPath) : null;
          
          // Fallback to deep search if path not found
          if (!pivotContents) {
              const sectionList = findFirstObject(data, 'sectionListRenderer', 15);
              if (sectionList && sectionList.contents) {
                  pivotContents = sectionList.contents;
                  if (DEBUG) debugLog('GUEST: Using fallback search (schema path failed)');
              }
          }
          
          if (pivotContents && Array.isArray(pivotContents)) {
              let writeIdx = 0;
              for (let i = 0; i < pivotContents.length; i++) {
                  if (pivotContents[i].alertWithActionsRenderer) {
                      if (DEBUG) debugLog('GUEST: Removed alertWithActionsRenderer');
                      continue;
                  }
                  if (writeIdx !== i) pivotContents[writeIdx] = pivotContents[i];
                  writeIdx++;
              }
              pivotContents.length = writeIdx;
          }
      }
      break;
      
    case 'HOME_BROWSE':
      let contents = getByPath(data, schema.mainContent);
      if (!contents) {
          const sectionList = findFirstObject(data, 'sectionListRenderer', 15);
          if (sectionList && sectionList.contents) {
              contents = sectionList.contents;
              if (DEBUG) debugLog('HOME_BROWSE: Using fallback search');
          }
      }
      if (contents) processSectionListOptimized(contents, config, needsContentFiltering, 'HOME_BROWSE');
      break;

    case 'SEARCH':
      let searchContents = getByPath(data, schema.mainContent);
      if (!searchContents) {
          const sectionList = findFirstObject(data, 'sectionListRenderer', 15);
          if (sectionList && sectionList.contents) {
              searchContents = sectionList.contents;
              if (DEBUG) debugLog('SEARCH: Using fallback search');
          }
      }
      if (searchContents) processSectionListOptimized(searchContents, config, needsContentFiltering, 'SEARCH');
      break;

    case 'BROWSE_TABS':
      const tabs = getByPath(data, schema.tabsPath);
      if (Array.isArray(tabs)) {
        for (let i = 0; i < tabs.length; i++) {
          const tabContent = tabs[i].tabRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
          if (tabContent) processSectionListOptimized(tabContent, config, needsContentFiltering, 'BROWSE_TAB');
        }
      }
      break;
      
    case 'CONTINUATION':
      let foundContent = false;
      
      if (schema && schema.sectionPath) {
        const sectionCont = getByPath(data, schema.sectionPath);
        if (sectionCont) {
            processSectionListOptimized(sectionCont, config, needsContentFiltering, 'CONT_SECTION');
            foundContent = true;
        }
      }
      
      if (schema && schema.gridPath) {
        const gridCont = getByPath(data, schema.gridPath);
        if (gridCont && Array.isArray(gridCont)) {
          const filtered = filterItemsOptimized(gridCont, config, needsContentFiltering);
          if (DEBUG && filtered.length !== gridCont.length) {
             debugLog(`Grid Continuation: Removed ${gridCont.length - filtered.length} items`);
          }
          setByPath(data, schema.gridPath, filtered);
          foundContent = true;
        }
      }
      
      // Fallback if both paths failed
      if (!foundContent) {
          const sectionList = findFirstObject(data, 'sectionListRenderer', 10);
          if (sectionList && sectionList.contents) {
              processSectionListOptimized(sectionList.contents, config, needsContentFiltering, 'CONT_FALLBACK');
              if (DEBUG) debugLog('CONTINUATION: Using fallback search');
          } else {
              const gridCont = findFirstObject(data, 'gridContinuation', 10);
              if (gridCont && gridCont.items) {
                  const filtered = filterItemsOptimized(gridCont.items, config, needsContentFiltering);
                  if (DEBUG && filtered.length !== gridCont.items.length) {
                      debugLog(`CONTINUATION Fallback: Removed ${gridCont.items.length - filtered.length} items`);
                  }
                  gridCont.items = filtered;
              }
          }
      }
      break;
      
    case 'ACTION':
      const actions = data.onResponseReceivedActions;
      if (actions && actions.length) {
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const items = (action.appendContinuationItemsAction && action.appendContinuationItemsAction.continuationItems) ||
                       (action.reloadContinuationItemsCommand && action.reloadContinuationItemsCommand.continuationItems);
          if (items) processSectionListOptimized(items, config, needsContentFiltering, 'ACTION');
        }
      }
      break;
  }
}

function applyFallbackFilters(data, config, needsContentFiltering) {
  let fallbackHits = 0;

  const sectionList = findFirstObject(data, 'sectionListRenderer', 10);
  if (sectionList?.contents) {
    processSectionListOptimized(sectionList.contents, config, needsContentFiltering, 'FALLBACK_SECTION');
    fallbackHits++;
  }

  const gridRenderer = findFirstObject(data, 'gridRenderer', 10);
  if (gridRenderer?.items) {
    const oldLen = gridRenderer.items.length;
    gridRenderer.items = filterItemsOptimized(gridRenderer.items, config, needsContentFiltering);
    if (DEBUG && oldLen !== gridRenderer.items.length) {
       debugLog(`Fallback Grid: Removed ${oldLen - gridRenderer.items.length} items`);
    }
    fallbackHits++;
  }

  const gridContinuation = findFirstObject(data, 'gridContinuation', 10);
  if (gridContinuation?.items) {
    const oldLen = gridContinuation.items.length;
    gridContinuation.items = filterItemsOptimized(gridContinuation.items, config, needsContentFiltering);
     if (DEBUG && oldLen !== gridContinuation.items.length) {
       debugLog(`Fallback GridContinuation: Removed ${oldLen - gridContinuation.items.length} items`);
    }
    fallbackHits++;
  }

  if (config.enableAdBlock && (data.playerResponse || data.videoDetails)) {
    removePlayerAdsOptimized(data);
    fallbackHits++;
  }
  
  if (DEBUG && fallbackHits > 0) debugLog(`Fallback found targets in ${fallbackHits} locations`);
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
          const oldLen = hList.items.length;
          hList.items = filterItemsOptimized(hList.items, config, needsContentFiltering);
          if (DEBUG && oldLen !== hList.items.length) {
             debugLog(`  -> Shelf [${getShelfTitleOptimized(shelf) || 'unknown'}]: Removed ${oldLen - hList.items.length} items`);
          }
        }
        
        const gList = shelf.content.gridRenderer;
        if (gList?.items) {
          gList.items = filterItemsOptimized(gList.items, config, needsContentFiltering);
        }
      }
    } 
    else if (enableAdBlock && (item.tvMastheadRenderer || item.adSlotRenderer)) {
      keepItem = false;
    } 
    else if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) {
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
      debugLog(`${contextName}: Filtered ${removed} top-level items (Ads/Masts/Shelves) from ${initialCount}`);
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
      if (enableAdBlock && item.adSlotRenderer) {
        keep = false;
        continue;
      }
      if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) {
        keep = false;
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

function getByPath(obj, path) {
  if (!path) return undefined;
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');
    if (pathCache.size < PATH_CACHE_LIMIT) pathCache.set(path, parts);
  }
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function setByPath(obj, path, value) {
  if (!path) return;
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');
    if (pathCache.size < PATH_CACHE_LIMIT) pathCache.set(path, parts);
  }
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) return;
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function removePlayerAdsOptimized(data) {
  let cleared = 0;
  if (data.adPlacements?.length) { data.adPlacements.length = 0; cleared++; }
  if (data.playerAds?.length) { data.playerAds.length = 0; cleared++; }
  if (data.adSlots?.length) { data.adSlots.length = 0; cleared++; }
  
  const pr = data.playerResponse;
  if (pr) {
    if (pr.adPlacements?.length) { pr.adPlacements.length = 0; cleared++; }
    if (pr.playerAds?.length) { pr.playerAds.length = 0; cleared++; }
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

  configRemoveChangeListener('enableAdBlock', updateConfigCache);
  configRemoveChangeListener('removeGlobalShorts', updateConfigCache);
  configRemoveChangeListener('removeTopLiveGames', updateConfigCache);
  configRemoveChangeListener('hideGuestSignInPrompts', updateConfigCache);
}

initAdblock();