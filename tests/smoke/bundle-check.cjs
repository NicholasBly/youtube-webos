/**
 * The built bundle as a file: it parses at the syntax level its targets have,
 * and it stays within its size budget.
 *
 * The legacy flavour (webOS 3 to 6, Chromium 38) must be plain ES5, which is
 * what the Babel configuration promises and what nothing else verifies; the
 * modern flavour (Chrome 87) is parsed as ES2022 so a broken build is caught
 * before the smoke tests load it. The size is printed after every build and
 * fails the check above the budget, so growth is seen when it happens and not
 * on the TV.
 *
 * Run: node tests/smoke/bundle-check.cjs [bundle] [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { createReport } = require('../harness/report.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const bundlePath = process.argv[2] || path.join(ROOT, 'dist/webOSUserScripts/userScript.js');
const flavour = process.argv[3] || 'legacy';

// ecmaVersion: what the flavour's engine parses, as acorn is told to accept it.
// budget: the size in bytes the built file must stay under.
// iifeLimit: how many function expressions called on the spot may sit inside
// another function (see the check below).
const FLAVOURS = {
  legacy: { ecmaVersion: 5, budget: 240 * 1024, iifeLimit: 40 },
  modern: { ecmaVersion: 2022, budget: 175 * 1024, iifeLimit: 20 }
};

const report = createReport();
const spec = FLAVOURS[flavour];
if (!spec) {
  report.fail('known flavour', `unknown flavour ${flavour}`);
  report.finish();
}

const source = fs.readFileSync(bundlePath, 'utf8');
const bytes = Buffer.byteLength(source);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let parses = false;
let detail = '';
let ast = null;
try {
  ast = acorn.parse(source, { ecmaVersion: spec.ecmaVersion, sourceType: 'script' });
  parses = true;
} catch (e) {
  const near = e.pos == null ? '' : ` near "${source.slice(Math.max(0, e.pos - 60), e.pos + 60)}"`;
  detail = e.message + near;
}
report.check(`${flavour} bundle parses as ES${spec.ecmaVersion}`, parses, detail);

/**
 * Function expressions called on the spot inside another function: each is a
 * closure created on every call of the one around it. The minifier makes them
 * out of helpers with one caller unless told not to (reduce_funcs), and on
 * the filter and walk paths that meant one or more per item.
 */
function innerIifes(root) {
  let count = 0;
  const visit = (node, inFunction) => {
    if (node.type === 'CallExpression' && /^(?:Arrow)?FunctionExpression$/.test(node.callee.type)) {
      if (inFunction) count++;
    }
    const nested = inFunction || /Function/.test(node.type);
    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') visit(child, nested);
        }
      } else if (value && typeof value.type === 'string') {
        visit(value, nested);
      }
    }
  };
  // The webpack runtime wraps everything in one function: its body is the top level.
  visit(root, false);
  return count;
}
if (ast) {
  // The bundle's own wrapper and the module functions are functions too:
  // the count starts inside them, so the limit allows for the runtime's.
  const n = innerIifes(ast);
  report.check(
    `${flavour}: at most ${spec.iifeLimit} function expressions called on the spot inside functions`,
    n <= spec.iifeLimit,
    `${n} found`
  );
}

// ES2022 is what acorn needs for the modern bundle's private fields (Chrome
// 74), but three of its forms are newer than Chrome 87: the RegExp d flag
// (Chrome 90), `#x in obj` (91) and a class static block (94).
function beyondChrome87(root) {
  const found = [];
  const visit = (node) => {
    if (node.type === 'Literal' && node.regex && node.regex.flags.indexOf('d') !== -1) {
      found.push('a RegExp with the d flag');
    }
    if (node.type === 'StaticBlock') found.push('a class static block');
    if (node.type === 'BinaryExpression' && node.left.type === 'PrivateIdentifier') {
      found.push('#x in obj');
    }
    for (const key in node) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === 'string') visit(child);
        }
      } else if (value && typeof value.type === 'string') {
        visit(value);
      }
    }
  };
  visit(root);
  return found;
}
if (ast && flavour === 'modern') {
  const found = beyondChrome87(ast);
  report.check('modern: no syntax newer than Chrome 87', found.length === 0, found.join(', '));
}

