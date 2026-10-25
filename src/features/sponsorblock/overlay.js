// The coloured segment overlay beside the progress bar: the anchor it sits
// by, keeping its geometry in sync, and drawing the segments. Finding the bar
// is bar.js's job.
import { configGetAll, segmentTypes } from '../../core/config.js';
import { CONFIG_MAPPING, TIMING, categoryColor } from './constants.js';
import { isFullVideoSegment } from './labels.js';
import { SELECTORS } from '../../core/selectors.js';

/** The overlay element's id. */
export const OVERLAY_ID = 'previewbar';

/**
 * The element the overlay sits beside for `bar`: YouTube's progress-bar
 * renderer around it, else ytlr-progress-bar, else the bar itself.
 */
export function anchorOf(bar) {
  // Two chained calls on purpose: closest('a, b') returns the NEAREST ancestor
  // matching either selector, and ytlr-progress-bar sits inside
  // ytlr-multi-markers-player-bar-renderer, so a union selector would invert
  // the priority and anchor the overlay to the wrong element.
  return bar.closest(SELECTORS.PROGRESS_BAR_RENDERER) || bar.closest(SELECTORS.PROGRESS_BAR) || bar;
}

/**
 * The anchor of the tracked bar (anchorOf). The overlay is always a sibling of
 * it, because YouTube's renderer destroys foreign children. Null while there
 * is no bar, or the bar has no parent to be a sibling in.
 */
export function getProgressBarAnchor(sb) {
  if (!sb.progressBar) return null;

  // The cached anchor is validated too, not just the bar identity: the TV UI
  // can reuse the same progress-bar node while rebuilding the wrapper around
  // it, which left a detached ancestor and an overlay inserted into an
  // orphaned subtree, built and invisible.
  const cached = sb.anchor;
  if (cached && cached.bar === sb.progressBar && cached.element.isConnected) {
    return cached.element;
  }

  const anchor = anchorOf(sb.progressBar);
  const parent = anchor.parentNode;
  if (!parent) return null;

  const ps = window.getComputedStyle(parent);
  if (ps.position === 'static') parent.style.setProperty('position', 'relative', 'important');
  if (ps.display === 'inline' || ps.display === '') {
    parent.style.setProperty('display', 'block', 'important');
  }

  sb.anchor = { bar: sb.progressBar, element: anchor };
  return anchor;
}

/** Forgets the cached anchor; the next getProgressBarAnchor() recomputes it. */
export function forgetAnchor(sb) {
  sb.anchor = null;
}

// The offset of `el` within `ancestor`, so the sibling overlay can be placed
// over exactly the same box.
function offsetRelativeTo(el, ancestor) {
  const rectEl = el.getBoundingClientRect();
  const rectAncestor = ancestor.getBoundingClientRect();
  return {
    top: rectEl.top - rectAncestor.top,
    left: rectEl.left - rectAncestor.left
  };
}

/** Puts the overlay over the tracked bar's box, at its visibility. */
function syncOverlayPosition(sb, anchor) {
  if (!sb.overlay) return;
  // getProgressBarAnchor() gives only an anchor with a parent.
  const parent = anchor.parentNode;

  // The inner slider element for the precise height and position; anchor
  // itself only when the tracked bar is that very node.
  const trackEl = sb.progressBar && sb.progressBar !== anchor ? sb.progressBar : anchor;

  // All reads first, in one batch: interleaving them with writes forced up to
  // three synchronous reflows per sync on webOS. classList and the inline
  // style read are recalc-free, and the inline check still catches UI builds
  // that hide via opacity without the zylon-hidden class.
  const isHidden =
    anchor.classList.contains(SELECTORS.HIDDEN_CLASS) || anchor.style.opacity === '0';
  // Hidden and already synced as hidden, which is most of playback: the
  // geometry reads below would force a layout for nothing; the next sync
  // (an attribute change on the watched element, a timeupdate, a resize)
  // measures again.
  if (isHidden && sb.lastSyncSig && sb.lastSyncSig.charAt(0) === 'h') return;
  const width = trackEl.offsetWidth;
  const height = trackEl.offsetHeight;
  const pos = offsetRelativeTo(trackEl, parent);

  // No style writes when nothing changed, which is the common case for the
  // timeupdate sync and the mutation-driven syncs.
  const sig = (isHidden ? 'h' : 'v') + '_' + pos.top + '_' + pos.left + '_' + width + '_' + height;
  if (sig === sb.lastSyncSig) return;
  sb.lastSyncSig = sig;

  const st = sb.overlay.style;
  st.setProperty('opacity', isHidden ? '0' : '1', 'important');
  st.setProperty('top', pos.top + 'px', 'important');
  st.setProperty('left', pos.left + 'px', 'important');
  st.setProperty('width', width + 'px', 'important');
  st.setProperty('height', height + 'px', 'important');
}

