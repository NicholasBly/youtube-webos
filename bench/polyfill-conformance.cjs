/**
 * Differential test: run each polyfill in src/polyfills.js side by side with
 * the platform-native built-in over a battery of inputs (including the nasty
 * ones: NaN, holes, negative indices, unicode, duplicate query keys) and
 * assert identical results.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { applyChrome38Downgrade } = require('./chrome38-env.cjs');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://www.youtube.com/tv',
  runScripts: 'outside-only'
});
const win = dom.window;
applyChrome38Downgrade(win);

// Compile polyfills.js down to ES5-ish and eval it inside the downgraded window.
const babel = require('@babel/core');
const src = fs.readFileSync(ROOT + '/src/polyfills.js', 'utf8');
const { code } = babel.transformSync(src, {
  configFile: false,
  babelrc: false,
  presets: [[require.resolve('@babel/preset-env'), { targets: { chrome: '38' }, modules: 'commonjs' }]]
});
win.eval('(function(module, exports){' + code + '})({exports:{}},{})');

let pass = 0, fail = 0;
const eq = (a, b) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};
function check(label, got, want) {
  if (eq(got, want)) { pass++; }
  else { fail++; console.log(`FAIL ${label}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); }
}
function diff(label, fn) {
  // fn(scope) -> value; run against polyfilled window and native Node globals
  let got, want;
  try { got = fn(win); } catch (e) { got = 'THREW:' + e.constructor.name; }
  try { want = fn(globalThis); } catch (e) { want = 'THREW:' + e.constructor.name; }
  check(label, got, want);
}

/* ---- Object.assign ---- */
diff('Object.assign basic', (g) => g.Object.assign({ a: 1 }, { b: 2 }, { a: 3 }));
diff('Object.assign null src', (g) => g.Object.assign({ a: 1 }, null, undefined, { b: 2 }));
diff('Object.assign null target', (g) => g.Object.assign(null, { a: 1 }));
diff('Object.assign string src', (g) => g.Object.assign({}, 'ab'));

/* ---- Object.entries / values ---- */
diff('Object.entries', (g) => g.Object.entries({ a: 1, b: 'x', c: null }));
diff('Object.values', (g) => g.Object.values({ a: 1, b: 'x' }));
diff('Object.entries on string', (g) => g.Object.entries('hi'));
diff('Object.values empty', (g) => g.Object.values({}));

/* ---- Array.from ---- */
diff('Array.from array', (g) => g.Array.from([1, 2, 3]));
diff('Array.from arraylike', (g) => g.Array.from({ length: 3, 0: 'a', 1: 'b', 2: 'c' }));
diff('Array.from mapFn', (g) => g.Array.from([1, 2, 3], (x, i) => x * 10 + i));
diff('Array.from string', (g) => g.Array.from('abc'));
diff('Array.from Set', (g) => g.Array.from(new g.Set([1, 2, 2, 3])));
diff('Array.from Map', (g) => g.Array.from(new g.Map([['a', 1], ['b', 2]])));
diff('Array.from empty arraylike', (g) => g.Array.from({ length: 0 }));
diff('Array.from null throws', (g) => g.Array.from(null));

/* ---- Array.prototype ---- */
const arrCases = [[1, 2, 3, 4], [], [NaN], [0, -0], ['a', 'b'], [1, , 3]];
arrCases.forEach((c, i) => {
  diff(`Array#find #${i}`, (g) => g.Array.prototype.find.call(c.slice(), (x) => x === 3));
  diff(`Array#findIndex #${i}`, (g) => g.Array.prototype.findIndex.call(c.slice(), (x) => x === 3));
  diff(`Array#includes 3 #${i}`, (g) => g.Array.prototype.includes.call(c.slice(), 3));
  diff(`Array#includes NaN #${i}`, (g) => g.Array.prototype.includes.call(c.slice(), NaN));
  diff(`Array#includes neg-idx #${i}`, (g) => g.Array.prototype.includes.call(c.slice(), 1, -2));
  diff(`Array#flat #${i}`, (g) => g.Array.prototype.flat.call(c.slice()));
});
diff('Array#flat nested', (g) => g.Array.prototype.flat.call([1, [2, [3, [4]]]]));
diff('Array#flat depth 2', (g) => g.Array.prototype.flat.call([1, [2, [3, [4]]]], 2));
diff('Array#flat Infinity', (g) => g.Array.prototype.flat.call([1, [2, [3, [4]]]], Infinity));
diff('Array#flat holes', (g) => g.Array.prototype.flat.call([1, , 2, [3, , 4]]));

