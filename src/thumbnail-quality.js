import { configRead, configAddChangeListener } from './config.js';

/**
 * Max Thumbnail Quality — InnerTube response rewriter.
 *
 * Replaces the old DOM pipeline (a subtree MutationObserver over <ytlr-app>, a
 * per-tile style observer, an IntersectionObserver, a request queue and three
 * HEAD probes per *visible* tile, followed by a backgroundImage overwrite) with
 * an in-place rewrite of the parsed JSON, run inside the JSON.parse hook
 * adblock.js already owns.
 *
 * Why this is cheaper:
 *   - One image fetch per thumbnail instead of two. The old path let the app
 *     download YouTube's 320x180 crop and *then* downloaded the upgrade on top
 *     of it. The app never sees the low-quality URL now, so it is never
 *     requested — on a 15-tile shelf that is 15 fewer image fetches.
 *   - No pop-in. The upgrade is not a second background layer that lands a few
 *     hundred ms later; it is the only URL the app has ever been given.
 *   - No observers. The old module kept three alive for the whole session and
 *     did O(N) getBoundingClientRect() work on the webOS 3 polling fallback.
 *   - Off-screen tiles are upgraded too, so scrolling a shelf no longer sets
 *     off a fresh burst of probes and swaps mid-scroll.
 *
 * The one thing the DOM had that JSON does not is a failure signal: a CSS
 * background can list a fallback layer, a JSON string cannot. maxresdefault
 * does not exist for every video, and YouTube answers a miss with a small grey
 * placeholder rather than a 404 (see PLACEHOLDER_MAX_BYTES). That is handled by
 * SPECULATIVE_MODE plus the verification queue below, not by guessing.
 */

const DEBUG = false;

/**
 * How far above the "known to exist" line the module is willing to reach.
 * Driven by the `thumbnailQualityMode` setting; see thumbnailQualityModes in
 * config.js for the user-facing wording.
 *
 *   'safe'  - never emit a rung unless YouTube shipped it in this very response
 *             or a probe confirmed it. A tile can never land on a 404.
 *   'eager' - go straight to maxresdefault. Sharpest first paint; videos with
 *             no maxres need the correction path below to recover.
 */
let eagerMode = configRead('thumbnailQualityMode') === 'eager';

/**
 * Emit WebP derivatives (~25-30% smaller) when the runtime can decode them.
 *
 * Off by default. The saving is real, but `vi_webp` coverage is per-video and
 * all-or-nothing: a video with no webp derivatives 404s on every rung, and
 * nothing in the response says which videos those are. With the JPEG floor
 * above, a miss now degrades to hqdefault.jpg instead of staying grey forever -
 * but the tile is still grey until the probe lands, and the no-webp population
 * is larger than the no-maxres one. Turn it on only if the bandwidth matters
 * more than a first-paint miss on older uploads.
 */
const USE_WEBP = false;

/** Patch already-rendered tiles when verification finds something better. */
const ENABLE_LIVE_PROMOTION = true;

// Verification budget. Probes are HEAD requests fired from an idle callback,
// never from the parse itself, so these bound background work only.
const MAX_CONCURRENT_PROBES = 3;
// Hard ceiling on how many *distinct* videos are ever probed in one session.
// Replaces the old queue-length cap, which dropped videos without recording
// anything — so every later parse re-queued the same ones and scrolling a shelf
// back and forth re-probed videos that had already been probed dozens of times.
const PROBE_ATTEMPT_LIMIT = 4000;
// Verification waits this long after the last response before running. A
// continuation lands on every scroll, so this doubles as a scroll detector
// without needing a scroll listener: while the user is moving, probes stay
// parked and the network is left to the app.
const PROBE_IDLE_DELAY = 1200;
// Probes allowed past the idle gate on each parse, taken from the head of the
// queue - i.e. the top of the response, i.e. what is on screen. Sized to about
// one visible row so a grey tile is corrected in one probe round rather than
// after the whole backlog drains.
const PROBE_URGENT_BURST = 4;
// Probes for tiles the app currently has rendered. These skip the idle gate
// outright: an on-screen grey box is the whole reason verification exists, and
// a HEAD is a few hundred bytes against an image request it is racing.
const PROBE_VISIBLE_BURST = 6;
// The rendered set only changes as fast as the user can scroll, and sampling it
// costs a document-wide selector match, so it is reused inside this window.
const VISIBLE_SAMPLE_TTL = 250;
// Below this the queue drains in a round or two and ordering cannot matter.
const VISIBILITY_SORT_MIN_QUEUE = 6;
const PROBE_TIMEOUT = 5000;
// A missing derivative comes back 200 OK with a tiny grey placeholder body.
const PLACEHOLDER_MAX_BYTES = 5000;
// The same placeholder measured the other way: it decodes at 120x90.
const PLACEHOLDER_MAX_WIDTH = 120;

const PROMOTION_DEBOUNCE = 150;
// A correction whose tile is not on screen yet is retried rather than dropped.
const PROMOTION_RETRY_DELAY = 900;
const PROMOTION_MAX_ATTEMPTS = 5;
const CACHE_KEY = 'ytaf-thumb-quality';
const CACHE_LIMIT = 1200;
const CACHE_SAVE_DEBOUNCE = 4000;
const PENDING_LIMIT = 1500;

