// DeArrow in the responses: every video tile of an InnerTube response, found
// by a bounded walk, is remembered with its video and gets what is decided
// for it: the title, the thumbnail, and the DeArrow badge in its metadata
// line. A tile seen before its video's answer is written to again when the
// answer lands (applyToVideo), so YouTube draws it right whenever it draws it
// from that response (scrolling, coming back to a page). YouTube keeps
// parsed responses and renders cached pages from them, so what each tile had
// is recorded once and can be put back.
import { configRead } from '../../core/config.js';
import { TILES_PER_VIDEO, SCAN_MAX_DEPTH, SCAN_MAX_NODES, BADGE_MARK } from './constants.js';
import { videos } from './state.js';

// Branches the walk never enters: they hold no tiles (the response context,
// the entity store) or copies of a tile's data that are not drawn as a tile
// (the long-press menu, the commands).
const SKIP_KEYS = {
  responseContext: true,
  frameworkUpdates: true,
  onLongPressCommand: true,
  onSelectCommand: true,
  onFocusCommand: true,
  trackingParams: true
};

// tile -> what YouTube had in it: { title, simpleText, runs, thumbnail,
// thumbnails, items, badge }; `items` and `badge` are the metadata line the
// DeArrow badge went into and the badge itself, while it is there.
const originals = new WeakMap();

// The metadata badge YouTube draws "4K", "HD" or "CC" with, as first seen in
// a response: copied for the DeArrow badge, so it takes the same shape and
// look. Until one is seen, the plain shape those badges have.
let badgeTemplate = { metadataBadgeRenderer: { style: 'BADGE_STYLE_TYPE_SIMPLE' } };
let badgeLearned = false;

