/**
 * Comments panel fix - https://github.com/NicholasBly/youtube-webos/issues/188
 *
 * Bug (YouTube-side, also happens on the stock app, started late Sept 2026):
 * pressing Back on the comments panel adds a "closing" class to
 * <ytlr-animated-overlay> (currently `frHKed`). YouTube's CSS for that class
 * collapses the panel contents to 0x0 immediately, but the comment list stays
 * mounted for ~350ms while the close animation runs. The list watches its rows
 * with a ResizeObserver, so it records every row as 0 tall and saves that into
 * the per-video list state. Reopening restores that state: all rows stack at
 * the top with height 0 and arrow-key navigation gets stuck.
 *
 * The same thing happens to the Description panel, which uses the same overlay.
 *
 * Fix: for every YouTube CSS rule tied to the closing classes that hides or
 * zero-sizes something, add an override that keeps the element laid out but
 * invisible. The panel looks the same while it closes, the ResizeObserver
 * never sees 0, and the saved state keeps the real heights.
 *
 * The closing class is ALSO briefly present while a panel opens, and the
 * Description panel's rows are built and measured during that moment - so the
 * override has to be in place before the first panel ever opens. The rules are
 * found by scanning the stylesheets at startup (every second while the set of
 * stylesheets still changes, for at most STARTUP_MAX_TRIES), with a scan on
 * panel focus as a backstop. A broad fallback is used until the real rule is
 * found.
 *
 * The closing classes, the overlay and the panel are in core/selectors.js
 * (PANEL_CLOSING_CLASSES, ANIMATED_OVERLAY, OVERLAY_PANEL).
 */

import { createLogger } from '../core/log.js';
import { SELECTORS } from '../core/selectors.js';

const log = createLogger('CommentsFix');

const CLOSE_CLASSES = SELECTORS.PANEL_CLOSING_CLASSES;
const CLOSING_OVERLAY = `${SELECTORS.ANIMATED_OVERLAY}.${CLOSE_CLASSES[0]}`;
// `revert` is Chrome 84: the legacy engines drop that declaration and keep
// the `block` before it.
const FALLBACK_CSS = `${CLOSING_OVERLAY} ${SELECTORS.OVERLAY_PANEL}, ${CLOSING_OVERLAY} ${SELECTORS.OVERLAY_PANEL} * { display: block !important; display: revert !important; }`;
const MAX_SCANS = 3; // focus-triggered scans
const STARTUP_RETRY_MS = 1000;
const STARTUP_MAX_TRIES = 30; // ~30s for YouTube's stylesheets to show up

let styleEl = null;
let foundRules = false;
let scans = 0;

/** Whether a CSS length is zero ('0', '0px' or '0rem'). */
function isZero(v) {
  return v === '0' || v === '0px' || v === '0rem';
}

/** Whether a style rule's selector names a closing class and its style collapses the element. */
function collapses(rule) {
  const sel = rule.selectorText;
  let usesCloseClass = false;
  for (let j = 0; j < CLOSE_CLASSES.length; j++) {
    if (sel.indexOf('.' + CLOSE_CLASSES[j]) !== -1) {
      usesCloseClass = true;
      break;
    }
  }
  if (!usesCloseClass) return false;
  const s = rule.style;
  return s.display === 'none' || isZero(s.height) || isZero(s.width) || isZero(s.maxHeight);
}

/** The selectors of every collapsing rule in every stylesheet, tested as they are met. */
function findCollapsingSelectors() {
  const sels = [];

  /**
   * Collects the selectors of the rules that collapse a closing panel, descending into @media and
   * @supports blocks.
   */
  const walk = (list) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.selectorText) {
        if (collapses(r)) sels.push(r.selectorText);
      } else if (r.cssRules) {
        walk(r.cssRules); // @media / @supports
      }
    }
  };
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    try {
      walk(sheets[i].cssRules);
    } catch {
      /* cross-origin sheet */
    }
  }
  const adopted = document.adoptedStyleSheets;
  if (adopted) {
    for (let i = 0; i < adopted.length; i++) {
      try {
        walk(adopted[i].cssRules);
      } catch {
        /* ignore */
      }
    }
  }
  return sels;
}

/**
 * Writes the override that keeps a closing comments or description panel laid out but invisible,
 * for the rules the scan found (a broad fallback rule while none are); a scan triggered by focus
 * counts toward MAX_SCANS.
 */
function applyFix(fromStartup) {
  if (foundRules) return;
  if (!fromStartup) {
    if (scans >= MAX_SCANS) return;
    scans++;
  }

  const sels = findCollapsingSelectors();
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ytaf-comments-close-fix';
    (document.head || document.documentElement).appendChild(styleEl);
  }

  let css = FALLBACK_CSS;
  if (sels.length) {
    foundRules = true;
    css = sels
      .map(
        (s) =>
          s +
          ' { display: block !important; height: auto !important; width: auto !important;' +
          ' max-height: none !important; visibility: hidden !important; }'
      )
      .join('\n');
    log.info('Close-collapse override applied to: ' + sels.join(' , '));
  } else if (!fromStartup) {
    log.info(
      'No collapsing close rule found (scan ' + scans + '/' + MAX_SCANS + '), using fallback'
    );
  }
  // Rewriting the same text is a forced style recalc for nothing.
  if (styleEl.textContent !== css) styleEl.textContent = css;
}

// Run when focus first lands inside any side panel (comments, description,
// etc.). They all share the same overlay + closing class, and a panel always
// opens before it can close, so the override is in place before it's needed.
const PANEL_SELECTOR = `${SELECTORS.OVERLAY_PANEL}, ${SELECTORS.ENGAGEMENT_PANEL_LIST}`;

/**
 * Runs the scan when the focus enters the comments panel; removes itself once the rules are found
 * or the scans are used up.
 */
function onFocusIn(e) {
  if (foundRules || scans >= MAX_SCANS) {
    document.removeEventListener('focusin', onFocusIn, true);
    return;
  }
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest(PANEL_SELECTOR)) applyFix();
}

// Startup scans stop early once the stylesheet set has stopped changing: the
// rules are either there by then or YouTube renamed the class, and another
// walk over every stylesheet each second would not change that. The focus
// scan remains as the backstop.
const STABLE_SCANS_TO_STOP = 2;
let startupTries = 0;
let lastSheetCount = -1;
let stableScans = 0;

/**
 * Scans at start-up and again every STARTUP_RETRY_MS until the rules are found or the stylesheets
 * stop changing.
 */
function startupScan() {
  applyFix(true);
  if (foundRules) return;
  const sheets = document.styleSheets.length;
  stableScans = sheets === lastSheetCount ? stableScans + 1 : 0;
  lastSheetCount = sheets;
  if (++startupTries < STARTUP_MAX_TRIES && stableScans < STABLE_SCANS_TO_STOP) {
    setTimeout(startupScan, STARTUP_RETRY_MS);
  }
}

document.addEventListener('focusin', onFocusIn, true);
startupScan();
