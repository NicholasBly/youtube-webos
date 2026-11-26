// Builds each bundle flavour and runs the test scripts against it.
//
//   node tests/run-all.mjs              everything: format check, lint, types, the code map check,
//                                       the scripts that need no bundle, the legacy build + its
//                                       scripts, the webOS 22+ build + its scripts
//   node tests/run-all.mjs --quick      the scripts that need no bundle, then the webOS 22+ build
//                                       and its scripts
//   node tests/run-all.mjs --only=NAME  only the test scripts whose name contains NAME (no checks),
//                                       with just the build(s) those scripts need; combines with
//                                       --quick
//   node tests/run-all.mjs --jobs=N     how many checks and scripts run at once (default: the
//                                       number of cores, at least 2)
//
// Checks and test scripts are independent processes, so they run concurrently,
// and the legacy build starts with them because none of them needs dist/. The
// builds share dist/ (webpack empties it), so they run one at a time: once the
// legacy build is done its bundle and launcher page are copied to a temporary
// folder, and the webOS 22+ build starts while the legacy scripts run against
// the copies. Output is printed in plan order as steps finish, and the
// summary shows each step's own wall time. Within a group the scripts start
// longest first, by the times of the previous run (kept in
// node_modules/.cache), so a slow script does not start last and hold the end
// of the run. A script is killed after three times its previous run, at least
// 30 s, and a build after 120 s, and counts as failed; so does a test script that exits without its summary line
// (harness/verdict.cjs). The exit code is 1 when a check, a build or a script
// fails, or when --only matches no script. dist/ is left holding the webOS 22+ bundle, which
// is what `npm run package` packages. The benches are separate: `npm run
// bench`.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import verdict from './harness/verdict.cjs';

// How a finished step is read: exit 0 in time, and for a test script its summary line too.
const { isOk, testVerdict } = verdict;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = 'dist/webOSUserScripts/userScript.js';
// The launcher page of the legacy build, which launch-test reads.
const launcher = 'dist/index.js';
const quick = process.argv.includes('--quick');
const argValue = (flag) => process.argv.find((a) => a.startsWith(flag))?.slice(flag.length);
const only = argValue('--only=');
// The scripts mostly wait on timers rather than compute, so one per core.
const jobs = Math.max(1, Number(argValue('--jobs=')) || Math.max(2, cpus().length));
const minScriptTimeout = 30_000;
const buildTimeout = 120_000;

// A test script and the bundle it needs: null for the unit tests that load
// their sources directly, 'legacy' or 'modern' for the built bundle, which goes
// in as the first argument with its flavour second, so YTAF_FLAVOUR in the
// environment cannot point a legacy step at the other build's expectations.
const test = (needs, script) => ({
  test: script,
  needs,
  args: needs ? [bundle, needs] : []
});
const webos6 = (script) => ({ test: script, needs: 'legacy', args: [bundle, 'webos6'] });

