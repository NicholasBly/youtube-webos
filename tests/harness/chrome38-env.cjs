/**
 * Chrome 38 / webOS 3 environment simulator.
 * Removes every JS built-in and DOM API that Chromium 38 does NOT ship,
 * so a bundle that relies on an unpolyfilled feature throws instead of
 * silently passing on Node 22.
 *
 * Source for the removal list: caniuse / MDN browser-compat-data,
 * "first Chrome version" > 38.
 *
 * Everything is patched on the window's own realm (win.X), never on Node's
 * globals: a jsdom window created without `runScripts` shares Node's
 * constructors, and patching those would cripple the test process itself.
 */
function applyChrome38Downgrade(win) {
  if (
    !win ||
    typeof win.Array !== 'function' ||
    win.Array === Array ||
    win.Object === Object ||
    win.String === String ||
    win.Promise === Promise
  ) {
    throw new Error(
      'applyChrome38Downgrade: the window shares its constructors with the Node host realm; ' +
        'pass a jsdom window created with runScripts so the downgrade patches the page realm only'
    );
  }

  const rm = (obj, prop) => {
    if (obj && prop in obj) {
      try {
        delete obj[prop];
      } catch {
        /* non-configurable */
      }
    }
  };

  // --- Statics added after Chrome 38 ---
  rm(win.Object, 'assign'); // Chrome 45
  rm(win.Object, 'entries'); // Chrome 54
  rm(win.Object, 'values'); // Chrome 54
  rm(win.Object, 'fromEntries'); // Chrome 73
  rm(win.Object, 'getOwnPropertyDescriptors'); // 54
  rm(win.Object, 'hasOwn'); // Chrome 93
  rm(win.Object, 'groupBy'); // Chrome 117
  rm(win.Array, 'from'); // Chrome 45
  rm(win.Array, 'of'); // Chrome 45
  rm(win.String, 'raw'); // Chrome 41
  rm(win.String, 'fromCodePoint'); // Chrome 41

  // --- Array.prototype ---
  rm(win.Array.prototype, 'find'); // Chrome 45
  rm(win.Array.prototype, 'findIndex'); // Chrome 45
  rm(win.Array.prototype, 'fill'); // Chrome 45
  rm(win.Array.prototype, 'includes'); // Chrome 47
  // Array#values is the same function as Array#[Symbol.iterator], which Chrome 38
  // does have; only the named property goes.
  rm(win.Array.prototype, 'values'); // Chrome 66
  rm(win.Array.prototype, 'flat'); // Chrome 69
  rm(win.Array.prototype, 'flatMap'); // Chrome 69
  rm(win.Array.prototype, 'at'); // Chrome 92
  rm(win.Array.prototype, 'copyWithin'); // Chrome 45
  rm(win.Array.prototype, 'findLast'); // Chrome 97
  rm(win.Array.prototype, 'findLastIndex'); // Chrome 97
  rm(win.Array.prototype, 'toSorted'); // Chrome 110
  rm(win.Array.prototype, 'toReversed'); // Chrome 110
  rm(win.Array.prototype, 'toSpliced'); // Chrome 110
  rm(win.Array.prototype, 'with'); // Chrome 110

  // --- String.prototype ---
  rm(win.String.prototype, 'codePointAt'); // Chrome 41
  rm(win.String.prototype, 'startsWith'); // Chrome 41
  rm(win.String.prototype, 'endsWith'); // Chrome 41
  rm(win.String.prototype, 'includes'); // Chrome 41
  rm(win.String.prototype, 'repeat'); // Chrome 41
  rm(win.String.prototype, 'padStart'); // Chrome 57
  rm(win.String.prototype, 'padEnd'); // Chrome 57
  rm(win.String.prototype, 'trimStart'); // Chrome 66
  rm(win.String.prototype, 'trimEnd'); // Chrome 66
  rm(win.String.prototype, 'matchAll'); // Chrome 73
  rm(win.String.prototype, 'replaceAll'); // Chrome 85
  rm(win.String.prototype, 'at'); // Chrome 92

  // --- Promise combinators after 38 (base Promise exists in Chrome 32) ---
  rm(win.Promise, 'allSettled'); // Chrome 76
  rm(win.Promise, 'any'); // Chrome 85
  rm(win.Promise.prototype, 'finally'); // Chrome 63

  // --- Object/other ---
  rm(win, 'globalThis'); // Chrome 71
  rm(win, 'queueMicrotask'); // Chrome 71
  rm(win, 'BigInt'); // Chrome 67
  rm(win, 'WeakRef'); // Chrome 84
  rm(win, 'structuredClone'); // Chrome 98
  rm(win, 'Proxy'); // Chrome 49
  rm(win, 'Reflect'); // Chrome 49
  rm(win, 'AbortController'); // Chrome 66
  rm(win, 'AbortSignal'); // Chrome 66
  rm(win, 'IntersectionObserver'); // Chrome 51
  rm(win, 'ResizeObserver'); // Chrome 64
  rm(win, 'URLSearchParams'); // Chrome 49
  rm(win.URL && win.URL.prototype, 'searchParams'); // Chrome 51
  rm(win.CSS, 'escape'); // Chrome 46
  rm(win.Navigator && win.Navigator.prototype, 'sendBeacon'); // Chrome 39
  rm(win, 'fetch'); // Chrome 42
  rm(win, 'Headers');
  rm(win, 'Request');
  rm(win, 'Response');
  rm(win, 'CustomElementRegistry');
  rm(win, 'customElements'); // Chrome 54
  rm(win.Element.prototype, 'closest'); // Chrome 41
  rm(win.Element.prototype, 'append'); // Chrome 54
  rm(win.Element.prototype, 'prepend'); // Chrome 54
  rm(win.Element.prototype, 'before'); // Chrome 54
  rm(win.Element.prototype, 'after'); // Chrome 54
  rm(win.Element.prototype, 'replaceWith'); // Chrome 54
  rm(win.Element.prototype, 'scrollTo'); // Chrome 61
  rm(win.Element.prototype, 'toggleAttribute');
  // Element#getAttributeNames (Chrome 61) stays: jsdom's own selector engine calls it.
  rm(win.Element.prototype, 'replaceChildren'); // Chrome 86
  rm(win.Node.prototype, 'isConnected'); // Chrome 51
  rm(win.Node.prototype, 'getRootNode'); // Chrome 54
  rm(win.Document.prototype, 'scrollingElement'); // Chrome 44
  rm(win.Event.prototype, 'composedPath'); // Chrome 53
  rm(win.KeyboardEvent && win.KeyboardEvent.prototype, 'key'); // Chrome 51
  rm(win.KeyboardEvent && win.KeyboardEvent.prototype, 'code'); // Chrome 48
  rm(win.DOMTokenList && win.DOMTokenList.prototype, 'replace');
  if (win.Symbol) {
    rm(win.Symbol, 'asyncIterator');
    rm(win.Symbol, 'dispose');
    rm(win.Symbol.prototype, 'description'); // Chrome 70
  }
  removeNewerBuiltins(win, rm);

  // --- addEventListener options dictionary (Chrome 49; `passive` Chrome 51) ---
  // Chromium 38 reads the third argument as the boolean `capture` only, so an
  // options object is coerced to true and `once` and `passive` are ignored.
  const target = win.EventTarget && win.EventTarget.prototype;
  if (target) {
    for (const name of ['addEventListener', 'removeEventListener']) {
      const native = target[name];
      if (typeof native !== 'function') continue;
      target[name] = function (type, listener, options) {
        return native.call(this, type, listener, !!options);
      };
    }
  }

  // DOM collections gained Symbol.iterator, forEach, entries, keys and values in Chrome 51.
  if (win.Symbol && win.Symbol.iterator) {
    for (const ctor of [
      'NodeList',
      'HTMLCollection',
      'DOMTokenList',
      'DOMStringList',
      'FileList',
      'NamedNodeMap',
      'CSSRuleList',
      'StyleSheetList'
    ]) {
      const C = win[ctor];
      if (C && C.prototype && C.prototype[win.Symbol.iterator]) {
        try {
          delete C.prototype[win.Symbol.iterator];
        } catch {
          /* non-configurable */
        }
      }
      // forEach on NodeList is Chrome 51 too; HTMLCollection never had one.
      if (C && C.prototype && C.prototype.forEach) {
        try {
          delete C.prototype.forEach;
        } catch {
          /* */
        }
      }
      if (C && C.prototype && C.prototype.entries) {
        try {
          delete C.prototype.entries;
          delete C.prototype.keys;
          delete C.prototype.values;
        } catch {
          /* */
        }
      }
    }
  }
}
/**
 * The built-ins newer than Chrome 87, which neither engine has: Node's realm
 * has them, so a change could reach for one without a test noticing.
 */
