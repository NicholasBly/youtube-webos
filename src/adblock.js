/* src/adblock.js - OPTIMIZED VERSION */

import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { isGuestMode } from './utils';

// Module state
let origParse = JSON.parse;
let isHooked = false;

// Cache config values to avoid repeated reads during JSON parsing
let configCache = {
  enableAdBlock: true,
  removeShorts: false,
  hideGuestPrompts: false,
  lastUpdate: 0
};

const CONFIG_CACHE_TTL = 100; // Cache for 100ms to batch updates

/**
 * Update cached config values
 */
function updateConfigCache() {
  configCache = {
    enableAdBlock: configRead('enableAdBlock'),
    removeShorts: isGuestMode() ? false : configRead('removeShorts'),
    hideGuestPrompts: configRead('hideGuestSignInPrompts'),
    lastUpdate: Date.now()
  };
}

/**
 * Get cached config (with TTL check)
 */
function getCachedConfig() {
  // Refresh cache if too old
  if (Date.now() - configCache.lastUpdate > CONFIG_CACHE_TTL) {
    updateConfigCache();
  }
  return configCache;
}

/**
 * Main JSON.parse hook implementation
 */
function hookedParse(text, reviver) {
  // 1. Perform actual parsing
  let data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    // If parsing fails, just return the original parse attempt
    return origParse.call(this, text, reviver);
  }

  // 2. Early exit: Non-object or primitive data
  if (!data || typeof data !== 'object') {
    return data;
  }

  // 3. Pre-flight check: Only process YouTube API responses
  const isAPIResponse = !!(
    data.responseContext ||
    data.playerResponse ||
    data.onResponseReceivedActions ||
    data.sectionListRenderer
  );

  if (!isAPIResponse) {
    return data;
  }

  // 4. Get cached config
  const { enableAdBlock, removeShorts, hideGuestPrompts } = getCachedConfig();

  // 5. Early exit: No filtering needed
  if (!enableAdBlock && !removeShorts && !hideGuestPrompts) {
    return data;
  }

  // 6. Apply filters
  try {
    applyFilters(data, enableAdBlock, removeShorts, hideGuestPrompts);
  } catch (e) {
    console.error('[AdBlock] Error during filtering:', e);
  }

  return data;
}

/**
 * Apply all filters to data object
 */
function applyFilters(data, enableAdBlock, removeShorts, hideGuestPrompts) {
  // Filter 1: Video player ads
  if (enableAdBlock && (data.playerResponse || data.videoDetails)) {
    removePlayerAds(data);
  }

  // Filter 2: Browse/Home screen elements (fast path)
  const browseContent = data.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
  if (browseContent) {
    processSectionList(browseContent, enableAdBlock, removeShorts, hideGuestPrompts);
  }

  const searchContent = data.contents?.sectionListRenderer?.contents;
  if (searchContent) {
    processSectionList(searchContent, enableAdBlock, removeShorts, hideGuestPrompts);
  }

  // Filter 3: Lazy loading continuations
  if (data.onResponseReceivedActions && Array.isArray(data.onResponseReceivedActions)) {
    data.onResponseReceivedActions.forEach((action) => {
      const contItems = action.appendContinuationItemsAction?.continuationItems;
      if (contItems) {
        action.appendContinuationItemsAction.continuationItems = filterItems(
          contItems,
          removeShorts,
          enableAdBlock,
          hideGuestPrompts
        );
      }
    });
  }

  // Filter 4: Recursive search for edge cases (only if needed)
  if ((removeShorts || hideGuestPrompts) && !browseContent && !searchContent) {
    applyDeepFilters(data, removeShorts, enableAdBlock, hideGuestPrompts);
  }
}

/**
 * Remove player ads from data
 */
function removePlayerAds(data) {
  if (data.adPlacements) data.adPlacements = [];
  if (data.playerAds) data.playerAds = [];
  if (data.adSlots) data.adSlots = [];
  
  if (data.playerResponse) {
    if (data.playerResponse.adPlacements) data.playerResponse.adPlacements = [];
    if (data.playerResponse.playerAds) data.playerResponse.playerAds = [];
  }
}

/**
 * Apply deep filters for edge cases
 */