const full = [
  { check: 'format:check', title: 'formatting (prettier --check)' },
  { check: 'lint', title: 'lint (eslint)' },
  { check: 'typecheck', title: 'types (tsc)' },
  { check: 'codemap:check', title: 'code map (docs/CODEMAP.md up to date)' },
  test(null, 'tests/unit/polyfill-conformance-test.cjs'),
  test(null, 'tests/unit/core-config-test.cjs'),
  test(null, 'tests/unit/upgrade-from-084-test.cjs'),
  test(null, 'tests/unit/core-remote-test.cjs'),
  test(null, 'tests/unit/core-webos-test.cjs'),
  test(null, 'tests/unit/core-dom-test.cjs'),
  test(null, 'tests/unit/core-page-state-test.cjs'),
  test(null, 'tests/unit/core-fetch-timeout-test.cjs'),
  test(null, 'tests/unit/core-guest-mode-test.cjs'),
  test(null, 'tests/unit/core-launch-test.cjs'),
  test(null, 'tests/unit/force-codec-test.cjs'),
  test(null, 'tests/unit/sponsorblock-labels-test.cjs'),
  test(null, 'tests/unit/sponsorblock-api-test.cjs'),
  test(null, 'tests/unit/return-dislike-format-test.cjs'),
  test(null, 'tests/unit/runner-verdict-test.cjs'),
  test(null, 'tests/unit/resolve-command-test.cjs'),
  test(null, 'tests/unit/thumbnail-capset-test.cjs'),
  test(null, 'tests/unit/buffer-limit-test.cjs'),
  test(null, 'tests/unit/stringify-hook-test.cjs'),
  test(null, 'tests/unit/adblock-text-fixes-test.cjs'),
  test(null, 'tests/unit/adblock-search-test.cjs'),
  test(null, 'tests/unit/adblock-flags-test.cjs'),
  test(null, 'tests/unit/emoji-font-test.cjs'),
  test(null, 'tests/unit/fetch-registry-test.cjs'),
  test(null, 'tests/unit/toast-test.cjs'),
  test(null, 'tests/unit/shortcut-actions-test.cjs'),
  test(null, 'tests/unit/hide-controls-test.cjs'),
  test(null, 'tests/unit/core-log-test.cjs'),
  test(null, 'tests/unit/playback-speed-test.cjs'),
  test(null, 'tests/unit/build-config-test.cjs'),
  { build: 'build', flavour: 'legacy', title: 'legacy build (webOS 3 to 6)' },
  test('legacy', 'tests/smoke/bundle-check.cjs'),
  // Each build's launcher page under its own engine.
  { test: 'tests/smoke/launch-test.cjs', needs: 'legacy', args: [launcher, 'legacy'] },
  test('legacy', 'tests/smoke/smoke.cjs'),
  // The dev-only perf-mon build, built into a folder of its own.
  test('legacy', 'tests/smoke/perf-mon-test.cjs'),
  test('legacy', 'tests/behaviour/adblock-test.cjs'),
  test('legacy', 'tests/behaviour/adblock-lifecycle-test.cjs'),
  test('legacy', 'tests/behaviour/return-dislike-test.cjs'),
  test('legacy', 'tests/behaviour/return-dislike-navigation-test.cjs'),
  test('legacy', 'tests/behaviour/thumbnail-nav-pause-test.cjs'),
  test('legacy', 'tests/behaviour/thumbnail-quality-test.cjs'),
  // The legacy bundle on webOS 6's Chrome 79: the IntersectionObserver,
  // idle-callback and AbortController paths it never takes on Chromium 38.
  webos6('tests/behaviour/return-dislike-test.cjs'),
  webos6('tests/behaviour/return-dislike-navigation-test.cjs'),
  webos6('tests/behaviour/thumbnail-quality-test.cjs'),
  webos6('tests/behaviour/thumbnail-dispatch-test.cjs'),
  test('legacy', 'tests/behaviour/thumbnail-dispatch-test.cjs'),
  test('legacy', 'tests/behaviour/thumbnail-cache-test.cjs'),
  test('legacy', 'tests/behaviour/rows-ahead-test.cjs'),
  test('legacy', 'tests/behaviour/video-quality-test.cjs'),
  test('legacy', 'tests/behaviour/auto-login-test.cjs'),
  test('legacy', 'tests/behaviour/shortcuts-watch-test.cjs'),
  test('legacy', 'tests/behaviour/sponsorblock-skip-test.cjs'),
  test('legacy', 'tests/behaviour/sponsorblock-lifecycle-test.cjs'),
  test('legacy', 'tests/behaviour/sponsorblock-ui-test.cjs'),
  test('legacy', 'tests/behaviour/sponsorblock-bar-test.cjs'),
  test('legacy', 'tests/behaviour/theme-oled-test.cjs'),
  test('legacy', 'tests/behaviour/panel-test.cjs'),
  test('legacy', 'tests/behaviour/shortcuts-router-test.cjs'),
  test('legacy', 'tests/behaviour/toast-test.cjs'),
  test('legacy', 'tests/behaviour/panel-navigation-test.cjs'),
  test('legacy', 'tests/behaviour/emoji-font-test.cjs'),
  test('legacy', 'tests/behaviour/screensaver-fix-test.cjs'),
  test('legacy', 'tests/behaviour/logo-style-test.cjs'),
  test('legacy', 'tests/behaviour/hooks-and-fixes-test.cjs'),
  test('legacy', 'tests/behaviour/dearrow-test.cjs'),
  test('legacy', 'tests/behaviour/playback-speed-test.cjs'),
  { build: 'build:modern', flavour: 'modern', title: 'webOS 22+ build' },
  test('modern', 'tests/smoke/bundle-check.cjs'),
  { test: 'tests/smoke/launch-test.cjs', needs: 'modern', args: [launcher, 'modern'] },
  test('modern', 'tests/smoke/smoke.cjs'),
  // The scripts whose features take a different path on Chrome 87 (the fetch
  // registry, requestIdleCallback, IntersectionObserver, no polyfills) run on
  // both flavours; the harness picks the user agent from the flavour argument.
  test('modern', 'tests/behaviour/adblock-test.cjs'),
  test('modern', 'tests/behaviour/adblock-lifecycle-test.cjs'),
  test('modern', 'tests/behaviour/sponsorblock-lifecycle-test.cjs'),
  test('modern', 'tests/behaviour/panel-navigation-test.cjs'),
  test('modern', 'tests/behaviour/return-dislike-test.cjs'),
  test('modern', 'tests/behaviour/return-dislike-navigation-test.cjs'),
  test('modern', 'tests/behaviour/auto-login-test.cjs'),
  test('modern', 'tests/behaviour/shortcuts-watch-test.cjs'),
  // The thumbnail engine queues on requestIdleCallback and samples with an
  // IntersectionObserver on Chrome 87; the kick, the keep-alive and the
  // wordmark run on the bundle a webOS 25 set actually gets.
  test('modern', 'tests/behaviour/thumbnail-quality-test.cjs'),
  test('modern', 'tests/behaviour/thumbnail-dispatch-test.cjs'),
  test('modern', 'tests/behaviour/thumbnail-cache-test.cjs'),
  test('modern', 'tests/behaviour/rows-ahead-test.cjs'),
  test('modern', 'tests/behaviour/thumbnail-nav-pause-test.cjs'),
  test('modern', 'tests/behaviour/video-quality-test.cjs'),
  test('modern', 'tests/behaviour/screensaver-fix-test.cjs'),
  test('modern', 'tests/behaviour/logo-style-test.cjs'),
  test('modern', 'tests/behaviour/hooks-and-fixes-test.cjs'),
  test('modern', 'tests/behaviour/dearrow-test.cjs'),
  test('modern', 'tests/behaviour/playback-speed-test.cjs')
];

