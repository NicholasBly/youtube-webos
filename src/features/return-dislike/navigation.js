// Keyboard navigation inside the description panel: which menu item is
// highlighted, moving between items, and forwarding Enter.
import { PANEL, TIMING } from './constants.js';
import { triggerEnter, closestMenuItem } from './panel-dom.js';
import { SYNTHETIC_KEY_FLAG } from '../../core/remote.js';
import { getWebOSVersion } from '../../core/webos.js';

// scrollIntoView takes options from Chromium 61 (webOS 5); before that an
// options object reads as `true`, aligning the item to the top.
const SCROLL_OPTIONS = getWebOSVersion() >= 5;

/** Brings an item into view, centred where the engine can. */
function scrollItemIntoView(item) {
  if (SCROLL_OPTIONS) item.scrollIntoView({ behavior: 'auto', block: 'center' });
  else if (item.scrollIntoViewIfNeeded) item.scrollIntoViewIfNeeded(true);
  else item.scrollIntoView(false);
}

/**
 * Lists the panel's menu items (innermost only) with their indexes, and finds the one currently
 * highlighted.
 */
function refreshMenuCache(ryd) {
  if (!ryd.panelElement) return;
  const rawItems = [].slice.call(ryd.panelElement.querySelectorAll(PANEL.menuItem));
  // Nested items are left out.
  ryd.menuItemsCache = rawItems.filter((item) => !item.querySelector(PANEL.menuItem));

  // Indexed by element for the keypress lookups.
  ryd.menuItemsMap.clear();
  ryd.menuItemsCache.forEach((item, index) => {
    ryd.menuItemsMap.set(item, index);
  });

  // The item this code highlighted last, else the first item YouTube marked:
  // the focus class is on the item's wrapper and on the list as well, ahead
  // of the item in document order.
  ryd.focusedIndex = ryd.menuItemsMap.get(ryd.lastFocusedElement) ?? -1;
  if (ryd.focusedIndex !== -1) return;
  const marked = ryd.panelElement.querySelectorAll('.' + PANEL.focusState);
  for (let i = 0; i < marked.length && ryd.focusedIndex === -1; i++) {
    ryd.focusedIndex = ryd.menuItemsMap.get(marked[i]) ?? -1;
  }
}

/** The list container, looked up once per panel (forgotten with the menu cache). */
function dynamicList(ryd) {
  if (ryd.dynamicList === undefined) {
    ryd.dynamicList = ryd.panelElement.querySelector(PANEL.dynamicList);
  }
  return ryd.dynamicList;
}

/**
 * Moves the highlight to `targetItem`, as YouTube draws its own focus (the item's classes and its
 * wrapper's).
 */
export function updateVisualState(ryd, targetItem) {
  if (ryd.menuItemsCache.length === 0) refreshMenuCache(ryd);
  if (!ryd.menuItemsMap.has(targetItem)) return;

  const newIndex = ryd.menuItemsMap.get(targetItem);

  let itemToClear = ryd.lastFocusedElement;
  if (!itemToClear && ryd.focusedIndex !== -1 && ryd.menuItemsCache[ryd.focusedIndex]) {
    itemToClear = ryd.menuItemsCache[ryd.focusedIndex];
  }
  // The previous item, whether tracked or inferred.
  if (itemToClear && itemToClear !== targetItem) {
    itemToClear.classList.remove(PANEL.legacyHighlight, PANEL.focusState);
    toggleParentFocus(ryd, itemToClear, false);
  }

  targetItem.classList.add(PANEL.legacyHighlight, PANEL.focusState);
  toggleParentFocus(ryd, targetItem, true);

  ryd.focusedIndex = newIndex;
  ryd.lastFocusedElement = targetItem;

  const dynList = dynamicList(ryd);
  if (dynList) dynList.classList.add(PANEL.focusState);
}

// The wrapper of each menu item, found once: closest() runs the selector
// engine up the whole ancestor chain, twice per move otherwise.
const wrapperOf = new WeakMap();
// The wrappers zylon-ve was added to here, so it goes again with the focus;
// one that had it from YouTube keeps it.
const addedVe = new WeakSet();
// Each wrapper's focused modifier, named after its own first class as read
// before this code added any; empty for a wrapper without a class.
const focusedClassOf = new WeakMap();

