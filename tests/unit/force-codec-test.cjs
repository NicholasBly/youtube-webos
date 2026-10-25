/**
 * features/force-codec as a unit. Loads the real module source into a sandbox with stubbed config /
 * notifications / MSE, so the assertions run against the shipped code rather
 * than a reimplementation of it.
 *
 * Run: node tests/unit/force-codec-test.cjs
 */

'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const SRC_DIR = path.join(SRC, 'features', 'force-codec');
// The feature's files in dependency order; the shared state and helpers
// resolve as sandbox globals, the way the bundle resolves them.
const SOURCES = ['log.js', 'state.js', 'codecs.js', 'format-filter.js', 'hooks.js', 'index.js'].map(
  (name) => path.join(SRC_DIR, name)
);

const report = createReport();
const t = report.check;
const eq = report.eq;

/**
 * Instantiate the module in a fresh sandbox.
 *
 * @param {string} setting     value of the forceVideoCodec config key
 * @param {(t:string)=>boolean} platform  what the device claims to support
 */
function load(setting, platform) {
  const notifications = [];
  const warnings = [];
  const listeners = [];
  let current = setting;

  const MediaSource = { isTypeSupported: (t) => platform(t) };
  class HTMLMediaElement {}
  HTMLMediaElement.prototype.canPlayType = function (t) {
    return platform(t) ? 'probably' : '';
  };

  const { sandbox } = loadSources(SOURCES, {
    console: { info: () => {}, warn: (m) => warnings.push(m), log: () => {} },
    // core/log.js is stripped with the imports; warn goes where console.warn went.
    createLogger: () => ({ debug() {}, info() {}, warn: (m) => warnings.push(m), error() {} }),
    JSON,
    MediaSource,
    HTMLMediaElement,
    configRead: (key) => (key === 'forceVideoCodec' ? current : undefined),
    configAddChangeListener: (key, cb) => listeners.push(cb),
    showNotification: (msg) => notifications.push(msg)
  });
  // What userScript.js does once every module has loaded.
  sandbox.installCodecHooks();

  return {
    sandbox,
    notifications,
    warnings,
    isTypeSupported: (t) => sandbox.MediaSource.isTypeSupported(t),
    canPlayType: (t) => sandbox.HTMLMediaElement.prototype.canPlayType.call({}, t),
    // The offer filter as the shared JSON.parse hook calls it, on a fresh copy.
    parse: (obj) => {
      const out = JSON.parse(JSON.stringify(obj));
      sandbox.filterParsedResponse(out);
      return out;
    },
    active: () => sandbox.forceCodecActive(),
    set: (v) => {
      current = v;
      listeners.forEach((cb) => {
        cb();
      });
    }
  };
}

const supportsEverything = () => true;
const noAv1 = (t) => !/av0?1/i.test(t);
const noHevc = (t) => !/hev1|hvc1/i.test(t);

function videoFmt(mime, itag) {
  return { itag, mimeType: mime };
}

function response() {
  return {
    streamingData: {
      adaptiveFormats: [
        videoFmt('video/mp4; codecs="av01.0.08M.08"', 1),
        videoFmt('video/webm; codecs="vp9"', 2),
        videoFmt('video/mp4; codecs="avc1.640028"', 3),
        videoFmt('audio/mp4; codecs="mp4a.40.2"', 4),
        videoFmt('audio/webm; codecs="opus"', 5)
      ],
      formats: [videoFmt('video/mp4; codecs="avc1.42001E, mp4a.40.2"', 18)]
    }
  };
}

const itags = (list) => list.map((f) => f.itag).join(',');

// ---- auto (default) is a true no-op ----
{
  const m = load('auto', supportsEverything);
  eq('nothing is active', m.active(), null);
  eq('vp9 still supported', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('av1 still supported', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), true);
  const out = m.parse(response());
  eq('adaptiveFormats untouched', itags(out.streamingData.adaptiveFormats), '1,2,3,4,5');
  eq('formats untouched', itags(out.streamingData.formats), '18');
}

// ---- forcing av1 narrows video only ----
{
  const m = load('av1', supportsEverything);
  eq('reports active', m.active(), 'av1');
  eq('av1 allowed', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), true);
  eq('vp9 declined', m.isTypeSupported('video/webm; codecs="vp9"'), false);
  eq('avc declined', m.isTypeSupported('video/mp4; codecs="avc1.640028"'), false);
  eq('hevc declined', m.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.B0"'), false);
  // The one that silences playback if it goes wrong.
  eq('aac audio untouched', m.isTypeSupported('audio/mp4; codecs="mp4a.40.2"'), true);
  eq('opus audio untouched', m.isTypeSupported('audio/webm; codecs="opus"'), true);
  eq('canPlayType declines vp9', m.canPlayType('video/webm; codecs="vp9"'), '');
  eq('canPlayType allows av1', m.canPlayType('video/mp4; codecs="av01.0.08M.08"'), 'probably');
  eq('canPlayType allows audio', m.canPlayType('audio/mp4; codecs="mp4a.40.2"'), 'probably');
}

