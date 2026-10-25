// DOM polyfills for Chromium 38: Element#closest, Node#isConnected, and
// iteration over NodeList, HTMLCollection and friends.

// Element#closest - Chrome 41. Element#matches is Chrome 34, so it is there.
if (typeof Element !== 'undefined' && !Element.prototype.closest) {
  /** Element.closest for engines without it (Chromium 38). */
  Element.prototype.closest = function (s) {
    let el = this;
    do {
      if (el.matches(s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

// Node#isConnected - Chrome 54.
if (typeof Node !== 'undefined' && !('isConnected' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    get: function () {
      return document.contains(this);
    },
    configurable: true,
    enumerable: true
  });
}

// NodeList, HTMLCollection and friends are NOT iterable before Chrome 51.
// WebIDL gives any interface with an indexed property getter an @@iterator, but
// Chromium 38 predates that, so `for (const el of container.children)` throws
//   "Invalid attempt to iterate non-iterable instance."
// from Babel's for-of helper. core-js's web.dom-collections.iterator used to
// cover this; the settings panel's arrow keys once ran through a vendored
// polyfill that relied on it, which is how it took out the panel on webOS 3.
//
// Nothing in src/ iterates a DOM collection today (every loop is indexed):
// this stays as a guard, since no legacy package has run on a device and the
// cost is one pass at startup. The legacy behaviour pages remove these
// iterators and seal the NodeList and HTMLCollection prototypes against this
// file (tests/harness/page.cjs), so a covered path that iterates one fails.
//
// Array.prototype[Symbol.iterator] works verbatim on these: they are all
// array-like (indexed properties + length), which is exactly what it reads.
if (typeof Symbol !== 'undefined' && Symbol.iterator && typeof window !== 'undefined') {
  const arrayValues = Array.prototype[Symbol.iterator];
  const DOM_COLLECTIONS = [
    'NodeList',
    'HTMLCollection',
    'DOMTokenList',
    'DOMStringList',
    'DOMSettableTokenList',
    'NamedNodeMap',
    'MediaList',
    'StyleSheetList',
    'CSSRuleList',
    'FileList',
    'DataTransferItemList',
    'HTMLAllCollection',
    'HTMLFormControlsCollection',
    'HTMLOptionsCollection',
    'HTMLSelectElement',
    'ClientRectList',
    'TouchList',
    'PluginArray',
    'MimeTypeArray',
    'SVGNumberList',
    'SVGLengthList',
    'SVGStringList',
    'SVGTransformList',
    'SVGPointList'
  ];

  for (let i = 0; i < DOM_COLLECTIONS.length; i++) {
    const Ctor = window[DOM_COLLECTIONS[i]];
    if (!Ctor || !Ctor.prototype || Ctor.prototype[Symbol.iterator]) continue;
    try {
      Object.defineProperty(Ctor.prototype, Symbol.iterator, {
        value: arrayValues,
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch {
      // Old Blink rejects a Symbol-keyed defineProperty on some host
      // prototypes. Try a plain assignment before giving up.
      try {
        Ctor.prototype[Symbol.iterator] = arrayValues;
      } catch {
        /* genuinely not patchable - see the note below */
      }
    }
  }

  // IMPORTANT: this whole block is best-effort. On a real webOS 3 TV some of
  // these prototypes cannot be patched at all, silently. Do NOT write
  // `for (const x of someNodeList)` in src/ and rely on this - use an indexed
  // loop. tests/behaviour/panel-navigation-test.cjs runs with these prototypes sealed to
  // keep that honest.

  // NodeList#forEach is Chrome 51 as well. HTMLCollection has never had one in
  // any browser, so it is deliberately not added here.
  if (typeof NodeList !== 'undefined' && NodeList.prototype && !NodeList.prototype.forEach) {
    try {
      Object.defineProperty(NodeList.prototype, 'forEach', {
        value: Array.prototype.forEach,
        writable: true,
        enumerable: false,
        configurable: true
      });
    } catch {
      /* ignore */
    }
  }
}
