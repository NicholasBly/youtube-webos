#!/usr/bin/env node
// Builds the map of the codebase: every module of src/ and every named
// function in it, with what each does (the comment above it), what it calls,
// what calls it, and the settings, events, YouTube selectors, browser hooks
// and window diagnostics it touches. For people and for AI agents researching
// or optimising the project; docs/ARCHITECTURE.md is the hand-written overview
// that goes with it.
//
//   npm run codemap          writes docs/CODEMAP.md (the index), one page per
//                            folder in docs/codemap/, and docs/codemap.json
//   npm run codemap:check    fails when they are out of date, or when a
//                            function outside src/dev/ has no description
//
// The descriptions live in the source, as the comment right above each
// function, so the map follows the code. The check (part of `npm test`)
// ignores line numbers: moving code around does not make it fail.
//
// "Named function": a function declaration, a class member, a function or
// arrow assigned to a variable or to a property (X.prototype.y = function),
// and a function in an object literal kept in a variable or returned. A
// function passed straight to a call (a listener, a forEach callback, an
// `events: { click }` handler) is not listed on its own: what it does counts
// toward the function it sits in.
import { createRequire } from 'node:module';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  existsSync
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DOCS = join(ROOT, 'docs');
const PAGES = join(DOCS, 'codemap');
const CHECK = process.argv.includes('--check');
// Folders whose functions need no description of their own: the perf monitor,
// a development tool that is not in release builds, and third-party code kept
// as its authors wrote it (vendor/).
const UNDESCRIBED_OK = ['dev/', 'vendor/'];
// Folders listed in short form (one line per function); the JSON has them in full.
const COMPACT = ['dev/', 'vendor/'];
const TOP = '(top level)';

const posix = (p) => p.split(sep).join('/');
const pushOnce = (list, v) => {
  if (v != null && v !== '' && !list.includes(v)) list.push(v);
};
const byId = (a, b) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

function listFiles(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// The settings, from the module that defines them (it is plain ESM).
let configOptions = new Map();
try {
  configOptions = (await import(pathToFileURL(join(SRC, 'core', 'config-options.js')).href))
    .configOptions;
} catch (err) {
  console.warn(`codemap: could not load core/config-options.js (${err.message})`);
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** The text of a comment block, without its markers, as plain paragraphs. */
function cleanComment(raw) {
  let lines;
  if (raw.startsWith('/*')) {
    lines = raw
      .replace(/^\/\*\*?/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map((l) => l.replace(/^\s*\* ?/, ''));
  } else {
    lines = raw.split('\n').map((l) => l.replace(/^\s*\/\/ ?/, ''));
  }
  const paragraphs = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') {
      if (cur.length) paragraphs.push(cur.join(' '));
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) paragraphs.push(cur.join(' '));
  return paragraphs.join('\n\n').trim();
}

const isBanner = (raw) => /^\/\/\s*[-=]{3,}|^\/\*+\s*[-=]{3,}/.test(raw);
const isDirective = (raw) =>
  /^\/\/\s*(?:eslint|@ts-|prettier-ignore)|^\/\*\s*(?:eslint|global)\b/.test(raw);

/**
 * The comment right above `node`: the last block, or run of // lines, that
 * ends on the line before it. A blank line, a section banner or a /* block
 * further up ends it, so a file header is not taken for a description.
 */
function leadingComment(text, node) {
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  const parts = [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const raw = text.slice(r.pos, r.end);
    const next = i === ranges.length - 1 ? node.getStart() : ranges[i + 1].pos;
    if ((text.slice(r.end, next).match(/\n/g) || []).length > 1) break;
    if (isBanner(raw)) break;
    if (isDirective(raw)) {
      if (parts.length) break;
      continue;
    }
    if (raw.startsWith('/*') && parts.length) break;
    parts.unshift(raw);
    if (raw.startsWith('/*')) break;
  }
  return cleanComment(parts.join('\n'));
}

/** The module's header: the comment at the very top, up to the first blank line after it. */
function headerComment(text, sf) {
  const first = sf.statements[0];
  const ranges = ts.getLeadingCommentRanges(text, first ? first.getFullStart() : 0) || [];
  const blocks = [];
  let prevEnd = null;
  for (const r of ranges) {
    if (prevEnd !== null && /\n[ \t]*\n/.test(text.slice(prevEnd, r.pos))) break;
    const raw = text.slice(r.pos, r.end);
    if (isDirective(raw)) break;
    blocks.push(raw);
    prevEnd = r.end;
  }
  return cleanComment(blocks.join('\n'));
}

const firstSentence = (s) => {
  const flat = (s || '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(?:\s|$)/.exec(flat);
  const one = m ? m[1] : flat;
  return one.length > 220 ? one.slice(0, 217) + '...' : one;
};

const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const isFn = (n) => !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));
const unquote = (s) => s.replace(/^['"]|['"]$/g, '');
const hasModifier = (node, kind) =>
  !!(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === kind));

// ---------------------------------------------------------------------------
// Parse every module: imports, exports, constants, named functions
// ---------------------------------------------------------------------------

const modules = new Map(); // module path under src/ -> record
const functions = new Map(); // id -> record
const fnByNode = new Map(); // AST node -> record

function withExt(from) {
  if (modules.has(from)) return from;
  for (const e of ['.js', '.ts', '/index.js', '/index.ts']) {
    if (modules.has(from + e)) return from + e;
  }
  return from;
}

const files = listFiles(SRC, ['.js', '.ts']);
// Reserved first, so withExt() resolves imports of modules not parsed yet.
for (const file of files) modules.set(posix(relative(SRC, file)), null);

for (const file of files) {
  const rel = posix(relative(SRC, file));
  // Windows checkouts may have CRLF: the map must not depend on it.
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  const mod = {
    path: rel,
    lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0),
    header: headerComment(text, sf),
    imports: [],
    exports: [],
    importedBy: [],
    functions: [],
    top: null,
    _sf: sf,
    _text: text,
    _bindings: new Map(), // local name -> { from, imported }
    _reexports: new Map(), // exported name -> { from, imported }
    _consts: new Map(), // name -> string | Map(prop -> string)
    _selAlias: new Map(), // name -> SELECTORS key
    _defaultName: null
  };
  modules.set(rel, mod);

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const spec = st.moduleSpecifier.text;
      const from = spec.startsWith('.')
        ? withExt(posix(relative(SRC, resolve(dirname(file), spec))))
        : spec;
      const names = [];
      const clause = st.importClause;
      if (clause) {
        if (clause.name) names.push({ local: clause.name.text, imported: 'default' });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) names.push({ local: nb.name.text, imported: '*' });
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            names.push({
              local: el.name.text,
              imported: el.propertyName ? el.propertyName.text : el.name.text
            });
          }
        }
      }
      mod.imports.push({
        from,
        names: names.map((n) => (n.imported === n.local ? n.local : `${n.imported} as ${n.local}`))
      });
      for (const n of names) mod._bindings.set(n.local, { from, imported: n.imported });
      continue;
    }
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    if (exported && (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st))) {
      const name = st.name ? st.name.text : 'default';
      mod.exports.push(isDefault ? 'default' : name);
      if (isDefault) mod._defaultName = name;
    }
    if (ts.isVariableStatement(st)) {
      const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0;
      for (const d of st.declarationList.declarations) {
        if (exported) mod.exports.push(d.name.getText());
        if (!isConst || !ts.isIdentifier(d.name) || !d.initializer) continue;
        let init = d.initializer;
        while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) {
          init = init.expression;
        }
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
          mod._consts.set(d.name.text, init.text);
        } else if (ts.isObjectLiteralExpression(init)) {
          const props = new Map();
          for (const p of init.properties) {
            if (
              ts.isPropertyAssignment(p) &&
              (ts.isStringLiteral(p.initializer) ||
                ts.isNoSubstitutionTemplateLiteral(p.initializer))
            ) {
              props.set(unquote(p.name.getText()), p.initializer.text);
            }
          }
          if (props.size) mod._consts.set(d.name.text, props);
        } else if (
          ts.isPropertyAccessExpression(init) &&
          init.expression.getText() === 'SELECTORS'
        ) {
          mod._selAlias.set(d.name.text, init.name.text);
        }
      }
    }
    if (ts.isExportAssignment(st)) {
      mod.exports.push('default');
      if (ts.isIdentifier(st.expression)) mod._defaultName = st.expression.text;
    }
    if (ts.isExportDeclaration(st)) {
      const from = st.moduleSpecifier
        ? withExt(posix(relative(SRC, resolve(dirname(file), st.moduleSpecifier.text))))
        : null;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const imported = el.propertyName ? el.propertyName.text : el.name.text;
          mod.exports.push(el.name.text);
          if (from) mod._reexports.set(el.name.text, { from, imported });
        }
      } else if (from) {
        mod._reexports.set('*' + from, { from, imported: '*' });
      }
    }
  }

  visit(mod, sf, { owner: [], cls: null });
}

