// Text work on a response: trackingParams blanked in the JSON text before the
// parse. The legacy emoji fix's rewrite is emoji-wrap.js.

// A trackingParams value is an opaque token without quotes or escapes; one
// with a backslash in it is not matched and stays as sent. The leading quote
// keeps clickTrackingParams out of it: stripping that breaks clicking endcards.
// Whitespace around the colon: a pretty-printed answer has ": ".
const TRACKING_PARAMS_KEY = '"trackingParams"';
const TRACKING_PARAMS_RE = /"trackingParams"\s*:\s*"[^"\\]*"/g;
const TRACKING_PARAMS_EMPTY = '"trackingParams":""';

/**
 * The JSON text with every string trackingParams blanked, at any depth: one
 * native pass over the text, where a walk of the parsed tree cost more than
 * the parse itself on a browse response and stopped at a depth limit. The
 * same string comes back when the key does not occur.
 */
export function stripTrackingParams(text) {
  if (text.indexOf(TRACKING_PARAMS_KEY) === -1) return text;
  return text.replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
}
