/**
 * Differential test: run each polyfill in src/polyfills/ side by side with
 * the platform-native built-in over a battery of inputs (including the nasty
 * ones: NaN, holes, negative indices, unicode, duplicate query keys) and
 * assert identical results.
 *
 * Run: node tests/unit/polyfill-conformance-test.cjs
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { applyChrome38Downgrade } = require('../harness/chrome38-env.cjs');
const { stripEsm } = require('../harness/sandbox.cjs');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://www.youtube.com/tv',
  runScripts: 'outside-only'
});
const win = dom.window;
applyChrome38Downgrade(win);

// What the downgrade left, read before the polyfills go in, so the checks below
// can tell a polyfilled API from one the downgrade failed to remove.
const bare = {
  urlSearchParams: 'searchParams' in win.URL.prototype,
  urlSearchParamsCtor: typeof win.URLSearchParams
};

// Compile polyfills.js down to ES5-ish and eval it inside the downgraded window.
const babel = require('@babel/core');
// The groups polyfills.js imports, concatenated in that order with the ESM
// syntax stripped (define.js first: the others call def()).
const GROUPS = [
  'define.js',
  'dom.js',
  'object.js',
  'array.js',
  'string.js',
  'url-search-params.js'
];
const src = stripEsm(
  GROUPS.map((f) => fs.readFileSync(ROOT + '/src/polyfills/' + f, 'utf8')).join('\n')
);
const { code } = babel.transformSync(src, {
  configFile: false,
  babelrc: false,
  presets: [
    [require.resolve('@babel/preset-env'), { targets: { chrome: '38' }, modules: 'commonjs' }]
  ]
});
win.eval('(function(module, exports){' + code + '})({exports:{}},{})');

const { createReport } = require('../harness/report.cjs');
const report = createReport({ quiet: true });
const eq = (a, b) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};
function check(label, got, want) {
  if (eq(got, want)) report.pass(label);
  else report.fail(label, `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
}
function diff(label, fn) {
  // fn(scope) -> value; run against polyfilled window and native Node globals
  let got, want;
  try {
    got = fn(win);
  } catch (e) {
    got = 'THREW:' + e.constructor.name;
  }
  try {
    want = fn(globalThis);
  } catch (e) {
    want = 'THREW:' + e.constructor.name;
  }
  check(label, got, want);
}

// ---- Object.assign ----
diff('Object.assign basic', (g) => g.Object.assign({ a: 1 }, { b: 2 }, { a: 3 }));
diff('Object.assign null src', (g) => g.Object.assign({ a: 1 }, null, undefined, { b: 2 }));
diff('Object.assign null target', (g) => g.Object.assign(null, { a: 1 }));
diff('Object.assign string src', (g) => g.Object.assign({}, 'ab'));

// ---- Object.entries / values ----
diff('Object.entries', (g) => g.Object.entries({ a: 1, b: 'x', c: null }));
diff('Object.values', (g) => g.Object.values({ a: 1, b: 'x' }));
diff('Object.entries on string', (g) => g.Object.entries('hi'));
diff('Object.values empty', (g) => g.Object.values({}));

// ---- Array.from ----
diff('Array.from array', (g) => g.Array.from([1, 2, 3]));
diff('Array.from arraylike', (g) => g.Array.from({ length: 3, 0: 'a', 1: 'b', 2: 'c' }));
diff('Array.from mapFn', (g) => g.Array.from([1, 2, 3], (x, i) => x * 10 + i));
diff('Array.from string', (g) => g.Array.from('abc'));
diff('Array.from Set', (g) => g.Array.from(new g.Set([1, 2, 2, 3])));
diff('Array.from Map', (g) =>
  g.Array.from(
    new g.Map([
      ['a', 1],
      ['b', 2]
    ])
  )
);
diff('Array.from empty arraylike', (g) => g.Array.from({ length: 0 }));
diff('Array.from null throws', (g) => g.Array.from(null));

// ---- Array.prototype ----
// eslint-disable-next-line no-sparse-arrays -- holes are what this case exercises
const arrCases = [[1, 2, 3, 4], [], [NaN], [0, -0], ['a', 'b'], [1, , 3]];
arrCases.forEach((c, i) => {
  diff(`Array#find #${i}`, (g) => g.Array.prototype.find.call(c.slice(), (x) => x === 3));
  diff(`Array#findIndex #${i}`, (g) => g.Array.prototype.findIndex.call(c.slice(), (x) => x === 3));
});

// ---- String.prototype ----
const strCases = ['hello world', '', 'ünïcödé', 'aaa', '😀x'];
strCases.forEach((s, i) => {
  diff(`String#startsWith #${i}`, (g) => g.String.prototype.startsWith.call(s, 'a'));
  diff(`String#startsWith pos #${i}`, (g) => g.String.prototype.startsWith.call(s, 'a', 1));
});

// ---- URLSearchParams ----
const uspCases = [
  '',
  '?a=1&b=2',
  'a=1&a=2&a=3',
  'k',
  'k=',
  '=v',
  'a=1&&b=2',
  'q=hello+world',
  'q=hello%20world',
  'q=%C3%BC',
  'x=a%2Bb',
  "sp=a b&t=~!()'",
  'v=dQw4w9WgXcQ&list=PL%2B123',
  'hl=en-GB&f6=400'
];
uspCases.forEach((c, i) => {
  diff(`USP parse->toString #${i} (${c})`, (g) => new g.URLSearchParams(c).toString());
  diff(`USP get('a') #${i}`, (g) => new g.URLSearchParams(c).get('a'));
  diff(`USP forEach #${i}`, (g) => {
    const o = [];
    new g.URLSearchParams(c).forEach((v, k) => {
      o.push([k, v]);
    });
    return o;
  });
  diff(`USP set #${i}`, (g) => {
    const p = new g.URLSearchParams(c);
    p.set('a', 'Z');
    return p.toString();
  });
  diff(`USP append #${i}`, (g) => {
    const p = new g.URLSearchParams(c);
    p.append('n', 'v v');
    return p.toString();
  });
  diff(`USP delete #${i}`, (g) => {
    const p = new g.URLSearchParams(c);
    p.delete('a');
    return p.toString();
  });
});
uspCases.forEach((c, i) => {
  diff(`USP has #${i}`, (g) => {
    const p = new g.URLSearchParams(c);
    return [p.has('a'), p.has('k'), p.has('missing')];
  });
  diff(`USP getAll #${i}`, (g) => new g.URLSearchParams(c).getAll('a'));
  diff(`USP keys, values, entries #${i}`, (g) => {
    const p = new g.URLSearchParams(c);
    return [Array.from(p.keys()), Array.from(p.values()), Array.from(p.entries())];
  });
  diff(`USP iterates its entries #${i}`, (g) => {
    const o = [];
    for (const pair of new g.URLSearchParams(c)) o.push(pair);
    return o;
  });
  diff(`USP sort #${i}`, (g) => {
    const p = new g.URLSearchParams(c + '&b=0&A=1&a=0');
    p.sort();
    return p.toString();
  });
});
diff('USP sort keeps equal names in order, by UTF-16 units', (g) => {
  const p = new g.URLSearchParams('z=1&\u00e9=2&a=3&z=0&a=1&\uD83D\uDE00=4&\uFFFD=5');
  p.sort();
  return p.toString();
});
diff('USP from object', (g) => new g.URLSearchParams({ a: '1', b: 'x y' }).toString());
diff('USP from array', (g) =>
  new g.URLSearchParams([
    ['a', '1'],
    ['a', '2']
  ]).toString()
);
diff('USP special chars roundtrip', (g) => {
  const p = new g.URLSearchParams();
  p.set('vq', 'a b+c&d=e?f#g~h!i');
  return p.toString();
});

// ---- URL#searchParams (the core/launch.js flow) ----
// Chromium 38 has `new URL()` but no url.searchParams (Chrome 51). The downgrade
// deletes jsdom's accessor, so the diffs below compare the wiring that
// url-search-params.js installs against Node's native URL rather than jsdom's
// native accessor against Node's, which could not fail.
check('downgrade removed URL#searchParams before the polyfill', bare.urlSearchParams, false);
check(
  'downgrade removed URLSearchParams before the polyfill',
  bare.urlSearchParamsCtor,
  'undefined'
);
check('polyfill installed URLSearchParams', typeof win.URLSearchParams, 'function');
check('polyfill installed URL#searchParams', 'searchParams' in win.URL.prototype, true);
check(
  'url.searchParams is the polyfilled URLSearchParams',
  new win.URL('https://www.youtube.com/tv?v=abc').searchParams instanceof win.URLSearchParams,
  true
);
check(
  'url.searchParams is one object per URL',
  (() => {
    const u = new win.URL('https://www.youtube.com/tv?v=abc');
    return u.searchParams === u.searchParams;
  })(),
  true
);
diff('url.search written: url.searchParams follows it', (g) => {
  const u = new g.URL('https://a.example/path?a=1#h');
  const sp = u.searchParams;
  const first = sp.get('a');
  u.search = '?a=2&b=3';
  return [first, u.searchParams === sp, u.searchParams.get('a'), u.searchParams.get('b')];
});
diff('url.search written, then a param set: the new search is the base', (g) => {
  const u = new g.URL('https://a.example/path?a=1#h');
  u.searchParams.get('a');
  u.search = '?c=5';
  u.searchParams.set('d', '6');
  return u.href;
});
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
  return [u.searchParams.get('launch'), u.toString()];
});
diff('URL searchParams from existing query', (g) => {
  const u = new g.URL('https://www.youtube.com/tv?v=abc&t=10');
  return [u.searchParams.get('v'), u.searchParams.get('t'), u.searchParams.get('missing')];
});
diff('URL concat pattern from utils.handleLaunch', (g) => {
  const u = new g.URL('https://www.youtube.com/tv#/');
  const extra = new g.URLSearchParams('v=dQw4w9WgXcQ&list=PL+1');
  extra.forEach((value, key) => {
    u.searchParams.append(key, value);
  });
  return u.toString();
});
diff('URL searchParams set then read back through url.search', (g) => {
  const u = new g.URL('https://www.youtube.com/tv#/');
  u.searchParams.set('q', 'a b&c');
  return [u.search, u.href];
});
diff('URL searchParams delete last key empties url.search', (g) => {
  const u = new g.URL('https://www.youtube.com/tv?only=1#/');
  u.searchParams.delete('only');
  return [u.search, u.href];
});

// ---- url-search-params.js where less is missing ----
// The file alone, in a fresh window: webOS 5 and 6 have the constructor and
// url.searchParams both, Chrome 49 and 50 had the constructor only.
const uspCode = babel.transformSync(
  stripEsm(fs.readFileSync(ROOT + '/src/polyfills/url-search-params.js', 'utf8')),
  {
    configFile: false,
    babelrc: false,
    presets: [
      [require.resolve('@babel/preset-env'), { targets: { chrome: '38' }, modules: 'commonjs' }]
    ]
  }
).code;
const windowWithUSP = (keepAccessor) => {
  const w = new JSDOM('<!doctype html>', {
    url: 'https://www.youtube.com/tv',
    runScripts: 'outside-only'
  }).window;
  if (!keepAccessor) delete w.URL.prototype.searchParams;
  return w;
};
{
  const w = windowWithUSP(true);
  const ctor = w.URLSearchParams;
  const getter = Object.getOwnPropertyDescriptor(w.URL.prototype, 'searchParams').get;
  w.eval('(function(module, exports){' + uspCode + '})({exports:{}},{})');
  check('both native: URLSearchParams is left as it was', w.URLSearchParams === ctor, true);
  check(
    'both native: url.searchParams is left as it was',
    Object.getOwnPropertyDescriptor(w.URL.prototype, 'searchParams').get === getter,
    true
  );
}
{
  const w = windowWithUSP(false);
  const ctor = w.URLSearchParams;
  w.eval('(function(module, exports){' + uspCode + '})({exports:{}},{})');
  const u = new w.URL('https://www.youtube.com/tv?v=abc');
  check('constructor only: the native one is kept', w.URLSearchParams === ctor, true);
  check(
    'constructor only: url.searchParams is wired to it',
    [u.searchParams instanceof ctor, u.searchParams.get('v'), u.searchParams === u.searchParams],
    [true, 'abc', true]
  );
}

// ---- Removed by the downgrade, not polyfilled ----
// polyfills.js installs only what src/ calls on the legacy path; these are not
// on that list, so they must stay absent after the polyfills ran. A check here
// starts failing the day a polyfill for one of them is added, which is the
// moment to add its differential cases above.
const d0 = win.document;
const absent = [
  ['String.fromCodePoint', win.String.fromCodePoint],
  ['String#codePointAt', win.String.prototype.codePointAt],
  ['Array#fill', win.Array.prototype.fill],
  ['Array#values', win.Array.prototype.values],
  ['Element#prepend', win.Element.prototype.prepend],
  ['Element#before', win.Element.prototype.before],
  ['Element#after', win.Element.prototype.after],
  ['Element#replaceWith', win.Element.prototype.replaceWith],
  ['Element#scrollTo', win.Element.prototype.scrollTo],
  ['Node#getRootNode', win.Node.prototype.getRootNode],
  ['Event#composedPath', win.Event.prototype.composedPath],
  ['CSS.escape', win.CSS && win.CSS.escape],
  ['navigator.sendBeacon', win.navigator.sendBeacon],
  ['document.scrollingElement', d0.scrollingElement],
  ['KeyboardEvent#key', new win.KeyboardEvent('keydown', { key: 'Enter' }).key]
];
for (const [label, value] of absent) check(label + ' stays absent', typeof value, 'undefined');
check(
  'Array#[Symbol.iterator] survives the Array#values removal',
  typeof win.Array.prototype[win.Symbol.iterator],
  'function'
);
check(
  'KeyboardEvent#keyCode survives the KeyboardEvent#key removal',
  new win.KeyboardEvent('keydown', { keyCode: 13 }).keyCode,
  13
);

// ---- addEventListener takes a boolean capture only (options dictionary: Chrome 49) ----
// On Chromium 38 an options object is coerced to `capture = true`, and `once`
// and `passive` do nothing. The downgrade wraps EventTarget to match, so a
// listener in src/ that leans on either runs here the way it runs on the TV.
{
  const host = d0.createElement('div');
  const kid = d0.createElement('span');
  host.appendChild(kid);
  d0.body.appendChild(host);
  const fire = () => kid.dispatchEvent(new win.Event('ping', { bubbles: true, cancelable: true }));

  const phases = [];
  const onPing = (e) => phases.push(e.eventPhase);
  host.addEventListener('ping', onPing, { capture: false, once: true, passive: true });
  fire();
  fire();
  check('options object registers a capturing listener', phases, [
    win.Event.CAPTURING_PHASE,
    win.Event.CAPTURING_PHASE
  ]);
  check('once is ignored: the listener fired twice', phases.length, 2);
  host.removeEventListener('ping', onPing, { capture: false });
  fire();
  check('removeEventListener with an options object removes the capturing one', phases.length, 2);

  host.addEventListener('ping', onPing);
  fire();
  check(
    'no third argument still registers a bubbling listener',
    phases[2],
    win.Event.BUBBLING_PHASE
  );
  host.removeEventListener('ping', onPing);

  let prevented = null;
  const cancel = (e) => {
    e.preventDefault();
    prevented = e.defaultPrevented;
  };
  host.addEventListener('ping', cancel, { passive: true });
  fire();
  check('passive is ignored: preventDefault still cancels', prevented, true);
  host.removeEventListener('ping', cancel, true);
  d0.body.removeChild(host);
}

// ---- DOM collections must be iterable (Chrome 51) ----
// `for (const el of container.children)` compiles to Babel's for-of helper,
// which throws when the collection has no Symbol.iterator. jsdom makes them
// all iterable natively, so chrome38-env.cjs strips it back off first.
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

  const collect = (it) => {
    const out = [];
    for (const x of it) out.push(x.textContent || String(x));
    return out;
  };

  check('HTMLCollection (.children) is iterable', collect(host.children), [
    'child0',
    'child1',
    'child2'
  ]);
  check('NodeList (querySelectorAll) is iterable', collect(d.querySelectorAll('.kid')), [
    'child0',
    'child1',
    'child2'
  ]);
  check('NodeList (.childNodes) is iterable', collect(host.childNodes), [
    'child0',
    'child1',
    'child2'
  ]);
  check('DOMTokenList (.classList) is iterable', collect(host.children[0].classList), [
    'kid',
    'k0'
  ]);
  check('getElementsByTagName is iterable', collect(host.getElementsByTagName('span')), [
    'child0',
    'child1',
    'child2'
  ]);
  check('Array.from over an HTMLCollection', win.Array.from(host.children).length, 3);
  check(
    'spread over a NodeList',
    [...d.querySelectorAll('.kid')].map((kid) => kid.className),
    ['kid k0', 'kid k1', 'kid k2']
  );
  check('NodeList#forEach exists', typeof d.querySelectorAll('.kid').forEach, 'function');
  // HTMLCollection has never had forEach in any browser - do not invent one.
  check('HTMLCollection#forEach still absent', typeof host.children.forEach, 'undefined');
  d.body.removeChild(host);
}

report.finish();
