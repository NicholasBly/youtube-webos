// Muted segments: the audio is off while the playhead is inside a segment the
// API marked `mute` (and the setting allows it), and the viewer's own mute
// state comes back on the way out, on a seek away and on destroy.

/** Mutes for `seg`, remembering the state to restore; a no-op while already muted for it. */
export function enterMutedSegment(sb, seg) {
  if (sb.mutedSegment === seg || !sb.video) return;
  if (!sb.mutedSegment) sb.mutedBefore = sb.video.muted;
  sb.mutedSegment = seg;
  sb.video.muted = true;
}

/**
 * Restores the mute state unless `time` is still inside the muted segment;
 * without a time (or with NaN) it always restores.
 */
export function leaveMutedSegment(sb, time) {
  const seg = sb.mutedSegment;
  if (!seg) return;
  if (!isNaN(time) && time >= seg.start && time < seg.end) return;
  sb.mutedSegment = null;
  if (sb.video) sb.video.muted = sb.mutedBefore;
}