const scriptName = (script) => script.replace(/^tests\//, '').replace(/\.cjs$/, '');
// A script on the webOS 22+ bundle, or on the legacy one under webOS 6, is
// named for it; the runs of one script are told apart that way.
const RUN_LABELS = { modern: ' (modern)', webos6: ' (webOS 6)' };
const stepName = (step) => scriptName(step.test) + (RUN_LABELS[step.args[1]] || '');

// Each script's time in the previous run, for starting the longest first.
const timingsFile = join(root, 'node_modules', '.cache', 'run-all-timings.json');
let previousMs = {};
try {
  previousMs = JSON.parse(readFileSync(timingsFile, 'utf8'));
} catch {
  // No earlier run: plan order.
}
const expectedMs = (step) => previousMs[stepName(step)] ?? Number.MAX_SAFE_INTEGER;
// Three times the previous run, at least 30 s: a script that has grown to
// 20 s is not killed by a loaded machine.
const scriptTimeout = (step) => Math.max(minScriptTimeout, 3 * (previousMs[stepName(step)] || 0));
const longestFirst = (steps) => steps.slice().sort((a, b) => expectedMs(b) - expectedMs(a));

let plan = quick
  ? full.filter((step) => (step.test && step.needs !== 'legacy') || step.flavour === 'modern')
  : full;
if (only != null) {
  const picked = plan.filter((step) => step.test && scriptName(step.test).includes(only));
  if (picked.length === 0) {
    console.log(`no test script name contains "${only}"; the scripts are:`);
    const names = new Set(plan.filter((step) => step.test).map((step) => scriptName(step.test)));
    for (const name of names) console.log('  ' + name);
    process.exit(1);
  }
  plan = plan.filter(
    (step) => picked.includes(step) || (step.build && picked.some((s) => s.needs === step.flavour))
  );
}

const startedAll = Date.now();
const results = [];
let failed = false;
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

// Under `npm run`, npm_execpath is npm's own entry script, which node runs
// directly. Otherwise the npm on PATH is a .cmd shim on Windows, which only a
// shell resolves; the command goes in as one string because a shell with a
// separate argument list is deprecated (DEP0190).
const npmCommand = (script) =>
  process.env.npm_execpath
    ? [process.execPath, [process.env.npm_execpath, 'run', script], false]
    : [`npm run ${script}`, [], true];

function kill(child) {
  if (process.platform === 'win32') {
    // Takes the whole tree: npm and the webpack or node it started.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGKILL');
  }
}

function run([command, args, shell], timeout) {
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: root, shell });
    let output = '';
    let timedOut = false;
    let settled = false;
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      timedOut = true;
      kill(child);
    }, timeout);
    const finish = (status, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ status, output, error, timedOut, ms: Date.now() - started });
    };
    child.on('error', (error) => finish(null, error));
    child.on('close', (status) => finish(status, null));
  });
}

