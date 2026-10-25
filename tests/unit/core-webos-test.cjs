/**
 * core/webos.js as a unit in a vm sandbox: the version from the platform
 * year, the _TV_O18 firmware token, the Chrome-only simulator branch, the
 * default, the cache.
 *
 * Run: node tests/unit/core-webos-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { CORE, loggerStub } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/webos.js ---------------------------------------------------------------
  {
    const detect = (userAgent, extra) => {
      const { createLogger, lines } = loggerStub();
      const { sandbox, get } = loadSources(
        [CORE('webos.js')],
        Object.assign({ createLogger, window: { navigator: { userAgent } } }, extra)
      );
      return { sb: sandbox, get, lines };
    };
    const base = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) ';

    let r = detect(base + 'Chrome/38.0.2125.122 Safari/537.36 WebAppManager webOS.TV-2016');
    t(
      'webOS.TV-2016 is webOS 3: legacy, not 25, not the simulator',
      r.sb.getWebOSVersion() === 3 &&
        r.sb.isLegacyWebOS() &&
        !r.sb.isWebOS25() &&
        r.get('simulatorMode') === false,
      String(r.sb.getWebOSVersion())
    );
    t(
      'the platform-year branch logs the year it matched',
      r.lines.info.some((l) => l === '[WebOS] Detected webOS 3 via platform year: 2016'),
      r.lines.info.join(' | ')
    );

    r = detect(base + 'Chrome/94.0.4606.31 Safari/537.36 WebAppManager webOS.TV-2023');
    t(
      'webOS.TV-2023 is webOS 23: neither legacy nor 25',
      r.sb.getWebOSVersion() === 23 && !r.sb.isLegacyWebOS() && !r.sb.isWebOS25()
    );

    r = detect(base + 'Chrome/120.0.6099.286 Safari/537.36 WebAppManager webOS.TV-2025');
    t(
      'webOS.TV-2025 is webOS 25 by the year, before the Chrome branch runs',
      r.sb.getWebOSVersion() === 25 && r.sb.isWebOS25() && r.get('simulatorMode') === false
    );

    r = detect(base + 'Chrome/120.0.6099.286 Safari/537.36 WebAppManager _TV_O18/33.20.10');
    t(
      'no year, _TV_O18 firmware 33+: webOS 25 via the firmware token',
      r.sb.getWebOSVersion() === 25 &&
        r.get('simulatorMode') === false &&
        r.lines.info.some((l) => /via firmware version: 33\.20\.10/.test(l)),
      r.lines.info.join(' | ')
    );

    r = detect(base + 'Safari/537.36 WebAppManager _TV_O18/32.99.1');
    t(
      '_TV_O18 firmware below 33 and no Chrome token: the default 6, with a warning',
      r.sb.getWebOSVersion() === 6 &&
        r.lines.warn.some((l) => /Could not detect webOS version/.test(l)),
      r.lines.warn.join(' | ')
    );

    r = detect(base + 'Chrome/130.0.0.0 Safari/537.36');
    t(
      'Chrome 120+ alone is the webOS 25 simulator',
      r.sb.getWebOSVersion() === 25 && r.get('simulatorMode') === true && r.sb.isWebOS25()
    );
    r = detect(base + 'Chrome/53.0.2785.143 Safari/537.36');
    t(
      'Chrome 53 alone is the webOS 4 simulator',
      r.sb.getWebOSVersion() === 4 && r.get('simulatorMode') === true
    );
    r = detect(base + 'Chrome/79.0.3945.79 Safari/537.36');
    t(
      'Chrome between 54 and 119 alone is the webOS 6 simulator',
      r.sb.getWebOSVersion() === 6 && r.get('simulatorMode') === true && r.sb.isLegacyWebOS()
    );
    r = detect(base + 'Chrome/130.0.0.0 Safari/537.36 WebAppManager webOS.TV-2026');
    t(
      'webOS.TV-2026 is webOS 26 by the year: a real set, not the simulator',
      r.sb.getWebOSVersion() === 26 && r.get('simulatorMode') === false && !r.sb.isLegacyWebOS(),
      String(r.sb.getWebOSVersion())
    );
    r = detect(base + 'Chrome/38.0.2125.122 Safari/537.36 WebAppManager webOS.TV-2015');
    t(
      'a platform year before the table falls through to the Chrome branch',
      r.sb.getWebOSVersion() === 4 && r.get('simulatorMode') === true
    );

    const nav = { userAgent: 'Mozilla/5.0 (Unknown)' };
    const { createLogger, lines } = loggerStub();
    const { sandbox } = loadSources([CORE('webos.js')], {
      createLogger,
      window: { navigator: nav }
    });
    t(
      'no token at all: 6, with the warning, and simulatorMode stays off',
      sandbox.getWebOSVersion() === 6 && lines.warn.length === 1 && !sandbox.isWebOS25()
    );
    nav.userAgent = base + 'Chrome/120.0.6099.286 Safari/537.36 WebAppManager webOS.TV-2025';
    t(
      'the version is cached: a changed user agent is not read again',
      sandbox.getWebOSVersion() === 6 && lines.warn.length === 1
    );

    t(
      'HAS_ABORT_CONTROLLER follows the global',
      detect('x').get('HAS_ABORT_CONTROLLER') === false &&
        detect('x', { AbortController }).get('HAS_ABORT_CONTROLLER') === true
    );
  }

  report.finish();
})();
