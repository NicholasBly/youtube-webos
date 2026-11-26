// Playback-time behaviour: aiming at the next segment, the timeupdate
// listener, the per-frame loop near a segment and the skip itself, which the
// chain at the start (chain.js) takes too. The blue key is blue-key.js.
import { configGetAll } from '../../core/config.js';
import { showNotification } from '../../ui/toast/index.js';
import { capitalize } from '../../core/text.js';
import { TIMING } from './constants.js';
import {
  findSegmentAtTime,
  findNextSegmentIndex,
  rebuildSkipSegments,
  skipMessage
} from './segments.js';
import { resyncOverlayThrottled } from './overlay.js';
import { enterMutedSegment, leaveMutedSegment } from './mute.js';

// --- The timeupdate listener and the per-frame loop ---------------------------

/** Starts listening to timeupdate on a playing video (once). */
function attachTimeListener(sb) {
  if (!sb.video || sb.video.paused || sb.timeListenerActive) return;
  sb.video.addEventListener('timeupdate', sb.boundTimeUpdate);
  sb.timeListenerActive = true;
}

/** Stops listening to timeupdate. */
export function detachTimeListener(sb) {
  if (!sb.video || !sb.timeListenerActive) return;
  sb.video.removeEventListener('timeupdate', sb.boundTimeUpdate);
  sb.timeListenerActive = false;
}

/**
 * Starts the per-frame check when a segment is coming up, so the skip lands on time rather than up
 * to a timeupdate (about 250 ms) late.
 */
function startHighFreqLoop(sb) {
  if (!sb.pollingRafId && sb.nextSegmentStart !== Infinity && !sb.isDestroyed) {
    sb.pollingRafId = requestAnimationFrame(sb.boundHighFreqLoop);
  }
}

/** Stops the per-frame check. */
export function stopHighFreqLoop(sb) {
  if (sb.pollingRafId) {
    cancelAnimationFrame(sb.pollingRafId);
    sb.pollingRafId = null;
  }
}

/**
 * One frame of the check: hands over to handleTimeUpdate once the playhead reaches the next
 * segment, else asks for the next frame. Stops on pause, a skip or destroy.
 */
export function highFreqLoop(sb) {
  if (sb.isDestroyed || !sb.video || sb.video.paused || sb.isSkipping) {
    stopHighFreqLoop(sb);
    return;
  }
  if (sb.video.currentTime >= sb.nextSegmentStart) {
    handleTimeUpdate(sb);
    stopHighFreqLoop(sb);
  } else {
    sb.pollingRafId = requestAnimationFrame(sb.boundHighFreqLoop);
  }
}

// --- Aiming ------------------------------------------------------------------------

/** Aims at the segment containing `time`, else the first one after it. */
function aimAt(sb, time) {
  const inside = findSegmentAtTime(sb, time);
  sb.nextSegmentIndex = inside !== -1 ? inside : findNextSegmentIndex(sb, time);
  sb.nextSegmentStart =
    sb.nextSegmentIndex < sb.skipSegments.length
      ? sb.skipSegments[sb.nextSegmentIndex].start
      : Infinity;
}

/** Aims past `time`, and stops listening when nothing is left. */
export function aimPast(sb, time) {
  aimAt(sb, time);
  if (sb.nextSegmentStart === Infinity) detachTimeListener(sb);
}

/**
 * Re-aims from the playhead and re-arms the listener: after a seek, when
 * playback resumes and after the skip list changed. The manual-skip prompt
 * stays up while the playhead is still inside its segment, so resuming there
 * does not blink it off and on.
 */
export function resetSegmentTracking(sb) {
  const time = sb.video ? sb.video.currentTime : NaN;
  if (!sb.skipSegments.length || isNaN(time)) {
    sb.nextSegmentIndex = 0;
    sb.nextSegmentStart = sb.skipSegments.length ? sb.skipSegments[0].start : Infinity;
  } else {
    aimAt(sb, time);
  }

  const manual = sb.currentManualSegment;
  if (!manual || isNaN(time) || time < manual.start || time >= manual.end) {
    clearManualNotification(sb);
  }
  leaveMutedSegment(sb, time);
  if (sb.nextSegmentStart !== Infinity) attachTimeListener(sb);
  else detachTimeListener(sb);
}

