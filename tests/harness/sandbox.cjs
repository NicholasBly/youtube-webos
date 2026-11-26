/**
 * Source files as a unit: the files are read in order, their ESM syntax is
 * stripped (an import becomes a sandbox global the caller supplies, an export
 * a top-level binding, `export default X` the binding `__default`) and the
 * result runs in one vm context, the way the bundle resolves them.
 *
 *   const { loadSources } = require('../harness/sandbox.cjs');
 *   const { sandbox, get } = loadSources([file, ...], { configRead, ... }, { ts: true });
 *   sandbox.someExportedFunction(...)   // functions are properties of the context
 *   get('someConst')                    // a top-level const is read in the context
 *
 * `ts: true` runs the TypeScript transform first (for a .ts source).
 */
'use strict';

const fs = require('fs');
const vm = require('vm');

function stripEsm(source) {
  return source
    .replace(/^export \{[\s\S]*?\} from '[^']+';$/gm, '')
    .replace(/^import[^;]+;$/gm, '')
    .replace(/^export default (.*);$/gm, 'var __default = $1;')
    .replace(/^export /gm, '');
}

function loadSources(files, globals, options) {
  const o = options || {};
  let source = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  if (o.ts) {
    const babel = require('@babel/core');
    source = babel.transformSync(source, {
      babelrc: false,
      configFile: false,
      filename: 'sources.ts',
      plugins: ['@babel/plugin-transform-typescript']
    }).code;
  }
  const sandbox = Object.assign({}, globals);
  if (!sandbox.window) sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(stripEsm(source), sandbox, { filename: files[files.length - 1] });
  return { sandbox, get: (expression) => vm.runInContext(expression, sandbox) };
}

module.exports = { loadSources, stripEsm };