// Bounds the fallback scan used when no schema path matched. A browse response
// is a few thousand nodes; anything past this is not a shelf we know about.
// Depth 16 is not arbitrary: a tile container sits at depth 13
// (continuationContents > sectionListContinuation > contents > [] >
// shelfRenderer > content > horizontalListRenderer > items > [] > tileRenderer
// > header > tileHeaderRenderer > thumbnail), and the playlistPanelVideoWrapper
// shape adds two more. A cap of 12 made this scan unable to rescue the exact
// shapes it exists to rescue.
const SCAN_MAX_NODES = 6000;
const SCAN_MAX_DEPTH = 16;

// --- Quality ladder -------------------------------------------------------
// Ordered worst to best; the index is the rank stored in the cache.
//   hqdefault     480x360   4:3, letterboxed — exists for every video ever
//   sddefault     640x480   4:3, letterboxed
//   hq720        1280x720   16:9 native crop
//   maxresdefault 1280x720+ 16:9, only when the source was >= 720p
const QUALITY_NAMES = ['default', 'mqdefault', 'hqdefault', 'sddefault', 'hq720', 'maxresdefault'];
const RANK = { default: 0, mqdefault: 1, hqdefault: 2, sddefault: 3, hq720: 4, maxresdefault: 5 };

/** The rung that is always present. Nothing is ever emitted below this. */
const FLOOR_RANK = RANK.hqdefault;

/** Rungs generated for every video ever uploaded. Above this needs proof. */
const GUARANTEED_RANK = RANK.hqdefault;

/**
 * A single rung, deliberately. maxresdefault and hq720 are both 1280x720 for
 * the overwhelming majority of uploads, so probing the second rung doubled
 * verification traffic to distinguish two files of identical size. A miss now
 * falls straight to the guaranteed floor.
 */
const PROBE_LADDER = [RANK.maxresdefault];

// Anchored so it cannot match mid-string, and `\w+` on the basename so
// A/B-test variants (hqdefault_custom_2) are captured and then rejected by the
// RANK lookup rather than being rewritten to a name that has no custom-variant
// equivalent.
const THUMB_URL_RE = /^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\/(\w+)\.(?:jpg|jpeg|webp|png)/;
const THUMB_IN_CSS_RE = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\//;

const DOM_SELECTOR = 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image';

// --- Runtime capability ---------------------------------------------------
// Synchronous, unlike the old Image-decode probe: the first browse response can
// arrive before an async detection settles, and a mid-session flip would emit
// two URL families for the same video and halve the HTTP cache hit rate.
const webpSupported = (() => {
  if (!USE_WEBP) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    return false;
  }
})();

// --- State ----------------------------------------------------------------
let enabled = !!configRead('upgradeThumbnails');

/** videoId -> verified rank. Survives navigation and restarts. */
const qualityCache = new Map();
/** Insertion-ordered probe backlog: videoId -> true. */
const probeQueue = new Map();
const inFlight = new Set();
/** Every videoId ever enqueued this session. Nothing is probed twice. */
const probeAttempted = new Set();
const pendingPromotions = new Map();
const promotionAttempts = new Map();
/**
 * videoId -> the thumbnail entry objects we wrote an unverified URL into.
 *
 * These are the very objects the app holds: JSON.parse handed it the same
 * references, and a virtualised list reads `.url` off them when a tile finally
 * scrolls into view, not at parse time. Keeping them means a correction can be
 * written back into the app's own model, so a tile that has not rendered yet
 * never gets the chance to be grey. The DOM sweep only has to cover tiles that
 * were already on screen when the probe landed - which is the half the old
 * one-shot sweep could see, and it threw the other half away.
 */
const pendingEntries = new Map();
/** videoId -> highest rank already known good, so corrections cannot regress. */
const provenFloor = new Map();

let activeProbes = 0;
let saveTimer = null;
let promoteTimer = null;
let probePump = null;
let probeTimer = null;
let lastParseAt = 0;
let urgentBudget = 0;
let visibleBudget = 0;
let visibleSample = null;
let visibleSampleAt = 0;

const idle =
  typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 500 })
    : (cb) => setTimeout(cb, 32);

function debugLog(...args) {
  if (DEBUG) console.info('[ThumbQuality]', ...args);
}

function capSet(map, key, value, limit) {
  if (map.size >= limit) map.delete(map.keys().next().value);
  map.set(key, value);
}

// --- Persistent cache -----------------------------------------------------
// Compact "id:rank,id:rank" rather than JSON: it parses with one split on
// startup and avoids the hooked JSON.stringify entirely.

function loadCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parts = raw.split(',');
    for (let i = 0; i < parts.length; i++) {
      const entry = parts[i];
      const sep = entry.lastIndexOf(':');
      if (sep < 1) continue;
      const rank = +entry.slice(sep + 1);
      if (rank >= 0 && rank < QUALITY_NAMES.length) qualityCache.set(entry.slice(0, sep), rank);
    }
    debugLog(`loaded ${qualityCache.size} cached qualities`);
  } catch {
    // Private mode / quota / storage disabled — the cache is an optimisation.
  }
}

