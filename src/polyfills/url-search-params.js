// URLSearchParams and url.searchParams (Chrome 49/51), urlencoded serialiser only.

// Chromium 38 has `new URL()` but no `url.searchParams`, and no
// URLSearchParams at all. core/launch.js builds the launch URL through
// searchParams; lang-settings-fix.ts and core/per-video.js read query strings
// with it.
//
// The global is YouTube's as well, and whatwg-fetch reads at load whether
// it exists (a body of one is sent urlencoded): everything but `size` is
// implemented, the constructor, get, getAll, has, set, append, delete, sort,
// forEach, keys, values, entries, the iterator and toString, with the
// application/x-www-form-urlencoded serialiser. Note the two deliberate
// differences from encodeURIComponent: space becomes '+', and !'()~ are
// escaped, per the URL spec's urlencoded serialiser.

const ENCODE_RE = /[!'()~]|%20/g;
const ENCODE_MAP = {
  '!': '%21',
  "'": '%27',
  '(': '%28',
  ')': '%29',
  '~': '%7E',
  '%20': '+'
};

/** Encodes a name or value as application/x-www-form-urlencoded (spaces as +). */
function serialise(value) {
  return encodeURIComponent(value).replace(ENCODE_RE, function (m) {
    return ENCODE_MAP[m];
  });
}

/**
 * Decodes a name or value (+ as a space); a malformed escape keeps its raw text, as browsers do.
 */
function deserialise(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    // Malformed percent-escape: match the browser and keep the raw text
    // rather than throwing out of a getter.
    return String(value).replace(/\+/g, ' ');
  }
}

/**
 * URLSearchParams for Chromium 38: from a query string, another instance, an array of pairs or an
 * object.
 */
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
      else {
        this._pairs.push(deserialise(parts[i].slice(0, eq)), deserialise(parts[i].slice(eq + 1)));
      }
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

/** Tells the URL this instance belongs to (url.searchParams) that the parameters changed. */
USP.prototype._changed = function () {
  if (this._onChange) this._onChange(this.toString());
};

/** Adds a pair, after the existing ones. */
USP.prototype.append = function (name, value) {
  this._pairs.push(String(name), String(value));
  this._changed();
};

/** Every value of `name`, in order. */
USP.prototype.getAll = function (name) {
  const n = String(name);
  const out = [];
  for (let i = 0; i < this._pairs.length; i += 2) {
    if (this._pairs[i] === n) out.push(this._pairs[i + 1]);
  }
  return out;
};

/** Whether `name` is present. */
USP.prototype.has = function (name) {
  return this.get(name) !== null;
};

/** The first value of `name`, or null. */
USP.prototype.get = function (name) {
  const n = String(name);
  for (let i = 0; i < this._pairs.length; i += 2) {
    if (this._pairs[i] === n) return this._pairs[i + 1];
  }
  return null;
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

/** Removes every pair named `name`. */
USP.prototype['delete'] = function (name) {
  const n = String(name);
  let i = 0;
  while (i < this._pairs.length) {
    if (this._pairs[i] === n) this._pairs.splice(i, 2);
    else i += 2;
  }
  this._changed();
};

// Spec: by name in UTF-16 code units, equal names kept in their order.
// Chromium 38's sort is not stable, so the position breaks the ties.
USP.prototype.sort = function () {
  const pairs = [];
  for (let i = 0; i < this._pairs.length; i += 2) {
    pairs.push([this._pairs[i], this._pairs[i + 1], i]);
  }
  pairs.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[2] - b[2];
  });
  this._pairs = [];
  for (let i = 0; i < pairs.length; i++) this._pairs.push(pairs[i][0], pairs[i][1]);
  this._changed();
};

const HAS_ITERATOR = typeof Symbol === 'function' && !!Symbol.iterator;

/** An iterator over the pairs, live as the native one, giving `pick(name, value)`. */
function pairIterator(params, pick) {
  let i = 0;
  const iterator = {
    /** The next pair, as `pick` shapes it, or done. */
    next: function () {
      if (i >= params._pairs.length) return { value: undefined, done: true };
      const value = pick(params._pairs[i], params._pairs[i + 1]);
      i += 2;
      return { value: value, done: false };
    }
  };
  if (HAS_ITERATOR) {
    /** The iterator is its own iterable (for...of). */
    iterator[Symbol.iterator] = function () {
      return this;
    };
  }
  return iterator;
}

/** An iterator of the names. */
USP.prototype.keys = function () {
  return pairIterator(this, function (name) {
    return name;
  });
};

/** An iterator of the values. */
USP.prototype.values = function () {
  return pairIterator(this, function (_name, value) {
    return value;
  });
};

/** An iterator of [name, value] pairs. */
USP.prototype.entries = function () {
  return pairIterator(this, function (name, value) {
    return [name, value];
  });
};

if (HAS_ITERATOR) USP.prototype[Symbol.iterator] = USP.prototype.entries;

/** Calls `cb(value, name, params)` for every pair, in order. */
USP.prototype.forEach = function (cb, thisArg) {
  for (let i = 0; i < this._pairs.length; i += 2) {
    cb.call(thisArg, this._pairs[i + 1], this._pairs[i], this);
  }
};

/** The parameters as a query string, without the leading ?. */
USP.prototype.toString = function () {
  const out = [];
  for (let i = 0; i < this._pairs.length; i += 2) {
    out.push(serialise(this._pairs[i]) + '=' + serialise(this._pairs[i + 1]));
  }
  return out.join('&');
};

/** Whether `new URL()` lacks url.searchParams: Chromium 38 has URL without it (Chrome 51). */
function urlLacksSearchParams() {
  if (typeof window.URL !== 'function') return false;
  try {
    return !('searchParams' in new window.URL('https://a.example/'));
  } catch {
    return false;
  }
}

/**
 * url.searchParams over `SearchParams`, wired to url.search in both
 * directions: a change of the params writes url.search, and url.search
 * written since the last read (or href) gives the same object the new query.
 */
function wireURLSearchParams(SearchParams) {
  Object.defineProperty(window.URL.prototype, 'searchParams', {
    get: function () {
      let sp = this._searchParams;
      if (!sp) {
        sp = new SearchParams(this.search);
        const url = this;
        if ('_onChange' in sp) {
          /** Writes a change of url.searchParams back into the URL's search. */
          sp._onChange = function (str) {
            url.search = str ? '?' + str : '';
            sp._search = url.search;
          };
        }
        Object.defineProperty(this, '_searchParams', {
          value: sp,
          writable: true,
          configurable: true
        });
      } else if ('_pairs' in sp && sp._search !== this.search) {
        sp._pairs = new SearchParams(this.search)._pairs;
      }
      sp._search = this.search;
      return sp;
    },
    configurable: true
  });
}

// Each half only where it is missing: webOS 5 and 6 have both.
if (typeof window.URLSearchParams !== 'function') window.URLSearchParams = USP;
if (urlLacksSearchParams()) wireURLSearchParams(window.URLSearchParams);
