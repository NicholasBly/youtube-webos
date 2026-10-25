// Two small SponsorBlock readouts rendered into YouTube's own DOM:
//
//   1. Full Video Label badge - a coloured pill before the video title when
//      SponsorBlock says the whole video is a sponsorship / self-promo, the
//      same thing the desktop extension shows.
//   2. Time with skips removed - the duration minus everything that will be
//      skipped, in brackets after the duration under the seek bar.
//
// One stylesheet: the module adds a single <style> and rewrites its text; it
// never touches a video node or attribute:
//
//     <title selector>::before { content: "Sponsor"; ... }
//     <duration selector>::after { content: "(27:07)"; }
//
// labels.css styles the two pseudo-elements and leaves `content` to this
// module (see the note there). A rule applies the moment a
// matching element exists, however often YouTube rebuilds it: no node to
// insert and lose to incremental-dom, no observer, no retry. One textContent
// write per change, about once per video. The badge colour is written into
// the rule rather than a custom property, which Chromium 38 (webOS 3) has not
// got.
import { configRead } from '../../core/config.js';
import { createLogger } from '../../core/log.js';
import { formatTime } from '../../core/text.js';
import { SELECTORS } from '../../core/selectors.js';
import { CONFIG_MAPPING, categoryColor } from './constants.js';
import './labels.css';

const log = createLogger('SponsorBlock');

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
const BADGE_SELECTOR = `${SELECTORS.TITLE_TEXT}::before,${SELECTORS.TITLE_TEXT_TRAY}::before`;

const TIME_SELECTOR = `${SELECTORS.DURATION_LABEL}::after`;

/**
 * The categories a full-video label can name, as the label words them.
 *
 * exclusive_access is full-only, so it is not in segmentTypes: it has no skip
 * mode and no colour entry in config, and its colour is the literal in
 * badgeColor(). Adding it there would mint a colour picker and a mode control
 * for a category that can never be skipped.
 */
const FULL_LABELS = {
  sponsor: 'Sponsor',
  selfpromo: 'Self Promo',
  exclusive_access: 'Exclusive Access'
};

/** A quoted CSS string. Everything here is generated, but it lands in a stylesheet. */
function cssString(value) {
  const escaped = String(value)
    .replace(/[\\"]/g, '\\$&')
    .replace(/[\n\r]/g, ' ');
  return `"${escaped}"`;
}

/**
 * Readable foreground for an arbitrary user-chosen background.
 *
 * Segment colours are configurable and several defaults are light - selfpromo
 * is pure yellow. White-on-yellow is unreadable, so the text colour follows the
 * background's luminance rather than being fixed.
 */
function contrastColor(hex) {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(hex).trim());
  if (!m) return '#fff';
  // Three digits as categoryColor accepts them: each one doubled.
  const digits = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  const n = parseInt(digits, 16);
  // Rec. 709 luma, close enough for a two-way choice.
  const luma = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return luma > 0.6 ? '#000' : '#fff';
}

/** The badge colour: the category's (constants.js); exclusive_access has its own. */
function badgeColor(category) {
  return categoryColor(category, category === 'exclusive_access' ? '#008a5c' : '#777');
}

/** A segment the API returned as a whole-video label. */
export function isFullVideoSegment(segment) {
  return !!segment && segment.actionType === 'full';
}

/**
 * Total seconds removed by skipping, with overlaps counted once.
 *
 * What counts: every category the user has not switched off. Auto Skip and
 * Manual Skip segments come off because they will be skipped past; Show in
 * Seek Bar segments come off too, which is what was asked for. Disable means
 * the segment plays in full, so it stays in the running time.
 *
 * Why the merge: SponsorBlock regularly returns overlapping segments for the
 * same stretch of video - a sponsor read that is also tagged self-promo, for
 * instance - and summing the raw durations would subtract that stretch twice
 * and report a video shorter than it can possibly be.
 */
function skippableSeconds(segments, duration) {
  // The handler holds only well-formed segments: api.js drops the others.
  const ranges = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Only things that actually remove playback time. A muted segment is still
    // watched, a highlight is a point, and a full-video label is [0, 0].
    if (seg.actionType && seg.actionType !== 'skip') continue;
    if (seg.category === 'poi_highlight') continue;

    const modeKey = CONFIG_MAPPING[seg.category];
    if (modeKey && configRead(modeKey) === 'disable') continue;

    let start = seg.segment[0];
    let end = seg.segment[1];
    if (end <= start) continue;

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

/**
 * The category to show for a video that is entirely one category (sponsor first, by FULL_PRIORITY),
 * leaving out categories set to Disable; null when there is none.
 */
function pickFullLabel(segments) {
  const present = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!isFullVideoSegment(seg)) continue;

    // Respect a category the user switched off, so the badge cannot contradict
    // the rest of the SponsorBlock settings.
    const modeKey = CONFIG_MAPPING[seg.category];
    if (modeKey && configRead(modeKey) === 'disable') continue;

    present.push(seg.category);
  }
  if (present.length === 0) return null;

  for (let i = 0; i < FULL_PRIORITY.length; i++) {
    if (present.indexOf(FULL_PRIORITY[i]) !== -1) return FULL_PRIORITY[i];
  }
  return present[0];
}

/** Build the rules for the current state. Empty string means "show nothing". */
function buildCss(segments, duration) {
  let css = '';

  if (configRead('sbFullVideoLabel')) {
    const category = pickFullLabel(segments);
    if (category) {
      const background = badgeColor(category);
      const foreground = contrastColor(background);
      const label = FULL_LABELS[category] || category;
      css +=
        `${BADGE_SELECTOR}{content:${cssString(label)};` +
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
  /** No <style> element until there is something to write. */
  constructor() {
    this.styleEl = null;
    this.css = '';
  }

  /**
   * Puts `css` in the labels' <style> element (creating it when needed); unchanged CSS is not
   * written again.
   */
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
    log.debug('wrote', css);
  }

  /** Recomputes both readouts (the handler's updateLabels says when). */
  update(segments, duration) {
    this.write(buildCss(segments, duration));
  }

  /** Removes every label. */
  clear() {
    this.write('');
  }
}

export default new SponsorBlockLabels();