/* ---- String.prototype ---- */
const strCases = ['hello world', '', 'ünïcödé', 'aaa', '😀x'];
strCases.forEach((s, i) => {
  diff(`String#startsWith #${i}`, (g) => g.String.prototype.startsWith.call(s, 'a'));
  diff(`String#startsWith pos #${i}`, (g) => g.String.prototype.startsWith.call(s, 'a', 1));
  diff(`String#endsWith #${i}`, (g) => g.String.prototype.endsWith.call(s, 'a'));
  diff(`String#endsWith len #${i}`, (g) => g.String.prototype.endsWith.call(s, 'a', 2));
  diff(`String#includes #${i}`, (g) => g.String.prototype.includes.call(s, 'o'));
  diff(`String#repeat 3 #${i}`, (g) => g.String.prototype.repeat.call(s, 3));
  diff(`String#repeat 0 #${i}`, (g) => g.String.prototype.repeat.call(s, 0));
  diff(`String#padStart #${i}`, (g) => g.String.prototype.padStart.call(s, 12, '-*'));
  diff(`String#padEnd #${i}`, (g) => g.String.prototype.padEnd.call(s, 12, '-*'));
});
diff('String#repeat negative throws', (g) => g.String.prototype.repeat.call('a', -1));
diff('String#includes RegExp throws', (g) => g.String.prototype.includes.call('a', /a/));
diff('String#padStart shorter than str', (g) => g.String.prototype.padStart.call('abcdef', 3, '-'));
diff('String#padStart empty fill', (g) => g.String.prototype.padStart.call('ab', 5, ''));

/* ---- URLSearchParams ---- */
const uspCases = [
  '', '?a=1&b=2', 'a=1&a=2&a=3', 'k', 'k=', '=v', 'a=1&&b=2',
  'q=hello+world', 'q=hello%20world', 'q=%C3%BC', 'x=a%2Bb', 'sp=a b&t=~!()\'',
  'v=dQw4w9WgXcQ&list=PL%2B123', 'hl=en-GB&f6=400'
];
uspCases.forEach((c, i) => {
  diff(`USP parse->toString #${i} (${c})`, (g) => new g.URLSearchParams(c).toString());
  diff(`USP get('a') #${i}`, (g) => new g.URLSearchParams(c).get('a'));
  diff(`USP getAll('a') #${i}`, (g) => new g.URLSearchParams(c).getAll('a'));
  diff(`USP has('a') #${i}`, (g) => new g.URLSearchParams(c).has('a'));
  diff(`USP forEach #${i}`, (g) => { const o = []; new g.URLSearchParams(c).forEach((v, k) => o.push([k, v])); return o; });
  diff(`USP set #${i}`, (g) => { const p = new g.URLSearchParams(c); p.set('a', 'Z'); return p.toString(); });
  diff(`USP append #${i}`, (g) => { const p = new g.URLSearchParams(c); p.append('n', 'v v'); return p.toString(); });
  diff(`USP delete #${i}`, (g) => { const p = new g.URLSearchParams(c); p.delete('a'); return p.toString(); });
  diff(`USP sort #${i}`, (g) => { const p = new g.URLSearchParams(c); p.sort(); return p.toString(); });
  diff(`USP spread entries #${i}`, (g) => Array.prototype.slice.call(g.Array.from(new g.URLSearchParams(c).entries())));
});
diff('USP from object', (g) => new g.URLSearchParams({ a: '1', b: 'x y' }).toString());
diff('USP from array', (g) => new g.URLSearchParams([['a', '1'], ['a', '2']]).toString());
diff('USP special chars roundtrip', (g) => new g.URLSearchParams('').toString() === '' ? (() => { const p = new g.URLSearchParams(); p.set('vq', 'a b+c&d=e?f#g~h!i'); return p.toString(); })() : 'x');

