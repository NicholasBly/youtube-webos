/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

/**
 * Optimized AdBlock & Shorts Removal
 * * Fixes:
 * 1. Restores unconditional checks for 'adPlacements' to fix broken adblocking.
 * 2. Integrates Shorts removal to prevent double-parsing JSON.
 * 3. Uses direct path access instead of recursion for performance.
 */
const origParse = JSON.parse;

JSON.parse = function (text, reviver) {
  const data = origParse.call(this, text, reviver);

  // Basic sanity check
  if (!data || typeof data !== 'object') {
    return data;
  }

  const enableAds = configRead('enableAdBlock');
  const removeShorts = configRead('removeShorts');

  if (!enableAds && !removeShorts) {
    return data;
  }

  try {
    // --- Phase 1: Root Level Ad Cleanup (Critical) ---
    // These must happen regardless of whether 'contents' exists.
    if (enableAds) {
      if (data.adPlacements) {
        data.adPlacements = [];
      }
      if (data.adSlots) {
        data.adSlots = [];
      }
      if (data.playerAds) {
        data.playerAds = [];
      }
      // Often found in playerResponse
      if (data.playerResponse?.adPlacements) {
        data.playerResponse.adPlacements = [];
      }
      if (data.playerResponse?.playerAds) {
        data.playerResponse.playerAds = [];
      }
    }

    // --- Phase 2: Content & UI Filtering ---
    // Only proceed if we actually have content to filter.
    
    // 1. Home / Subscriptions / Browse Pages
    const browseContent = data.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (browseContent) {
        processSectionList(browseContent, enableAds, removeShorts);
    }

    // 2. Search Results
    const searchContent = data.contents?.sectionListRenderer?.contents;
    if (searchContent) {
        processSectionList(searchContent, enableAds, removeShorts);
    }

    // 3. Continuations (Infinite Scroll / Next Page)
    if (data.onResponseReceivedActions) {
       data.onResponseReceivedActions.forEach(action => {
         const contItems = action.appendContinuationItemsAction?.continuationItems;
         if (contItems) {
           action.appendContinuationItemsAction.continuationItems = filterItems(contItems, removeShorts);
         }
       });
    }

  } catch (e) {
    console.warn('[AdBlock] Error processing JSON:', e);
  }

  return data;
};

/**
 * Processes a list of sections (Shelves, Grids, Renderers)
 * Modifies the array in-place.
 */
function processSectionList(contents, enableAds, removeShorts) {
  if (!Array.isArray(contents)) return;

  // We use a write-index for in-place filtering to reduce memory allocations
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    // A. Ad Blocking Logic
    if (enableAds) {
      // 1. Masthead Ad (Top of Home)
      if (item.tvMastheadRenderer) {
        keepItem = false;
      }
      // 2. Ad Slot Renderer
      else if (item.adSlotRenderer) {
        keepItem = false;
      }
    }

    // B. Shorts Removal & Inner Item Filtering
    if (keepItem) {
      // Check Shelf (Horizontal rows)
      if (item.shelfRenderer) {
        // Remove Shorts Shelf completely
        if (removeShorts && item.shelfRenderer.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
            keepItem = false;
        } 
        // Filter items INSIDE the shelf (Ad Tiles or Shorts Tiles)
        else {
          const shelfContent = item.shelfRenderer.content;
          if (shelfContent) {
            if (shelfContent.horizontalListRenderer?.items) {
               shelfContent.horizontalListRenderer.items = filterItems(shelfContent.horizontalListRenderer.items, removeShorts, enableAds);
            } else if (shelfContent.gridRenderer?.items) {
               shelfContent.gridRenderer.items = filterItems(shelfContent.gridRenderer.items, removeShorts, enableAds);
            }
          }
        }
      }
    }

    if (keepItem) {
      contents[writeIdx++] = item;
    }
  }

  // Truncate array to new length
  contents.length = writeIdx;
}

/**
 * Filters individual video/tile items
 */
function filterItems(items, removeShorts, enableAds) {
  if (!Array.isArray(items)) return items;

  return items.filter(item => {
    // 1. Remove Ad Tiles
    if (enableAds && item.adSlotRenderer) {
        return false;
    }

    // 2. Remove Shorts Tiles
    if (removeShorts) {
        // Shorts usually have this command endpoint
        if (item.tileRenderer?.onSelectCommand?.reelWatchEndpoint) {
            return false;
        }
        // Explicit "isAd" check for Reel items
        if (item.command?.reelWatchEndpoint?.adClientParams?.isAd) {
             return false;
        }
    }
    
    return true;
  });
}