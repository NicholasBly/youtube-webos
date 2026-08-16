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
 * genuinely calls. Everything is feature-detected, so on webOS 4+ the whole
 * file is a handful of `in` checks at startup and nothing is installed.
 *
 * The comment on each entry is the first Chrome version shipping it.
 * bench/polyfill-conformance.cjs differentially tests every one of these
 * against the platform-native implementation; bench/smoke.cjs loads the whole
 * bundle against a simulated Chromium 38 global and fails if one is missing.
 *
 * If you use a newer built-in in src/, add it here.
 */

/* ---------------------------------------------------------------- DOM --- */

if (typeof Element !== 'undefined') {
  // Element#matches - Chrome 34 unprefixed, webkitMatchesSelector before that.
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.webkitMatchesSelector ||
      Element.prototype.mozMatchesSelector ||
      Element.prototype.msMatchesSelector ||
      Element.prototype.oMatchesSelector;
  }

  // Element#closest - Chrome 41.
  if (!Element.prototype.closest) {
    Element.prototype.closest = function (s) {
      let el = this;
      do {
        if (Element.prototype.matches.call(el, s)) return el;
        el = el.parentElement || el.parentNode;
      } while (el !== null && el.nodeType === 1);
      return null;
    };
  }
}

// Node#isConnected - Chrome 51.
if (typeof Node !== 'undefined' && !('isConnected' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    get: function () {
      return document.contains(this);
    },
    configurable: true,
    enumerable: true
  });
}

/* --------------------------------------------------------- ES statics --- */

// Non-enumerable install, matching how the engine defines built-ins. A plain
// assignment on a prototype would make the method visible to for-in loops over
// arrays/strings and could break unrelated YouTube code.
function def(target, name, value) {
  if (name in target) return;
  Object.defineProperty(target, name, {
    value: value,
    writable: true,
    enumerable: false,
    configurable: true
  });
}

// Object.assign - Chrome 45.
def(Object, 'assign', function assign(target) {
  if (target == null)
    throw new TypeError('Cannot convert undefined or null to object');
  const to = Object(target);
  for (let i = 1; i < arguments.length; i++) {
    const src = arguments[i];
    if (src == null) continue;
    const from = Object(src);
    const keys = Object.keys(from);
    for (let j = 0; j < keys.length; j++) to[keys[j]] = from[keys[j]];
  }
  return to;
});

// Object.entries / Object.values - Chrome 54.
def(Object, 'entries', function entries(o) {
  const src = Object(o);
  const keys = Object.keys(src);
  const out = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) out[i] = [keys[i], src[keys[i]]];
  return out;
});

def(Object, 'values', function values(o) {
  const src = Object(o);
  const keys = Object.keys(src);
  const out = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) out[i] = src[keys[i]];
  return out;
});

// Array.from - Chrome 45. Iterables matter: Babel's spread/rest helpers call
// it on Map/Set/NodeList, and Chromium 38 does have Symbol.iterator.
def(Array, 'from', function from(items, mapFn, thisArg) {
  if (items == null)
    throw new TypeError('Array.from requires an array-like or iterable');
  const out = [];
  const iterFn =
    typeof Symbol !== 'undefined' && Symbol.iterator
      ? items[Symbol.iterator]
      : null;

  if (typeof iterFn === 'function') {
    const iter = iterFn.call(items);
    let step;
    let i = 0;
    while (!(step = iter.next()).done) {
      out.push(mapFn ? mapFn.call(thisArg, step.value, i) : step.value);
      i++;
    }
    return out;
  }

  const len = Math.min(
    Math.max(Number(items.length) || 0, 0),
    9007199254740991
  );
  for (let i = 0; i < len; i++) {
    out.push(mapFn ? mapFn.call(thisArg, items[i], i) : items[i]);
  }
  return out;
});

/* ----------------------------------------------------- Array.prototype --- */

// Array#find / Array#findIndex - Chrome 45.
def(Array.prototype, 'find', function find(pred, thisArg) {
  const o = Object(this);
  const len = o.length >>> 0;
  for (let i = 0; i < len; i++) {
    if (pred.call(thisArg, o[i], i, o)) return o[i];
  }
  return undefined;
});

def(Array.prototype, 'findIndex', function findIndex(pred, thisArg) {
  const o = Object(this);
  const len = o.length >>> 0;
  for (let i = 0; i < len; i++) {
    if (pred.call(thisArg, o[i], i, o)) return i;
  }
  return -1;
});

// Array#includes - Chrome 47. Unlike indexOf, NaN must match NaN.
def(Array.prototype, 'includes', function includes(search, fromIndex) {
  const o = Object(this);
  const len = o.length >>> 0;
  if (len === 0) return false;
  let i = fromIndex | 0;
  if (i < 0) i = Math.max(len + i, 0);
  for (; i < len; i++) {
    const v = o[i];
    if (v === search || (v !== v && search !== search)) return true;
  }
  return false;
});

