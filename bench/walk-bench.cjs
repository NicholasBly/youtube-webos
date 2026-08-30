/**
 * Microbenchmark: the trackingParams/emoji tree walk in adblock.js.
 *
 * Current implementation allocates an Object.keys() array at every node.
 * for-in over JSON.parse output visits exactly the same properties (all own,
 * all enumerable, and Object.prototype has nothing enumerable) with no
 * allocation. This measures the difference on a realistic browse response.
 */
const { makeBrowse, makePlayer } = require('./gen-payload.cjs');

function walkKeys(obj, doTracking, maxDepth, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return;
  if (doTracking && typeof obj.trackingParams === 'string') obj.trackingParams = '';
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i];
      if (v && typeof v === 'object') walkKeys(v, doTracking, maxDepth, depth + 1);
    }
  } else {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const v = obj[keys[i]];
      if (v && typeof v === 'object') walkKeys(v, doTracking, maxDepth, depth + 1);
    }
  }
}

function walkForIn(obj, doTracking, maxDepth, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > maxDepth) return;
  if (doTracking && typeof obj.trackingParams === 'string') obj.trackingParams = '';
  if (Array.isArray(obj)) {
    for (let i = 0, n = obj.length; i < n; i++) {
      const v = obj[i];
      if (v && typeof v === 'object') walkForIn(v, doTracking, maxDepth, depth + 1);
    }
  } else {
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') walkForIn(v, doTracking, maxDepth, depth + 1);
    }
  }
}

function bench(name, fn, iters) {
  fn(); fn(); fn();                                   // warm
  if (global.gc) global.gc();
  const m0 = process.memoryUsage().heapUsed;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const t1 = process.hrtime.bigint();
  const m1 = process.memoryUsage().heapUsed;
  return { name, ms: Number(t1 - t0) / 1e6 / iters, heapKB: (m1 - m0) / 1024 / iters };
}

const browseText = JSON.stringify(makeBrowse());
const playerText = JSON.stringify(makePlayer());
const ITERS = 200;

for (const [label, text] of [['browse 150KB', browseText], ['player 10KB', playerText]]) {
  const a = bench('Object.keys', () => walkKeys(JSON.parse(text), true, 15), ITERS);
  const b = bench('for-in     ', () => walkForIn(JSON.parse(text), true, 15), ITERS);
  // Subtract the JSON.parse cost so the walk is isolated.
  const base = bench('parse only ', () => JSON.parse(text), ITERS);
  const aw = a.ms - base.ms, bw = b.ms - base.ms;
  console.log(`\n${label}  (JSON.parse alone: ${base.ms.toFixed(3)} ms)`);
  console.log(`  walk Object.keys : ${aw.toFixed(3)} ms   heap ${a.heapKB.toFixed(1)} KB/iter`);
  console.log(`  walk for-in      : ${bw.toFixed(3)} ms   heap ${b.heapKB.toFixed(1)} KB/iter`);
  console.log(`  -> for-in is ${((1 - bw / aw) * 100).toFixed(1)}% faster on the walk itself`);
}

// Correctness: identical output.
const x = JSON.parse(browseText); walkKeys(x, true, 15);
const y = JSON.parse(browseText); walkForIn(y, true, 15);
console.log('\nidentical result:', JSON.stringify(x) === JSON.stringify(y));
