// Global start: one instance per watched video (core/per-video.js). The
// instance exists even with the dislike count off: the description panel's
// keyboard navigation is its too.
import { configRead } from '../../core/config.js';
import { bootstrapPerVideo } from '../../core/per-video.js';

// The live instance (core/per-video.js), once bootstrapped.
let live = () => null;

/** The ReturnYouTubeDislike instance for the video being watched, or null. */
export function getReturnDislike() {
  return live();
}

/** Takes the class rather than importing it, so the two files do not import each other. */
export function bootstrapReturnDislike(ReturnYouTubeDislike) {
  live = bootstrapPerVideo({
    // Mirrored to window.returnYouTubeDislike for the tests; code in src/ goes through getReturnDislike().
    windowName: 'returnYouTubeDislike',
    restartOn: 'enableReturnYouTubeDislike',
    create: (videoID) => new ReturnYouTubeDislike(videoID, configRead('enableReturnYouTubeDislike'))
  });
}
