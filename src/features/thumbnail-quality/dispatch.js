// Where each InnerTube response type keeps its thumbnails: the known paths per
// type, the bounded scan for shapes no path matched, and the entry point the
// JSON.parse hook calls.
import {
  SCAN_MAX_NODES,
  SCAN_MAX_DEPTH,
  SCAN_MIN_TEXT_LENGTH,
  PROMOTION_DEBOUNCE
} from './constants.js';
import { SCHEMA_REGISTRY, getByPath, forEachItemList } from '../../core/innertube.js';
import { state, pendingPromotions } from './state.js';
import { deferProbes } from './probes.js';
import { schedulePromotionSweep } from './promotion.js';
import { upgradeContainer } from './rewrite.js';
import { log } from './log.js';

// --- Item-level paths -----------------------------------------------------
// Everything below is O(1) per item: no recursion, no searching. These are the
// shapes seen in real home / continuation / watch responses, plus the legacy
// renderers kept as cheap insurance.

/**
 * Upgrades the thumbnails of one item of a list (a tile with its long-press menu copy, or the other
 * renderer kinds); returns how many URLs it changed.
 */
function upgradeItem(item) {
  if (!item || typeof item !== 'object') return 0;
  let changed = 0;

  // A watch-page playlist row wraps the tile one level deeper.
  const tile =
    item.tileRenderer || item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.tileRenderer;

  if (tile) {
    const header = tile.header?.tileHeaderRenderer;
    changed += upgradeContainer(header?.thumbnail);
    changed += upgradeContainer(header?.thumbnailViewModel?.image);
    // The long-press menu carries its own copy of the same URL. Rewriting it
    // too keeps both pointing at one file, so opening the menu is an HTTP cache
    // hit instead of a fresh download of the original 320x180.
    changed += upgradeContainer(tile.onLongPressCommand?.showMenuCommand?.thumbnail);
    return changed;
  }

  changed += upgradeContainer(item.previewButtonRenderer?.thumbnail);
  changed += upgradeContainer(item.pivotVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.lockupViewModel?.contentImage?.thumbnailViewModel?.image);
  // Legacy renderers — not produced by current tvhtml5 builds, but free.
  changed += upgradeContainer(item.gridVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.compactVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.videoRenderer?.thumbnail);
  return changed;
}

/** upgradeItem over a list; returns the total changed. */
function upgradeItems(items) {
  if (!Array.isArray(items)) return 0;
  if (items.length > 0) state.listsSeen++;
  let changed = 0;
  for (let i = 0; i < items.length; i++) changed += upgradeItem(items[i]);
  return changed;
}

/** One shelf list upgraded, its changes added to `tally` (forEachItemList's argument). */
function upgradeListInto(items, tally) {
  tally.changed += upgradeItems(items);
}

/**
 * The shelves of a section list. The list itself does not count as found
 * (state.listsSeen): a list whose shelves the walk does not know holds no
 * item list it can reach, and is scanned.
 */
function upgradeSectionList(contents) {
  if (!Array.isArray(contents)) return 0;
  const tally = { changed: 0 };

  for (let i = 0; i < contents.length; i++) {
    const section = contents[i];
    if (!section) continue;
    // The same walk through the shelf shapes the filters use; a section that
    // holds no list is a bare item (search interleaves them among the shelves).
    if (forEachItemList(section, upgradeListInto, tally) === 0 && !section.shelfRenderer) {
      tally.changed += upgradeItem(section);
    }
  }
  return tally.changed;
}

// Continuations that carry no video thumbnails: live chat polls every few
// seconds while a stream plays, and a scan of each would cost up to
// SCAN_MAX_NODES for nothing.
const NO_THUMBNAIL_CONTINUATIONS = {
  liveChatContinuation: true,
  commentRepliesContinuation: true,
  commentSectionContinuation: true
};

/** Whether every key of the continuation is one known to hold no thumbnails. */
function isThumbnailFreeContinuation(contents) {
  let any = false;
  for (const key in contents) {
    if (!NO_THUMBNAIL_CONTINUATIONS[key]) return false;
    any = true;
  }
  return any;
}

// --- Response-type dispatch ----------------------------------------------
// The content paths are SCHEMA_REGISTRY's, so both engines agree on where a
// given response keeps its content; the rest are thumbnail-only locations.

