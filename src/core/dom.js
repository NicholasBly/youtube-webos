// DOM helpers shared by the features: the cached <video> lookup, waiting for a
// node to appear, and a plain debounce.

// The page's <video>, looked up once per watch or Shorts session and
// forgotten when the page state changes or the element leaves the document.
let cachedVideo = null;
/** The page's <video> element, cached while it stays in the document. */
export function getVideo() {
  if (cachedVideo && cachedVideo.isConnected) return cachedVideo;
  cachedVideo = document.querySelector('video');
  return cachedVideo;
}
window.addEventListener('ytaf-page-update', (e) => {
  // Drop the cache whenever we leave a video page; the next getVideo() call
  // will re-query on demand.
  if (!e.detail.isWatch && !e.detail.isShorts) cachedVideo = null;
});

/**
 * Calls `fn` every `intervalMs` until it returns true, for at most
 * `maxAttempts` calls (a count, not a time: the TV may set its clock
 * meanwhile); `onGiveUp` runs when the limit is reached first. The first call is the
 * caller's, before the poll. Returns a handle: cancel() stops it, from inside
 * `fn` too, and `active` is true until it found, gave up or was cancelled.
 */
export function pollUntil(fn, intervalMs, { maxAttempts = Infinity, onGiveUp } = {}) {
  let attempts = 0;
  let timer = null;
  const handle = {
    active: true,
    /** Stops the polling; `fn` is not called again and `onGiveUp` never runs. */
    cancel() {
      handle.active = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
  /**
   * One attempt: calls `fn`, stops on a truthy result or after `maxAttempts` (then `onGiveUp`),
   * else schedules the next attempt.
   */
  const tick = () => {
    timer = null;
    const found = fn();
    if (!handle.active) return;
    if (found) {
      handle.active = false;
      return;
    }
    if (++attempts >= maxAttempts) {
      handle.active = false;
      if (onGiveUp) onGiveUp();
      return;
    }
    timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return handle;
}

/**
 * Wraps `func` so a burst of calls runs it once, `wait` ms after the last call, with that call's
 * arguments and `this`. The wrapper has cancel().
 */
export function debounce(func, wait) {
  let timeout;
  /** Restarts the wait; the call that ends the burst is the one that runs. */
  const debounced = function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
  /** Drops the pending call, if any. */
  debounced.cancel = () => clearTimeout(timeout);
  return debounced;
}

/**
 * Waits for the first element added under `parent` (subtree) that passes
 * `predicate`. Only the root of each added subtree is tested: a predicate
 * that wants a node inside one looks for it itself. Returns
 * `{ promise, cancel }`: the promise resolves with the element and rejects
 * after `timeoutMs` or on cancel() (Chromium 38 has no AbortController, so
 * the waiter carries its own cancel).
 */
export function waitForChildAdd(parent, predicate, timeoutMs = 30000) {
  let cancel = null;
  const promise = new Promise((resolve, reject) => {
    let timer = null;

    const obs = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const addedNodes = mutations[i].addedNodes;
        for (let j = 0; j < addedNodes.length; j++) {
          const node = addedNodes[j];
          if (node.nodeType !== 1) continue;

          if (predicate(node)) {
            cleanup();
            resolve(node);
            return;
          }
        }
      }
    });

    /** Disconnects the observer and clears the timeout: the promise is settled or abandoned. */
    const cleanup = () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
      cancel = null;
    };

    cancel = () => {
      cleanup();
      reject(new Error('cancelled'));
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('waitForChildAdd timed out'));
      }, timeoutMs);
    }

    obs.observe(parent, { subtree: true, childList: true });
  });
  return {
    promise,
    /** Rejects the promise with 'cancelled' and stops watching, if it is still waiting. */
    cancel: () => {
      if (cancel) cancel();
    }
  };
}