// Array#flat - Chrome 69.
def(Array.prototype, 'flat', function flat(depth) {
  const d = depth === undefined ? 1 : Number(depth) || 0;
  const out = [];
  (function step(arr, level) {
    for (let i = 0; i < arr.length; i++) {
      if (!(i in arr)) continue;
      const v = arr[i];
      if (level > 0 && Array.isArray(v)) step(v, level - 1);
      else out.push(v);
    }
  })(Object(this), d);
  return out;
});

/* ---------------------------------------------------- String.prototype --- */

// startsWith / endsWith / includes / repeat - Chrome 41.
def(String.prototype, 'startsWith', function startsWith(search, pos) {
  const s = String(this);
  const p = pos > 0 ? pos | 0 : 0;
  return s.substr(p, String(search).length) === String(search);
});

def(String.prototype, 'endsWith', function endsWith(search, len) {
  const s = String(this);
  const t = String(search);
  const end = len === undefined || len > s.length ? s.length : len | 0;
  return s.substring(end - t.length, end) === t;
});

def(String.prototype, 'includes', function includes(search, start) {
  // toString tag rather than `instanceof`: cross-realm RegExps (iframes, and
  // the jsdom harness in bench/) fail an instanceof check.
  if (Object.prototype.toString.call(search) === '[object RegExp]')
    throw new TypeError('first argument must not be a RegExp');
  return String(this).indexOf(String(search), start || 0) !== -1;
});

def(String.prototype, 'repeat', function repeat(count) {
  const n = Number(count) || 0;
  if (n < 0 || n === Infinity) throw new RangeError('Invalid count value');
  let s = String(this);
  let out = '';
  let k = n | 0;
  // Doubling: O(log n) concatenations instead of n.
  while (k > 0) {
    if (k & 1) out += s;
    k >>= 1;
    if (k) s += s;
  }
  return out;
});

// padStart / padEnd - Chrome 57.
function makePad(atStart) {
  return function pad(targetLength, padString) {
    const s = String(this);
    const target = targetLength >> 0;
    if (target <= s.length) return s;
    const fill = padString === undefined ? ' ' : String(padString);
    if (fill === '') return s;
    let padding = '';
    while (padding.length < target - s.length) padding += fill;
    padding = padding.slice(0, target - s.length);
    return atStart ? padding + s : s + padding;
  };
}
def(String.prototype, 'padStart', makePad(true));
def(String.prototype, 'padEnd', makePad(false));

/* ---------------------------------------------- Promise#finally (63) --- */

if (typeof Promise !== 'undefined') {
  def(Promise.prototype, 'finally', function finallyPolyfill(cb) {
    const C = this.constructor || Promise;
    return this.then(
      (value) => C.resolve(cb()).then(() => value),
      (reason) =>
        C.resolve(cb()).then(() => {
          throw reason;
        })
    );
  });
}

/* --------------------------------------- URLSearchParams / URL (49/51) --- */

