/**
 * ui/hide-controls.js as a unit over a jsdom document, its timers in the
 * test's hands: the body class and the bare shadow's inline opacity go on for
 * the window and come off after it (any element with the shadow idomkey, not
 * only a div), the opacity a shadow had is given back, a
 * second call extends the window, and the function it returns (what the
 * webOS 25 kick keeps in its bag) lifts it early.
 *
 * Run: node tests/unit/hide-controls-test.cjs
 */
'use strict';

const path = require('path');
const { JSDOM } = require('jsdom');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;

const win = new JSDOM('<!doctype html><html><body></body></html>').window;
const d = win.document;
const bare = d.createElement('div');
bare.setAttribute('idomkey', 'shadow');
const dimmed = d.createElement('div');
dimmed.setAttribute('idomkey', 'shadow');
dimmed.style.setProperty('opacity', '0.4');
// A shadow YouTube draws as another element than a div is covered too (as 0.8.4 matched).
const other = d.createElement('ytlr-shadow');
other.setAttribute('idomkey', 'shadow');
d.body.appendChild(bare);
d.body.appendChild(dimmed);
d.body.appendChild(other);

// A clock and its timers that move only when the test says so.
let now = 0;
let nextId = 1;
const timers = [];
const advance = (ms) => {
  now += ms;
  timers.sort((a, b) => a.at - b.at);
  while (timers.length && timers[0].at <= now) timers.shift().fn();
};
const { sandbox } = loadSources([path.join(SRC, 'ui', 'hide-controls.js')], {
  document: d,
  setTimeout: (fn, ms) => {
    const id = nextId++;
    timers.push({ id, at: now + ms, fn });
    return id;
  },
  clearTimeout: (id) => {
    const i = timers.findIndex((x) => x.id === id);
    if (i !== -1) timers.splice(i, 1);
  }
});
const hidden = () => d.body.classList.contains('ytaf-hide-controls');

sandbox.hideControlsFor(750);
t('the body class goes on', hidden());
t(
  'the bare shadows are hidden inline, as important',
  bare.style.getPropertyValue('opacity') === '0' &&
    bare.style.getPropertyPriority('opacity') === 'important' &&
    dimmed.style.getPropertyValue('opacity') === '0'
);
t('a shadow that is not a div is hidden as well', other.style.getPropertyValue('opacity') === '0');
advance(500);
sandbox.hideControlsFor(750);
advance(400);
t('a second call extends the window past the first one', hidden());
advance(400);
t('and it ends 750 ms after the second call', !hidden());
t(
  'each shadow gets back the opacity it had',
  bare.style.getPropertyValue('opacity') === '' &&
    dimmed.style.getPropertyValue('opacity') === '0.4',
  bare.style.cssText + ' / ' + dimmed.style.cssText
);

const lift = sandbox.hideControlsFor(750);
lift();
t('the function it returns lifts the hiding at once', !hidden() && timers.length === 0);
lift();
t('and a second lift does nothing', !hidden());

report.finish();
