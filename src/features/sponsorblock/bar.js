// The progress bar: finding it, watching the player chrome for it being
// built, torn down and rebuilt, and the bounded poll while it is missing. A
// bar check also notices a replaced <video> and hands it to the handler.
import { SELECTORS } from '../../core/selectors.js';
import { pollUntil } from '../../core/dom.js';
import { TIMING } from './constants.js';
import {
  OVERLAY_ID,
  anchorOf,
  drawOverlay,
  forgetAnchor,
  getProgressBarAnchor,
  resyncOverlay
} from './overlay.js';

// Where the progress bar's track can be found, most specific first.
const BAR_SELECTORS = [
  `${SELECTORS.PROGRESS_BAR_RENDERER} ${SELECTORS.PROGRESS_BAR_SEGMENT}`,
  SELECTORS.PROGRESS_BAR_TRACK,
  SELECTORS.PROGRESS_BAR_RENDERER,
  `${SELECTORS.PROGRESS_BAR} ${SELECTORS.PROGRESS_BAR_SLIDER}`,
  SELECTORS.PROGRESS_BAR_SLIDER_BASE,
  SELECTORS.PROGRESS_BAR_LEGACY_SLIDER
];

/** Draws the overlay, and polls for the bar when there is none to draw beside. */
export function redrawOverlay(sb) {
  if (!drawOverlay(sb)) scheduleBarRetry(sb);
}

/**
 * The attribute observer watches the bar's class, style and hidden state, and
 * the anchor's as well when that is another element: YouTube hides the
 * renderer, the overlay's sibling, not the track inside it.
 */
function observeBarAttributes(sb, bar) {
  if (!sb.attrObserver) return;
  sb.attrObserver.disconnect();
  const options = { attributes: true, attributeFilter: ['class', 'style', 'hidden'] };
  sb.attrObserver.observe(bar, options);
  const anchor = getProgressBarAnchor(sb);
  if (anchor && anchor !== bar) sb.attrObserver.observe(anchor, options);
}

// The first entries of BAR_SELECTORS are the track itself; the rest are wider.
const TRACK_SELECTOR_COUNT = 2;

/**
 * The childList observer watches the bar's ancestors up to the node the
 * overlay sits in (the anchor's parent), each for its own children only: the
 * bar being replaced, the renderer around it being replaced, and every level
 * between. That node is the watched root. Not one subtree observer over the
 * player chrome, which woke on every chapter marker and tooltip YouTube
 * redraws. A bar matched above the track is watched inside as well, for the
 * track to appear (narrowProgressBar).
 */
function observeBarChildLists(sb, bar) {
  if (!sb.domObserver) return;
  sb.domObserver.disconnect();
  if (sb.barSelectorIndex >= TRACK_SELECTOR_COUNT) {
    sb.domObserver.observe(bar, { childList: true, subtree: true });
  }
  const root = anchorOf(bar).parentNode || bar.parentNode;
  sb.observedRoot = root;
  for (let node = bar.parentNode; node; node = node.parentNode) {
    sb.domObserver.observe(node, { childList: true });
    if (node === root || node === document.body) break;
  }
}

/** Whether every node in `nodes` is the overlay. */
function onlyOverlayNodes(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id !== OVERLAY_ID) return false;
  }
  return true;
}

/**
 * The bar's pair of observers. The childList one sees the overlay's own
 * insertion in the watched root too; records with nothing else in them ask
 * for no check.
 */
function createBarObservers(sb) {
  sb.domObserver = new MutationObserver((records) => {
    for (let i = 0; i < records.length; i++) {
      if (!onlyOverlayNodes(records[i].addedNodes) || !onlyOverlayNodes(records[i].removedNodes)) {
        scheduleCheck(sb);
        return;
      }
    }
  });
  sb.attrObserver = new MutationObserver(() => scheduleCheck(sb));
}

// What the finder waits for: either outer element of the bar, whichever the
// layout has (ytlr-progress-bar, or the renderer with the track straight inside).
const FINDER_SELECTOR = `${SELECTORS.PROGRESS_BAR}, ${SELECTORS.PROGRESS_BAR_RENDERER}`;

/**
 * A check of the bar on the next frame, one at a time. `barChecks` counts the
 * observer callbacks that asked for one, for measuring on the TV: read
 * window.sponsorblock.barChecks, play a video for ten seconds with the
 * controls hidden, read it again. A few checks are expected (the controls
 * show and hide); hundreds mean a bar selector (the first is
 * `[idomkey="segment"]`) matches an element YouTube changes every frame.
 */
function scheduleCheck(sb) {
  sb.barChecks++;
  if (sb.isProcessing || sb.isDestroyed) return;
  sb.isProcessing = true;
  sb.requestAF(() => {
    // A check that throws must not block every check after it.
    try {
      acquireProgressBar(sb);
    } finally {
      sb.isProcessing = false;
    }
  });
}

