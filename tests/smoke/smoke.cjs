/**
 * Loads a built bundle in a jsdom page shaped like the YouTube TV app and
 * asserts it survives evaluation and installs what it should: the JSON hooks,
 * the stylesheet (one <style>, written once), and for the legacy flavour the
 * polyfills. The legacy flavour
 * runs under the Chromium 38 downgrade; the modern one (webOS 22+, Chrome 87)
 * runs on a modern engine, where the point is the code paths that only exist
 * there (no polyfills.js, no emoji-font, no buffer-limit), which once shipped a
 * crash the legacy smoke could not see.
 *
 * Run: node tests/smoke/smoke.cjs [bundle] [legacy|modern]
 */
const fs = require('fs');
const path = require('path');
const { createPage, flavour } = require('../harness/page.cjs');
const { makeBrowse } = require('../harness/gen-payload.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, toasts } = require('../harness/fixtures.cjs');

const legacy = flavour === 'legacy';
// The bundle under test, as page.cjs reads it: the first argument, else dist/.
const BUNDLE =
  process.argv[2] || path.resolve(__dirname, '..', '..', 'dist/webOSUserScripts/userScript.js');
const report = createReport();
const t = report.check;

const HTML = `<!doctype html><html><head><title>YouTube</title></head>
<body class="WEB_PAGE_TYPE_BROWSE">
<ytlr-app>
  <ytlr-tv-surface-content>
    <ytlr-thumbnail-details style="background-image:url('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')"></ytlr-thumbnail-details>
    <ytlr-thumbnail-details style="background-image:url('https://i.ytimg.com/vi/aQw4w9WgXcQ/mqdefault.jpg')"></ytlr-thumbnail-details>
    <div id="ytlr-player__player-container">
      <video id="v1"></video>
    </div>
  </ytlr-tv-surface-content>
</ytlr-app>
</body></html>`;

// jsdom's own Element#matches, to see the bundle leave it alone; a MediaSource
// (jsdom has none) for the buffer limit of webOS 3 and 4 to patch.
let nativeMatches = null;
let nativeAddSourceBuffer = null;
let nativeIsTypeSupported = null;
let nativeCanPlayType = null;
// Every change to the children of a node, from before the bundle runs: how
// often the bundle's stylesheet was written.
const childRecords = [];
let page = null;
let threw = null;
try {
  page = createPage({
    html: HTML,
    raf: 'timeout',
    xhr: 'error',
    // The startup timers (the per-video start at 500 ms, the welcome toast at
    // 2 s) at a tenth, so they run inside the script's window.
    timers: { scale: 10, from: 400 },
    setup(win) {
      nativeMatches = win.Element.prototype.matches;
      win.MediaSource = class {};
      nativeAddSourceBuffer = function () {
        return {};
      };
      win.MediaSource.prototype.addSourceBuffer = nativeAddSourceBuffer;
      // What force-codec wraps once, for the life of the page.
      nativeIsTypeSupported = () => true;
      win.MediaSource.isTypeSupported = nativeIsTypeSupported;
      nativeCanPlayType = win.HTMLMediaElement.prototype.canPlayType;
      new win.MutationObserver((records) => {
        for (const r of records) childRecords.push(r);
      }).observe(win.document, { childList: true, subtree: true });
    }
  });
} catch (e) {
  threw = e;
}

/** Whether `require(` appears anywhere other than as a property or part of a longer name. */
function hasBareRequire(src) {
  let i = -1;
  while ((i = src.indexOf('require(', i + 1)) !== -1) {
    const before = i === 0 ? '' : src[i - 1];
    if (!(before === '.' || before === '_' || before === '$' || /[a-z0-9]/i.test(before))) {
      return true;
    }
  }
  return false;
}

(async () => {
  t(
    `${flavour} bundle loads without throwing`,
    !threw,
    threw && (threw.stack || String(threw)).split('\n').slice(0, 4).join(' | ')
  );
  if (!page) report.finish();
  const { win } = page;

  t('JSON.parse hooked', win.JSON.parse.toString().indexOf('native code') === -1);
  t('JSON.stringify hooked', win.JSON.stringify.toString().indexOf('native code') === -1);

  if (legacy) {
    t(
      'Element#matches left as the engine has it (Chrome 34, not polyfilled)',
      win.Element.prototype.matches === nativeMatches
    );
    t('Node#isConnected polyfilled', 'isConnected' in win.Node.prototype);
    t(
      'the buffer limit is installed: MediaSource#addSourceBuffer is patched',
      win.MediaSource.prototype.addSourceBuffer !== nativeAddSourceBuffer
    );
  } else {
    t(
      'no buffer limit on the modern bundle: MediaSource#addSourceBuffer is untouched',
      win.MediaSource.prototype.addSourceBuffer === nativeAddSourceBuffer
    );
    // What this build aliases away is bundle-check's.
    const src = fs.readFileSync(BUNDLE, 'utf8');
    t('no bare require() in the modern bundle', !hasBareRequire(src));
  }

  // force-codec's capability hooks: nothing on Auto (the default), and with a
  // codec forced the probes are wrapped and decline the others.
  t(
    'codec on Auto: MediaSource.isTypeSupported and canPlayType stay as the engine has them',
    win.MediaSource.isTypeSupported === nativeIsTypeSupported &&
      win.HTMLMediaElement.prototype.canPlayType === nativeCanPlayType
  );
  {
    // Every filter off: the codec filter alone takes the parse hook.
    const forced = createPage({
      html: HTML,
      raf: 'timeout',
      xhr: 'error',
      config: {
        forceVideoCodec: 'avc',
        enableAdBlock: false,
        enableLegacyEmojiFix: false,
        upgradeThumbnails: false,
        hideEndcards: false
      },
      setup(w) {
        w.MediaSource = class {};
        w.MediaSource.prototype.addSourceBuffer = () => ({});
        w.MediaSource.isTypeSupported = () => true;
      }
    }).win;
    const probe = forced.MediaSource.isTypeSupported;
    t(
      'codec forced to AVC: the MSE probe declines AV1 and still answers AVC',
      probe('video/mp4; codecs="av01.0.08M.08"') === false &&
        probe('video/mp4; codecs="avc1.640028"') === true
    );
    t(
      'and canPlayType is wrapped as well',
      forced.HTMLMediaElement.prototype.canPlayType('video/mp4; codecs="av01.0.08M.08"') === ''
    );
    // A player response through the page's hooked JSON.parse: the offer narrowed.
    const fmt = (itag, mimeType) => ({ itag, mimeType });
    const player = forced.JSON.parse(
      JSON.stringify({
        responseContext: { _pad: 'x'.repeat(600) },
        streamingData: {
          adaptiveFormats: [
            fmt(1, 'video/mp4; codecs="av01.0.08M.08"'),
            fmt(2, 'video/webm; codecs="vp9"'),
            fmt(3, 'video/mp4; codecs="avc1.640028"'),
            fmt(4, 'audio/mp4; codecs="mp4a.40.2"')
          ]
        }
      })
    );
    t(
      'codec forced, every filter off: a player response keeps the AVC video and the audio',
      player.streamingData.adaptiveFormats.map((f) => f.itag).join(',') === '3,4',
      player.streamingData.adaptiveFormats.map((f) => f.itag).join(',')
    );
  }

  // The bundle's stylesheets: one <style>, its text written once, after the
  // bundle has run (a text node per stylesheet had the engine parse the
  // growing sheet again for each).
  await wait(20);
  const sheets = Array.from(win.document.querySelectorAll('style')).filter(
    (s) => s.textContent.indexOf('.ytaf-ui-container') !== -1
  );
  const writes =
    sheets.length === 1 ? childRecords.filter((r) => r.target === sheets[0]).length : -1;
  t(
    "the bundle's stylesheets are in one <style>, written once",
    sheets.length === 1 && sheets[0].childNodes.length === 1 && writes <= 1,
    `${sheets.length} element(s), ${sheets[0] ? sheets[0].childNodes.length : 0} text node(s), ${writes} write(s)`
  );
  t(
    'and it holds the stylesheets of every part: the panel, the toasts, SponsorBlock',
    sheets.length === 1 &&
      ['.ytaf-ui-container', '.ytaf-toast', '.sb-segments-popup'].every(
        (sel) => sheets[0].textContent.indexOf(sel) !== -1
      )
  );

  // The hooks on realistic payloads; what the filters do is adblock-test's job.
  let parsed = null;
  let parseErr = null;
  try {
    parsed = win.JSON.parse(page.NS(makeBrowse({ shelves: 2, tilesPer: 3 })));
  } catch (e) {
    parseErr = String(e);
  }
  t('hooked JSON.parse handles a browse payload', !!parsed && !!parsed.contents, parseErr);

  let strOk = false;
  let strErr = null;
  try {
    const body = {
      context: { client: {} },
      videoId: 'abc',
      playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } }
    };
    const s = win.JSON.stringify(body);
    strOk =
      s.indexOf('isInlinePlaybackNoAd') !== -1 &&
      body.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd === undefined;
  } catch (e) {
    strErr = String(e);
  }
  t('hooked JSON.stringify injects and restores the flag', strOk, strErr);

  // core/log.js against the bundle (the module as a unit is
  // tests/unit/core-log-test.cjs): the modules' tagged lines with the flag set
  // before load, nothing without it. The legacy flavour only: one bundle shows it.
  if (legacy) {
    const captured = (flag) => {
      const lines = [];
      createPage({
        html: HTML,
        xhr: 'error',
        setup(w) {
          if (flag) w.__ytaf_debug__ = true;
          w.console.log = (...a) => lines.push(a.join(' '));
          w.console.info = (...a) => lines.push(a.join(' '));
        }
      });
      return lines;
    };
    const on = captured(true);
    t(
      'with __ytaf_debug__ set before load the modules log their tagged lines',
      on.length > 0 &&
        on.every((l) => /^\[[a-z]+\] /i.test(l)) &&
        on.some((l) => /^\[WebOS\] Detected webOS /.test(l)),
      on.slice(0, 4).join(' | ')
    );
    const off = captured(false);
    t(
      'without the flag the same load prints nothing to console.log or console.info',
      off.length === 0,
      off.slice(0, 3).join(' | ')
    );
  }

  // The deferred work (frames, timers, microtasks) runs before the report's
  // own check that no page logged an error: the welcome toast (2 s after load,
  // 200 ms here) is the last of the startup timers.
  const welcomed = await waitFor(
    () => toasts(win).some((m) => /to open the settings/.test(m)),
    2000
  );
  t('the startup timers ran: the welcome toast is up', !!welcomed, toasts(win).join(' | '));
  await wait(50);
  report.finish();
})();
