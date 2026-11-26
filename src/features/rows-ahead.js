// Rows loaded ahead. The app asks for the next rows of a vertical list (the
// home feed, a browse tab, search results) once fewer rows than a threshold
// are left below the focused one: the response's own
// nextContinuationData.autoloadThresholdItemsFromEnd when above 0, else the
// section_list_continuation_threshold flag, else 3. YouTube sends the flag as
// 1, so the next rows are asked for only on the last row, and a quick run down
// the home screen reaches rows that have not arrived. The response's value
// outranks the flag, so the parse hook raises it on every section list a
// response carries. Load Rows Ahead in the settings (on by default) switches
// the pass, in adblock/parse-hook.js. A list filled on visibility
// (autoloadEnabled with autoloadOnVisible) does not read the threshold; the
// counters below say whether the TV is ever sent one.
import { SCHEMA_REGISTRY, getByPath } from '../core/innertube.js';

/** Rows left below the focused one when the app asks for the next ones. */
export const ROWS_AHEAD = 4;

// What the TV is actually sent, read on it from the web inspector as
// window.__ytafContinuationStats.
const continuationStats = {
  // Section-list continuations seen, and those raised to ROWS_AHEAD.
  seen: 0,
  raised: 0,
  // The last one as YouTube sent it.
  lastSent: null,
  // The app's flag (window.environment.flags), once the page has set it.
  appFlag: undefined
};
window.__ytafContinuationStats = continuationStats;

// The section list itself: the content paths of core/innertube.js end at its contents.
const listAt = (contentsPath) => contentsPath.slice(0, -1);
const paths = SCHEMA_REGISTRY.paths;
const SECTION_LISTS = {
  HOME_BROWSE: [listAt(paths.HOME_BROWSE.mainContent)],
  SEARCH: [listAt(paths.SEARCH.mainContent)],
  CONTINUATION: [listAt(paths.CONTINUATION.sectionPath), listAt(paths.CONTINUATION.tvSurfacePath)]
};

/**
 * Raises each continuation of a list to load ROWS_AHEAD items before the end (never lowers it),
 * recording what YouTube sent.
 */
function raiseList(list) {
  const continuations = list?.continuations;
  if (!Array.isArray(continuations)) return;
  for (let i = 0; i < continuations.length; i++) {
    const next = continuations[i]?.nextContinuationData;
    if (!next) continue;
    const sent = next.autoloadThresholdItemsFromEnd;
    continuationStats.seen++;
    continuationStats.lastSent = {
      autoloadThresholdItemsFromEnd: sent === undefined ? null : sent,
      autoloadEnabled: !!next.autoloadEnabled,
      autoloadOnVisible: !!next.autoloadOnVisible
    };
    if (!(sent >= ROWS_AHEAD)) {
      next.autoloadThresholdItemsFromEnd = ROWS_AHEAD;
      continuationStats.raised++;
    }
  }
}

/** Each tab of every section of a browse-tabs response, in either content shape. */
function raiseTabs(sections) {
  if (!Array.isArray(sections)) return;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      raiseList(content.sectionListRenderer);
      raiseList(content.tvSurfaceContentRenderer?.content?.sectionListRenderer);
    }
  }
}

/** Raises the threshold on every section list of a response of `type` (core/innertube.js). */
export function raiseRowsAhead(data, type) {
  if (continuationStats.appFlag === undefined) {
    continuationStats.appFlag = window.environment?.flags?.section_list_continuation_threshold;
  }
  if (type === 'BROWSE_TABS') {
    raiseTabs(getByPath(data, paths.BROWSE_TABS.navPath)?.sections);
    return;
  }
  const lists = SECTION_LISTS[type];
  if (!lists) return;
  for (let i = 0; i < lists.length; i++) raiseList(getByPath(data, lists[i]));
}
