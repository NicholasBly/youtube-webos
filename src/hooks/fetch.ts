import { CustomEventTarget, TypedCustomEvent } from '../custom-event-target';

export interface StringConvertible {
  toString(): string;
}

export type FetchTarget = Request | StringConvertible;

let registry: FetchRegistry | null = null;

export interface RequestInfo {
  url: URL;
  resource: FetchTarget;
  init?: RequestInit | undefined;
}

interface EventMap {
  request: CustomEvent<RequestInfo>;
  response: CustomEvent<Response>;
}

export class FetchRegistry extends CustomEventTarget<EventMap> {
  #originalFetch: typeof fetch;
  #fetchCount = 0;
  // Per-type listener counts so #customFetch can skip URL construction and
  // CustomEvent dispatch when nobody is listening (e.g. tracking block off).
  // Native EventTarget exposes no listener count, so we maintain our own.
  #listenerCounts: { request: number; response: number } = {
    request: 0,
    response: 0
  };

  override addEventListener(type: any, callback: any, options?: any): void {
    super.addEventListener(type, callback, options);
    if (callback && (type === 'request' || type === 'response')) {
      this.#listenerCounts[type as 'request' | 'response']++;
    }
  }

  override removeEventListener(
    type: any,
    callback: any,
    options?: any
  ): void {
    super.removeEventListener(type, callback, options);
    if (callback && (type === 'request' || type === 'response')) {
      const key = type as 'request' | 'response';
      if (this.#listenerCounts[key] > 0) this.#listenerCounts[key]--;
    }
  }

  private constructor() {
    super();

    this.#originalFetch = window.fetch.bind(window);
    window.fetch = this.#customFetch;
  }

  static async #dumpBody(resource: Request | Response) {
    if (
      !resource?.constructor?.name ||
      !['Request', 'Response'].includes(resource.constructor.name)
    )
      return null;

    const blob = await resource.clone().blob();
    if (!blob.size) return null;

    const fr = new FileReader();

    const res = new Promise<string | ArrayBuffer | null>((resolve) => {
      fr.addEventListener('load', () => {
        resolve(fr.result);
      });
    });

    fr.readAsDataURL(blob);

    return res;
  }

  #customFetch = async (
    resource: FetchTarget,
    init?: RequestInit
  ): Promise<Response> => {
    // Fast path: no listeners and not debugging — pass straight through with
    // zero allocations (no URL object, no CustomEvent dispatch). Tracking
    // block off is the common case for most sessions.
    if (
      !window.__ytaf_debug__ &&
      this.#listenerCounts.request === 0 &&
      this.#listenerCounts.response === 0
    ) {
      return this.#originalFetch(resource as Parameters<typeof fetch>[0], init);
    }

    if (window.__ytaf_debug__) {
      console.debug(`Request ${this.#fetchCount}:`, resource);
      init && console.debug(`Options  ${this.#fetchCount}:`, init);

      if (resource instanceof Request) {
        const reqBody = await FetchRegistry.#dumpBody(resource);
        reqBody && console.debug(`Request Body ${this.#fetchCount}:`, reqBody);
      }
    }

    let reqAllowed = true;
    if (this.#listenerCounts.request > 0) {
      const url =
        resource instanceof Request
          ? new URL(resource.url)
          : new URL(resource.toString(), document.location.href);

      reqAllowed = this.dispatchEvent(
        new TypedCustomEvent('request', {
          detail: { url, resource, init },
          cancelable: true
        })
      );
    }

    if (!reqAllowed) {
      console.info(
        `Fetch request ${this.#fetchCount} was cancelled by listener.`,
        resource,
        init
      );
      throw new TypeError('Failed to fetch');
    }

    const res = await this.#originalFetch(resource, init);

    if (window.__ytaf_debug__) {
      console.debug(`Response ${this.#fetchCount}:`, res);

      const resBody = await FetchRegistry.#dumpBody(res);
      resBody && console.debug(`Response Body ${this.#fetchCount}:`, resBody);
    }

    let resAllowed = true;
    if (this.#listenerCounts.response > 0) {
      resAllowed = this.dispatchEvent(
        new TypedCustomEvent('response', { detail: res, cancelable: true })
      );
    }

    if (!resAllowed) {
      console.info(
        `Fetch response ${this.#fetchCount} was cancelled by listener.`,
        res
      );
      throw new TypeError('Failed to fetch');
    }

    this.#fetchCount++;

    return res;
  };

  static getInstance() {
    if (!registry) {
      registry = new FetchRegistry();
    }
    return registry;
  }

  [Symbol.dispose]() {
    window.fetch = this.#originalFetch;
    registry = null;
  }
}