/**
 * Playback speed as a unit in a vm sandbox, on a fake clock: YouTube's own
 * speed controls switched on (the Speed button in a response, the menu flag
 * that follows the setting, the setPlaybackRate wrapper that hands a pick to
 * the controller and ignores the reload's own call), the controller (steps
 * and their ends, the setting off or the TV unable, a burst of changes as one
 * reload at the position where it started, a burst back to its start as none,
 * the 1080p cap and its flag, the position put back once the reloaded video
 * plays, the setting turned off going back to 1x at once), and the engine's
 * building blocks the reload relies on (the time map, the MP4 timescale and
 * WebM TimecodeScale rewrites, the WSOLA stretch's output length).
 *
 * Run: node tests/unit/playback-speed-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { SRC, CORE } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const VENDOR = (f) => path.join(SRC, 'vendor', 'playback-speed', f);
const FEATURE = (f) => path.join(SRC, 'features', 'playback-speed', f);

/** A clock the sandbox's timers run on: advance(ms) fires what falls due, in order. */
function fakeClock() {
  let now = 1e12;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => {
    const id = ++seq;
    timers.set(id, { fn, at: now + ms, every });
    return id;
  };
  const clock = {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms || 0, 0),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    /** Moves the clock on by `ms`, running every timer that falls due. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, tm] of timers) {
          if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
        }
        if (!next) break;
        const [id, tm] = next;
        now = tm.at;
        if (tm.every) tm.at += tm.every;
        else timers.delete(id);
        tm.fn();
      }
      now = end;
    }
  };
  return clock;
}

/** The engine, the menu and the controller in one sandbox, with the setting and the clock given. */
function load(config) {
  const clock = fakeClock();
  const notes = [];
  const settings = Object.assign({ enablePlaybackSpeed: true, forceHighResVideo: false }, config);
  const { sandbox, get } = loadSources(
    [
      VENDOR('containers.js'),
      VENDOR('mse-hook.js'),
      VENDOR('wsola.js'),
      VENDOR('audio-engine.js'),
      CORE('speed-cap.js'),
      CORE('player-state.js'),
      FEATURE('native-menu.js'),
      FEATURE('controller.js')
    ],
    {
      configRead: (key) => settings[key],
      log: { info() {}, warn() {}, debug() {} },
      Date: { now: clock.now },
      setTimeout: clock.setTimeout,
      setInterval: clock.setInterval,
      clearTimeout: clock.clearTimeout,
      clearInterval: clock.clearInterval
    }
  );
  return { sandbox, get, clock, notes, settings };
}

/** A player element stub: its position, state and quality, with every call recorded. */
function fakePlayer() {
  const calls = [];
  const p = {
    calls,
    time: 42,
    state: 1,
    quality: 'hd2160',
    getCurrentTime: () => p.time,
    getPlayerState: () => p.state,
    getVideoData: () => ({ video_id: 'abcdefghijk' }),
    getPlaybackQuality: () => p.quality,
    loadVideoById: (id, at) => {
      calls.push(['load', id, at]);
      // webOS 25 starts the reloaded video early, and not playing yet.
      p.time = at - 20;
      p.state = 3;
    },
    seekTo: (at) => {
      calls.push(['seek', at]);
      p.time = at;
    },
    setPlaybackQualityRange: (a, b) => calls.push(['quality', a, b])
  };
  return p;
}

// ---- YouTube's own controls --------------------------------------------------------
{
  const { sandbox, get } = load();
  const button = (disabled) => ({
    type: 'TRANSPORT_CONTROLS_BUTTON_TYPE_SPEED_BUTTON',
    button: { buttonRenderer: { isDisabled: disabled } }
  });
  const top = {
    transportControls: { transportControlsRenderer: { right: [button(true), { type: 'OTHER' }] } }
  };
  eq('the Speed button at the top level is switched on', sandbox.enableSpeedButton(top), 1);
  const b = top.transportControls.transportControlsRenderer.right[0].button.buttonRenderer;
  t(
    'and given the command that opens the speed overlay',
    b.isDisabled === false &&
      b.command.openClientOverlayAction.type === 'CLIENT_OVERLAY_TYPE_VIDEO_PLAYBACK_SPEED'
  );
  const nested = {
    playerOverlays: {
      playerOverlayRenderer: {
        transportControls: { transportControlsRenderer: { left: [button(true)] } }
      }
    }
  };
  eq('the Speed button under playerOverlays too', sandbox.enableSpeedButton(nested), 1);
  eq('a response without one is left alone', sandbox.enableSpeedButton({ responseContext: {} }), 0);

  let on = true;
  const restore = sandbox.enableNativeSpeedMenu(() => on);
  const proto = get('Object.prototype');
  const cfg = Object.create(proto);
  t('setting on: YouTube reads enableSpeedOptions as true', cfg.enableSpeedOptions === true);
  on = false;
  t('setting off: it reads nothing, as without the hook', cfg.enableSpeedOptions === undefined);
  const own = Object.create(proto);
  own.enableSpeedOptions = false;
  on = true;
  t('an object that sets the flag keeps its own value', own.enableSpeedOptions === false);
  restore();
  t(
    'restored: the flag is gone from every object',
    Object.create(proto).enableSpeedOptions === undefined
  );
}

// ---- the setPlaybackRate wrapper ------------------------------------------------------
{
  const { sandbox, get, clock } = load();
  const picks = [];
  const fake = {
    speed: 1,
    reloadAt: 0,
    getSpeed: () => fake.speed,
    lastReloadAt: () => fake.reloadAt,
    setSpeed: (s, o) => picks.push([s, !!(o && o.immediate)])
  };
  const restore = sandbox.hookRateAssignments(fake);
  // YouTube builds its player API as a plain object (in the sandbox's realm).
  const api = get('({})');
  const original = [];
  api.setPlaybackRate = (r) => original.push(r);
  api.setPlaybackRate(1.5);
  t("YouTube's own setPlaybackRate still runs", original.length === 1 && original[0] === 1.5);
  t(
    'a pick from the menu reaches the controller, at once',
    JSON.stringify(picks) === JSON.stringify([[1.5, true]]),
    JSON.stringify(picks)
  );
  api.setPlaybackRate(3);
  eq('an unsupported rate is not passed on', picks.length, 1);
  fake.reloadAt = clock.now();
  api.setPlaybackRate(2);
  eq('a rate set right after a reload (the player restoring itself) is ignored', picks.length, 1);
  const Klass = get('(class K {})');
  const inst = new Klass();
  const fn = () => {};
  inst.setPlaybackRate = fn;
  t('a class instance keeps its function unwrapped', inst.setPlaybackRate === fn);
  restore();
}

// ---- the controller ------------------------------------------------------------------
{
  const { sandbox, get, clock, settings } = load();
  const player = fakePlayer();
  const notes = [];
  let supported = true;
  const ctrl = sandbox.createSpeedController({
    getPlayer: () => player,
    notify: (text) => notes.push(text),
    isOn: () => !!settings.enablePlaybackSpeed,
    isSupported: () => supported
  });
  const capped = () => get('isQualityCappedBySpeed()');

  eq('the speed starts at 1x', ctrl.getSpeed(), 1);
  ctrl.step(1);
  eq('one step up: 1.25x', ctrl.getSpeed(), 1.25);
  t('says so', notes[notes.length - 1] === 'Playback speed 1.25x', notes.join(' | '));
  ctrl.step(1);
  ctrl.step(1);
  eq('a burst of steps: 1.75x', ctrl.getSpeed(), 1.75);
  eq('no reload during the burst', player.calls.filter((c) => c[0] === 'load').length, 0);
  clock.advance(800);
  const loads = player.calls.filter((c) => c[0] === 'load');
  t(
    'the burst is one reload, at the position where it started',
    loads.length === 1 && loads[0][2] === 42,
    JSON.stringify(player.calls)
  );
  t(
    'above 1.25x the video is held at 1080p, and the flag Force Max Quality reads is up',
    player.calls.some((c) => c[0] === 'quality' && c[1] === 'hd1080') && capped() === true
  );
  // The reloaded video started 20 s early; once it plays it goes back.
  player.state = 1;
  clock.advance(250);
  t(
    'once the reloaded video plays it is sent back to the position (webOS 25 starts early)',
    player.calls.some((c) => c[0] === 'seek' && c[1] === 42),
    JSON.stringify(player.calls.slice(-3))
  );

  // A burst that comes back to where it started reloads nothing.
  player.calls.length = 0;
  ctrl.step(1);
  ctrl.step(-1);
  clock.advance(800);
  eq(
    'a burst back to its starting speed reloads nothing',
    player.calls.filter((c) => c[0] === 'load').length,
    0
  );

  // Down the steps to the bottom, and no further.
  for (let i = 0; i < 10; i++) ctrl.step(-1);
  eq('the steps stop at 0.25x', ctrl.getSpeed(), 0.25);
  t('under the cap the flag is down again', capped() === false);
  clock.advance(800);
  ctrl.reset();
  eq('reset: 1x', ctrl.getSpeed(), 1);
  clock.advance(800);

  // The setting off: the speed is 1x however it was set, and asking says why.
  ctrl.step(1);
  clock.advance(800);
  player.calls.length = 0;
  settings.enablePlaybackSpeed = false;
  eq('setting off: the speed in effect is 1x', ctrl.getSpeed(), 1);
  ctrl.stop();
  t(
    'turned off mid-video: back to 1x at once (a reload without the delay)',
    player.calls.some((c) => c[0] === 'load'),
    JSON.stringify(player.calls)
  );
  ctrl.step(1);
  t(
    'with the setting off a step says where to turn it on',
    /Turn on Playback Speed/.test(notes[notes.length - 1]),
    notes[notes.length - 1]
  );
  settings.enablePlaybackSpeed = true;
  supported = false;
  ctrl.step(1);
  t(
    'on a TV that cannot, a step says so',
    notes[notes.length - 1] === 'Playback speed is not supported on this TV',
    notes[notes.length - 1]
  );
}

// ---- the engine's building blocks -------------------------------------------------------
{
  const { get } = load();
  const map = new (get('SpeedTimeMap'))(1.5);
  t('the time map: element time 10 s is content time 15 s at 1.5x', map.toContent(10) === 15);
  t('and back', map.toElement(15) === 10);
  let threw = false;
  try {
    map.speed = 3;
  } catch {
    threw = true;
  }
  t('the time map refuses a speed it does not support', threw);

  // A minimal MP4 init: moov > trak > mdia > mdhd (version 0), timescale 48000.
  const box = (type, ...children) => {
    const body = Buffer.concat(children);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  const mdhdBody = Buffer.alloc(24);
  mdhdBody.writeUInt32BE(48000, 12);
  const init = new Uint8Array(box('moov', box('trak', box('mdia', box('mdhd', mdhdBody)))));
  const rewrite = get('rewriteInitTimescale')(init, 1.5);
  t(
    'MP4: the init timescale is scaled by the speed (48000 -> 72000)',
    rewrite.original === 48000 &&
      rewrite.scaled === 72000 &&
      get('findMdhdTimescale')(rewrite.data).timescale === 72000
  );
  t('MP4: the input is left as it was', get('findMdhdTimescale')(init).timescale === 48000);

  // A minimal WebM header: Segment > Info > TimecodeScale (4 bytes, 1,000,000).
  const el = (id, data) =>
    Buffer.concat([Buffer.from(id), Buffer.from([0x80 | data.length]), data]);
  const tc = Buffer.alloc(4);
  tc.writeUInt32BE(1000000, 0);
  const webm = new Uint8Array(
    el([0x18, 0x53, 0x80, 0x67], el([0x15, 0x49, 0xa9, 0x66], el([0x2a, 0xd7, 0xb1], tc)))
  );
  const w = get('rewriteTimecodeScale')(webm, 2);
  eq(
    'WebM: TimecodeScale divided by the speed (1,000,000 -> 500,000)',
    get('findTimecodeScale')(w.data).value,
    500000
  );

  // WSOLA: a second of a tone at 2x comes out as about half a second, the pitch kept by design.
  const Wsola = get('WsolaStretcher');
  const rate = 48000;
  const s = new Wsola({ sampleRate: rate, channels: 1 });
  s.setSpeed(2);
  const tone = new Float32Array(rate);
  for (let i = 0; i < rate; i++) tone[i] = Math.sin((2 * Math.PI * 440 * i) / rate);
  s.push([tone]);
  s.flush();
  let out = 0;
  for (let chunk = s.pull(4096); chunk && chunk[0] && chunk[0].length; chunk = s.pull(4096)) {
    out += chunk[0].length;
  }
  t(
    'WSOLA at 2x: one second in, about half a second out',
    out > rate * 0.4 && out < rate * 0.6,
    String(out)
  );
}

report.finish();
