import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { isGuestMode } from './utils';

// Module state
let origParse = JSON.parse;
let isHooked = false;

// Cache config values
let configCache = {
  enableAdBlock: true,
  removeGlobalShorts: false,
  removeTopLiveGames: false,
  hideGuestPrompts: false,
  lastUpdate: 0
};

// Pre-compile string patterns
const PATTERN_CACHE = {
  shorts: 'shorts',
  topLiveGames: 'top live games'
};

// SCHEMA REGISTRY
const SCHEMA_REGISTRY = {
  enabled: true, 
  
  // Response type detection patterns
  typeSignatures: {
    PLAYER: { 
      textPattern: '"playerResponse"' 
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
    }
  },
  
  // Exact paths for each response type
  paths: {
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

// Statistics tracking (optional, can be disabled)
const stats = {
  schemaHits: 0,
  schemaMisses: 0,
  fallbacks: 0,
  enabled: false // Set to true for debugging
};

function updateConfigCache() {
  configCache = {
    enableAdBlock: configRead('enableAdBlock'),
    // Global now handles all shorts filtering
    removeGlobalShorts: configRead('removeGlobalShorts'),
    removeTopLiveGames: configRead('removeTopLiveGames'),
    hideGuestPrompts: isGuestMode() ? false : configRead('hideGuestSignInPrompts'),
    lastUpdate: Date.now()
  };
}

function getCachedConfig() {
  return configCache;
}

/**
 * Main JSON.parse hook - Hybrid implementation with safety nets
 */
function hookedParse(text, reviver) {
  // FAST PATH 1: Size-based early exit
  if (text.length < 500) { 
    return origParse.call(this, text, reviver);
  }

  // FAST PATH 2: Detect response type before parsing
  const responseType = detectResponseTypeFromText(text);
  
  // Parse the JSON with error handling
  let data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    console.error('[AdBlock] Parse error:', e);
    throw e; // Re-throw to maintain original behavior
  }

  if (!data || typeof data !== 'object') {
    return data;
  }

  // Get cached config
  const config = getCachedConfig();
  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts } = config;

  // Early exit: No filtering needed
  if (!enableAdBlock && !removeGlobalShorts && !removeTopLiveGames && !hideGuestPrompts) {
    return data;
  }

  // Compute combined content filtering flag
  const needsContentFiltering = enableAdBlock || hideGuestPrompts;

  try {
    // FAST PATH: Schema-driven filtering
    if (responseType && SCHEMA_REGISTRY.paths[responseType]) {
      applySchemaFilters(data, responseType, config, needsContentFiltering);
      if (stats.enabled) stats.schemaHits++;
    } else if (responseType === 'ACTION' || responseType === 'PLAYER') {
      applySchemaFilters(data, responseType, config, needsContentFiltering);
      if (stats.enabled) stats.schemaHits++;
    } else {
      // FALLBACK: Use safe deep filtering when schema doesn't match
      if (stats.enabled) stats.schemaMisses++;
      applyFallbackFilters(data, config, needsContentFiltering);
    }
  } catch (e) {
    console.error('[AdBlock] Error during filtering:', e);
    // Last resort fallback
    try {
      applyFallbackFilters(data, config, needsContentFiltering);
      if (stats.enabled) stats.fallbacks++;
    } catch (fallbackError) {
      console.error('[AdBlock] Fallback filtering also failed:', fallbackError);
    }
  }

  return data;
}

/**
 * FAST PATH: Schema-driven filtering
 */
