/**
 * The shortcut table against the options: every action a key can be bound to
 * (core/config-options.js shortcutActions, None aside) has an entry in
 * ui/shortcuts/actions.js, and the table has no entry the panel cannot bind.
 * A binding stored by another build becomes None (bindings.js), so with this
 * the router needs no case for an action it does not know.
 *
 * Run: node tests/unit/shortcut-actions-test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const eq = report.eq;

const options = loadSources([path.join(SRC, 'core', 'config-options.js')], {
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1)
}).get('shortcutActions');
// Every name actions.js imports, as a function that does nothing: the table
// holds some of them as its entries' run.
const ACTIONS_FILE = path.join(SRC, 'ui', 'shortcuts', 'actions.js');
const imported = {};
for (const m of fs.readFileSync(ACTIONS_FILE, 'utf8').matchAll(/^import \{([^}]+)\}/gm)) {
  for (const name of m[1].split(',')) imported[name.trim()] = () => {};
}
const actions = loadSources([ACTIONS_FILE], imported).get('ACTIONS');

const bindable = Object.keys(options)
  .filter((name) => name !== 'none')
  .sort();
eq(
  'every bindable action has an entry, and nothing else does',
  Object.keys(actions).sort().join(','),
  bindable.join(',')
);
eq(
  'every entry can run',
  Object.keys(actions)
    .filter((name) => typeof actions[name].run !== 'function')
    .join(','),
  ''
);

report.finish();
