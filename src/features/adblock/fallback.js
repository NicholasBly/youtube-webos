// The fallback for a response no schema path matched, and the guide filter
// for the small guide response: one bounded search over the body serves both.
import { log } from './log.js';
import { findObjects } from './search.js';
import { filterNavLists } from './nav-filters.js';
import { filterSectionList } from './item-filters.js';
import { removeEndcards, removePlayerAds } from './player-filters.js';
import { filterList, processActions } from './response-filters.js';

const NAV_NEEDLES = [
  'tvSecondaryNavRenderer',
  'guideRenderer',
  'pivotBarRenderer',
  'items',
  'tabs',
  'sections'
];

const FALLBACK_NEEDLES = [
  'playerOverlayRenderer',
  'pivot',
  'sectionListRenderer',
  'gridRenderer',
  'gridContinuation',
  'sectionListContinuation',
  'entries'
].concat(NAV_NEEDLES);

/** The guide lists in a findObjects() result, filtered. */
function filterNavFound(found, removeGlobalShorts, removeLiveVideos) {
  if (!removeGlobalShorts && !removeLiveVideos) return;
  filterNavLists(
    [
      found.tvSecondaryNavRenderer?.sections,
      found.guideRenderer?.items,
      found.pivotBarRenderer?.items,
      found.tabs,
      found.sections,
      found.items
    ],
    removeGlobalShorts,
    removeLiveVideos
  );
}

/**
 * The guide arrives in its own small response that matches no content schema:
 * searched for the guide and tab renderers (bounded) and filtered. The known
 * shape, BROWSE_TABS, goes through removeBlockedNavTabs instead.
 */
export function removeBlockedNavEntries(data, removeGlobalShorts, removeLiveVideos) {
  if (!data || typeof data !== 'object') return;
  filterNavFound(findObjects(data, NAV_NEEDLES, 8), removeGlobalShorts, removeLiveVideos);
}

/** A large body no schema path matched: the content and guide filters over whatever the search finds. */
export function applyFallbackFilters(data, config) {
  if (config.enableAdBlock) removePlayerAds(data);
  if (config.hideEndcards) removeEndcards(data);
  const found = findObjects(data, FALLBACK_NEEDLES, 10);
  filterNavFound(found, config.removeGlobalShorts, config.removeLiveVideos);

  if (config.enableAdBlock && found.playerOverlayRenderer?.timelyActionRenderers) {
    delete found.playerOverlayRenderer.timelyActionRenderers;
    log.debug('FALLBACK: Removed timelyActionRenderers');
  }
  filterSectionList(found.pivot?.sectionListRenderer?.contents, config, 'Fallback Pivot');
  filterSectionList(found.sectionListRenderer?.contents, config, 'Fallback sectionListRenderer');
  filterSectionList(
    found.sectionListContinuation?.contents,
    config,
    'Fallback sectionListContinuation'
  );

  filterList(found.gridRenderer?.items, config, 'FALLBACK (Grid)');
  filterList(found.gridContinuation?.items, config, 'FALLBACK (Grid Continuation)');
  filterList(found.entries, config, 'FALLBACK (Entries)');

  // A body can carry both.
  processActions(data.onResponseReceivedActions, config);
  processActions(data.onResponseReceivedEndpoints, config);
}