function memberName(m) {
  if (ts.isConstructorDeclaration(m)) return 'constructor';
  return m.name ? unquote(m.name.getText()) : '?';
}

/**
 * Where an object literal is kept: the path of names from the variable,
 * property or assignment that holds it ([] for an object a function returns),
 * or null for an object passed to a call or kept in an array, whose functions
 * are callbacks of something else.
 */
function objectPath(obj) {
  const path = [];
  let cur = obj;
  for (;;) {
    let p = cur.parent;
    while (p && (ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) {
      cur = p;
      p = p.parent;
    }
    if (!p) return null;
    if (ts.isPropertyAssignment(p) && p.initializer === cur) {
      path.unshift(unquote(p.name.getText()));
      cur = p.parent;
      continue;
    }
    if (ts.isVariableDeclaration(p)) return [p.name.getText(), ...path];
    if (ts.isExportAssignment(p)) return ['default', ...path];
    if (ts.isPropertyDeclaration(p)) return [p.name.getText(), ...path];
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === cur)) return path;
    if (
      ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      p.right === cur
    ) {
      return [p.left.getText().replace(/^this\./, ''), ...path];
    }
    return null;
  }
}

/** The named function `node` is, if it is one: its name, kind, body and owner path. */
function functionAt(node, ctx) {
  if (ts.isFunctionDeclaration(node) && node.body) {
    const isDefault = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
    if (!node.name && !isDefault) return null;
    const name = node.name ? node.name.text : 'default';
    return { name, kind: 'function', body: node, host: node, owner: ctx.owner };
  }
  if (ts.isVariableDeclaration(node) && isFn(node.initializer) && ts.isIdentifier(node.name)) {
    const list = node.parent;
    const stmt = list && list.parent && ts.isVariableStatement(list.parent) ? list.parent : node;
    // The statement's comment describes its first declaration only.
    const host = list.declarations && list.declarations[0] !== node ? node : stmt;
    return { name: node.name.text, kind: 'arrow', body: node.initializer, host, owner: ctx.owner };
  }
  if (ts.isExportAssignment(node) && isFn(node.expression)) {
    return { name: 'default', kind: 'arrow', body: node.expression, host: node, owner: ctx.owner };
  }
  if (
    (ts.isPropertyAssignment(node) && isFn(node.initializer)) ||
    ((ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node)) &&
      ts.isObjectLiteralExpression(node.parent))
  ) {
    const path = objectPath(node.parent);
    if (!path) return null;
    let name = unquote(node.name.getText());
    if (ts.isGetAccessor(node)) name = 'get ' + name;
    if (ts.isSetAccessor(node)) name = 'set ' + name;
    const body = ts.isPropertyAssignment(node) ? node.initializer : node;
    return { name, kind: 'property', body, host: node, owner: [...ctx.owner, ...path] };
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isFn(node.right) &&
    (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
  ) {
    const left = node.left.getText();
    const host = ts.isExpressionStatement(node.parent) ? node.parent : node;
    if (left.startsWith('this.') && ctx.cls) {
      return { name: left.slice(5), kind: 'assigned', body: node.right, host, owner: [ctx.cls] };
    }
    return { name: left, kind: 'assigned', body: node.right, host, owner: ctx.owner };
  }
  return null;
}

