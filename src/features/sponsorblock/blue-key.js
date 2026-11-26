// The blue key: the manual skip of an offered segment, the jump to the
// highlight, and the seek back to the previous segment.
import { configGetAll } from '../../core/config.js';
import { showNotification } from '../../ui/toast/index.js';
import { capitalize } from '../../core/text.js';
import { TIMING } from './constants.js';
import { aimPast, armSkipWatchdog, clearManualNotification } from './skipping.js';

/**
 * Seeks to the video's highlight unless Highlight is set to Disable; false when there is no
 * highlight (or no <video>).
 */
export function jumpToHighlight(sb) {
  if (!sb.video || !sb.highlightSegment) return false;

  const mode = configGetAll().sbMode_highlight;
  if (!mode || mode === 'disable') return false;

  sb.video.currentTime = sb.highlightSegment.segment[0];
  sb.requestAF(() => showNotification('Jumped to Highlight'));
  return true;
}

/** Seeks to the start of the previous segment and leaves it alone; false when there is none. */
export function skipToPreviousSegment(sb) {
  if (!sb.video || !sb.skipSegments.length) return false;

  const currentTime = sb.video.currentTime;
  let targetSeg = null;
  for (let i = sb.skipSegments.length - 1; i >= 0; i--) {
    if (sb.skipSegments[i].start < currentTime - TIMING.PREVIOUS_SEGMENT_MARGIN) {
      targetSeg = sb.skipSegments[i];
      break;
    }
  }
  if (!targetSeg) return false;

  sb.tempWhitelistIndex = targetSeg.originalIndex;
  sb.video.currentTime = targetSeg.start;

  const title = capitalize(targetSeg.categoryName);
  sb.requestAF(() => showNotification(`Seeked to ${title}`));
  return true;
}

/** The blue key: skips the offered manual segment, else jumps to the highlight; false when neither applies. */
export function manualSkipOrHighlight(sb) {
  if (sb.currentManualSegment && sb.video) {
    sb.isSkipping = true;
    // `seeked` clears the latch; the watchdog covers a seek that never reports.
    armSkipWatchdog(sb);
    const end = sb.currentManualSegment.end;
    sb.video.currentTime = end;
    // The landing point is aimed past at once, as after an auto skip.
    aimPast(sb, end);

    clearManualNotification(sb);
    sb.requestAF(() => showNotification('Skipped Segment'));
    return true;
  }
  return jumpToHighlight(sb);
}