// The stylesheets ride in the bundle as strings; the legacy one must not use
// what Chromium 38 lacks: custom properties, :focus-within, 4- and 8-digit hex
// colours, :is(), :where(), ::placeholder, a list inside :not(), and
// user-select, appearance or filter without the -webkit- form beside it. A
// flex gap is ignored there, so each one needs its no-flex-gap margins.
if (flavour === 'legacy') {
  const issues = [];
  const count = (re) => (source.match(re) || []).length;
  if (/var\(--/.test(source)) issues.push('var(--');
  if (/:focus-within/.test(source)) issues.push(':focus-within');
  if (/#[0-9a-f]{8}(?![0-9a-f])/i.test(source)) issues.push('#rrggbbaa');
  if (/#[0-9a-f]{4}\b/i.test(source)) issues.push('#rgba');
  if (/:is\(|:where\(/.test(source)) issues.push(':is() or :where()');
  if (/::placeholder/.test(source)) issues.push('::placeholder');
  if (/:not\([^)]*,/.test(source)) issues.push('a list inside :not()');
  if (count(/(^|[^-\w])gap:/g) > count(/no-flex-gap[^{]*\{[^}]*margin/g)) {
    issues.push('a flex gap without no-flex-gap margins');
  }
  for (const prop of ['user-select', 'appearance', 'filter']) {
    const plain = (source.match(new RegExp('(^|[^-\\w])' + prop + ':', 'g')) || []).length;
    const webkit = (source.match(new RegExp('-webkit-' + prop + ':', 'g')) || []).length;
    if (plain > webkit) issues.push(`${prop} without -webkit-`);
  }
  report.check('legacy CSS uses nothing Chromium 38 lacks', issues.length === 0, issues.join(', '));
  // core/styles.js joins every stylesheet into one <style>, where an @import
  // that is not first is ignored: anything the bundle needs from outside
  // goes in as a <link>.
  report.check('the bundled CSS carries no @import', !/@import/.test(source));
  // Chromium 38 has Symbol: Babel's typeof helper would only add a call to
  // every typeof on the hot paths. Babel's own class-key helpers keep a few.
  const helper = /function ([\w$]+)\([\w$]+\)\{return \1="function"==typeof Symbol/.exec(source);
  const helperCalls = helper
    ? (source.match(new RegExp('(^|[^\\w$])' + helper[1].replace(/\$/g, '\\$') + '\\(', 'g')) || [])
        .length
    : 0;
  report.check(
    "legacy: typeof is the engine's own, not Babel's helper (Chromium 38 knows 'symbol')",
    helperCalls <= 8,
    `${helperCalls} uses of the helper`
  );
}

// The modules each build aliases away (webpack.config.js), each by a string
// only that module puts in the bundle. A marker must be absent from the build
// that drops the module and present in the other one, so a marker that stops
// matching fails here instead of passing for nothing.
const ALIASED_AWAY = {
  // webOS 25 runs the webOS 22+ bundle: its fixes stay out of the legacy one.
  legacy: [
    ['the webOS 25 cast block', 'wake_cast_core'],
    ['the webOS 25 first-video kick', 'playback enforcer']
  ],
  // What Chrome 87 has built in, and the webOS 3 and 4 code.
  modern: [
    ['the fetch polyfill', 'Network request failed'],
    ['polyfills.js', 'DOMSettableTokenList'],
    ['the buffer limit', '__ytafTrimming'],
    ['the legacy emoji fix', 'Noto+Sans+Arabic'],
    ['its stylesheet', 'twemoji-hidden-text'],
    ['its rewrite in the adblock text pass', 'u2049']
  ]
};
const otherFlavour = flavour === 'legacy' ? 'modern' : 'legacy';
for (const [what, marker] of ALIASED_AWAY[flavour]) {
  report.check(`${flavour}: aliased away: ${what}`, source.indexOf(marker) === -1, marker);
}
for (const [what, marker] of ALIASED_AWAY[otherFlavour]) {
  report.check(
    `${flavour}: kept, as the ${otherFlavour} build drops it: ${what}`,
    source.indexOf(marker) !== -1,
    marker
  );
}

report.note(`${flavour} bundle: ${bytes} bytes (${kb(bytes)}), budget ${kb(spec.budget)}`);
report.check(
  `${flavour} bundle is within its ${kb(spec.budget)} budget`,
  bytes <= spec.budget,
  `${bytes} bytes is ${kb(bytes - spec.budget)} over`
);
report.finish();
