/* src/adblock.js */
/* eslint no-redeclare: 0 */
import { configRead } from './config';

const origParse = JSON.parse;

JSON.parse = function (text, reviver) {
  // 1. Perform the actual parsing first
  var data;
  try {
    data = origParse.call(this, text, reviver);
  } catch (e) {
    return origParse.call(this, text, reviver);
  }

  // 2. Pre-flight Check: Performance Optimization
  // If data is null, not an object, or doesn't look like a YouTube API response, return immediately.
  // 'responseContext' is the standard signature for YT API calls (Browse, Next, Player, Search).
  // 'onResponseReceivedActions' is the signature for lazy-loading/continuations.
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Fast exit for non-API JSONs (Config, LocalStorage, etc.)
  // We check for specific keys that define the heavy payloads we care about.
  var isAPIResponse = data.responseContext || data.playerResponse || data.onResponseReceivedActions || data.sectionListRenderer;
  if (!isAPIResponse) {
    return data;
  }

  const enableAds = configRead('enableAdBlock');
  const removeShorts = configRead('removeShorts');
  const hideGuestPrompts = configRead('hideGuestSignInPrompts');

  // If all features are disabled, just return
  if (!enableAds && !removeShorts && !hideGuestPrompts) {
    return data;
  }

  try {
    // --- ACTION 1: Video Player Ads (Mid-rolls, Banners) ---
    // Targeted specifically at Player responses
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
    // Targeting Home, Subscriptions, and Search Results
    
    // 2a. Initial Page Load (Standard Browse)
    var browseContent = data.contents && data.contents.tvBrowseRenderer && 
                        data.contents.tvBrowseRenderer.content && 
                        data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer && 
                        data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content && 
                        data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer && 
                        data.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;

    if (browseContent) {
      processSectionList(browseContent, enableAds, removeShorts, hideGuestPrompts);
    }

    // 2b. Search Results (Specific to Search Page)
    var searchContent = data.contents && data.contents.sectionListRenderer && 
                        data.contents.sectionListRenderer.contents;
    if (searchContent) {
      processSectionList(searchContent, enableAds, removeShorts, hideGuestPrompts);
    }

    // 2c. Lazy Loading / Continuations (Infinite Scroll)
    // This handles loading more videos at the bottom of Home or Subscriptions
    if (data.onResponseReceivedActions && Array.isArray(data.onResponseReceivedActions)) {
       data.onResponseReceivedActions.forEach(function(action) {
         var contItems = action.appendContinuationItemsAction && action.appendContinuationItemsAction.continuationItems;
         if (contItems) {
           action.appendContinuationItemsAction.continuationItems = filterItems(contItems, removeShorts, enableAds, hideGuestPrompts);
         }
         // Also check for reloading sections (common in switching tabs)
         var reloadItems = action.reloadContinuationItemsCommand && action.reloadContinuationItemsCommand.continuationItems;
         if (reloadItems) {
            action.reloadContinuationItemsCommand.continuationItems = filterItems(reloadItems, removeShorts, enableAds, hideGuestPrompts);
         }
       });
    }

    // --- ACTION 3: Shorts in Subscriptions & Guest Prompts ---
    // We only perform the expensive recursive search if we are removing Shorts or Guest Prompts.
    if (removeShorts || hideGuestPrompts) {
      
      // Target 1: The "Grid" Renderer. 
      // The Subscription tab usually displays videos in a Grid. Shorts are injected here.
      // We search specifically for 'gridRenderer' to clean the Subscription tab.
      if (removeShorts) {
          var gridRenderer = findFirstObject(data, 'gridRenderer');
          if (gridRenderer && gridRenderer.items) {
             gridRenderer.items = filterItems(gridRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          }
          
          // Also check Grid Continuations (scrolling down in Subs)
          var gridContinuation = findFirstObject(data, 'gridContinuation');
          if (gridContinuation && gridContinuation.items) {
             gridContinuation.items = filterItems(gridContinuation.items, removeShorts, enableAds, hideGuestPrompts);
          }
      }

      // Target 2: Guest Prompts (Feed Nudge)
      // These sometimes appear nested deep in the Home structure.
      if (hideGuestPrompts) {
        var sectionList = findFirstObject(data, 'sectionListRenderer');
        if (sectionList && sectionList.contents) {
          processSectionList(sectionList.contents, enableAds, removeShorts, hideGuestPrompts);
        }
      }
    }

  } catch (e) {
    console.warn('[AdBlock] Error during sanitization:', e);
  }

  return data;
};

/**
 * Modifies a list of Shelf/Row items in place.
 * Used for the main Home Screen rows.
 */
function processSectionList(contents, enableAds, removeShorts, hideGuestPrompts) {
  if (!Array.isArray(contents)) return;

  var writeIdx = 0;
  for (var i = 0; i < contents.length; i++) {
    var item = contents[i];
    var keepItem = true;

    // 1. Remove Home Screen Masthead (The big banner ad at the top)
    if (enableAds) {
      if (item.tvMastheadRenderer || item.adSlotRenderer) {
        keepItem = false;
      }
    }

    // 2. Remove Guest Mode Nudges (Home Screen)
    // The "Make YouTube your own" banner.
    if (hideGuestPrompts) {
        if (item.feedNudgeRenderer || item.alertWithActionsRenderer) {
            keepItem = false;
        }
    }

    // 3. Process Shelves (Horizontal lists of videos)
    if (keepItem && item.shelfRenderer) {
      var shelf = item.shelfRenderer;
      
      // Remove the "Shorts" shelf completely if requested
      if (removeShorts && shelf.tvhtml5ShelfRendererType === 'TVHTML5_SHELF_RENDERER_TYPE_SHORTS') {
          keepItem = false;
      } 
      // Otherwise, clean the items inside the shelf (e.g., remove specific ad tiles)
      else if (shelf.content) {
          if (shelf.content.horizontalListRenderer && shelf.content.horizontalListRenderer.items) {
             shelf.content.horizontalListRenderer.items = filterItems(shelf.content.horizontalListRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          } else if (shelf.content.gridRenderer && shelf.content.gridRenderer.items) {
             shelf.content.gridRenderer.items = filterItems(shelf.content.gridRenderer.items, removeShorts, enableAds, hideGuestPrompts);
          }
      }
    }

    if (keepItem) {
      contents[writeIdx++] = item;
    }
  }
  // Trim the array to the new size (efficient in-place modification)
  contents.length = writeIdx;
}

/**
 * Filters a list of generic items (Grid items, List items).
 * Returns a new array with unwanted items removed.
 */
function filterItems(items, removeShorts, enableAds, hideGuestPrompts) {
  if (!Array.isArray(items)) return items;

  var result = [];
  for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var keep = true;

      // Block Ad Tiles
      if (enableAds && item.adSlotRenderer) keep = false;

      // Block Guest Prompts (Sign in to subscribe, etc.)
      if (hideGuestPrompts) {
          if (item.feedNudgeRenderer || item.alertWithActionsRenderer) keep = false;
      }

      // Block Shorts
      if (removeShorts) {
          // Detect Shorts by their navigation endpoint
          if (item.tileRenderer && item.tileRenderer.onSelectCommand && 
              item.tileRenderer.onSelectCommand.reelWatchEndpoint) {
              keep = false;
          }
          // Detect Shorts in Reel shelves
          if (item.reelItemRenderer) keep = false;
          // Detect specific ad parameters often associated with Shorts ads
          if (item.command && item.command.reelWatchEndpoint && 
              item.command.reelWatchEndpoint.adClientParams) {
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
 * Recursive Helper: Finds the first occurrence of a key in a deep object.
 * Optimized to skip non-object properties early.
 */
function findFirstObject(haystack, needle) {
  if (!haystack || typeof haystack !== 'object') return null;

  // Direct check first (Breadth-first optimization)
  if (haystack[needle]) return haystack[needle];

  for (var key in haystack) {
    if (haystack.hasOwnProperty(key) && typeof haystack[key] === 'object') {
      var result = findFirstObject(haystack[key], needle);
      if (result) return result;
    }
  }
  return null;
}