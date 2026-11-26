// How a rung's existence is checked: a HEAD request off screen, an image load
// on screen, and the mode's best rung resolved against the floor.
import { PROBE_TIMEOUT, PLACEHOLDER_MAX_BYTES, PLACEHOLDER_MAX_WIDTH } from './constants.js';
import { QUALITY_NAMES, FLOOR_RANK, buildUrl } from './ladder.js';
import { state } from './state.js';

// A probe that learned nothing, unlike a miss: it ran out of time, or the
// network failed. A missing rung is not an error: i.ytimg.com answers it with
// a 404 carrying CORS headers, so a HEAD reads its status and an image loads
// its grey placeholder (measured in Chromium); an error only comes when the
// request never got an answer.
const UNKNOWN = 'unknown';

/**
 * Whether the URL exists, by a HEAD request: true, false, UNKNOWN, or null
 * when the answer carried no readable Content-Length (a cross-origin answer
 * on Chromium 38 and 53), in which case the caller loads the image instead. A
 * grey placeholder answered 200 with a tiny body counts as missing too.
 */
function headExists(url) {
  return new Promise((resolve) => {
    let xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, true);
    } catch {
      resolve(UNKNOWN);
      return;
    }
    xhr.timeout = PROBE_TIMEOUT;

    /**
     * A 2xx answer: whether the file is bigger than YouTube's grey placeholder (null when the size
     * is not given); anything else is missing.
     */
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(false);
      const length = parseInt(xhr.getResponseHeader('Content-Length'), 10);
      resolve(isNaN(length) ? null : length > PLACEHOLDER_MAX_BYTES);
    };
    /** A network error: unknown. */
    xhr.onerror = () => resolve(UNKNOWN);

    /** A timeout: unknown. */
    xhr.ontimeout = () => resolve(UNKNOWN);
    try {
      xhr.send();
    } catch {
      resolve(UNKNOWN);
    }
  });
}

/**
 * Whether the URL exists, by loading the image.
 *
 * Used for tiles the app has already rendered. In the modes that draw
 * unproven rungs the tile shows this very URL, so the load comes out of the
 * browser's cache, whatever made the tile grey included (a missing rung loads
 * as the grey placeholder, caught on its width below); in the mode that waits
 * for proof the tile shows the floor, and the image loaded here is the one the
 * promotion then draws, so the download is not wasted. It also needs no CORS
 * at all, and a CSS background-image load never passes through fetch or
 * XMLHttpRequest, so the <img> is the only place this signal exists. An
 * `error` is a load that never got an answer, not a miss.
 */
function imageExists(url) {
  return new Promise((resolve) => {
    let img;
    try {
      img = new Image();
    } catch {
      resolve(UNKNOWN);
      return;
    }
    let settled = false;
    let timer = null;

    /** Settles the probe once, with its timer and the image's handlers cleared. */
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    // A missing derivative can also come back 200 with a grey placeholder, which
    // loads fine and has to be caught on its dimensions instead.
    img.onload = () => finish(img.naturalWidth > PLACEHOLDER_MAX_WIDTH);

    /** The image failed to load: unknown (a 404 and a network error look the same to an <img>). */
    img.onerror = () => finish(UNKNOWN);
    timer = setTimeout(() => finish(UNKNOWN), PROBE_TIMEOUT);
    img.src = url;
  });
}

/**
 * The mode's best rung if it exists, else the guaranteed floor. On screen the
 * image is asked (imageExists: cached in Fast mode, the promotion's own load
 * otherwise); off screen a HEAD, because an <img> there would pull down a full
 * image nobody is looking at.
 */
export async function resolveQuality(videoId, onScreen) {
  const rank = state.usefulRank;
  const url = buildUrl(videoId, QUALITY_NAMES[rank]);
  let exists = await (onScreen ? imageExists : headExists)(url);
  if (exists === null) exists = await imageExists(url);
  // Null: the probe learned nothing (a timeout or a network error).
  if (exists === UNKNOWN) return null;
  return exists ? rank : FLOOR_RANK;
}
