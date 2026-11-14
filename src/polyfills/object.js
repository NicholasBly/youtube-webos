// Object statics: assign (Chrome 45), entries and values (Chrome 54).
import { def } from './define.js';

// Object.assign - Chrome 45.
def(Object, 'assign', function assign(target) {
  if (target == null) throw new TypeError('Cannot convert undefined or null to object');
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