function removeNewerBuiltins(win, rm) {
  rm(win, 'Iterator'); // Chrome 122, with the helpers below
  rm(win.Promise, 'withResolvers'); // Chrome 119
  rm(win.Map, 'groupBy'); // Chrome 117
  rm(win.Array, 'fromAsync'); // Chrome 121
  rm(win.String.prototype, 'isWellFormed'); // Chrome 111
  rm(win.String.prototype, 'toWellFormed'); // Chrome 111
  rm(win.crypto, 'randomUUID'); // Chrome 92
  rm(win.AbortSignal, 'timeout'); // Chrome 103
  rm(win.AbortSignal, 'any'); // Chrome 116
  for (const name of [
    'union',
    'intersection',
    'difference',
    'symmetricDifference',
    'isSubsetOf',
    'isSupersetOf',
    'isDisjointFrom'
  ]) {
    rm(win.Set.prototype, name); // Chrome 122
  }
  // The iterator helpers sit on the prototype every iterator of the realm shares.
  const iteratorProto = Object.getPrototypeOf(
    Object.getPrototypeOf(win.Array.prototype[win.Symbol.iterator].call([]))
  );
  for (const name of [
    'map',
    'filter',
    'take',
    'drop',
    'flatMap',
    'reduce',
    'toArray',
    'forEach',
    'some',
    'every',
    'find'
  ]) {
    rm(iteratorProto, name); // Chrome 122
  }
}

