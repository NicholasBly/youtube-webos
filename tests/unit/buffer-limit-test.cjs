/**
 * hooks/buffer-limit as a unit: the module is loaded into a vm sandbox with a
 * fake MediaSource / SourceBuffer pair, a fake document holding the <video>
 * elements and a setInterval that hands the trim tick back to the test. The
 * checks cover what the trim removes (RETAIN_BEHIND_SECS behind the current
 * time, only once the span reaches MIN_TRIM_SECS), the guards (an update in
 * flight, a detached or empty buffer, a remove that throws), the append
 * deferral while a trim's remove is in flight, closed sources leaving the
 * tracking list, and the createObjectURL tag that ties a MediaSource to its
 * <video>.
 *
 * Run: node tests/unit/buffer-limit-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const SOURCE = path.join(SRC, 'hooks', 'buffer-limit.js');

/**
 * A fresh sandbox with installBufferLimit() already run.
 *
 * Options: `debug` exposes window.__ytafBufferStats, `noMediaSource` leaves the
 * MediaSource global undefined, `plainBuffers` makes addSourceBuffer answer with
 * a plain object (no prototype to patch), `removeThrows` makes every remove()
 * throw.
 */
function load(options) {
  const o = options || {};
  const intervals = [];
  const videos = [];
  const debugLines = [];
  let urls = 0;

  // The classes are created per sandbox because the module patches their
  // prototypes in place.
  class FakeSourceBuffer {
    constructor(mime) {
      this.mime = mime;
      this.updating = false;
      // The buffered ranges, as [start, end] pairs. A remove lands at updateend.
      this.ranges = [];
      this.pending = null;
      this.ops = [];
      this.listeners = [];
      this.detached = false;
    }
    get buffered() {
      if (this.detached) throw new Error('InvalidStateError: detached');
      const r = this.ranges;
      return { length: r.length, start: (i) => r[i][0], end: (i) => r[i][1] };
    }
    appendBuffer(data) {
      if (this.updating) throw new Error('InvalidStateError: append while updating');
      this.ops.push('append:' + data);
      this.updating = true;
    }
    remove(start, end) {
      if (this.updating) throw new Error('InvalidStateError: remove while updating');
      if (o.removeThrows) throw new Error('remove refused');
      this.ops.push('remove:' + start + '-' + end);
      this.pending = [start, end];
      this.updating = true;
    }
    addEventListener(type, fn) {
      this.listeners.push({ type, fn });
    }
    removeEventListener(type, fn) {
      const i = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i !== -1) this.listeners.splice(i, 1);
    }
    /** The running update finishes: a pending remove lands and updateend fires. */
    updateend() {
      if (this.pending) {
        const [s, e] = this.pending;
        const next = [];
        for (const [a, b] of this.ranges) {
          if (e <= a || s >= b) {
            next.push([a, b]);
            continue;
          }
          if (a < s) next.push([a, s]);
          if (b > e) next.push([e, b]);
        }
        this.ranges = next;
        this.pending = null;
      }
      this.updating = false;
      for (const l of this.listeners.slice()) {
        if (l.type === 'updateend') l.fn.call(this, { type: 'updateend' });
      }
    }
  }

  class FakeMediaSource {
    constructor() {
      this.readyState = 'open';
      this.sourceBuffers = [];
    }
    addSourceBuffer(mime) {
      const sb = o.plainBuffers
        ? { mime, updating: false, buffered: { length: 0 }, appendBuffer() {} }
        : new FakeSourceBuffer(mime);
      this.sourceBuffers.push(sb);
      return sb;
    }
  }

  const { sandbox, get } = loadSources([SOURCE], {
    Object,
    createLogger: () => ({
      debug: (...a) => debugLines.push(a.join(' ')),
      info() {},
      warn() {},
      error() {}
    }),
    isDebugEnabled: () => !!o.debug,
    MediaSource: o.noMediaSource ? undefined : FakeMediaSource,
    URL: { createObjectURL: () => 'blob:fake/' + ++urls },
    document: { getElementsByTagName: (tag) => (tag === 'video' ? videos : []) },
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    }
  });
  sandbox.installBufferLimit();

  return {
    sb: sandbox,
    get,
    videos,
    intervals,
    debugLines,
    MediaSource: FakeMediaSource,
    SourceBuffer: FakeSourceBuffer,
    // The periodic trim, run by hand instead of waiting on the interval.
    tick: () => intervals[0].fn(),
    // A <video> as currentTimeFor() reads it.
    video: (props) => {
      const v = Object.assign({ srcObject: null, currentSrc: '', currentTime: 0 }, props);
      videos.push(v);
      return v;
    }
  };
}

const RETAIN = (m) => m.get('RETAIN_BEHIND_SECS');
const MIN_TRIM = (m) => m.get('MIN_TRIM_SECS');
const TRIMMING = (m) => m.get('trimming');

