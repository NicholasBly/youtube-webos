/**
 * sponsorblock-labels.js behaviour tests.
 *
 * Loads the real module source into a sandbox with stubbed config and a minimal
 * DOM, so the assertions run against the shipped code.
 *
 * Run: node bench/sponsorblock-labels-test.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'sponsorblock-labels.js');

let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${extra ? ` -- ${extra}` : ''}`);
  }
}

function eq(name, actual, expected) {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

function near(name, actual, expected) {
  check(name, Math.abs(actual - expected) < 1e-6, `got ${actual}, want ${expected}`);
}

/** Minimal <style> stand-in; the module only ever touches one. */
class StyleEl {
  constructor() { this.textContent = ''; this.id = ''; this.parentNode = null; }
  get isConnected() { return this.parentNode !== null; }
}

function load(config) {
  const source = fs
    .readFileSync(SRC, 'utf8')
    .replace(/^import[^;]+;$/gm, '')
    // var, not const: only var creates a property on the sandbox global.
    .replace(/^export default new SponsorBlockLabels\(\);$/m, 'var __labels = new SponsorBlockLabels();')
    .replace(/^export /gm, '');

  const head = { children: [], appendChild(el) { el.parentNode = head; head.children.push(el); return el; } };

  const sandbox = {
    console: { info: () => {}, warn: () => {}, log: () => {} },
    parseInt,
    isNaN,
    Math,
    Number,
    String,
    Object,
    JSON,
    configRead: (k) => config[k],
    segmentTypes: {
      sponsor: { color: '#00d400' },
      selfpromo: { color: '#ffff00' },
      intro: { color: '#00ffff' }
    },
    document: { head, createElement: () => new StyleEl() }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sponsorblock-labels.js' });
  return { sandbox, head, labels: sandbox.__labels, css: () => (head.children[0] ? head.children[0].textContent : '') };
}

const allEnabled = {
  sbFullVideoLabel: true,
  sbShowTimeWithSkips: true,
  sbMode_sponsor: 'auto_skip',
  sbMode_selfpromo: 'auto_skip',
  sbMode_intro: 'auto_skip',
  sbMode_outro: 'auto_skip',
  sbMode_filler: 'seek_bar',
  sbMode_preview: 'seek_bar'
};

const seg = (category, start, end, actionType) => ({
  category,
  segment: [start, end],
  actionType: actionType || 'skip'
});

/* ------------------------------------------------------------------ tests --- */

console.log('\nskippable seconds: the basics');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  near('no segments', f([], 600), 0);
  near('one segment', f([seg('sponsor', 10, 40)], 600), 30);
  near('two disjoint', f([seg('sponsor', 10, 40), seg('intro', 100, 130)], 600), 60);
}

console.log('\noverlaps are counted once');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // Real shape: a sponsor read that is also tagged self-promo. Summing raw
  // durations would report 52s removed from a 26s stretch.
  near('overlapping pair', f([seg('sponsor', 323, 350), seg('selfpromo', 328, 350)], 772), 27);
  near('fully contained', f([seg('sponsor', 10, 100), seg('intro', 40, 50)], 600), 90);
  near('chained overlap', f([seg('sponsor', 0, 30), seg('intro', 20, 50), seg('outro', 45, 60)], 600), 60);
  near('touching edges', f([seg('sponsor', 0, 30), seg('intro', 30, 60)], 600), 60);
  near('unsorted input', f([seg('intro', 100, 130), seg('sponsor', 10, 40)], 600), 60);
}

console.log('\nwhat counts and what does not');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // The user asked for seek-bar-only segments to be included.
  near('seek_bar mode counts', f([seg('filler', 10, 40)], 600), 30);
  near('disabled category ignored', f([seg('sponsor', 10, 40)], 600, {}), 30);
  near('muted segment not removed', f([seg('sponsor', 10, 40, 'mute')], 600), 0);
  near('full label not removed', f([seg('sponsor', 0, 0, 'full')], 600), 0);
  near('highlight not removed', f([{ category: 'poi_highlight', segment: [30, 30], actionType: 'poi' }], 600), 0);
  near('chapter not removed', f([seg('chapter', 0, 100, 'chapter')], 600), 0);
  near('zero-length ignored', f([seg('sponsor', 10, 10)], 600), 0);
  near('reversed ignored', f([seg('sponsor', 40, 10)], 600), 0);
}