function saveCache() {
  saveTimer = null;
  try {
    const out = [];
    // Map iteration is insertion-ordered, so dropping from the front evicts the
    // oldest entries.
    let skip = qualityCache.size - CACHE_LIMIT;
    qualityCache.forEach((rank, id) => {
      if (skip-- > 0) return;
      out.push(id + ':' + rank);
    });
    window.localStorage.setItem(CACHE_KEY, out.join(','));
  } catch {
    // Ignore.
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveCache, CACHE_SAVE_DEBOUNCE);
}

// --- URL rewriting --------------------------------------------------------

/**
 * Build a thumbnail URL.
 *
 * `forceJpeg` exists because the floor is only a floor in the `/vi/` family.
 * `hqdefault.jpg` is generated for every video ever uploaded; `vi_webp`
 * coverage is not universal, and a video with no webp derivatives at all 404s
 * on `hqdefault.webp` just as it does on `maxresdefault.webp`. Emitting a webp
 * fallback for a webp miss is a fallback to the same failure, which is why
 * those tiles stayed grey permanently instead of recovering.
 */
function buildUrl(videoId, name, forceJpeg) {
  return webpSupported && !forceJpeg
    ? 'https://i.ytimg.com/vi_webp/' + videoId + '/' + name + '.webp'
    : 'https://i.ytimg.com/vi/' + videoId + '/' + name + '.jpg';
}


/**
 * Resolve one thumbnail URL to its upgraded form, or null to leave it alone.
 *
 * Two independent questions, which the old code collapsed into one and got
 * wrong: how big a rung is *useful* here, and how big a rung is *safe* here.
 *
 *   useful  - from the width the app declares for the slot. A 320px tile gains
 *             nothing from a 1280px file it will throw 87% of away.
 *   safe    - the ceiling. hqdefault always exists; above that, a rung is only
 *             known to exist if YouTube shipped it in this very container
 *             (`proven`) or a probe confirmed it (`qualityCache`).
 *
 * The emitted rung is the useful one clamped to the safe one, so it can never
 * 404. When useful exceeds safe, a probe is scheduled and the better rung lands
 * on a later parse - the tile is correct in the meantime rather than grey.
 *
 * Width/height on the entry are still left untouched: the app uses them to pick
 * between rungs and to size the tile.
 */
function upgradeEntry(entry, proven) {
  const url = entry.url;
  // Cheap rejection first: almost every string in a response is not a URL.
  if (typeof url !== 'string' || url.charCodeAt(0) !== 104 /* h */) return null;
  if (url.indexOf('i.ytimg.com/vi') === -1) return null;

  const match = THUMB_URL_RE.exec(url);
  if (!match) return null;

  const videoId = match[1];
  const currentRank = RANK[match[2]];
  // Unknown basename: an A/B custom variant, a storyboard, something new. There
  // is no safe mapping to a different name, so leave it exactly as sent.
  if (currentRank === undefined) return null;

  const verified = qualityCache.get(videoId);

  let ceiling = proven === undefined ? GUARANTEED_RANK : proven;
  const ceilingBeforeMode = verified !== undefined && verified > ceiling ? verified : ceiling;

  if (verified !== undefined) {
    // A verified answer is the truth for this video and outranks the mode.
    // Eager is a policy for the *unknown*, not a licence to re-emit a URL we
    // have already watched 404 - and because the result is cached to
    // localStorage, doing that produced a grey tile that survived restarts and
    // had no way back: `scheduleProbe` is gated on `verified === undefined`, so
    // no probe ran, no correction was queued, and nothing ever revisited it.
    ceiling = ceilingBeforeMode;
  } else if (eagerMode) {
    ceiling = RANK.maxresdefault;
  }

  // Both modes want the same thing - the best rung that exists. What separates
  // them is only whether an *unproven* rung may be rendered while we find out.
  // This used to be capped by slot width in safe mode, which quietly turned the
  // feature off: the cap landed on hqdefault, the ceiling was also hqdefault, so
  // nothing ever wanted more than was already proven, no probe was scheduled,
  // and safe mode re-emitted roughly what YouTube had sent in the first place.
  const useful = RANK.maxresdefault;
  let target = useful > ceiling ? ceiling : useful;
  // Never hand back something worse than YouTube offered.
  if (target < currentRank) target = currentRank;

  // Unresolved means a probe is coming and this entry's answer may still change:
  // upward in safe mode once maxres is confirmed, downward in eager mode if the
  // gamble missed. Both need the entry tracked so the answer can be written back.
  const unresolved = verified === undefined && (useful > ceiling || target > ceilingBeforeMode);
  if (unresolved) scheduleProbe(videoId);

  // Above the guarantee we are relying on proof, and that proof is per-family:
  // a probe verifies the exact URL it fetched. At or below it we are relying on
  // hqdefault always existing, which is a `/vi/` guarantee only.
  const next = buildUrl(videoId, QUALITY_NAMES[target], target <= GUARANTEED_RANK);
  if (next === url) return 0;
  entry.url = next;
  if (unresolved) trackPending(videoId, entry, ceilingBeforeMode);
  return 1;
}