/** Whether `node` is the first thing on its line. */
function startsLine(mod, node) {
  const start = node.getStart();
  const lineStart = mod._text.lastIndexOf('\n', start - 1) + 1;
  return mod._text.slice(lineStart, start).trim() === '';
}

function visit(mod, node, ctx) {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) {
    const cls = node.name.text;
    const owner = [...ctx.owner, cls];
    for (const m of node.members) {
      let mName = null;
      let mKind = 'method';
      let body = m;
      if (ts.isConstructorDeclaration(m)) mName = 'constructor';
      else if (ts.isGetAccessor(m)) {
        mName = 'get ' + memberName(m);
        mKind = 'getter';
      } else if (ts.isSetAccessor(m)) {
        mName = 'set ' + memberName(m);
        mKind = 'setter';
      } else if (ts.isMethodDeclaration(m)) mName = memberName(m);
      else if (ts.isPropertyDeclaration(m) && isFn(m.initializer)) {
        mName = memberName(m);
        body = m.initializer;
      }
      // An overload signature has no body.
      if (mName && body === m && !m.body) mName = null;
      if (mName) addFunction(mod, owner, mName, mKind, body, m, cls);
      const inner = { owner: [...owner, mName || memberName(m)], cls };
      ts.forEachChild(m, (c) => visit(mod, c, inner));
    }
    return;
  }
  const f = functionAt(node, ctx);
  // A function written inline, after other code on its line, cannot have a
  // comment of its own: it counts toward the function it sits in.
  if (f && startsLine(mod, f.host)) {
    addFunction(mod, f.owner, f.name, f.kind, f.body, f.host, ctx.cls);
    // Class context carries over: arrow functions keep `this`.
    const inner = { owner: [...f.owner, f.name], cls: ctx.cls };
    ts.forEachChild(f.body, (c) => visit(mod, c, inner));
    return;
  }
  ts.forEachChild(node, (c) => visit(mod, c, ctx));
}

function addFunction(mod, owner, name, kind, body, host, cls) {
  const qual = [...owner, name].join('.');
  let id = `${mod.path}#${qual}`;
  // The same name twice in one scope (a redefinition in another branch): number it.
  for (let i = 2; functions.has(id); i++) id = `${mod.path}#${qual}~${i}`;
  const params =
    body.parameters && body.parameters.length
      ? body.parameters.map((p) => p.name.getText().replace(/\s+/g, ' ')).join(', ')
      : '';
  const sf = mod._sf;
  const fn = {
    id,
    module: mod.path,
    name,
    qualified: id.slice(id.indexOf('#') + 1),
    kind,
    params,
    async: hasModifier(body, ts.SyntaxKind.AsyncKeyword),
    exported:
      owner.length === 0 &&
      (mod.exports.includes(name) ||
        (name === mod._defaultName && mod.exports.includes('default'))),
    lines: [lineOf(sf, host.getStart()), lineOf(sf, body.getEnd())],
    description: leadingComment(mod._text, host),
    ...newUses(),
    calledBy: [],
    _node: body,
    _cls: cls,
    _scope: [...owner, name]
  };
  functions.set(id, fn);
  fnByNode.set(body, fn);
  mod.functions.push(id);
  return fn;
}

function newUses() {
  return {
    calls: [],
    settings: { read: [], write: [], listen: [], other: [] },
    events: { emit: [], listen: [] },
    selectors: [],
    browser: [],
    hooks: []
  };
}

// ---------------------------------------------------------------------------
// Name resolution
// ---------------------------------------------------------------------------

/** Follows imports and re-exports to the module and name that define `name`. */
function definitionOf(mod, name) {
  const b = mod && mod._bindings.get(name);
  if (!b) return null;
  return exportedAs(modules.get(b.from), b.imported, 0);
}

function exportedAs(target, imported, depth) {
  if (!target || depth > 6) return null;
  if (imported === '*') return { mod: target, name: '*' };
  const re = target._reexports.get(imported);
  if (re) return exportedAs(modules.get(re.from), re.imported, depth + 1);
  if (imported !== 'default' && !target.exports.includes(imported)) {
    for (const [key, r] of target._reexports) {
      if (key.startsWith('*')) {
        const hit = exportedAs(modules.get(r.from), imported, depth + 1);
        if (hit) return hit;
      }
    }
  }
  const name = imported === 'default' ? target._defaultName || 'default' : imported;
  return { mod: target, name };
}

const fnId = (mod, qual) => {
  const id = `${mod.path}#${qual}`;
  if (functions.has(id)) return id;
  if (functions.has(id + '.constructor')) return id + '.constructor';
  return null;
};

/** The function a plain name refers to from `scope`: nested, local, then imported. */
function resolveName(mod, name, scope) {
  const chain = scope.slice();
  for (;;) {
    const id = fnId(mod, [...chain, name].join('.'));
    if (id) return id;
    if (!chain.length) break;
    chain.pop();
  }
  const def = definitionOf(mod, name);
  return def && def.name !== '*' ? fnId(def.mod, def.name) : null;
}

/** obj.prop(): `this` in a class, a namespace import, an imported or local object of functions. */
function resolveMember(mod, scope, cls, objText, prop) {
  if (objText === 'this' && cls) {
    const at = scope.lastIndexOf(cls);
    const clsChain = at >= 0 ? scope.slice(0, at + 1) : [cls];
    const id = fnId(mod, [...clsChain, prop].join('.'));
    if (id) return id;
  }
  if (/^[a-z_$][\w$]*$/i.test(objText)) {
    const def = definitionOf(mod, objText);
    if (def) {
      if (def.name === '*') return fnId(def.mod, prop);
      return fnId(def.mod, `${def.name}.${prop}`);
    }
    const chain = scope.slice();
    for (;;) {
      const id = fnId(mod, [...chain, objText, prop].join('.'));
      if (id) return id;
      if (!chain.length) break;
      chain.pop();
    }
  }
  return null;
}

/** A constant's value: a local `const`, or one imported from another module. */
function constOf(mod, name) {
  if (mod._consts.has(name)) return mod._consts.get(name);
  const def = definitionOf(mod, name);
  return def && def.mod._consts.has(def.name) ? def.mod._consts.get(def.name) : undefined;
}

