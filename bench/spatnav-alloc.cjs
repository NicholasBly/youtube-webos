/**
 * Isolated A/B for the spatial-navigation candidate walk and its per-call
 * lookup tables.
 *
 * jsdom's own style/selector machinery dwarfs the polyfill's JS, so timing the
 * bundle measures jsdom. Here the DOM is plain objects, the predicates are
 * constant-cost, and what is left is the thing being changed: how many arrays
 * the walk allocates and how many elements it copies.
 *
 * Usage: node bench/spatnav-alloc.cjs
 */

// --- counters shared by every variant ----------------------------------------
let arrays = 0, copies = 0;
function track(a) { arrays++; copies += a.length; return a; }

// --- fake DOM: shelf > row > tile, tiles focusable, wrappers not -------------
function buildTree(shelves, tilesPer) {
  const mk = (tag, focusable) => ({ tagName: tag, focusable, children: [], childElementCount: 0 });
  const push = (p, c) => { p.children.push(c); p.childElementCount = p.children.length; };
  const root = mk('DIV', true);
  for (let s = 0; s < shelves; s++) {
    const shelf = mk('YTLR-SHELF', false);
    const row = mk('YTLR-ITEM-SECTION', false);
    for (let t = 0; t < tilesPer; t++) push(row, mk('DIV', true));
    push(shelf, row);
    push(root, shelf);
  }
  return root;
}

const isFocusable = (e) => e.focusable;
const isContainer = (e) => !e.focusable && e.childElementCount > 0;
const isDelegableContainer = () => false;
const isVisible = () => true;

// --- variant A: concat, as shipped in spatial-navigation-polyfill.js ---------
function walkConcat(container, option = { mode: 'visible' }) {
  let candidates = track([]);
  if (container.childElementCount > 0) {
    const children = container.children;
    for (let ci = 0, clen = children.length; ci < clen; ci++) {
      const elem = children[ci];
      if (isDelegableContainer(elem)) {
        candidates.push(elem);
      } else if (isFocusable(elem)) {
        candidates.push(elem);
        if (!isContainer(elem) && elem.childElementCount) {
          copies += candidates.length;
          candidates = track(candidates.concat(walkConcat(elem, { mode: 'all' })));
        }
      } else if (elem.childElementCount) {
        copies += candidates.length;
        candidates = track(candidates.concat(walkConcat(elem, { mode: 'all' })));
      }
    }
  }
  return (option.mode === 'all') ? candidates : track(candidates.filter(isVisible));
}

// --- variant B: accumulator, as shipped in spatial-navigation.modern.js ------
function walkAcc(container, option = { mode: 'visible' }, acc) {
  if (!acc) acc = track([]);
  if (container.childElementCount > 0) {
    const children = container.children;
    for (let ci = 0, clen = children.length; ci < clen; ci++) {
      const elem = children[ci];
      if (isDelegableContainer(elem)) {
        acc.push(elem);
      } else if (isFocusable(elem)) {
        acc.push(elem);
        if (!isContainer(elem) && elem.childElementCount) walkAcc(elem, { mode: 'all' }, acc);
      } else if (elem.childElementCount) {
        walkAcc(elem, { mode: 'all' }, acc);
      }
    }
  }
  if (!acc._filtered && option.mode !== 'all') {
    const out = track([]);
    for (let i = 0; i < acc.length; i++) if (isVisible(acc[i])) out.push(acc[i]);
    out._filtered = true;
    return out;
  }
  return acc;
}

// --- variant C: array-literal membership vs a shared Set ---------------------
const TAGS = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTGROUP', 'OPTION', 'FIELDSET'];
const TAG_SET = new Set(TAGS);
const disabledByLiteral = (t) => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTGROUP', 'OPTION', 'FIELDSET'].includes(t);
const disabledBySet = (t) => TAG_SET.has(t);
const invisibleByLiteral = (v) => ['hidden', 'collapse'].includes(v);
const INVISIBLE = new Set(['hidden', 'collapse']);
const invisibleBySet = (v) => INVISIBLE.has(v);

// --- variant D: overlap exclusion, filter+includes vs a Set -----------------
function excludeByIncludes(outer, inner) {
  return outer.filter((c) => !inner.includes(c));
}
function excludeBySet(outer, inner) {
  const seen = new Set(inner);
  const out = [];
  for (let i = 0; i < outer.length; i++) if (!seen.has(outer[i])) out.push(outer[i]);
  return out;
}

function time(fn, reps) {
  for (let i = 0; i < Math.min(reps, 500); i++) fn(); // let the JIT settle first
  let best = Infinity;
  for (let round = 0; round < 3; round++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < reps; i++) fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / reps;
    if (ms < best) best = ms;
  }
  return best;
}

const SIZES = [[4, 8], [8, 8], [16, 8], [24, 16], [42, 32], [64, 32]];

