// Rewrites one thumbnail URL, and every URL in one thumbnail container, to the
// best rung the current mode may emit; schedules a probe when that is unproven.
import { PENDING_LIMIT, PENDING_ENTRIES_PER_VIDEO } from './constants.js';
import {
  QUALITY_NAMES,
  FLOOR_RANK,
  THUMB_URL_RE,
  buildUrl,
  drawsUnproven,
  rankOf
} from './ladder.js';
import { state, qualityCache, pendingEntries, provenFloor } from './state.js';
import { scheduleProbe } from './probes.js';

// Scratch for upgradeContainer: (entry, videoId, rank) triples, reused per call.
const MATCHED = [];

/**
 * Rewrites the matched entries `from` to `to` (triples, all of one video) to
 * the rung the mode may emit, and returns how many URLs changed. What the
 * video may get is decided once for all of them: a container holds one video,
 * usually more than once (the tile header and its long-press menu).
 *
 * The emitted rung is the useful one (sddefault in 'sd', else maxres). A
 * cached probe answer clamps it; for a video not probed yet the modes that
 * draw unproven rungs ('sd', 'eager') emit it as it is, and 'safe' clamps it
 * to `proven`, the best rung shipped in this response, with the better one
 * landing on a later parse. Either way a probe is scheduled when the useful
 * rung is unproven. Entry width/height are left alone; the app sizes tiles
 * from them.
 */
function upgradeVideo(matched, from, to, videoId, proven) {
  const verified = qualityCache.get(videoId);

  let ceiling = proven;
  const knownCeiling = verified !== undefined && verified > ceiling ? verified : ceiling;

  if (verified !== undefined) {
    // A verified answer is the truth for this video and outranks the mode:
    // drawing unproven rungs is a policy for the *unknown*, not a licence to
    // re-emit a rung already watched 404. scheduleProbe is gated on
    // `verified === undefined`, so a wrong answer here would never be revisited.
    ceiling = knownCeiling;
  } else if (drawsUnproven(state.qualityMode)) {
    ceiling = state.usefulRank;
  }

  // Every mode wants the best rung that exists up to its own cap; they differ
  // in whether an *unproven* rung may be rendered while we find out. Not
  // capped by slot width - that would land on hqdefault, matching the
  // ceiling, so nothing would ever want more than was already proven and no
  // probe would run.
  const useful = state.usefulRank;
  const best = useful > ceiling ? ceiling : useful;

  // Unresolved means a probe is coming and these entries' answer may still
  // change: upward in safe mode once the rung is confirmed, downward in the
  // modes that draw unproven rungs if the gamble missed. Both need the entries tracked so the answer can
  // be written back, even those whose URL stays as it was: the answer is
  // measured against the rung the tile was drawn at, and a miss must never
  // walk it below a rung this response already proved. (Every entry's rank is
  // at most `proven`, so whether it is unresolved does not depend on the entry.)
  let pending = null;
  if (verified === undefined && (useful > ceiling || best > knownCeiling)) {
    scheduleProbe(videoId);
    pending = pendingEntriesOf(videoId, knownCeiling);
  }

  let changed = 0;
  for (let i = from; i < to; i += 3) {
    const entry = matched[i];
    // Never worse than YouTube offered; at that rung the URL stays as sent,
    // its query and its vi_webp form included (the /vi/ JPEG of the same rung
    // is a new download), and no string is built for the common case.
    const keep = best <= matched[i + 2];
    // Each entry with the rung it is drawn at: the write-back leaves one
    // already at the answer as it is, for the same reason.
    if (pending && pending.length < PENDING_ENTRIES_PER_VIDEO * 2) {
      pending.push(entry, keep ? matched[i + 2] : best);
    }
    if (keep) continue;
    entry.url = buildUrl(videoId, QUALITY_NAMES[best]);
    changed++;
  }
  return changed;
}

/**
 * The entries of a video we gambled on, for the write-back (each followed by
 * the rung it is drawn at), with what the video is already known to support
 * recorded beside them; the list is capped
 * so a long session cannot grow it without bound. Eviction is safe: it only
 * costs that video the write-back, and the DOM sweep still covers it.
 */
function pendingEntriesOf(videoId, floor) {
  let entries = pendingEntries.get(videoId);
  if (!entries) {
    if (pendingEntries.size >= PENDING_LIMIT) {
      const oldest = pendingEntries.keys().next().value;
      pendingEntries.delete(oldest);
      provenFloor.delete(oldest);
    }
    entries = [];
    pendingEntries.set(videoId, entries);
  }
  // A correction can never walk an entry below this. Without it a maxres miss
  // on the watch page would drag an hq720 rung YouTube itself shipped down to
  // hqdefault.
  const known = provenFloor.get(videoId);
  if (known === undefined || floor > known) provenFloor.set(videoId, floor);
  return entries;
}

/**
 * Rewrite every URL in a thumbnail container in place. Handles both
 * `{ thumbnails: [...] }` (tileRenderer and friends) and `{ sources: [...] }`
 * (the newer *ViewModel schema).
 */
export function upgradeContainer(container) {
  if (!container) return 0;
  const list = container.thumbnails || container.sources;
  if (!Array.isArray(list) || list.length === 0) return 0;
  state.listsSeen++;
  state.containersSeen++;

  // One pass matches every URL and records (entry, videoId, rank), and finds
  // the highest rung YouTube itself put in this container. Anything it shipped
  // is an existence proof for that derivative, which is free verification: on
  // the watch page the response already carries hq720, so hq720 can be emitted
  // there without a probe and without any risk of a 404.
  let proven = FLOOR_RANK;
  const matched = MATCHED;
  // Whether every match is of one video, the usual case.
  let oneVideo = true;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const url = entry && entry.url;
    // Cheap rejection first: almost every string in a response is not a URL.
    if (typeof url !== 'string' || url.charCodeAt(0) !== 104 /* h */) continue;
    if (url.indexOf('i.ytimg.com/vi') === -1) continue;
    const m = THUMB_URL_RE.exec(url);
    if (!m) continue;
    const r = rankOf(m[2]);
    // Unknown basename: a Shorts crop, a storyboard, something new. There is
    // no safe mapping to a different name, so it stays as sent. (A thumbnail
    // test variant ranks below the floor: the video's own rung replaces it.)
    if (r === undefined) continue;
    if (r > proven) proven = r;
    if (matched.length > 0 && m[1] !== matched[1]) oneVideo = false;
    matched.push(entry, m[1], r);
  }

  let changed = 0;
  if (oneVideo) {
    if (matched.length > 0) changed = upgradeVideo(matched, 0, matched.length, matched[1], proven);
  } else {
    // Several videos in one container: each is held to the rungs shipped for
    // it, not for the others.
    for (let i = 0; i < matched.length; i += 3) {
      let own = FLOOR_RANK;
      for (let j = 1; j < matched.length; j += 3) {
        if (matched[j] === matched[i + 1] && matched[j + 1] > own) own = matched[j + 1];
      }
      changed += upgradeVideo(matched, i, i + 3, matched[i + 1], own);
    }
  }
  matched.length = 0;
  return changed;
}
