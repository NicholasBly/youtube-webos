// Segment math, touching nothing but the handler's segment fields: which
// segments are skippable under the current settings, where the playhead is
// relative to them, and the end clamp. The chain at the start is chain.js.
import { configGetAll, segmentTypes } from '../../core/config.js';
import { capitalize } from '../../core/text.js';
import { CONFIG_MAPPING, TIMING } from './constants.js';

// A category has two names in the settings table: `name`, lower case, for
// the sentences of the toasts ("Skipped sponsored segment"), and `label`,
// title case, for the popup's list of segments.

/** The category's name inside a sentence. */
export function categoryName(category) {
  return segmentTypes[category]?.name || category;
}

/**
 * The toast after a skip, for the names of the categories skipped (repeats
 * dropped): "Skipped sponsored segment", "Skipped intro and sponsored
 * segment", "Skipped a, b, and c segment".
 */
export function skipMessage(names) {
  const unique = [];
  for (let i = 0; i < names.length; i++) {
    if (unique.indexOf(names[i]) === -1) unique.push(names[i]);
  }
  let list;
  if (unique.length === 1) list = unique[0];
  else if (unique.length === 2) list = `${unique[0]} and ${unique[1]}`;
  else list = `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
  return `Skipped ${list} segment`;
}

/** The category's label in a list. */
export function categoryLabel(category) {
  return segmentTypes[category]?.label || capitalize(category);
}

/**
 * Rebuilds `sb.skipSegments` from the API's segments and the settings: the
 * segments to act on, in start order, each with its mode (auto_skip,
 * manual_skip or mute) and its index in `sb.segments`.
 */
export function rebuildSkipSegments(sb) {
  sb.skipSegments = [];
  if (!sb.segments.length) return;

  const config = configGetAll();
  for (let i = 0; i < sb.segments.length; i++) {
    const seg = sb.segments[i];
    if (seg.category === 'poi_highlight') continue;

    const mode = config[CONFIG_MAPPING[seg.category]];
    if (!mode || mode === 'disable' || mode === 'seek_bar') continue;
    // A `mute` segment mutes the audio instead of being skipped, when the
    // setting allows it; the other action types (full-video labels) are not
    // segments to act on.
    let skipMode = mode;
    if (seg.actionType === 'mute') {
      if (!config.enableMutedSegments) continue;
      skipMode = 'mute';
    } else if (seg.actionType && seg.actionType !== 'skip') {
      continue;
    }

    sb.skipSegments.push({
      start: seg.segment[0],
      end: seg.segment[1],
      category: seg.category,
      categoryName: categoryName(seg.category),
      mode: skipMode,
      originalIndex: i
    });
  }
}

/**
 * Index of the segment `time` is in, or -1. Segments overlap (a self-promo
 * inside a sponsor, say), so this is a scan rather than a binary search, and
 * when several contain the time a manual one wins over an auto-skip one, which
 * wins over a muted one: a skip must stop at a manual segment, and a skip
 * takes a muted part with it.
 */
export function findSegmentAtTime(sb, time) {
  let found = -1;
  for (let i = 0; i < sb.skipSegments.length; i++) {
    const seg = sb.skipSegments[i];
    if (seg.start > time) break;
    if (time >= seg.end) continue;
    if (seg.mode === 'manual_skip') return i;
    if (found === -1 || (seg.mode === 'auto_skip' && sb.skipSegments[found].mode === 'mute')) {
      found = i;
    }
  }
  return found;
}

/** Index of the first segment starting at or after `time` (binary search on the sorted starts). */
export function findNextSegmentIndex(sb, time) {
  let left = 0;
  let right = sb.skipSegments.length - 1;
  let res = sb.skipSegments.length;

  while (left <= right) {
    const mid = (left + right) >>> 1;
    if (sb.skipSegments[mid].start >= time) {
      res = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return res;
}

/**
 * Clamps the segments to the video's duration, and short of it on the legacy
 * engines; true when anything moved, so the caller rebuilds the skip list.
 * The end always comes from the one the API gave (`apiEnd`, kept on the
 * first clamp), so a short duration reported first and the real one later
 * give the segment back its end.
 */
export function clampSegments(sb, duration) {
  if (!duration || isNaN(duration)) return false;

  let changed = false;
  for (const segment of sb.segments) {
    if (segment.apiEnd === undefined) segment.apiEnd = segment.segment[1];
    let end = Math.min(segment.apiEnd, duration);
    if (sb.legacy && end >= duration - TIMING.LEGACY_END_MARGIN) {
      end = Math.max(0, duration - TIMING.LEGACY_END_CLAMP);
    }
    if (segment.segment[1] !== end) {
      segment.segment[1] = end;
      changed = true;
    }
  }
  return changed;
}
