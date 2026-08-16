/**
 * Forces `isInlinePlaybackNoAd` on outgoing InnerTube player requests.
 *
 * JSON.stringify is a global hook, so YouTube calls it constantly - every
 * localStorage write, every request body, every internal log. The previous
 * implementation ran a breadth-first search over the entire object graph to
 * depth 6 on *every* call, which measured at 3.1x native stringify on a
 * payload containing no playbackContext at all.
 *
 * Two guards fix that:
 *   1. An O(1) direct hit for the shape YouTube actually sends, where
 *      playbackContext sits at the root of the request body.
 *   2. A cheap rejection for everything else: only InnerTube request bodies
 *      carry contentPlaybackContext, and those always carry a `context`
 *      object too. Anything without one is skipped before any walking.
 *
 * The bounded BFS is kept for the case where both are true but the shape has
 * moved, so an InnerTube schema change degrades to "slower" rather than
 * "silently stops working".
 */
const originalStringify = JSON.stringify;
const hasOwn = Object.prototype.hasOwnProperty;
const MAX_DEPTH = 6;
// Bounds the fallback walk. A request body is a few hundred nodes; anything
// far past that is not the object we are looking for.
const MAX_NODES = 2000;
const DEBUG = false;

function findCtx(root: any): any {
  const queue: any[] = [root, 0];
  let i = 0;
  let visited = 0;
  while (i < queue.length) {
    if (++visited > MAX_NODES) return null;
    const node = queue[i++];
    const depth = queue[i++];
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) continue;
    const pc = node.playbackContext;
    if (pc && typeof pc === 'object' && pc.contentPlaybackContext) {
      return pc.contentPlaybackContext;
    }
    const nextDepth = depth + 1;
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') queue.push(v, nextDepth);
    }
  }
  return null;
}

function stringify(value: any, replacer?: any, space?: any): string {
  let ctx = null;
  let had = false;
  let prev;
  try {
    if (value !== null && typeof value === 'object') {
      // (1) The shape YouTube actually sends - no traversal at all.
      const rootPc = (value as any).playbackContext;
      if (rootPc && typeof rootPc === 'object' && rootPc.contentPlaybackContext) {
        ctx = rootPc.contentPlaybackContext;
      } else if (
        (value as any).context &&
        typeof (value as any).context === 'object'
      ) {
        // (2) Looks like an InnerTube request, but not the expected shape.
        ctx = findCtx(value);
      }

      if (ctx && ctx.isInlinePlaybackNoAd !== true) {
        had = hasOwn.call(ctx, 'isInlinePlaybackNoAd');
        prev = ctx.isInlinePlaybackNoAd;
        ctx.isInlinePlaybackNoAd = true;
        if (DEBUG) console.info('[JSON.stringify] Set isInlinePlaybackNoAd');
      } else {
        ctx = null;
      }
    }
  } catch (e) {
    ctx = null; // our logic must never break YouTube's serialization
  }

  try {
    return originalStringify(value, replacer, space);
  } finally {
    if (ctx) {
      if (had) ctx.isInlinePlaybackNoAd = prev;
      else delete ctx.isInlinePlaybackNoAd;
    }
  }
}

JSON.stringify = stringify;
