import { configRead, configAddChangeListener } from './config.js';
import { showNotification } from './notifications.js';

/**
 * Force Video Codec.
 *
 * Lets the user pin video playback to a single codec instead of accepting
 * whatever the player and the server negotiate between them.
 *
 * WHY ANYONE WANTS THIS
 *   The negotiated codec is not always the one the set handles best. Some 2021
 *   panels advertise AV1 through MSE and then stall on it 30-60s in (issue
 *   #143); some sets decode VP9 in hardware and AV1 in software, so AV1 costs
 *   frames; some users simply want to compare. None of that is visible from
 *   inside the app, so this is a switch rather than a heuristic.
 *
 * HOW IT WORKS
 *   Three levers, all of which only ever *narrow* what the player will accept:
 *
 *     1. MediaSource.isTypeSupported - the capability probe the player runs to
 *        decide which formats to ask the server for. This is the lever that
 *        actually changes the negotiation, because the answer feeds the codec
 *        list sent upstream.
 *     2. HTMLMediaElement#canPlayType - the same question asked at the element,
 *        for the paths that go there instead.
 *     3. streamingData.adaptiveFormats / .formats - the offer that comes back.
 *        Stripped as belt and braces, in case a path trusts the offer over its
 *        own probe.
 *
 *   Narrowing only is deliberate: a forced codec is never reported as supported
 *   when the platform says it is not. The worst this can do is leave the player
 *   with fewer options, never with an option the hardware cannot drive.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *   - Touch audio. Audio entries and audio/* MIME types are passed through
 *     untouched; filtering them would silence playback.
 *   - Empty a format list. If the wanted codec has no rendition for a video,
 *     that list is left exactly as it was and the request is treated as
 *     unsatisfiable for that video. A stream the user did not ask for beats no
 *     stream at all.
 *   - Force a codec the platform denies. The choice is probed against the
 *     untouched isTypeSupported before any hook goes in. HEVC in particular is
 *     rarely exposed through MSE on webOS even where the panel decodes it in
 *     hardware, so that selection will usually be refused here with a message
 *     rather than producing a black screen.
 *
 * TAKES EFFECT ON RELOAD
 *   The player probes codecs once, at startup, and caches the answer. Changing
 *   this setting mid-session therefore does nothing until the app is reloaded,
 *   so the change handler says so rather than letting the setting look broken.
 */

const DEBUG = false;

/**
 * Codec tokens as they appear in MSE MIME strings and adaptiveFormats entries.
 *
 * Both spellings of each are covered: the ISO-BMFF names the player uses
 * (av01, vp09, avc1/avc3, hev1/hvc1) and the shorter names that turn up in
 * hand-written probe strings. Deliberately no VP8 entry - YouTube does not
 * serve it for video any more, and an unrecognised codec is always left alone.
 */
const CODEC_PATTERNS = {
  av1: /av0?1/i,
  vp9: /vp0?9/i,
  avc: /avc[13]|h\.?264/i,
  hevc: /hev1|hvc1|h\.?265/i
};

/**
 * Probe strings used to ask the platform whether a codec is real here.
 * Any one of a codec's strings passing counts as supported.
 */
const CODEC_PROBES = {
  av1: ['video/mp4; codecs="av01.0.08M.08"', 'video/webm; codecs="av01.0.05M.08"'],
  vp9: ['video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"'],
  avc: ['video/mp4; codecs="avc1.640028"', 'video/mp4; codecs="avc1.42E01E"'],
  hevc: ['video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="hvc1.1.6.L93.B0"']
};

/** Config values that pin to one codec, as opposed to 'auto' / 'no_av1'. */
const PINNED_MODES = ['av1', 'vp9', 'avc', 'hevc'];

let mode = 'auto';

// Hooks are installed at most once and then left in place, gated internally on
// `mode`. Uninstalling would mean writing to JSON.parse / isTypeSupported after
// other modules (adblock.js in particular) have wrapped them, which would drop
// their hook on the floor. Cost when idle is one call and one string compare.
let installed = false;

let origIsTypeSupported = null;
let origCanPlayType = null;
let origParse = null;

