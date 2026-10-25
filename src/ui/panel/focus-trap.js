// Keeps focus inside the options panel while it is open: a focus that lands
// outside it (the app's own focus traffic) is sent back to the last place it
// was inside, or to the tab of the open page.

/**
 * `container` is the panel element, `allowed(target)` says whether a focus
 * outside the container is fine anyway (the SponsorBlock popup), `firstControl()`
 * is where focus goes when the last safe place is gone.
 */
export function createFocusTrap({ container, allowed, firstControl }) {
  let lastSafe = null;

  /**
   * Capture-phase focus listener: a focus outside the panel (and outside the allowed popup) is sent
   * back to the last place inside.
   */
  const onFocus = (e) => {
    const target = e.target;
    if (container.contains(target) || allowed(target)) {
      lastSafe = target;
      return;
    }
    e.stopPropagation();
    if (lastSafe && lastSafe.isConnected) lastSafe.focus();
    else firstControl().focus();
  };

  return {
    /** Starts trapping, with `initial` as the place focus is sent back to. */
    attach(initial) {
      lastSafe = initial;
      document.addEventListener('focus', onFocus, true);
    },
    /** Stops trapping. */
    detach() {
      document.removeEventListener('focus', onFocus, true);
      lastSafe = null;
    }
  };
}