/**
 * Tracks `target` as the bar: the anchor, the observers and the inline style
 * it needs. A bar found before the finder fires (the first search, the poll)
 * gets its observers here, and the finder goes.
 */
function trackBar(sb, target) {
  // Written before the bar is watched: the attribute observer would otherwise
  // report this very write as a change of the bar.
  const style = window.getComputedStyle(target);
  if (style.position === 'static') target.style.position = 'relative';
  if (style.overflow !== 'visible') target.style.setProperty('overflow', 'visible', 'important');
  sb.progressBar = target;
  forgetAnchor(sb);
  if (!sb.domObserver) {
    createBarObservers(sb);
    if (sb.finderObserver) {
      sb.finderObserver.disconnect();
      sb.finderObserver = null;
    }
  }
  observeBarChildLists(sb, target);
  observeBarAttributes(sb, target);
}

/**
 * A bar matched at the renderer level (the chrome is rebuilt renderer first,
 * track a tick later) is re-targeted at the track once that exists, so the
 * overlay measures the track's box; true when it did.
 */
function narrowProgressBar(sb) {
  if (sb.barSelectorIndex < TRACK_SELECTOR_COUNT) return false;
  const track =
    sb.progressBar.querySelector(SELECTORS.PROGRESS_BAR_SEGMENT) ||
    sb.progressBar.querySelector(SELECTORS.PROGRESS_BAR_TRACK);
  if (!track) return false;
  sb.logger.debug('Narrowed the progress bar to its track');
  sb.barSelectorIndex = 0;
  trackBar(sb, track);
  sb.lastSyncSig = null;
  redrawOverlay(sb);
  // An overlay kept as it was still sits on the renderer's box.
  resyncOverlay(sb);
  return true;
}

/** The <video> was replaced: the new one is bound, the bar stays as tracked. */
function rebindIfVideoReplaced(sb) {
  if (!sb.video || sb.video.isConnected) return;
  sb.logger.debug('The <video> was replaced: rebinding');
  sb.rebindVideo();
}

/** The bar in the DOM, most specific selector first (its index noted), or null. */
function findBar(sb) {
  for (let i = 0; i < BAR_SELECTORS.length; i++) {
    const target = document.querySelector(BAR_SELECTORS[i]);
    if (target) {
      sb.barSelectorIndex = i;
      return target;
    }
  }
  return null;
}

/** A tracked bar: narrowed to its track once that exists, else the overlay re-synced. */
function resyncTrackedBar(sb) {
  if (narrowProgressBar(sb)) return;
  resyncOverlay(sb);
}

/** A bar found by the search: tracked, the overlay drawn beside it, the poll ended. */
function adoptBar(sb, target) {
  trackBar(sb, target);
  redrawOverlay(sb);
  // An overlay kept from the bar before (nothing to redraw) takes the new
  // bar's box and visibility now; a fresh one was synced as it was drawn.
  resyncOverlay(sb);
  // The poll ends the moment the overlay is up, not on its next tick.
  if (sb.barRetry && sb.overlay && sb.overlay.isConnected) stopBarRetry(sb);
}

/**
 * Where every bar check lands: re-syncs a tracked bar, and otherwise looks
 * for the bar and adopts it, or keeps looking.
 */
export function acquireProgressBar(sb) {
  if (sb.isDestroyed) return;
  rebindIfVideoReplaced(sb);
  ensureObserverAlive(sb);

  // A tracked bar is only re-synced. No overlay is no reason to look for the
  // bar again: drawOverlay leaves none when there is nothing to draw. An
  // orphaned overlay is, since the wrapper around the bar was rebuilt; it is
  // dropped, so drawOverlay() builds a fresh one.
  if (sb.overlay && !sb.overlay.isConnected) {
    sb.overlay.remove();
    sb.overlay = null;
  } else if (sb.progressBar && sb.progressBar.isConnected) {
    resyncTrackedBar(sb);
    return;
  }

  // A renderer-level match is narrowed to the track as soon as the track
  // exists (narrowProgressBar).
  const target = findBar(sb);
  if (target) {
    adoptBar(sb, target);
    return;
  }
  // Not in the DOM: the observers may be watching a root that stayed while
  // the bar went, and nothing they see need announce the new one, so a short
  // poll looks for it (scheduleBarRetry).
  sb.progressBar = null;
  forgetAnchor(sb);
  scheduleBarRetry(sb);
}

