// Blocks YouTube's telemetry requests at the fetch and XMLHttpRequest level.
import { FetchRegistry } from '../../hooks/fetch.ts';

import { TELEMETRY_REGEX } from './constants.js';
import { cfgFlags, onFlagsChange } from './flags.js';
import { log } from './log.js';

// The XHR wrappers are installed once and left in place, gated on `active`:
// restoring the prototype would also drop whatever another module wrapped on
// top of them. The fetch listener comes and goes with the setting.
let active = false;
let xhrInstalled = false;

/** Cancels a fetch to a telemetry path (the 'request' listener of the fetch hook). */
const telemetryFetchHandler = (evt) => {
  const { url } = evt.detail;
  // .pathname avoids the .href getter rebuilding the whole URL string, and all
  // BLOCKED_TELEMETRY_PATHS are path-only.
  if (TELEMETRY_REGEX.test(url.pathname)) {
    log.debug('Blocked telemetry Fetch request:', url.pathname);
    evt.preventDefault();
  }
};

/**
 * Wraps XMLHttpRequest open and send once; the wrappers block telemetry only while Tracking Block
 * is active.
 */
function installXHRWrappers() {
  const originalOpen = window.XMLHttpRequest.prototype.open;
  const originalSend = window.XMLHttpRequest.prototype.send;

  /**
   * Marks a request to a telemetry path and points it at an empty data: URL, so it completes
   * without reaching YouTube.
   */
  window.XMLHttpRequest.prototype.open = function (method, url) {
    // `arguments` rather than a rest parameter: no helper allocation per call.
    if (!active) {
      // A reused XHR object must not keep a flag from when the block was on.
      this.__ytafBlocked = false;
      return originalOpen.apply(this, arguments);
    }

    // `url` is a string or a URL object.
    let urlStr = '';
    if (typeof url === 'string') urlStr = url;
    else if (url && url.toString) urlStr = url.toString();
    // The part before the query, as fetch tests the pathname: a blocked path
    // inside a query string is not telemetry.
    const query = urlStr.indexOf('?');
    const path = query === -1 ? urlStr : urlStr.slice(0, query);
    this.__ytafBlocked = !!path && TELEMETRY_REGEX.test(path);

    if (this.__ytafBlocked) {
      log.debug('Blocked telemetry XHR request:', urlStr);
      // Point the request at an empty data: URL instead of refusing to send.
      const isAsync = arguments.length > 2 ? arguments[2] : true;
      return originalOpen.call(this, 'GET', 'data:text/plain,', isAsync);
    }
    return originalOpen.apply(this, arguments);
  };

  /** Sends a marked telemetry request without its body. */
  window.XMLHttpRequest.prototype.send = function (_body) {
    // Set per request by open() while active: the telemetry body is dropped.
    if (this.__ytafBlocked) return originalSend.call(this);
    return originalSend.apply(this, arguments);
  };
  xhrInstalled = true;
}

/** Turns Tracking Block on: the fetch listener, and the XHR wrappers the first time. */
function initTrackingBlock() {
  if (active) return;
  active = true;
  FetchRegistry.getInstance().addEventListener('request', telemetryFetchHandler);
  if (!xhrInstalled) installXHRWrappers();
  log.info('Telemetry network hooks enabled');
}

/**
 * Turns Tracking Block off: the fetch listener goes, the XHR wrappers stay and pass everything
 * through.
 */
function destroyTrackingBlock() {
  if (!active) return;
  active = false;
  FetchRegistry.getInstance().removeEventListener('request', telemetryFetchHandler);
  log.debug('Telemetry network hooks disabled');
}

/**
 * Puts the network hooks in line with the flags, now and on every change.
 * Whether Tracking Block is on is decided in one place, flags.js (it rides
 * on Ad Blocking); this only follows that flag.
 */
export function startTrackingBlock() {
  /** Turns Tracking Block on or off to match cfgFlags.enableTrackingBlock. */
  const sync = () => (cfgFlags.enableTrackingBlock ? initTrackingBlock() : destroyTrackingBlock());
  sync();
  onFlagsChange(sync);
}
