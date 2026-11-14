// Fetching a video's segments from the SponsorBlock API, primary server then
// fallback, and picking that video's own out of the hash-prefix answer.
import sha256 from 'tiny-sha256';
import { API, FETCH_CATEGORIES, FETCH_ACTION_TYPES } from './constants.js';
import { fetchJsonWithTimeout } from '../../core/fetch-timeout.js';

/** Whether an API entry has the shape the handler relies on. */
function isWellFormedSegment(entry) {
  return (
    !!entry &&
    typeof entry.category === 'string' &&
    Array.isArray(entry.segment) &&
    typeof entry.segment[0] === 'number' &&
    typeof entry.segment[1] === 'number'
  );
}

/** The list for `hashPrefix`, `[]` when the API has none, or null when both servers failed. */
async function fetchSegments(sb, hashPrefix) {
  if (sb.isDestroyed) return null;

  /**
   * Asks one SponsorBlock server for the segments of every video sharing the hash prefix: the list,
   * [] when the server has none (404), null on any failure (so the next server is tried). Abortable
   * through sb.abortFetch.
   */
  const tryFetch = async (url) => {
    if (sb.isDestroyed) return null;

    try {
      const fetchURL = `${url}/skipSegments/${hashPrefix}?categories=${FETCH_CATEGORIES}&actionTypes=${FETCH_ACTION_TYPES}`;
      const request = fetchJsonWithTimeout(fetchURL, API.timeoutMs);
      // destroy() drops the request, body read included, through this.
      sb.abortFetch = request.abort;
      let res;
      try {
        res = await request.promise;
      } finally {
        sb.abortFetch = null;
      }

      if (res.ok) return res.data;
      // 404 is the API saying there is nothing for this prefix; anything else
      // is a failure worth trying the fallback for.
      if (res.status === 404) return [];
      sb.logger.warn('SponsorBlock API answered', res.status, 'at', url);
      return null;
    } catch (e) {
      if (!sb.isDestroyed && e.name !== 'AbortError') {
        sb.logger.warn('Fetch attempt failed:', e.message);
      }
      return null;
    }
  };

  let res = await tryFetch(API.primary);
  if (res === null) res = await tryFetch(API.fallback);
  return res;
}

/**
 * The well-formed segments of `videoID`, `[]` when the API has none for it,
 * or null when no list came back (both servers failed, or answered with
 * something else) or the handler was destroyed meanwhile. Never throws.
 */
export async function fetchVideoSegments(sb, videoID) {
  // The hash-prefix endpoint answers with every video sharing the prefix.
  const data = await fetchSegments(sb, sha256(videoID).substring(0, 4));
  if (sb.isDestroyed) return null;
  if (!Array.isArray(data)) {
    sb.logger.warn(
      data === null
        ? 'SponsorBlock API unreachable, no segments for this video'
        : 'SponsorBlock API answered with something other than a list'
    );
    return null;
  }
  const entry = data.find((x) => x && x.videoID === videoID);
  // An entry of another shape is dropped rather than trusted.
  const segments =
    entry && Array.isArray(entry.segments) ? entry.segments.filter(isWellFormedSegment) : [];
  // The settings and the colour table know the API's music_offtopic as musicofftopic.
  for (const segment of segments) {
    if (segment.category === 'music_offtopic') segment.category = 'musicofftopic';
  }
  if (segments.length === 0) sb.logger.debug('No SponsorBlock segments for this video');
  return segments;
}

/**
 * fetchVideoSegments(), asked again after each of API.retryMs while no list
 * comes back (both servers down, say; an empty list is an answer). The wait
 * is in the handler's bag, so destroy() drops it.
 */
export async function fetchSegmentsRetrying(sb, videoID, attempt = 0) {
  const segments = await fetchVideoSegments(sb, videoID);
  if (segments !== null || sb.isDestroyed || attempt >= API.retryMs.length) return segments;
  await new Promise((resolve) => sb.bag.timeout(resolve, API.retryMs[attempt]));
  return fetchSegmentsRetrying(sb, videoID, attempt + 1);
}
