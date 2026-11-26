// Shelves and the items in them: ads, Shorts, live streams and guest prompts,
// removed in place; a shelf that ends up empty goes with its items.
import { UI_STRINGS, YT_CONSTANTS } from './constants.js';
import { wrapEmojiInTree } from './emoji-wrap.js';
import { forEachItemList } from '../../core/innertube.js';
import { log } from './log.js';

/** A shelf's title text, from its own title or its header's avatar lockup; '' when it has none. */
function getShelfTitle(shelf) {
  if (!shelf) return '';
  return (
    shelf.title?.runs?.[0]?.text ||
    shelf.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer?.title?.runs?.[0]
      ?.text ||
    ''
  );
}

/**
 * Is this item a live stream?
 *
 * The badge lives at, from an item in a shelf's item list:
 *   lockupViewModel.contentImage.thumbnailViewModel
 *     .overlays[].thumbnailBottomOverlayViewModel
 *     .badges[].thumbnailBadgeViewModel.badgeStyle
 *
 * Both arrays are searched rather than indexed at [0]: a thumbnail carries
 * several overlays (duration, progress, badges) and their order is not
 * guaranteed, so hardcoding the first entry would miss the badge whenever
 * anything else is attached to the thumbnail.
 *
 * The older tileRenderer shape is kept as a fallback so this keeps working if
 * the viewModel schema is swapped out again.
 */
function isLiveItem(item) {
  if (!item) return false;

  const overlays = item.lockupViewModel?.contentImage?.thumbnailViewModel?.overlays;
  if (Array.isArray(overlays)) {
    for (let i = 0; i < overlays.length; i++) {
      const badges = overlays[i]?.thumbnailBottomOverlayViewModel?.badges;
      if (!Array.isArray(badges)) continue;
      for (let b = 0; b < badges.length; b++) {
        if (badges[b]?.thumbnailBadgeViewModel?.badgeStyle === YT_CONSTANTS.BADGE_STYLE_LIVE) {
          return true;
        }
      }
    }
  }

  // Fallback 1: the tileRenderer schema this app already handles elsewhere.
  const tileBadges = item.tileRenderer?.header?.tileHeaderRenderer?.thumbnailOverlays;
  if (Array.isArray(tileBadges)) {
    for (let i = 0; i < tileBadges.length; i++) {
      const style = tileBadges[i]?.thumbnailOverlayTimeStatusRenderer?.style;
      if (
        style === YT_CONSTANTS.TIME_STATUS_STYLE_LIVE ||
        style === YT_CONSTANTS.TIME_STATUS_STYLE_LIVE_LONG
      ) {
        return true;
      }
    }
  }

  // Fallback 2: the tile's own content type.
  if (item.tileRenderer?.contentType === YT_CONSTANTS.CONTENT_TYPE_LIVE) return true;

  return false;
}

/**
 * Whether a Shorts item is an ad (flagged in its reelWatchEndpoint, or of the reel-ad video type).
 */
function isReelAd(item) {
  const endpoint = item.command?.reelWatchEndpoint;
  return (
    endpoint?.adClientParams?.isAd === true ||
    endpoint?.adClientParams?.isAd === 'true' ||
    endpoint?.videoType === YT_CONSTANTS.VIDEO_TYPE_REEL_AD
  );
}

/** Whether an item is an ad slot or the home page masthead ad. */
function hasAdRenderer(item) {
  return !!(item.adSlotRenderer || item.tvMastheadRenderer);
}

/** Whether an item is one of the sign-in nudges shown to guests. */
function isGuestPrompt(item) {
  return !!(
    item.feedNudgeRenderer ||
    item.alertWithActionsRenderer ||
    item.gridButtonRenderer?.title?.runs?.[0]?.text === UI_STRINGS.GUEST_PROMPT_TEXT
  );
}

/**
 * Whether an item is a Short: a Shorts tile, a reel item, or anything that opens the Shorts player.
 */
function isShortsItem(item) {
  const tile = item.tileRenderer;
  if (
    tile &&
    (tile.style === YT_CONSTANTS.TILE_STYLE_SHORTS ||
      tile.contentType === YT_CONSTANTS.CONTENT_TYPE_SHORTS ||
      tile.onSelectCommand?.reelWatchEndpoint)
  ) {
    return true;
  }
  return !!(
    item.reelItemRenderer ||
    item.contentType === YT_CONSTANTS.CONTENT_TYPE_SHORTS ||
    item.onSelectCommand?.reelWatchEndpoint
  );
}

/**
 * Whether an item (a tile, a lockup, a nudge) goes under the flags: the one
 * rule for items in a shelf, in a grid or continuation, and bare in a section
 * list.
 */
function shouldDropItem(item, flags) {
  if (flags.enableAdBlock && (hasAdRenderer(item) || isReelAd(item))) return true;
  if (flags.hideGuestSignInPrompts && isGuestPrompt(item)) return true;
  if (flags.removeGlobalShorts && isShortsItem(item)) return true;
  return !!flags.removeLiveVideos && isLiveItem(item);
}

