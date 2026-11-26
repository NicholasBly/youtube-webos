// Codec recognition and policy: the names as they appear in MIME strings and
// format entries, what the current mode allows, and whether the platform can
// actually drive a codec.
import { fc } from './state.js';

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

// Hoisted: detectCodec runs a few times per format entry, and Object.keys()
// would allocate on each one.
const CODEC_NAMES = Object.keys(CODEC_PATTERNS);

/** The video codec named in a MIME or codec string, or null if not recognised. */
export function detectCodec(str) {
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
export function isVideoMime(type) {
  return /^\s*video\//i.test(type);
}

/**
 * Whether the current mode permits a given codec.
 *
 * Deliberately does not consult `unsatisfiable`. That flag relaxes the
 * capability probes, which are global and cannot be answered per video; the
 * format lists have their own per-response guard in filterFormats(), so letting
 * the flag reach here would mean a response was skipped whenever the previous
 * one happened to lack the codec.
 */
export function allowsCodec(codec) {
  if (fc.mode === 'auto') return true;
  if (fc.mode === 'no_av1') return codec !== 'av1';
  return codec === fc.mode;
}

/** Whether the capability probes should be narrowed right now. */
export function narrowing() {
  return fc.installed && fc.mode !== 'auto' && !fc.unsatisfiable;
}

/** Ask the platform, through the untouched probe, whether a codec is real here. */
export function platformSupports(codec) {
  const probes = CODEC_PROBES[codec];
  if (!probes) return false;

  const test =
    fc.origIsTypeSupported || (window.MediaSource && MediaSource.isTypeSupported) || null;

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
