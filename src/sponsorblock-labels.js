import { configRead, segmentTypes } from './config.js';
import './sponsorblock-labels.css';

/**
 * Two small SponsorBlock readouts rendered into YouTube's own DOM.
 *
 *   1. Full Video Label badge - a coloured pill before the video title when
 *      SponsorBlock says the whole video is a sponsorship / self-promo, the
 *      same thing the desktop extension shows.
 *   2. Time with skips removed - the duration minus everything that will be
 *      skipped, in brackets after the duration under the seek bar.
 *
 * THIS MODULE NEVER TOUCHES THE DOM
 *   Not a node, not an attribute. Everything is done by rewriting one
 *   stylesheet:
 *
 *       <title selector>::before { content: "Sponsor"; ... }
 *       <duration selector>::after { content: "(27:07)"; }
 *
 *   sponsorblock-labels.css carries all the styling for those two
 *   pseudo-elements but deliberately sets no `content`, so neither renders.
 *   This module supplies `content` (and the badge colour) when a readout is
 *   active, and clears the sheet when it is not.
 *
 * WHY, AFTER TRYING TWO OTHER WAYS
 *   The obvious approach - append a node - loses to incremental-dom, which
 *   deletes children it did not render. Watching for that costs a
 *   MutationObserver per readout.
 *
 *   The second approach set a data attribute on YouTube's element and read it
 *   back with attr(). That removed the observers but kept the real problem:
 *   something has to find the host element, and the host does not exist until
 *   the player chrome is built. Whatever drives that search is either a polling
 *   loop or a signal that fires too late - which is exactly why the badge used
 *   to appear only after the progress bar had been brought up.
 *
 *   A selector has no such problem. The rule is written once and the browser
 *   applies it the instant a matching element exists, however long that takes,
 *   and re-applies it every time the element is destroyed and rebuilt. There is
 *   nothing to schedule, nothing to retry, and no window in which the readout
 *   can be missing while the element is present.
 *
 * COST
 *   One textContent write when the value changes, which is roughly once per
 *   video. Zero work per frame, per timeupdate, or per mutation.
 *
 * NO CSS CUSTOM PROPERTIES
 *   Segment colours are user-configurable, so the badge colour has to be
 *   dynamic. var() would be the obvious vehicle and is not available: this app
 *   targets down to Chrome 38 / Safari 7 (webOS 1-3) and custom properties need
 *   Chrome 49. Hence the colour being written into the rule itself.
 */

const DEBUG = false;

/**
 * Where each readout renders.
 *
 * The badge is scoped to the watch page's metadata block so it cannot leak onto
 * other titles that happen to reuse the same idomkey.
 *
 * The time attaches to the duration span rather than its time-label parent.
 * The parent lays elapsed and duration out at opposite ends of the seek bar, so
 * a pseudo-element on it becomes a third item at the far edge instead of text
 * next to the duration. On the span it reads "42:49 (27:07)", which is the
 * desktop arrangement.
 */
const BADGE_SELECTOR =
  'ytlr-watch-metadata [idomkey="title-text"]::before,' +
  'ytlr-video-title-tray [idomkey="title-text"]::before';

const TIME_SELECTOR = '[idomkey="time-label"] [idomkey="duration"]::after';

/**
 * Categories that can carry a full-video label but are not in segmentTypes.
 *
 * exclusive_access is full-only, so it has no skip mode and no colour entry in
 * config. It is kept local rather than added to segmentTypes: doing that would
 * mint a colour picker and a mode control for a category that can never be
 * skipped.
 */
const EXTRA_FULL_CATEGORIES = {
  exclusive_access: { color: '#008a5c' }
};

const FULL_LABELS = {
  sponsor: 'Sponsor',
  selfpromo: 'Self Promo',
  exclusive_access: 'Exclusive Access'
};

/** Category -> its skip-mode config key. Mirrors CONFIG_MAPPING in sponsorblock.js. */
const SEGMENT_MODE_KEYS = {
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

function debugLog(...args) {
  if (DEBUG) console.info('[SB-Labels]', ...args);
}

/* --------------------------------------------------------------- helpers --- */

/** mm:ss, or h:mm:ss past an hour. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A quoted CSS string. Everything here is generated, but it lands in a stylesheet. */
export function cssString(value) {
  const escaped = String(value)
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\n\r]/g, ' ');
  return `"${escaped}"`;
}

/** #rgb / #rrggbb only. Anything else is refused rather than written into CSS. */
export function safeColor(value, fallback) {
  const str = String(value).trim();
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(str) ? str : fallback;
}

/**
 * Readable foreground for an arbitrary user-chosen background.
 *
 * Segment colours are configurable and several defaults are light - selfpromo
 * is pure yellow. White-on-yellow is unreadable, so the text colour follows the
 * background's luminance rather than being fixed.
 */
export function contrastColor(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  // Rec. 709 luma, close enough for a two-way choice.
  const luma = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luma > 0.6 ? '#000' : '#fff';
}

export function categoryColor(category) {
  const configured = configRead(`${category}Color`);
  if (configured) return safeColor(configured, '#00d400');
  if (segmentTypes[category]) return safeColor(segmentTypes[category].color, '#00d400');
  if (EXTRA_FULL_CATEGORIES[category]) return EXTRA_FULL_CATEGORIES[category].color;
  return '#00d400';
}