/** Queues tasks so that at most `limit` run at once; each call resolves to its task's result. */
function createLimiter(limit) {
  const queue = [];
  let active = 0;
  const next = () => {
    if (active >= limit || queue.length === 0) return;
    active++;
    const { task, settle } = queue.shift();
    task()
      .then(settle, settle)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((settle) => {
      queue.push({ task, settle });
      next();
    });
}
const limited = createLimiter(jobs);

function record(result) {
  results.push(result);
  if (!result.ok) failed = true;
}

// Why a step failed before its own output is worth showing: killed by the
// timeout, or never started.
const failureNote = ({ error, timedOut, ms }) => {
  if (timedOut) return `timed out after ${Math.round(ms / 1000)}s`;
  return error ? error.message : null;
};

function reportCheck(step, outcome) {
  process.stdout.write(`\n==> ${step.title}\n`);
  const ok = isOk(outcome);
  console.log(
    ok ? '    ok' : '    FAILED\n' + (failureNote(outcome) || outcome.output.slice(-3000))
  );
  record({ name: step.title, kind: 'check', ok, ms: outcome.ms });
}

function reportBuild(step, outcome) {
  process.stdout.write(`\n==> ${step.title}\n`);
  const ok = isOk(outcome);
  console.log(
    ok ? '    compiled' : '    FAILED\n' + (failureNote(outcome) || outcome.output.slice(-2000))
  );
  record({ name: step.title, kind: 'build', ok, ms: outcome.ms });
}

function reportTest(step, outcome) {
  const name = stepName(step);
  process.stdout.write(`\n--- ${name}\n`);
  const lines = outcome.output.split('\n');
  const { summary, ok } = testVerdict(outcome);
  // harness/report.cjs prints "FAIL <name>" and indents the detail of a failure
  // by five spaces; those lines are shown, the PASS lines are not.
  for (const l of lines) if (/^FAIL /.test(l.trim()) || /^ {5}\S/.test(l)) console.log('    ' + l);
  console.log(
    '    ' +
      (failureNote(outcome) ||
        summary ||
        `exit ${outcome.status}${isOk(outcome) ? ', no summary line: the report never finished' : ''}`)
  );
  if (!ok && !summary && outcome.output.trim()) console.log(outcome.output.slice(-1500));
  record({ name, kind: 'test', ok, summary: ok ? summary : '', ms: outcome.ms });
}

const runCheck = (step) => limited(() => run(npmCommand(step.check), minScriptTimeout));
const runBuild = (step) => run(npmCommand(step.build), buildTimeout);
// `files` maps the bundle and the launcher to where the script reads them.
const runTest = (step, files) =>
  limited(() =>
    run(
      [process.execPath, [step.test, ...step.args.map((a) => files[a] || a)], false],
      scriptTimeout(step)
    )
  );

// Every step gets a promise of its outcome (null when a failed build made it
// moot); the loop at the end awaits them in plan order and prints as it goes.
const outcomes = new Map();
const legacyBuild = plan.find((step) => step.build && step.flavour === 'legacy');
const modernBuild = plan.find((step) => step.build && step.flavour === 'modern');
let tempDir = null;

for (const step of plan) if (step.check) outcomes.set(step, runCheck(step));
const inDist = { [bundle]: bundle, [launcher]: launcher };
// The scripts of each group are queued longest first; the report keeps plan order.
const tests = (needs) => longestFirst(plan.filter((step) => step.test && step.needs === needs));
for (const step of tests(null)) outcomes.set(step, runTest(step, inDist));

const legacyBuilt = legacyBuild ? runBuild(legacyBuild) : Promise.resolve(null);
if (legacyBuild) outcomes.set(legacyBuild, legacyBuilt);

// Where the legacy scripts read the bundle and the launcher: copies when the
// webOS 22+ build is going to empty dist/ while they run, dist/ itself otherwise.
const legacyFiles = legacyBuilt.then((outcome) => {
  if (!outcome || !isOk(outcome) || !modernBuild) return inDist;
  tempDir = mkdtempSync(join(tmpdir(), 'youtube-webos-tests-'));
  const copies = {
    [bundle]: join(tempDir, 'userScript.legacy.js'),
    [launcher]: join(tempDir, 'index.legacy.js')
  };
  for (const [from, to] of Object.entries(copies)) copyFileSync(join(root, from), to);
  return copies;
});
for (const step of tests('legacy')) {
  outcomes.set(
    step,
    legacyFiles.then(async (files) => {
      const built = await legacyBuilt;
      return built && isOk(built) ? runTest(step, files) : null;
    })
  );
}

// The webOS 22+ build starts as soon as the legacy files are copied. A failed
// build skips the rest of the plan, like a broken source would break the next
// build too.
const modernBuilt = legacyFiles.then(async () => {
  if (!modernBuild) return null;
  const earlier = await legacyBuilt;
  return earlier && !isOk(earlier) ? null : runBuild(modernBuild);
});
if (modernBuild) outcomes.set(modernBuild, modernBuilt);
for (const step of tests('modern')) {
  outcomes.set(
    step,
    modernBuilt.then((outcome) => (outcome && isOk(outcome) ? runTest(step, inDist) : null))
  );
}

let skipped = 0;
for (const step of plan) {
  const outcome = await outcomes.get(step);
  if (outcome === null) {
    skipped++;
    continue;
  }
  if (step.check) reportCheck(step, outcome);
  else if (step.build) reportBuild(step, outcome);
  else reportTest(step, outcome);
}
if (tempDir) rmSync(tempDir, { recursive: true, force: true });
// This run's script times, for the order of the next one.
try {
  const times = Object.assign({}, previousMs);
  for (const r of results) if (r.kind === 'test') times[r.name] = r.ms;
  mkdirSync(dirname(timingsFile), { recursive: true });
  writeFileSync(timingsFile, JSON.stringify(times));
} catch {
  // A read-only tree only loses the ordering.
}
if (skipped) console.log(`\n==> ${skipped} step(s) skipped after the failed build`);

console.log(`\n==> summary (${seconds(Date.now() - startedAll)} wall)`);
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  const mark = r.ok ? 'ok  ' : 'FAIL';
  console.log(
    `  ${mark}  ${r.name.padEnd(width)}  ${seconds(r.ms).padStart(6)}  ${r.summary || r.kind}`
  );
}
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `\n${bad} step(s) failed` : '\nall steps passed');
process.exit(failed ? 1 : 0);