console.log('\n1. candidate walk - arrays allocated and elements copied per navigate()\n');
console.log('  tiles   shape     concat: arrays  copies |  accum: arrays  copies |  copies saved');
const walkRows = [];
for (const [sh, tp] of SIZES) {
  const tree = buildTree(sh, tp);
  arrays = 0; copies = 0; const a = walkConcat(tree); const ca = arrays, cc = copies;
  arrays = 0; copies = 0; const b = walkAcc(tree); const aa = arrays, ac = copies;
  if (a.length !== b.length) throw new Error(`length mismatch ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error('order mismatch at ' + i);
  const n = sh * tp;
  const msA = time(() => walkConcat(tree), 200);
  const msB = time(() => walkAcc(tree), 200);
  walkRows.push({ n, ca, cc, aa, ac, msA, msB });
  console.log(
    `  ${String(n).padStart(5)}   ${String(sh + 'x' + tp).padEnd(7)}` +
    `  ${String(ca).padStart(13)}  ${String(cc).padStart(6)} |` +
    `  ${String(aa).padStart(12)}  ${String(ac).padStart(6)} |` +
    `  ${(cc / Math.max(ac, 1)).toFixed(1).padStart(6)}x`
  );
}
console.log('\n   same walk, wall time (identical output verified above)\n');
console.log('  tiles     concat ms   accum ms   speedup');
for (const r of walkRows) {
  console.log(`  ${String(r.n).padStart(5)}  ${r.msA.toFixed(4).padStart(12)} ${r.msB.toFixed(4).padStart(10)}   ${(r.msA / r.msB).toFixed(2)}x`);
}

console.log('\n2. tag membership - fresh array literal per call vs one shared Set\n');
const tags = ['DIV', 'BUTTON', 'SPAN', 'INPUT', 'YTLR-TILE', 'FIELDSET'];
for (const reps of [200000]) {
  let x = 0;
  const msL = time(() => { for (let i = 0; i < 20; i++) x += disabledByLiteral(tags[i % 6]) ? 1 : 0; }, reps / 20);
  const msS = time(() => { for (let i = 0; i < 20; i++) x += disabledBySet(tags[i % 6]) ? 1 : 0; }, reps / 20);
  console.log(`  isActuallyDisabled  literal ${msL.toFixed(5)} ms  set ${msS.toFixed(5)} ms  -> ${(msL / msS).toFixed(2)}x   (sink ${x})`);
  const vis = ['visible', 'hidden', 'collapse', 'visible'];
  let y = 0;
  const msLv = time(() => { for (let i = 0; i < 20; i++) y += invisibleByLiteral(vis[i % 4]) ? 1 : 0; }, reps / 20);
  const msSv = time(() => { for (let i = 0; i < 20; i++) y += invisibleBySet(vis[i % 4]) ? 1 : 0; }, reps / 20);
  console.log(`  isVisibleStyleProp  literal ${msLv.toFixed(5)} ms  set ${msSv.toFixed(5)} ms  -> ${(msLv / msSv).toFixed(2)}x   (sink ${y})`);
}

console.log('\n3. overlap exclusion - filter+includes O(n*m) vs Set O(n+m)\n');
console.log('  internal(m)  overlapped(n)   includes ms   set ms   speedup   winner');
for (const [nInner, nOuter] of [
  [32, 4], [128, 4], [1344, 4],
  [32, 16], [128, 32], [512, 64], [1344, 128],
  [1344, 512], [1344, 1344], [512, 2048]
]) {
  const inner = []; for (let i = 0; i < nInner; i++) inner.push({ i });
  const outer = []; for (let i = 0; i < nOuter; i++) outer.push(i % 2 ? inner[i % nInner] : { o: i });
  const r1 = excludeByIncludes(outer, inner), r2 = excludeBySet(outer, inner);
  if (r1.length !== r2.length) throw new Error('exclusion mismatch');
  const m1 = time(() => excludeByIncludes(outer, inner), 2000);
  const m2 = time(() => excludeBySet(outer, inner), 2000);
  const r = m1 / m2;
  console.log(
    `  ${String(nInner).padStart(11)}  ${String(nOuter).padStart(13)}   ${m1.toFixed(5).padStart(11)}` +
    `  ${m2.toFixed(5).padStart(7)}   ${r.toFixed(2).padStart(6)}x   ${r > 1 ? 'set' : 'includes'}`
  );
}

console.log('\n4. focusableAreas - filter().filter() vs one fused pass\n');
const twoPass = (all) => Array.prototype.filter.call(all, isFocusable).filter(isVisible);
const onePass = (all) => {
  const out = [];
  for (let i = 0, len = all.length; i < len; i++) {
    const e = all[i];
    if (isFocusable(e) && isVisible(e)) out.push(e);
  }
  return out;
};
console.log('  elements   two-pass ms   fused ms   speedup');
for (const n of [128, 512, 1344, 4096]) {
  const all = [];
  for (let i = 0; i < n; i++) all.push({ tagName: 'DIV', focusable: i % 3 !== 0, children: [], childElementCount: 0 });
  if (twoPass(all).length !== onePass(all).length) throw new Error('focusableAreas mismatch');
  const m1 = time(() => twoPass(all), 2000);
  const m2 = time(() => onePass(all), 2000);
  console.log(`  ${String(n).padStart(8)}   ${m1.toFixed(5).padStart(11)}  ${m2.toFixed(5).padStart(9)}   ${(m1 / m2).toFixed(2)}x`);
}
console.log();
