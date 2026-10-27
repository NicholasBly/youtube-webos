// Whether the playback speed feature holds the video at 1080p: above 1.25x a
// TV cannot decode 2160p fast enough, so it caps the quality, and Force Max
// Quality (features/video-quality) waits meanwhile. Kept here rather than in
// either feature: the speed feature is in the webOS 22+ build only.

let capped = false;

/** Whether the speed feature caps the quality now. */
export const isQualityCappedBySpeed = () => capped;

/** Set by the speed feature when its speed goes above or back under the cap. */
export function setQualityCappedBySpeed(on) {
  capped = !!on;
}