/**
 * Whether any check applies to a shelf or to an item under the flags: every
 * one of them counts only with Ad Blocking on (flags.js).
 */
function anyContentCheck(flags) {
  return !!flags.enableAdBlock;
}

/** Whether a whole shelf goes under the flags: the Shorts shelf by type or title, the titled shelves. */
function shouldDropShelf(shelf, flags) {
  const { removeGlobalShorts, removeTopLiveGames, removeMostRelevant } = flags;
  if (removeGlobalShorts && shelf.tvhtml5ShelfRendererType === YT_CONSTANTS.SHELF_TYPE_SHORTS) {
    return true;
  }
  if (!removeGlobalShorts && !removeTopLiveGames && !removeMostRelevant) return false;
  const title = getShelfTitle(shelf);
  return (
    (removeGlobalShorts && title === UI_STRINGS.SHORTS_TITLE) ||
    (removeTopLiveGames && title === UI_STRINGS.TOP_LIVE_GAMES_TITLE) ||
    (removeMostRelevant && title === UI_STRINGS.MOST_RELEVANT_TITLE)
  );
}

/**
 * One nested list filtered, counting the items it had in `pass.had` and the
 * items left in `pass.left`. Declared once, with the pass's state as its
 * argument, rather than as a closure for every shelf of every response.
 * skipEmoji: the caller's wrapEmojiInTree(item) walks the whole
 * section, nested items included.
 */
function filterNestedList(list, pass) {
  pass.had += list.length;
  filterItems(list, pass.config, true);
  pass.left += list.length;
}

/**
 * Filters a shelf's lists in place and says whether the shelf stays: not
 * when its type or title is blocked, and not when the filtering emptied it.
 * A shelf we emptied has to go with its items: left in place it still has a
 * title and a content box, so the app renders the header plus a
 * <ytlr-ghost-surface> of skeleton tiles and waits forever for content that
 * was already removed (the "Live now" row of grey boxes). Only a shelf the
 * filter emptied: one whose content uses some other renderer was never
 * filtered here, and one that arrived with an empty list was not emptied here.
 */
function shelfSurvives(item, config, contextName, pass) {
  const shelf = item.shelfRenderer;
  if (shouldDropShelf(shelf, config)) return false;
  pass.had = 0;
  pass.left = 0;
  const lists = forEachItemList(item, filterNestedList, pass);
  if (lists > 0 && pass.had > 0 && pass.left === 0) {
    log.debug(
      `${contextName ? contextName + ': ' : ''}Dropped emptied shelf "${getShelfTitle(shelf)}"`
    );
    return false;
  }
  return true;
}

// skipEmoji: see filterItems below.
export function filterSectionList(contents, config, contextName = '', skipEmoji = false) {
  if (!Array.isArray(contents) || contents.length === 0) return;
  const enableLegacyEmojiFix = skipEmoji ? false : config.enableLegacyEmojiFix;
  // With nothing to check the pass would walk every shelf to keep everything.
  if (!enableLegacyEmojiFix && !anyContentCheck(config)) return;
  const initialCount = contents.length;
  const pass = { config, had: 0, left: 0 };
  let writeIdx = 0;

  for (let i = 0; i < contents.length; i++) {
    const item = contents[i];
    let keepItem = true;

    if (item.shelfRenderer) {
      keepItem = shelfSurvives(item, config, contextName, pass);
    } else if (forEachItemList(item, filterNestedList, pass) === 0) {
      // A bare grid or horizontal list keeps its (filtered) place; anything
      // else is an item of its own.
      if (shouldDropItem(item, config)) keepItem = false;
    }

    if (keepItem) {
      if (enableLegacyEmojiFix) wrapEmojiInTree(item);
      if (writeIdx !== i) contents[writeIdx] = item;
      writeIdx++;
    }
  }
  contents.length = writeIdx;

  const removed = initialCount - writeIdx;
  if (removed > 0) {
    log.debug(
      `${contextName ? contextName + ': ' : ''}Filtered ${removed} top-level items from ${initialCount}`
    );
  }
}

// skipEmoji: set when the caller runs its own wrapEmojiInTree over an
// ancestor of these items, so each tile is walked once.
export function filterItems(items, config, skipEmoji) {
  if (!Array.isArray(items) || items.length === 0) return;
  const enableLegacyEmojiFix = skipEmoji ? false : config.enableLegacyEmojiFix;
  // Whether any per-item check applies at all; otherwise the loop is skipped.
  const anyCheck = anyContentCheck(config);
  if (!anyCheck && !enableLegacyEmojiFix) return;

  // Compacted in place, inline rather than through a helper: this is the loop
  // every tile of every response goes through.
  let writeIdx = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (anyCheck && shouldDropItem(item, config)) continue;
    if (enableLegacyEmojiFix) wrapEmojiInTree(item);
    if (writeIdx !== i) items[writeIdx] = item;
    writeIdx++;
  }
  items.length = writeIdx;
}
