// Adapted from foxi69/youtube-webos#156 (GPL-3.0). Leanback scales the shared
// video player *behind* the grid. webOS can put decoded video on a separate
// hardware plane, so clear the paint above it rather than copying the pixels.
import { configAddChangeListener, configRead } from '../core/config.js';
import { isWatchPage, isShortsPage } from '../core/page-state.js';
import { getWebOSVersion } from '../core/webos.js';
import './preview-cover.css';

const CLEAR = 'ytaf-preview-cover';
const RESCAN_MS = 5000;
let active = null;
let timer = null;
let frame = null;
let cleared = [];

/** Restore the elements that are no longer above the current preview. */
function updateCover(next) {
  for (const el of cleared) if (!next.includes(el)) el.classList.remove(CLEAR);
  for (const el of next) if (!el.classList.contains(CLEAR)) el.classList.add(CLEAR);
  cleared = next;
}

/** Stop sampling when playback stops, the element is removed, or the page changes. */
function stop() {
  clearInterval(timer);
  timer = null;
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  active = null;
  updateCover([]);
}

/** Can this element's own paint cover a hardware video plane? */
function paints(el) {
  if (el.classList.contains(CLEAR) || el.matches('img, canvas, svg')) return true;
  const style = getComputedStyle(el);
  const bg = style.backgroundColor;
  return (
    (bg && bg !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(bg)) ||
    (style.backgroundImage && style.backgroundImage !== 'none')
  );
}

/** Hit-test decoration too, without changing the pointer target of any user event. */
function previewStack(x, y) {
  const probe = document.createElement('style');
  probe.textContent = '* { pointer-events: auto !important; }';
  document.head.appendChild(probe);
  try {
    return document.elementsFromPoint(x, y);
  } finally {
    probe.remove();
  }
}

/** Follow tile recycling, clearing only layers in front of the playing video. */
function refresh() {
  if (!active?.isConnected || active.paused || active.ended || isWatchPage() || isShortsPage()) {
    stop();
    return;
  }
  const rect = active.getBoundingClientRect();
  const next = [];
  if (rect.width && rect.height && (rect.width < innerWidth || rect.height < innerHeight)) {
    const stack = previewStack(rect.left + rect.width / 2, rect.top + rect.height / 2);
    for (const el of stack) {
      if (el.contains(active)) break;
      // Do not erase an open settings panel or its contents.
      if (el.closest('.ytaf-ui-container')) continue;
      if (paints(el)) next.push(el);
    }
  }
  updateCover(next);
}

/** Coalesce navigation events into one hit-test after the layout settles. */
function queueRefresh() {
  if (!active || frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    refresh();
  });
}

/** Start following an already-playing inline video or the one that just started. */
function follow(video) {
  if (isWatchPage() || isShortsPage() || !configRead('clearPreviewCover')) return;
  active = video;
  refresh();
  // Catch recycled layers even if YouTube did not move focus or restart playback.
  if (active && timer === null) timer = setInterval(queueRefresh, RESCAN_MS);
}

/** Handle changes of page or setting without requiring a new playing event. */
function sync() {
  stop();
  if (!configRead('clearPreviewCover') || isWatchPage() || isShortsPage()) return;
  for (const video of document.querySelectorAll('video')) {
    if (!video.paused && !video.ended) {
      follow(video);
      break;
    }
  }
}

// The legacy build aliases this module away. Its settings page reads this flag too.
export const previewCoverAvailable =
  getWebOSVersion() >= 22 && typeof document.elementsFromPoint === 'function';

if (previewCoverAvailable) {
  document.addEventListener('focusin', queueRefresh, true);
  window.addEventListener('resize', queueRefresh);
  document.addEventListener('transitionend', ({ target }) => {
    if (active && target.contains(active)) queueRefresh();
  });
  document.addEventListener(
    'playing',
    ({ target }) => {
      if (target instanceof HTMLVideoElement) follow(target);
    },
    true
  );
  for (const event of ['pause', 'ended', 'emptied', 'error']) {
    document.addEventListener(
      event,
      ({ target }) => {
        if (target === active) stop();
      },
      true
    );
  }
  window.addEventListener('ytaf-page-update', sync);
  configAddChangeListener('clearPreviewCover', sync);
  sync();
}