/** A tracked MediaSource with one video SourceBuffer holding `ranges`. */
function playing(m, ranges) {
  const ms = new m.MediaSource();
  const sb = ms.addSourceBuffer('video/mp4');
  sb.ranges = ranges.map((r) => r.slice());
  return { ms, sb };
}

// ---- installation ---------------------------------------------------------
{
  const m = load();
  eq('one trim interval is registered', m.intervals.length, 1);
  eq('the interval runs every five seconds', m.intervals[0].ms, 5000);
  t('the retain window is longer than the minimum trim', RETAIN(m) > MIN_TRIM(m));

  const ms = new m.MediaSource();
  const video = ms.addSourceBuffer('video/mp4');
  const audio = ms.addSourceBuffer('audio/mp4');
  t(
    'addSourceBuffer still answers with the buffer',
    video instanceof m.SourceBuffer && audio.mime === 'audio/mp4'
  );
  const tracked = m.get('mediaSources');
  t(
    'the MediaSource is tracked once across two addSourceBuffer calls',
    tracked.length === 1 && tracked[0] === ms,
    String(tracked.length)
  );
  eq('the append patch is on', m.get('appendPatched'), true);
}
{
  const m = load({ noMediaSource: true });
  eq('without MediaSource nothing is installed', m.intervals.length, 0);
}
{
  const m = load({ plainBuffers: true });
  const ms = new m.MediaSource();
  ms.addSourceBuffer('video/mp4');
  eq(
    'a buffer with no prototype appendBuffer disables the deferral',
    m.get('appendPatched'),
    false
  );
  t(
    'and the MediaSource is still tracked',
    m.get('mediaSources').length === 1 && m.get('mediaSources')[0] === ms
  );
}

// ---- the trim -------------------------------------------------------------
{
  const m = load({ debug: true });
  const { ms, sb } = playing(m, [[20, 130]]);
  m.video({ srcObject: ms, currentTime: 100 });

  m.tick();
  eq(
    'the trim removes from the buffer start up to RETAIN_BEHIND_SECS behind now',
    sb.ops.join(','),
    'remove:20-' + (100 - RETAIN(m))
  );
  t('the buffer is flagged as trimming while the remove runs', sb[TRIMMING(m)] === true);
  t(
    'the trim is logged',
    m.debugLines.some((l) => /^trimmed 20\.0/.test(l)),
    m.debugLines.join(' | ')
  );

  m.tick();
  eq('a second tick during the remove does nothing', sb.ops.length, 1);

  sb.updateend();
  eq('the removal landed', JSON.stringify(sb.ranges), '[[70,130]]');
  const stats = m.sb.__ytafBufferStats();
  t(
    '__ytafBufferStats reports the window behind the playhead',
    stats.appendPatched === true &&
      stats.buffers.length === 1 &&
      stats.buffers[0].behind === RETAIN(m) &&
      stats.buffers[0].ahead === 30 &&
      stats.buffers[0].currentTime === 100,
    JSON.stringify(stats)
  );

  m.tick();
  eq('nothing further to trim at the same position', sb.ops.length, 1);

  m.videos[0].currentTime = 100 + MIN_TRIM(m) - 1;
  m.tick();
  eq('a span one second short of MIN_TRIM_SECS is left alone', sb.ops.length, 1);

  m.videos[0].currentTime = 100 + MIN_TRIM(m);
  m.tick();
  eq(
    'a span of exactly MIN_TRIM_SECS is trimmed',
    sb.ops[1],
    'remove:70-' + (100 + MIN_TRIM(m) - RETAIN(m))
  );
}
{
  const m = load();
  const ms = new m.MediaSource();
  const video = ms.addSourceBuffer('video/mp4');
  const audio = ms.addSourceBuffer('audio/mp4');
  video.ranges = [[0, 200]];
  audio.ranges = [[10, 200]];
  m.video({ srcObject: ms, currentTime: 150 });
  m.tick();
  t(
    'every SourceBuffer of the source is trimmed in one tick',
    video.ops.join(',') === 'remove:0-120' && audio.ops.join(',') === 'remove:10-120',
    video.ops.join(',') + ' / ' + audio.ops.join(',')
  );
}
{
  const m = load();
  const { ms, sb } = playing(m, [[0, 200]]);
  m.video({ srcObject: ms, currentTime: 150 });

  sb.updating = true;
  m.tick();
  eq('a buffer with an update in flight is not trimmed', sb.ops.length, 0);
  t('and is not flagged as trimming', !sb[TRIMMING(m)]);
  sb.updating = false;

  sb.detached = true;
  let threw = false;
  try {
    m.tick();
  } catch {
    threw = true;
  }
  t('a buffer whose buffered getter throws is skipped quietly', !threw && sb.ops.length === 0);
  sb.detached = false;

  sb.ranges = [];
  m.tick();
  eq('an empty buffer is skipped', sb.ops.length, 0);

  sb.ranges = [[0, 200]];
  m.tick();
  eq('the same buffer is trimmed once the guards clear', sb.ops.join(','), 'remove:0-120');
}
{
  const m = load({ removeThrows: true });
  const { ms, sb } = playing(m, [[0, 200]]);
  m.video({ srcObject: ms, currentTime: 150 });
  let threw = false;
  try {
    m.tick();
  } catch {
    threw = true;
  }
  t('a remove that throws does not escape the tick', !threw);
  eq('and clears the trimming flag', sb[TRIMMING(m)], false);
}

