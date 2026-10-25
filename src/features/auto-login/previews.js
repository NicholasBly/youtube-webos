// Inline playback (video previews on the grid): the app's own setting, forced
// on or off once its initial load has had its say.
import { configRead } from '../../core/config.js';
import { log } from './log.js';
import { writeRecord } from '../../core/yt-storage.js';

/**
 * Writes YouTube's own inline-playback (previews) preference: on for force_on, off for force_off.
 */
export function setInlinePlayback(mode) {
  if (mode === 'disabled') return;

  const isEnabled = mode === 'force_on';
  if (writeRecord('yt.leanback.default::inline-playback-enabled', { data: isEnabled })) {
    log.info(`Inline playback (previews) forced to: ${isEnabled}`);
  } else {
    log.error('Failed to update inline playback setting');
  }
}

/** Applies Force Previews 2.5 s after start, once YouTube's own start-up has written its value. */
export function initPreviews() {
  const mode = configRead('forcePreviews');
  if (mode === 'disabled') return;

  // Delay by 2.5 seconds to ensure it applies after YouTube's initial load overrides
  setTimeout(() => {
    setInlinePlayback(mode);
  }, 2500);
}