console.log('\ndisabled categories drop out');
{
  const cfg = Object.assign({}, allEnabled, { sbMode_sponsor: 'disable' });
  const { sandbox } = load(cfg);
  near('sponsor excluded', sandbox.skippableSeconds([seg('sponsor', 10, 40)], 600), 0);
  near('others still counted', sandbox.skippableSeconds([seg('sponsor', 10, 40), seg('intro', 100, 130)], 600), 30);
}

console.log('\nsegments are clamped to the real duration');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // A stale submission can name an end past the current duration.
  near('end past duration', f([seg('sponsor', 500, 900)], 600), 100);
  near('wholly past duration', f([seg('sponsor', 700, 900)], 600), 0);
  near('never exceeds duration', f([seg('sponsor', 0, 9999)], 600), 600);
}

console.log('\nfull-video label selection');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.pickFullLabel;
  eq('none present', f([seg('sponsor', 10, 40)]), null);
  eq('sponsor full', f([seg('sponsor', 0, 0, 'full')]), 'sponsor');
  eq('selfpromo full', f([seg('selfpromo', 0, 0, 'full')]), 'selfpromo');
  eq('exclusive access', f([seg('exclusive_access', 0, 0, 'full')]), 'exclusive_access');
  // Sponsor is the strongest claim, regardless of array order.
  eq('sponsor wins', f([seg('selfpromo', 0, 0, 'full'), seg('sponsor', 0, 0, 'full')]), 'sponsor');
  eq('skip segments ignored', f([seg('sponsor', 10, 40), seg('selfpromo', 0, 0, 'full')]), 'selfpromo');
  eq('empty', f([]), null);
}

console.log('\nbadge respects a disabled category');
{
  const cfg = Object.assign({}, allEnabled, { sbMode_sponsor: 'disable' });
  const { sandbox } = load(cfg);
  eq('sponsor badge suppressed', sandbox.pickFullLabel([seg('sponsor', 0, 0, 'full')]), null);
  // exclusive_access has no mode of its own, so it is unaffected.
  eq('exclusive access unaffected', sandbox.pickFullLabel([seg('exclusive_access', 0, 0, 'full')]), 'exclusive_access');
}

console.log('\ntext contrast follows the segment colour');
{
  const { sandbox } = load(allEnabled);
  const c = sandbox.contrastColor;
  eq('white on sponsor green', c('#00d400'), '#fff');
  // The one that matters: white on pure yellow is unreadable.
  eq('black on selfpromo yellow', c('#ffff00'), '#000');
  eq('white on dark blue', c('#0202ed'), '#fff');
  eq('black on white', c('#ffffff'), '#000');
  eq('garbage falls back to white', c('nonsense'), '#fff');
}

console.log('\ntime formatting');
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.formatTime;
  eq('under a minute', f(42), '0:42');
  eq('minutes', f(2569), '42:49');
  eq('pads seconds', f(65), '1:05');
  eq('hours', f(3725), '1:02:05');
  eq('zero', f(0), '0:00');
  eq('negative clamps', f(-5), '0:00');
}

console.log('\nend to end: the number under the seek bar');
{
  const { labels, css } = load(allEnabled);
  // 42:49 video, 27s of overlapping sponsor+selfpromo removed -> 42:22.
  labels.update([seg('sponsor', 323, 350), seg('selfpromo', 328, 350)], 2569);
  check('rule emitted', css().indexOf('content:"(42:22)"') !== -1, css());
  // On the duration span, not the time-label parent, which splits its children
  // to opposite ends of the seek bar.
  check('targets the duration span', css().indexOf('[idomkey="time-label"] [idomkey="duration"]::after') !== -1, css());

  // Nothing skippable: the bracket would just repeat the duration.
  labels.update([seg('sponsor', 10, 40, 'mute')], 2569);
  eq('rule withdrawn', css(), '');
}

