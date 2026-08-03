/**
 * Legacy webOS (Chrome 38 / webOS 3) polyfills.
 *
 * Imported at the top of utils.js, which every feature module imports, so the
 * guarantee is explicit rather than dependent on import order in userScript.js.
 * Feature modules may therefore use Element#matches, Element#closest and
 * Node#isConnected directly instead of carrying private fallback chains.
 */

if (typeof Element !== 'undefined') {
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.webkitMatchesSelector ||
      Element.prototype.mozMatchesSelector ||
      Element.prototype.msMatchesSelector ||
      Element.prototype.oMatchesSelector;
  }

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

if (typeof Node !== 'undefined' && !('isConnected' in Node.prototype)) {
  Object.defineProperty(Node.prototype, 'isConnected', {
    get: function () {
      return document.contains(this);
    },
    configurable: true,
    enumerable: true
  });
}
