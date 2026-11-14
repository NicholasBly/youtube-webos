/**
 * SponsorBlock labels.js as a unit. Loads the real module source into a sandbox with stubbed config and a minimal
 * DOM, so the assertions run against the shipped code.
 *
 * Run: node tests/unit/sponsorblock-labels-test.cjs
 */

'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC, CORE } = require('../harness/stubs.cjs');
const { seg } = require('../harness/sponsorblock-data.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const SB_DIR = path.join(SRC, 'features', 'sponsorblock');
// labels.js takes its category -> mode-key table from constants.js and the
// title and duration selectors from core/selectors.js.
const SOURCES = [
  CORE('selectors.js'),
  CORE('text.js'),
  path.join(SB_DIR, 'constants.js'),
  path.join(SB_DIR, 'labels.js')
];

const report = createReport();
const t = report.check;
const eq = report.eq;
const near = report.near;

/** Minimal <style> stand-in; the module only ever touches one. */
class StyleEl {
  constructor() {
    this.textContent = '';
    this.id = '';
    this.parentNode = null;
  }
  get isConnected() {
    return this.parentNode !== null;
  }
}

function load(config) {
  const head = {
    children: [],
    appendChild(el) {
      el.parentNode = head;
      head.children.push(el);
      return el;
    }
  };

  // No querySelector, querySelectorAll or MutationObserver in the sandbox: the
  // module must never reach for an element. If it did, it would race the
  // player chrome being built and the readout would show up late (or never).
  const { sandbox } = loadSources(SOURCES, {
    console: { info: () => {}, warn: () => {}, log: () => {} },
    encodeURIComponent,
    createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
    log: { debug() {}, info() {}, warn() {}, error() {} },
    parseInt,
    isNaN,
    Math,
    Number,
    String,
    Object,
    JSON,
    // Like the real one: an unknown key throws. Colour keys exist for the
    // segmentTypes below only, so exclusive_access has none.
    configRead: (k) => {
      if (!(k in config) && !/^(?:sponsor|selfpromo|intro)Color$/.test(k)) {
        throw new Error('tried to read unknown config key: ' + k);
      }
      return config[k];
    },
    configGetAll: () => config,
    segmentTypes: {
      sponsor: { color: '#00d400' },
      selfpromo: { color: '#ffff00' },
      intro: { color: '#00ffff' }
    },
    document: { head, createElement: () => new StyleEl() }
  });
  return {
    sandbox,
    head,
    labels: sandbox.__default,
    css: () => (head.children[0] ? head.children[0].textContent : '')
  };
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

// ---- skippable seconds: the basics ----
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  near('no segments', f([], 600), 0);
  near('one segment', f([seg('sponsor', 10, 40)], 600), 30);
  near('two disjoint', f([seg('sponsor', 10, 40), seg('intro', 100, 130)], 600), 60);
}

// ---- overlaps are counted once ----
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // Real shape: a sponsor read that is also tagged self-promo. Summing raw
  // durations would report 52s removed from a 26s stretch.
  near('overlapping pair', f([seg('sponsor', 323, 350), seg('selfpromo', 328, 350)], 772), 27);
  near('fully contained', f([seg('sponsor', 10, 100), seg('intro', 40, 50)], 600), 90);
  near(
    'chained overlap',
    f([seg('sponsor', 0, 30), seg('intro', 20, 50), seg('outro', 45, 60)], 600),
    60
  );
  near('touching edges', f([seg('sponsor', 0, 30), seg('intro', 30, 60)], 600), 60);
  near('unsorted input', f([seg('intro', 100, 130), seg('sponsor', 10, 40)], 600), 60);
}

// ---- what counts and what does not ----
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // The user asked for seek-bar-only segments to be included.
  near('seek_bar mode counts', f([seg('filler', 10, 40)], 600), 30);
  near('muted segment not removed', f([seg('sponsor', 10, 40, 'mute')], 600), 0);
  near('full label not removed', f([seg('sponsor', 0, 0, 'full')], 600), 0);
  near(
    'highlight not removed',
    f([{ category: 'poi_highlight', segment: [30, 30], actionType: 'poi' }], 600),
    0
  );
  near('chapter not removed', f([seg('chapter', 0, 100, 'chapter')], 600), 0);
  near('zero-length ignored', f([seg('sponsor', 10, 10)], 600), 0);
  near('reversed ignored', f([seg('sponsor', 40, 10)], 600), 0);
}

