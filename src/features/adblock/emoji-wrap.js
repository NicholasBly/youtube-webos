// The legacy emoji fix's half in the response: every emoji in the parsed tree
// wrapped in sentinel characters, so features/emoji-font can swap it for an
// image on webOS 3 and 4. The webOS 22+ build carries emoji-wrap-absent.js in
// its place (webpack.config.js): the fix is never on there.
import { log } from './log.js';

// One emoji character: the symbols below in the BMP, or any astral
// character (a surrogate pair).
const EMOJI_CHAR_RE =
  /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
// What may follow one: the emoji presentation selector, a skin tone, a tag
// character (the subdivision flags).
const MODIFIER = '(?:\\uFE0F|\\uD83C[\\uDFFB-\\uDFFF]|\\uDB40[\\uDC20-\\uDC7F])';
const EMOJI_CHAR = `(?:${EMOJI_CHAR_RE.source})`;
// One emoji as twemoji draws it, the unit that is wrapped: a flag (two
// regional indicators), a keycap, or a character with its modifiers and the
// characters zero-width-joined to it. Wrapped one code point at a time, a
// thumbs-up and its skin tone, or a family, came apart into several images.
const EMOJI_RE = new RegExp(
  '\\uD83C[\\uDDE6-\\uDDFF]\\uD83C[\\uDDE6-\\uDDFF]|[#*0-9]\\uFE0F?\\u20E3|' +
    `${EMOJI_CHAR}${MODIFIER}*(?:\\u200D${EMOJI_CHAR}${MODIFIER}*)*`
);
const EMOJI_RE_CAP = new RegExp(`(${EMOJI_RE.source})`, 'g');
const EMOJI_RE_GLOBAL = new RegExp(EMOJI_RE.source, 'g');
// Includes our own sentinels: a title that ships \u200B/\u200C verbatim could
// otherwise forge an "already wrapped" region that features/emoji-font then treats
// as its own output. Stripping first also makes processEmojiString idempotent.
const CLEAN_TEXT_RE = /[\u200B\u200C\u2060\uFEFF]/g;
/** The body of the first character class in `re`: what is between its [ and ]. */
const classBody = (re) => re.source.slice(re.source.indexOf('[') + 1, re.source.indexOf(']'));
// Single-scan gate for "does this string need any emoji work at all" - most
// YouTube titles are plain text and reject here. Every emoji holds an emoji
// character or the keycap mark. One character class of every character a
// match can start with: EMOJI_CHAR_RE's emoji, a high surrogate, the keycap
// mark, CLEAN_TEXT_RE's sentinels. The engine tests one class per character
// of the text, where the union of the regexes above tried four alternatives
// at every position: on a response without emoji that scan took about as long
// as the JSON.parse itself. A lone high surrogate passes as well, which only
// costs that text the exact pass.
const NEEDS_TEXT_WORK_RE = new RegExp(
  `[${classBody(EMOJI_CHAR_RE)}\\uD83C-\\uDBFF\\u20E3${classBody(CLEAN_TEXT_RE)}]`
);
// A sentinel to strip or an emoji to wrap, in one scan (wrapAttributedContent).
const ATTRIBUTED_WORK_RE = new RegExp(`${CLEAN_TEXT_RE.source}|(${EMOJI_RE.source})`, 'g');

// An emoji or a sentinel written as a JSON escape: the code points of
// EMOJI_CHAR_RE and CLEAN_TEXT_RE and the keycap mark (U+00A9, U+00AE, U+2000
// to U+32FF, the surrogates, U+FEFF), loosely. An escaped ASCII character
// (\u0026 in a URL) does not match.
const ESCAPED_EMOJI_RE =
  /\\u(?:00[aA][9eE]|2[0-9a-fA-F]{3}|3[0-2][0-9a-fA-F]{2}|[dD][89abAB][0-9a-fA-F]{2}|[fF][eE][fF][fF])/;

/**
 * Whether the JSON text can hold anything the emoji walk would change: one
 * native scan of the text, so the walk over every item of a response (the
 * most expensive pass on webOS 3 and 4) is skipped for the ones without.
 */
export function mayNeedEmojiWork(text) {
  return NEEDS_TEXT_WORK_RE.test(text) || ESCAPED_EMOJI_RE.test(text);
}

/**
 * A text with each emoji wrapped in sentinels (U+200B before, U+200C after) for features/emoji-font
 * to draw as an image on webOS 3/4. Sentinels already in the text are removed first, so it is safe
 * to run twice; plain text comes back as it is.
 */
function processEmojiString(str) {
  if (typeof str !== 'string' || !str) return str;
  if (!NEEDS_TEXT_WORK_RE.test(str)) return str;
  const cleanedStr = str.replace(CLEAN_TEXT_RE, '');

  const replaced = cleanedStr.replace(EMOJI_RE_GLOBAL, '\u200B$&\u200C');
  if (replaced !== cleanedStr) log.debug('Wrapped emoji in string:', str);
  return replaced;
}

// Called only for text that passed NEEDS_TEXT_WORK_RE in the caller.
function splitIntoRuns(text, originalRun = {}) {
  const cleanText = text.replace(CLEAN_TEXT_RE, '');
  if (!EMOJI_RE.test(cleanText)) return null;

  const parts = cleanText.split(EMOJI_RE_CAP);
  const newRuns = [];

  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (i % 2 === 1) {
      newRuns.push(Object.assign({}, originalRun, { text: '\u200B' + parts[i] + '\u200C' }));
    } else {
      newRuns.push(Object.assign({}, originalRun, { text: parts[i] }));
    }
  }
  return newRuns;
}