const SCHEMA = SCHEMA_REGISTRY.paths;
const P = {
  HOME: SCHEMA.HOME_BROWSE.mainContent,
  TABS: SCHEMA.BROWSE_TABS.navPath.concat('sections'),
  SEARCH: SCHEMA.SEARCH.mainContent,
  CONT_SECTION: SCHEMA.CONTINUATION.sectionPath,
  CONT_TVSURFACE: SCHEMA.CONTINUATION.tvSurfacePath,
  CONT_GRID: SCHEMA.CONTINUATION.gridPath,
  CONT_HORIZ: SCHEMA.CONTINUATION.horizontalPath,
  PIVOT: SCHEMA.NEXT.pivotPath,
  AUTOPLAY: ['contents', 'singleColumnWatchNextResults', 'autoplay', 'autoplay'],
  REPLAY_BG: [
    'playerOverlays',
    'playerOverlayRenderer',
    'replay',
    'playerOverlayReplayRenderer',
    'background'
  ],
  CURRENT_THUMB: ['currentVideoThumbnail'],
  MICROFORMAT: ['microformat', 'playerMicroformatRenderer', 'thumbnail'],
  VIDEO_DETAILS: ['videoDetails', 'thumbnail']
};

/** Upgrades the next-video item of each autoplay set. */
function upgradeAutoplaySets(sets) {
  if (!Array.isArray(sets)) return 0;
  let changed = 0;
  for (let i = 0; i < sets.length; i++) {
    const item =
      sets[i]?.nextVideoRenderer?.autoplayVideoWrapperRenderer?.primaryEndpointRenderer
        ?.autoplayEndpointRenderer?.item;
    if (item) changed += upgradeItem(item);
  }
  return changed;
}

/**
 * Upgrades the autoplay suggestions of a watch response: the sets, the modified sets and the replay
 * card.
 */
function upgradeAutoplay(autoplay) {
  if (!autoplay) return 0;
  let changed = 0;
  changed += upgradeAutoplaySets(autoplay.sets);
  changed += upgradeAutoplaySets(autoplay.modifiedSets);
  changed += upgradeContainer(autoplay.replayVideoRenderer?.pivotVideoRenderer?.thumbnail);
  return changed;
}

/** Upgrades the sections of every tab of a browse page's secondary navigation. */
function upgradeBrowseTabs(sections) {
  if (!Array.isArray(sections)) return 0;
  let changed = 0;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      changed += upgradeSectionList(content.sectionListRenderer?.contents);
      changed += upgradeSectionList(
        content.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents
      );
    }
  }
  return changed;
}

/** Upgrades the items that reload or append actions (continuations) carry. */
function upgradeActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let changed = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    changed += upgradeItems(action.reloadContinuationItemsCommand?.continuationItems);
    changed += upgradeItems(action.appendContinuationItemsAction?.continuationItems);
  }
  return changed;
}

/**
 * Continuation payloads, in all four shapes.
 *
 * Called for every response rather than only for responseType 'CONTINUATION',
 * because a continuation is not always classified as one. A shelf continuation
 * under the playing video arrives with `contents.singleColumnWatchNextResults`
 * still attached, and detectResponseType() checks NEXT before CONTINUATION — so
 * the response is typed NEXT while every thumbnail in it lives under
 * `continuationContents.sectionListContinuation`.
 */
function upgradeContinuation(data) {
  let changed = 0;
  changed += upgradeSectionList(getByPath(data, P.CONT_SECTION));
  changed += upgradeSectionList(getByPath(data, P.CONT_TVSURFACE));
  changed += upgradeItems(getByPath(data, P.CONT_GRID));
  changed += upgradeItems(getByPath(data, P.CONT_HORIZ));
  return changed;
}

/**
 * Last-resort bounded walk, used only when the schema paths produced nothing.
 * Keeps the module working through an InnerTube reshuffle instead of silently
 * doing nothing, without ever putting a full traversal on the hot path.
 */
function scanForThumbnails(root) {
  if (!root || typeof root !== 'object') return 0;
  const queue = [root, 0];
  let index = 0;
  let visited = 0;
  let changed = 0;

  while (index < queue.length) {
    if (++visited > SCAN_MAX_NODES) break;
    const node = queue[index++];
    const depth = queue[index++];
    if (!node || typeof node !== 'object' || depth > SCAN_MAX_DEPTH) continue;

    if (Array.isArray(node.thumbnails) || Array.isArray(node.sources)) {
      changed += upgradeContainer(node);
    }

    // Children past the depth bound would only be dequeued and skipped.
    const nextDepth = depth + 1;
    if (nextDepth > SCAN_MAX_DEPTH) continue;
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') queue.push(value, nextDepth);
    }
  }
  if (changed) log.debug(`fallback scan upgraded ${changed} (visited ${visited})`);
  return changed;
}

// Where the scan of a type starts: as far down its section-list path as the
// response still goes. From the root a home tile's container sits at depth
// 17, a browse tab's deeper, past SCAN_MAX_DEPTH; from there they are within it.
const SCAN_FROM = { HOME_BROWSE: P.HOME, BROWSE_TABS: P.TABS };