/**
 * The string an expression stands for, as far as it can be known statically:
 * a literal, a constant, CONSTS.KEY, or a pattern with * for the parts that
 * are not known (`shortcut_key_${key}` is "shortcut_key_*").
 */
function stringOf(mod, expr) {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return stringOf(mod, expr.expression);
  if (ts.isTemplateExpression(expr)) {
    let s = expr.head.text;
    for (const span of expr.templateSpans) {
      s += (stringOf(mod, span.expression) ?? '*') + span.literal.text;
    }
    return s.replace(/\*+/g, '*');
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = stringOf(mod, expr.left);
    const r = stringOf(mod, expr.right);
    if (l === null && r === null) return null;
    return ((l ?? '*') + (r ?? '*')).replace(/\*+/g, '*');
  }
  if (ts.isIdentifier(expr)) {
    const v = constOf(mod, expr.text);
    return typeof v === 'string' ? v : null;
  }
  if (
    (ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) &&
    ts.isIdentifier(expr.expression)
  ) {
    const v = constOf(mod, expr.expression.text);
    const key = ts.isPropertyAccessExpression(expr)
      ? expr.name.text
      : stringOf(mod, expr.argumentExpression);
    return v instanceof Map && key && v.has(key) ? v.get(key) : null;
  }
  return null;
}

const settingKeys = [...configOptions.keys()];
const patternRe = (p) =>
  new RegExp(
    '^' +
      p
        .split('*')
        .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$'
  );
/**
 * The setting `s` names: the key itself, or a pattern (with *) that covers
 * keys and has enough of its own text to mean something ("sbMode_*", "*Color",
 * not "*_*").
 */
function settingOf(s) {
  if (!s) return null;
  if (!s.includes('*')) return configOptions.has(s) ? s : null;
  if (s.replace(/[^a-z]/gi, '').length < 4) return null;
  const re = patternRe(s);
  return settingKeys.some((k) => re.test(k)) ? s : null;
}

// ---------------------------------------------------------------------------
// What each function touches
// ---------------------------------------------------------------------------

// Browser APIs worth knowing a function calls: timers, observers, DOM
// queries, layout, network.
const BROWSER_CALLS = new Set([
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'requestIdleCallback',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
  'fetch',
  'XMLHttpRequest',
  'Image',
  'getComputedStyle',
  'getBoundingClientRect',
  'querySelector',
  'querySelectorAll',
  'getElementsByClassName',
  'getElementsByTagName',
  'elementFromPoint'
]);
// Property reads that force layout, or touch storage.
const BROWSER_PROPS = new Set([
  'offsetWidth',
  'offsetHeight',
  'offsetTop',
  'offsetLeft',
  'clientWidth',
  'clientHeight',
  'scrollTop',
  'scrollHeight',
  'scrollWidth',
  'localStorage',
  'sessionStorage'
]);
// Assignments that replace a built-in or add a missing one, or publish a
// diagnostics object.
const HOOK_TARGETS = [
  /^(window\.)?JSON\.(parse|stringify)$/,
  /^window\.fetch$/,
  /^(window\.)?URL\.(createObjectURL|revokeObjectURL)$/,
  /^(window\.)?MediaSource\.isTypeSupported$/,
  /^(window\.)?(XMLHttpRequest|HTMLMediaElement|MediaSource|SourceBuffer|Element|Node|NodeList|HTMLCollection|DOMTokenList|URL|Array|Object|String|Function|Promise|Document|EventTarget)\.prototype\.\w+$/,
  /\.resolveCommand$/,
  /^window\.__\w+$/
];
const EVENT_CTORS = new Set(['CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent']);
const SETTING_CALLS = {
  configRead: 'read',
  configWrite: 'write',
  configAddChangeListener: 'listen',
  configGetDefault: 'other',
  configGetDesc: 'other'
};

/** A declaration's own name, a property name or an import: not a value to resolve. */
function isNameOnly(id) {
  const p = id.parent;
  if (!p) return false;
  return (
    (ts.isPropertyAccessExpression(p) && p.name === id) ||
    (ts.isPropertyAssignment(p) && p.name === id) ||
    (ts.isVariableDeclaration(p) && p.name === id) ||
    (ts.isParameter(p) && p.name === id) ||
    (ts.isFunctionDeclaration(p) && p.name === id) ||
    (ts.isClassDeclaration(p) && p.name === id) ||
    (ts.isMethodDeclaration(p) && p.name === id) ||
    (ts.isPropertyDeclaration(p) && p.name === id) ||
    ts.isBindingElement(p) ||
    ts.isImportSpecifier(p) ||
    ts.isImportClause(p) ||
    ts.isNamespaceImport(p) ||
    ts.isExportSpecifier(p)
  );
}

