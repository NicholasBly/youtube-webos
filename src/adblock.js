/* src/adblock.js */
/* eslint no-redeclare: 0 */
/* global fetch:writable */
import { configRead } from './config';

const origParse = JSON.parse;

JSON.parse = function (text, reviver) {
  // 1. Safe parsing
  let data;
  try {
      data = origParse.call(this, text, reviver);
  } catch (e) {
      return origParse.call(this, text, reviver); // Fallback
  }

  // Basic sanity check
  if (!data || typeof data !== 'object') {
    return data;
  }

  const enableAds = configRead('enableAdBlock');
  const removeShorts = configRead('removeShorts');

  if (!enableAds && !removeShorts) {
    return data;
  }

  // 2. Modification Logic
  try {
    // --- Phase 1: Root Level Ad Cleanup (Fast) ---
    if (enableAds) {
      if (data.adPlacements) data.adPlacements = [];
      if (data.adSlots) data.adSlots = [];
      if (data.playerAds) data.playerAds = [];
      if (data.playerResponse?.adPlacements) data.playerResponse.adPlacements = [];
      if (data.playerResponse?.playerAds) data.playerResponse.playerAds = [];
    }

    // --- Phase 2: Standard UI Filtering (Fast Path) ---
    // Handle standard lists (Home Screen, Channel Pages)
    const browseContent = data.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (browseContent) processSectionList(browseContent, enableAds, removeShorts);

    // Handle Search Results
    const searchContent = data.contents?.sectionListRenderer?.contents;
    if (searchContent) processSectionList(searchContent, enableAds, removeShorts);

    // Handle Lazy Loading / Pagination (Continuations)
    if (data.onResponseReceivedActions) {
       data.onResponseReceivedActions.forEach(action => {
         const contItems = action.appendContinuationItemsAction?.continuationItems;
         if (contItems) {
           action.appendContinuationItemsAction.continuationItems = filterItems(contItems, removeShorts, enableAds);
         }
       });
    }

    // --- Phase 3: Recursive Shorts Search (Robust Path) ---
    // If we need to remove shorts, we run the recursive search logic from the old script.
    // This catches 'gridRenderer' (Subscriptions) and 'gridContinuation' which standard paths often miss.
    if (removeShorts) {
      // 1. Find and scrub Grids (Subscriptions tab)
      const gridRenderer = findFirstObject(data, 'gridRenderer');
      if (gridRenderer?.items) {
         gridRenderer.items = filterItems(gridRenderer.items, removeShorts, enableAds);
      }

      // 2. Find and scrub Grid Continuations (Scrolling down in Subscriptions)
      const gridContinuation = findFirstObject(data, 'gridContinuation');
      if (gridContinuation?.items) {
         gridContinuation.items = filterItems(gridContinuation.items, removeShorts, enableAds);
      }
      
      // 3. Find and scrub generic SectionLists (Catch-all)
      const sectionList = findFirstObject(data, 'sectionListRenderer');
      if (sectionList?.contents) {
        processSectionList(sectionList.contents, enableAds, removeShorts);
      }
    }

  } catch (e) {
    console.warn('[AdBlock] Safety fallback triggered:', e);
  }

  return data;
};

// --- Helper Functions ---

function processSectionList(contents, enableAds, removeShorts) {
  if (!Array.isArray(contents)) return;

  let writeIdx = 0;
  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    // Filter Ad Renderers
    if (enableAds) {
      if (item.tvMastheadRenderer || item.adSlotRenderer) {
        keepItem = false;
      }
    }

    // Filter Shelves
    if (keepItem && item.shelfRenderer) {
      const shelfType = item.shelfRenderer.tvhtml5ShelfRendererType;
      
      // Remove specific Shorts Shelves
      if (removeShorts && shelfType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
          keepItem = false;
      } 
      // Clean content inside standard Shelves
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

    if (keepItem) {
      contents[writeIdx++] = item;
    }
  }
  contents.length = writeIdx;
}

function filterItems(items, removeShorts, enableAds) {
  if (!Array.isArray(items)) return items;

  return items.filter(item => {
    // Block Ad Slots
    if (enableAds && item.adSlotRenderer) return false;

    // Block Shorts
    if (removeShorts) {
        // Logic from original shorts.js: Detect via reelWatchEndpoint
        if (item.tileRenderer?.onSelectCommand?.reelWatchEndpoint) return false;
        
        // Secondary detection for other contexts
        if (item.command?.reelWatchEndpoint?.adClientParams?.isAd) return false;
        
        // Catch-all for "Shorts" specific renderers
        if (item.reelItemRenderer) return false;
    }
    return true;
  });
}

// Logic imported from shorts.js
// Recursively finds the first instance of a key in the object tree.
function findFirstObject(haystack, needle) {
  // Optimization: If haystack is not an object or null, return null immediately
  if (!haystack || typeof haystack !== 'object') return null;

  for (const key in haystack) {
    if (key === needle) {
      return haystack[key];
    }
    // Only recurse if the property is an object (and not null)
    if (typeof haystack[key] === 'object') {
      const result = findFirstObject(haystack[key], needle);
      if (result) return result;
    }
  }
  return null;
}