/**
 * Remember an entry we gambled on, capped so a long session cannot grow it
 * without bound. Eviction is safe: it only costs that entry the write-back, and
 * the DOM sweep still covers it.
 */
function trackPending(videoId, entry, floor) {
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
  // What this video is already known to support, so a correction can never walk
  // an entry below it. Without this a maxres miss on the watch page would drag
  // an hq720 rung YouTube itself shipped down to hqdefault.
  const known = provenFloor.get(videoId);
  if (known === undefined || floor > known) provenFloor.set(videoId, floor);
  if (entries.length < 8) entries.push(entry);
}

/**
 * Rewrite every URL in a thumbnail container in place. Handles both
 * `{ thumbnails: [...] }` (tileRenderer and friends) and `{ sources: [...] }`
 * (the newer *ViewModel schema).
 */
function upgradeContainer(container) {
  if (!container) return 0;
  const list = container.thumbnails || container.sources;
  if (!Array.isArray(list) || list.length === 0) return 0;

  // The highest rung YouTube itself put in this container. Anything it shipped
  // is an existence proof for that derivative, which is free verification: on
  // the watch page the response already carries hq720, so hq720 can be emitted
  // there without a probe and without any risk of a 404.
  let proven = GUARANTEED_RANK;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry || typeof entry.url !== 'string') continue;
    const m = THUMB_URL_RE.exec(entry.url);
    const r = m ? RANK[m[2]] : undefined;
    if (r !== undefined && r > proven) proven = r;
  }

  let changed = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;
    if (typeof entry.url !== 'string') continue;
    changed += upgradeEntry(entry, proven);
  }
  return changed;
}

// --- Item-level paths -----------------------------------------------------
// Everything below is O(1) per item: no recursion, no searching. These are the
// shapes seen in real home / continuation / watch responses, plus the legacy
// renderers kept as cheap insurance.

function upgradeItem(item) {
  if (!item || typeof item !== 'object') return 0;
  let changed = 0;

  // A watch-page playlist row wraps the tile one level deeper.
  const tile = item.tileRenderer || item.playlistPanelVideoWrapperRenderer?.primaryRenderer?.tileRenderer;

  if (tile) {
    const header = tile.header?.tileHeaderRenderer;
    changed += upgradeContainer(header?.thumbnail);
    changed += upgradeContainer(header?.thumbnailViewModel?.image);
    // The long-press menu carries its own copy of the same URL. Rewriting it
    // too keeps both pointing at one file, so opening the menu is an HTTP cache
    // hit instead of a fresh download of the original 320x180.
    changed += upgradeContainer(tile.onLongPressCommand?.showMenuCommand?.thumbnail);
    return changed;
  }

  changed += upgradeContainer(item.previewButtonRenderer?.thumbnail);
  changed += upgradeContainer(item.pivotVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.lockupViewModel?.contentImage?.thumbnailViewModel?.image);
  // Legacy renderers — not produced by current tvhtml5 builds, but free.
  changed += upgradeContainer(item.gridVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.compactVideoRenderer?.thumbnail);
  changed += upgradeContainer(item.videoRenderer?.thumbnail);
  return changed;
}

function upgradeItems(items) {
  if (!Array.isArray(items)) return 0;
  let changed = 0;
  for (let i = 0; i < items.length; i++) changed += upgradeItem(items[i]);
  return changed;
}

function upgradeSectionList(contents) {
  if (!Array.isArray(contents)) return 0;
  let changed = 0;

  for (let i = 0; i < contents.length; i++) {
    const section = contents[i];
    if (!section) continue;

    const shelf = section.shelfRenderer;
    if (shelf) {
      const content = shelf.content;
      if (content) {
        changed += upgradeItems(content.horizontalListRenderer?.items);
        changed += upgradeItems(content.gridRenderer?.items);
        changed += upgradeItems(content.expandedShelfContentsRenderer?.items);
      }
      continue;
    }

    if (section.gridRenderer) {
      changed += upgradeItems(section.gridRenderer.items);
      continue;
    }
    if (section.horizontalListRenderer) {
      changed += upgradeItems(section.horizontalListRenderer.items);
      continue;
    }
    // Search interleaves bare items among the shelves.
    changed += upgradeItem(section);
  }
  return changed;
}