console.log('\nno DOM lookup, so mount order cannot matter');
{
  const { sandbox, labels, css } = load(allEnabled);
  // The module must never reach for an element. If it did, it would race the
  // player chrome being built and the readout would show up late (or never).
  eq('no querySelector on document', typeof sandbox.document.querySelector, 'undefined');
  eq('no querySelectorAll on document', typeof sandbox.document.querySelectorAll, 'undefined');
  eq('no MutationObserver available', typeof sandbox.MutationObserver, 'undefined');
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 0, 600)], 2569);
  check('still produced both rules', css().indexOf('::before') !== -1 && css().indexOf('::after') !== -1, css());
}

console.log('\nend to end: the badge');
{
  const { labels, css } = load(allEnabled);
  labels.update([seg('sponsor', 0, 0, 'full')], 600);
  check('label text', css().indexOf('content:"Sponsor"') !== -1, css());
  check('sponsor colour', css().indexOf('background-color:#00d400') !== -1, css());
  check('readable text colour', css().indexOf('color:#fff') !== -1, css());
  check('scoped to watch metadata', css().indexOf('ytlr-watch-metadata [idomkey="title-text"]::before') !== -1, css());
  check('title tray fallback present', css().indexOf('ytlr-video-title-tray [idomkey="title-text"]::before') !== -1, css());

  labels.clear();
  eq('cleared on teardown', css(), '');
}

console.log('\nthe stylesheet is only rewritten when something changes');
{
  const { labels, head } = load(allEnabled);
  labels.update([seg('sponsor', 0, 600)], 2569);
  const style = head.children[0];
  let writes = 0;
  let value = style.textContent;
  Object.defineProperty(style, 'textContent', {
    get: () => value,
    set: (v) => { writes++; value = v; }
  });
  labels.update([seg('sponsor', 0, 600)], 2569);
  labels.update([seg('sponsor', 0, 600)], 2569);
  eq('identical state writes nothing', writes, 0);
  labels.update([seg('sponsor', 0, 900)], 2569);
  eq('changed state writes once', writes, 1);
  eq('only one stylesheet ever created', head.children.length, 1);
}

console.log('\nbadge colour follows the category');
{
  const { labels, css } = load(allEnabled);
  // selfpromo is pure yellow: the text has to flip to black to stay readable.
  labels.update([seg('selfpromo', 0, 0, 'full')], 600);
  check('selfpromo label', css().indexOf('content:"Self Promo"') !== -1, css());
  check('yellow background', css().indexOf('background-color:#ffff00') !== -1, css());
  check('black text', css().indexOf('color:#000') !== -1, css());
}

console.log('\nboth readouts at once');
{
  const { labels, css } = load(allEnabled);
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 0, 600)], 2569);
  check('badge rule', css().indexOf('content:"Sponsor"') !== -1, css());
  check('time rule', css().indexOf('content:"(32:49)"') !== -1, css());
}

console.log('\ngenerated CSS cannot be broken out of');
{
  const cfg = Object.assign({}, allEnabled, { sponsorColor: 'red;}body{display:none}' });
  const { sandbox } = load(cfg);
  eq('bad colour falls back', sandbox.categoryColor('sponsor'), '#00d400');
  eq('valid hex passes', sandbox.safeColor('#ABC', '#000'), '#ABC');
  eq('junk rejected', sandbox.safeColor('url(x)', '#000'), '#000');
  eq('quotes escaped', sandbox.cssString('a"b'), '"a\\"b"');
  eq('backslash escaped', sandbox.cssString('a\\b'), '"a\\\\b"');
  eq('newline neutralised', sandbox.cssString('a\nb'), '"a b"');
}

console.log('\nboth options off is a no-op');
{
  const cfg = Object.assign({}, allEnabled, { sbFullVideoLabel: false, sbShowTimeWithSkips: false });
  const { labels, head } = load(cfg);
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 10, 40)], 600);
  eq('no stylesheet created at all', head.children.length, 0);
}

console.log('\nturning an option on mid-video takes effect immediately');
{
  const cfg = Object.assign({}, allEnabled, { sbFullVideoLabel: false });
  const { labels, css } = load(cfg);
  const segments = [seg('sponsor', 0, 0, 'full')];

  labels.update(segments, 600);
  eq('nothing while off', css(), '');

  // The same segment list the handler already holds - which is only true
  // because the fetch always asks for full labels.
  cfg.sbFullVideoLabel = true;
  labels.update(segments, 600);
  check('badge appears on the same data', css().indexOf('content:"Sponsor"') !== -1, css());
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
