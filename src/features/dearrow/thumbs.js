// DeArrow's thumbnails, downloaded once and drawn as a 16:9 copy as wide as
// Max Thumbnail Quality makes the tiles around them (COPY_WIDTHS), as a blob
// URL (a data URL on webOS 3 and 4, where canvas has no toBlob), remembered
// with the video it belongs to.
import { configRead } from '../../core/config.js';
import {
  COPY_WIDTHS,
  DATA_URL_WIDTH,
  BLOB_BUDGET,
  DATA_URL_BUDGET,
  CACHE_LIMIT
} from './constants.js';

// copy width + ' ' + source URL -> the copy's URL
const copies = new Map();
// copy's URL -> the video it shows
const thumbOwners = new Map();
// The same key -> the download in flight, so a settings change meanwhile does
// not make a second copy of the same image (only one would ever be revoked).
const loadingThumbs = new Map();
// What the kept copies weigh: blob bytes, or data URL characters.
let keptWeight = 0;

/** Whether canvas can make blobs here (Chrome 50+); webOS 3 and 4 make data URLs. */
const canBlob = () =>
  typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.toBlob;

/** The video a copy shows, or undefined for any other URL. */
export const thumbOwner = (url) => thumbOwners.get(url);

/**
 * Whether the kept copies are at their limit: CACHE_LIMIT of them, or their
 * weight at BLOB_BUDGET (DATA_URL_BUDGET for data URLs, on webOS 3 and 4).
 */
export const thumbsFull = () =>
  copies.size >= CACHE_LIMIT || keptWeight >= (canBlob() ? BLOB_BUDGET : DATA_URL_BUDGET);

/**
 * How wide copies are drawn now: as wide as Max Thumbnail Quality's strategy
 * makes YouTube's tiles (COPY_WIDTHS), DATA_URL_WIDTH for data URLs.
 */
export function copyWidth() {
  if (!canBlob()) return DATA_URL_WIDTH;
  if (!configRead('upgradeThumbnails')) return COPY_WIDTHS.off;
  return COPY_WIDTHS[configRead('thumbnailQualityMode')] || COPY_WIDTHS.safe;
}

/**
 * Downloads `url` and resolves with a copy `width` wide (never wider than the
 * source), cropped to 16:9 (which also trims the letterbox of YouTube's 4:3
 * hq1 to hq3 frames); null when the image does not load (the thumbnail server
 * answers 204 for a frame it has not rendered yet) or cannot be drawn.
 */
function drawCopy(url, videoId, width, key) {
  return new Promise((done) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    /** Not loaded (204 for a frame not rendered yet, a network error): no copy. */
    img.onerror = () => done(null);
    /** Loaded: draws the copy. */
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        done(null);
        return;
      }
      /** Remembers the copy and its weight, if there is one, and resolves with it. */
      const finish = (copy, weight) => {
        if (copy) {
          copies.set(key, copy);
          thumbOwners.set(copy, videoId);
          keptWeight += weight;
        }
        done(copy);
      };
      try {
        const cropW = Math.min(w, (h * 16) / 9);
        const cropH = (cropW * 9) / 16;
        const outW = Math.round(Math.min(width, cropW));
        const outH = Math.round((outW * 9) / 16);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        canvas
          .getContext('2d')
          .drawImage(img, (w - cropW) / 2, (h - cropH) / 2, cropW, cropH, 0, 0, outW, outH);
        if (canvas.toBlob) {
          canvas.toBlob(
            (blob) => finish(blob ? URL.createObjectURL(blob) : null, blob ? blob.size : 0),
            'image/jpeg',
            0.85
          );
        } else {
          // toBlob is Chrome 50+. Two videos with the same frame would share a
          // data URL, so the copy carries its video in the fragment.
          const copy = canvas.toDataURL('image/jpeg', 0.85) + '#videoID=' + videoId;
          finish(copy, copy.length);
        }
      } catch {
        // A tainted canvas or no memory: YouTube's thumbnail stays.
        finish(null, 0);
      }
    };
    img.src = url;
  });
}

/** The copy of `url` for `videoId` at the current width: the one kept, the download in flight, or a new one. */
export function loadThumb(url, videoId) {
  const width = copyWidth();
  const key = width + ' ' + url;
  const cached = copies.get(key);
  if (cached) return Promise.resolve(cached);
  let loading = loadingThumbs.get(key);
  if (!loading) {
    loading = drawCopy(url, videoId, width, key);
    loadingThumbs.set(key, loading);
    loading.then(() => loadingThumbs.delete(key));
  }
  return loading;
}

/** Drops every copy, freeing the blobs. */
export function forgetThumbs() {
  copies.forEach((copy) => {
    if (copy.indexOf('blob:') === 0) URL.revokeObjectURL(copy);
  });
  copies.clear();
  thumbOwners.clear();
  keptWeight = 0;
}