function getByPath(obj, parts) {
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

// --- Response-type dispatch ----------------------------------------------
// Paths mirror SCHEMA_REGISTRY in adblock.js so both engines agree on where a
// given response keeps its content.

const P = {
  HOME: ['contents', 'tvBrowseRenderer', 'content', 'tvSurfaceContentRenderer', 'content', 'sectionListRenderer', 'contents'],
  TABS: ['contents', 'tvBrowseRenderer', 'content', 'tvSecondaryNavRenderer', 'sections'],
  SEARCH: ['contents', 'sectionListRenderer', 'contents'],
  CONT_SECTION: ['continuationContents', 'sectionListContinuation', 'contents'],
  CONT_TVSURFACE: ['continuationContents', 'tvSurfaceContentContinuation', 'content', 'sectionListRenderer', 'contents'],
  CONT_GRID: ['continuationContents', 'gridContinuation', 'items'],
  CONT_HORIZ: ['continuationContents', 'horizontalListContinuation', 'items'],
  PIVOT: ['contents', 'singleColumnWatchNextResults', 'pivot', 'sectionListRenderer', 'contents'],
  AUTOPLAY: ['contents', 'singleColumnWatchNextResults', 'autoplay', 'autoplay'],
  REPLAY_BG: ['playerOverlays', 'playerOverlayRenderer', 'replay', 'playerOverlayReplayRenderer', 'background'],
  CURRENT_THUMB: ['currentVideoThumbnail'],
  MICROFORMAT: ['microformat', 'playerMicroformatRenderer', 'thumbnail'],
  VIDEO_DETAILS: ['videoDetails', 'thumbnail']
};

function upgradeAutoplaySets(sets) {
  if (!Array.isArray(sets)) return 0;
  let changed = 0;
  for (let i = 0; i < sets.length; i++) {
    const item =
      sets[i]?.nextVideoRenderer?.autoplayVideoWrapperRenderer?.primaryEndpointRenderer?.autoplayEndpointRenderer?.item;
    if (item) changed += upgradeItem(item);
  }
  return changed;
}

function upgradeAutoplay(autoplay) {
  if (!autoplay) return 0;
  let changed = 0;
  changed += upgradeAutoplaySets(autoplay.sets);
  changed += upgradeAutoplaySets(autoplay.modifiedSets);
  changed += upgradeContainer(autoplay.replayVideoRenderer?.pivotVideoRenderer?.thumbnail);
  return changed;
}

function upgradeBrowseTabs(sections) {
  if (!Array.isArray(sections)) return 0;
  let changed = 0;
  for (let i = 0; i < sections.length; i++) {
    const tabs = sections[i]?.tvSecondaryNavSectionRenderer?.tabs;
    if (!Array.isArray(tabs)) continue;
    for (let j = 0; j < tabs.length; j++) {
      const content = tabs[j]?.tabRenderer?.content;
      if (!content) continue;
      changed += upgradeSectionList(content.sectionListRenderer?.contents);
      changed += upgradeSectionList(content.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents);
    }
  }
  return changed;
}

function upgradeActions(actions) {
  if (!Array.isArray(actions)) return 0;
  let changed = 0;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    if (!action) continue;
    changed += upgradeItems(action.reloadContinuationItemsCommand?.continuationItems);
    changed += upgradeItems(action.appendContinuationItemsAction?.continuationItems);
  }
  return changed;
}

/**
 * Continuation payloads, in all four shapes.
 *
 * Called for every response rather than only for responseType 'CONTINUATION',
 * because a continuation is not always classified as one. A shelf continuation
 * under the playing video arrives with `contents.singleColumnWatchNextResults`
 * still attached, and detectResponseType() checks NEXT before CONTINUATION — so
 * the response is typed NEXT while every thumbnail in it lives under
 * `continuationContents.sectionListContinuation`.
 */
function upgradeContinuation(data) {
  let changed = 0;
  changed += upgradeSectionList(getByPath(data, P.CONT_SECTION));
  changed += upgradeSectionList(getByPath(data, P.CONT_TVSURFACE));
  changed += upgradeItems(getByPath(data, P.CONT_GRID));
  changed += upgradeItems(getByPath(data, P.CONT_HORIZ));
  return changed;
}

/**
 * Last-resort bounded walk, used only when the schema paths produced nothing.
 * Keeps the module working through an InnerTube reshuffle instead of silently
 * doing nothing, without ever putting a full traversal on the hot path.
 */
function scanForThumbnails(root) {
  if (!root || typeof root !== 'object') return 0;
  const queue = [root, 0];
  let index = 0;
  let visited = 0;
  let changed = 0;

  while (index < queue.length) {
    if (++visited > SCAN_MAX_NODES) break;
    const node = queue[index++];
    const depth = queue[index++];
    if (!node || typeof node !== 'object' || depth > SCAN_MAX_DEPTH) continue;

    if (Array.isArray(node.thumbnails) || Array.isArray(node.sources)) changed += upgradeContainer(node);

    const nextDepth = depth + 1;
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') queue.push(value, nextDepth);
    }
  }
  if (DEBUG && changed) debugLog(`fallback scan upgraded ${changed} (visited ${visited})`);
  return changed;
}

/**
 * Entry point called from adblock.js's JSON.parse hook. `responseType` is the
 * type adblock already detected, so this costs no extra detection pass.
 */
