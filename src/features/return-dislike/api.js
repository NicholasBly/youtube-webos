// The Return YouTube Dislike API and its short-lived in-memory cache.
import { API, TIMING } from './constants.js';
import { fetchJsonWithTimeout } from '../../core/fetch-timeout.js';

const dislikeCache = new Map();

/** The cached count for a video, or undefined when absent or stale. */
export function getCachedDislikes(videoID) {
  const cached = dislikeCache.get(videoID);
  if (cached && Date.now() - cached.timestamp < TIMING.CACHE_MS) return cached.dislikes;
  return undefined;
}

/** Remembers a video's dislike count, keeping the 50 most recent videos. */
export function setCachedDislikes(videoID, dislikes) {
  dislikeCache.set(videoID, { dislikes, timestamp: Date.now() });
  if (dislikeCache.size > 50) dislikeCache.delete(dislikeCache.keys().next().value);
}

/**
 * Asks the API for the dislike count: `promise` rejects on HTTP errors,
 * network errors and after the timeout, so the caller decides about retries;
 * `abort()` drops the request.
 */
export function fetchDislikeCount(videoID) {
  const request = fetchJsonWithTimeout(API.url + videoID, API.timeoutMs);
  return {
    abort: request.abort,
    promise: request.promise.then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.data?.dislikes || 0;
    })
  };
}
