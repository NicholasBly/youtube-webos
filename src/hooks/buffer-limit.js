/**
 * Caps MSE SourceBuffer memory by evicting already-played data.
 *
 * The YouTube TV player leaves a large read-behind window in the SourceBuffer.
 * On webOS 3/4 hardware (Chromium 38/53, ~1GB total RAM) that window plus the
 * read-ahead can push the web process past what LG's memory manager tolerates,
 * which kills the app with the "restarting to free memory" toast.
 *
 * Chromium only garbage-collects a SourceBuffer once it hits its own internal
 * ceiling (150MB video / 12MB audio on these builds). We trim well below that.
 *
 * Written ES5-style on purpose: no addEventListener option bags, no arrow
 * functions in hot paths -- webOS 3 is Chromium 38.
 */

var DEBUG = false;

// Seconds of already-played media to retain. Seeking back further re-buffers.
var RETAIN_BEHIND_SECS = 30;

// Don't bother removing slivers; each remove() costs an async round trip.
var MIN_TRIM_SECS = 10;

var TRIM_INTERVAL_MS = 5000;

var mediaSources = [];
var trimming = '__ytafTrimming';

function log() {
  if (!DEBUG) return;
  var args = Array.prototype.slice.call(arguments);
  args.unshift('[BufferLimit]');
  console.info.apply(console, args);
}

/** Find the currentTime of the <video> driving this MediaSource. */
function currentTimeFor(ms) {
  var videos = document.getElementsByTagName('video');
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    if (v.srcObject === ms) return v.currentTime;
    if (ms.__ytafObjectUrl && v.currentSrc === ms.__ytafObjectUrl) {
      return v.currentTime;
    }
  }
  // Single-video fallback: the TV app only ever has one real player.
  if (videos.length === 1 && videos[0].currentTime > 0) {
    return videos[0].currentTime;
  }
  return -1;
}

function trimSourceBuffer(sb, now) {
  // JS is single-threaded, so checking `updating` and calling `remove()` in the
  // same synchronous block means the player cannot slip an append in between.
  if (sb.updating) return;

  var buffered;
  try {
    buffered = sb.buffered;
  } catch (e) {
    return; // buffer was detached mid-iteration
  }
  if (!buffered || buffered.length === 0) return;

  var start = buffered.start(0);
  var safeEnd = now - RETAIN_BEHIND_SECS;

  if (safeEnd - start < MIN_TRIM_SECS) return;

  try {
    sb[trimming] = true;
    sb.remove(start, safeEnd);
    log('trimmed', start.toFixed(1), '->', safeEnd.toFixed(1));
  } catch (e) {
    sb[trimming] = false;
    log('remove failed', e && e.message);
  }
}

/**
 * webOS 3 (Chromium 38) does not expose the `SourceBuffer` interface object as
 * a global, so we cannot touch `SourceBuffer.prototype` directly. Instances
 * exist regardless, so we lift the prototype off the first one we're handed.
 *
 * Without this, an append landing while our remove() is in flight throws
 * InvalidStateError and playback stalls.
 */
var appendPatched = false;

function patchAppend(sb) {
  if (appendPatched) return;

  var proto = Object.getPrototypeOf ? Object.getPrototypeOf(sb) : sb.__proto__;
  if (!proto || typeof proto.appendBuffer !== 'function') {
    log('could not resolve SourceBuffer prototype; append deferral disabled');
    return;
  }

  appendPatched = true;
  var origAppend = proto.appendBuffer;

  proto.appendBuffer = function (data) {
    var self = this;
    if (self.updating && self[trimming]) {
      var onDone = function () {
        self.removeEventListener('updateend', onDone); // no {once:true} on CR38
        self[trimming] = false;
        try {
          origAppend.call(self, data);
        } catch (e) {
          log('deferred append failed', e && e.message);
        }
      };
      self.addEventListener('updateend', onDone);
      return;
    }
    self[trimming] = false;
    return origAppend.call(self, data);
  };

  log('appendBuffer patched via instance prototype');
}

function tick() {
  for (var i = mediaSources.length - 1; i >= 0; i--) {
    var ms = mediaSources[i];

    if (ms.readyState === 'closed') {
      mediaSources.splice(i, 1); // player tore this one down
      continue;
    }
    if (ms.readyState !== 'open') continue;

    var now = currentTimeFor(ms);
    if (now <= RETAIN_BEHIND_SECS) continue;

    var buffers = ms.sourceBuffers;
    for (var j = 0; j < buffers.length; j++) {
      trimSourceBuffer(buffers[j], now);
    }
  }
}

export function initBufferLimit(options) {
  if (typeof MediaSource === 'undefined' || !MediaSource.prototype.addSourceBuffer) {
    return;
  }

  options = options || {};
  if (options.retainBehindSecs) RETAIN_BEHIND_SECS = options.retainBehindSecs;
  if (options.minTrimSecs) MIN_TRIM_SECS = options.minTrimSecs;
  if (options.trimIntervalMs) TRIM_INTERVAL_MS = options.trimIntervalMs;

  // Track MediaSources so we can reach their SourceBuffers later.
  var origAdd = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (mime) {
    var sb = origAdd.call(this, mime);
    if (mediaSources.indexOf(this) === -1) mediaSources.push(this);
    patchAppend(sb);
    return sb;
  };

  // On-device verification: run __ytafBufferStats() in the console while a
  // video plays. `behind` should hold near RETAIN_BEHIND_SECS instead of
  // climbing with playback position.
  window.__ytafBufferStats = function () {
    var out = [];
    for (var i = 0; i < mediaSources.length; i++) {
      var ms = mediaSources[i];
      var now = currentTimeFor(ms);
      for (var j = 0; j < ms.sourceBuffers.length; j++) {
        var sb = ms.sourceBuffers[j];
        var b = sb.buffered;
        if (!b || !b.length) continue;
        out.push({
          state: ms.readyState,
          currentTime: +now.toFixed(1),
          start: +b.start(0).toFixed(1),
          end: +b.end(b.length - 1).toFixed(1),
          behind: +(now - b.start(0)).toFixed(1),
          ahead: +(b.end(b.length - 1) - now).toFixed(1)
        });
      }
    }
    return { appendPatched: appendPatched, buffers: out };
  };

  // Remember the blob URL so we can match a MediaSource to its <video>.
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    var origCreate = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      var url = origCreate.call(URL, obj);
      if (typeof MediaSource !== 'undefined' && obj instanceof MediaSource) {
        obj.__ytafObjectUrl = url;
      }
      return url;
    };
  }

  setInterval(tick, TRIM_INTERVAL_MS);
  log('installed, retaining', RETAIN_BEHIND_SECS, 'sec behind');
}