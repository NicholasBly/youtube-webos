const originalStringify = JSON.stringify;
const hasOwn = Object.prototype.hasOwnProperty;
const MAX_DEPTH = 6;

function findCtx(root: any): any {
  const queue: any[] = [root, 0];
  let i = 0;
  while (i < queue.length) {
    const node = queue[i++];
    const depth = queue[i++];
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) continue;
    const pc = node.playbackContext;
    if (pc && typeof pc === 'object' && pc.contentPlaybackContext) {
      return pc.contentPlaybackContext;
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') queue.push(v, depth + 1);
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
      ctx = findCtx(value);
      if (ctx && ctx.isInlinePlaybackNoAd !== true) {
        had = hasOwn.call(ctx, 'isInlinePlaybackNoAd');
        prev = ctx.isInlinePlaybackNoAd;
        ctx.isInlinePlaybackNoAd = true;
		console.info(`[JSON.stringify] Set isInlinePlaybackNoAd`);
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