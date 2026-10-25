// Puts the dislike factoid into the description panel and keeps the rows
// below it where YouTube expects them.
import { DISLIKE_PLACEHOLDER, NO_FLEX_GAP, PANEL } from './constants.js';
import { formatNumber } from './panel-dom.js';
import { SELECTORS } from '../../core/selectors.js';

// The two description-panel layouts and where each keeps its factoids.
// The compact layout's names are YouTube's obfuscated classes.
const MODE_CONFIGS = {
  standard: {
    name: 'standard',
    containerSelector: '.ytLrVideoDescriptionHeaderRendererFactoidContainer',
    factoidClass: '.ytLrVideoDescriptionHeaderRendererFactoid',
    valueSelector: '.ytLrVideoDescriptionHeaderRendererValue',
    labelSelector: '.ytLrVideoDescriptionHeaderRendererLabel'
  },
  compact: {
    name: 'compact',
    containerSelector: '.rznqCe',
    factoidClass: '.nOJlw',
    valueSelector: '.axf6h',
    labelSelector: '.Ph2lNb'
  }
};

/** The count as the factoid shows it: the placeholder until the fetch lands. */
function dislikeText(ryd) {
  return ryd.dislikesValue === null ? DISLIKE_PLACEHOLDER : formatNumber(ryd.dislikesValue);
}

/**
 * Rewrites the already-injected factoid in place. Injection does not wait for
 * the network, so this turns the placeholder into the real number whenever
 * the fetch lands, first try or third.
 */
export function updateDislikeDisplay(ryd) {
  const valueElement = ryd.dislikeValueElement;
  if (!valueElement || !valueElement.isConnected) return;
  const text = dislikeText(ryd);
  if (valueElement.textContent === text) return;
  valueElement.textContent = text;
  if (ryd.dislikeFactoidElement) {
    ryd.dislikeFactoidElement.setAttribute('aria-label', `${text} Dislikes`);
    compensateHeaderGrowth(ryd, ryd.dislikeFactoidElement.parentElement);
  }
}

/** Marks `header` among `rows` and no other, touching only the rows whose mark is wrong. */
function markHeaderRow(rows, header) {
  for (let i = 0; i < rows.length; i++) {
    const marked = rows[i].hasAttribute('data-ryd-header');
    if (rows[i] === header) {
      if (!marked) rows[i].setAttribute('data-ryd-header', '');
    } else if (marked) {
      rows[i].removeAttribute('data-ryd-header');
    }
  }
}

/** The root font size in px, read once per page (a forced style recalc). */
let rootFontSizePx = 0;

/** The page's root font size in px, read once (the panel's rem sizes depend on it). */
function rootFontSize() {
  if (!rootFontSizePx) {
    rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }
  return rootFontSizePx;
}

/** The row of YouTube's virtual list that holds `container`, with the list and its box, or null. */
function findHeaderRow(container) {
  const list = container && container.closest(SELECTORS.VIRTUAL_LIST);
  const box = list && list.firstElementChild;
  if (!box) return null;
  let row = container;
  while (row && row.parentNode !== box) row = row.parentNode;
  if (!row || !row.firstElementChild) return null;
  return { list, box, row };
}

/**
 * How far the row's content outgrew the height YouTube measured it at, in px,
 * and whether that is the last pass's answer for the same row; null for a row
 * YouTube never measured (0 or no inline height: its zero-height state), where
 * shifting against a bogus height would make things worse. Measured (a forced
 * layout) only when the row, its inline height or its content box changed
 * since the last pass; a re-render that keeps them keeps the delta.
 */
function measureGrowth(ryd, row) {
  const inline = row.style.height || '';
  const ytHeight = parseFloat(inline);
  if (!ytHeight) return null;
  const content = row.firstElementChild;
  const memo = ryd.shiftMemo;
  if (
    memo &&
    memo.row === row &&
    memo.height === inline &&
    memo.content === content &&
    memo.children === content.childElementCount
  ) {
    return { delta: memo.delta, unchanged: true };
  }
  const unit = inline.indexOf('rem') !== -1 ? rootFontSize() : 1;
  const delta = Math.round(content.getBoundingClientRect().height - ytHeight * unit);
  ryd.shiftMemo = { row, height: inline, content, children: content.childElementCount, delta };
  return { delta, unchanged: false };
}

/** Marks the list and its header row, and moves the rows below by `delta` px. */
function applyShift(ryd, found, delta) {
  if (ryd.shiftedList && ryd.shiftedList !== found.list) clearHeaderShift(ryd);
  ryd.shiftedList = found.list;
  if (!found.list.hasAttribute('data-ryd-shift')) found.list.setAttribute('data-ryd-shift', '');
  markHeaderRow(found.box.children, found.row);

  let style = ryd.shiftStyle;
  if (!style || !style.isConnected) {
    style = document.getElementById('ryd-shift-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ryd-shift-style';
      document.head.appendChild(style);
    }
    ryd.shiftStyle = style;
  }
  const css =
    delta > 1
      ? `${SELECTORS.VIRTUAL_LIST}[data-ryd-shift] > div > div:not([data-ryd-header]) { margin-top: ${delta}px !important; }`
      : '';
  if (style.textContent !== css) style.textContent = css;
}