// ---- disabled categories drop out ----
{
  const cfg = Object.assign({}, allEnabled, { sbMode_sponsor: 'disable' });
  const { sandbox } = load(cfg);
  near('sponsor excluded', sandbox.skippableSeconds([seg('sponsor', 10, 40)], 600), 0);
  near(
    'others still counted',
    sandbox.skippableSeconds([seg('sponsor', 10, 40), seg('intro', 100, 130)], 600),
    30
  );
}

// ---- segments are clamped to the real duration ----
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.skippableSeconds;
  // A stale submission can name an end past the current duration.
  near('end past duration', f([seg('sponsor', 500, 900)], 600), 100);
  near('wholly past duration', f([seg('sponsor', 700, 900)], 600), 0);
  near('never exceeds duration', f([seg('sponsor', 0, 9999)], 600), 600);
}

// ---- full-video label selection ----
{
  const { sandbox } = load(allEnabled);
  const f = sandbox.pickFullLabel;
  eq('none present', f([seg('sponsor', 10, 40)]), null);
  eq('sponsor full', f([seg('sponsor', 0, 0, 'full')]), 'sponsor');
  eq('selfpromo full', f([seg('selfpromo', 0, 0, 'full')]), 'selfpromo');
  eq('exclusive access', f([seg('exclusive_access', 0, 0, 'full')]), 'exclusive_access');
  // Sponsor is the strongest claim, regardless of array order.
  eq('sponsor wins', f([seg('selfpromo', 0, 0, 'full'), seg('sponsor', 0, 0, 'full')]), 'sponsor');
  eq(
    'skip segments ignored',
    f([seg('sponsor', 10, 40), seg('selfpromo', 0, 0, 'full')]),
    'selfpromo'
  );
  eq('empty', f([]), null);
}

// ---- badge respects a disabled category ----
{
  const cfg = Object.assign({}, allEnabled, { sbMode_sponsor: 'disable' });
  const { sandbox } = load(cfg);
  eq('sponsor badge suppressed', sandbox.pickFullLabel([seg('sponsor', 0, 0, 'full')]), null);
  // exclusive_access has no mode of its own, so it is unaffected.
  eq(
    'exclusive access unaffected',
    sandbox.pickFullLabel([seg('exclusive_access', 0, 0, 'full')]),
    'exclusive_access'
  );
}

// ---- text contrast follows the segment colour ----
{
  const { sandbox } = load(allEnabled);
  const c = sandbox.contrastColor;
  eq('white on sponsor green', c('#00d400'), '#fff');
  // The one that matters: white on pure yellow is unreadable.
  eq('black on selfpromo yellow', c('#ffff00'), '#000');
  eq('white on dark blue', c('#0202ed'), '#fff');
  eq('black on white', c('#ffffff'), '#000');
  // Three digits, as categoryColor accepts them.
  eq('black on #ff0', c('#ff0'), '#000');
  eq('white on #00f', c('#00f'), '#fff');
  eq('garbage falls back to white', c('nonsense'), '#fff');
}

// ---- time formatting ----
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

// ---- end to end: the number under the seek bar ----
{
  const { labels, css } = load(allEnabled);
  // 42:49 video, 27s of overlapping sponsor+selfpromo removed -> 42:22.
  labels.update([seg('sponsor', 323, 350), seg('selfpromo', 328, 350)], 2569);
  t('rule emitted', css().indexOf('content:"(42:22)"') !== -1, css());
  // On the duration span, not the time-label parent, which splits its children
  // to opposite ends of the seek bar.
  t(
    'targets the duration span',
    css().indexOf('[idomkey="time-label"] [idomkey="duration"]::after') !== -1,
    css()
  );

  // Nothing skippable: the bracket would just repeat the duration.
  labels.update([seg('sponsor', 10, 40, 'mute')], 2569);
  eq('rule withdrawn', css(), '');
}

// ---- no DOM lookup, so mount order cannot matter ----
{
  // The sandbox has no querySelector and no MutationObserver (see load()).
  const { labels, css } = load(allEnabled);
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 0, 600)], 2569);
  t(
    'both rules are produced without reaching for an element',
    css().indexOf('::before') !== -1 && css().indexOf('::after') !== -1,
    css()
  );
}

