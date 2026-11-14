// Finding the description panel and watching it: one look, a bounded poll as
// the safety net, a MutationObserver for its content and an
// IntersectionObserver for when it is actually on screen. `ryd` is the instance.
import { HAS_INTERSECTION_OBSERVER, PANEL, TIMING } from './constants.js';
import { createDisposables } from '../../core/disposables.js';
import { pollUntil } from '../../core/dom.js';
import { checkAndInjectDislike } from './injection.js';
import { updateVisualState, clearAllHighlights } from './navigation.js';
import { closestMenuItem } from './panel-dom.js';

/**
 * Forgets the menu items of the current panel; they are re-read on the next
 * focus. The highlighted item is kept: it is still the one to clear.
 */
function resetMenuCache(ryd) {
  ryd.menuItemsCache = [];
  ryd.menuItemsMap.clear();
  ryd.focusedIndex = -1;
  ryd.dynamicList = undefined;
}

/**
 * Lets go of the tracked panel: the highlight, its observers, the factoid,
 * the class on YouTube's factoid row and every field that points into it.
 * Binding another panel, a panel gone stale and destroy() all come here.
 */
export function releasePanel(ryd) {
  clearAllHighlights(ryd);
  disconnectPanelObservers(ryd);
  const factoid = document.getElementById('ryd-dislike-factoid');
  if (factoid) factoid.remove();
  if (ryd.factoidContainer) {
    ryd.factoidContainer.classList.remove('ryd-ready', 'ryd-no-flex-gap');
    ryd.factoidContainer = null;
  }
  ryd.dislikeValueElement = null;
  ryd.dislikeFactoidElement = null;
  ryd.panelElement = null;
  ryd.isPanelFocused = false;
  ryd.cachedMode = null;
  ryd.lastFocusedElement = null;
  resetMenuCache(ryd);
}

/** Stops the bounded poll for the description panel, if one runs. */
export function stopPanelPoll(ryd) {
  if (ryd.panelPoll) {
    ryd.panelPoll.cancel();
    ryd.panelPoll = null;
  }
}

/** Binds the panel if it is in the DOM now; true when it was. */
export function findPanelNow(ryd) {
  if (ryd.isDestroyed) return false;
  const existingPanel = document.querySelector(PANEL.panel);
  if (!existingPanel) return false;
  setupPanel(ryd, existingPanel);
  return true;
}

// A bounded poll, and only a safety net: the panel is also detected by
// handleFocusIn (focus is the only reliable signal for the role="dialog"
// description panel). Armed by ui/shortcuts/panels.js after the description
// shortcut fires and by focus-tracking.js when the tracked panel went stale,
// for PANEL_POLL_MAX rounds, then idle until something re-arms it.
export function pollForPanel(ryd) {
  if (ryd.isDestroyed) return;

  stopPanelPoll(ryd);
  if (findPanelNow(ryd)) return;

  /** One round; true when there is nothing left to look for. */
  const round = () => {
    if (ryd.isDestroyed) return true;
    if (ryd.panelElement) {
      // The panel is tracked and still there: nothing left to find.
      if (ryd.panelElement.isConnected) return true;
      releasePanel(ryd);
    }
    const panel = document.querySelector(PANEL.panel);
    if (!panel) return false;
    setupPanel(ryd, panel);
    return true;
  };
  // The handle says itself whether it still runs (pollUntil's `active`).
  ryd.panelPoll = pollUntil(round, TIMING.PANEL_POLL_MS, { maxAttempts: TIMING.PANEL_POLL_MAX });
}

/**
 * Starts working with a description panel: watches its content and visibility, and injects the
 * factoid once it is visible.
 */
export function setupPanel(ryd, panel) {
  if (ryd.isDestroyed) return;

  if (ryd.panelElement === panel) {
    checkAndInjectDislike(ryd, panel);
    return;
  }

  releasePanel(ryd);
  ryd.panelElement = panel;
  ryd.isPanelFocused = panel.contains(document.activeElement);
  ryd.panelBag = createDisposables();
  watchPanelContent(ryd, panel);

  if (HAS_INTERSECTION_OBSERVER) watchPanelVisibility(ryd, panel);
  else checkAndInjectDislike(ryd, panel);
}

/** The panel's content, for rows being re-rendered under the factoid. */
function watchPanelContent(ryd, panelElement) {
  ryd.panelBag.observe(
    new MutationObserver((mutations) => handlePanelMutation(ryd, mutations)),
    panelElement,
    {
      childList: true,
      subtree: true
    }
  );
}

/** The panel coming on screen: inject then, and pick up a focus already inside. */
function watchPanelVisibility(ryd, panelElement) {
  const observer = new IntersectionObserver(
    (entries) => {
      // A report for a panel let go of in the meantime is not this one's.
      if (ryd.isDestroyed || ryd.panelElement !== panelElement) return;
      // Hidden and shown again within one delivery: the last entry is the state.
      if (entries[entries.length - 1].isIntersecting) {
        checkAndInjectDislike(ryd, panelElement);
        if (panelElement.contains(document.activeElement)) {
          ryd.isPanelFocused = true;
          // Focus sits on a focusable child of the item, not the item itself.
          const item = closestMenuItem(document.activeElement);
          if (item) updateVisualState(ryd, item);
        }
      } else {
        ryd.isPanelFocused = false;
      }
    },
    { threshold: 0.1 }
  );
  ryd.panelBag.observe(observer, panelElement);
}

/** The panel's observers, disconnected when the panel is let go of. */
function disconnectPanelObservers(ryd) {
  if (!ryd.panelBag) return;
  ryd.panelBag.dispose();
  ryd.panelBag = null;
}

/**
 * Whether every record is one of the instance's own writes: the factoid going
 * in, or its text being replaced. Those would otherwise schedule an injection
 * pass that finds the factoid in place and does nothing.
 */
function ownMutations(ryd, mutations) {
  const factoid = ryd.dislikeFactoidElement;
  if (!factoid || !mutations) return false;
  for (let i = 0; i < mutations.length; i++) {
    const m = mutations[i];
    if (factoid.contains(m.target)) continue;
    const added = m.addedNodes;
    if (added.length === 1 && added[0] === factoid && m.removedNodes.length === 0) continue;
    return false;
  }
  return true;
}

/**
 * The panel's content changed (not by this code): drops the menu cache and re-checks the factoid,
 * debounced.
 */
function handlePanelMutation(ryd, mutations) {
  if (ryd.isDestroyed || ownMutations(ryd, mutations)) return;
  resetMenuCache(ryd);
  ryd.schedule(
    () => {
      if (!ryd.isDestroyed && ryd.panelElement) checkAndInjectDislike(ryd, ryd.panelElement);
    },
    TIMING.INJECT_DEBOUNCE_MS,
    'inject'
  );
}
