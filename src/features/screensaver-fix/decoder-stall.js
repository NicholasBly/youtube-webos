// Frozen video after a video screensaver. When a video sits paused long
// enough for the TV's screensaver to start, a video screensaver (Aerial, the
// gallery) can take the hardware decoder from the paused <video> without the
// page hearing of it. Pressing play then fires 'playing' with data ready, but
// no frame decodes and the clock stands still, until YouTube's own stall
// watchdog rebuilds the player some 20 s later. A seek to where the video
// already is makes the stale pipeline fail at once, and YouTube rebuilds it
// within a few seconds.
//
// Only a resume after a long pause is checked, once: first plays, short
// pauses, rebuffering and seeking are left alone, and the nudge's own
// 'playing' (after the seek) is not checked again, so it cannot loop. A pause
// or another 'playing' in the meantime cancels a pending check.
import { log } from './log.js';

// A screensaver starts only after minutes of a still picture; anything
// shorter than this cannot have lost the decoder to one.
const LONG_PAUSE_MS = 30000;
// How long a resumed video may stand still, with data ready, before it counts as frozen.
const CHECK_AFTER_MS = 2000;

// When each <video> was paused.
const pausedAt = new WeakMap();
// The check waiting for its moment: { video, timer }, or null.
let pending = null;

/** Drops the check waiting for its moment, if any. */
function cancelPending() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending = null;
}

/** A <video> paused: remember when, and drop a check of an earlier resume. */
function onPause(evt) {
  const video = evt.target;
  if (!(video instanceof HTMLVideoElement)) return;
  cancelPending();
  pausedAt.set(video, Date.now());
}

/**
 * Seeks a resumed video in place when it is still standing still with data ready
 * CHECK_AFTER_MS later.
 */
function checkFrozen(video, startTime) {
  // Paused again, seeking, or buffering for real (readyState drops then): not frozen.
  if (!video.isConnected || video.paused || video.seeking || video.readyState < 3) return;
  if (video.currentTime !== startTime) return;
  log.info('Playback frozen after a long pause (decoder taken?): seeking in place at', startTime);
  video.currentTime = startTime;
}

/** A <video> started playing: after a long pause, check that its clock moves. */
function onPlaying(evt) {
  const video = evt.target;
  if (!(video instanceof HTMLVideoElement)) return;
  cancelPending();
  const since = pausedAt.get(video);
  // Once per resume: the 'playing' that follows the nudge finds nothing here.
  pausedAt.delete(video);
  if (!since || Date.now() - since < LONG_PAUSE_MS) return;
  const startTime = video.currentTime;
  const check = { video, timer: 0 };
  check.timer = setTimeout(() => {
    if (pending !== check) return;
    pending = null;
    checkFrozen(video, startTime);
  }, CHECK_AFTER_MS);
  pending = check;
}

// Media events do not bubble; capturing on the document sees every <video>.
document.addEventListener('pause', onPause, true);
document.addEventListener('playing', onPlaying, true);
