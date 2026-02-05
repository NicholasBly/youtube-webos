import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { isShortsPage } from './utils'; // Shared State

const DEBUG = false;

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
  typeSignatures: [
    {
      type: 'SHORTS_SEQUENCE',
      detectionPath: ['entries'],
      matchFn: (data) => Array.isArray(data.entries)
    },
    {
      type: 'PLAYER',
      detectionPath: ['streamingData']
    },
    {
      type: 'NEXT',
      detectionPath: ['contents', 'singleColumnWatchNextResults']
    },
    {
      type: 'HOME_BROWSE',
      detectionPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer']
    },
    {
      type: 'BROWSE_TABS',
      detectionPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer']
    },
    {
      type: 'SEARCH',
      detectionPath: ['contents', 'sectionListRenderer'],
      excludePath: ['contents', 'tvBrowseRenderer']
    },
    {
      type: 'CONTINUATION',
      detectionPath: ['continuationContents']
    },
    {
      type: 'ACTION',
      detectionPath: ['onResponseReceivedActions']
    }
  ],
  
  paths: {
    PLAYER: {
      overlayPath: ['playerOverlays', 'playerOverlayRenderer']
    },
    NEXT: {
      overlayPath: ['playerOverlays', 'playerOverlayRenderer'],
      pivotPath: ['contents', 'singleColumnWatchNextResults', 'pivot', 'sectionListRenderer', 'contents']
    },
    SHORTS_SEQUENCE: {
      listPath: ['entries']
    },
    HOME_BROWSE: {
      mainContent: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer', 'content', 'sectionListRenderer', 'contents']
    },
    BROWSE_TABS: {
      tabsPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer', 'sections', '0', 'tvSecondaryNavSectionRenderer', 'tabs']
    },
    SEARCH: {
      mainContent: ['contents', 'sectionListRenderer', 'contents']
    },
    CONTINUATION: {
      sectionPath: ['continuationContents', 'sectionListContinuation', 'contents'],
      gridPath: ['continuationContents', 'gridContinuation', 'items']
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
    data.entries 
  );

  if (!isAPIResponse || data.botguardData) {
    return data;
  }

  try {
    const responseType = detectResponseType(data);
    const needsContentFiltering = enableAdBlock || hideGuestPrompts;

    if (isShortsPage()) {
        const IGNORE_ON_SHORTS = ['SEARCH', 'PLAYER', 'ACTION'];
        if (responseType && IGNORE_ON_SHORTS.includes(responseType)) {
             return data;
        }
    }

    if (responseType && SCHEMA_REGISTRY.paths[responseType]) {
      if (DEBUG) debugLog(`Schema Match: [${responseType}]`);
      applySchemaFilters(data, responseType, config, needsContentFiltering);
    } 
    else if (responseType === 'ACTION' || responseType === 'PLAYER') {
      if (DEBUG) debugLog(`Schema Match: [${responseType}]`);
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

function detectResponseType(data) {
  const signatures = SCHEMA_REGISTRY.typeSignatures;
  
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    
    if (sig.excludePath && getByPath(data, sig.excludePath) !== undefined) {
      continue;
    }

    if (getByPath(data, sig.detectionPath) !== undefined) {
      if (sig.matchFn && !sig.matchFn(data)) {
        continue;
      }
      return sig.type;
    }
  }
  return null;
}

function applySchemaFilters(data, responseType, config, needsContentFiltering) {
  const schema = SCHEMA_REGISTRY.paths[responseType];
  
  switch (responseType) {
    case 'SHORTS_SEQUENCE':
        if (config.enableAdBlock && schema && schema.listPath) {
            const entries = getByPath(data, schema.listPath);
            if (Array.isArray(entries)) {
                const oldLen = entries.length;
                filterItemsOptimized(entries, config, needsContentFiltering);
                if (DEBUG && entries.length !== oldLen) {
                    debugLog(`SHORTS_SEQUENCE: Removed ${oldLen - entries.length} items`);
                }
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
            filterItemsOptimized(gridItems, config, needsContentFiltering);
            if (DEBUG && oldLen !== gridItems.length) {
              debugLog(`CONTINUATION (Grid): Removed ${oldLen - gridItems.length} items`);
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
            filterItemsOptimized(
              action.reloadContinuationItemsCommand.continuationItems,
              config,
              needsContentFiltering
            );
          }
          
          if (action.appendContinuationItemsAction?.continuationItems) {
            filterItemsOptimized(
              action.appendContinuationItemsAction.continuationItems,
              config,
              needsContentFiltering
            );
          }
        }
      }
      break;

    case 'PLAYER':
    case 'NEXT':
      if (config.enableAdBlock) {
        if (responseType === 'PLAYER') {
             removePlayerAdsOptimized(data);
        }
        
        let overlay;
        if (schema && schema.overlayPath) {
          overlay = getByPath(data, schema.overlayPath);
        }

        if (!overlay) {
           overlay = findFirstObject(data, 'playerOverlayRenderer', 8);
           if (DEBUG && overlay) debugLog(`${responseType}: Path failed, found overlay via fallback`);
        }
        
        if (overlay && overlay.timelyActionRenderers) {
          delete overlay.timelyActionRenderers;
          if (DEBUG) debugLog(`${responseType}: Removed timelyActionRenderers (QR Code)`);
        }
      }
      
      if (config.hideGuestPrompts) {
         let pivotContents;
         if (schema && schema.pivotPath) {
             pivotContents = getByPath(data, schema.pivotPath);
         }
         if (!pivotContents) {
             const pivot = findFirstObject(data, 'pivot', 10);
             if (pivot?.sectionListRenderer?.contents) {
                 pivotContents = pivot.sectionListRenderer.contents;
                 if (DEBUG) debugLog(`${responseType}: Found pivot via fallback search`);
             }
         }
         if (Array.isArray(pivotContents)) {
             processSectionListOptimized(pivotContents, config, needsContentFiltering, `${responseType} (Pivot)`);
         }
      }
      break;

    default:
      break;
  }
}

function applyFallbackFilters(data, config, needsContentFiltering) {
  if (config.enableAdBlock) {
    removePlayerAdsOptimized(data);
    
    const overlayRenderer = findFirstObject(data, 'playerOverlayRenderer', 8);
    if (overlayRenderer && overlayRenderer.timelyActionRenderers) {
        delete overlayRenderer.timelyActionRenderers;
        if (DEBUG) debugLog('FALLBACK: Removed timelyActionRenderers');
    }
  }

  const pivot = findFirstObject(data, 'pivot', 10);
  if (pivot?.sectionListRenderer?.contents) {
      if (Array.isArray(pivot.sectionListRenderer.contents)) {
          processSectionListOptimized(pivot.sectionListRenderer.contents, config, needsContentFiltering, 'Fallback Pivot');
      }
  }

  const foundRenderer = findFirstObject(data, 'sectionListRenderer', 10);
  if (foundRenderer?.contents) {
    if (Array.isArray(foundRenderer.contents)) {
      processSectionListOptimized(foundRenderer.contents, config, needsContentFiltering, 'Fallback sectionListRenderer');
    }
  }

  const gridRenderer = findFirstObject(data, 'gridRenderer', 10);
  if (gridRenderer?.items) {
    filterItemsOptimized(gridRenderer.items, config, needsContentFiltering);
  }

  const gridContinuation = findFirstObject(data, 'gridContinuation', 10);
  if (gridContinuation?.items) {
    filterItemsOptimized(gridContinuation.items, config, needsContentFiltering);
  }

  if (Array.isArray(data.onResponseReceivedActions)) {
    for (let i = 0; i < data.onResponseReceivedActions.length; i++) {
      const action = data.onResponseReceivedActions[i];
      
      if (action.reloadContinuationItemsCommand?.continuationItems) {
        filterItemsOptimized(
          action.reloadContinuationItemsCommand.continuationItems,
          config,
          needsContentFiltering
        );
      }
      
      if (action.appendContinuationItemsAction?.continuationItems) {
        filterItemsOptimized(
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
          filterItemsOptimized(hList.items, config, needsContentFiltering); // In-place
        }
        
        const gList = shelf.content.gridRenderer;
        if (gList?.items) {
          filterItemsOptimized(gList.items, config, needsContentFiltering); // In-place
        }
      }
    } 
    else if (hasAdRenderer(item, enableAdBlock)) {
      keepItem = false;
    } 
    else if (hasGuestPromptRenderer(item, hideGuestPrompts)) {
      keepItem = false;
    }
    else if (hideGuestPrompts && item.alertWithActionsRenderer) {
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

  let writeIdx = 0;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let keep = true;

    if (needsContentFiltering) {
      if (hasAdRenderer(item, enableAdBlock) || isReelAd(item, enableAdBlock)) {
        keep = false;
      }
      else if (hasGuestPromptRenderer(item, hideGuestPrompts)) {
        keep = false;
      }
      else if (hideGuestPrompts && item.alertWithActionsRenderer) {
        keep = false;
      }
      else if (hideGuestPrompts && item.gridButtonRenderer) {
        const text = item.gridButtonRenderer.title?.runs?.[0]?.text;
        if (text === 'Sign in for better recommendations') {
            keep = false;
        }
      }
    }

    if (keep && removeGlobalShorts) {
      const tile = item.tileRenderer;
      if (tile) {
        if (tile.style === 'TILE_STYLE_YTLR_SHORTS' ||
            tile.contentType === 'TILE_CONTENT_TYPE_SHORTS' ||
            tile.onSelectCommand?.reelWatchEndpoint) {
          keep = false;
        }
      } 
      else if (item.reelItemRenderer ||
                 item.contentType === 'TILE_CONTENT_TYPE_SHORTS' ||
                 item.onSelectCommand?.reelWatchEndpoint) {
        keep = false;
      }
    }

    if (keep) {
      if (writeIdx !== i) items[writeIdx] = item;
      writeIdx++;
    }
  }

  items.length = writeIdx;
  return items;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getByPath(obj, parts) {
  if (!parts) return undefined;
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

function setByPath(obj, parts, value) {
  if (!parts) return;
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