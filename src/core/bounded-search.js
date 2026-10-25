// One bounded breadth-first walk, for the lookups that fall back on
// searching a parsed response or a request body when a known path misses
// (features/adblock/search.js, features/adblock/stringify-hook.ts).

/**
 * Visits every object under `root` (itself included) breadth first, down to
 * `maxDepth` levels below it and at most `maxNodes` of them, until
 * `visit(node)` returns true. A flat [node, depth, ...] queue keeps the
 * garbage down, and a child past the depth bound is never queued.
 */
export function boundedSearch(root, maxDepth, maxNodes, visit) {
  const queue = [root, 0];
  let i = 0;
  let visited = 0;
  while (i < queue.length) {
    if (++visited > maxNodes) return;
    const node = queue[i++];
    const depth = queue[i++];
    if (visit(node)) return;
    const nextDepth = depth + 1;
    if (nextDepth > maxDepth) continue;
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') queue.push(v, nextDepth);
    }
  }
}
