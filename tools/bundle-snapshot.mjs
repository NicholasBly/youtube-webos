#!/usr/bin/env node
// Shows whether a change (a dependency update, mostly) changes the code that
// runs on the TV.
//
//   npm run bundle:snapshot   build both flavours and remember what they hold
//   (update dependencies: npm update, npm install x@latest, npm audit fix, ...)
//   npm run bundle:compare    build again and compare with the snapshot
//
// Only four packages ship inside the bundles (whatwg-fetch, @babel/runtime,
// @twemoji/api, tiny-sha256); everything else in package.json is a build or
// test tool, which can still change what it writes (0.6.3: a newer
// core-js-compat made Babel swap JSON.parse for core-js's JavaScript parser,
// and webOS 3 TVs parsed every YouTube response with it). The compare prints
// "identical" when the bundles are byte for byte the same, and otherwise the
// modules added, removed or resized, npm packages first, and exits with 1.
//
// The builds go to a temp folder; dist/ is not touched. The snapshot is kept
// in .bundle-snapshot/ (git-ignored), outside node_modules so `npm ci` does not
// delete it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotFile = join(root, '.bundle-snapshot', 'snapshot.json');
const mode = process.argv[2];
if (mode !== 'snapshot' && mode !== 'compare') {
  console.error('Usage: node tools/bundle-snapshot.mjs snapshot|compare');
  process.exit(2);
}

/** Builds one flavour into a temp folder: the bundle's hash and size, and its modules by size. */
function build(flavour) {
  const out = mkdtempSync(join(tmpdir(), 'ytaf-bundle-'));
  const stats = join(out, 'stats.json');
  const args = [
    join(root, 'node_modules', 'webpack-cli', 'bin', 'cli.js'),
    '--mode=production',
    '--output-path',
    out,
    `--json=${stats}`
  ];
  if (flavour === 'modern') args.push('--env', 'modern');
  const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(run.stdout.slice(-2000), run.stderr.slice(-2000));
    throw new Error(`the ${flavour} build failed`);
  }
  const bundle = readFileSync(join(out, 'webOSUserScripts', 'userScript.js'));
  let data = JSON.parse(readFileSync(stats, 'utf8'));
  if (data.children) data = data.children[0];
  const modules = {};
  const walk = (list) => {
    for (const m of list || []) {
      if (m.modules) walk(m.modules);
      else if (m.name) modules[m.name.replace(/ \+ \d+ modules$/, '')] = m.size;
    }
  };
  walk(data.modules);
  rmSync(out, { recursive: true, force: true });
  return {
    sha256: createHash('sha256').update(bundle).digest('hex'),
    bytes: bundle.length,
    modules
  };
}

/** The installed version of each package the build or the bundle uses, for the report. */
function toolVersions() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const versions = {};
  for (const name of [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {})
  ]) {
    try {
      versions[name] = JSON.parse(
        readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')
      ).version;
    } catch {
      versions[name] = 'missing';
    }
  }
  return versions;
}

const isPackage = (name) => name.includes('node_modules/');

function compareFlavour(flavour, before, after) {
  if (before.sha256 === after.sha256) {
    console.log(`  ${flavour}: identical (${after.bytes} bytes)`);
    return true;
  }
  const delta = after.bytes - before.bytes;
  console.log(
    `  ${flavour}: CHANGED ${before.bytes} -> ${after.bytes} bytes (${delta >= 0 ? '+' : ''}${delta})`
  );
  const names = new Set([...Object.keys(before.modules), ...Object.keys(after.modules)]);
  const rows = [];
  for (const name of names) {
    const a = before.modules[name];
    const b = after.modules[name];
    if (a === b) continue;
    let what = `${a} -> ${b}`;
    if (a === undefined) what = 'added';
    else if (b === undefined) what = 'removed';
    rows.push({ name, what, pkg: isPackage(name) });
  }
  // npm packages first: a module a dependency added is the 0.6.3 kind of change.
  rows.sort((x, y) => Number(y.pkg) - Number(x.pkg) || x.name.localeCompare(y.name));
  for (const r of rows.slice(0, 60)) {
    console.log(`    ${r.pkg ? '[npm] ' : '      '}${r.what.padEnd(16)} ${r.name}`);
  }
  if (rows.length > 60) console.log(`    ... and ${rows.length - 60} more`);
  if (rows.length === 0) {
    console.log('    same modules and sizes: the minifier or a helper changed the output');
  }
  return false;
}

const current = {
  createdAt: new Date().toISOString(),
  versions: toolVersions(),
  legacy: build('legacy'),
  modern: build('modern')
};

if (mode === 'snapshot') {
  mkdirSync(dirname(snapshotFile), { recursive: true });
  writeFileSync(snapshotFile, JSON.stringify(current));
  console.log(
    `Snapshot saved: legacy ${current.legacy.bytes} bytes, webOS 22+ ${current.modern.bytes} bytes.`
  );
  console.log('Update the dependencies, then run: npm run bundle:compare');
} else {
  if (!existsSync(snapshotFile)) {
    console.error('No snapshot yet: run `npm run bundle:snapshot` before updating.');
    process.exit(2);
  }
  const before = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  console.log(`Compared with the snapshot from ${before.createdAt}:`);
  const changedVersions = Object.keys(current.versions).filter(
    (k) => before.versions[k] !== current.versions[k]
  );
  for (const k of changedVersions) {
    console.log(`  ${k}: ${before.versions[k] || 'not installed'} -> ${current.versions[k]}`);
  }
  const same = [
    compareFlavour('legacy (webOS 3-6)', before.legacy, current.legacy),
    compareFlavour('webOS 22+', before.modern, current.modern)
  ].every(Boolean);
  console.log(
    same
      ? 'The code that runs on the TV is unchanged.'
      : 'The code that runs on the TV changed: check the modules above, then test on a TV (webOS 3 first).'
  );
  process.exit(same ? 0 : 1);
}
