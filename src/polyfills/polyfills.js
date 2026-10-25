/**
 * Legacy webOS (Chromium 38 / webOS 3) polyfills.
 *
 * This file replaces core-js. core-js's compat data considers Chromium 38 to
 * need 386 modules (~334 KiB of source) because it re-implements any built-in
 * with *any* spec deviation - Promise, Map, Set, Symbol, URL and most of
 * Array.prototype included. None of those deviations affect this app, and
 * `usage-pure` mode also rewrites every `arr.slice(...)` call site into
 * `_sliceInstanceProperty(arr).call(arr, ...)`, which costs a function call
 * and a property lookup on every invocation, forever, on every device.
 *
 * So we ship only what Chromium 38 genuinely does not have and this codebase
 * genuinely calls, with one deliberate exception: iteration over DOM
 * collections (dom.js), kept as a guard. Everything is feature-detected: on
 * webOS 4 (Chromium 53) Object.entries, Object.values and Node#isConnected
 * are still installed, on webOS 5 and 6 nothing is.
 *
 * The comment on each entry is the first Chrome version shipping it.
 * tests/unit/polyfill-conformance-test.cjs differentially tests every one of these
 * against the platform-native implementation.
 *
 * If you use a newer built-in in src/, add it to the matching group:
 *   define.js            the non-enumerable installer the groups share
 *   dom.js               Element#closest, Node#isConnected, iterable collections
 *   object.js            Object.assign, entries, values
 *   array.js             Array.from, find, findIndex
 *   string.js            startsWith
 *   url-search-params.js URLSearchParams and url.searchParams
 */

import './dom.js';
import './object.js';
import './array.js';
import './string.js';
import './url-search-params.js';