export function upgradeResponseThumbnails(data, responseType) {
  if (!enabled || !data || typeof data !== 'object' || Array.isArray(data)) return 0;

  // Stamped on every parse, including ones that rewrite nothing: an empty
  // continuation is still evidence the surface is moving. drainProbes() reads
  // this to decide whether the app has gone quiet, so without it the whole
  // scroll gate is inert and probes drain straight into an active scroll.
  lastParseAt = Date.now();

  // Checked before the switch: any response type can carry a continuation
  // alongside its own contents, and the type it gets classified as depends on
  // whichever signature detectResponseType() happens to test first.
  let changed = data.continuationContents ? upgradeContinuation(data) : 0;

  switch (responseType) {
    case 'HOME_BROWSE':
      changed += upgradeSectionList(getByPath(data, P.HOME));
      break;
    case 'BROWSE_TABS':
      changed += upgradeBrowseTabs(getByPath(data, P.TABS));
      break;
    case 'SEARCH':
      changed += upgradeSectionList(getByPath(data, P.SEARCH));
      break;
    case 'CONTINUATION':
      // Already handled above.
      break;
    case 'SHORTS_SEQUENCE':
      changed += upgradeItems(data.entries);
      break;
    case 'ACTION':
      changed += upgradeActions(data.onResponseReceivedActions || data.onResponseReceivedEndpoints);
      break;
    case 'NEXT':
      changed += upgradeSectionList(getByPath(data, P.PIVOT));
      changed += upgradeAutoplay(getByPath(data, P.AUTOPLAY));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      changed += upgradeContainer(getByPath(data, P.CURRENT_THUMB));
      break;
    case 'PLAYER':
      changed += upgradeContainer(getByPath(data, P.VIDEO_DETAILS));
      changed += upgradeContainer(getByPath(data, P.MICROFORMAT));
      changed += upgradeContainer(getByPath(data, P.REPLAY_BG));
      break;
    default:
      changed += scanForThumbnails(data);
      if (changed) deferProbes();
      return changed;
  }

  // A known response type that yielded nothing means the shape moved.
  if (changed === 0) changed += scanForThumbnails(data);

  if (DEBUG && changed) debugLog(`${responseType}: rewrote ${changed} thumbnail URLs`);
  if (changed) deferProbes();
  // Scrolling is what brings a stale tile on screen, and scrolling is what
  // produces parses - so this is the cheapest possible trigger for a retry.
  if (pendingPromotions.size > 0 && !promoteTimer) {
    promoteTimer = setTimeout(runPromotionSweep, PROMOTION_DEBOUNCE);
  }
  return changed;
}

/** Whether adblock.js needs to keep its JSON.parse hook installed for us. */
export function thumbnailHookRequired() {
  return enabled;
}

// --- Verification ---------------------------------------------------------