function applySchemaFilters(data, responseType, config, needsContentFiltering) {
  const schema = SCHEMA_REGISTRY.paths[responseType];
  
  switch (responseType) {
    case 'PLAYER':
      if (config.enableAdBlock) {
        removePlayerAdsOptimized(data);
      }
      break;
      
    case 'HOME_BROWSE':
      const contents = getByPath(data, schema.mainContent);
      if (contents) {
        processSectionListOptimized(contents, config, needsContentFiltering);
      }
      break;

    case 'SEARCH':
      const searchContents = getByPath(data, schema.mainContent);
      if (searchContents) {
        processSectionListOptimized(searchContents, config, needsContentFiltering);
      }
      break;

    case 'BROWSE_TABS':
      const tabs = getByPath(data, schema.tabsPath);
      if (Array.isArray(tabs)) {
        for (let i = 0; i < tabs.length; i++) {
          const tab = tabs[i].tabRenderer;
          const tabContent = tab?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
          if (tabContent) {
            processSectionListOptimized(tabContent, config, needsContentFiltering);
          }
        }
      }
      break;
      
    case 'CONTINUATION':
      if (schema.sectionPath) {
        const sectionCont = getByPath(data, schema.sectionPath);
        if (sectionCont) {
          processSectionListOptimized(sectionCont, config, needsContentFiltering);
        }
      }
      if (schema.gridPath) {
        const gridCont = getByPath(data, schema.gridPath);
        if (gridCont && Array.isArray(gridCont)) {
          const filtered = filterItemsOptimized(gridCont, config, needsContentFiltering);
          setByPath(data, schema.gridPath, filtered);
        }
      }
      break;
      
    case 'ACTION':
      const actions = data.onResponseReceivedActions;
      if (actions?.length) {
        for (let i = 0; i < actions.length; i++) {
          const items = actions[i].appendContinuationItemsAction?.continuationItems ||
                       actions[i].reloadContinuationItemsCommand?.continuationItems;
          if (items) {
            processSectionListOptimized(items, config, needsContentFiltering);
          }
        }
      }
      break;
  }
}

/**
 * FALLBACK: Safe deep filtering when schema doesn't match
 */
function applyFallbackFilters(data, config, needsContentFiltering) {
  // Try to find sectionListRenderer anywhere in the response
  const sectionList = findFirstObject(data, 'sectionListRenderer', 10);
  if (sectionList?.contents) {
    processSectionListOptimized(sectionList.contents, config, needsContentFiltering);
  }

  // Try to find gridRenderer or gridContinuation
  const gridRenderer = findFirstObject(data, 'gridRenderer', 10);
  if (gridRenderer?.items) {
    gridRenderer.items = filterItemsOptimized(gridRenderer.items, config, needsContentFiltering);
  }

  const gridContinuation = findFirstObject(data, 'gridContinuation', 10);
  if (gridContinuation?.items) {
    gridContinuation.items = filterItemsOptimized(gridContinuation.items, config, needsContentFiltering);
  }

  // Handle player ads
  if (config.enableAdBlock && (data.playerResponse || data.videoDetails)) {
    removePlayerAdsOptimized(data);
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

function processSectionListOptimized(contents, config, needsContentFiltering) {
  if (!Array.isArray(contents) || contents.length === 0) return;

  const { enableAdBlock, removeGlobalShorts, removeTopLiveGames, hideGuestPrompts } = config;
  
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (item.shelfRenderer) {
      const shelf = item.shelfRenderer;
      
      // 1. Fast check: Shelf Type for Shorts
      if (removeGlobalShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
        keepItem = false;
      } else if (removeGlobalShorts || removeTopLiveGames) {
        // 2. Only get title if we need it for either filter
        const title = getShelfTitleOptimized(shelf);
        
        if (removeGlobalShorts && title === PATTERN_CACHE.shorts) {
          keepItem = false;
        } else if (removeTopLiveGames && title === PATTERN_CACHE.topLiveGames) {
          keepItem = false;
        }
      }
      
      // 3. Filter items INSIDE the shelf
      if (keepItem && shelf.content) {
        const horizontalItems = shelf.content.horizontalListRenderer?.items;
        if (horizontalItems) {
          shelf.content.horizontalListRenderer.items = filterItemsOptimized(
            horizontalItems, config, needsContentFiltering
          );
        }
        
        const gridItems = shelf.content.gridRenderer?.items;
        if (gridItems) {
          shelf.content.gridRenderer.items = filterItemsOptimized(
            gridItems, config, needsContentFiltering
          );
        }
      }
    } 
    // 4. Remove Ad Slots / Mastheads
    else if (enableAdBlock && (item.tvMastheadRenderer || item.adSlotRenderer)) {
      keepItem = false;
    } 
    // 5. Remove Guest Prompts
    else if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) {
      keepItem = false;
    }

    if (keepItem) {
      if (writeIdx !== i) {
        contents[writeIdx] = item;
      }
      writeIdx++;
    }
  }

  contents.length = writeIdx;
}