const isSettingCarrier = (node) =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateExpression(node) ||
  (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
  ts.isPropertyAccessExpression(node) ||
  ts.isElementAccessExpression(node) ||
  (ts.isIdentifier(node) && !isNameOnly(node));

/**
 * Walks `root` (a function, or a whole module for what it runs at load) and
 * records into `uses` what it calls and touches. Named functions inside it
 * are their own entries and are skipped; callbacks count toward it.
 */
function analyze(mod, root, uses, scope, cls, selfId) {
  const walk = (node) => {
    if (node !== root && fnByNode.has(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      let target = null;
      let calleeName = null;
      if (ts.isIdentifier(callee)) {
        calleeName = callee.text;
        target = resolveName(mod, calleeName, scope);
      } else if (ts.isPropertyAccessExpression(callee)) {
        calleeName = callee.name.text;
        target = resolveMember(mod, scope, cls, callee.expression.getText(), calleeName);
      }
      if (target && target !== selfId) pushOnce(uses.calls, target);
      if (calleeName && BROWSER_CALLS.has(calleeName)) pushOnce(uses.browser, calleeName);
      const args = node.arguments || [];
      // A named function handed over as a callback (a listener, a timer, a
      // forEach) is called from here as far as the map is concerned.
      for (const arg of args) {
        let cb = null;
        if (ts.isIdentifier(arg)) cb = resolveName(mod, arg.text, scope);
        else if (ts.isPropertyAccessExpression(arg)) {
          cb = resolveMember(mod, scope, cls, arg.expression.getText(), arg.name.text);
        }
        if (cb && cb !== selfId) pushOnce(uses.calls, cb);
      }
      if (calleeName && SETTING_CALLS[calleeName] && args[0]) {
        const key = settingOf(stringOf(mod, args[0]));
        if (key) pushOnce(uses.settings[SETTING_CALLS[calleeName]], key);
      }
      if (calleeName === 'configGetAll') pushOnce(uses.settings.other, '(all)');
      if (ts.isNewExpression(node) && calleeName && EVENT_CTORS.has(calleeName)) {
        pushOnce(uses.events.emit, stringOf(mod, args[0]));
      }
      if (calleeName === 'addEventListener') pushOnce(uses.events.listen, stringOf(mod, args[0]));
      // A disposables bag: bag.listen(target, type, fn)
      if (calleeName === 'listen' && args.length >= 3) {
        pushOnce(uses.events.listen, stringOf(mod, args[1]));
      }
      if (
        calleeName === 'defineProperty' &&
        args.length >= 2 &&
        /^(?:window|(?:window\.)?[A-Z]\w*\.prototype)$/.test(args[0].getText())
      ) {
        const prop = stringOf(mod, args[1]);
        if (prop && !prop.includes('*')) pushOnce(uses.hooks, `${args[0].getText()}.${prop}`);
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (node.expression.getText() === 'SELECTORS') pushOnce(uses.selectors, node.name.text);
      if (BROWSER_PROPS.has(node.name.text)) pushOnce(uses.browser, node.name.text);
    }
    if (ts.isIdentifier(node) && !isNameOnly(node) && mod._selAlias.has(node.text)) {
      pushOnce(uses.selectors, mod._selAlias.get(node.text));
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
    ) {
      const t = node.left.getText();
      if (HOOK_TARGETS.some((re) => re.test(t))) pushOnce(uses.hooks, t);
    }
    // Any other mention of a setting: a key passed to a panel control, CONFIG_KEYS.X...
    if (isSettingCarrier(node)) {
      const key = settingOf(stringOf(mod, node));
      if (key) {
        pushOnce(uses.settings.other, key);
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
  const s = uses.settings;
  s.other = s.other.filter(
    (k) => !s.read.includes(k) && !s.write.includes(k) && !s.listen.includes(k)
  );
}

for (const fn of functions.values()) {
  analyze(modules.get(fn.module), fn._node, fn, fn._scope, fn._cls, fn.id);
}
for (const mod of modules.values()) {
  mod.top = newUses();
  analyze(mod, mod._sf, mod.top, [], null, null);
  // The module that defines the settings names every one of them: not a use.
  if (mod.path === 'core/config-options.js') mod.top.settings.other = [];
}

// Reverse edges.
for (const fn of functions.values()) {
  for (const c of fn.calls) pushOnce(functions.get(c).calledBy, fn.id);
}
for (const mod of modules.values()) {
  for (const c of mod.top.calls) pushOnce(functions.get(c).calledBy, `${mod.path}#${TOP}`);
  for (const imp of mod.imports) {
    const t = modules.get(imp.from);
    if (t) pushOnce(t.importedBy, mod.path);
  }
}
for (const fn of functions.values()) {
  fn.calls.sort(byId);
  fn.calledBy.sort(byId);
}
for (const mod of modules.values()) mod.importedBy.sort(byId);

// ---------------------------------------------------------------------------
// Indexes across modules
// ---------------------------------------------------------------------------

const allUsers = [
  ...[...modules.values()].map((m) => ({ id: `${m.path}#${TOP}`, uses: m.top })),
  ...[...functions.values()].map((f) => ({ id: f.id, uses: f }))
];

function index(collect) {
  const map = new Map();
  for (const { id, uses } of allUsers) {
    for (const [key, role] of collect(uses)) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, {});
      const e = map.get(key);
      (e[role] = e[role] || []).push(id);
    }
  }
  for (const e of map.values()) for (const k of Object.keys(e)) e[k].sort(byId);
  return new Map([...map.entries()].sort((a, b) => byId(a[0], b[0])));
}

const settingsIndex = index((u) => [
  ...u.settings.read.map((k) => [k, 'read']),
  ...u.settings.write.map((k) => [k, 'write']),
  ...u.settings.listen.map((k) => [k, 'listen']),
  ...u.settings.other.map((k) => [k, 'other'])
]);
const eventsIndex = index((u) => [
  ...u.events.emit.map((k) => [k, 'emit']),
  ...u.events.listen.map((k) => [k, 'listen'])
]);
const selectorsIndex = index((u) => u.selectors.map((k) => [k, 'use']));
const hooksIndex = index((u) => u.hooks.map((k) => [k, 'install']));

// Every setting, in config-options.js order. Keys with no code of their own
// that a pattern covers (shortcut_key_*, *Color) are listed together under it.
const patterns = [...settingsIndex.keys()].filter((k) => k.includes('*'));
const merge = (into, from) => {
  for (const [role, ids] of Object.entries(from || {})) {
    into[role] = [...new Set([...(into[role] || []), ...ids])].sort(byId);
  }
  return into;
};
const settingRows = [];
const covered = new Set();
for (const [key, opt] of configOptions) {
  if (covered.has(key)) continue;
  const family = settingsIndex.has(key) ? null : patterns.find((p) => patternRe(p).test(key));
  if (family) {
    const keys = settingKeys.filter((k) => patternRe(family).test(k) && !settingsIndex.has(k));
    for (const k of keys) covered.add(k);
    const users = {};
    for (const p of patterns) {
      if (keys.some((k) => patternRe(p).test(k))) merge(users, settingsIndex.get(p));
    }
    settingRows.push({ key: family, keys, label: null, default: null, users });
    continue;
  }
  const users = merge({}, settingsIndex.get(key));
  for (const p of patterns) if (patternRe(p).test(key)) merge(users, settingsIndex.get(p));
  settingRows.push({ key, keys: [key], label: opt.desc, default: opt.default, users });
}

// SELECTORS, with the note each entry has in selectors.js.
const selectorTable = new Map();
{
  const mod = modules.get('core/selectors.js');
  const decl =
    mod &&
    mod._sf.statements.find(
      (s) =>
        ts.isVariableStatement(s) &&
        s.declarationList.declarations[0].name.getText() === 'SELECTORS'
    );
  let obj = decl && decl.declarationList.declarations[0].initializer;
  while (obj && (ts.isAsExpression(obj) || ts.isParenthesizedExpression(obj))) {
    obj = obj.expression;
  }
  if (obj && ts.isObjectLiteralExpression(obj)) {
    for (const p of obj.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const v = p.initializer;
      selectorTable.set(unquote(p.name.getText()), {
        value:
          ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : v.getText(),
        note: firstSentence(leadingComment(mod._text, p))
      });
    }
  }
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

const missing = [...functions.values()].filter(
  (f) => !f.description && !UNDESCRIBED_OK.some((p) => f.module.startsWith(p))
);

const compactUses = (u) => {
  const out = {};
  if (u.calls.length) out.calls = u.calls;
  const s = Object.fromEntries(Object.entries(u.settings).filter(([, v]) => v.length));
  if (Object.keys(s).length) out.settings = s;
  const e = Object.fromEntries(Object.entries(u.events).filter(([, v]) => v.length));
  if (Object.keys(e).length) out.events = e;
  for (const k of ['selectors', 'browser', 'hooks']) if (u[k].length) out[k] = u[k];
  return out;
};

const selectorKeys = [...new Set([...selectorTable.keys(), ...selectorsIndex.keys()])];
const json = {
  generatedBy: 'tools/codemap.mjs (npm run codemap)',
  idFormat:
    '"<module path under src/>#<Owner.name>"; "<module>#(top level)" is the code a module runs when it is imported',
  modules: [...modules.values()].map((m) => ({
    path: m.path,
    lines: m.lines,
    header: m.header,
    imports: m.imports,
    importedBy: m.importedBy,
    exports: m.exports,
    atLoad: compactUses(m.top),
    functions: m.functions
  })),
  functions: [...functions.values()].map((f) => ({
    id: f.id,
    name: f.qualified,
    kind: f.kind + (f.async ? ', async' : ''),
    params: f.params,
    exported: f.exported,
    lines: f.lines,
    description: f.description,
    ...compactUses(f),
    ...(f.calledBy.length ? { calledBy: f.calledBy } : {})
  })),
  settings: Object.fromEntries(
    settingRows.map((r) => [
      r.key,
      {
        label: r.label,
        default: r.default,
        ...(r.keys.length > 1 || r.keys[0] !== r.key ? { keys: r.keys } : {}),
        ...r.users
      }
    ])
  ),
  allSettingsAtOnce: (settingsIndex.get('(all)') || {}).other || [],
  events: Object.fromEntries(eventsIndex),
  selectors: Object.fromEntries(
    selectorKeys.map((k) => [
      k,
      { ...(selectorTable.get(k) || {}), usedBy: (selectorsIndex.get(k) || {}).use || [] }
    ])
  ),
  hooks: Object.fromEntries([...hooksIndex].map(([k, e]) => [k, e.install]))
};

// ---------------------------------------------------------------------------
// Markdown: the index (CODEMAP.md) and one page per folder (docs/codemap/)
// ---------------------------------------------------------------------------

/** The page a module is on: its folder, two levels deep at most. */
const pageOf = (path) => {
  const dirs = path.split('/').slice(0, -1);
  return dirs.length ? dirs.slice(0, 2).join('/') : 'app';
};
/** A function id's module path and qualified name (a private #name has a # of its own). */
const splitId = (id) => [id.slice(0, id.indexOf('#')), id.slice(id.indexOf('#') + 1)];
const pageFile = (page) => page.replace(/\//g, '-') + '.md';
const slug = (s) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const inPage = (path) => {
  const page = pageOf(path);
  return page === 'app' ? path : path.slice(page.length + 1);
};
const modAnchor = (path) => 'mod-' + slug(inPage(path));
const anchorOf = (id) => {
  const [path, qual] = splitId(id);
  return qual === TOP ? modAnchor(path) : 'fn-' + slug(inPage(path) + '-' + qual);
};

// Where links are written from: null for CODEMAP.md, else a page name.
let fromPage = null;
let here = null;
const hrefTo = (path, anchor) => {
  const page = pageOf(path);
  if (fromPage === null) return `codemap/${pageFile(page)}#${anchor}`;
  return page === fromPage ? `#${anchor}` : `${pageFile(page)}#${anchor}`;
};
const link = (id) => {
  const [path, qual] = splitId(id);
  let name = path === here ? qual : `${path} › ${qual}`;
  if (qual === TOP) name = path === here ? 'at load' : `${path} (at load)`;
  return `[${name}](${hrefTo(path, anchorOf(id))})`;
};
const links = (ids) => (ids || []).map(link).join(', ');
const codes = (list) => list.map((k) => `\`${k}\``).join(', ');
const modLinks = (paths) => paths.map((p) => `[${p}](${hrefTo(p, modAnchor(p))})`).join(', ');
const esc = (s) => String(s).replace(/\|/g, '\\|');
/**
 * Comment text as Markdown: outside `code` spans, a < would start an HTML tag
 * (<body> would vanish) and a * could start emphasis, so both are escaped.
 */
const prose = (s) =>
  String(s || '')
    .split('`')
    .map((part, i) => (i % 2 ? part : part.replace(/</g, '&lt;').replace(/\*/g, '\\*')))
    .join('`');
const finish = (lines) => lines.join('\n').replace(/\n{3,}/g, '\n\n');

const usesRows = (u) => {
  const rows = [];
  if (u.calls.length) rows.push(`- **Calls:** ${links(u.calls)}`);
  if (u.calledBy && u.calledBy.length) rows.push(`- **Called by:** ${links(u.calledBy)}`);
  const s = [];
  if (u.settings.read.length) s.push('reads ' + codes(u.settings.read));
  if (u.settings.write.length) s.push('writes ' + codes(u.settings.write));
  if (u.settings.listen.length) s.push('listens to ' + codes(u.settings.listen));
  if (u.settings.other.length) s.push('uses ' + codes(u.settings.other));
  if (s.length) rows.push(`- **Settings:** ${s.join('; ')}`);
  const e = [];
  if (u.events.emit.length) e.push('creates ' + codes(u.events.emit));
  if (u.events.listen.length) e.push('listens to ' + codes(u.events.listen));
  if (e.length) rows.push(`- **Events:** ${e.join('; ')}`);
  if (u.selectors.length) rows.push(`- **Selectors:** ${codes(u.selectors)}`);
  if (u.browser.length) rows.push(`- **Browser:** ${codes(u.browser)}`);
  if (u.hooks.length) rows.push(`- **Hooks:** ${codes(u.hooks)}`);
  return rows;
};

const pages = new Map(); // page -> [module]
for (const m of modules.values()) {
  const p = pageOf(m.path);
  if (!pages.has(p)) pages.set(p, []);
  pages.get(p).push(m);
}

const out = new Map(); // file path relative to docs/ -> text

// The index.
{
  fromPage = null;
  here = null;
  const md = [];
  const fnCount = functions.size;
  const describedCount = [...functions.values()].filter((f) => f.description).length;
  md.push('# Code map');
  md.push('');
  md.push(
    "Generated from the source by `tools/codemap.mjs`; do not edit it by hand. After changing code, run `npm run codemap` (`npm test` fails while the map is out of date). A function's description is the comment right above it in the source: improve it there."
  );
  md.push('');
  md.push(
    `**${modules.size} modules, ${fnCount} named functions**, ${describedCount} of them described (the perf monitor in \`src/dev/\` is a development tool, not in release builds, and is listed in short form). This page is the index; each folder has a page in [codemap/](codemap/) with every function of its modules. The overview (boot order, the hooks, how a response flows through the filters) is [ARCHITECTURE.md](ARCHITECTURE.md); the same data for scripts is [codemap.json](codemap.json).`
  );
  md.push('');
  md.push('How to read it:');
  md.push('');
  md.push(
    '- **Named functions** are declarations, class members, functions kept in a variable or an object, and functions assigned to a property (`USP.prototype.get = function`). A function passed straight to a call (a listener, a `forEach` callback, an `events: { click }` handler) counts toward the function it sits in.'
  );
  md.push(
    '- **Calls / Called by** are the links between named functions that can be resolved from the source: calls to imports, local functions, `this.method()` and methods of an imported object, and a named function handed over as a callback (`addEventListener(type, onKey)`, `setTimeout(tick)`, `set.forEach(fn)`). A call through a parameter or a table of callbacks (`action.run(video)`, `sb.skipToPreviousSegment()`) is not resolved: search for the name.'
  );
  md.push(
    '- **At load** is what a module does when it is imported: everything outside its functions.'
  );
  md.push(
    '- **Settings**: read with `configRead`, written with `configWrite`, listened to with `configAddChangeListener`, or used another way (a key passed to a panel control, `CONFIG_KEYS.X`, a key table). `*` is the part of a key built at run time.'
  );
  md.push(
    '- **Events**: event objects created (to dispatch) and listeners added. **Selectors**: entries of `SELECTORS` (`src/core/selectors.js`). **Browser**: timers, observers, DOM queries, layout reads, storage. **Hooks**: built-ins replaced or added, and `window.__*` diagnostics published.'
  );
  md.push('');
  md.push('## Contents');
  md.push('');
  md.push(
    '- [Modules](#modules) · [Settings](#settings) · [Events](#events) · [YouTube selectors](#youtube-selectors) · [Hooks and diagnostics](#hooks-and-diagnostics)'
  );
  md.push('- Pages: ' + [...pages.keys()].map((p) => `[${p}](codemap/${pageFile(p)})`).join(' · '));
  md.push('');
  md.push('## Modules');
  md.push('');
  md.push('| Module | Lines | Functions | What it is |');
  md.push('| --- | ---: | ---: | --- |');
  for (const m of modules.values()) {
    md.push(
      `| ${modLinks([m.path])} | ${m.lines} | ${m.functions.length} | ${esc(prose(firstSentence(m.header)))} |`
    );
  }
  md.push('');
  md.push('## Settings');
  md.push('');
  md.push(
    'Every setting (`src/core/config-options.js`), its label in the options panel, its default, and the code that touches it.'
  );
  md.push('');
  md.push('| Setting | Label | Default | Read by | Written by | Listened to by | Used by |');
  md.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of settingRows) {
    const u = r.users || {};
    const key =
      r.keys.length > 1 || r.keys[0] !== r.key ? `\`${r.key}\` (${codes(r.keys)})` : `\`${r.key}\``;
    const def = r.default === null ? '' : `\`${esc(JSON.stringify(r.default))}\``;
    md.push(
      `| ${key} | ${esc(r.label ?? '')} | ${def} | ${links(u.read)} | ${links(u.write)} | ${links(u.listen)} | ${links(u.other)} |`
    );
  }
  if (json.allSettingsAtOnce.length) {
    md.push('');
    md.push(
      `The live object of all settings (\`configGetAll()\`) is used by ${links(json.allSettingsAtOnce)}.`
    );
  }
  md.push('');
  md.push('## Events');
  md.push('');
  md.push(
    "Events the app creates and listens to: its own (`ytaf-*`), YouTube's and the browser's."
  );
  md.push('');
  md.push('| Event | Created by | Listened to by |');
  md.push('| --- | --- | --- |');
  for (const [k, e] of eventsIndex) md.push(`| \`${k}\` | ${links(e.emit)} | ${links(e.listen)} |`);
  md.push('');
  md.push('## YouTube selectors');
  md.push('');
  md.push(
    'The `SELECTORS` table (`src/core/selectors.js`): what each entry matches, its note there, and the code that uses it. Where to look when YouTube changes its markup.'
  );
  md.push('');
  md.push('| Entry | Matches | Note | Used by |');
  md.push('| --- | --- | --- | --- |');
  for (const [k, v] of Object.entries(json.selectors)) {
    md.push(
      `| \`${k}\` | \`${esc(v.value ?? '')}\` | ${esc(prose(v.note))} | ${links(v.usedBy)} |`
    );
  }
  md.push('');
  md.push('## Hooks and diagnostics');
  md.push('');
  md.push(
    'Built-ins the app replaces or adds (polyfills), and the `window.__*` objects it publishes for the TV web inspector.'
  );
  md.push('');
  md.push('| Target | Installed by |');
  md.push('| --- | --- |');
  for (const [k, ids] of Object.entries(json.hooks)) md.push(`| \`${k}\` | ${links(ids)} |`);
  md.push('');
  out.set('CODEMAP.md', finish(md));
}

// One page per folder.
for (const [page, mods] of pages) {
  fromPage = page;
  const md = [];
  md.push(`# Code map: ${page === 'app' ? 'the entry point' : page + '/'}`);
  md.push('');
  md.push(
    `Part of the [code map](../CODEMAP.md), generated from the source by \`tools/codemap.mjs\`: do not edit it by hand.`
  );
  md.push('');
  md.push('Modules: ' + modLinks(mods.map((m) => m.path)));
  md.push('');
  for (const m of mods) {
    here = m.path;
    md.push(`<a id="${modAnchor(m.path)}"></a>`);
    md.push('');
    md.push(`## ${m.path}`);
    md.push('');
    if (m.header) {
      md.push(
        prose(m.header)
          .split('\n\n')
          .map((p) => '> ' + p)
          .join('\n>\n')
      );
      md.push('');
    }
    const local = m.imports.filter((i) => modules.has(i.from)).map((i) => i.from);
    const npm = m.imports
      .filter((i) => !modules.has(i.from) && !/\.(?:css|png|svg|json)$/.test(i.from))
      .map((i) => i.from);
    const meta = [`${m.lines} lines`];
    if (local.length) meta.push('imports ' + modLinks(local));
    if (npm.length) meta.push('npm ' + codes(npm));
    if (m.importedBy.length) meta.push('imported by ' + modLinks(m.importedBy));
    md.push(meta.join(' · '));
    md.push('');
    const top = usesRows(m.top);
    if (top.length) {
      md.push('**At load:**');
      md.push('');
      md.push(...top);
      md.push('');
    }
    const compact = COMPACT.some((p) => m.path.startsWith(p));
    for (const id of m.functions) {
      const f = functions.get(id);
      const where = `L${f.lines[0]}–${f.lines[1]}`;
      if (compact) {
        const what = f.description ? ' · ' + prose(firstSentence(f.description)) : '';
        md.push(`- <a id="${anchorOf(id)}"></a>\`${f.qualified}(${f.params})\` · ${where}${what}`);
        continue;
      }
      const flags = [f.kind + (f.async ? ', async' : '')];
      if (f.exported) flags.push('exported');
      md.push(`<a id="${anchorOf(id)}"></a>`);
      md.push(`**\`${f.qualified}(${f.params})\`** · ${flags.join(', ')} · ${where}`);
      md.push('');
      md.push(f.description ? prose(f.description) : '_No description._');
      md.push('');
      const rows = usesRows(f);
      if (rows.length) {
        md.push(...rows);
        md.push('');
      }
    }
    if (compact) md.push('');
  }
  out.set(`codemap/${pageFile(page)}`, finish(md));
}

out.set('codemap.json', JSON.stringify(json, null, 1) + '\n');

// ---------------------------------------------------------------------------
// Write, or check
// ---------------------------------------------------------------------------

// Line numbers move with every edit; the check compares everything else.
const normalize = (name, s) => {
  s = s.replace(/\r\n/g, '\n');
  if (name.endsWith('.json')) {
    try {
      return JSON.stringify(JSON.parse(s), (k, v) => (k === 'lines' ? 0 : v));
    } catch {
      return '';
    }
  }
  return s
    .replace(/L\d+–\d+/g, 'L')
    .replace(/^\d+ lines/gm, 'lines')
    .replace(/^(\| \[[^\]]+\]\([^)]+\) \| )\d+/gm, '$1');
};
const existingPages = existsSync(PAGES)
  ? readdirSync(PAGES)
      .filter((f) => f.endsWith('.md'))
      .map((f) => `codemap/${f}`)
  : [];
const stale = existingPages.filter((f) => !out.has(f));
const fnCount = functions.size;

if (CHECK) {
  let ok = true;
  if (missing.length) {
    ok = false;
    console.error(
      `${missing.length} function(s) have no description; add a comment right above each:`
    );
    for (const f of missing.slice(0, 40)) {
      console.error(`  src/${f.module}:${f.lines[0]}  ${f.qualified}`);
    }
    if (missing.length > 40) console.error(`  ... and ${missing.length - 40} more`);
  }
  const outdated = [...out].filter(([name, text]) => {
    let disk;
    try {
      disk = readFileSync(join(DOCS, name), 'utf8');
    } catch {
      return true;
    }
    return normalize(name, disk) !== normalize(name, text);
  });
  if (outdated.length || stale.length) {
    ok = false;
    const names = [...outdated.map(([n]) => n), ...stale].map((n) => 'docs/' + n);
    console.error(`The code map is out of date (${names.join(', ')}): run \`npm run codemap\`.`);
  }
  if (ok) console.log(`Code map up to date: ${modules.size} modules, ${fnCount} functions.`);
  process.exit(ok ? 0 : 1);
} else {
  mkdirSync(PAGES, { recursive: true });
  for (const f of stale) rmSync(join(DOCS, f));
  let bytes = 0;
  for (const [name, text] of out) {
    writeFileSync(join(DOCS, name), text);
    bytes += text.length;
  }
  console.log(
    `Wrote docs/CODEMAP.md, ${pages.size} pages in docs/codemap/ and docs/codemap.json (${Math.round(bytes / 1024)} KB): ${modules.size} modules, ${fnCount} functions, ${missing.length} without a description.`
  );
}