// ---- the append deferral --------------------------------------------------
{
  const m = load();
  const { ms, sb } = playing(m, [[20, 130]]);
  m.video({ srcObject: ms, currentTime: 100 });
  const proto = Object.getPrototypeOf(sb);
  const patched = proto.appendBuffer;
  m.tick();
  eq('the trim remove is in flight', sb.ops.join(','), 'remove:20-70');

  const ret = sb.appendBuffer('seg1');
  t(
    'an append during the trim is held back instead of thrown',
    ret === undefined && sb.ops.length === 1,
    sb.ops.join(',')
  );
  eq(
    'the held append waits on updateend',
    sb.listeners.filter((l) => l.type === 'updateend').length,
    1
  );

  sb.updateend();
  eq('the append lands after the remove, in order', sb.ops.join(','), 'remove:20-70,append:seg1');
  eq('the trimming flag is cleared by the deferred append', sb[TRIMMING(m)], false);
  eq('the one-shot listener is removed', sb.listeners.length, 0);
  t('the deferred append is itself in flight now', sb.updating === true);

  sb.updateend();
  eq('the next updateend does not replay the append', sb.ops.length, 2);

  // The player's own append in flight (no trim): the next append is handed to
  // the original, which throws as the browser would.
  sb.appendBuffer('seg2');
  report.throws(
    'an append while the player updates is not deferred',
    () => sb.appendBuffer('seg3'),
    /append while updating/
  );
  sb.updateend();

  sb[TRIMMING(m)] = true;
  sb.appendBuffer('seg4');
  t(
    'a direct append clears a stale trimming flag',
    sb[TRIMMING(m)] === false && sb.ops[sb.ops.length - 1] === 'append:seg4'
  );

  const ms2 = new m.MediaSource();
  ms2.addSourceBuffer('audio/mp4');
  t('the prototype is patched once, not per buffer', proto.appendBuffer === patched);
}

// ---- lifecycle ------------------------------------------------------------
{
  const m = load();
  const a = playing(m, [[0, 200]]);
  const b = playing(m, [[0, 200]]);
  m.video({ srcObject: a.ms, currentTime: 150 });
  m.video({ srcObject: b.ms, currentTime: 150 });
  eq('two sources are tracked', m.get('mediaSources').length, 2);

  a.ms.readyState = 'closed';
  m.tick();
  const tracked = m.get('mediaSources');
  t(
    'a closed source leaves the tracking list',
    tracked.length === 1 && tracked[0] === b.ms,
    String(tracked.length)
  );
  eq('and is not trimmed', a.sb.ops.length, 0);
  eq('the open one still is', b.sb.ops.join(','), 'remove:0-120');

  b.sb.updateend();
  b.ms.readyState = 'ended';
  m.videos[1].currentTime = 190;
  m.tick();
  t(
    'an ended source stays tracked but is not trimmed',
    m.get('mediaSources').length === 1 && b.sb.ops.length === 1
  );
}

// ---- the createObjectURL tie -----------------------------------------------
{
  const m = load();
  const { ms, sb } = playing(m, [[20, 500]]);
  const url = m.sb.URL.createObjectURL(ms);
  eq('createObjectURL still answers with the original url', url, 'blob:fake/1');
  eq('a MediaSource is tagged with its url', ms.__ytafObjectUrl, url);
  const blob = {};
  m.sb.URL.createObjectURL(blob);
  t('other objects are not tagged', !('__ytafObjectUrl' in blob));

  // Two videos, so the single-video fallback cannot apply: the one whose
  // currentSrc is the tagged url drives the trim, not the one further along.
  m.video({ currentSrc: 'blob:other', currentTime: 400 });
  m.video({ currentSrc: url, currentTime: 100 });
  m.tick();
  eq('the video playing the tagged url drives the trim', sb.ops.join(','), 'remove:20-70');
}
{
  const m = load();
  const { ms, sb } = playing(m, [[20, 500]]);
  m.video({ currentSrc: 'blob:unknown', currentTime: 400 });
  m.video({ currentSrc: 'blob:another', currentTime: 100 });
  m.tick();
  eq('with two videos and no tie the source is left alone', sb.ops.length, 0);

  m.videos.length = 0;
  m.video({ currentSrc: 'blob:unknown', currentTime: 400 });
  m.tick();
  eq('a single untied video is taken as the player', sb.ops.join(','), 'remove:20-370');
  sb.updateend();

  m.videos.length = 0;
  m.video({ srcObject: ms, currentTime: 450 });
  m.video({ srcObject: null, currentTime: 100 });
  m.tick();
  eq('srcObject ties a video to its source', sb.ops[1], 'remove:370-420');
}

report.finish();