/** Re-syncs the overlay with the tracked bar now; nothing to do without either. */
export function resyncOverlay(sb) {
  if (!sb.overlay || !sb.progressBar) return;
  const anchor = getProgressBarAnchor(sb);
  if (anchor) syncOverlayPosition(sb, anchor);
}

/**
 * resyncOverlay at most every OVERLAY_SYNC_MS: the timeupdate path, which
 * fires at about 4 Hz while the viewport rarely changes.
 */
export function resyncOverlayThrottled(sb) {
  if (!sb.overlay || !sb.progressBar) return;
  const now = performance.now();
  if (!sb.lastSyncTime || now - sb.lastSyncTime > TIMING.OVERLAY_SYNC_MS) {
    resyncOverlay(sb);
    sb.lastSyncTime = now;
  }
}

/**
 * Draws (or keeps) the overlay for the current segments and settings beside
 * the tracked bar. False when the bar is gone from the document: the caller
 * then looks for it again. True otherwise, including when nothing needs
 * drawing.
 */
export function drawOverlay(sb) {
  if (sb.isDestroyed || !sb.segments.length) return true;

  // A detached progressBar is still truthy. Drawing against it would put the
  // overlay into an orphaned subtree: segments that exist but never show.
  if (!sb.progressBar || !sb.progressBar.isConnected) {
    sb.progressBar = null;
    forgetAnchor(sb);
    sb.lastOverlayHash = null;
    return false;
  }

  const duration = sb.video ? sb.video.duration : 0;
  if (!duration || isNaN(duration)) return true;

  const config = configGetAll();
  // What the marks are (the modes include the highlight's); their colours are
  // changed in place (recolourOverlay).
  const overlayHash = `${duration}_${sb.modeSig}_${sb.segments.length}`;
  if (overlayHash === sb.lastOverlayHash && sb.overlay && sb.overlay.isConnected) return true;
  sb.lastOverlayHash = overlayHash;

  if (sb.overlay) sb.overlay.remove();
  sb.overlayMarks = [];

  const fragment = document.createDocumentFragment();
  const highlightMode = config.sbMode_highlight;

  for (let i = 0; i < sb.segments.length; i++) {
    const segment = sb.segments[i];
    // A full-video label spans [0, 0] and would draw a zero-width bar.
    if (isFullVideoSegment(segment)) continue;
    const isHighlight = segment.category === 'poi_highlight';

    if (isHighlight) {
      if (!highlightMode || highlightMode === 'disable') continue;
    } else {
      const mode = config[CONFIG_MAPPING[segment.category]];
      if (!mode || mode === 'disable') continue;
    }

    const start = segment.segment[0];
    const end = segment.segment[1];
    const div = document.createElement('div');

    const color = categoryColor(segment.category, '#00d400');
    const left = (start / duration) * 100;

    // Placement and stacking come from .previewbar in sponsorblock.css; only
    // what differs per segment is written inline, in one go.
    div.className = isHighlight ? 'previewbar highlight' : 'previewbar';
    if (isHighlight) {
      div.style.cssText = `background-color: ${color}; left: ${left}%;`;
    } else {
      const width = ((end - start) / duration) * 100;
      const opacity = segmentTypes[segment.category]?.opacity || '0.7';
      div.style.cssText = `background-color: ${color}; left: ${left}%; width: ${width}%; opacity: ${opacity};`;
    }

    fragment.appendChild(div);
    sb.overlayMarks.push({ div, category: segment.category, color });
  }

  // Everything was filtered out (e.g. the only entry was a full-video
  // label). Leave the bar clean rather than inserting an empty overlay.
  if (!fragment.childNodes.length) {
    sb.overlay = null;
    return true;
  }

  sb.overlay = document.createElement('div');
  sb.overlay.id = OVERLAY_ID;
  sb.lastSyncSig = null; // a fresh element: force the next geometry sync
  sb.overlay.appendChild(fragment);

  // The bar is connected (checked above), so its anchor has a parent and the
  // overlay goes in right after the anchor, as its sibling.
  const container = getProgressBarAnchor(sb);
  container.parentNode.insertBefore(sb.overlay, container.nextSibling);
  syncOverlayPosition(sb, container);
  return true;
}

/**
 * Gives every mark its category's colour as the settings have it now: a
 * colour picked in the panel (one change per step of a drag) repaints the
 * marks rather than rebuilding the overlay.
 */
export function recolourOverlay(sb) {
  const marks = sb.overlayMarks;
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const color = categoryColor(mark.category, '#00d400');
    if (color !== mark.color) {
      mark.div.style.backgroundColor = color;
      mark.color = color;
    }
  }
}
