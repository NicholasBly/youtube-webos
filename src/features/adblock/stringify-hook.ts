/**
 * Forces `isInlinePlaybackNoAd` on outgoing InnerTube player requests while
 * Ad Blocking is on: the request side of adblock, beside the response side in
 * parse-hook.js, and switched by the same flags (flags.js).
 *
 * JSON.stringify is a global hook, so YouTube calls it constantly: every
 * localStorage write, every request body, every internal log. Two guards keep
 * the hook cheap:
 *   1. An O(1) direct hit for the shape YouTube actually sends, where
 *      playbackContext sits at the root of the request body.
 *   2. A cheap rejection for everything else: a player request carries a
 *      `videoId` and a `context` at the root. Anything without both is
 *      skipped before any walking.
 *
 * A bounded breadth-first search covers a player request whose
 * playbackContext has moved, so an InnerTube schema change degrades to
 * "slower" rather than "silently stops working".
 */
import { boundedSearch } from '../../core/bounded-search.js';
import { cfgFlags } from './flags.js';
import { log } from './log.js';

type Body = Record<string, any>;
type Replacer = ((this: any, key: string, value: any) => any) | (number | string)[] | null;

const hasOwn = Object.prototype.hasOwnProperty;
const MAX_DEPTH = 6;
// Bounds the fallback walk. A request body is a few hundred nodes; anything
// far past that is not the object we are looking for.
const MAX_NODES = 2000;

let originalStringify: typeof JSON.stringify;

/**
 * The contentPlaybackContext of a player request whose playbackContext is not at the root (bounded
 * breadth-first search), or null.
 */
function findCtx(root: Body): Body | null {
  let found: Body | null = null;
  boundedSearch(root, MAX_DEPTH, MAX_NODES, (node: Body) => {
    const pc = node.playbackContext;
    if (pc && typeof pc === 'object' && pc.contentPlaybackContext) {
      found = pc.contentPlaybackContext;
      return true;
    }
    return false;
  });
  return found;
}

/** The contentPlaybackContext of a player request still without the flag, or null. */
function unflaggedContext(body: Body): Body | null {
  let ctx: Body | null = null;
  // (1) The shape YouTube actually sends - no traversal at all.
  const rootPc = body.playbackContext;
  if (rootPc && typeof rootPc === 'object' && rootPc.contentPlaybackContext) {
    ctx = rootPc.contentPlaybackContext;
  } else if (typeof body.videoId === 'string' && body.context && typeof body.context === 'object') {
    // (2) A player request whose playbackContext has moved.
    ctx = findCtx(body);
  }
  return ctx && ctx.isInlinePlaybackNoAd !== true ? ctx : null;
}

/**
 * Sets the flag on a player request and returns how to put the body back, or
 * null when there is nothing to set. Never throws: our logic must not break
 * YouTube's serialisation (a frozen body, a getter that throws).
 */
function flagPlayerRequest(body: Body): (() => void) | null {
  try {
    const ctx = unflaggedContext(body);
    if (!ctx) return null;
    const had = hasOwn.call(ctx, 'isInlinePlaybackNoAd');
    const prev = ctx.isInlinePlaybackNoAd;
    ctx.isInlinePlaybackNoAd = true;
    log.debug('Set isInlinePlaybackNoAd');
    return () => {
      if (had) ctx.isInlinePlaybackNoAd = prev;
      else delete ctx.isInlinePlaybackNoAd;
    };
  } catch {
    return null;
  }
}

/**
 * Whether `value` has a key a player request has at its root. The `in`
 * operator calls no getter, so this needs no try: almost every stringify
 * (localStorage writes, logs, other request bodies) stops here.
 */
function mayBePlayerRequest(value: object): boolean {
  return 'playbackContext' in value || 'videoId' in value;
}

// The hook itself holds no try: the engine of webOS 3 (V8 3.28) does not
// optimise a function that contains one, and this runs on every stringify.
// The two that need one are only reached for a body shaped like a player
// request while Ad Blocking is on (flagPlayerRequest, which reads its
// properties and may meet a getter that throws) and for a flagged request
// (stringifyThenRestore).
function stringify(value: unknown, replacer?: Replacer, space?: string | number): string {
  const restore =
    cfgFlags.enableAdBlock &&
    value !== null &&
    typeof value === 'object' &&
    mayBePlayerRequest(value)
      ? flagPlayerRequest(value as Body)
      : null;
  // The overloads of JSON.stringify do not meet in one signature; the
  // replacer goes through as given.
  if (!restore) return originalStringify(value, replacer as any, space);
  return stringifyThenRestore(value, replacer, space, restore);
}

/**
 * Stringifies a flagged player request, then puts the request back as it was, even when the
 * stringify throws. Kept apart so the hook itself holds no try (webOS 3's engine does not optimise
 * a function with one).
 */
function stringifyThenRestore(
  value: unknown,
  replacer: Replacer | undefined,
  space: string | number | undefined,
  restore: () => void
): string {
  try {
    return originalStringify(value, replacer as any, space);
  } finally {
    restore();
  }
}

/** Installs the hook once, for the life of the page. */
export function installStringifyHook() {
  if (JSON.stringify === stringify) return;
  originalStringify = JSON.stringify;
  JSON.stringify = stringify;
}
