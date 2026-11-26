// Array: from (Chrome 45), find and findIndex (45).
import { def } from './define.js';

// Array.from - Chrome 45. Iterables matter: Babel's spread/rest helpers call
// it on Map/Set/NodeList, and Chromium 38 does have Symbol.iterator.
def(Array, 'from', function from(items, mapFn, thisArg) {
  if (items == null) throw new TypeError('Array.from requires an array-like or iterable');
  const out = [];
  const iterFn = typeof Symbol !== 'undefined' && Symbol.iterator ? items[Symbol.iterator] : null;

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

  const len = Math.min(Math.max(Number(items.length) || 0, 0), 9007199254740991);
  for (let i = 0; i < len; i++) {
    out.push(mapFn ? mapFn.call(thisArg, items[i], i) : items[i]);
  }
  return out;
});

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
