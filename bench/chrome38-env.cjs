/**
 * Chrome 38 / webOS 3 environment simulator.
 * Removes every JS built-in and DOM API that Chromium 38 does NOT ship,
 * so a bundle that relies on an unpolyfilled feature throws instead of
 * silently passing on Node 22.
 *
 * Source for the removal list: caniuse / MDN browser-compat-data,
 * "first Chrome version" > 38.
 */
function applyChrome38Downgrade(win) {
  const del = [];
  const rm = (obj, prop, label) => {
    if (obj && prop in obj) {
      try { delete obj[prop]; del.push(label); } catch (e) { /* non-configurable */ }
    }
  };

  // --- Statics added after Chrome 38 ---
  rm(win.Object, 'assign', 'Object.assign');              // Chrome 45
  rm(win.Object, 'entries', 'Object.entries');            // Chrome 54
  rm(win.Object, 'values', 'Object.values');              // Chrome 54
  rm(win.Object, 'fromEntries', 'Object.fromEntries');    // Chrome 73
  rm(win.Object, 'getOwnPropertyDescriptors', 'Object.getOwnPropertyDescriptors'); // 54
  rm(win.Array, 'from', 'Array.from');                    // Chrome 45
  rm(win.Array, 'of', 'Array.of');                        // Chrome 45
  rm(win.String, 'raw', 'String.raw');                    // Chrome 41

  // --- Array.prototype ---
  rm(win.Array.prototype, 'find', 'Array#find');          // Chrome 45
  rm(win.Array.prototype, 'findIndex', 'Array#findIndex');// Chrome 45
  rm(win.Array.prototype, 'includes', 'Array#includes');  // Chrome 47
  rm(win.Array.prototype, 'flat', 'Array#flat');          // Chrome 69
  rm(win.Array.prototype, 'flatMap', 'Array#flatMap');    // Chrome 69
  rm(win.Array.prototype, 'at', 'Array#at');              // Chrome 92

  // --- String.prototype ---
  rm(win.String.prototype, 'startsWith', 'String#startsWith'); // Chrome 41
  rm(win.String.prototype, 'endsWith', 'String#endsWith');     // Chrome 41
  rm(win.String.prototype, 'includes', 'String#includes');     // Chrome 41
  rm(win.String.prototype, 'repeat', 'String#repeat');         // Chrome 41
  rm(win.String.prototype, 'padStart', 'String#padStart');     // Chrome 57
  rm(win.String.prototype, 'padEnd', 'String#padEnd');         // Chrome 57
  rm(win.String.prototype, 'trimStart', 'String#trimStart');   // Chrome 66
  rm(win.String.prototype, 'trimEnd', 'String#trimEnd');       // Chrome 66
  rm(win.String.prototype, 'matchAll', 'String#matchAll');     // Chrome 73
  rm(win.String.prototype, 'replaceAll', 'String#replaceAll'); // Chrome 85
  rm(win.String.prototype, 'at', 'String#at');                 // Chrome 92

  // --- Promise combinators after 38 (base Promise exists in Chrome 32) ---
  rm(win.Promise, 'allSettled', 'Promise.allSettled');    // Chrome 76
  rm(win.Promise, 'any', 'Promise.any');                  // Chrome 85
  rm(win.Promise.prototype, 'finally', 'Promise#finally');// Chrome 63

  // --- Object/other ---
  rm(win, 'globalThis', 'globalThis');                    // Chrome 71
  rm(win, 'queueMicrotask', 'queueMicrotask');            // Chrome 71
  rm(win, 'BigInt', 'BigInt');                            // Chrome 67
  rm(win, 'Proxy', 'Proxy');                              // Chrome 49
  rm(win, 'Reflect', 'Reflect');                          // Chrome 49
  rm(win, 'AbortController', 'AbortController');          // Chrome 66
  rm(win, 'AbortSignal', 'AbortSignal');                  // Chrome 66
  rm(win, 'IntersectionObserver', 'IntersectionObserver');// Chrome 51
  rm(win, 'ResizeObserver', 'ResizeObserver');            // Chrome 64
  rm(win, 'URLSearchParams', 'URLSearchParams');          // Chrome 49
  rm(win, 'fetch', 'fetch');                              // Chrome 42
  rm(win, 'Headers', 'Headers'); rm(win, 'Request', 'Request'); rm(win, 'Response', 'Response');
  rm(win, 'CustomElementRegistry', 'CustomElementRegistry');
  rm(win, 'customElements', 'customElements');            // Chrome 54
  rm(win.Element.prototype, 'closest', 'Element#closest');// Chrome 41
  rm(win.Element.prototype, 'matches', 'Element#matches');// Chrome 34 (prefixed <34)
  rm(win.Element.prototype, 'append', 'Element#append');  // Chrome 54
  rm(win.Element.prototype, 'remove', 'Element#remove');
  rm(win.Element.prototype, 'toggleAttribute', 'Element#toggleAttribute');
  rm(win.Node.prototype, 'isConnected', 'Node#isConnected'); // Chrome 51
  rm(win.DOMTokenList && win.DOMTokenList.prototype, 'replace', 'DOMTokenList#replace');
  if (win.Symbol) { rm(win.Symbol, 'asyncIterator', 'Symbol.asyncIterator'); rm(win.Symbol, 'dispose', 'Symbol.dispose'); }

  // Chrome 38 has Element#webkitMatchesSelector; restore it so polyfills.js can find it.
  if (!win.Element.prototype.matches) {
    win.Element.prototype.webkitMatchesSelector = function (sel) {
      const list = (this.ownerDocument || win.document).querySelectorAll(sel);
      for (let i = 0; i < list.length; i++) if (list[i] === this) return true;
      return false;
    };
  }
  return del;
}
module.exports = { applyChrome38Downgrade };

/**
 * jsdom 30 removed the top-level `userAgent` constructor option, so setting it
 * there silently does nothing and every "legacy" test would actually run as
 * webOS 6 - skipping the emoji, buffer-limit and legacy-emoji code paths
 * entirely. Override navigator.userAgent directly instead.
 */
const UA = {
  webos3: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager webOS.TV-2016',
  webos4: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager webOS.TV-2018',
  webos23: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.31 Safari/537.36 WebAppManager webOS.TV-2023'
};

function setUserAgent(win, ua) {
  Object.defineProperty(win.navigator, 'userAgent', {
    value: ua, configurable: true, writable: false
  });
  if (win.navigator.userAgent !== ua) throw new Error('failed to override userAgent');
}

module.exports.UA = UA;
module.exports.setUserAgent = setUserAgent;
