// The persistent videoId -> verified rank cache in localStorage.
import { CACHE_KEY, CACHE_CAP_KEY, CACHE_REVISION, CACHE_SAVE_DEBOUNCE } from './constants.js';
import { QUALITY_NAMES } from './ladder.js';
import { state, qualityCache, unconfirmed, clearStateTimer } from './state.js';
import { log } from './log.js';

/** Sets `key`, dropping the oldest entry at `limit`; returns the dropped key, or null. */
export function capSet(map, key, value, limit) {
  let evicted = null;
  if (map.size >= limit && !map.has(key)) {
    evicted = map.keys().next().value;
    map.delete(evicted);
  }
  map.set(key, value);
  return evicted;
}

// --- Persistent cache -----------------------------------------------------
// Compact "id:rank,id:rank" rather than JSON: it parses with one split on
// startup and avoids the hooked JSON.stringify entirely.

/** What CACHE_CAP_KEY holds: the ladder's rung and the cache revision, e.g. "3r2". */
const capMarker = () => state.usefulRank + 'r' + CACHE_REVISION;

/** Forgets the stored answers and records the ladder the next ones are measured against. */
export function dropStoredCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.setItem(CACHE_CAP_KEY, capMarker());
  } catch {
    // Storage refused: the answers are still forgotten for this session.
  }
}

/**
 * Loads the known best thumbnail of each video from localStorage ("id:rank" pairs); a cache written
 * for another strategy or an older revision is dropped instead.
 */
export function loadCache() {
  try {
    // The cache is only valid against the ladder that produced it. A cap
    // written by another mode, or no cap at all from a build that had no 'sd'
    // mode, means every stored answer is suspect: an upstream "maxres missing,
    // floor it" verdict would otherwise pin that video at hqdefault here and
    // never let an sddefault probe run. Drop it and start over; the same for
    // a cache of an older revision (CACHE_REVISION).
    const cap = window.localStorage.getItem(CACHE_CAP_KEY);
    if (cap !== capMarker()) {
      dropStoredCache();
      return;
    }
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parts = raw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      const sep = entry.lastIndexOf(':');
      if (sep < 1) continue;
      const rank = +entry.slice(sep + 1);
      if (rank >= 0 && rank < QUALITY_NAMES.length) qualityCache.set(entry.slice(0, sep), rank);
    }
    log.debug(`loaded ${qualityCache.size} cached qualities`);
  } catch {
    // Private mode / quota / storage disabled — the cache is an optimisation.
  }
}

/** Writes the confirmed entries of the cache, with the strategy marker they are valid for. */
function saveCache() {
  state.saveTimer = null;
  try {
    const out = [];
    qualityCache.forEach((rank, id) => {
      if (!unconfirmed.has(id)) out.push(id + ':' + rank);
    });
    window.localStorage.setItem(CACHE_KEY, out.join(','));
    window.localStorage.setItem(CACHE_CAP_KEY, capMarker());
  } catch {
    // Ignore.
  }
}

/** Saves the cache after CACHE_SAVE_DEBOUNCE ms, once for a burst of new answers. */
export function scheduleSave() {
  if (state.saveTimer) return;
  state.saveTimer = setTimeout(saveCache, CACHE_SAVE_DEBOUNCE);
}

/** Drops a pending save: for a cache that is about to be cleared anyway. */
export function cancelSave() {
  clearStateTimer('saveTimer');
}

/** Saves a pending change now (the app is going to the background). */
export function flushCache() {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    saveCache();
  }
}
