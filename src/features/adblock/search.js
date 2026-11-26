// The bounded tree lookups the filters use when a schema path misses. The
// shapes themselves (the paths, the type signatures) are in core/innertube.js.
import { getByPath } from '../../core/innertube.js';
import { boundedSearch } from '../../core/bounded-search.js';
import { log } from './log.js';

// How often the bounded search ran and how many nodes it visited: the adblock
// test reads this (window.__ytafAdblockStats) to keep the
// schema paths honest, since a search is what a missed path costs.
export const searchStats = { calls: 0, visits: 0 };

/**
 * The object at `path`, or when the path misses the first `needle` found by a
 * bounded search (through `fromFound` when the needle is not the object
 * wanted). A miss is logged: it means the schema moved.
 */
export function atPathOrSearch(data, path, needle, depth, label, fromFound) {
  const direct = getByPath(data, path);
  if (direct) return direct;
  const found = findObjects(data, [needle], depth)[needle];
  if (!found) return undefined;
  log.debug(`${label}: ${needle} found by search, not at its path`);
  return fromFound ? fromFound(found) : found;
}

/**
 * The first value found for each key in `needlesArray`, searching `haystack` breadth-first down to
 * `maxDepth`; stops once all are found.
 */
export function findObjects(haystack, needlesArray, maxDepth = 10) {
  if (!haystack || typeof haystack !== 'object' || maxDepth <= 0 || !needlesArray.length) return {};
  searchStats.calls++;
  const results = {};
  let foundCount = 0;
  const targetCount = needlesArray.length;
  boundedSearch(haystack, maxDepth, Infinity, (node) => {
    searchStats.visits++;
    for (let i = 0; i < targetCount; i++) {
      const needle = needlesArray[i];
      // Found once: a falsy value (null, 0, '') counts as found too.
      if (results[needle] === undefined && node[needle] !== undefined) {
        results[needle] = node[needle];
        foundCount++;
      }
    }
    return foundCount === targetCount;
  });
  return results;
}
