// fetch() of a JSON answer with a deadline that covers the body as well as
// the headers: the request is dropped when it passes (through an
// AbortController where the engine has one), and the timer is cleared on any
// outcome, so a request that won the race leaves nothing to fire later.
import { HAS_ABORT_CONTROLLER } from './webos.js';

/**
 * Starts the request; `promise` resolves with `{ ok, status, data }` (the
 * parsed body of a 2xx answer, or of an answer whose status is in
 * `readStatuses`; null otherwise, its body unread) or rejects like fetch(),
 * with Error('timeout') once the deadline passes, headers or body, and
 * `abort()` drops it early (an AbortError then). Without an AbortController
 * (webOS 3 and 4) the request itself runs on, but its answer is never handed
 * out after a timeout or an abort.
 */
export function fetchJsonWithTimeout(url, timeoutMs, readStatuses) {
  const controller = HAS_ABORT_CONTROLLER ? new AbortController() : null;
  let timer = null;
  let cut = null;
  const cutoff = new Promise((_, reject) => {
    cut = reject;
    // Rejected before the controller aborts: the request's own AbortError
    // would otherwise win the race and a timeout would read as an abort.
    timer = setTimeout(() => {
      reject(new Error('timeout'));
      if (controller) controller.abort();
    }, timeoutMs);
  });
  const request = (controller ? fetch(url, { signal: controller.signal }) : fetch(url)).then(
    (response) =>
      response.ok || (readStatuses && readStatuses.indexOf(response.status) !== -1)
        ? response.json().then((data) => ({ ok: response.ok, status: response.status, data }))
        : { ok: false, status: response.status, data: null }
  );
  const promise = Promise.race([request, cutoff]).then(
    (result) => {
      clearTimeout(timer);
      return result;
    },
    (error) => {
      clearTimeout(timer);
      throw error;
    }
  );
  return {
    promise,
    /**
     * Settles the request as an AbortError and aborts the network request where AbortController
     * exists.
     */
    abort() {
      const error = new Error('aborted');
      error.name = 'AbortError';
      cut(error);
      if (controller) controller.abort();
    }
  };
}
