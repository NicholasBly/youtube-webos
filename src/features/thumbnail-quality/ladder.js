// The thumbnail quality ladder: the rungs YouTube serves, which of them a mode
// may reach for, and how a thumbnail URL is built and recognised.

// --- Quality ladder -------------------------------------------------------
// Ordered worst to best; the index is the rank stored in the cache.
//   hqdefault     480x360   4:3, letterboxed — exists for every video ever
//   sddefault     640x480   4:3, letterboxed
//   hq720        1280x720   16:9 native crop
//   maxresdefault 1280x720+ 16:9, only when the source was >= 720p
export const QUALITY_NAMES = [
  'default',
  'mqdefault',
  'hqdefault',
  'sddefault',
  'hq720',
  'maxresdefault'
];
export const RANK = {
  default: 0,
  mqdefault: 1,
  hqdefault: 2,
  sddefault: 3,
  hq720: 4,
  maxresdefault: 5
};

/**
 * The rung generated for every video ever uploaded. Nothing is ever emitted
 * below it, and nothing above it is trusted without proof.
 */
export const FLOOR_RANK = RANK.hqdefault;

/**
 * The best rung the current mode will emit or probe for. A single rung,
 * deliberately: maxresdefault and hq720 are both 1280x720 for the overwhelming
 * majority of uploads, so probing a second rung doubled verification traffic to
 * distinguish two files of identical size. A miss falls straight to the
 * guaranteed floor. In 'sd' mode the rung is sddefault instead.
 */
export function usefulRankFor(mode) {
  return mode === 'sd' ? RANK.sddefault : RANK.maxresdefault;
}

/**
 * Whether the mode draws its rung before any proof and corrects a miss
 * afterwards ('sd' and 'eager'), or draws only what is known to exist and
 * waits for the probe ('safe'). sddefault exists for nearly every video and
 * maxres for most, so a miss is rare; waiting showed every new tile at the
 * rung YouTube listed (hqdefault) and swapped it a few hundred ms later.
 */
export function drawsUnproven(mode) {
  return mode !== 'safe';
}

// Anchored so it cannot match mid-string, and `\w+` on the basename so a
// name the ladder does not know is captured and then left alone (rankOf), and
// a thumbnail test variant (hqdefault_custom_2) is captured and ranked below
// the floor. The `vi_webp` family is recognised but never emitted: its
// coverage is per video and nothing in a response says which videos have it.
export const THUMB_URL_RE =
  /^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\/(\w+)\.(?:jpg|jpeg|webp|png)/;
export const THUMB_IN_CSS_RE = /i\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\//;

// A thumbnail test variant ("Test & Compare": hqdefault_custom_1 to _3) is
// served only at the small signed size the response names (320x180): the name
// unsigned, and every larger rung of it, is a 404. Ranked below the floor, so
// the video's own rung replaces it.
const TEST_VARIANT_RE = /^([a-z\d]+)_custom_\d+$/;

/** The rank of a thumbnail basename; undefined for a name the ladder cannot map. */
export function rankOf(name) {
  const rank = RANK[name];
  if (rank !== undefined) return rank;
  const variant = TEST_VARIANT_RE.exec(name);
  return variant && RANK[variant[1]] !== undefined ? RANK.mqdefault : undefined;
}

/** The `/vi/` JPEG URL of one rung; hqdefault.jpg exists for every video. */
export function buildUrl(videoId, name) {
  return 'https://i.ytimg.com/vi/' + videoId + '/' + name + '.jpg';
}