// ---- forcing av1 filters the offer ----
{
  const m = load('av1', supportsEverything);
  const out = m.parse(response());
  eq('only av1 video plus both audio survive', itags(out.streamingData.adaptiveFormats), '1,4,5');
  // formats is progressive AVC with no av1 equivalent, so it must survive whole
  // rather than being emptied.
  eq('progressive fallback kept', itags(out.streamingData.formats), '18');
}

// ---- no rendition in the wanted codec falls back instead of breaking ----
{
  const m = load('av1', supportsEverything);
  const r = response();
  r.streamingData.adaptiveFormats = r.streamingData.adaptiveFormats.filter((f) => f.itag !== 1);
  const out = m.parse(r);
  eq('list left intact', itags(out.streamingData.adaptiveFormats), '2,3,4,5');
  eq('narrowing suspended', m.active(), null);
  eq('vp9 answers truthfully again', m.isTypeSupported('video/webm; codecs="vp9"'), true);

  // ...and recovers on the next video that does have one.
  const out2 = m.parse(response());
  eq('re-armed on next video', itags(out2.streamingData.adaptiveFormats), '1,4,5');
  eq('narrowing back on', m.active(), 'av1');
}

// ---- avoid-av1 keeps every other codec ----
{
  const m = load('no_av1', supportsEverything);
  eq('av1 declined', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
  eq('vp9 kept', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('avc kept', m.isTypeSupported('video/mp4; codecs="avc1.640028"'), true);
  const out = m.parse(response());
  eq('only av1 dropped', itags(out.streamingData.adaptiveFormats), '2,3,4,5');
}

// ---- narrowing never widens ----
{
  // Device cannot do av1; user forces vp9. The av1 answer must stay false
  // because the platform said so, not become true because we allow vp9.
  const m = load('vp9', noAv1);
  eq('vp9 allowed', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('unsupported av1 still false', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
}

// ---- an unsupported choice is refused, not obeyed ----
{
  const m = load('hevc', noHevc);
  eq('falls back to auto', m.active(), null);
  t('warned on the console', m.warnings.length === 1, JSON.stringify(m.warnings));
  eq('vp9 not declined', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  const out = m.parse(response());
  eq('offer untouched', itags(out.streamingData.adaptiveFormats), '1,2,3,4,5');
}

// ---- a stored value this build does not know is Auto ----
{
  const m = load('h266', supportsEverything);
  eq('unknown value: nothing is active', m.active(), null);
  t('unknown value: warned on the console', m.warnings.length === 1, JSON.stringify(m.warnings));
  eq('unknown value: vp9 still supported', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq(
    'unknown value: av1 still supported',
    m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'),
    true
  );
  const out = m.parse(response());
  eq('unknown value: offer untouched', itags(out.streamingData.adaptiveFormats), '1,2,3,4,5');
}

// ---- codec spellings ----
{
  const m = load('vp9', supportsEverything);
  eq('vp09 recognised as vp9', m.isTypeSupported('video/mp4; codecs="vp09.00.10.08"'), true);
  eq('avc3 recognised as avc', m.isTypeSupported('video/mp4; codecs="avc3.640028"'), false);
  eq('hvc1 recognised as hevc', m.isTypeSupported('video/mp4; codecs="hvc1.1.6.L93.B0"'), false);
  eq('bare av1 recognised', m.isTypeSupported('video/mp4; codecs="av1"'), false);
  // Unknown video codecs are not our business and must pass through.
  eq('unknown video codec passes', m.isTypeSupported('video/webm; codecs="vp8"'), true);
  eq('bare container passes', m.isTypeSupported('video/mp4'), true);
}

// ---- switching at runtime ----
{
  const m = load('auto', supportsEverything);
  eq('starts inactive', m.active(), null);
  m.set('vp9');
  eq('becomes active', m.active(), 'vp9');
  eq('av1 now declined', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
  t(
    'told the user to reload',
    /reload/i.test(m.notifications.join(' ')),
    m.notifications.join(' ')
  );
  m.set('auto');
  eq('back to inactive', m.active(), null);
  eq('av1 allowed again', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), true);
}

// ---- nested playerResponse and malformed input ----
{
  const m = load('av1', supportsEverything);
  const out = m.parse({ playerResponse: response() });
  eq(
    'nested streamingData filtered',
    itags(out.playerResponse.streamingData.adaptiveFormats),
    '1,4,5'
  );

  const junk = m.parse({ streamingData: { adaptiveFormats: 'not an array', formats: null } });
  t('malformed lists survive', junk.streamingData.adaptiveFormats === 'not an array');
}

report.finish();
