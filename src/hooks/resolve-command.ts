// Adapted from https://github.com/reisxd/TizenTube/blob/522f83cc012d5b1c75181b651e084a3afa280323/mods/resolveCommand.js

import { createLogger } from '../core/log.js';

const log = createLogger('ResolveCommand');

type ResolveCommandPayload = Record<string, unknown>;

interface ResolveCommand {
  (command: ResolveCommandPayload, extra?: unknown): unknown;
}

export interface ResolveCommandHook {
  (originalFn: ResolveCommand, payload: ResolveCommandPayload, extra: unknown): unknown;
}

let registry: ResolveCommandRegistry | null = null;
// The one poll for the hook target, shared by every getInstance() caller.
let pending: Promise<ResolveCommandRegistry> | null = null;

export class ResolveCommandRegistry {
  #originalFn: ResolveCommand;
  // A short list scanned with an index loop: this runs for every command the
  // app resolves, which is most key presses.
  #hooks: { key: string; fn: ResolveCommandHook }[] = [];

  /**
   * YouTube's resolveCommand, as replaced: the first hook whose key the command has handles it; any
   * other command goes to the original.
   */
  private resolveCommand = (command: Record<string, unknown>, extra?: unknown) => {
    const hooks = this.#hooks;
    for (let i = 0; i < hooks.length; i++) {
      if (hooks[i].key in command) {
        log.debug('Resolving through the hook for', hooks[i].key);
        return hooks[i].fn(this.#originalFn, command, extra);
      }
    }
    return this.#originalFn(command, extra);
  };

  /**
   * Replaces resolveCommand on the instance found under window._yttv[hookTargetName], keeping the
   * original bound.
   */
  private constructor(hookTargetName: string) {
    if (!ResolveCommandRegistry.checkHookTarget(hookTargetName)) {
      throw new Error(`Hook target "${hookTargetName}" not found in window._yttv`);
    }

    const hookTarget = window._yttv![hookTargetName] as {
      instance: { resolveCommand: ResolveCommand };
    };

    this.#originalFn = hookTarget.instance.resolveCommand.bind(hookTarget.instance);

    hookTarget.instance.resolveCommand = this.resolveCommand;

    log.debug('Hooked:', this.#originalFn);
  }

  /** Whether window._yttv[targetName] is the object that owns resolveCommand. */
  private static checkHookTarget(targetName: string) {
    const target = window._yttv?.[targetName];

    return !!(
      target &&
      typeof target === 'function' &&
      'instance' in target &&
      typeof target.instance === 'object' &&
      typeof (target.instance as Record<string, unknown>).resolveCommand === 'function'
    );
  }

  /**
   * The key under window._yttv that owns resolveCommand (it is minified and changes between YouTube
   * versions), or null.
   */
  private static findHookTarget() {
    if (typeof window._yttv !== 'object') return null;

    for (const key in window._yttv) {
      if (this.checkHookTarget(key)) {
        return key;
      }
    }

    return null;
  }

  private static readonly POLL_TIMEOUT_MS = 30_000;
  private static readonly POLL_MAX_DELAY_MS = 1_000;

  /**
   * That key, waiting for YouTube to create it: polled with a doubling delay until POLL_TIMEOUT_MS.
   */
  private static async getHookTarget(): Promise<string> {
    const immediate = this.findHookTarget();
    if (immediate) return immediate;

    return new Promise((resolve, reject) => {
      // On the monotonic clock: the TV may set its wall clock meanwhile.
      const deadline = performance.now() + this.POLL_TIMEOUT_MS;
      let delay = 16;

      /**
       * One look for the key; schedules the next with a doubled delay, or rejects past the
       * deadline.
       */
      const poll = () => {
        const hook = this.findHookTarget();
        if (hook) return resolve(hook);

        if (performance.now() >= deadline) {
          return reject(
            new Error(
              `No resolveCommand hook target in window._yttv after ${this.POLL_TIMEOUT_MS}ms`
            )
          );
        }

        delay = Math.min(delay * 2, this.POLL_MAX_DELAY_MS);
        setTimeout(poll, delay);
      };

      setTimeout(poll, delay);
    });
  }

  /**
   * The registry, once YouTube's resolveCommand exists; concurrent callers share one wait, and a
   * timed-out wait is retried by the next call.
   */
  static getInstance(): Promise<ResolveCommandRegistry> {
    if (registry) return Promise.resolve(registry);
    if (!pending) {
      pending = this.getHookTarget().then(
        (key) => {
          registry = new ResolveCommandRegistry(key);
          return registry;
        },
        (e) => {
          // The poll timed out: the next getInstance() polls again.
          pending = null;
          throw e;
        }
      );
    }
    return pending;
  }

  /** Adds the hook for `command`; each command is hooked once (lang-settings-fix.ts). */
  setHook(command: string, fn: ResolveCommandHook) {
    this.#hooks.push({ key: command, fn });
  }
}