function filterItemsOptimized(items, config, needsContentFiltering) {
  if (!Array.isArray(items) || items.length === 0) return items;

  const { enableAdBlock, removeGlobalShorts, hideGuestPrompts } = config;

  // Recalculate if not provided (fallback)
  if (needsContentFiltering === undefined) {
    needsContentFiltering = enableAdBlock || hideGuestPrompts;
  }

  // Early exit if no filtering needed
  if (!removeGlobalShorts && !needsContentFiltering) return items;

  const result = [];
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    // Content filtering (ads, guest prompts)
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

    // Shorts filtering
    if (keep && removeGlobalShorts) {
      const tileRenderer = item.tileRenderer;
      
      if (tileRenderer) {
        if (tileRenderer.style === 'TILE_STYLE_YTLR_SHORTS' ||
            tileRenderer.contentType === 'TILE_CONTENT_TYPE_SHORTS' ||
            tileRenderer.onSelectCommand?.reelWatchEndpoint) {
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

    if (keep) {
      result.push(item);
    }
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function detectResponseTypeFromText(text) {
  const types = SCHEMA_REGISTRY.typeSignatures;
  
  for (const type in types) {
    const config = types[type];
    // Using indexOf instead of includes for better performance
    if (text.indexOf(config.textPattern) !== -1) {
      if (config.excludePattern && text.indexOf(config.excludePattern) !== -1) {
        continue;
      }
      return type;
    }
  }
  return null;
}

// Cache for split results
const pathCache = new Map();
const PATH_CACHE_LIMIT = 20;

function getByPath(obj, path) {
  if (!path) return undefined;
  
  // Get cached split result
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');
    if (pathCache.size < PATH_CACHE_LIMIT) {
      pathCache.set(path, parts);
    }
  }
  
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current === undefined || current === null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function setByPath(obj, path, value) {
  if (!path) return;
  
  let parts = pathCache.get(path);
  if (!parts) {
    parts = path.split('.');
    if (pathCache.size < PATH_CACHE_LIMIT) {
      pathCache.set(path, parts);
    }
  }
  
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined) return;
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function removePlayerAdsOptimized(data) {
  if (data.adPlacements) data.adPlacements.length = 0;
  if (data.playerAds) data.playerAds.length = 0;
  if (data.adSlots) data.adSlots.length = 0;
  
  const playerResponse = data.playerResponse;
  if (playerResponse) {
    if (playerResponse.adPlacements) playerResponse.adPlacements.length = 0;
    if (playerResponse.playerAds) playerResponse.playerAds.length = 0;
  }
}

/**
 * Find first occurrence of a key in nested object (with depth limit)
 * Used as fallback when schema doesn't match
 */
function findFirstObject(haystack, needle, maxDepth = 10) {
  if (!haystack || typeof haystack !== 'object' || maxDepth <= 0) {
    return null;
  }

  // Check current level
  if (haystack[needle]) {
    return haystack[needle];
  }

  // Search nested objects
  for (const key in haystack) {
    if (haystack.hasOwnProperty(key) && typeof haystack[key] === 'object') {
      const result = findFirstObject(haystack[key], needle, maxDepth - 1);
      if (result) return result;
    }
  }

  return null;
}

// ============================================================================
// INITIALIZATION & MONITORING
// ============================================================================

export function initAdblock() {
  if (isHooked) return;
  console.info('[AdBlock] Initializing hybrid hook with fallback support');
  
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

  // Optional: Log stats periodically in development
  if (stats.enabled) {
    setInterval(() => {
      const total = stats.schemaHits + stats.schemaMisses;
      if (total > 0) {
        const hitRate = (stats.schemaHits / total * 100).toFixed(1);
        console.info(`[AdBlock] Schema hit rate: ${hitRate}% (fallbacks: ${stats.fallbacks})`);
      }
    }, 60000);
  }
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

// Enable stats in development
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  stats.enabled = true;
}

initAdblock();