/** Rebuilds the skip list for the current settings and re-aims. */
export function refreshSkipSegments(sb) {
  stopHighFreqLoop(sb);
  // A muted segment is re-entered from the new list on the next timeupdate.
  leaveMutedSegment(sb);
  rebuildSkipSegments(sb);
  resetSegmentTracking(sb);
}

// --- Manual segments and the skip watchdog -------------------------------------------

/** Removes the manual-skip prompt and forgets the segment it offered. */
export function clearManualNotification(sb) {
  if (sb.activeManualNotification) {
    sb.activeManualNotification.remove();
    sb.activeManualNotification = null;
  }
  sb.currentManualSegment = null;
}

// Safety net: if the media pipeline swallows the 'seeked' event for a
// programmatic skip (buffer stalls / near-EOS quirks on webOS), clear the
// isSkipping latch so the timeupdate pipeline keeps working.
export function armSkipWatchdog(sb) {
  if (sb.skipWatchdogTimer) clearTimeout(sb.skipWatchdogTimer);
  sb.skipWatchdogTimer = setTimeout(() => {
    sb.skipWatchdogTimer = null;
    if (!sb.isDestroyed && sb.isSkipping) {
      sb.logger.info("'seeked' never fired after a skip: watchdog reset");
      sb.isSkipping = false;
      resetSegmentTracking(sb);
    }
  }, TIMING.SKIP_WATCHDOG_MS);
}

/** Stops the timer that catches a skip whose seek never completed. */
export function clearSkipWatchdog(sb) {
  if (sb.skipWatchdogTimer) {
    clearTimeout(sb.skipWatchdogTimer);
    sb.skipWatchdogTimer = null;
  }
}

// --- The timeupdate path ------------------------------------------------------------

/**
 * Index of the segment `currentTime` is in. The predicted one is trusted when
 * it is a manual segment; otherwise the scan decides, since a manual segment
 * nested in the predicted one takes precedence (see findSegmentAtTime).
 */
function findCurrentSegment(sb, currentTime) {
  const expected = sb.skipSegments[sb.nextSegmentIndex];
  if (!expected || currentTime < expected.start) return -1;
  if (expected.mode === 'manual_skip' && currentTime < expected.end) return sb.nextSegmentIndex;
  return findSegmentAtTime(sb, currentTime);
}

/** The manual-skip prompt for a segment that is not auto-skipped. */
function announceSegment(sb, seg) {
  if (seg.mode !== 'manual_skip' || sb.currentManualSegment === seg) return;
  sb.currentManualSegment = seg;
  if (sb.activeManualNotification) sb.activeManualNotification.remove();
  const title = capitalize(seg.categoryName);
  sb.activeManualNotification = showNotification(`${title}: Press Blue to skip`, 0);
}

/** Whether an auto-skip segment is skipped now, or left alone. */
function shouldSkip(sb, seg, segmentIdx, currentTime) {
  if (seg.originalIndex === sb.tempWhitelistIndex) return false;
  if (configGetAll().skipSegmentsOnce && sb.skippedSegmentIndices.has(seg.originalIndex)) {
    return false;
  }
  // webOS 3 to 6: after the clamped end-of-video skip the segment still holds
  // the position, so it is not skipped again.
  if (
    sb.legacy &&
    segmentIdx === sb.lastSkippedSegmentIndex &&
    sb.video.duration - currentTime < TIMING.LEGACY_END_REPEAT
  ) {
    return false;
  }
  // The same skip reported twice within the dedupe window is one skip.
  return !(
    segmentIdx === sb.lastSkippedSegmentIndex &&
    Math.abs(currentTime - sb.lastSkipTime) < TIMING.SKIP_DEDUPE
  );
}

/**
 * Where the skip lands: past this segment and the auto-skip segments that
 * follow it closely, but never past the start of a manual one ahead of the
 * playhead. A manual segment already behind the playhead has had its turn,
 * and a muted segment is skipped over like any other part of the video.
 */
