// Tuning constants for Max Thumbnail Quality.

// Verification budget. Probes are HEAD requests off screen and image loads on
// screen (or where a HEAD gives no answer), fired from an idle callback and
// never from the parse itself, so these bound background work only.
export const MAX_CONCURRENT_PROBES = 3;
// Ceiling on the distinct videos attempted in one session (probeAttempted); a
// video the verification cache evicts leaves the count and may be probed again.
export const PROBE_ATTEMPT_LIMIT = 4000;
// Verification waits this long after the last response before running. A
// continuation lands on every scroll, so this doubles as a scroll detector
// without needing a scroll listener: while the user is moving, probes stay
// parked and the network is left to the app.
export const PROBE_IDLE_DELAY = 1200;
// Remote arrow keys are the other scroll signal, and the only one for content
// that is already loaded: moving across rows that are in memory fetches no
// continuation, so the parse-based gate above never sees it. For this long
// after the last arrow press neither probes nor promotions run. A promotion
// writes a new background-image, which is a decode and a texture upload in the
// middle of the row animation - exactly the hitch this gate exists to remove.
// 350ms covers the key-repeat interval of the remote with margin.
export const NAV_PAUSE_MS = 350;
export const NAV_KEY_CODES = { 37: true, 38: true, 39: true, 40: true };
// Probes allowed past the idle gate on each parse: the first videos that
// parse queued, which is the top of the response, which is what is on screen.
// Sized to about one visible row so a grey tile is corrected in one probe
// round rather than after the whole backlog drains.
export const PROBE_URGENT_BURST = 4;
// Probes for tiles the app currently has rendered. These skip the idle gate
// outright: an on-screen tile is where the answer shows (a grey box in Fast
// mode, the soft floor in the others), and its image load is the one the
// promotion would make anyway.
export const PROBE_VISIBLE_BURST = 6;
// The rendered set only changes as fast as the user can scroll, and sampling it
// costs a document-wide selector match, so it is reused inside this window.
export const VISIBLE_SAMPLE_TTL = 250;
// Below this the queue drains in a round or two and which tiles are on screen
// cannot matter: no rendered sample is taken.
export const RENDERED_SAMPLE_MIN_QUEUE = 6;
export const PROBE_TIMEOUT = 5000;
// A missing derivative comes back as a tiny grey placeholder: a 404 (sddefault,
// maxres), for some videos a 200 (hqdefault).
export const PLACEHOLDER_MAX_BYTES = 5000;
// The same placeholder measured the other way: it decodes at 120x90.
export const PLACEHOLDER_MAX_WIDTH = 120;

export const PROMOTION_DEBOUNCE = 150;
// A correction whose tile is not on screen yet is retried rather than dropped.
export const PROMOTION_RETRY_DELAY = 900;
export const PROMOTION_MAX_ATTEMPTS = 5;
export const CACHE_KEY = 'ytaf-thumb-quality';
// Which ladder the stored answers were measured against (see resetVerification
// and loadCache), and the revision of what a stored answer may be. Stored
// beside the cache rather than inside it so the cache format, and the
// one-split parse of it, stay exactly as they were.
export const CACHE_CAP_KEY = 'ytaf-thumb-quality-cap';
// 2: a network error is no longer saved as a miss. Caches of an older revision
// may hold such misses, and are dropped once.
export const CACHE_REVISION = 2;
export const CACHE_LIMIT = 1200;
export const CACHE_SAVE_DEBOUNCE = 4000;
export const PENDING_LIMIT = 1500;
// The entries of one video kept for the write-back (each with its rung, so
// the list holds twice as many items): a tile carries its container twice
// (header and long-press menu), the rest is the same video again.
export const PENDING_ENTRIES_PER_VIDEO = 8;

// Bounds the fallback scan used when no schema path matched. A browse response
// is a few thousand nodes; anything past this is not a shelf we know about.
// Depth 16 reaches the thumbnail containers of the shapes seen so far, should
// one of them move off its path: a continuation's tile container sits at
// depth 13 (continuationContents > sectionListContinuation > contents > [] >
// shelfRenderer > content > horizontalListRenderer > items > [] > tileRenderer
// > header > tileHeaderRenderer > thumbnail), a playlist panel row two deeper.
// A home or browse-tab response is scanned from as far down its section-list
// path as it still goes (dispatch.js scanRoot): from the root its tiles sit
// deeper than this.
export const SCAN_MAX_NODES = 6000;
export const SCAN_MAX_DEPTH = 16;
// A response of an unknown shape is scanned only above this many characters
// of JSON text: the same threshold as adblock's fallback filters.
export const SCAN_MIN_TEXT_LENGTH = 10000;