// YouTube measures each description row once, in the same task that renders
// it, and positions the rows below from that measurement. The header row
// then grows under the .ryd-ready styles, but YouTube keeps positioning every
// row below it with the old height, so they cover the Views/Date line. Push
// those rows down by the difference.
//
// Rows are absolutely positioned, so margin-top moves them without touching
// YouTube's inline height/transform. The value lives in a stylesheet of its
// own, keyed on attributes, so a YouTube re-render cannot wipe it.
function compensateHeaderGrowth(ryd, container) {
  try {
    const found = findHeaderRow(container);
    if (!found) return;
    const growth = measureGrowth(ryd, found.row);
    if (!growth) return;
    // The same list, row and measurement as the last pass: the marks and the
    // rule are already in place.
    if (growth.unchanged && ryd.shiftedList === found.list) return;
    applyShift(ryd, found, growth.delta);
  } catch (error) {
    ryd.logger.error('Header shift error:', error);
  }
}

/** Undoes the header shift: the attributes on the panel's list and the shift stylesheet. */
export function clearHeaderShift(ryd) {
  const list = ryd.shiftedList;
  ryd.shiftedList = null;
  ryd.shiftMemo = null;
  if (list) {
    list.removeAttribute('data-ryd-shift');
    const hdr = list.querySelector('[data-ryd-header]');
    if (hdr) hdr.removeAttribute('data-ryd-header');
  }
  const style = document.getElementById('ryd-shift-style');
  if (style) style.textContent = '';
}

/**
 * The panel's layout and its factoid container: the layout is detected once
 * and kept on `ryd`, the container found on the way being the one used; null
 * when the panel has neither layout's container.
 */
function detectLayout(ryd, panelElement) {
  const cached = ryd.cachedMode;
  if (cached) {
    const container = panelElement.querySelector(cached.containerSelector);
    return container ? { mode: cached, container } : null;
  }
  let mode = MODE_CONFIGS.standard;
  let container = panelElement.querySelector(mode.containerSelector);
  if (!container) {
    mode = MODE_CONFIGS.compact;
    container = panelElement.querySelector(mode.containerSelector);
  }
  if (!container) return null;
  ryd.cachedMode = mode;
  return { mode, container };
}

/**
 * Clones the likes factoid in `container` into the dislike one, fills it in,
 * puts it right after the likes and keeps its elements on `ryd` for
 * updateDislikeDisplay(). False when there is no likes factoid, or no value
 * and label in it: the clone would be a second likes factoid that never
 * fills in.
 */
function insertDislikeFactoid(ryd, mode, container) {
  const likesElement = container.querySelector(
    `${PANEL.firstFactoid}${mode.factoidClass}, div[aria-label*="like"]${mode.factoidClass}, div[aria-label*="Like"]${mode.factoidClass}`
  );
  if (!likesElement) return false;

  const dislikeElement = likesElement.cloneNode(true);
  const valueElement = dislikeElement.querySelector(mode.valueSelector);
  const labelElement = dislikeElement.querySelector(mode.labelSelector);
  if (!valueElement || !labelElement) {
    ryd.logger.debug(`No value or label element in the ${mode.name} layout's factoid`);
    return false;
  }
  dislikeElement.id = 'ryd-dislike-factoid';
  dislikeElement.setAttribute('idomkey', 'factoid-ryd');
  const text = dislikeText(ryd);
  valueElement.textContent = text;
  labelElement.textContent = 'Dislikes';
  dislikeElement.setAttribute('aria-label', `${text} Dislikes`);
  ryd.dislikeValueElement = valueElement;
  ryd.dislikeFactoidElement = dislikeElement;

  likesElement.insertAdjacentElement('afterend', dislikeElement);
  return true;
}

/**
 * Puts the dislike factoid into the description panel (with a placeholder until the count arrives),
 * or keeps the header shift in step when it is already there.
 */
export function checkAndInjectDislike(ryd, panelElement) {
  if (ryd.isDestroyed || !ryd.enableDislikes) return;
  // Deliberately not gated on the fetch: waiting for the network meant that
  // on a slow first request the panel finished rendering with no dislike
  // factoid at all, and it only appeared later when some unrelated mutation
  // or focus change happened to re-run this. Inject now, fill in the number
  // when it arrives.
  const existing = document.getElementById('ryd-dislike-factoid');
  if (existing) {
    // Rows can be re-rendered while the panel is open; keep the shift in sync.
    compensateHeaderGrowth(ryd, existing.parentElement);
    return;
  }

  try {
    const layout = detectLayout(ryd, panelElement);
    if (!layout || !insertDislikeFactoid(ryd, layout.mode, layout.container)) return;
    const container = layout.container;
    container.classList.add('ryd-ready');
    if (NO_FLEX_GAP) container.classList.add('ryd-no-flex-gap');
    ryd.factoidContainer = container;
    compensateHeaderGrowth(ryd, container);
  } catch (error) {
    ryd.logger.error('Injection error:', error);
  }
}