function findJumpTarget(sb, segmentIdx, currentTime) {
  const seg = sb.skipSegments[segmentIdx];
  let jumpTarget = seg.end;
  const categories = [seg.categoryName];
  const indices = [seg.originalIndex];
  for (let i = segmentIdx + 1; i < sb.skipSegments.length; i++) {
    const next = sb.skipSegments[i];
    if (next.mode === 'mute') continue;
    if (next.mode === 'manual_skip') {
      if (next.end <= currentTime) continue;
      if (next.start < jumpTarget) jumpTarget = next.start;
      break;
    }
    if (next.start > jumpTarget + TIMING.CHAIN_GAP) break;
    jumpTarget = Math.max(jumpTarget, next.end);
    categories.push(next.categoryName);
    indices.push(next.originalIndex);
  }
  // webOS 3 to 6 stall when seeked right to the end: stop just short of it.
  if (sb.legacy) {
    const duration = sb.video.duration;
    if (jumpTarget >= duration - TIMING.LEGACY_END_MARGIN) {
      jumpTarget = Math.max(0, duration - TIMING.LEGACY_END_CLAMP);
    }
  }
  return { jumpTarget, categories, indices };
}

/** Performs the skip, then aims at whatever follows the landing point. */
function skipTo(sb, segmentIdx, currentTime, { jumpTarget, categories, indices }) {
  if (jumpTarget <= currentTime + TIMING.SKIP_MIN_MOVE) {
    // Nothing ahead to skip: the segment ends here, or a manual one starts
    // here. Aim past it without booking or announcing a skip.
    aimPast(sb, jumpTarget);
    return;
  }
  sb.lastSkipTime = currentTime;
  sb.lastSkippedSegmentIndex = segmentIdx;
  indices.forEach((idx) => {
    sb.skippedSegmentIndices.add(idx);
  });

  sb.isSkipping = true;
  armSkipWatchdog(sb);
  sb.video.currentTime = jumpTarget;
  // A jump out of a muted segment ends the mute too: nothing ahead may be left
  // to drive a timeupdate that would.
  leaveMutedSegment(sb, jumpTarget);

  // The landing point may itself be inside a segment (a manual one, say).
  aimPast(sb, jumpTarget);

  sb.requestAF(() => {
    showNotification(skipMessage(categories));
  });
  sb.logger.debug(`Skipped to ${jumpTarget}`);
}

/**
 * The auto-skip segment at `segmentIdx`, with the ones close behind it, in
 * one jump; unless shouldSkip leaves it alone. The timeupdate path and the
 * chain at the start (chain.js) both come here.
 */
export function skipAutoSegment(sb, segmentIdx, currentTime) {
  if (!shouldSkip(sb, sb.skipSegments[segmentIdx], segmentIdx, currentTime)) return;
  skipTo(sb, segmentIdx, currentTime, findJumpTarget(sb, segmentIdx, currentTime));
}

/**
 * The skip decision at the playhead: leaves a muted segment, polls faster before the next segment,
 * and inside one auto-skips, mutes, or offers the manual skip according to its category's mode.
 */
export function handleTimeUpdate(sb) {
  if (sb.isSkipping || sb.isDestroyed || !sb.video) return;
  resyncOverlayThrottled(sb);
  if (sb.video.seeking || sb.video.readyState === 0) return;

  const currentTime = sb.video.currentTime;
  const manual = sb.currentManualSegment;
  if (manual && (currentTime < manual.start || currentTime >= manual.end)) {
    clearManualNotification(sb);
  }
  leaveMutedSegment(sb, currentTime);

  // Not there yet: trust nextSegmentStart, and poll faster through the last second.
  const timeToNext = sb.nextSegmentStart - currentTime;
  if (timeToNext > 0 && !sb.currentManualSegment) {
    if (timeToNext < TIMING.HIGH_FREQ_WINDOW && !sb.pollingRafId) startHighFreqLoop(sb);
    return;
  }

  const segmentIdx = findCurrentSegment(sb, currentTime);
  if (segmentIdx === -1) {
    // Between segments or past the last one; re-aim in case of drift.
    if (currentTime >= sb.nextSegmentStart) aimPast(sb, currentTime);
    sb.tempWhitelistIndex = -1;
    return;
  }

  const seg = sb.skipSegments[segmentIdx];
  if (sb.tempWhitelistIndex !== -1 && seg.originalIndex !== sb.tempWhitelistIndex) {
    sb.tempWhitelistIndex = -1;
  }
  if (seg.mode === 'mute') {
    enterMutedSegment(sb, seg);
    return;
  }
  if (seg.mode !== 'auto_skip') {
    announceSegment(sb, seg);
    return;
  }
  skipAutoSegment(sb, segmentIdx, currentTime);
}