// ---- end to end: the badge ----
{
  const { labels, css } = load(allEnabled);
  labels.update([seg('sponsor', 0, 0, 'full')], 600);
  t('label text', css().indexOf('content:"Sponsor"') !== -1, css());
  t('sponsor colour', css().indexOf('background-color:#00d400') !== -1, css());
  t('readable text colour', css().indexOf('color:#fff') !== -1, css());
  t(
    'scoped to watch metadata',
    css().indexOf('ytlr-watch-metadata [idomkey="title-text"]::before') !== -1,
    css()
  );
  t(
    'title tray fallback present',
    css().indexOf('ytlr-video-title-tray [idomkey="title-text"]::before') !== -1,
    css()
  );

  labels.clear();
  eq('cleared on teardown', css(), '');
}

// ---- the stylesheet is only rewritten when something changes ----
{
  const { labels, head } = load(allEnabled);
  labels.update([seg('sponsor', 0, 600)], 2569);
  const style = head.children[0];
  let writes = 0;
  let value = style.textContent;
  Object.defineProperty(style, 'textContent', {
    get: () => value,
    set: (v) => {
      writes++;
      value = v;
    }
  });
  labels.update([seg('sponsor', 0, 600)], 2569);
  labels.update([seg('sponsor', 0, 600)], 2569);
  eq('identical state writes nothing', writes, 0);
  labels.update([seg('sponsor', 0, 900)], 2569);
  eq('changed state writes once', writes, 1);
  eq('only one stylesheet ever created', head.children.length, 1);
}

// ---- badge colour follows the category ----
{
  const { labels, css } = load(allEnabled);
  // selfpromo is pure yellow: the text has to flip to black to stay readable.
  labels.update([seg('selfpromo', 0, 0, 'full')], 600);
  t('selfpromo label', css().indexOf('content:"Self Promo"') !== -1, css());
  t('yellow background', css().indexOf('background-color:#ffff00') !== -1, css());
  t('black text', css().indexOf('color:#000') !== -1, css());
}

// ---- both readouts at once ----
{
  const { labels, css } = load(allEnabled);
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 0, 600)], 2569);
  t('badge rule', css().indexOf('content:"Sponsor"') !== -1, css());
  t('time rule', css().indexOf('content:"(32:49)"') !== -1, css());
}

// ---- generated CSS cannot be broken out of ----
{
  const cfg = Object.assign({}, allEnabled, { sponsorColor: 'red;}body{display:none}' });
  const { sandbox } = load(cfg);
  eq('bad colour falls back to the category default', sandbox.categoryColor('sponsor'), '#00d400');
  eq(
    'a bad colour on another category falls back to its own default',
    load(Object.assign({}, allEnabled, { selfpromoColor: 'url(x)' })).sandbox.categoryColor(
      'selfpromo'
    ),
    '#ffff00'
  );
  eq(
    'valid hex passes',
    load(Object.assign({}, allEnabled, { introColor: '#ABC' })).sandbox.categoryColor('intro'),
    '#ABC'
  );
  eq(
    'unknown category takes the fallback',
    sandbox.categoryColor('exclusive_access', '#777'),
    '#777'
  );
  eq('quotes escaped', sandbox.cssString('a"b'), '"a\\"b"');
  eq('backslash escaped', sandbox.cssString('a\\b'), '"a\\\\b"');
  eq('newline neutralised', sandbox.cssString('a\nb'), '"a b"');
}

// ---- both options off is a no-op ----
{
  const cfg = Object.assign({}, allEnabled, {
    sbFullVideoLabel: false,
    sbShowTimeWithSkips: false
  });
  const { labels, head } = load(cfg);
  labels.update([seg('sponsor', 0, 0, 'full'), seg('sponsor', 10, 40)], 600);
  eq('no stylesheet created at all', head.children.length, 0);
}

// ---- turning an option on mid-video takes effect immediately ----
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
  t('badge appears on the same data', css().indexOf('content:"Sponsor"') !== -1, css());
}

// ---- exclusive access has no colour setting of its own ----
{
  const { labels, css } = load(allEnabled);
  // Reading `exclusive_accessColor` would throw: that key is not in the table.
  labels.update([seg('exclusive_access', 0, 0, 'full')], 600);
  t(
    'badge drawn from the built-in colour',
    css().indexOf('content:"Exclusive Access"') !== -1 && css().indexOf('#008a5c') !== -1,
    css()
  );
}

report.finish();
