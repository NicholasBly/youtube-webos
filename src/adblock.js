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

  // 2. Error handling wrapper for modification logic
  try {
    // --- Phase 1: Root Level Ad Cleanup (Critical) ---
    if (enableAds) {
      if (data.adPlacements) data.adPlacements = [];
      if (data.adSlots) data.adSlots = [];
      if (data.playerAds) data.playerAds = [];
      if (data.playerResponse?.adPlacements) data.playerResponse.adPlacements = [];
      if (data.playerResponse?.playerAds) data.playerResponse.playerAds = [];
    }

    // --- Phase 2: Content & UI Filtering ---
    const browseContent = data.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (browseContent) processSectionList(browseContent, enableAds, removeShorts);

    const searchContent = data.contents?.sectionListRenderer?.contents;
    if (searchContent) processSectionList(searchContent, enableAds, removeShorts);

    if (data.onResponseReceivedActions) {
       data.onResponseReceivedActions.forEach(action => {
         const contItems = action.appendContinuationItemsAction?.continuationItems;
         if (contItems) {
           action.appendContinuationItemsAction.continuationItems = filterItems(contItems, removeShorts, enableAds);
         }
       });
    }

  } catch (e) {
    // Fail safe: If our logic errors, return the original data so the app doesn't crash
    console.warn('[AdBlock] Safety fallback triggered:', e);
  }

  return data;
};

function processSectionList(contents, enableAds, removeShorts) {
  if (!Array.isArray(contents)) return;

  let writeIdx = 0;
  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (enableAds) {
      if (item.tvMastheadRenderer || item.adSlotRenderer) {
        keepItem = false;
      }
    }

    if (keepItem) {
      if (item.shelfRenderer) {
        if (removeShorts && item.shelfRenderer.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
            keepItem = false;
        } else {
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
  contents.length = writeIdx;
}

function filterItems(items, removeShorts, enableAds) {
  if (!Array.isArray(items)) return items;

  // Use a simple filter loop for speed
  return items.filter(item => {
    if (enableAds && item.adSlotRenderer) return false;

    if (removeShorts) {
        if (item.tileRenderer?.onSelectCommand?.reelWatchEndpoint) return false;
        if (item.command?.reelWatchEndpoint?.adClientParams?.isAd) return false;
    }
    return true;
  });
}