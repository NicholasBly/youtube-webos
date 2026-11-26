// The server's offer: strips disallowed video renditions from the format lists
// of a player response, never emptying a list and never touching audio.
import { fc } from './state.js';
import { detectCodec, isVideoMime, allowsCodec } from './codecs.js';
import { log } from './log.js';

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
function filterFormats(list) {
  // Whether each entry stays, decided once: audio and unrecognised codecs always do.
  const keep = new Array(list.length);
  let allowed = 0;
  let disallowed = 0;

  for (let i = 0; i < list.length; i++) {
    const codec = entryCodec(list[i]);
    if (codec === null) {
      keep[i] = true;
      continue;
    }
    keep[i] = allowsCodec(codec);
    if (keep[i]) allowed++;
    else disallowed++;
  }

  if (disallowed === 0) return 0;
  if (allowed === 0) return -1;

  let write = 0;
  for (let i = 0; i < list.length; i++) {
    if (keep[i]) list[write++] = list[i];
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
export function filterStreamingData(streaming) {
  if (!streaming) return;

  const adaptiveResult = Array.isArray(streaming.adaptiveFormats)
    ? filterFormats(streaming.adaptiveFormats)
    : 0;

  if (Array.isArray(streaming.formats)) filterFormats(streaming.formats);

  // adaptiveFormats is the list the MSE player negotiates from, so it alone
  // decides whether this video can honour the setting.
  if (adaptiveResult === -1) {
    if (!fc.unsatisfiable) {
      fc.unsatisfiable = true;
      log.debug('no', fc.mode, 'rendition for this video - falling back');
      log.info('This video has no', fc.mode.toUpperCase(), 'stream; using what the server offers.');
    }
  } else if (fc.unsatisfiable) {
    fc.unsatisfiable = false;
    log.debug(fc.mode, 'available again');
  }

  if (adaptiveResult > 0) log.debug('stripped', adaptiveResult, 'format(s)');
}
