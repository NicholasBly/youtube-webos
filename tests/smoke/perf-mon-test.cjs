/**
 * The perf-mon build (`npm run build:perf`, src/dev/perf-mon.js): the dev-only
 * diagnostics bundle builds, loads on the oldest engine (Chromium 38) without
 * an error, installs window.__PERF, opens and closes its cluster, sweeps the
 * features and writes a report. The release builds alias the module away and
 * bundle-check covers them; this keeps the dev build from rotting unseen.
 *
 * It builds into a folder of its own, so dist/ keeps the bundle the other
 * scripts of the run test.
 *
 * Run: node tests/smoke/perf-mon-test.cjs [release bundle]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
// The release bundle the runner hands this script (a copy of the legacy build:
// the webOS 22+ build may be emptying dist/ meanwhile), else dist/.
const releaseBundle = process.argv[2] || path.join(ROOT, 'dist/webOSUserScripts/userScript.js');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-webos-perf-'));
const cli = path.join(ROOT, 'node_modules', 'webpack-cli', 'bin', 'cli.js');
const build = spawnSync(
  process.execPath,
  [cli, '--mode=production', '--env', 'perf', '--output-path', out],
  { cwd: ROOT, encoding: 'utf8' }
);

// The harness reads the bundle and the flavour from these two arguments.
process.argv[2] = path.join(out, 'webOSUserScripts', 'userScript.js');
process.argv[3] = 'legacy';
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

(async () => {
  try {
    t(
      'the perf build compiles',
      build.status === 0 && fs.existsSync(process.argv[2]),
      (build.stderr || build.stdout || '').slice(-600)
    );
    if (build.status !== 0) return;

    const release = fs.readFileSync(releaseBundle, 'utf8');
    t('the release bundle carries no perf-mon (aliased away)', release.indexOf('__PERF') === -1);

    const { win } = createPage({ layout: true });
    await wait(100);
    const P = win.__PERF;
    t('window.__PERF is installed', !!P && P.__installed === true);
    if (!P) return;

    P.show();
    const root = Array.from(win.document.body.children).find(
      (el) => el.style.display === 'block' && /DIAGNOSTICS/.test(el.textContent)
    );
    t('show() puts the cluster on the page', !!root);
    P.hide();
    t('hide() takes it down again', !!root && root.style.display === 'none');

    const features = P.sweep ? P.sweep() : null;
    t('the feature sweep runs', features != null);

    const rep = P.report();
    const parsed = typeof rep === 'string' ? JSON.parse(rep) : rep;
    t(
      'report() writes the ytaf-perfmon/2 report',
      !!parsed && parsed.schema === 'ytaf-perfmon/2',
      JSON.stringify(parsed).slice(0, 200)
    );
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  report.finish();
})();
