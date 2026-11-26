/**
 * Stubs for the unit scripts that load a source into a vm sandbox: the host
 * surface a core module touches, with what it did recorded.
 *
 *   SRC, CORE(file)        the src/ directory and a file under src/core
 *   loggerStub()           { createLogger, lines }: a logger whose lines are collected per level
 *   storageStub(entries)   a localStorage over a Map: getItem, setItem, removeItem, and the `store`
 *   blankDom()             a jsdom with an empty body at the YouTube TV url (jsdom is
 *                          loaded then, not by the scripts that never ask for one)
 */
'use strict';

const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const CORE = (f) => path.join(SRC, 'core', f);

/** A logger stub whose lines are collected per level. */
function loggerStub() {
  const lines = { debug: [], info: [], warn: [], error: [] };
  const createLogger = (tag) => {
    const make =
      (level) =>
      (...a) =>
        lines[level].push('[' + tag + '] ' + a.join(' '));
    return { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') };
  };
  return { createLogger, lines };
}

/** A localStorage over a Map, with getItem/setItem/removeItem only. */
function storageStub(entries) {
  const store = new Map(Object.entries(entries || {}));
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

function blankDom() {
  const { JSDOM } = require('jsdom');
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.youtube.com/tv'
  });
}

module.exports = { SRC, CORE, loggerStub, storageStub, blankDom };
