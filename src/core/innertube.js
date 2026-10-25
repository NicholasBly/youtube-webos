// The InnerTube response shapes the TV app uses: how to tell the kinds of
// response apart, where each keeps its content, and the item lists a section
// can hold. Shared by the adblock filters and the thumbnail rewrite, which
// must agree on where a response keeps its content.

export const SCHEMA_REGISTRY = {
  typeSignatures: [
    {
      type: 'SHORTS_SEQUENCE',
      detectionPath: ['entries'],
      matchFn: (data) => Array.isArray(data.entries)
    },
    { type: 'PLAYER', detectionPath: ['streamingData'] },
    { type: 'NEXT', detectionPath: ['contents', 'singleColumnWatchNextResults'] },
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
    { type: 'CONTINUATION', detectionPath: ['continuationContents'] },
    { type: 'ACTION', detectionPath: ['onResponseReceivedActions'] },
    { type: 'ACTION', detectionPath: ['onResponseReceivedEndpoints'] }
  ],
  paths: {
    PLAYER: { overlayPath: ['playerOverlays', 'playerOverlayRenderer'] },
    NEXT: {
      overlayPath: ['playerOverlays', 'playerOverlayRenderer'],
      pivotPath: [
        'contents',
        'singleColumnWatchNextResults',
        'pivot',
        'sectionListRenderer',
        'contents'
      ]
    },
    SHORTS_SEQUENCE: { listPath: ['entries'] },
    HOME_BROWSE: {
      mainContent: [
        'contents',
        'tvBrowseRenderer',
        'content',
        'tvSurfaceContentRenderer',
        'content',
        'sectionListRenderer',
        'contents'
      ]
    },
    BROWSE_TABS: {
      // The tab bar renderer itself; its first section's tabs are tabsPath.
      navPath: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer'],
      tabsPath: [
        'contents',
        'tvBrowseRenderer',
        'content',
        'tvSecondaryNavRenderer',
        'sections',
        '0',
        'tvSecondaryNavSectionRenderer',
        'tabs'
      ]
    },
    SEARCH: { mainContent: ['contents', 'sectionListRenderer', 'contents'] },
    CONTINUATION: {
      sectionPath: ['continuationContents', 'sectionListContinuation', 'contents'],
      gridPath: ['continuationContents', 'gridContinuation', 'items'],
      horizontalPath: ['continuationContents', 'horizontalListContinuation', 'items'],
      tvSurfacePath: [
        'continuationContents',
        'tvSurfaceContentContinuation',
        'content',
        'sectionListRenderer',
        'contents'
      ]
    }
  }
};

/** The value at `parts` under `obj`, or undefined when any step is missing. */
export function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

/** The kind of response, by the first signature it matches; null for none. */
export function detectResponseType(data) {
  const signatures = SCHEMA_REGISTRY.typeSignatures;
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    if (sig.excludePath && getByPath(data, sig.excludePath) !== undefined) continue;
    if (getByPath(data, sig.detectionPath) !== undefined) {
      if (sig.matchFn && !sig.matchFn(data)) continue;
      return sig.type;
    }
  }
  return null;
}

/**
 * The item lists a section can hold, in the shapes the TV app uses: a shelf
 * (a horizontal list, a grid or expanded contents), or a bare grid or
 * horizontal list. Calls `fn(items, arg)` for each list found and returns how
 * many there were; zero for a section that is itself an item (search
 * interleaves tiles among the shelves) or a shelf with no content. `arg` lets
 * a caller on a hot path pass its state to a function declared once.
 */
export function forEachItemList(section, fn, arg) {
  const shelf = section.shelfRenderer;
  if (shelf) {
    const content = shelf.content;
    if (!content) return 0;
    let found = 0;
    const horizontal = content.horizontalListRenderer?.items;
    const grid = content.gridRenderer?.items;
    const expanded = content.expandedShelfContentsRenderer?.items;
    if (horizontal) {
      fn(horizontal, arg);
      found++;
    }
    if (grid) {
      fn(grid, arg);
      found++;
    }
    if (expanded) {
      fn(expanded, arg);
      found++;
    }
    return found;
  }
  const list = section.gridRenderer?.items || section.horizontalListRenderer?.items;
  if (!list) return 0;
  fn(list, arg);
  return 1;
}
