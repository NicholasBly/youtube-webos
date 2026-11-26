// What the legacy build (webOS 3 to 6) has in place of features/playback-speed
// (webpack.config.js): the speed engine needs WebCodecs, which none of those
// TVs have, so the shortcuts only say so and the panel shows no row.
import { showNotification } from '../ui/toast/index.js';

/** Whether this build can change the playback speed: never. */
export const playbackSpeedSupported = false;

/** The Playback Speed + and - shortcuts: says the TV cannot. */
export function stepSpeed() {
  showNotification('Playback speed needs webOS 23 or newer');
}

/** The Playback Speed 1x shortcut: nothing to reset. */
export function resetSpeed() {}