function headExists(url) {
  return new Promise((resolve) => {
    let xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('HEAD', url, true);
    } catch {
      resolve(false);
      return;
    }
    xhr.timeout = PROBE_TIMEOUT;
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return resolve(false);
      const length = parseInt(xhr.getResponseHeader('Content-Length'), 10);
      // A grey placeholder answers 200 with a tiny body; treat it as missing.
      resolve(isNaN(length) ? true : length > PLACEHOLDER_MAX_BYTES);
    };
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.onabort = () => resolve(false);
    try {
      xhr.send();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Verify by loading the image rather than asking about it.
 *
 * Used for tiles the app has already rendered, where it costs nothing: the
 * browser has been to that URL, so this resolves out of the cache - including
 * the cached 404 that made the tile grey in the first place. It also sidesteps
 * the one real fragility of the HEAD path, which is that XHR is subject to CORS
 * and a cross-origin 404 from i.ytimg.com need not carry the headers to let us
 * read it. An <img> has no such constraint: `error` fires regardless of origin.
 *
 * This is the same signal the network hooks were being asked for, taken at the
 * layer that actually has it - a CSS background-image load never passes through
 * fetch or XMLHttpRequest, so no amount of hooking those would ever see it.
 */
function imageExists(url) {
  return new Promise((resolve) => {
    let img;
    try {
      img = new Image();
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    // A missing derivative can also come back 200 with a grey placeholder, which
    // loads fine and has to be caught on its dimensions instead.
    img.onload = () => finish(img.naturalWidth > PLACEHOLDER_MAX_WIDTH);
    img.onerror = () => finish(false);
    setTimeout(() => finish(false), PROBE_TIMEOUT);
    img.src = url;
  });
}

function scheduleProbe(videoId) {
  if (!enabled) return;
  if (qualityCache.has(videoId)) return;
  // One attempt per video per session, whatever the outcome. A video that was
  // enqueued and never reached, or probed and failed, must not come back: the
  // same tiles stream past on every scroll, and re-queueing them was what
  // turned a settled surface into a permanent trickle of requests.
  if (probeAttempted.has(videoId)) return;
  if (probeAttempted.size >= PROBE_ATTEMPT_LIMIT) return;
  probeAttempted.add(videoId);
  probeQueue.set(videoId, true);
}

/** Walk the ladder high-to-low, stopping at the first rung that exists. */
async function resolveQuality(videoId, onScreen) {
  // On screen: the browser already holds the answer, so ask it. Off screen: a
  // HEAD, because an <img> there would pull down a full image nobody is looking
  // at - the correction path only has to be exact for tiles that are visible.
  const check = onScreen ? imageExists : headExists;
  for (let i = 0; i < PROBE_LADDER.length; i++) {
    const rank = PROBE_LADDER[i];
    if (await check(buildUrl(videoId, QUALITY_NAMES[rank]))) return rank;
    if (!enabled) break;
  }
  return FLOOR_RANK;
}

/** Rewrite the entries we gambled on now that the answer is known. */
function applyCorrection(videoId, rank) {
  const entries = pendingEntries.get(videoId);
  if (!entries) return;
  pendingEntries.delete(videoId);
  const url = buildUrl(videoId, QUALITY_NAMES[rank], rank <= GUARANTEED_RANK);
  for (let i = 0; i < entries.length; i++) {
    if (entries[i] && entries[i].url !== url) entries[i].url = url;
  }
}

/** Resolved rank clamped to what the video was already known to support. */
function settledRank(videoId, resolved) {
  const floor = provenFloor.get(videoId);
  provenFloor.delete(videoId);
  return floor !== undefined && floor > resolved ? floor : resolved;
}

function onProbeDone(videoId, rank) {
  inFlight.delete(videoId);
  // Correcting a tile changes what is on screen, so the cached sample is stale.
  visibleSample = null;
  activeProbes--;

  // A network error is cached as the floor rather than left blank. An unknown
  // video is re-scheduled by the next parse that mentions it, and on a surface
  // where the same tiles scroll past repeatedly that is an endless retry loop.
  const resolved = typeof rank === 'number' ? rank : FLOOR_RANK;
  capSet(qualityCache, videoId, resolved, CACHE_LIMIT);
  scheduleSave();

  // Queued unconditionally. This used to be gated on a separate `emittedRank`
  // map recording what had been written for the video, but that map was FIFO
  // capped at 600 entries: on a long browse the entry was evicted before its
  // probe landed, `alreadyEmitted` came back undefined, and the promotion was
  // dropped on the floor. That is why a tile could sit grey indefinitely.
  // The sweep already skips elements that are on the right URL, so letting it
  // decide is both cheaper and impossible to lose.
  // 1. Write the truth back into the response objects the app still holds. A
  //    tile that has not scrolled into view yet reads `.url` at render time, so
  //    this corrects it before it is ever drawn - no grey frame at all.
  const settled = settledRank(videoId, resolved);
  applyCorrection(videoId, settled);

  // 2. Queue a DOM sweep for tiles that were already on screen.
  if (ENABLE_LIVE_PROMOTION) {
    pendingPromotions.set(videoId, settled);
    if (!promoteTimer) promoteTimer = setTimeout(runPromotionSweep, PROMOTION_DEBOUNCE);
  }

  drainProbes();
}

/**
 * Called from the parse. The head of the queue is the top of the response,
 * which is what the user is looking at right now, so a small burst is allowed
 * through immediately: a grey tile on screen costs more than a few hundred
 * bytes of contention. The tail still waits for the surface to settle.
 */
function deferProbes() {
  if (!enabled || probeQueue.size === 0) return;
  urgentBudget = PROBE_URGENT_BURST;
  visibleBudget = PROBE_VISIBLE_BURST;
  drainProbes();
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY);
}

/**
 * videoIds the app currently has thumbnails rendered for.
 *
 * This is the visibility signal, and it is free. The list is virtualised - that
 * is why an off-screen shelf is a <ytlr-ghost-surface> of skeleton boxes rather
 * than real tiles - so "has a rendered thumbnail element" already means "on or
 * near screen". The app has done the intersection work; we only have to read
 * the result.
 *
 * Deliberately not IntersectionObserver. That would need the elements first,
 * which means a MutationObserver to catch them being created - the pipeline
 * this module exists to remove - and on webOS 3 the polyfill is a poll that
 * calls getBoundingClientRect() on every observed node, forcing layout each
 * tick. Reading `.style.backgroundImage` parses the style attribute instead and
 * touches no layout at all, so this is one selector match and N string reads
 * against several hundred forced reflows a second.
 */
function sampleRenderedIds() {
  const now = Date.now();
  if (visibleSample && now - visibleSampleAt < VISIBLE_SAMPLE_TTL) return visibleSample;

  let nodes;
  try {
    nodes = document.querySelectorAll(DOM_SELECTOR);
  } catch {
    return null;
  }

  const ids = new Set();
  for (let i = 0; i < nodes.length; i++) {
    const background = nodes[i].style && nodes[i].style.backgroundImage;
    if (!background) continue;
    const match = THUMB_IN_CSS_RE.exec(background);
    if (match) ids.add(match[1]);
  }
  // Scrolling new tiles into view is itself a grant of budget. Without this the
  // allowance only refilled on a parse, so scrolling through already-loaded
  // content - which fetches nothing - left on-screen grey boxes waiting behind
  // the idle gate with a full queue in front of them.
  if (visibleSample === null || !sameIds(visibleSample, ids)) {
    visibleBudget = PROBE_VISIBLE_BURST;
  }

  visibleSample = ids;
  visibleSampleAt = now;
  return ids;
}

function sameIds(a, b) {
  if (a.size !== b.size) return false;
  const iterator = a.values();
  let step = iterator.next();
  while (!step.done) {
    if (!b.has(step.value)) return false;
    step = iterator.next();
  }
  return true;
}

/** First queued id that is on screen, else the head of the queue. */
function nextProbeId(rendered) {
  if (rendered && rendered.size > 0) {
    const iterator = probeQueue.keys();
    let step = iterator.next();
    while (!step.done) {
      if (rendered.has(step.value)) return step.value;
      step = iterator.next();
    }
  }
  return probeQueue.keys().next().value;
}

function drainProbes() {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  if (!enabled || probePump || probeQueue.size === 0) return;

  probePump = idle(() => {
    probePump = null;
    if (!enabled || document.hidden) return;

    // Document order is a decent proxy for visibility at first paint and a poor
    // one afterwards: scroll far enough and the tiles on screen sit behind a
    // few hundred earlier entries, which at three concurrent probes is minutes
    // of waiting for a correction the user is looking at right now.
    const rendered = probeQueue.size >= VISIBILITY_SORT_MIN_QUEUE ? sampleRenderedIds() : null;

    while (activeProbes < MAX_CONCURRENT_PROBES && probeQueue.size > 0) {
      const videoId = nextProbeId(rendered);
      const onScreen = rendered ? rendered.has(videoId) : false;

      // Two tiers, which is the debounce split expressed through the gate that
      // is already here: on-screen work goes now, everything else waits for the
      // surface to settle so it never competes with an active scroll.
      if (onScreen) {
        if (visibleBudget <= 0) break;
        visibleBudget--;
      } else if (urgentBudget > 0) {
        urgentBudget--;
      } else if (Date.now() - lastParseAt < PROBE_IDLE_DELAY) {
        break;
      }

      probeQueue.delete(videoId);
      if (qualityCache.has(videoId)) continue;

      inFlight.add(videoId);
      activeProbes++;
      resolveQuality(videoId, onScreen).then(
        (rank) => onProbeDone(videoId, rank),
        () => onProbeDone(videoId, null)
      );
    }

    // Whatever the gate held back gets picked up once the surface goes quiet.
    if (probeQueue.size > 0 && !probeTimer) probeTimer = setTimeout(drainProbes, PROBE_IDLE_DELAY);
  });
}

// --- Live promotion -------------------------------------------------------
// Only runs when verification disagrees with what was already emitted, which
// after the first session is rare. Batched into one sweep so N corrections cost
// one querySelectorAll, not N.

function runPromotionSweep() {
  promoteTimer = null;
  if (!enabled || pendingPromotions.size === 0) return;
  if (document.hidden) {
    pendingPromotions.clear();
    return;
  }

  let nodes;
  try {
    nodes = document.querySelectorAll(DOM_SELECTOR);
  } catch {
    pendingPromotions.clear();
    return;
  }

  const applied = new Set();
  let patched = 0;
  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i];
    const background = element.style && element.style.backgroundImage;
    if (!background) continue;

    const match = THUMB_IN_CSS_RE.exec(background);
    if (!match) continue;

    const rank = pendingPromotions.get(match[1]);
    if (rank === undefined) continue;

    const next = buildUrl(match[1], QUALITY_NAMES[rank], rank === FLOOR_RANK);
    if (background.indexOf(next) !== -1) continue;

    // Layered, not replaced: the current image stays visible underneath until
    // the new one has decoded, so a promotion never flashes an empty tile.
    element.style.backgroundImage = 'url("' + next + '"), ' + background;
    applied.add(match[1]);
    patched++;
  }

  // A correction is NOT discarded just because this sweep did not find a home
  // for it. The list is virtualised: at the moment a probe lands, the tile it
  // describes is very often not in the DOM at all, and the old code cleared the
  // map right here - so the correction was thrown away and the tile stayed grey
  // for good once it finally scrolled into view. Entries now survive a few
  // rounds, re-armed by the next parse, and expire so the map cannot grow.
  pendingPromotions.forEach((rank, videoId) => {
    const attempts = (promotionAttempts.get(videoId) || 0) + 1;
    if (attempts >= PROMOTION_MAX_ATTEMPTS || applied.has(videoId)) {
      pendingPromotions.delete(videoId);
      promotionAttempts.delete(videoId);
    } else {
      promotionAttempts.set(videoId, attempts);
    }
  });
  if (pendingPromotions.size > 0 && !promoteTimer) {
    promoteTimer = setTimeout(runPromotionSweep, PROMOTION_RETRY_DELAY);
  }
  if (DEBUG && patched) debugLog(`promotion sweep patched ${patched} tiles`);
}

// --- Lifecycle ------------------------------------------------------------

function handleVisibilityChange() {
  if (document.hidden) {
    // webOS does not reliably fire pagehide when the app is closed from the
    // launcher, so backgrounding is the last dependable moment to persist.
    flushCache();
  } else {
    deferProbes();
  }
}

function flushCache() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveCache();
  }
}

export function cleanup() {
  probeQueue.clear();
  visibleSample = null;
  visibleBudget = 0;
  pendingEntries.clear();
  provenFloor.clear();
  promotionAttempts.clear();
  urgentBudget = 0;
  probeAttempted.clear();
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  pendingPromotions.clear();
  if (promoteTimer) {
    clearTimeout(promoteTimer);
    promoteTimer = null;
  }
  flushCache();
  // In-flight probes are left to settle on their own; their results are still
  // worth caching, and the sweep is a no-op once disabled.
}

if (enabled) loadCache();
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', flushCache);

configAddChangeListener('thumbnailQualityMode', (evt) => {
  eagerMode = evt.detail.newValue === 'eager';
});

configAddChangeListener('upgradeThumbnails', (evt) => {
  enabled = !!evt.detail.newValue;
  if (enabled) loadCache();
  else cleanup();
});