/**
 * Set when the current player response carries no rendition in the wanted
 * codec. While set, the capability answers go back to the truth so a player
 * that re-probes is not left with nothing to choose from.
 */
let unsatisfiable = false;

function debugLog(...args) {
  if (DEBUG) console.info('[ForceCodec]', ...args);
}

// Hoisted: detectCodec runs a few times per format entry, and Object.keys()
// would allocate on each one.
const CODEC_NAMES = Object.keys(CODEC_PATTERNS);

/** The video codec named in a MIME or codec string, or null if not recognised. */
function detectCodec(str) {
  for (let i = 0; i < CODEC_NAMES.length; i++) {
    if (CODEC_PATTERNS[CODEC_NAMES[i]].test(str)) return CODEC_NAMES[i];
  }
  return null;
}

/**
 * Whether a MIME string describes video.
 *
 * This is the guard that keeps audio out of everything below. An audio type
 * names no video codec, so without this check the "does not match the wanted
 * codec" test would decline every audio SourceBuffer and playback would run
 * silent.
 */
function isVideoMime(type) {
  return /^\s*video\//i.test(type);
}

/**
 * Whether the current mode permits a given codec.
 *
 * Deliberately does not consult `unsatisfiable`. That flag relaxes the
 * capability probes, which are global and cannot be answered per video; the
 * format lists have their own per-response guard in filterList(), so letting
 * the flag reach here would mean a response was skipped whenever the previous
 * one happened to lack the codec.
 */
function allowsCodec(codec) {
  if (mode === 'auto') return true;
  if (mode === 'no_av1') return codec !== 'av1';
  return codec === mode;
}

/** Whether the capability probes should be narrowed right now. */
function narrowing() {
  return installed && mode !== 'auto' && !unsatisfiable;
}

/** Ask the platform, through the untouched probe, whether a codec is real here. */
function platformSupports(codec) {
  const probes = CODEC_PROBES[codec];
  if (!probes) return false;

  const test =
    origIsTypeSupported ||
    (window.MediaSource && MediaSource.isTypeSupported) ||
    null;

  // No MSE to ask. Assume yes rather than blocking the user on a probe we
  // cannot run; the never-empty guards below still apply.
  if (typeof test !== 'function') return true;

  for (const probe of probes) {
    try {
      if (test.call(window.MediaSource, probe)) return true;
    } catch {
      // A throwing probe is a no, not a crash.
    }
  }
  return false;
}

/* ----------------------------------------------------------- format list --- */

/** The video codec of an adaptiveFormats/formats entry; null for audio. */
function entryCodec(entry) {
  const mime = entry && entry.mimeType;
  if (typeof mime !== 'string' || !isVideoMime(mime)) return null;
  return detectCodec(mime);
}

/**
 * Strip disallowed video entries from one format list, in place.
 *
 * Returns the number removed, or -1 when the list holds no rendition in the
 * wanted codec. In that case nothing is removed: emptying the list would leave
 * the player with no video at all.
 */
function filterList(list) {
  let allowed = 0;
  let disallowed = 0;

  for (let i = 0; i < list.length; i++) {
    const codec = entryCodec(list[i]);
    if (codec === null) continue; // audio, or a codec we do not recognise
    if (allowsCodec(codec)) allowed++;
    else disallowed++;
  }

  if (disallowed === 0) return 0;
  if (allowed === 0) return -1;

  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    const codec = entryCodec(entry);
    if (codec !== null && !allowsCodec(codec)) continue;
    list[write++] = entry;
  }
  list.length = write;
  return disallowed;
}

/**
 * Filter both format lists on a streamingData block.
 *
 * The two lists are judged separately on purpose. `formats` holds the muxed
 * progressive streams, which are AVC in practice and have no AV1 equivalent -
 * judging them together with `adaptiveFormats` would either strip the
 * progressive fallback away entirely or block the adaptive filtering that the
 * user actually asked for.
 */
