// Text work on a response: trackingParams blanked in the JSON text before the
// parse. The legacy emoji fix's rewrite is emoji-wrap.js.

// A trackingParams value is an opaque token without quotes or escapes; one
// with a backslash in it is not matched and stays as sent. The leading quote
// keeps clickTrackingParams out of it: stripping that breaks clicking endcards.
// Whitespace around the colon: a pretty-printed answer has ": ".
const TRACKING_PARAMS_KEY = '"trackingParams"';
const TRACKING_PARAMS_RE = /"trackingParams"\s*:\s*"[^"\\]*"/g;
const TRACKING_PARAMS_EMPTY = '"trackingParams":""';

// The renderers whose own trackingParams the TV client needs. It tells the
// lazily loaded content of one tab (a channel on the Subscriptions page, a
// tab of a channel page) from another's by them: blanked, every tab has the
// same key, '', and content that arrives after the focus moved on lands in
// whichever tab is focused, showing another channel's videos.
const KEPT_RENDERER_KEYS = ['"tvSurfaceContentRenderer"', '"tvSurfaceContentContinuation"'];
// What a response with tabs carries: the tab bar (a browse), or one tab's
// content (a continuation). Others are not scanned, so they keep the fast path.
const TABS_KEYS = ['"tvSecondaryNavRenderer"', '"tvSurfaceContentContinuation"'];

/** The offset of the first of `keys` in `text`, or -1. */
function firstIndexOf(text, keys) {
  let first = -1;
  for (let k = 0; k < keys.length; k++) {
    const at = text.indexOf(keys[k]);
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  return first;
}

/** Whether whitespace (space, tab, newline, carriage return) is at `code`. */
const isSpace = (code) => code === 32 || code === 10 || code === 13 || code === 9;

/**
 * The offsets of the trackingParams keys that belong to a kept renderer itself
 * (not to anything inside it), in order: one pass over the text from the first
 * kept renderer, a string at a time (indexOf finds its end), with a stack that
 * says which open objects are kept renderers. Brackets that close objects
 * opened before the scan started find the stack empty and are ignored.
 */
function keptTrackingParams(text, from) {
  const kept = [];
  // One entry per open object or array: true for a kept renderer.
  const stack = [];
  // The last key was a kept renderer's: the object it opens next is one.
  let keyIsKept = false;
  const n = text.length;
  for (let i = from; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      // A string: its end is the next quote not escaped by an odd run of backslashes.
      let end = i;
      for (;;) {
        end = text.indexOf('"', end + 1);
        if (end === -1) return kept;
        let backslashes = 0;
        while (text.charCodeAt(end - 1 - backslashes) === 92) backslashes++;
        if (backslashes % 2 === 0) break;
      }
      let next = end + 1;
      while (isSpace(text.charCodeAt(next))) next++;
      if (text.charCodeAt(next) === 58) {
        // A key; compared only at the lengths that can match.
        const length = end - i + 1;
        if (
          length === TRACKING_PARAMS_KEY.length &&
          stack[stack.length - 1] === true &&
          text.substr(i, length) === TRACKING_PARAMS_KEY
        ) {
          kept.push(i);
        }
        keyIsKept =
          (length === KEPT_RENDERER_KEYS[0].length &&
            text.substr(i, length) === KEPT_RENDERER_KEYS[0]) ||
          (length === KEPT_RENDERER_KEYS[1].length &&
            text.substr(i, length) === KEPT_RENDERER_KEYS[1]);
      } else {
        keyIsKept = false;
      }
      i = end;
    } else if (c === 123) {
      stack.push(keyIsKept);
      keyIsKept = false;
    } else if (c === 91) {
      stack.push(false);
      keyIsKept = false;
    } else if (c === 125 || c === 93) {
      stack.pop();
      keyIsKept = false;
    }
  }
  return kept;
}

/** `text` with every trackingParams blanked but those at the `kept` offsets (ascending). */
function stripAllBut(text, kept) {
  let out = '';
  let from = 0;
  for (let k = 0; k < kept.length; k++) {
    const at = kept[k];
    // The whole pair, when it is one the pattern blanks; one it does not stays as sent anyway.
    TRACKING_PARAMS_RE.lastIndex = at;
    const match = TRACKING_PARAMS_RE.exec(text);
    if (!match || match.index !== at) continue;
    const end = at + match[0].length;
    out += text.slice(from, at).replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
    out += text.slice(at, end);
    from = end;
  }
  TRACKING_PARAMS_RE.lastIndex = 0;
  return out + text.slice(from).replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
}

/**
 * The JSON text with every string trackingParams blanked, at any depth: one
 * native pass over the text, where a walk of the parsed tree cost more than
 * the parse itself on a browse response and stopped at a depth limit. The
 * same string comes back when the key does not occur. A response with tabs
 * keeps the trackingParams of its tab renderers (KEPT_RENDERER_KEYS), found
 * by one more pass over the text.
 */
export function stripTrackingParams(text) {
  if (text.indexOf(TRACKING_PARAMS_KEY) === -1) return text;
  if (firstIndexOf(text, TABS_KEYS) !== -1) {
    const from = firstIndexOf(text, KEPT_RENDERER_KEYS);
    const kept = from === -1 ? [] : keptTrackingParams(text, from);
    if (kept.length) return stripAllBut(text, kept);
  }
  return text.replace(TRACKING_PARAMS_RE, TRACKING_PARAMS_EMPTY);
}