function applyDeepFilters(data, removeShorts, enableAdBlock, hideGuestPrompts) {
  // Find and process grids (Subscriptions tab)
  const gridRenderer = findFirstObject(data, 'gridRenderer');
  if (gridRenderer?.items) {
    gridRenderer.items = filterItems(gridRenderer.items, removeShorts, enableAdBlock, hideGuestPrompts);
  }

  // Find and process grid continuations (Scrolling)
  const gridContinuation = findFirstObject(data, 'gridContinuation');
  if (gridContinuation?.items) {
    gridContinuation.items = filterItems(gridContinuation.items, removeShorts, enableAdBlock, hideGuestPrompts);
  }

  // Find and process generic section lists (Catch-all)
  const sectionList = findFirstObject(data, 'sectionListRenderer');
  if (sectionList?.contents) {
    processSectionList(sectionList.contents, enableAdBlock, removeShorts, hideGuestPrompts);
  }
}

/**
 * Process section list contents (in-place filtering for performance)
 */
function processSectionList(contents, enableAdBlock, removeShorts, hideGuestPrompts) {
  if (!Array.isArray(contents)) return;

  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    // Check if item should be removed
    if (enableAdBlock && (item.tvMastheadRenderer || item.adSlotRenderer)) {
      keepItem = false;
    } else if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) {
      keepItem = false;
    } else if (keepItem && item.shelfRenderer) {
      // Process shelf contents
      const shelf = item.shelfRenderer;
      
      if (removeShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
        keepItem = false;
      } else if (shelf.content) {
        // Filter horizontal lists
        if (shelf.content.horizontalListRenderer?.items) {
          shelf.content.horizontalListRenderer.items = filterItems(
            shelf.content.horizontalListRenderer.items,
            removeShorts,
            enableAdBlock,
            hideGuestPrompts
          );
        }
        
        // Filter grids
        if (shelf.content.gridRenderer?.items) {
          shelf.content.gridRenderer.items = filterItems(
            shelf.content.gridRenderer.items,
            removeShorts,
            enableAdBlock,
            hideGuestPrompts
          );
        }
      }
    }

    // Keep item by moving it to write position
    if (keepItem) {
      contents[writeIdx++] = item;
    }
  }

  // Truncate array to actual size
  contents.length = writeIdx;
}

/**
 * Filter individual items
 */
function filterItems(items, removeShorts, enableAdBlock, hideGuestPrompts) {
  if (!Array.isArray(items)) return items;

  const result = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    // Check removal conditions
    if (enableAdBlock && item.adSlotRenderer) {
      keep = false;
    } else if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) {
      keep = false;
    } else if (removeShorts) {
      // Multiple shorts detection patterns
      if (
        item.tileRenderer?.onSelectCommand?.reelWatchEndpoint ||
        item.reelItemRenderer ||
        item.command?.reelWatchEndpoint?.adClientParams
      ) {
        keep = false;
      }
    }

    if (keep) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Find first occurrence of a key in nested object (with depth limit)
 * @param {Object} haystack - Object to search
 * @param {string} needle - Key to find
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {*} Found value or null
 */
function findFirstObject(haystack, needle, maxDepth = 15) {
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

/**
 * Initialize adblock by hooking JSON.parse
 */
export function initAdblock() {
  if (isHooked) {
    console.warn('[AdBlock] Already initialized');
    return;
  }

  console.info('[AdBlock] Initializing JSON.parse hook');
  
  // Update config cache
  updateConfigCache();
  
  // Hook JSON.parse
  origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    return hookedParse.call(this, text, reviver);
  };
  
  isHooked = true;

  // Listen for config changes
  configAddChangeListener('enableAdBlock', updateConfigCache);
  configAddChangeListener('removeShorts', updateConfigCache);
  configAddChangeListener('hideGuestSignInPrompts', updateConfigCache);
}

/**
 * Restore original JSON.parse (cleanup)
 */
export function destroyAdblock() {
  if (!isHooked) {
    console.warn('[AdBlock] Not initialized');
    return;
  }

  console.info('[AdBlock] Restoring JSON.parse');
  
  JSON.parse = origParse;
  isHooked = false;

  // Remove config listeners
  configRemoveChangeListener('enableAdBlock', updateConfigCache);
  configRemoveChangeListener('removeShorts', updateConfigCache);
  configRemoveChangeListener('hideGuestSignInPrompts', updateConfigCache);
}

// Auto-initialize
initAdblock();