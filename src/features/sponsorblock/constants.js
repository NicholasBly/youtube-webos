// Endpoints, timing, the config key mapping, the fetch parameters and the
// colour a category is drawn in.
import { configGetAll, segmentTypes } from '../../core/config.js';

export const API = {
  primary: 'https://sponsorblock.inf.re/api',
  fallback: 'https://sponsor.ajay.app/api',
  timeoutMs: 5000,
  // No list from either server: asked again after each of these (api.js).
  retryMs: [2000, 4000]
};

// Seconds, unless the name ends in MS.
export const TIMING = {
  // A seek that would move the playhead less than this is no skip at all.
  SKIP_MIN_MOVE: 0.05,
  // The same skip reported twice within this is one skip.
  SKIP_DEDUPE: 0.1,
  // Auto-skip segments starting within this of the landing point go in one jump.
  CHAIN_GAP: 0.2,
  // A segment starting within this of 0 is skipped on load, with its neighbours.
  CHAIN_START: 0.5,
  // Within this of the next segment the loop polls per frame instead of per timeupdate.
  HIGH_FREQ_WINDOW: 1.0,
  // The overlay is re-anchored at most this often from timeupdate.
  OVERLAY_SYNC_MS: 500,
  // A programmatic skip whose `seeked` never arrives is released after this.
  SKIP_WATCHDOG_MS: 1500,
  // Blue key: a segment that started more than this ago is the "previous" one.
  PREVIOUS_SEGMENT_MARGIN: 2,
  // webOS 3 to 6 stall when seeked right to the end: segments ending within
  // LEGACY_END_MARGIN of it are clamped to LEGACY_END_CLAMP short of it, a skip
  // stops the same LEGACY_END_CLAMP short (the clamp decides where a skip
  // lands), and within LEGACY_END_REPEAT of the end the clamped segment is not
  // skipped again.
  LEGACY_END_MARGIN: 0.5,
  LEGACY_END_CLAMP: 0.3,
  LEGACY_END_REPEAT: 1.0,
  // How long bindOrWaitForVideo() waits for a <video> to mount.
  VIDEO_WAIT_MS: 10000,
  // The poll for a bar gone from under a root still watched (bar.js): interval and ceiling.
  BAR_RETRY_MS: 250,
  BAR_RETRY_MAX: 40
};

export const CONFIG_MAPPING = {
  sponsor: 'sbMode_sponsor',
  intro: 'sbMode_intro',
  outro: 'sbMode_outro',
  interaction: 'sbMode_interaction',
  selfpromo: 'sbMode_selfpromo',
  musicofftopic: 'sbMode_musicofftopic',
  preview: 'sbMode_preview',
  filler: 'sbMode_filler',
  hook: 'sbMode_hook'
};

// The settings a handler listens to, by what a change has to redo.
export const MODE_KEYS = [
  ...Object.values(CONFIG_MAPPING),
  'sbMode_highlight',
  'enableMutedSegments'
];
export const COLOR_KEYS = Object.keys(segmentTypes).map((k) => `${k}Color`);
export const LABEL_KEYS = ['sbFullVideoLabel', 'sbShowTimeWithSkips'];

// By the API's names: the settings' musicofftopic is music_offtopic there, and
// api.js renames it on arrival. exclusive_access is only ever a full-video label.
export const FETCH_CATEGORIES = encodeURIComponent(
  JSON.stringify([
    'sponsor',
    'intro',
    'outro',
    'interaction',
    'selfpromo',
    'music_offtopic',
    'preview',
    'poi_highlight',
    'filler',
    'hook',
    'exclusive_access'
  ])
);
// Full-video labels are always requested, so switching the badge on mid-video
// has a label to show: one extra actionType on a request that happens anyway.
export const FETCH_ACTION_TYPES = encodeURIComponent(JSON.stringify(['skip', 'mute', 'full']));

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

/**
 * The colour a category is drawn in: the user's setting when it is a hex
 * colour (it lands in CSS, so nothing else is accepted), else the category's
 * default, else `fallback` for a category the table does not know.
 */
export function categoryColor(category, fallback = null) {
  const type = segmentTypes[category];
  if (!type) return fallback;
  const custom = String(configGetAll()[`${category}Color`] || '').trim();
  return HEX_COLOR.test(custom) ? custom : type.color;
}
