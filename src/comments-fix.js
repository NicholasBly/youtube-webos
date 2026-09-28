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
 * The same thing happens to the Description panel (it uses the same overlay),
 * which is what the old virtual-list layout override in return-dislike.js was
 * working around. With this fix in place that override is no longer needed
 * and was removed (it stacked rows in DOM order, which YouTube shuffles).
 *
 * Fix: for every YouTube CSS rule tied to the closing classes that hides or
 * zero-sizes something, add an override that keeps the element laid out but
 * invisible. The panel looks the same while it closes, the ResizeObserver
 * never sees 0, and the saved state keeps the real heights.
 *
 * The closing class is ALSO briefly present while a panel opens, and the
 * Description panel's rows are built and measured during that moment - so the
 * override has to be in place before the first panel ever opens. The rules are
 * found by scanning the stylesheets at startup (retrying every second until
 * YouTube's CSS has loaded), with a scan on panel focus as a backstop. A broad
 * fallback is used until the real rule is found.
 *
 * NOTE: `frHKed`, `xmQAdc` and `AmQJbe` are YouTube's obfuscated class names
 * and may change in a future YouTube update.
 */

const CLOSE_CLASSES = ['frHKed', 'xmQAdc'];
const FALLBACK_CSS =
  'ytlr-animated-overlay.frHKed .AmQJbe, ytlr-animated-overlay.frHKed .AmQJbe * { display: revert !important; }';
const MAX_SCANS = 3;           // focus-triggered scans
const STARTUP_RETRY_MS = 1000;
const STARTUP_MAX_TRIES = 30;  // ~30s for YouTube's stylesheets to show up

let styleEl = null;
let foundRules = false;
let scans = 0;

function collectRules() {
  const res = [];
  const walk = (list) => {
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.selectorText) res.push(r);
      else if (r.cssRules) walk(r.cssRules); // @media / @supports
    }
  };
  const sheets = document.styleSheets;
  for (let i = 0; i < sheets.length; i++) {
    try { walk(sheets[i].cssRules); } catch { /* cross-origin sheet */ }
  }
  const adopted = document.adoptedStyleSheets;
  if (adopted) {
    for (let i = 0; i < adopted.length; i++) {
      try { walk(adopted[i].cssRules); } catch { /* ignore */ }
    }
  }
  return res;
}

function isZero(v) {
  return v === '0' || v === '0px' || v === '0rem';
}

function findCollapsingSelectors() {
  const rules = collectRules();
  const sels = [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const sel = r.selectorText;
    let usesCloseClass = false;
    for (let j = 0; j < CLOSE_CLASSES.length; j++) {
      if (sel.indexOf('.' + CLOSE_CLASSES[j]) !== -1) { usesCloseClass = true; break; }
    }
    if (!usesCloseClass) continue;
    const s = r.style;
    if (s.display === 'none' || isZero(s.height) || isZero(s.width) || isZero(s.maxHeight)) sels.push(sel);
  }
  return sels;
}

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

  if (sels.length) {
    foundRules = true;
    styleEl.textContent = sels.map((s) =>
      s + ' { display: block !important; height: auto !important; width: auto !important;' +
      ' max-height: none !important; visibility: hidden !important; }'
    ).join('\n');
    console.info('[CommentsFix] Close-collapse override applied to: ' + sels.join(' , '));
  } else {
    styleEl.textContent = FALLBACK_CSS;
    if (!fromStartup) console.info('[CommentsFix] No collapsing close rule found (scan ' + scans + '/' + MAX_SCANS + '), using fallback');
  }
}

// Run when focus first lands inside any side panel (comments, description,
// etc.). They all share the same overlay + closing class, and a panel always
// opens before it can close, so the override is in place before it's needed.
const PANEL_SELECTOR = '.AmQJbe, ytlr-engagement-panel-section-list-renderer';
function onFocusIn(e) {
  if (foundRules || scans >= MAX_SCANS) {
    document.removeEventListener('focusin', onFocusIn, true);
    return;
  }
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest(PANEL_SELECTOR)) applyFix();
}

let startupTries = 0;
function startupScan() {
  applyFix(true);
  if (!foundRules && ++startupTries < STARTUP_MAX_TRIES) setTimeout(startupScan, STARTUP_RETRY_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('focusin', onFocusIn, true);
  startupScan();
}

export { findCollapsingSelectors, applyFix as applyCommentsCloseFix };
