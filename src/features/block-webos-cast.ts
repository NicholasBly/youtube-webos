/**
 * Fixes webosbrew/youtube-webos/issues/343
 *
 * Wraps window.fetch itself rather than listening on the FetchRegistry: a
 * registry listener takes every request of the app through the hooked path
 * (a URL object and an event per call), while this is one string check.
 */

import { createLogger } from '../core/log.js';

const log = createLogger('BlockWebOSCast');

const CAST_PATH = '/wake_cast_core';

/** Whether `url` ends its path with the cast wake-up (followed by nothing, a query or a hash). */
function isCastWakeUp(url: string): boolean {
  const at = url.indexOf(CAST_PATH);
  if (at === -1) return false;
  const next = url.charCodeAt(at + CAST_PATH.length);
  return Number.isNaN(next) || next === 63 /* ? */ || next === 35; /* # */
}

/**
 * Wraps window.fetch so the request that wakes webOS's cast receiver fails like a network error;
 * every other request passes through.
 */
export function initBlockWebOSCast() {
  log.info('Initialized');

  const original = window.fetch;
  window.fetch = function (resource: Parameters<typeof fetch>[0], init?: RequestInit) {
    // A string, a Request, or a URL object (its string is the URL).
    let url: string;
    if (typeof resource === 'string') url = resource;
    else if (resource instanceof Request) url = resource.url;
    else url = String(resource);
    if (isCastWakeUp(url)) {
      log.info('Blocked the cast wake-up');
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    // With the window: the native fetch throws "Illegal invocation" for any
    // other receiver, and the app may call it as a method of its own object.
    return original.call(window, resource, init);
  } as typeof fetch;
}
