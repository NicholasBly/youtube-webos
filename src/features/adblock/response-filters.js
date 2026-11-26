// What gets removed from each response type, along the known schema paths;
// fallback.js handles the responses no path matched.
import { SCHEMA_REGISTRY, getByPath } from '../../core/innertube.js';
import { atPathOrSearch } from './search.js';
import { wrapEmojiInTree } from './emoji-wrap.js';
import { removeBlockedNavTabs } from './nav-filters.js';
import { filterSectionList, filterItems } from './item-filters.js';
import { removeEndcards, removePlayerAds } from './player-filters.js';
import { log } from './log.js';

// `skipEmoji`, here and below: the caller runs wrapEmojiInTree over an
// ancestor of these items afterwards, so the per-item walk would be a second
// pass over the same text.

/** Filters a list of items in place and logs how many went. */
export function filterList(items, config, label, skipEmoji) {
  if (!Array.isArray(items)) return;
  const oldLen = items.length;
  filterItems(items, config, skipEmoji);
  if (items.length !== oldLen) log.debug(`${label}: Removed ${oldLen - items.length} items`);
}

/** The section list at `path`, or the first sectionListRenderer in the response when the path misses. */
function sectionListAt(data, path, responseType) {
  return atPathOrSearch(data, path, 'sectionListRenderer', 8, responseType, (r) => r.contents);
}

/** Filters the section list a schema names as a response's main content. */
function filterMainContent(data, schema, config, responseType) {
  const contents = sectionListAt(data, schema.mainContent, responseType);
  filterSectionList(contents, config, responseType);
}

/** Filters the ads out of the Shorts player's sequence of upcoming Shorts. */
function filterShortsSequence(data, schema, config) {
  if (config.enableAdBlock) {
    filterList(getByPath(data, schema.listPath), config, 'SHORTS_SEQUENCE');
  }
}

/**
 * Removes the Shorts and Live tabs from a browse response's tab bar, then filters every tab's
 * sections.
 */
function filterBrowseTabs(data, schema, config) {
  // The tab bar itself: Shorts and Live entries go before their content is looked at.
  removeBlockedNavTabs(
    getByPath(data, schema.navPath),
    config.removeGlobalShorts,
    config.removeLiveVideos
  );
  const tabs = getByPath(data, schema.tabsPath);
  if (!Array.isArray(tabs)) return;
  for (let i = 0; i < tabs.length; i++) {
    const content = tabs[i].tabRenderer?.content;
    const gridContents =
      content?.sectionListRenderer?.contents ||
      content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    filterSectionList(gridContents, config, 'BROWSE_TAB_GENERIC');
  }
}

/**
 * Filters every list shape a continuation (the next rows or items of a page) can arrive in, and
 * wraps its emoji once at the end when the emoji fix is on.
 */
function filterContinuation(data, schema, config) {
  // The whole continuation is walked for emoji below, once.
  const walksAfter = !!config.enableLegacyEmojiFix;
  const sections = getByPath(data, schema.sectionPath);
  filterSectionList(sections, config, 'CONTINUATION (Section)', walksAfter);
  const tvSurface = getByPath(data, schema.tvSurfacePath);
  filterSectionList(tvSurface, config, 'CONTINUATION (TV Surface)', walksAfter);
  filterList(getByPath(data, schema.gridPath), config, 'CONTINUATION (Grid)', walksAfter);
  filterList(
    getByPath(data, schema.horizontalPath),
    config,
    'CONTINUATION (Horizontal)',
    walksAfter
  );
  if (walksAfter) wrapEmojiInTree(data.continuationContents);
}

/** The received actions and endpoints: a body can carry both. */
function filterActions(data, config) {
  const walksAfter = !!config.enableLegacyEmojiFix;
  const lists = [data.onResponseReceivedActions, data.onResponseReceivedEndpoints];
  for (let i = 0; i < lists.length; i++) {
    if (!Array.isArray(lists[i])) continue;
    processActions(lists[i], config, walksAfter);
    if (walksAfter) wrapEmojiInTree(lists[i]);
  }
}

/**
 * The QR-code prompt in the player overlay, found along the path, or on NEXT
 * by search when the path misses. A player response is parsed at every video
 * start and keeps its overlay at the path; a search over it would be a walk
 * of the whole streaming data for nothing.
 */
