// The capability hooks, installed once and gated on the mode: MediaSource
// .isTypeSupported and HTMLMediaElement#canPlayType; and the offer filter the
// shared JSON.parse hook (features/adblock/parse-hook.js) calls.
import { fc } from './state.js';
import { detectCodec, isVideoMime, allowsCodec, narrowing } from './codecs.js';
import { filterStreamingData } from './format-filter.js';
import { log } from './log.js';

/** Whether a capability question about `type` is answered no by the mode. */
function declines(type) {
  if (!narrowing() || typeof type !== 'string' || !isVideoMime(type)) return false;
  const codec = detectCodec(type);
  return codec !== null && !allowsCodec(codec);
}

/**
 * Installs the codec hooks once: MediaSource.isTypeSupported and canPlayType answer no for a codec
 * the Force Video Codec setting declines.
 */
export function installHooks() {
  if (fc.installed) return;
  fc.installed = true;

  // 1. Capability probe. Narrowing only: an allowed codec is still handed to
  //    the platform to answer, so this can never claim support that is absent.
  if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
    fc.origIsTypeSupported = MediaSource.isTypeSupported;

    /**
     * isTypeSupported that declines the codecs the setting rules out and asks the platform about
     * the rest.
     */
    MediaSource.isTypeSupported = function (type) {
      if (declines(type)) {
        log.debug('declined', type);
        return false;
      }
      return fc.origIsTypeSupported.apply(this, arguments);
    };
  }

  // 2. The element-level form of the same question.
  if (window.HTMLMediaElement) {
    fc.origCanPlayType = HTMLMediaElement.prototype.canPlayType;

    /** canPlayType that answers '' for the declined codecs and asks the platform about the rest. */
    HTMLMediaElement.prototype.canPlayType = function (type) {
      if (declines(type)) return '';
      return fc.origCanPlayType.apply(this, arguments);
    };
  }
}

/**
 * The server's offer, in a parsed response: strips the renditions the mode
 * refuses. Called from the shared JSON.parse hook while a codec is forced.
 */
export function filterParsedResponse(out) {
  if (fc.mode === 'auto') return;
  try {
    if (out.streamingData) filterStreamingData(out.streamingData);
    else if (out.playerResponse && out.playerResponse.streamingData) {
      filterStreamingData(out.playerResponse.streamingData);
    }
  } catch (e) {
    // Filtering must never break a parse, but a failure is worth knowing about.
    log.warn('streamingData filter failed:', e);
  }
}
