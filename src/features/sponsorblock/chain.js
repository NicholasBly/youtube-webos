// The chain at the start of the video: when playback begins there (or a seek
// lands there) and the video opens with an auto-skip segment, it and the
// segments close behind it go in one jump, by the same rule as any skip
// (skipping.js skipAutoSegment).
import { TIMING } from './constants.js';
import { skipAutoSegment } from './skipping.js';

/** Drops the wait for metadata, if one is pending; a rebind and destroy() call it. */
export function cancelChainRetry(sb) {
  const retry = sb.chainRetry;
  if (!retry) return;
  sb.chainRetry = null;
  retry.video.removeEventListener('loadedmetadata', retry.handler);
}

/** Runs the chain skip once `video` has its metadata; one wait at a time. */
function retryOnMetadata(sb, video) {
  cancelChainRetry(sb);

  /** The metadata arrived: drop the wait and run the chain skip. */
  const handler = () => {
    cancelChainRetry(sb);
    if (!sb.isDestroyed) executeChainSkip(sb, video);
  };
  sb.chainRetry = { video, handler };
  video.addEventListener('loadedmetadata', handler);
}

/**
 * Skips the segments at the very start of the video in one jump: the first
 * segment, when it starts within CHAIN_START of 0 and is skipped
 * automatically, with the playhead there too. A <video> without its metadata
 * cannot say where it is yet, and is waited for.
 */
export function executeChainSkip(sb, video) {
  if (!video || sb.isDestroyed) return;

  if (video.readyState === 0) {
    retryOnMetadata(sb, video);
    return;
  }

  const first = sb.skipSegments[0];
  if (!first || video.currentTime > TIMING.CHAIN_START) return;
  if (first.start >= TIMING.CHAIN_START || first.mode !== 'auto_skip') return;
  skipAutoSegment(sb, 0, video.currentTime);
}