/** A segment the API returned as a whole-video label. */
export function isFullVideoSegment(segment) {
  return !!segment && segment.actionType === 'full';
}

/**
 * Total seconds removed by skipping, with overlaps counted once.
 *
 * WHAT COUNTS
 *   Every category the user has not switched off. Auto Skip and Manual Skip
 *   segments come off because they will be skipped past; Show in Seek Bar
 *   segments come off too, which is what was asked for. Disable means the
 *   segment plays in full, so it stays in the running time.
 *
 * WHY MERGING IS NOT OPTIONAL
 *   SponsorBlock regularly returns overlapping segments for the same stretch of
 *   video - a sponsor read that is also tagged self-promo, for instance - and
 *   summing the raw durations would subtract that stretch twice and report a
 *   video shorter than it can possibly be.
 */
export function skippableSeconds(segments, duration) {
  if (!segments || segments.length === 0) return 0;

  const ranges = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || !seg.segment) continue;

    // Only things that actually remove playback time. A muted segment is still
    // watched, a highlight is a point, a chapter is a label, and a full-video
    // label is [0, 0].
    if (seg.actionType && seg.actionType !== 'skip') continue;
    if (seg.category === 'poi_highlight' || seg.category === 'chapter') continue;

    const modeKey = SEGMENT_MODE_KEYS[seg.category];
    if (modeKey && configRead(modeKey) === 'disable') continue;

    let start = Number(seg.segment[0]);
    let end = Number(seg.segment[1]);
    if (isNaN(start) || isNaN(end) || end <= start) continue;

    if (duration > 0) {
      start = Math.max(0, Math.min(start, duration));
      end = Math.max(0, Math.min(end, duration));
      if (end <= start) continue;
    }
    ranges.push([start, end]);
  }

  if (ranges.length === 0) return 0;
  ranges.sort((a, b) => a[0] - b[0]);

  let total = 0;
  let curStart = ranges[0][0];
  let curEnd = ranges[0][1];
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] <= curEnd) {
      if (ranges[i][1] > curEnd) curEnd = ranges[i][1];
    } else {
      total += curEnd - curStart;
      curStart = ranges[i][0];
      curEnd = ranges[i][1];
    }
  }
  return total + (curEnd - curStart);
}

/**
 * Pick the label to show when a video carries more than one full-video label.
 *
 * Order is deliberate rather than "first in the array": sponsor is the
 * strongest claim and the one the user asked to be warned about, so it wins
 * over a self-promo or exclusive-access label on the same video.
 */
const FULL_PRIORITY = ['sponsor', 'selfpromo', 'exclusive_access'];

export function pickFullLabel(segments) {
  if (!segments || segments.length === 0) return null;

  const present = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!isFullVideoSegment(seg)) continue;

    // Respect a category the user switched off, so the badge cannot contradict
    // the rest of the SponsorBlock settings.
    const modeKey = SEGMENT_MODE_KEYS[seg.category];
    if (modeKey && configRead(modeKey) === 'disable') continue;

    present.push(seg.category);
  }
  if (present.length === 0) return null;

  for (let i = 0; i < FULL_PRIORITY.length; i++) {
    if (present.indexOf(FULL_PRIORITY[i]) !== -1) return FULL_PRIORITY[i];
  }
  return present[0];
}

/* ------------------------------------------------------------ the sheet --- */

/**
 * Build the rules for the current state. Empty string means "show nothing".
 *
 * Exported so the tests can assert on the generated CSS directly.
 */
export function buildCss(segments, duration) {
  let css = '';

  if (configRead('sbFullVideoLabel')) {
    const category = pickFullLabel(segments);
    if (category) {
      const background = categoryColor(category);
      const foreground = contrastColor(background);
      const label = FULL_LABELS[category] || category;
      css += `${BADGE_SELECTOR}{content:${cssString(label)};` +
             `background-color:${background};color:${foreground};}`;
    }
  }

  if (configRead('sbShowTimeWithSkips') && duration > 0 && !isNaN(duration)) {
    const skipped = skippableSeconds(segments, duration);
    // Nothing to remove means nothing worth saying - the bracketed figure would
    // just repeat the duration already next to it.
    if (skipped >= 1) {
      const remaining = formatTime(Math.max(0, duration - skipped));
      css += `${TIME_SELECTOR}{content:${cssString(`(${remaining})`)};}`;
    }
  }

  return css;
}

class SponsorBlockLabels {
  constructor() {
    this.styleEl = null;
    this.css = '';
  }

  write(css) {
    if (css === this.css && this.styleEl && this.styleEl.isConnected) return;
    this.css = css;

    if (!css) {
      if (this.styleEl) this.styleEl.textContent = '';
      return;
    }

    if (!this.styleEl || !this.styleEl.isConnected) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'sb-labels';
      (document.head || document.documentElement).appendChild(this.styleEl);
    }
    this.styleEl.textContent = css;
    debugLog('wrote', css);
  }

  /**
   * Recompute both readouts.
   *
   * Called whenever an input can have moved: after the fetch, on
   * durationchange, and when a SponsorBlock setting changes.
   */
  update(segments, duration) {
    this.write(buildCss(segments, duration));
  }

  clear() {
    this.write('');
  }
}

export default new SponsorBlockLabels();
