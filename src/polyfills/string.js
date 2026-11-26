// String: startsWith (Chrome 41). The other ES2015+ string methods are not
// called anywhere in the bundle, so they are not installed.
import { def } from './define.js';

def(String.prototype, 'startsWith', function startsWith(search, pos) {
  const s = String(this);
  const p = pos > 0 ? pos | 0 : 0;
  return s.substr(p, String(search).length) === String(search);
});