/**
 * Where the thumbnail scan of a response type starts: down SCAN_FROM's path as far as it exists.
 */
function scanRoot(data, type) {
  const path = SCAN_FROM[type] || [];
  let node = data;
  for (let i = 0; i < path.length; i++) {
    const next = node[path[i]];
    if (!next || typeof next !== 'object') break;
    node = next;
  }
  return node;
}

/**
 * The thumbnails at the known paths of `type`, rewritten; the count. A type
 * whose paths reach no item list at all gets the bounded scan, an unknown
 * type gets it when the body is large enough to be worth one, and a type
 * with nothing to find gets neither.
 */
function upgradeByType(data, type, textLength) {
  let changed = 0;
  switch (type) {
    case 'HOME_BROWSE':
      changed += upgradeSectionList(getByPath(data, P.HOME));
      break;
    case 'BROWSE_TABS':
      changed += upgradeBrowseTabs(getByPath(data, P.TABS));
      break;
    case 'SEARCH':
      changed += upgradeSectionList(getByPath(data, P.SEARCH));
      break;
    case 'CONTINUATION':
      // Rewritten before the type (upgradeContinuation); a live chat or
      // comment poll is not worth a scan.
      if (isThumbnailFreeContinuation(data.continuationContents)) return 0;
      break;
    case 'SHORTS_SEQUENCE':
      // Reel entries carry only the oar* derivatives, which have no ladder
      // here, so there is nothing to rewrite and nothing worth a scan.
      return 0;
    case 'ACTION':
      // A body can carry both.
      changed += upgradeActions(data.onResponseReceivedActions);
      changed += upgradeActions(data.onResponseReceivedEndpoints);
      break;
    case 'NEXT':
      changed += upgradeSectionList(getByPath(data, P.PIVOT));
      changed += upgradeAutoplay(getByPath(data, P.AUTOPLAY));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      changed += upgradeContainer(getByPath(data, P.CURRENT_THUMB));
      break;
    case 'PLAYER':
      changed += upgradeContainer(getByPath(data, P.VIDEO_DETAILS));
      changed += upgradeContainer(getByPath(data, P.MICROFORMAT));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      break;
    default:
      // An unknown shape: nothing but the bounded scan can find its thumbnails.
      // Small bodies (settings, the guide, a comment or two) are not worth it;
      // the same size threshold gates the fallback filters in parse-hook.js.
      return textLength > SCAN_MIN_TEXT_LENGTH ? scanForThumbnails(data) : 0;
  }

  // A known response type whose paths found no item list and no thumbnail at
  // all means the shape moved. Finding lists and changing nothing is the
  // normal first sight of a video in the modes that wait for proof, and a
  // list of comments is still a list: neither may cost a full walk.
  if (state.listsSeen === 0) changed += scanForThumbnails(scanRoot(data, type));
  return changed;
}

/**
 * Entry point called from the JSON.parse hook in adblock/parse-hook.js.
 * `responseType` is the type adblock already detected, so this costs no extra
 * detection pass; `textLength` is the length of the JSON text, which the hook
 * already has.
 */
export function upgradeResponseThumbnails(data, responseType, textLength) {
  if (!state.enabled || !data || typeof data !== 'object' || Array.isArray(data)) return 0;

  // Stamped on every parse, including ones that rewrite nothing: an empty
  // continuation is still evidence the surface is moving. admitToTier() reads
  // this to decide whether the surface has gone quiet, so without it the
  // scroll gate is inert and probes drain straight into an active scroll.
  state.lastParseAt = performance.now();
  state.listsSeen = 0;

  // Before the type: any response type can carry a continuation alongside its
  // own contents, and the type it gets classified as depends on whichever
  // signature detectResponseType() happens to test first.
  let changed = data.continuationContents ? upgradeContinuation(data) : 0;
  changed += upgradeByType(data, responseType, textLength);

  if (changed) log.debug(`${responseType || 'unknown'}: rewrote ${changed} thumbnail URLs`);
  // Not gated on `changed`: a response that rewrote nothing can still have
  // queued probes (unproven rungs in 'safe'), and those must start now
  // rather than wait for some later parse that happens to change a URL.
  // deferProbes() returns at once when the queue is empty.
  deferProbes();
  // Scrolling is what brings a stale tile on screen, and scrolling is what
  // produces parses - so this is the cheapest possible trigger for a retry.
  if (pendingPromotions.size > 0) schedulePromotionSweep(PROMOTION_DEBOUNCE);
  return changed;
}