// Chromium 38 has `new URL()` but no `url.searchParams`, and no
// URLSearchParams at all. utils.js builds the launch URL through searchParams,
// and lang-settings-fix.ts parses the PREF cookie with it.
//
// Only the application/x-www-form-urlencoded serialiser is implemented, which
// is what both call sites need. Note the two deliberate differences from
// encodeURIComponent: space becomes '+', and !'()~ are escaped, per the URL
// spec's urlencoded serialiser.
(function installURLSearchParams(global) {
  if (!global) return;
  const needsUSP = typeof global.URLSearchParams !== 'function';
  let needsURLPatch = false;

  if (typeof global.URL === 'function') {
    try {
      needsURLPatch = !('searchParams' in new global.URL('https://a.example/'));
    } catch {
      needsURLPatch = false;
    }
  }

  if (!needsUSP && !needsURLPatch) return;

  const ENCODE_RE = /[!'()~]|%20/g;
  const ENCODE_MAP = {
    '!': '%21',
    "'": '%27',
    '(': '%28',
    ')': '%29',
    '~': '%7E',
    '%20': '+'
  };

  function serialise(value) {
    return encodeURIComponent(value).replace(ENCODE_RE, function (m) {
      return ENCODE_MAP[m];
    });
  }

  function deserialise(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, ' '));
    } catch {
      // Malformed percent-escape: match the browser and keep the raw text
      // rather than throwing out of a getter.
      return String(value).replace(/\+/g, ' ');
    }
  }

  function makeIterator(items) {
    let i = 0;
    const it = {
      next: function () {
        return i < items.length
          ? { done: false, value: items[i++] }
          : { done: true, value: undefined };
      }
    };
    if (typeof Symbol !== 'undefined' && Symbol.iterator) {
      it[Symbol.iterator] = function () {
        return it;
      };
    }
    return it;
  }

  function USP(init) {
    // `_pairs` is a flat [k, v, k, v, ...] array: insertion order is part of
    // the spec and a Map would lose duplicate keys, which are legal here.
    this._pairs = [];
    this._onChange = null;

    if (init == null || init === '') return;

    if (typeof init === 'string') {
      let str = init;
      if (str.charAt(0) === '?') str = str.slice(1);
      if (!str) return;
      const parts = str.split('&');
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        const eq = parts[i].indexOf('=');
        if (eq === -1) this._pairs.push(deserialise(parts[i]), '');
        else
          this._pairs.push(
            deserialise(parts[i].slice(0, eq)),
            deserialise(parts[i].slice(eq + 1))
          );
      }
    } else if (init instanceof USP) {
      this._pairs = init._pairs.slice();
    } else if (Array.isArray(init)) {
      for (let i = 0; i < init.length; i++) {
        this._pairs.push(String(init[i][0]), String(init[i][1]));
      }
    } else {
      const keys = Object.keys(init);
      for (let i = 0; i < keys.length; i++) {
        this._pairs.push(keys[i], String(init[keys[i]]));
      }
    }
  }

  USP.prototype._changed = function () {
    if (this._onChange) this._onChange(this.toString());
  };

  USP.prototype.append = function (name, value) {
    this._pairs.push(String(name), String(value));
    this._changed();
  };

  USP.prototype.get = function (name) {
    const n = String(name);
    for (let i = 0; i < this._pairs.length; i += 2) {
      if (this._pairs[i] === n) return this._pairs[i + 1];
    }
    return null;
  };

  USP.prototype.getAll = function (name) {
    const n = String(name);
    const out = [];
    for (let i = 0; i < this._pairs.length; i += 2) {
      if (this._pairs[i] === n) out.push(this._pairs[i + 1]);
    }
    return out;
  };

  USP.prototype.has = function (name) {
    return this.get(name) !== null;
  };

  // Spec: replace the first occurrence in place, drop the rest.
  USP.prototype.set = function (name, value) {
    const n = String(name);
    const v = String(value);
    let found = false;
    let i = 0;
    while (i < this._pairs.length) {
      if (this._pairs[i] === n) {
        if (found) {
          this._pairs.splice(i, 2);
          continue;
        }
        this._pairs[i + 1] = v;
        found = true;
      }
      i += 2;
    }
    if (!found) this._pairs.push(n, v);
    this._changed();
  };

  USP.prototype['delete'] = function (name) {
    const n = String(name);
    let i = 0;
    while (i < this._pairs.length) {
      if (this._pairs[i] === n) this._pairs.splice(i, 2);
      else i += 2;
    }
    this._changed();
  };

  USP.prototype.forEach = function (cb, thisArg) {
    for (let i = 0; i < this._pairs.length; i += 2) {
      cb.call(thisArg, this._pairs[i + 1], this._pairs[i], this);
    }
  };

  USP.prototype.keys = function () {
    const out = [];
    for (let i = 0; i < this._pairs.length; i += 2) out.push(this._pairs[i]);
    return makeIterator(out);
  };

  USP.prototype.values = function () {
    const out = [];
    for (let i = 1; i < this._pairs.length; i += 2) out.push(this._pairs[i]);
    return makeIterator(out);
  };

  USP.prototype.entries = function () {
    const out = [];
    for (let i = 0; i < this._pairs.length; i += 2) {
      out.push([this._pairs[i], this._pairs[i + 1]]);
    }
    return makeIterator(out);
  };

  USP.prototype.sort = function () {
    const entries = [];
    for (let i = 0; i < this._pairs.length; i += 2) {
      entries.push([this._pairs[i], this._pairs[i + 1]]);
    }
    entries.sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
    this._pairs = [];
    for (let i = 0; i < entries.length; i++) {
      this._pairs.push(entries[i][0], entries[i][1]);
    }
    this._changed();
  };

  USP.prototype.toString = function () {
    const out = [];
    for (let i = 0; i < this._pairs.length; i += 2) {
      out.push(serialise(this._pairs[i]) + '=' + serialise(this._pairs[i + 1]));
    }
    return out.join('&');
  };

  Object.defineProperty(USP.prototype, 'size', {
    get: function () {
      return this._pairs.length / 2;
    },
    configurable: true
  });

  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
    USP.prototype[Symbol.iterator] = USP.prototype.entries;
  }

  if (needsUSP) global.URLSearchParams = USP;

  // Wire url.searchParams <-> url.search in both directions.
  if (needsURLPatch) {
    const SearchParams = needsUSP ? USP : global.URLSearchParams;
    Object.defineProperty(global.URL.prototype, 'searchParams', {
      get: function () {
        if (!this._searchParams) {
          const sp = new SearchParams(this.search);
          const url = this;
          if ('_onChange' in sp) {
            sp._onChange = function (str) {
              url.search = str ? '?' + str : '';
            };
          }
          Object.defineProperty(this, '_searchParams', {
            value: sp,
            writable: true,
            configurable: true
          });
        }
        return this._searchParams;
      },
      configurable: true
    });
  }
})(typeof window !== 'undefined' ? window : undefined);