function filterStreamingData(streaming) {
  if (!streaming) return;

  const adaptiveResult = Array.isArray(streaming.adaptiveFormats)
    ? filterList(streaming.adaptiveFormats)
    : 0;

  if (Array.isArray(streaming.formats)) filterList(streaming.formats);

  // adaptiveFormats is the list the MSE player negotiates from, so it alone
  // decides whether this video can honour the setting.
  if (adaptiveResult === -1) {
    if (!unsatisfiable) {
      unsatisfiable = true;
      debugLog(`no ${mode} rendition for this video - falling back`);
      console.info(`[ForceCodec] This video has no ${mode.toUpperCase()} stream; using what the server offers.`);
    }
  } else if (unsatisfiable) {
    unsatisfiable = false;
    debugLog(`${mode} available again`);
  }

  if (DEBUG && adaptiveResult > 0) debugLog(`stripped ${adaptiveResult} format(s)`);
}

/* ----------------------------------------------------------------- hooks --- */

function installHooks() {
  if (installed) return;
  installed = true;

  // 1. Capability probe. Narrowing only: an allowed codec is still handed to
  //    the platform to answer, so this can never claim support that is absent.
  if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
    origIsTypeSupported = MediaSource.isTypeSupported;
    MediaSource.isTypeSupported = function (type) {
      if (narrowing() && typeof type === 'string' && isVideoMime(type)) {
        const codec = detectCodec(type);
        if (codec !== null && !allowsCodec(codec)) {
          debugLog('declined', type);
          return false;
        }
      }
      return origIsTypeSupported.apply(this, arguments);
    };
  }

  // 2. The element-level form of the same question.
  if (window.HTMLMediaElement) {
    origCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
      if (narrowing() && typeof type === 'string' && isVideoMime(type)) {
        const codec = detectCodec(type);
        if (codec !== null && !allowsCodec(codec)) return '';
      }
      return origCanPlayType.apply(this, arguments);
    };
  }

  // 3. The server's offer. Guards are ordered cheapest-first: YouTube parses
  //    thousands of small blobs and none of them can carry streamingData.
  origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    // A streamingData response is tens of kilobytes, so the small blobs
    // YouTube parses constantly are dismissed before the result is even looked
    // at.
    if (mode === 'auto' || typeof text !== 'string' || text.length < 1000) {
      return origParse.call(this, text, reviver);
    }

    const out = origParse.call(this, text, reviver);
    if (!out || typeof out !== 'object') return out;
    try {
      if (out.streamingData) filterStreamingData(out.streamingData);
      else if (out.playerResponse && out.playerResponse.streamingData) {
        filterStreamingData(out.playerResponse.streamingData);
      }
    } catch {
      // Filtering must never break a parse.
    }
    return out;
  };
}

/* ---------------------------------------------------------------- wiring --- */

/**
 * Apply the stored setting.
 *
 * @param {boolean} interactive true when the user just changed it, which is the
 *   only time there is a DOM to put a notification in and the only time a
 *   "reload to apply" message is worth showing.
 */
function applyMode(interactive) {
  const wanted = configRead('forceVideoCodec');

  if (wanted === 'auto') {
    mode = 'auto';
    unsatisfiable = false;
    if (interactive) showNotification('Video codec: Auto — reload to apply');
    return;
  }

  // Install first so the probe below goes through the saved original rather
  // than whatever else may have wrapped isTypeSupported since startup.
  installHooks();

  if (PINNED_MODES.indexOf(wanted) !== -1 && !platformSupports(wanted)) {
    mode = 'auto';
    const label = wanted.toUpperCase();
    console.warn(`[ForceCodec] ${label} is not available through MSE on this device; leaving codec selection alone.`);
    if (interactive) showNotification(`${label} is not available on this TV — leaving codec on Auto`);
    return;
  }

  mode = wanted;
  unsatisfiable = false;
  debugLog('mode set to', mode);

  if (interactive) {
    const label = mode === 'no_av1' ? 'Avoid AV1' : mode.toUpperCase();
    showNotification(`Video codec: ${label} — reload to apply`);
  }
}

configAddChangeListener('forceVideoCodec', () => applyMode(true));

applyMode(false);

/** Exposed for the diagnostic report. */
export function forceCodecActive() {
  return narrowing() ? mode : null;
}
