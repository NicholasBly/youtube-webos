/**
 * adblock/search.js as a unit: the bounded search the filters fall back on when
 * a schema path misses (every needle found once, falsy values included, the
 * depth bound) and atPathOrSearch around it.
 *
 * Run: node tests/unit/adblock-search-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC, CORE } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const SOURCE = path.join(SRC, 'features', 'adblock', 'search.js');
const getByPath = (obj, parts) => {
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
};
const { sandbox } = loadSources([CORE('bounded-search.js'), SOURCE], {
  getByPath,
  log: { debug() {} }
});
const { findObjects, atPathOrSearch } = sandbox;

// ---- findObjects ----
{
  const guide = { items: [1] };
  const found = findObjects(
    { a: { tabs: null }, b: { tabs: null }, c: { d: { guideRenderer: guide } } },
    ['tabs', 'guideRenderer']
  );
  t(
    'a needle whose value is null is counted once: the other needle is still found',
    found.guideRenderer === guide,
    JSON.stringify(Object.keys(found))
  );
  eq('the null value is the one found first', found.tabs, null);

  const both = findObjects({ x: { a: 1 }, y: { b: { a: 2 } } }, ['a', 'b']);
  t('each needle takes its first match, breadth first', both.a === 1 && both.b.a === 2);

  const deep = { l1: { l2: { l3: { wanted: true } } } };
  eq(
    'a match past the depth bound is not found',
    findObjects(deep, ['wanted'], 2).wanted,
    undefined
  );
  eq('within it, it is', findObjects(deep, ['wanted'], 3).wanted, true);
  t('no haystack: nothing', Object.keys(findObjects(null, ['a'])).length === 0);
}

// ---- atPathOrSearch ----
{
  const list = { contents: [] };
  const data = { a: { b: list }, elsewhere: { sectionListRenderer: list } };
  t(
    'the path when it holds',
    atPathOrSearch(data, ['a', 'b'], 'sectionListRenderer', 5, 'x') === list
  );
  t(
    'the search when the path misses',
    atPathOrSearch(data, ['a', 'missing'], 'sectionListRenderer', 5, 'x') === list
  );
  t(
    'through fromFound when the needle is not the object wanted',
    atPathOrSearch(
      { w: { sectionListRenderer: list } },
      ['n'],
      'sectionListRenderer',
      5,
      'x',
      (f) => f.contents
    ) === list.contents
  );
}

report.finish();