/** "1:02:03" -> 3723 seconds; null for anything else. */
function parseDuration(text) {
  if (!text || !/^\d+(?::\d+)+$/.test(text)) return null;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/** What YouTube sent for a tile: its title, its thumbnail URL and its length in seconds. */
function readTile(tile) {
  const title = tile.metadata?.tileMetadataRenderer?.title;
  const header = tile.header?.tileHeaderRenderer;
  let duration = null;
  const overlays = header?.thumbnailOverlays;
  if (Array.isArray(overlays)) {
    for (let i = 0; i < overlays.length && duration === null; i++) {
      duration = parseDuration(overlays[i]?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText);
    }
  }
  let original = null;
  if (title) {
    if (typeof title.simpleText === 'string') original = title.simpleText;
    else if (Array.isArray(title.runs)) original = title.runs.map((r) => r.text).join('');
  }
  return {
    original,
    originalThumb: header?.thumbnail?.thumbnails?.[0]?.url ?? null,
    duration
  };
}

/** The item lists of a tile's metadata lines (each line's lineRenderer.items). */
function lineItemLists(tile) {
  const lines = tile.metadata?.tileMetadataRenderer?.lines;
  const lists = [];
  if (!Array.isArray(lines)) return lists;
  for (let i = 0; i < lines.length; i++) {
    const items = lines[i]?.lineRenderer?.items;
    if (Array.isArray(items)) lists.push(items);
  }
  return lists;
}

/** Whether a metadata line item is a badge ("4K", "HD", "CC"), not text. */
const isBadge = (item) => !!(item && item.lineItemRenderer && item.lineItemRenderer.badge);

/** Remembers the first real badge seen, without its label, as the shape of the DeArrow badge. */
function learnBadge(lists) {
  for (let i = 0; i < lists.length && !badgeLearned; i++) {
    for (let j = 0; j < lists[i].length; j++) {
      if (!isBadge(lists[i][j])) continue;
      badgeTemplate = JSON.parse(JSON.stringify(lists[i][j].lineItemRenderer.badge));
      badgeLearned = true;
      break;
    }
  }
}

/**
 * A DeArrow badge for a metadata line: the learned badge with BADGE_MARK as
 * its label, which the sweep (sweep.js) draws as the DeArrow logo.
 */
function makeBadge() {
  const badge = JSON.parse(JSON.stringify(badgeTemplate));
  const renderer = badge.metadataBadgeRenderer || badge[Object.keys(badge)[0]] || badge;
  renderer.label = BADGE_MARK;
  delete renderer.icon;
  if (renderer.accessibilityData) {
    renderer.accessibilityData = { accessibilityData: { label: 'DeArrow' } };
  }
  return { lineItemRenderer: { badge } };
}

/**
 * Where the DeArrow badge goes: after the last badge of the line that has
 * one (next to "4K"), else at the start of the last line (the one with the
 * views and the age). Returns [items, index], or null for a tile without lines.
 */
function badgeSlot(lists) {
  for (let i = 0; i < lists.length; i++) {
    let last = -1;
    for (let j = 0; j < lists[i].length; j++) if (isBadge(lists[i][j])) last = j;
    if (last !== -1) return [lists[i], last + 1];
  }
  return lists.length ? [lists[lists.length - 1], 0] : null;
}

/** The record of what YouTube had in `tile`, made the first time DeArrow writes to it. */
function originalOf(tile) {
  let rec = originals.get(tile);
  if (rec) return rec;
  const title = tile.metadata?.tileMetadataRenderer?.title || null;
  const thumbnail = tile.header?.tileHeaderRenderer?.thumbnail || null;
  rec = {
    title,
    simpleText: title ? title.simpleText : undefined,
    runs: title ? title.runs : undefined,
    thumbnail,
    thumbnails: thumbnail ? thumbnail.thumbnails : null,
    items: null,
    badge: null
  };
  originals.set(tile, rec);
  return rec;
}

/** Puts YouTube's own title back into a tile. */
function restoreTitle(rec) {
  if (!rec.title) return;
  if (rec.simpleText === undefined) delete rec.title.simpleText;
  else rec.title.simpleText = rec.simpleText;
  if (rec.runs) rec.title.runs = rec.runs;
}

/** Takes the DeArrow badge back out of its metadata line. */
function removeBadge(rec) {
  if (!rec.badge) return;
  const at = rec.items.indexOf(rec.badge);
  if (at !== -1) rec.items.splice(at, 1);
  rec.items = null;
  rec.badge = null;
}

/**
 * Writes what is decided for `video` into a tile of a response: its title and
 * thumbnail (YouTube's own where nothing is), and the badge while either is a
 * crowdsourced one and the badge setting is on.
 */
function applyToTile(tile, video) {
  const rec = originalOf(tile);
  if (rec.title) {
    if (video.title) {
      rec.title.simpleText = video.title;
      delete rec.title.runs;
      video.shownTitle = video.title;
    } else {
      restoreTitle(rec);
    }
  }
  if (rec.thumbnail) {
    if (video.thumb) {
      rec.thumbnail.thumbnails = [{ url: video.thumb, width: 1280, height: 720 }];
      video.shownThumb = video.thumb;
    } else {
      rec.thumbnail.thumbnails = rec.thumbnails;
    }
  }
  // Only for what the community submitted: with the Random frame fallback
  // nearly every thumbnail changes, and a badge on every tile tells nothing.
  const wantBadge =
    !!((video.title && video.crowdTitle) || (video.thumb && video.crowdThumb)) &&
    !!configRead('dearrowShowBadge');
  if (wantBadge && !rec.badge) {
    const slot = badgeSlot(lineItemLists(tile));
    if (slot) {
      rec.items = slot[0];
      rec.badge = makeBadge();
      rec.items.splice(slot[1], 0, rec.badge);
    }
  } else if (!wantBadge) {
    removeBadge(rec);
  }
}

/** Writes what is now decided for `video` into every tile of it remembered from the responses. */
export function applyToVideo(video) {
  if (!video.tiles) return;
  for (let i = 0; i < video.tiles.length; i++) applyToTile(video.tiles[i], video);
}

/** Puts YouTube's own titles, thumbnails and lines back into every stored response edited. */
export function unpatchResponses() {
  videos.forEach((video) => {
    if (!video.tiles) return;
    for (let i = 0; i < video.tiles.length; i++) {
      const tile = video.tiles[i];
      const rec = originals.get(tile);
      if (!rec) continue;
      restoreTitle(rec);
      if (rec.thumbnail) rec.thumbnail.thumbnails = rec.thumbnails;
      removeBadge(rec);
      originals.delete(tile);
    }
  });
}

/** Remembers `tile` as one of `video`'s (the last TILES_PER_VIDEO of them). */
function remember(video, tile) {
  if (!video.tiles) video.tiles = [];
  if (video.tiles.indexOf(tile) !== -1) return;
  if (video.tiles.push(tile) > TILES_PER_VIDEO) {
    // An older cached page may keep a DeArrow title until YouTube asks for it again.
    video.tiles.shift();
  }
}

/**
 * Walks a parsed response breadth first (so videos come in screen order),
 * bounded by SCAN_MAX_NODES and SCAN_MAX_DEPTH: each video tile is
 * remembered, and written to when its video is decided. Returns the ids of
 * the videos seen for the first time, now waiting for a lookup.
 */
export function patchResponseTiles(data) {
  const found = [];
  const nodes = [data, 0];
  let index = 0;
  while (index < nodes.length && index < SCAN_MAX_NODES * 2) {
    const node = nodes[index++];
    const depth = nodes[index++];
    if (depth > SCAN_MAX_DEPTH) continue;

    const tile = node.tileRenderer;
    if (
      tile &&
      tile.contentType === 'TILE_CONTENT_TYPE_VIDEO' &&
      typeof tile.contentId === 'string'
    ) {
      if (!badgeLearned) learnBadge(lineItemLists(tile));
      const videoId = tile.contentId;
      let video = videos.get(videoId);
      if (!video) {
        const info = readTile(tile);
        video = {
          original: info.original,
          originalThumb: info.originalThumb,
          duration: info.duration,
          raw: null,
          fetched: false,
          fetching: null,
          title: null,
          thumb: null,
          resolved: false,
          shownTitle: null,
          shownThumb: null,
          crowdTitle: false,
          crowdThumb: false,
          tiles: null
        };
        videos.set(videoId, video);
        found.push(videoId);
      }
      remember(video, tile);
      if (video.resolved) applyToTile(tile, video);
      continue;
    }

    for (const key in node) {
      if (SKIP_KEYS[key]) continue;
      const value = node[key];
      if (value && typeof value === 'object') nodes.push(value, depth + 1);
    }
  }
  return found;
}