function removeTimelyActions(data, schema, responseType) {
  const overlay =
    responseType === 'NEXT'
      ? atPathOrSearch(data, schema.overlayPath, 'playerOverlayRenderer', 8, responseType)
      : getByPath(data, schema.overlayPath);
  if (overlay?.timelyActionRenderers) {
    delete overlay.timelyActionRenderers;
    log.debug(`${responseType}: Removed timelyActionRenderers (QR Code)`);
  }
}

/** The pivot (guest prompts) section list, found along the path or by search. */
function filterPivot(data, schema, config, responseType, skipEmoji) {
  const pivotContents = atPathOrSearch(
    data,
    schema.pivotPath,
    'pivot',
    8,
    responseType,
    (p) => p.sectionListRenderer?.contents
  );
  filterSectionList(pivotContents, config, `${responseType} (Pivot)`, skipEmoji);
}

/** PLAYER and NEXT: player ads, the QR-code prompt, endcards, guest prompts and the legacy emoji fix. */
function filterWatchResponse(data, schema, config, responseType) {
  if (config.enableAdBlock) {
    if (responseType === 'PLAYER') removePlayerAds(data);
    removeTimelyActions(data, schema, responseType);
  }
  if (config.hideEndcards) removeEndcards(data);
  // The pivot is NEXT's; a player response has no path for it, and a search
  // for one there found nothing on every video start.
  if (config.hideGuestSignInPrompts && responseType === 'NEXT') {
    // The pivot sits inside singleColumnWatchNextResults, walked below.
    filterPivot(data, schema, config, responseType, !!config.enableLegacyEmojiFix);
  }
  // The emoji of NEXT's watch-next tree, overlays and panels. A player
  // response's text is in bare strings (videoDetails), which the walk leaves
  // alone, so it has none to wrap.
  if (!config.enableLegacyEmojiFix || responseType !== 'NEXT') return;
  wrapEmojiInTree(getByPath(data, ['contents', 'singleColumnWatchNextResults']));
  wrapEmojiInTree(getByPath(data, ['playerOverlays']));
  wrapEmojiInTree(getByPath(data, ['engagementPanels']));
}

// One filter per response type. Each gets the parsed response, its schema
// paths and the config, and edits the response in place; the actions filter
// reads no paths. Other response types carry nothing these filters know about; the
// hook falls back to fallback.js when the size warrants it.
const RESPONSE_FILTERS = new Map([
  ['SHORTS_SEQUENCE', filterShortsSequence],
  ['HOME_BROWSE', filterMainContent],
  ['SEARCH', filterMainContent],
  ['BROWSE_TABS', filterBrowseTabs],
  ['CONTINUATION', filterContinuation],
  ['ACTION', (data, _schema, config) => filterActions(data, config)],
  ['PLAYER', filterWatchResponse],
  ['NEXT', filterWatchResponse]
]);

/**
 * Runs the filter registered for `responseType`, plus the continuation and received-actions filters
 * when the response carries those beside its main content.
 */
export function applySchemaFilters(data, responseType, config) {
  const filter = RESPONSE_FILTERS.get(responseType);
  if (filter) filter(data, SCHEMA_REGISTRY.paths[responseType], config, responseType);
  // A response is typed by its main content, but can carry a continuation or
  // received actions beside it; those get their filters too.
  if (responseType !== 'CONTINUATION' && data.continuationContents) {
    filterContinuation(data, SCHEMA_REGISTRY.paths.CONTINUATION, config);
  }
  if (
    responseType !== 'ACTION' &&
    (data.onResponseReceivedActions || data.onResponseReceivedEndpoints)
  ) {
    filterActions(data, config);
  }
}

/** The continuation items carried by received actions or endpoints, filtered. */
export function processActions(actions, config, skipEmoji) {
  if (!Array.isArray(actions)) return;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (action.reloadContinuationItemsCommand?.continuationItems) {
      filterItems(action.reloadContinuationItemsCommand.continuationItems, config, skipEmoji);
    }
    if (action.appendContinuationItemsAction?.continuationItems) {
      filterItems(action.appendContinuationItemsAction.continuationItems, config, skipEmoji);
    }
  }
}
