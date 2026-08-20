/**
 * Playback speed control, against the three player shapes a TV can present:
 *   - no setPlaybackRate at all (what a gated TVHTML5 build looks like)
 *   - setPlaybackRate present but a no-op (gated server-side, API still there)
 *   - setPlaybackRate working (Cobalt-like)
 * In every case the user must end up at the rate they asked for.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

function boot(playerKind) {
  const dom = new JSDOM(
    '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
    '<div id="ytlr-player__player-container">' +
    '<div id="ytlr-player__player-container-player"></div><video></video>' +
    '</div></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.fetch = () => Promise.reject(new Error('offline'));
  win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
    enablePlaybackSpeed: true, enableAdBlock: true, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, enableLegacyEmojiFix: false,
    upgradeThumbnails: false, enableAutoLogin: false, forceHighResVideo: false
  }));
  applyChrome38Downgrade(win);

  const video = win.document.querySelector('video');
  // jsdom's <video> has no writable playbackRate; give it real semantics.
  let rate = 1;
  Object.defineProperty(video, 'playbackRate', {
    get: () => rate,
    set(v) { if (v !== rate) { rate = v; video.dispatchEvent(new win.Event('ratechange')); } },
    configurable: true
  });

  const player = win.document.getElementById('ytlr-player__player-container-player');
  const calls = [];
  if (playerKind === 'working') {
    player.setPlaybackRate = (r) => { calls.push(r); video.playbackRate = r; };
    player.getPlaybackRate = () => video.playbackRate;
    player.getAvailablePlaybackRates = () => [1];
  } else if (playerKind === 'noop') {
    player.setPlaybackRate = (r) => { calls.push(r); /* gated: does nothing */ };
    player.getAvailablePlaybackRates = () => [1];
  } // 'absent' -> no methods at all

  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, video, player, calls, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const kind of ['absent', 'noop', 'working']) {
    const { win, video, calls } = boot(kind);
    await wait(300);
    const S = win.__ytafSpeed;
    t(`[${kind}] __ytafSpeed exposed`, !!S);
    if (!S) continue;

    t(`[${kind}] setSpeed(1.5) reaches the video`,
      S.setSpeed(1.5) === true && Math.abs(video.playbackRate - 1.5) < 0.001,
      'rate=' + video.playbackRate);

    t(`[${kind}] stepSpeed(+1) advances 1.5 -> 1.75`,
      (S.stepSpeed(1), Math.abs(video.playbackRate - 1.75) < 0.001), 'rate=' + video.playbackRate);

    t(`[${kind}] stepSpeed(-1) goes back to 1.5`,
      (S.stepSpeed(-1), Math.abs(video.playbackRate - 1.5) < 0.001), 'rate=' + video.playbackRate);

    t(`[${kind}] clamped at the top of the range`,
      (S.setSpeed(99), video.playbackRate <= 4 && video.playbackRate > 1), 'rate=' + video.playbackRate);

    t(`[${kind}] resetSpeed() returns to 1x`,
      (S.resetSpeed(), Math.abs(video.playbackRate - 1) < 0.001), 'rate=' + video.playbackRate);

    // The behaviour that matters most: YouTube resets the rate mid-playback
    // (seek, quality switch, autoplay advance) and it must come back.
    S.setSpeed(2);
    video.playbackRate = 1;            // simulate YouTube stomping on it
    await wait(30);
    t(`[${kind}] re-applies after YouTube resets the rate`,
      Math.abs(video.playbackRate - 2) < 0.001, 'rate=' + video.playbackRate);

    // ...but a deliberate reset to 1x must NOT be fought.
    S.resetSpeed();
    await wait(30);
    t(`[${kind}] does not fight a deliberate 1x`,
      Math.abs(video.playbackRate - 1) < 0.001, 'rate=' + video.playbackRate);

    if (kind !== 'absent') {
      t(`[${kind}] tries the YouTube API first`, calls.length > 0, 'calls=' + calls.length);
    }
    // diag() is async now: it MEASURES each strategy against the wall clock
    // rather than trusting the playbackRate property.
    let diagResult;
    try { diagResult = await S.diag(); } catch (e) { diagResult = 'threw: ' + e.message; }
    t(`[${kind}] diag() resolves without throwing`,
      !!diagResult && typeof diagResult === 'object' && 'playerFound' in diagResult,
      typeof diagResult === 'string' ? diagResult : JSON.stringify(diagResult).slice(0, 120));
    t(`[${kind}] diag() reports measurement state`,
      !!diagResult && 'measured' in diagResult,
      diagResult && JSON.stringify(diagResult.measured).slice(0, 100));
  }

  // Speed must not apply off a watch page.
  {
    const { win, video } = boot('working');
    await wait(300);
    win.document.body.className = 'WEB_PAGE_TYPE_BROWSE';
    win.dispatchEvent(new win.CustomEvent('ytaf-page-update', { detail: { isWatch: false, isShorts: false } }));
    await wait(30);
    const before = video.playbackRate;
    win.__ytafSpeed.setSpeed(2);
    t('[browse] speed is a no-op away from the player',
      Math.abs(video.playbackRate - before) < 0.001, 'rate=' + video.playbackRate);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