/** Whether `obj` has offset runs (commandRuns, styleRuns...) over its `content`. */
function hasOffsetRuns(obj) {
  for (const key in obj) {
    if (key.slice(-4) === 'Runs' && Array.isArray(obj[key])) return true;
  }
  return false;
}

/**
 * An attributed string's `content` wrapped, and the offsets of its runs
 * (UTF-16 units of `content`) moved with the characters they name: a run
 * starting at an emoji starts at its opening sentinel, one ending with it
 * ends after the closing one. Without this a mention, link or timestamp after
 * an emoji pointed two characters early per emoji.
 */
function wrapAttributedContent(obj) {
  const src = obj.content;
  // Each edit as three numbers: where it starts and ends in `src`, and +1 for
  // a wrapped emoji or -1 for a stripped sentinel.
  const edits = [];
  let out = '';
  let last = 0;
  ATTRIBUTED_WORK_RE.lastIndex = 0;
  let m = ATTRIBUTED_WORK_RE.exec(src);
  while (m !== null) {
    out += src.slice(last, m.index);
    if (m[1]) {
      out += '\u200B' + m[1] + '\u200C';
      edits.push(m.index, m.index + m[1].length, 1);
    } else {
      edits.push(m.index, m.index + 1, -1);
    }
    last = m.index + m[0].length;
    m = ATTRIBUTED_WORK_RE.exec(src);
  }
  if (edits.length === 0) return;
  out += src.slice(last);

  // Where offset `p` of `src` lands in `out`.
  const moved = (p) => {
    let shift = 0;
    for (let i = 0; i < edits.length; i += 3) {
      if (edits[i + 2] === -1) {
        if (edits[i] < p) shift--;
      } else if (edits[i + 1] <= p) {
        shift += 2;
      } else if (edits[i] < p) {
        shift++;
      }
    }
    return p + shift;
  };
  for (const key in obj) {
    const runs = obj[key];
    if (key.slice(-4) !== 'Runs' || !Array.isArray(runs)) continue;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (!run || typeof run !== 'object') continue;
      const start = typeof run.startIndex === 'number' ? run.startIndex : 0;
      const newStart = moved(start);
      if (typeof run.length === 'number') run.length = moved(start + run.length) - newStart;
      if (newStart !== start) run.startIndex = newStart;
    }
  }
  obj.content = out;
}

// Non-recursive: the emoji/text fields of a single node, in place.
// walkAndProcess guarantees obj is a non-null object.
function processTextFieldsInPlace(obj) {
  // Set when the runs array below came from simpleText in this same call;
  // re-splitting it would be work for an identical result.
  let justBuiltRuns = false;

  if (typeof obj.simpleText === 'string' && NEEDS_TEXT_WORK_RE.test(obj.simpleText)) {
    const runs = splitIntoRuns(obj.simpleText);
    if (runs) {
      obj.runs = runs;
      delete obj.simpleText;
      justBuiltRuns = true;
    } else {
      obj.simpleText = obj.simpleText.replace(CLEAN_TEXT_RE, '');
    }
  }

  if (typeof obj.sectionString === 'string') {
    obj.sectionString = processEmojiString(obj.sectionString);
  }

  if (typeof obj.content === 'string' && NEEDS_TEXT_WORK_RE.test(obj.content)) {
    if (hasOffsetRuns(obj)) wrapAttributedContent(obj);
    else obj.content = processEmojiString(obj.content);
  }

  if (!justBuiltRuns && Array.isArray(obj.runs)) {
    const src = obj.runs;
    // Lazily allocated: a runs array only needs rebuilding if a run actually
    // splits, which is rare.
    let newRuns = null;
    for (let i = 0, len = src.length; i < len; i++) {
      const run = src[i];
      if (!run || typeof run.text !== 'string') {
        if (newRuns) newRuns.push(run);
        continue;
      }
      if (!NEEDS_TEXT_WORK_RE.test(run.text)) {
        if (newRuns) newRuns.push(run);
        continue;
      }
      const split = splitIntoRuns(run.text, run);
      if (split) {
        if (!newRuns) newRuns = src.slice(0, i);
        for (let j = 0; j < split.length; j++) newRuns.push(split[j]);
      } else {
        run.text = run.text.replace(CLEAN_TEXT_RE, '');
        if (newRuns) newRuns.push(run);
      }
    }
    if (newRuns) obj.runs = newRuns;
  }
}

// How far below the given node the emoji walk goes: past the deepest text a
// response carries.
const EMOJI_WALK_DEPTH = 20;

/** Wraps the emoji in the text fields of `obj` and every node below it. */
export function wrapEmojiInTree(obj) {
  walkEmoji(obj, 0);
}

// The depth is a plain argument: a default value would cost an `arguments`
// read per node in the legacy build.
function walkEmoji(obj, depth) {
  if (!obj || typeof obj !== 'object' || depth > EMOJI_WALK_DEPTH) return;

  const nextDepth = depth + 1;

  if (Array.isArray(obj)) {
    // An array has no text fields of its own.
    for (let i = 0, len = obj.length; i < len; i++) {
      const v = obj[i];
      if (v && typeof v === 'object') walkEmoji(v, nextDepth);
    }
  } else {
    processTextFieldsInPlace(obj);

    // for-in, not Object.keys(): identical visited set for JSON.parse output,
    // without allocating an array at every node of the response tree.
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') walkEmoji(v, nextDepth);
    }
  }
}
