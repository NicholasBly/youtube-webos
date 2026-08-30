/**
 * The LG G4 case: video.playbackRate accepts the value and reads it back, but
 * the hardware pipeline keeps decoding at 1x so the picture never changes.
 *
 * The <video> here mimics that exactly - the property is stored, but the
 * simulated clock only honours it for the strategies a given "device" supports.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

/**
 * honours: which strategy name actually moves the picture.
 *   null                  -> nothing works (true hardware lockout)
 *   'direct'              -> a normal device
 *   'no-pitch-correction' -> works only with pitch correction off
 *   'default-rate'        -> works only via defaultPlaybackRate
 */
function boot(honours) {
  const dom = new JSDOM(
    `<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
       <div id="ytlr-player__player-container">
         <div id="ytlr-player__player-container-player"></div><video></video>
       </div></ytlr-app></body></html>`,
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ',
      virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos23);
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

  const video = win.document.querySelector('video');
  let stored = 1, pitch = true, defaultRate = 1, appliedAtPlay = 1, paused = false;
  Object.defineProperty(video, 'playbackRate', {
    get: () => stored, set(v) { stored = v; }, configurable: true });
  Object.defineProperty(video, 'defaultPlaybackRate', {
    get: () => defaultRate, set(v) { defaultRate = v; }, configurable: true });
  Object.defineProperty(video, 'preservesPitch', {
    get: () => pitch, set(v) { pitch = v; }, configurable: true });
  Object.defineProperty(video, 'paused', {
    get: () => paused, configurable: true });
  video.pause = () => { paused = true; };
  video.play = () => { paused = false; appliedAtPlay = stored; return Promise.resolve(); };
  Object.defineProperty(video, 'ended', { value: false, configurable: true });
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });

  // The pipeline: currentTime advances at the EFFECTIVE rate, which only
  // follows the property when this device honours that strategy.
  const started = Date.now();
  Object.defineProperty(video, 'currentTime', {
    get() {
      const effective =
        honours === null ? 1 :
        honours === 'direct' ? stored :
        honours === 'no-pitch-correction' ? (pitch ? 1 : stored) :
        honours === 'default-rate' ? (defaultRate !== 1 ? stored : 1) :
        honours === 'pause-apply-play' ? appliedAtPlay : 1;
      return ((Date.now() - started) / 1000) * effective;
    },
    set() {}, configurable: true
  });

  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, video };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Measure what the harness's own pipeline is doing, independent of the module.
async function effective(video) {
  const t0 = video.currentTime, w0 = Date.now();
  await wait(700);
  return (video.currentTime - t0) / ((Date.now() - w0) / 1000);
}

(async () => {
  // A normal device: first strategy works, no escalation.
  {
    const { win, video } = boot('direct');
    await wait(300);
    win.__ytafSpeed.setSpeed(2);
    await wait(1400);
    t('[normal TV] picture actually runs at 2x',
      Math.abs(await effective(video) - 2) < 0.2, String(await effective(video)));
  }

  // A device that only honours the rate with pitch correction off.
  {
    const { win, video } = boot('no-pitch-correction');
    await wait(300);
    win.__ytafSpeed.setSpeed(2);
    // No assertion on the intermediate state: measuring it races with the
    // escalation that is already under way. What matters is where it lands.
    await wait(3000);
    t('[pitch-locked TV] escalates until the picture really changes',
      Math.abs(await effective(video) - 2) < 0.2, String(await effective(video)));
  }

  // A device that only applies the rate via defaultPlaybackRate.
  {
    const { win, video } = boot('default-rate');
    await wait(300);
    win.__ytafSpeed.setSpeed(1.5);
    await wait(4000);
    t('[default-rate TV] escalates to the working strategy',
      Math.abs(await effective(video) - 1.5) < 0.2, String(await effective(video)));
  }

  // A pipeline that only takes the rate at play start.
  {
    const { win, video } = boot('pause-apply-play');
    await wait(300);
    win.__ytafSpeed.setSpeed(1.5);
    await wait(9000);
    t('[play-start TV] escalates to the play-start strategy',
      Math.abs(await effective(video) - 1.5) < 0.2, String(await effective(video)));
  }

  // The LG G4 case: nothing works. Must say so instead of claiming success.
  {
    const { win, video } = boot(null);
    const warnings = [];
    win.console.warn = (...a) => warnings.push(a.join(' '));
    await wait(300);
    win.__ytafSpeed.setSpeed(2);
    await wait(14000);
    t('[hardware lockout] picture stays at 1x', Math.abs(await effective(video) - 1) < 0.2);
    t('[hardware lockout] all strategies tried',
      warnings.some((w) => /No strategy changed/.test(w)), warnings.slice(-1)[0] || '(none)');
    t('[hardware lockout] property still reports what was asked (the trap)',
      Math.abs(video.playbackRate - 2) < 0.001, 'property=' + video.playbackRate);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
