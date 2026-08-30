/**
 * force-codec.js behaviour tests.
 *
 * Loads the real module source into a sandbox with stubbed config /
 * notifications / MSE, so the assertions run against the shipped code rather
 * than a reimplementation of it.
 *
 * Run: node bench/force-codec-test.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'force-codec.js');

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

/**
 * Instantiate the module in a fresh sandbox.
 *
 * @param {string} setting     value of the forceVideoCodec config key
 * @param {(t:string)=>boolean} platform  what the device claims to support
 */
function load(setting, platform) {
  const source = fs
    .readFileSync(SRC, 'utf8')
    // Strip ESM syntax; the deps are injected as sandbox globals instead.
    .replace(/^import[^;]+;$/gm, '')
    .replace(/^export function/gm, 'function');

  const notifications = [];
  const warnings = [];
  const listeners = [];
  let current = setting;

  const MediaSource = { isTypeSupported: (t) => platform(t) };
  class HTMLMediaElement {}
  HTMLMediaElement.prototype.canPlayType = function (t) {
    return platform(t) ? 'probably' : '';
  };

  const sandbox = {
    console: { info: () => {}, warn: (m) => warnings.push(m), log: () => {} },
    // Its own JSON, not the host's: the module hooks JSON.parse in place, so a
    // shared object would leave every earlier test's hook in the chain.
    JSON: { parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) },
    MediaSource,
    HTMLMediaElement,
    configRead: (key) => (key === 'forceVideoCodec' ? current : undefined),
    configAddChangeListener: (key, cb) => listeners.push(cb),
    showNotification: (msg) => notifications.push(msg)
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'force-codec.js' });

  return {
    sandbox,
    notifications,
    warnings,
    isTypeSupported: (t) => sandbox.MediaSource.isTypeSupported(t),
    canPlayType: (t) => sandbox.HTMLMediaElement.prototype.canPlayType.call({}, t),
    parse: (obj) => sandbox.JSON.parse(pad(JSON.stringify(obj))),
    active: () => sandbox.forceCodecActive(),
    set: (v) => {
      current = v;
      listeners.forEach((cb) => {
        cb();
      });
    }
  };
}

/**
 * The parse hook ignores anything under 1000 chars as a cheap fast path, so
 * fixtures are padded past that threshold the way a real response would be.
 */
function pad(json) {
  const filler = 'x'.repeat(1200);
  const obj = JSON.parse(json);
  obj.__pad = filler;
  return JSON.stringify(obj);
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

/* ------------------------------------------------------------------ tests --- */

console.log('\nauto (default) is a true no-op');
{
  const m = load('auto', supportsEverything);
  eq('nothing is active', m.active(), null);
  eq('vp9 still supported', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('av1 still supported', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), true);
  const out = m.parse(response());
  eq('adaptiveFormats untouched', itags(out.streamingData.adaptiveFormats), '1,2,3,4,5');
  eq('formats untouched', itags(out.streamingData.formats), '18');
}

console.log('\nforcing av1 narrows video only');
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

console.log('\nforcing av1 filters the offer');
{
  const m = load('av1', supportsEverything);
  const out = m.parse(response());
  eq('only av1 video plus both audio survive', itags(out.streamingData.adaptiveFormats), '1,4,5');
  // formats is progressive AVC with no av1 equivalent, so it must survive whole
  // rather than being emptied.
  eq('progressive fallback kept', itags(out.streamingData.formats), '18');
}

console.log('\nno rendition in the wanted codec falls back instead of breaking');
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

console.log('\navoid-av1 keeps every other codec');
{
  const m = load('no_av1', supportsEverything);
  eq('av1 declined', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
  eq('vp9 kept', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('avc kept', m.isTypeSupported('video/mp4; codecs="avc1.640028"'), true);
  const out = m.parse(response());
  eq('only av1 dropped', itags(out.streamingData.adaptiveFormats), '2,3,4,5');
}

console.log('\nnarrowing never widens');
{
  // Device cannot do av1; user forces vp9. The av1 answer must stay false
  // because the platform said so, not become true because we allow vp9.
  const m = load('vp9', noAv1);
  eq('vp9 allowed', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  eq('unsupported av1 still false', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
}

console.log('\nan unsupported choice is refused, not obeyed');
{
  const m = load('hevc', noHevc);
  eq('falls back to auto', m.active(), null);
  check('warned on the console', m.warnings.length === 1, JSON.stringify(m.warnings));
  eq('vp9 not declined', m.isTypeSupported('video/webm; codecs="vp9"'), true);
  const out = m.parse(response());
  eq('offer untouched', itags(out.streamingData.adaptiveFormats), '1,2,3,4,5');
}

console.log('\ncodec spellings');
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

console.log('\nswitching at runtime');
{
  const m = load('auto', supportsEverything);
  eq('starts inactive', m.active(), null);
  m.set('vp9');
  eq('becomes active', m.active(), 'vp9');
  eq('av1 now declined', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), false);
  check('told the user to reload', /reload/i.test(m.notifications.join(' ')), m.notifications.join(' '));
  m.set('auto');
  eq('back to inactive', m.active(), null);
  eq('av1 allowed again', m.isTypeSupported('video/mp4; codecs="av01.0.08M.08"'), true);
}

console.log('\nnested playerResponse and malformed input');
{
  const m = load('av1', supportsEverything);
  const out = m.parse({ playerResponse: response() });
  eq('nested streamingData filtered', itags(out.playerResponse.streamingData.adaptiveFormats), '1,4,5');

  const junk = m.parse({ streamingData: { adaptiveFormats: 'not an array', formats: null } });
  check('malformed lists survive', junk.streamingData.adaptiveFormats === 'not an array');
  eq('small strings still parse', m.sandbox.JSON.parse('{"a":1}').a, 1);
  eq('non-object json still parses', m.sandbox.JSON.parse('42'), 42);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