/** Adds or removes the focused look of an item's wrapper (its class lookups cached per element). */
function toggleParentFocus(ryd, element, shouldFocus) {
  let parentContainer = wrapperOf.get(element);
  if (parentContainer === undefined) {
    parentContainer = element.closest(PANEL.parentWrappers);
    wrapperOf.set(element, parentContainer);
  }
  if (!parentContainer) return;
  let focusedClass = focusedClassOf.get(parentContainer);
  if (focusedClass === undefined) {
    const base = parentContainer.classList[0];
    focusedClass = base ? base + PANEL.focusedModifier : '';
    focusedClassOf.set(parentContainer, focusedClass);
  }
  if (shouldFocus) {
    if (!parentContainer.classList.contains('zylon-ve')) {
      parentContainer.classList.add('zylon-ve');
      addedVe.add(parentContainer);
    }
    if (focusedClass) parentContainer.classList.add(focusedClass);
    parentContainer.classList.add(PANEL.focusState);
  } else {
    if (focusedClass) parentContainer.classList.remove(focusedClass);
    parentContainer.classList.remove(PANEL.focusState);
    if (addedVe.has(parentContainer)) {
      addedVe.delete(parentContainer);
      parentContainer.classList.remove('zylon-ve');
    }
  }
}

/** Removes the highlight from the last item and the list (focus left the panel). */
export function clearAllHighlights(ryd) {
  if (!ryd.panelElement) return;

  // The last focused element first.
  if (ryd.lastFocusedElement) {
    ryd.lastFocusedElement.classList.remove(PANEL.focusState, PANEL.legacyHighlight);
    toggleParentFocus(ryd, ryd.lastFocusedElement, false);
    ryd.lastFocusedElement = null;
  }

  // Safety net for a desynced state: clear the list container's focus class too.
  const dynList = dynamicList(ryd);
  if (dynList) dynList.classList.remove(PANEL.focusState);
}

/**
 * Enter on the highlighted menu item: intercepted only when the item itself
 * is the active element. With focus on a focusable descendant the real Enter
 * must reach YouTube: a synthetic keydown on the parent would target the
 * wrong node.
 */
function pressEnter(ryd, e) {
  const current = document.activeElement;
  if (!current || !ryd.menuItemsMap.has(current)) return;
  e.preventDefault();
  e.stopPropagation();
  triggerEnter(current);
  ryd.schedule(() => clearAllHighlights(ryd), TIMING.HIGHLIGHT_CLEAR_MS, 'highlightClear');
}

/** The index of the focused item, resynced when it drifted from the element; 0 when none is known. */
function resolveFocusedIndex(ryd) {
  if (ryd.focusedIndex !== -1 && ryd.menuItemsCache[ryd.focusedIndex] === ryd.lastFocusedElement) {
    return ryd.focusedIndex;
  }
  let index = -1;
  if (ryd.lastFocusedElement) {
    index = ryd.menuItemsMap.get(ryd.lastFocusedElement) ?? -1;
  } else if (document.activeElement) {
    // Focus usually sits on a focusable child of the item, not the item.
    const item = closestMenuItem(document.activeElement);
    index = item ? (ryd.menuItemsMap.get(item) ?? -1) : -1;
  }
  return index === -1 ? 0 : index;
}

/** Moves focus and the highlight one item down or up, wrapping at the ends. */
function moveFocus(ryd, down) {
  ryd.focusedIndex = resolveFocusedIndex(ryd);
  const count = ryd.menuItemsCache.length;
  const nextIndex = down ? (ryd.focusedIndex + 1) % count : (ryd.focusedIndex - 1 + count) % count;
  const nextItem = ryd.menuItemsCache[nextIndex];
  ryd.isProgrammaticFocus = true;
  nextItem.focus({ preventScroll: true });
  ryd.isProgrammaticFocus = false;
  updateVisualState(ryd, nextItem);
  scrollItemIntoView(nextItem);
}

/** A key on the description panel: Up and Down move between its items, Enter presses one. */
export function handleNavigation(ryd, e) {
  // Only a remote press drives the panel: not a key this mod made, nor any
  // untrusted one (SYNTHETIC_KEY_FLAG in core/remote.js says why both checks).
  if (e[SYNTHETIC_KEY_FLAG] || e.isTrusted === false) return;
  // A panel YouTube removed while a child had focus (no focusout then) is not ours to drive.
  if (
    ryd.isDestroyed ||
    !ryd.panelElement ||
    !ryd.panelElement.isConnected ||
    !ryd.isPanelFocused
  ) {
    return;
  }

  const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
  const isDown = e.key === 'ArrowDown' || e.keyCode === 40;
  const isEnter = e.key === 'Enter' || e.keyCode === 13;
  if (!isUp && !isDown && !isEnter) return;

  if (ryd.menuItemsCache.length === 0) {
    refreshMenuCache(ryd);
    if (ryd.menuItemsCache.length === 0) return;
  }

  if (isEnter) {
    pressEnter(ryd, e);
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  moveFocus(ryd, isDown);
}
