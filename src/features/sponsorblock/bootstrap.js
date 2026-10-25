// Global start: one handler per watched video (core/per-video.js), created
// only while the setting is on.
import { configRead } from '../../core/config.js';
import { bootstrapPerVideo } from '../../core/per-video.js';

// The live instance (core/per-video.js), once bootstrapped.
let live = () => null;

/** The SponsorBlockHandler for the video being watched, or null. */
export function getSponsorBlock() {
  return live();
}

/** Takes the handler class rather than importing it, so the two files do not import each other. */
export function bootstrapSponsorBlock(SponsorBlockHandler) {
  live = bootstrapPerVideo({
    // Mirrored to window.sponsorblock for the tests and for diagnostics on the
    // TV (its barChecks, bar.js); code in src/ goes through getSponsorBlock().
    windowName: 'sponsorblock',
    restartOn: 'enableSponsorBlock',
    create: (videoID) =>
      configRead('enableSponsorBlock') ? new SponsorBlockHandler(videoID) : null
  });
}
