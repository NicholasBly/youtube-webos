/**
 * thumbnail-quality/cache.js capSet as a unit: a Map capped at a limit, the
 * evicted key reported so the probe ledger can forget it too.
 *
 * Run: node tests/unit/thumbnail-capset-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;

const { sandbox } = loadSources([path.join(SRC, 'features', 'thumbnail-quality', 'cache.js')], {
  CACHE_KEY: 'k',
  CACHE_CAP_KEY: 'c',
  CACHE_LIMIT: 3,
  CACHE_SAVE_DEBOUNCE: 1,
  QUALITY_NAMES: [],
  state: {},
  qualityCache: new Map(),
  log: { debug() {}, info() {}, warn() {}, error() {} }
});
const map = new Map();
const first = [sandbox.capSet(map, 'a', 1, 3), sandbox.capSet(map, 'b', 2, 3)];
t('capSet below the limit evicts nothing', first.every((k) => k === null) && map.size === 2);
t(
  'rewriting a known key at the limit evicts nothing',
  sandbox.capSet(map, 'a', 9, 2) === null && map.size === 2
);
t(
  'a new key at the limit evicts the oldest and reports it',
  sandbox.capSet(map, 'c', 3, 2) === 'a' && !map.has('a') && map.get('c') === 3,
  [...map.keys()].join(',')
);

report.finish();
