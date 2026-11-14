// Focus is the only reliable signal for the role="dialog" description panel
// on webOS: these capture-phase listeners detect the panel, track whether
// focus is inside it and keep the highlight in step. `ryd` is the instance.
import { TIMING } from './constants.js';
import { closestPanel, closestMenuItem } from './panel-dom.js';
import { releasePanel, pollForPanel, setupPanel } from './panel-observer.js';
import { updateVisualState, clearAllHighlights, handleNavigation } from './navigation.js';

/** The window and document listeners, undone by the instance's bag. */
export function attachListeners(ryd) {
  ryd.bag.listen(window, 'keydown', (e) => handleNavigation(ryd, e), true);
  ryd.bag.listen(document, 'focusin', (e) => handleFocusIn(ryd, e), true);
  ryd.bag.listen(document, 'focusout', () => handleFocusOut(ryd), true);
}

/**
 * A focus change on the watch page: finds the description panel when the focus enters it (the main
 * way it is detected), and highlights the menu item that got the focus.
 */
function handleFocusIn(ryd, e) {
  if (ryd.isDestroyed || ryd.isProgrammaticFocus) return;

  // The tracked panel can be stale (the poll lets go of it when it finds it
  // disconnected, but a focus can land in between): let go of it, and
  // rebind to what is in the DOM now, and re-arm the poll, since a
  // replacement may be mounting right now.
  if (ryd.panelElement && !ryd.panelElement.isConnected) {
    releasePanel(ryd);
    pollForPanel(ryd);
  }

  // The primary detection path: focus crossed into something inside the panel.
  if (!ryd.panelElement) {
    const found = closestPanel(e.target);
    if (!found) return;
    setupPanel(ryd, found);
  }

  if (ryd.panelElement.contains(e.target)) {
    ryd.isPanelFocused = true;
    // The closest item is the innermost one, so it holds no further items.
    const targetItem = closestMenuItem(e.target);
    if (targetItem) updateVisualState(ryd, targetItem);
  } else {
    ryd.isPanelFocused = false;
  }
}

/** Focus left something: once it settles, clears the highlights if it left the panel. */
function handleFocusOut(ryd) {
  // Every focusout in the app lands here while a watch page is open; only one
  // leaving the panel has work to do, so the rest return before the timer.
  if (ryd.isProgrammaticFocus || !ryd.panelElement || !ryd.isPanelFocused) return;
  // Once focus has landed on the next element; a burst of focus changes
  // settles once, and destroy() clears it.
  ryd.schedule(
    () => {
      if (!ryd.panelElement) return;
      const stillInside = ryd.panelElement.contains(document.activeElement);
      ryd.isPanelFocused = stillInside;
      if (!stillInside) clearAllHighlights(ryd);
    },
    TIMING.FOCUS_SETTLE_MS,
    'focusSettle'
  );
}
