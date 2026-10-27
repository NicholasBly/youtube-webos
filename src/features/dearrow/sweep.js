// DeArrow on screen: the rendered tiles brought in line with what is decided
// for their videos, or put back to YouTube's own. A tile is matched to its
// video by the thumbnail it shows (YouTube's URL carries the id, DeArrow's
// small copies are looked up), and only text or images this feature wrote
// are ever put back. The DeArrow badge YouTube draws from the responses
// (tiles.js) gets the logo here, or is hidden while the badge is off.
import { configRead } from '../../core/config.js';
import { SELECTORS } from '../../core/selectors.js';
import { VIDEO_ID_RE, BADGE_MARK } from './constants.js';
import logoUrl from './dearrow-logo.png';
import './dearrow.css';
import { videos } from './state.js';
import { thumbOwner } from './thumbs.js';

// The URL inside a CSS background-image value.
const BACKGROUND_URL_RE = /url\("?([^")]+)"?\)/;

/**
 * Replaces an element's text, editing its one text node where it has one: the
 * renderer keeps a handle on that node and reuses the tile for other videos.
 */
function setText(el, text) {
  const first = el.firstChild;
  if (first && first.nodeType === 3 && !first.nextSibling) first.nodeValue = text;
  else el.textContent = text;
}

/** The video a rendered tile shows, from its thumbnail, or undefined. */
function tileVideo(thumbEl) {
  const background = thumbEl && thumbEl.style.backgroundImage;
  if (!background) return undefined;
  const shown = BACKGROUND_URL_RE.exec(background);
  const owner = shown && thumbOwner(shown[1]);
  const match = owner ? null : VIDEO_ID_RE.exec(background);
  return videos.get(owner || (match && match[1]));
}

/** One tile's thumbnail: DeArrow's on top (`want`), or YouTube's back when DeArrow put one there. */
function sweepThumb(thumbEl, video, want) {
  const background = thumbEl.style.backgroundImage;
  if (want) {
    // On top, not just present: Max Thumbnail Quality can layer an upgraded
    // original over whatever the tile shows.
    const at = background.indexOf(want);
    if (at === -1 || at > 5) thumbEl.style.backgroundImage = `url("${want}")`;
    video.shownThumb = want;
  } else if (
    video.shownThumb &&
    video.originalThumb &&
    background.indexOf(video.shownThumb) !== -1
  ) {
    thumbEl.style.backgroundImage = `url("${video.originalThumb}")`;
  }
}

/** One tile's title: DeArrow's (`want`), or YouTube's back when the text is still DeArrow's. */
function sweepTitle(titleEl, video, want) {
  if (want) {
    if (titleEl.textContent !== want) setText(titleEl, want);
    video.shownTitle = want;
  } else if (video.shownTitle && video.original && titleEl.textContent === video.shownTitle) {
    setText(titleEl, video.original);
  }
}

const BADGE_CLASS = 'ytaf-dearrow-badge';

/**
 * The DeArrow badges YouTube drew in a tile (the text BADGE_MARK): the logo
 * drawn over the mark, or with `hide` the whole badge hidden (DeArrow or its
 * badge switched off, until YouTube draws the tile again without it).
 */
function sweepBadges(tile, hide) {
  const meta = tile.querySelector(SELECTORS.TILE_METADATA);
  if (!meta) return;
  const elements = meta.getElementsByTagName('*');
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.firstElementChild || el.textContent !== BADGE_MARK) continue;
    // The badge itself: the highest element that holds the mark and nothing else.
    let badge = el;
    while (
      badge.parentNode &&
      badge.parentNode !== meta &&
      badge.parentNode.textContent === BADGE_MARK
    ) {
      badge = badge.parentNode;
    }
    badge.style.display = hide ? 'none' : '';
    if (!el.classList.contains(BADGE_CLASS)) {
      el.classList.add(BADGE_CLASS);
      el.style.backgroundImage = `url("${logoUrl}")`;
    }
  }
}

/**
 * Brings every rendered tile in line with what is decided for its video; with
 * `restoreAll`, puts back every original this feature replaced (DeArrow off).
 */
export function sweepTiles(restoreAll) {
  if (videos.size === 0) return;
  const tiles = document.querySelectorAll(SELECTORS.TILE);
  const hideBadges = restoreAll || !configRead('dearrowShowBadge');
  for (let i = 0; i < tiles.length; i++) {
    sweepBadges(tiles[i], hideBadges);
    const thumbEl = tiles[i].querySelector(SELECTORS.THUMBNAIL_TILE);
    const video = tileVideo(thumbEl);
    if (!video) continue;
    sweepThumb(thumbEl, video, restoreAll ? null : video.thumb);
    const titleEl = tiles[i].querySelector(SELECTORS.TILE_TITLE);
    if (titleEl) sweepTitle(titleEl, video, restoreAll ? null : video.title);
  }
}
