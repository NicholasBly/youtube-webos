// The left-hand guide and the tab bar: drops the Shorts and Live entries when
// those are hidden. fallback.js finds the guide in a response; BROWSE_TABS
// has it at a known path.
import { UI_STRINGS } from './constants.js';
import { log } from './log.js';

/**
 * Whether a guide or tab entry is one being hidden: by its endpoint first (a
 * reelWatchEndpoint or browseId FEshorts for Shorts, FEtopics_live for Live),
 * then, for Shorts only, by its title.
 */
function isNavEntryBlocked(entry, removeGlobalShorts, removeLiveVideos) {
  if (!entry || typeof entry !== 'object') return false;

  const renderer =
    entry.guideEntryRenderer || entry.tabRenderer || entry.pivotBarItemRenderer || entry;

  const endpoint = renderer.navigationEndpoint || renderer.endpoint || renderer.onSelectCommand;
  if (endpoint) {
    if (removeGlobalShorts && endpoint.reelWatchEndpoint) return true;
    const browseId = endpoint.browseEndpoint?.browseId;
    if (removeGlobalShorts && (browseId === 'FEshorts' || browseId === 'FEshorts_tv')) return true;
    if (removeLiveVideos && browseId === 'FEtopics_live') return true;
  }

  if (removeGlobalShorts) {
    const title =
      renderer.title?.simpleText ||
      renderer.title?.runs?.[0]?.text ||
      renderer.tabIdentifier ||
      (typeof renderer.title === 'string' ? renderer.title : undefined);
    return title === UI_STRINGS.SHORTS_TITLE;
  }
  return false;
}

/** The tab bar of a BROWSE_TABS response, at its known location: no search. */
export function removeBlockedNavTabs(nav, removeGlobalShorts, removeLiveVideos) {
  if ((!removeGlobalShorts && !removeLiveVideos) || !nav) return;
  filterNavLists([nav.sections], removeGlobalShorts, removeLiveVideos);
}

/** Drops the blocked entries of one list in place. */
function dropBlocked(list, removeGlobalShorts, removeLiveVideos) {
  let w = 0;
  for (let k = 0; k < list.length; k++) {
    if (!isNavEntryBlocked(list[k], removeGlobalShorts, removeLiveVideos)) list[w++] = list[k];
  }
  const removed = list.length - w;
  list.length = w;
  if (removed) log.debug(`Guide: removed ${removed} blocked entr(ies)`);
}

/** Drops blocked entries from each list, and from each section's own tabs or items. */
export function filterNavLists(lists, removeGlobalShorts, removeLiveVideos) {
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (!Array.isArray(list)) continue;
    for (let j = 0; j < list.length; j++) {
      const inner =
        list[j]?.tvSecondaryNavSectionRenderer?.tabs || list[j]?.guideSectionRenderer?.items;
      if (Array.isArray(inner)) dropBlocked(inner, removeGlobalShorts, removeLiveVideos);
    }
    dropBlocked(list, removeGlobalShorts, removeLiveVideos);
  }
}
