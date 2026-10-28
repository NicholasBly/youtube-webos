/**
 * Official YouTube "AI" label lookup.
 *
 * The TV client's list data never carries the label; only the WEB watch page
 * (`/youtubei/v1/next`) exposes it, as a `metadataBadgeRenderer` with icon
 * `INFO` and the English label `AI` in `videoPrimaryInfoRenderer.badges`. The
 * lookup is pinned to `hl: "en"` so the answer does not depend on the TV UI
 * language. Nothing here guesses from titles, descriptions, channels or images.
 *
 * Results: { status: 'ai' | 'not_ai' | 'unknown', expiresAt: number }.
 * `unknown` means "could not tell" and must never be treated as "not AI".
 *
 * Deliberately timer-free: the 5 s limit is XHR.timeout and every expiry is a
 * Date.now() comparison, so there is nothing to leak or to cancel.
 */

const VIDEO_ID_RE = /^[\w-]{11}$/;

const MAX_ACTIVE = 2;
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_MAX = 1000;
const RESULT_TTL_MS = 3600000;
const UNKNOWN_TTL_MS = 60000;
const RATE_LIMIT_PAUSE_MS = 60000;

const FIELDS =
  'contents.twoColumnWatchNextResults.results.results.contents.videoPrimaryInfoRenderer.badges';
const REQUEST_URL = '/youtubei/v1/next?prettyPrint=false&fields=' + encodeURIComponent(FIELDS);

// Insertion order is recency order: a read re-inserts the entry.
const cache = new Map();
// videoId -> { id, promise, resolve, xhr, started, done }
const pending = new Map();
let queue = [];
let active = 0;
let generation = 0;
let pausedUntil = 0;

function unknownResult(expiresAt) {
  return { status: 'unknown', expiresAt };
}

function remember(id, result) {
  cache.delete(id);
  cache.set(id, result);
  while (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * ai / not_ai / unknown from a parsed `next` response. Only the exact
 * INFO + "AI" pair counts; a bare INFO icon, any other label and the absence
 * of badges are not an AI label. `not_ai` additionally requires that the
 * response did contain the primary-info block, so an unexpected shape stays
 * `unknown` instead of reading as a negative answer.
 */
function classify(data) {
  const contents = data && data.contents && data.contents.twoColumnWatchNextResults &&
    data.contents.twoColumnWatchNextResults.results &&
    data.contents.twoColumnWatchNextResults.results.results &&
    data.contents.twoColumnWatchNextResults.results.results.contents;
  if (!Array.isArray(contents)) return 'unknown';

  let sawPrimaryInfo = false;
  for (let i = 0; i < contents.length; i++) {
    const info = contents[i] && contents[i].videoPrimaryInfoRenderer;
    if (!info || typeof info !== 'object') continue;
    sawPrimaryInfo = true;
    const badges = info.badges;
    if (!Array.isArray(badges)) continue;
    for (let j = 0; j < badges.length; j++) {
      const badge = badges[j] && badges[j].metadataBadgeRenderer;
      if (badge && badge.label === 'AI' && badge.icon && badge.icon.iconType === 'INFO') return 'ai';
    }
  }
  return sawPrimaryInfo ? 'not_ai' : 'unknown';
}

/** classify() over the raw body; a body that is not JSON is `unknown`. */
function classifyText(text) {
  try {
    return classify(JSON.parse(text));
  } catch {
    return 'unknown';
  }
}

function finish(entry, gen, result, store) {
  if (entry.done || gen !== generation) return;
  entry.done = true;
  if (entry.started) active--;
  pending.delete(entry.id);
  if (store) remember(entry.id, result);
  entry.resolve(result);
  pump();
}

function failed(entry, gen) {
  const now = Date.now();
  finish(entry, gen, unknownResult(now + UNKNOWN_TTL_MS), true);
}

function rateLimited(entry, gen) {
  if (entry.done || gen !== generation) return;
  pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS;
  const result = unknownResult(pausedUntil);
  // Lookups that have not reached the network are released now; requests that
  // are already in flight carry their own answer.
  const waiting = queue;
  queue = [];
  for (let i = 0; i < waiting.length; i++) {
    const w = waiting[i];
    if (w.done) continue;
    w.done = true;
    pending.delete(w.id);
    w.resolve(result);
  }
  finish(entry, gen, result, false);
}

function start(entry) {
  const gen = generation;
  entry.started = true;
  active++;

  let xhr;
  try {
    xhr = new XMLHttpRequest();
    entry.xhr = xhr;
    xhr.open('POST', REQUEST_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = REQUEST_TIMEOUT_MS;
    xhr.onload = () => {
      const status = xhr.status;
      if (status === 429) return rateLimited(entry, gen);
      if (status < 200 || status >= 300) return failed(entry, gen);
      const label = classifyText(xhr.responseText);
      if (label === 'unknown') return failed(entry, gen);
      finish(entry, gen, { status: label, expiresAt: Date.now() + RESULT_TTL_MS }, true);
    };
    xhr.onerror = () => failed(entry, gen);
    xhr.ontimeout = () => failed(entry, gen);
    xhr.send(JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20250601.01.00', hl: 'en' } },
      videoId: entry.id
    }));
  } catch {
    failed(entry, gen);
  }
}

function pump() {
  while (active < MAX_ACTIVE && queue.length > 0 && Date.now() >= pausedUntil) {
    const entry = queue.shift();
    if (!entry.done) start(entry);
  }
}

/**
 * @param {string} videoId
 * @returns {Promise<{status: 'ai'|'not_ai'|'unknown', expiresAt: number}>}
 *   Never rejects.
 */
export function getAiLabel(videoId) {
  const now = Date.now();
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) {
    return Promise.resolve(unknownResult(now));
  }

  const cached = cache.get(videoId);
  if (cached) {
    if (cached.expiresAt > now) {
      cache.delete(videoId);
      cache.set(videoId, cached);
      return Promise.resolve(cached);
    }
    cache.delete(videoId);
  }

  const inFlight = pending.get(videoId);
  if (inFlight) return inFlight.promise;

  if (now < pausedUntil) return Promise.resolve(unknownResult(pausedUntil));

  const entry = { id: videoId, promise: null, resolve: null, xhr: null, started: false, done: false };
  entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
  pending.set(videoId, entry);
  queue.push(entry);
  pump();
  return entry.promise;
}

/**
 * Drops queued lookups, aborts active ones and settles every waiter with
 * `unknown`. Cancellation is not an answer: nothing is cached for it. Cached
 * results from earlier lookups are kept.
 */
export function cancelAiLabelRequests() {
  generation++;
  const now = Date.now();
  const entries = [];
  pending.forEach((entry) => { entries.push(entry); });
  pending.clear();
  queue = [];
  active = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    entry.done = true;
    const xhr = entry.xhr;
    if (xhr) {
      xhr.onload = xhr.onerror = xhr.ontimeout = null;
      try { xhr.abort(); } catch { /* already finished */ }
    }
    entry.resolve(unknownResult(now));
  }
}
