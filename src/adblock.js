/* src/adblock.js */
/* eslint no-redeclare: 0 */
import { configRead } from './config';
import { isGuestMode } from './utils';

let origParse = JSON.parse;
let isHooked = false;

// Define the hook logic separately
function hookedParse(text, reviver) {
  // 1. Perform the actual parsing first
  var data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    return origParse.call(this, text, reviver);
  }

  // 2. Pre-flight Check: Performance Optimization
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  var isAPIResponse = data.responseContext || data.playerResponse || data.onResponseReceivedActions || data.sectionListRenderer;
  if (!isAPIResponse) {
    return data;
  }

  const enableAds = configRead('enableAdBlock');
  let removeShorts = configRead('removeShorts');
  const hideGuestPrompts = configRead('hideGuestSignInPrompts');
  
  if (isGuestMode()) {
      removeShorts = false;
  }

  if (!enableAds && !removeShorts && !hideGuestPrompts) {
    return data;
  }

  try {
    // --- ACTION 1: Video Player Ads ---
    if (enableAds && (data.playerResponse || data.videoDetails)) {
      if (data.adPlacements) data.adPlacements = [];
      if (data.playerAds) data.playerAds = [];
      if (data.adSlots) data.adSlots = [];
      if (data.playerResponse) {
        if (data.playerResponse.adPlacements) data.playerResponse.adPlacements = [];
        if (data.playerResponse.playerAds) data.playerResponse.playerAds = [];
      }
    }

    // --- ACTION 2: Browse/Home Screen Elements ---
    var browseContent = data.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (browseContent) {
      processSectionList(browseContent, enableAds, removeShorts, hideGuestPrompts);
    }

    var searchContent = data.contents?.sectionListRenderer?.contents;
    if (searchContent) {
      processSectionList(searchContent, enableAds, removeShorts, hideGuestPrompts);
    }

    // --- ACTION 2c: Lazy Loading ---
    if (data.onResponseReceivedActions && Array.isArray(data.onResponseReceivedActions)) {
       data.onResponseReceivedActions.forEach(function(action) {
         var contItems = action.appendContinuationItemsAction?.continuationItems;
         if (contItems) {
           action.appendContinuationItemsAction.continuationItems = filterItems(contItems, removeShorts, enableAds, hideGuestPrompts);
         }
         var reloadItems = action.reloadContinuationItemsCommand?.continuationItems;
         if (reloadItems) {
            action.reloadContinuationItemsCommand.continuationItems = filterItems(reloadItems, removeShorts, enableAds, hideGuestPrompts);
         }
       });
    }

    // --- ACTION 3: Shorts & Guest Prompts ---
    if (removeShorts || hideGuestPrompts) {
      if (removeShorts) {
          var gridRenderer = findFirstObject(data, 'gridRenderer');
          if (gridRenderer?.items) {
             gridRenderer.items = filterItems(gridRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          }
          var gridContinuation = findFirstObject(data, 'gridContinuation');
          if (gridContinuation?.items) {
             gridContinuation.items = filterItems(gridContinuation.items, removeShorts, enableAds, hideGuestPrompts);
          }
      }
      if (removeShorts || hideGuestPrompts) {
        var sectionList = findFirstObject(data, 'sectionListRenderer');
        if (sectionList?.contents) {
          processSectionList(sectionList.contents, enableAds, removeShorts, hideGuestPrompts);
        }
      }
    }

  } catch (e) {
    console.warn('[AdBlock] Error during sanitization:', e);
  }

  return data;
}

/**
 * Initializes the JSON.parse hook.
 */
export function initAdblock() {
    if (isHooked) return;
    console.info('[AdBlock] Hooking JSON.parse');
    origParse = JSON.parse;
    JSON.parse = function(text, reviver) {
        return hookedParse.call(this, text, reviver);
    };
    isHooked = true;
}

/**
 * Restores the original JSON.parse function.
 * Call this to clean up the module.
 */
export function destroyAdblock() {
    if (!isHooked) return;
    console.info('[AdBlock] Restoring JSON.parse');
    JSON.parse = origParse;
    isHooked = false;
}

// Helper functions
function processSectionList(contents, enableAds, removeShorts, hideGuestPrompts) {
  if (!Array.isArray(contents)) return;
  var writeIdx = 0;
  for (var i = 0; i < contents.length; i++) {
    var item = contents[i];
    var keepItem = true;

    if (enableAds && (item.tvMastheadRenderer || item.adSlotRenderer)) keepItem = false;
    if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) keepItem = false;

    if (keepItem && item.shelfRenderer) {
      var shelf = item.shelfRenderer;
      if (removeShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
          keepItem = false;
      } else if (shelf.content) {
          if (shelf.content.horizontalListRenderer?.items) {
             shelf.content.horizontalListRenderer.items = filterItems(shelf.content.horizontalListRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          } else if (shelf.content.gridRenderer?.items) {
             shelf.content.gridRenderer.items = filterItems(shelf.content.gridRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          }
      }
    }

    if (keepItem) contents[writeIdx++] = item;
  }
  contents.length = writeIdx;
}

function filterItems(items, removeShorts, enableAds, hideGuestPrompts) {
  if (!Array.isArray(items)) return items;
  var result = [];
  for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var keep = true;

      if (enableAds && item.adSlotRenderer) keep = false;
      if (hideGuestPrompts && (item.feedNudgeRenderer || item.alertWithActionsRenderer)) keep = false;

      if (removeShorts) {
          if (item.tileRenderer?.onSelectCommand?.reelWatchEndpoint) keep = false;
          if (item.reelItemRenderer) keep = false;
          if (item.command?.reelWatchEndpoint?.adClientParams) keep = false;
      }

      if (keep) result.push(item);
  }
  return result;
}

function findFirstObject(haystack, needle) {
  if (!haystack || typeof haystack !== 'object') return null;
  if (haystack[needle]) return haystack[needle];
  for (var key in haystack) {
    if (haystack.hasOwnProperty(key) && typeof haystack[key] === 'object') {
      var result = findFirstObject(haystack[key], needle);
      if (result) return result;
    }
  }
  return null;
}

initAdblock();