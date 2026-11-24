// Seeking: chapter skips read off the progress bar, and burst seeking that
// batches rapid presses into one jump.
import { showNotification } from '../toast/index.js';
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { isShortsPage } from '../../core/page-state.js';
import { getVideo } from '../../core/dom.js';
import { simulateBack } from './helpers.js';
import { SELECTORS } from '../../core/selectors.js';
import { log } from './log.js';

// The progress bar only carries the chapter markers once the player UI has
// been shown, so the first skip on a video may have to force it open. Tracked
// per video source so each new video gets one forced attempt.
let chaptersForcedFor = '';

// The burst seek: the total shown in the toast, the part not applied to the
// video yet, and the toast and its two timers.
let seekAccumulator = 0;
let pendingSeekOffset = 0;
let seekResetTimer = null;
let seekApplyTimer = null;

/**
 * The chapter markers on the progress bar, empty until the player UI has drawn
 * them; the track's other children (the playhead, the buffer) are left out.
 */
function getChapterEls() {
  const bar = document.querySelector(SELECTORS.PROGRESS_BAR_TRACK);
  const markers = [];
  if (!bar) return markers;
  const children = bar.children;
  for (let i = 0; i < children.length; i++) {
    const key = children[i].getAttribute('idomkey');
    if (key && key.indexOf(SELECTORS.CHAPTER_MARKER_PREFIX) === 0) markers.push(children[i]);
  }
  return markers;
}

/** The player UI was forced open for the markers; close it again once the seek is in. */
const dismissForcedUI = () => setTimeout(simulateBack, 250);

// A second press during the 500 ms the forced UI takes would see
// chaptersForcedFor already set and report "No chapters found" while the
// first press is still waiting for them.
let skipInFlight = false;

/** Skips to the next or previous chapter; one skip at a time, never on Shorts. */
export async function skipChapter(direction = 'next') {
  if (skipInFlight || isShortsPage()) return;
  skipInFlight = true;
  try {
    await doSkipChapter(direction);
  } finally {
    skipInFlight = false;
  }
}

/**
 * The chapters' starts in seconds, as the bar renderer's own data has them
 * (`chapters[].start`), or an empty list when it has none. The widths of the
 * markers are whole pixels (seconds off on a short video), and on a long video
 * the bar draws only some chapters: 50 of 71 on a 4.7-hour one, read on a TV,
 * which put a skip minutes off (NicholasBly/youtube-webos#225, point 3; fixed
 * so in foxi69/youtube-webos 675ffad, four skips in a row exact on the TV).
 */
function readDataStarts() {
  const renderer = document.querySelector(SELECTORS.PROGRESS_BAR_RENDERER);
  const props = renderer && renderer.__instance && renderer.__instance.props;
  const chapters = props && props.data && props.data.chapters;
  const starts = [];
  if (!Array.isArray(chapters)) return starts;
  for (let i = 0; i < chapters.length; i++) {
    const start = chapters[i] ? Number(chapters[i].start) : NaN;
    if (isFinite(start) && start >= 0) starts.push(start);
  }
  return starts;
}

/** The chapters' starts in seconds worked out from the markers' widths; empty when none has a width. */
function readWidthStarts(chapterEls, duration) {
  const widths = [];
  let total = 0;
  for (let i = 0; i < chapterEls.length; i++) {
    const width = parseFloat(chapterEls[i].style.width || '0');
    total += width;
    widths.push(width);
  }
  const starts = [];
  // Markers without a width say nothing about where a chapter starts.
  if (total === 0) return starts;
  let at = 0;
  for (let i = 0; i < widths.length; i++) {
    starts.push((at / total) * duration);
    at += widths[i];
  }
  return starts;
}

/**
 * Where the skip lands, or -1: forward, the first chapter starting more than
 * a second past the playhead; back, the start of the current chapter, or of
 * the one before it within the first three seconds of the current one.
 */
function pickChapterTarget(starts, currentTime, direction) {
  let currentChapterStart = 0;
  let prevChapterStart = 0;

  for (let i = 0; i < starts.length; i++) {
    const startTimestamp = starts[i];

    if (direction === 'next') {
      if (startTimestamp > currentTime + 1) return startTimestamp;
    } else if (currentTime >= startTimestamp) {
      prevChapterStart = currentChapterStart;
      currentChapterStart = startTimestamp;
    } else {
      break;
    }
  }
  if (direction === 'next') return -1;
  return currentTime - currentChapterStart > 3 ? currentChapterStart : prevChapterStart;
}

/**
 * Reads the chapters from the progress bar (showing the player UI first when they are not
 * rendered), then seeks to the next or previous one.
 */
async function doSkipChapter(direction) {
  const video = getVideo();
  if (!video || !video.duration) return;

  const currentSrc = video.src || window.location.href;
  let chapterEls = getChapterEls();
  let wasForcedNow = false;

  if (chapterEls.length === 0 && chaptersForcedFor !== currentSrc) {
    log.debug('No chapters found. Forcing UI...');
    chaptersForcedFor = currentSrc;
    wasForcedNow = true;
    showNotification('Loading chapters...');
    sendKey(REMOTE_KEYS.ENTER);
    await new Promise((resolve) => setTimeout(resolve, 500));
    chapterEls = getChapterEls();
  }

  if (chapterEls.length === 0) {
    showNotification('No chapters found');
    if (wasForcedNow) dismissForcedUI();
    return;
  }

  let starts = readDataStarts();
  if (starts.length === 0) starts = readWidthStarts(chapterEls, video.duration);
  if (starts.length === 0) {
    showNotification('No chapters found');
    if (wasForcedNow) dismissForcedUI();
    return;
  }

  const targetTime = pickChapterTarget(starts, video.currentTime, direction);

  // Back always has a chapter start to go to, at worst the video's own.
  if (targetTime !== -1 && targetTime < video.duration) {
    video.currentTime = targetTime;
    showNotification(direction === 'next' ? 'Next Chapter' : 'Previous Chapter');
  } else {
    showNotification('No next chapter');
  }
  if (wasForcedNow) dismissForcedUI();
}

/**
 * One press of a burst: the toast shows the running total at once, the video
 * is moved by the pending part once the presses pause for 200 ms (a seek per
 * press froze the UI), and a change of direction starts the toast's total
 * over; the part not applied yet still counts. The reset 1.2 s later ends
 * only the toast's total: the part not applied yet is the seek timer's, and a
 * stalled event loop may run the two in either order.
 */
export function performBurstSeek(seconds, video) {
  if ((seekAccumulator > 0 && seconds < 0) || (seekAccumulator < 0 && seconds > 0)) {
    seekAccumulator = 0;
  }
  seekAccumulator += seconds;
  pendingSeekOffset += seconds;
  if (seekResetTimer) clearTimeout(seekResetTimer);

  const directionSymbol = seekAccumulator > 0 ? '+' : '';
  const msg = `Skipped ${directionSymbol}${seekAccumulator}s`;

  showNotification(msg, 3000, 'seek');

  if (seekApplyTimer) clearTimeout(seekApplyTimer);
  seekApplyTimer = setTimeout(() => {
    if (pendingSeekOffset !== 0) {
      video.currentTime += pendingSeekOffset;
      pendingSeekOffset = 0;
    }
  }, 200);

  seekResetTimer = setTimeout(() => {
    seekAccumulator = 0;
    seekResetTimer = null;
  }, 1200);
}