/**
 * Watches the player chrome: a childList observer on the bar's ancestors for
 * the bar being destroyed and recreated (observeBarChildLists), and an
 * attribute observer on the bar itself (re-targeted by acquireProgressBar) for
 * it being shown and hidden. Two narrow observers rather than one
 * attributes+subtree observer, which woke a callback every animation frame on
 * YouTube's playhead style writes. While there is no bar, one finder waits for
 * it on the app root.
 */
export function watchProgressBar(sb) {
  disconnectObservers(sb);

  /**
   * Watches the bar's parent for the bar being replaced (and the bar itself, if it is already
   * tracked), dropping any observers from before, then looks for the bar.
   */
  const attachBarObservers = (bar) => {
    // The parent, to see the bar itself being destroyed and recreated.
    const observeTarget = bar.parentNode || bar;
    sb.observedRoot = observeTarget;
    sb.logger.debug('Watching the progress bar in', observeTarget.tagName);
    // Reached from the finder as well: never a second pair of observers.
    if (sb.domObserver) sb.domObserver.disconnect();
    if (sb.attrObserver) sb.attrObserver.disconnect();

    createBarObservers(sb);
    sb.domObserver.observe(observeTarget, { childList: true });
    // A bar already tracked and connected is not acquired again, so it is
    // watched from here.
    if (sb.progressBar && sb.progressBar.isConnected) {
      observeBarChildLists(sb, sb.progressBar);
      observeBarAttributes(sb, sb.progressBar);
    }
    acquireProgressBar(sb);
  };

  const candidate = document.querySelector(SELECTORS.PROGRESS_BAR);
  if (candidate) {
    attachBarObservers(candidate);
    return;
  }

  const root = document.querySelector(SELECTORS.APP_ROOT) || document.body;
  sb.logger.debug('Waiting for the progress bar');
  sb.observedRoot = null;
  // One finder at a time: ensureObserverAlive and the bar retry both call
  // back in here while the bar is missing.
  sb.finderObserver = new MutationObserver((mutations, obs) => {
    const found = document.querySelector(FINDER_SELECTOR);
    if (!found) return;
    obs.disconnect();
    if (sb.finderObserver === obs) sb.finderObserver = null;
    attachBarObservers(found);
  });
  sb.finderObserver.observe(root, { childList: true, subtree: true });
  // The finder sees the bar being built, in either layout: a poll beside it
  // would only repeat the search four times a second.
  stopBarRetry(sb);
}

/** Disconnects the bar observers; destroy() and a re-watch call it. */
export function disconnectObservers(sb) {
  for (const key of ['domObserver', 'attrObserver', 'finderObserver']) {
    if (sb[key]) {
      sb[key].disconnect();
      sb[key] = null;
    }
  }
  sb.observedRoot = null;
}

// domObserver watches a container captured at setup time. When a video ends,
// the TV UI tears down the whole player chrome, that container included, and
// rebuilds it when playback restarts; the observer would then watch a
// detached node and never see the new progress bar. A different video goes
// through hashchange and a full re-init, a replay does not, so this re-arms
// the observers when the watched root is gone, or when the tracked bar is
// gone from under a root that stayed (the renderer replaced or removed).
function ensureObserverAlive(sb) {
  if (sb.isDestroyed) return;
  // A finder is already waiting for the bar to be built.
  if (sb.finderObserver) return;
  const barGone = !!sb.progressBar && !sb.progressBar.isConnected;
  if (!barGone && sb.observedRoot && sb.observedRoot.isConnected) return;
  sb.logger.debug('The watched player chrome is gone: watching again');
  // Dropped first: the search the re-watch runs must not find it gone again.
  sb.progressBar = null;
  forgetAnchor(sb);
  watchProgressBar(sb);
}

// Bounded poll for a bar gone from under observers that still watch a
// connected root. A root that went is re-watched instead (ensureObserverAlive),
// and a finder waiting on the app root makes the poll unnecessary.
function scheduleBarRetry(sb) {
  // While the finder waits on the app root the poll has nothing to add.
  if ((sb.barRetry && sb.barRetry.active) || sb.isDestroyed || sb.finderObserver) return;

  /** Whether the overlay is on the page. */
  const overlayUp = () => !!(sb.overlay && sb.overlay.isConnected);
  // The handle says itself whether it still runs (pollUntil's `active`).
  sb.barRetry = pollUntil(
    () => {
      if (!sb.isDestroyed && !overlayUp()) acquireProgressBar(sb);
      return sb.isDestroyed || overlayUp();
    },
    TIMING.BAR_RETRY_MS,
    { maxAttempts: TIMING.BAR_RETRY_MAX }
  );
}

/** Stops the bounded poll for the progress bar, if one runs. */
export function stopBarRetry(sb) {
  if (sb.barRetry) {
    sb.barRetry.cancel();
    sb.barRetry = null;
  }
}
