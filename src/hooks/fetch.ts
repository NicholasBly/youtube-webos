// The fetch hook: wraps window.fetch once and lets listeners see, and cancel,
// requests. Consumers get the one instance through getInstance().
import { createLogger, isDebugEnabled } from '../core/log.js';

const log = createLogger('Fetch');

interface StringConvertible {
  toString(): string;
}

type FetchTarget = Request | StringConvertible;

/** The detail of a 'request' event: the URL parsed once, and fetch()'s own arguments. */
interface FetchRequestDetail {
  url: URL;
  resource: FetchTarget;
  init?: RequestInit | undefined;
}

interface FetchEventMap {
  request: CustomEvent<FetchRequestDetail>;
}

type FetchEventType = keyof FetchEventMap;

type FetchListener<K extends FetchEventType> = (evt: FetchEventMap[K]) => void;

let registry: FetchRegistry | null = null;

/** Runs one listener; one that throws is logged and the rest still run, as on an event target. */
function callListener<E>(listener: (evt: E) => void, evt: E): void {
  try {
    listener(evt);
  } catch (error) {
    log.error('A fetch listener threw:', error);
  }
}

export class FetchRegistry {
  #originalFetch: typeof fetch;
  #fetchCount = 0;
  // The listeners per event, called in the order added, each once (a Set,
  // as an event target keeps them). The fetch fast path reads their sizes.
  #listeners: Record<FetchEventType, Set<unknown>> = {
    request: new Set()
  };

  /** Wraps window.fetch; private, as there is one registry (getInstance()). */
  private constructor() {
    this.#originalFetch = window.fetch.bind(window);
    window.fetch = this.#customFetch;
  }

  /** The one registry, created (and fetch wrapped) on first use. */
  static getInstance() {
    if (!registry) registry = new FetchRegistry();
    return registry;
  }

  /** Adds a listener for `type` ('request'); it can cancel a request with preventDefault(). */
  addEventListener<K extends FetchEventType>(type: K, callback: FetchListener<K>): void {
    this.#listeners[type].add(callback);
  }

  /** Removes a listener added with addEventListener. */
  removeEventListener<K extends FetchEventType>(type: K, callback: FetchListener<K>): void {
    this.#listeners[type].delete(callback);
  }

  /** Calls the listeners with a cancelable event; false when one prevented it. */
  #dispatch<K extends FetchEventType>(type: K, detail: FetchEventMap[K]['detail']): boolean {
    const evt = new CustomEvent(type, { detail, cancelable: true }) as FetchEventMap[K];
    const registered = this.#listeners[type];
    // Those registered when the event starts, as an event target calls them:
    // one added meanwhile waits for the next event, one removed meanwhile is
    // skipped.
    const listeners: unknown[] = [];
    registered.forEach((listener) => {
      listeners.push(listener);
    });
    for (let i = 0; i < listeners.length; i++) {
      if (registered.has(listeners[i])) callListener(listeners[i] as FetchListener<K>, evt);
    }
    return !evt.defaultPrevented;
  }

  // Not async: on the fast path the original promise is returned as is, with
  // no wrapper promise, no URL object and no event. The registry exists once
  // Tracking Block was first turned on (features/adblock/tracking-block.js);
  // turned off again it has no listener, and every request takes this path.
  // The cast block (features/block-webos-cast) does its own check without it.
  #customFetch = (resource: FetchTarget, init?: RequestInit): Promise<Response> => {
    if (!isDebugEnabled() && this.#listeners.request.size === 0) {
      return this.#originalFetch(resource as Parameters<typeof fetch>[0], init);
    }
    return this.#hookedFetch(resource, init);
  };

  /**
   * The slow path: numbers and logs the request when diagnostics are on, lets the 'request'
   * listeners see and cancel it (a cancelled one fails like a network error), then fetches.
   */
  async #hookedFetch(resource: FetchTarget, init?: RequestInit): Promise<Response> {
    // Numbered at the start: requests in parallel each keep their own number.
    const n = this.#fetchCount++;
    // Diagnostics log what a request is and how it was answered, never a
    // body: reading one would delay the answer and hold a copy of it, and the
    // TV checks run with diagnostics on.
    if (isDebugEnabled()) {
      log.debug(`Request ${n}:`, resource instanceof Request ? resource.url : String(resource));
      if (init) log.debug(`Options  ${n}:`, init);
    }

    if (this.#listeners.request.size > 0) {
      const url =
        resource instanceof Request
          ? new URL(resource.url)
          : new URL(resource.toString(), document.location.href);
      if (!this.#dispatch('request', { url, resource, init })) {
        log.info(`Fetch request ${n} was cancelled by listener.`, resource, init);
        throw new TypeError('Failed to fetch');
      }
    }

    const res = await this.#originalFetch(resource as Parameters<typeof fetch>[0], init);

    if (isDebugEnabled()) {
      const size = res.headers ? res.headers.get('content-length') : null;
      log.debug(`Response ${n}:`, res.status, size === null ? '' : size + ' bytes');
    }

    return res;
  }
}
