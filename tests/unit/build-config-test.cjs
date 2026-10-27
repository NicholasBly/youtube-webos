/**
 * webpack.config.js as a unit, without building: the version label the panel
 * heading shows (package.json's version; " bN" for test build N, from
 * `--env build=N` or YTAF_BUILD), and a build number that is not a whole
 * number stopping the build.
 *
 * Run: node tests/unit/build-config-test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { createReport } = require('../harness/report.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const ROOT = path.resolve(__dirname, '..', '..');
const { version } = require(path.join(ROOT, 'package.json'));
const APPINFO = path.join(ROOT, 'assets', 'appinfo.json');

(async () => {
  const makeConfig = (await import(pathToFileURL(path.join(ROOT, 'webpack.config.js')).href))
    .default;
  const saved = process.env.YTAF_BUILD;
  const savedBrowsers = process.env.BROWSERSLIST;
  delete process.env.YTAF_BUILD;

  /** The config for `env`, its DefinePlugin values and its assets CopyPlugin pattern. */
  const configFor = (env) => {
    const [config] = makeConfig(env);
    const define = config.plugins.find((p) => p.constructor.name === 'DefinePlugin');
    const copy = config.plugins.find((p) => p.constructor.name === 'CopyPlugin');
    const assets = copy.patterns.find((p) => p.context === 'assets');
    return { define: define.definitions, assets };
  };

  try {
    let c = configFor({});
    eq('a release: the label is the version alone', JSON.parse(c.define.__YTAF_VERSION__), version);

    c = configFor({ build: '2' });
    eq(
      '--env build=2: the label carries b2',
      JSON.parse(c.define.__YTAF_VERSION__),
      `${version} b2`
    );

    process.env.YTAF_BUILD = '7';
    c = configFor({ modern: true });
    eq(
      'YTAF_BUILD=7 (the test-build workflow): b7',
      JSON.parse(c.define.__YTAF_VERSION__),
      `${version} b7`
    );
    c = configFor({ build: '3' });
    eq('--env build wins over YTAF_BUILD', JSON.parse(c.define.__YTAF_VERSION__), `${version} b3`);
    delete process.env.YTAF_BUILD;

    let threw = null;
    try {
      configFor({ build: 'two' });
    } catch (e) {
      threw = e;
    }
    t(
      'a build number that is not a whole number stops the build',
      !!threw && /whole number/.test(threw.message),
      threw && threw.message
    );

    t(
      'the regular build leaves appinfo.json to the copy as it is (the netcast trust level stays)',
      !configFor({}).assets.transform &&
        JSON.parse(fs.readFileSync(APPINFO, 'utf8')).trustLevel === 'netcast'
    );
  } finally {
    if (saved === undefined) delete process.env.YTAF_BUILD;
    else process.env.YTAF_BUILD = saved;
    if (savedBrowsers === undefined) delete process.env.BROWSERSLIST;
    else process.env.BROWSERSLIST = savedBrowsers;
  }

  report.finish();
})();