/**
 * Chrome 87 (webOS 22, the oldest engine the webOS 22+ bundle runs on): what
 * Node has and that engine does not, the short list a modern change could
 * reach for. Patched on the window's realm, as above.
 */
function applyChrome87Downgrade(win) {
  const rm = (obj, prop) => {
    if (obj && prop in obj) {
      try {
        delete obj[prop];
      } catch {
        /* non-configurable */
      }
    }
  };
  rm(win.Array.prototype, 'at'); // Chrome 92
  rm(win.String.prototype, 'at'); // Chrome 92
  rm(win.Object, 'hasOwn'); // Chrome 93
  rm(win.Array.prototype, 'findLast'); // Chrome 97
  rm(win.Array.prototype, 'findLastIndex'); // Chrome 97
  rm(win, 'structuredClone'); // Chrome 98
  rm(win.Array.prototype, 'toSorted'); // Chrome 110
  rm(win.Array.prototype, 'toReversed'); // Chrome 110
  rm(win.Array.prototype, 'toSpliced'); // Chrome 110
  rm(win.Array.prototype, 'with'); // Chrome 110
  rm(win.Object, 'groupBy'); // Chrome 117
  removeNewerBuiltins(win, rm);
}

/**
 * Chrome 79 (webOS 6, the newest engine the legacy bundle runs on): Chrome
 * 87's list and what came between the two.
 */
function applyChrome79Downgrade(win) {
  applyChrome87Downgrade(win);
  const rm = (obj, prop) => {
    if (obj && prop in obj) {
      try {
        delete obj[prop];
      } catch {
        /* non-configurable */
      }
    }
  };
  rm(win.Promise, 'any'); // Chrome 85
  rm(win, 'AggregateError'); // Chrome 85
  rm(win.String.prototype, 'replaceAll'); // Chrome 85
  rm(win, 'WeakRef'); // Chrome 84
  rm(win, 'FinalizationRegistry'); // Chrome 84
  rm(win.Element.prototype, 'replaceChildren'); // Chrome 86
}

module.exports = { applyChrome38Downgrade, applyChrome79Downgrade, applyChrome87Downgrade };

// The user agent is set on navigator directly: jsdom 30 has no `userAgent` constructor option.
const UA = {
  webos3:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager webOS.TV-2016',
  webos6:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager webOS.TV-2021',

  webos22:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager webOS.TV-2022',
  webos23:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.31 Safari/537.36 WebAppManager webOS.TV-2023',
  webos25:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.286 Safari/537.36 WebAppManager webOS.TV-2025'
};

function setUserAgent(win, ua) {
  Object.defineProperty(win.navigator, 'userAgent', {
    value: ua,
    configurable: true,
    writable: false
  });
  if (win.navigator.userAgent !== ua) throw new Error('failed to override userAgent');
}

// Seals the named DOM collection prototypes against a polyfilled iterator, as old Blink does:
// code that passes must not iterate DOM collections at all. `names` is the list of constructors
// to seal; jsdom's selector engine iterates NamedNodeMap, so attribute-selector tests leave it out.
function sealDomCollectionPrototypes(win, names) {
  const sealed = [];
  for (const ctor of names) {
    const C = win[ctor];
    if (!C || !C.prototype) continue;
    Object.preventExtensions(C.prototype);
    sealed.push(ctor);
  }
  return sealed;
}

module.exports.sealDomCollectionPrototypes = sealDomCollectionPrototypes;
module.exports.UA = UA;
module.exports.setUserAgent = setUserAgent;