/* ---- URL#searchParams (the exact utils.js handleLaunch flow) ---- */
diff('URL searchParams set/get', (g) => {
  const u = new g.URL('https://www.youtube.com/tv#/');
  u.searchParams.set('env_forceFullAnimation', '1');
  u.searchParams.set('env_enableWebSpeech', '1');
  u.searchParams.set('env_enableVoice', '1');
  return u.toString();
});
diff('URL searchParams delete reflects in href', (g) => {
  const u = new g.URL('https://www.youtube.com/tv#/');
  u.searchParams.set('theme', 'k');
  u.searchParams.set('a', '1');
  u.searchParams.delete('a');
  return u.toString();
});
diff('URL searchParams append+get', (g) => {
  const u = new g.URL('https://www.youtube.com/tv?x=1#/');
  u.searchParams.append('launch', 'voice');
  u.searchParams.append('launch', 'search');
  return [u.searchParams.get('launch'), u.searchParams.getAll('launch'), u.toString()];
});
diff('URL searchParams from existing query', (g) => {
  const u = new g.URL('https://www.youtube.com/tv?v=abc&t=10');
  return [u.searchParams.get('v'), u.searchParams.get('t'), u.searchParams.get('missing')];
});
diff('URL concat pattern from utils.handleLaunch', (g) => {
  const u = new g.URL('https://www.youtube.com/tv#/');
  const extra = new g.URLSearchParams('v=dQw4w9WgXcQ&list=PL+1');
  extra.forEach((value, key) => u.searchParams.append(key, value));
  return u.toString();
});

/* ---- DOM collections must be iterable (Chrome 51) ---- */
// This is the gap that broke Settings-panel arrow navigation on webOS 3:
// `for (const el of container.children)` compiles to Babel's for-of helper,
// which throws "Invalid attempt to iterate non-iterable instance" when the
// collection has no Symbol.iterator. jsdom makes them all iterable natively,
// so chrome38-env.cjs strips it back off first.
{
  const d = win.document;
  const host = d.createElement('div');
  for (let i = 0; i < 3; i++) {
    const c = d.createElement('span');
    c.className = 'kid k' + i;
    c.textContent = 'child' + i;
    host.appendChild(c);
  }
  d.body.appendChild(host);

  const collect = (it) => { const out = []; for (const x of it) out.push(x.textContent || String(x)); return out; };

  check('HTMLCollection (.children) is iterable',
    collect(host.children), ['child0', 'child1', 'child2']);
  check('NodeList (querySelectorAll) is iterable',
    collect(d.querySelectorAll('.kid')), ['child0', 'child1', 'child2']);
  check('NodeList (.childNodes) is iterable',
    collect(host.childNodes), ['child0', 'child1', 'child2']);
  check('DOMTokenList (.classList) is iterable',
    collect(host.children[0].classList), ['kid', 'k0']);
  check('getElementsByTagName is iterable',
    collect(host.getElementsByTagName('span')), ['child0', 'child1', 'child2']);
  check('Array.from over an HTMLCollection',
    win.Array.from(host.children).length, 3);
  check('spread over a NodeList',
    (() => { let n = 0; for (const _ of d.querySelectorAll('.kid')) n++; return n; })(), 3);
  check('NodeList#forEach exists',
    typeof d.querySelectorAll('.kid').forEach, 'function');
  // HTMLCollection has never had forEach in any browser - do not invent one.
  check('HTMLCollection#forEach still absent',
    typeof host.children.forEach, 'undefined');
  d.body.removeChild(host);
}

/* ---- Promise#finally ---- */
(async () => {
  let order = [];
  await win.Promise.resolve(1).finally(() => order.push('f')).then((v) => order.push('v' + v));
  check('Promise#finally resolve order', order, ['f', 'v1']);
  order = [];
  await win.Promise.reject(new Error('e')).finally(() => order.push('f')).catch((e) => order.push('c' + e.message));
  check('Promise#finally reject order', order, ['f', 'ce']);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
