// webpack loader: a stylesheet, already through postcss-loader, as a module
// that hands its text to src/core/styles.js, which puts every stylesheet of
// the bundle into the page in one piece. A url() to a file next to the
// stylesheet becomes an import of it (the PNG rule inlines it as a data URI).
'use strict';

const path = require('path');

const STYLES = path.resolve(__dirname, '..', 'src', 'core', 'styles.js');
// The CSS comes minified: no space inside url().
const URL_RE = /url\((['"]?)([^'"\s)]+)\1\)/g;
const ABSOLUTE_RE = /^(?:data:|[a-z]+:\/\/|\/\/|#)/i;

/** A request relative to the stylesheet's own directory. */
function relative(from, file) {
  const rel = path.relative(from, file).split(path.sep).join('/');
  return rel.charAt(0) === '.' ? rel : './' + rel;
}

module.exports = function cssCollectLoader(css) {
  const imports = [`import { addStyle } from ${JSON.stringify(relative(this.context, STYLES))};`];
  const parts = [];
  let last = 0;
  let match = URL_RE.exec(css);
  while (match !== null) {
    const url = match[2];
    if (!ABSOLUTE_RE.test(url)) {
      const name = `cssUrl${imports.length - 1}`;
      const request = url.charAt(0) === '.' ? url : './' + url;
      imports.push(`import ${name} from ${JSON.stringify(request)};`);
      // Unquoted, as css-loader wrote it: a data URI needs no quotes.
      parts.push(JSON.stringify(css.slice(last, match.index) + 'url('), name, '")"');
      last = match.index + match[0].length;
    }
    match = URL_RE.exec(css);
  }
  URL_RE.lastIndex = 0;
  parts.push(JSON.stringify(css.slice(last)));
  return `${imports.join('\n')}\naddStyle(${parts.join(' + ')});\n`;
};
