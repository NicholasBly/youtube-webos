/**
 * Caps MSE SourceBuffer memory by evicting already-played data.
 *
 * The YouTube TV player leaves a large read-behind window in the SourceBuffer.
 * On webOS 3/4 hardware (Chromium 38/53, ~1GB total RAM) that window plus the
 * read-ahead can push the web process past what LG's memory manager tolerates,
 * which kills the app with the "restarting to free memory" toast.
 *
 * Chromium only garbage-collects a SourceBuffer once it hits its own internal
 * ceiling (150MB video / 12MB audio on these builds). The trim keeps well below that.
 *
 * No addEventListener option bags: webOS 3 is Chromium 38, which reads an
 * options object as `useCapture: true`. Syntax is not a concern, Babel lowers
 * the legacy build to ES5.
 */

import { createLogger, isDebugEnabled } from '../core/log.js';

// Seconds of already-played media to retain. Seeking back further re-buffers.
const RETAIN_BEHIND_SECS = 30;

// Don't bother removing slivers; each remove() costs an async round trip.
const MIN_TRIM_SECS = 10;

const TRIM_INTERVAL_MS = 5000;

const mediaSources = [];
const trimming = '__ytafTrimming';

const log = createLogger('BufferLimit');

/** Find the currentTime of the <video> driving this MediaSource. */
function currentTimeFor(ms) {
  const videos = document.getElementsByTagName('video');
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
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

/**
 * Removes what lies more than RETAIN_BEHIND_SECS behind the playhead from one SourceBuffer, unless
 * it is busy or the slice is too small to bother.
 */
function trimSourceBuffer(sb, now) {
  // JS is single-threaded, so checking `updating` and calling `remove()` in the
  // same synchronous block means the player cannot slip an append in between.
  if (sb.updating) return;

  let buffered;
  try {
    buffered = sb.buffered;
  } catch {
    return; // buffer was detached mid-iteration
  }
  if (!buffered || buffered.length === 0) return;

  const start = buffered.start(0);
  const safeEnd = now - RETAIN_BEHIND_SECS;

  if (safeEnd - start < MIN_TRIM_SECS) return;

  try {
    sb[trimming] = true;
    sb.remove(start, safeEnd);
    log.debug('trimmed', start.toFixed(1), '->', safeEnd.toFixed(1));
  } catch (e) {
    sb[trimming] = false;
    log.debug('remove failed', e && e.message);
  }
}

/**
 * webOS 3 (Chromium 38) does not expose the `SourceBuffer` interface object as
 * a global, so `SourceBuffer.prototype` is out of reach directly. Instances
 * exist regardless, so the prototype is lifted off the first one seen.
 *
 * Without this, an append landing while the trim remove() is in flight throws
 * InvalidStateError and playback stalls.
 */
let appendPatched = false;

/**
 * Patches appendBuffer on the SourceBuffer prototype (once), so an append that arrives while a trim
 * is running waits for it instead of throwing.
 */
function patchAppend(sb) {
  if (appendPatched) return;

  const proto = Object.getPrototypeOf(sb);
  if (!proto || typeof proto.appendBuffer !== 'function') {
    log.debug('could not resolve SourceBuffer prototype; append deferral disabled');
    return;
  }

  appendPatched = true;
  const origAppend = proto.appendBuffer;

  /** appendBuffer that defers itself to the trim's updateend when a trim is in progress. */
  proto.appendBuffer = function (data) {
    const self = this;
    if (self.updating && self[trimming]) {
      /** Runs the deferred append once the trim has finished. */
      const onDone = function () {
        self.removeEventListener('updateend', onDone); // no {once:true} on CR38
        self[trimming] = false;
        try {
          origAppend.call(self, data);
        } catch (e) {
          log.debug('deferred append failed', e && e.message);
        }
      };
      self.addEventListener('updateend', onDone);
      return;
    }
    self[trimming] = false;
    return origAppend.call(self, data);
  };

  log.debug('appendBuffer patched via instance prototype');
}

/**
 * Every TRIM_INTERVAL_MS: trims the buffers of every open MediaSource and forgets the closed ones.
 */
function tick() {
  for (let i = mediaSources.length - 1; i >= 0; i--) {
    const ms = mediaSources[i];

    if (ms.readyState === 'closed') {
      mediaSources.splice(i, 1); // player tore this one down
      continue;
    }
    if (ms.readyState !== 'open') continue;

    const now = currentTimeFor(ms);
    if (now <= RETAIN_BEHIND_SECS) continue;

    const buffers = ms.sourceBuffers;
    for (let j = 0; j < buffers.length; j++) {
      trimSourceBuffer(buffers[j], now);
    }
  }
}

// On-device verification, with diagnostics on (localStorage ytaf-debug=1 and
// a reload): run __ytafBufferStats() in the console while a video plays.
// `behind` should hold near RETAIN_BEHIND_SECS instead of climbing with
// playback position.
function bufferStats() {
  const out = [];
  for (let i = 0; i < mediaSources.length; i++) {
    const ms = mediaSources[i];
    const now = currentTimeFor(ms);
    for (let j = 0; j < ms.sourceBuffers.length; j++) {
      const sb = ms.sourceBuffers[j];
      const b = sb.buffered;
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
}

/**
 * Installs the buffer cap: tracks MediaSources as the player creates them, remembers their blob
 * URLs, and starts the trim timer.
 */
export function installBufferLimit() {
  if (typeof MediaSource === 'undefined' || !MediaSource.prototype.addSourceBuffer) {
    return;
  }

  // MediaSources are tracked so their SourceBuffers can be reached later.
  const origAdd = MediaSource.prototype.addSourceBuffer;

  /** addSourceBuffer that also tracks the MediaSource and patches the new buffer's appends. */
  MediaSource.prototype.addSourceBuffer = function (mime) {
    const sb = origAdd.call(this, mime);
    if (mediaSources.indexOf(this) === -1) mediaSources.push(this);
    patchAppend(sb);
    return sb;
  };

  if (isDebugEnabled()) window.__ytafBufferStats = bufferStats;

  // The blob URL matches a MediaSource to its <video>.
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    const origCreate = URL.createObjectURL;

    /**
     * createObjectURL that remembers a MediaSource's blob URL, which is how currentTimeFor() finds
     * its <video>.
     */
    URL.createObjectURL = function (obj) {
      const url = origCreate.call(URL, obj);
      if (obj instanceof MediaSource) obj.__ytafObjectUrl = url;
      return url;
    };
  }

  setInterval(tick, TRIM_INTERVAL_MS);
  log.debug('installed, retaining', RETAIN_BEHIND_SECS, 'sec behind');
}
