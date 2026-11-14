/**
 * Return YouTube Dislike's number formatting (panel-dom.js formatNumber) as a
 * unit: plain below a thousand, one decimal with k or m above, and the unit
 * picked after rounding, so the top of the thousands reads "1m", not "1000k".
 *
 * Run: node tests/unit/return-dislike-format-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const eq = report.eq;

const { sandbox } = loadSources(
  [path.join(SRC, 'features', 'return-dislike', 'panel-dom.js')],
  // What panel-dom.js imports; formatNumber uses none of it.
  { PANEL: {}, sendKey() {}, REMOTE_KEYS: {} }
);
const f = sandbox.formatNumber;

eq('0', f(0), '0');
eq('999', f(999), '999');
eq('1,000', f(1000), '1k');
eq('1,500', f(1500), '1.5k');
eq('4,321', f(4321), '4.3k');
eq('999,949', f(999949), '999.9k');
eq('999,950 rounds up to a million: 1m, not 1000k', f(999950), '1m');
eq('999,999', f(999999), '1m');
eq('1,000,000', f(1000000), '1m');
eq('1,250,000', f(1250000), '1.3m');

report.finish();
