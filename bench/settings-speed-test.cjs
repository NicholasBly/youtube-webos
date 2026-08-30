/**
 * Adopting YouTube's disabled "Speed" row in the playback Settings menu.
 * The row markup below is copied verbatim from a real webOS 25 capture
 * (playback-settings.html), including the obfuscated class names.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

// Verbatim from the capture: enabled rows carry nJC1pd, the Speed row does not.
const ROW = (label, sub, cls, chevron) =>
  `<ytlr-compact-link-renderer tabindex="-1" class="EsYk6e tC3Ifb Vggjdf">
     <ytlr-menu-item hybridnavfocusable="true" tabindex="-1" class="oaz1oe WVlLcb ykVEzc">
       <ytlr-button hybridnavfocusable="true" role="menuitem" aria-label="${label}. ${sub}"
                    aria-checked="false" aria-hidden="true" tabindex="-1" class="${cls}">
         <ytlr-avatar-lockup tabindex="-1" class="yZD8Ze OBkGY HRe9Le bWcqr">
           <div idomkey="tHtjcd" class="tHtjcd"><yt-icon idomkey="wFZPnb"></yt-icon></div>
           <div idomkey="WFzqkb" class="WFzqkb">
             <yt-formatted-string idomkey="j5U2Ge" class="XGffTd j5U2Ge sEdmJd"><span>${label}</span></yt-formatted-string>
             <div><yt-formatted-string idomkey="EEh3sf" class="XGffTd EEh3sf">${sub}</yt-formatted-string></div>
           </div>
         </ytlr-avatar-lockup>
         ${chevron ? '<yt-icon idomkey="mRhfIb" class="fdVXse ieYpu mRhfIb"></yt-icon>' : ''}
       </ytlr-button>
     </ytlr-menu-item>
   </ytlr-compact-link-renderer>`;

const ON = 'iM3bAd pAenK aJ2IYc ZdYMbf nJC1pd BvKat EZJGFd';
const OFF = 'iM3bAd pAenK aJ2IYc ZdYMbf BvKat EZJGFd';   // Speed: no nJC1pd

const MENU =
  ROW('Quality', 'Auto (1080p)', 'iM3bAd aJ2IYc ZdYMbf nJC1pd BvKat EZJGFd', true) +
  ROW('Captions', 'Off', ON, true) +
  ROW('Audio Track', 'English (US) original', ON, true) +
  ROW('Speed', 'Not available on this device', OFF, false);

// From not-working-speed-control.html: this video has no alternate audio, so
// "Audio / Unavailable" is ALSO rendered disabled and chevron-less. Keying on
// "the one row without a chevron" finds two candidates here and gives up.
const MENU_AUDIO_ALSO_DISABLED =
  ROW('Quality', 'Auto (1080p Premium)', ON, true) +
  ROW('Captions', 'Off', ON, true) +
  ROW('Audio', 'Unavailable', 'iM3bAd pAenK aJ2IYc ZdYMbf BvKat EZJGFd zylon-ve', false) +
  ROW('Speed', 'Not available on this device',
      'iM3bAd aJ2IYc ZdYMbf BvKat EZJGFd BZ345e zylon-focus', false) +
  ROW('Report', '', 'iM3bAd pAenK aJ2IYc nJC1pd BvKat Cpqyh EZJGFd', true) +
  ROW('Feedback', '', 'iM3bAd pAenK aJ2IYc nJC1pd BvKat Cpqyh EZJGFd', true);

function boot() {
  const dom = new JSDOM(
    `<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
       <div id="ytlr-player__player-container">
         <div id="ytlr-player__player-container-player"></div><video></video>
       </div>
     </ytlr-app></body></html>`,
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
  // The real page does: setMessage({...}) -> yt.setMsg(...) / ytcfg.msgs
  win.ytcfg = win.ytcfg || {};
  win.ytcfg.msgs = {
    PLAYBACK_SPEED_UNAVAILABLE: 'Not available on this device',
    UNAVAILABLE: 'Unavailable',
    VIDEO_SPEED_NORMAL: 'Normal'
  };

  const video = win.document.querySelector('video');
  let rate = 1;
  Object.defineProperty(video, 'playbackRate', {
    get: () => rate,
    set(v) { if (v !== rate) { rate = v; video.dispatchEvent(new win.Event('ratechange')); } },
    configurable: true
  });
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, video, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(0); } };
}

let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const speedRow = (win) => win.document.querySelector('[data-ytaf-speed-row]');
const subOf = (row) => {
  const s = row.getElementsByTagName('yt-formatted-string');
  return s[s.length - 1].textContent;
};

(async () => {
  const { win, video } = boot();
  await wait(300);
  const d = win.document;

  // Open the settings menu.
  const menu = d.createElement('div');
  menu.className = 'AmQJbe';
  menu.innerHTML = MENU;
  d.querySelector('ytlr-app').appendChild(menu);
  await wait(60);

  t('disabled Speed row is identified', !!speedRow(win),
    'rows=' + d.querySelectorAll('ytlr-button[role="menuitem"]').length);
  const row = speedRow(win);
  if (!row) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

  t('row gains the enabled marker class', row.classList.contains('nJC1pd'), row.className);
  t('the enabled rows are left alone',
    d.querySelectorAll('[data-ytaf-speed-row]').length === 1);
  t('sublabel no longer says unavailable', subOf(row) === 'Normal', subOf(row));
  t('aria-label updated', /Speed\. Normal/.test(row.getAttribute('aria-label')),
    row.getAttribute('aria-label'));

  // OK on the row steps the speed.
  const key = (code) => {
    const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => code, configurable: true });
    Object.defineProperty(e, 'key', { get: () => ({13:'Enter',39:'ArrowRight',37:'ArrowLeft'})[code], configurable: true });
    row.dispatchEvent(e);
    return e;
  };
  row.setAttribute('tabindex', '0');
  row.focus();

  key(13);
  await wait(20);
  t('OK on the row raises the speed', Math.abs(video.playbackRate - 1.25) < 0.001,
    'rate=' + video.playbackRate);
  t('sublabel reflects the new speed', subOf(row) === '1.25x', subOf(row));

  key(39); await wait(20);
  t('RIGHT steps up again', Math.abs(video.playbackRate - 1.5) < 0.001, 'rate=' + video.playbackRate);
  key(37); await wait(20);
  t('LEFT steps back down', Math.abs(video.playbackRate - 1.25) < 0.001, 'rate=' + video.playbackRate);

  // YouTube re-renders the menu; adoption must come back.
  menu.innerHTML = MENU;
  await wait(80);
  const again = speedRow(win);
  t('re-adopted after YouTube re-renders the menu', !!again);
  t('re-adopted row shows the live speed', again && subOf(again) === '1.25x',
    again && subOf(again));

  // Class names are obfuscated and WILL change: the marker is derived, not hardcoded.
  const menu2 = d.createElement('div');
  menu2.className = 'AmQJbe';
  menu2.innerHTML =
    ROW('Quality', 'Auto', 'aaa bbb ZZZnew ccc', true) +
    ROW('Captions', 'Off', 'aaa bbb ZZZnew ccc', true) +
    ROW('Audio', 'EN', 'aaa bbb ZZZnew ccc', true) +
    ROW('Speed', 'Not available on this device', 'aaa bbb ccc', false);
  menu.parentNode.removeChild(menu);   // Element#remove is Chrome 23+ but stripped by the downgrade
  d.querySelector('ytlr-app').appendChild(menu2);
  await wait(80);
  const renamed = speedRow(win);
  t('survives YouTube renaming its obfuscated classes',
    !!renamed && renamed.classList.contains('ZZZnew'), renamed && renamed.className);

  // ---- the video that did not work at all ----
  {
    const b = boot();
    await wait(300);
    const dd = b.win.document;
    const m = dd.createElement('div');
    m.className = 'AmQJbe';
    m.innerHTML = MENU_AUDIO_ALSO_DISABLED;
    dd.querySelector('ytlr-app').appendChild(m);
    await wait(80);

    const r = speedRow(b.win);
    t('[audio also disabled] Speed row still found', !!r,
      'tagged=' + dd.querySelectorAll('[data-ytaf-speed-row]').length);
    t('[audio also disabled] the Audio row is NOT hijacked',
      !!r && /Speed/.test(r.getAttribute('aria-label')), r && r.getAttribute('aria-label'));
    t('[audio also disabled] sublabel replaced', !!r && subOf(r) === 'Normal', r && subOf(r));
  }

  // ---- YouTube stomping the row in place (incremental-dom reuse) ----
  {
    const b = boot();
    await wait(300);
    const dd = b.win.document;
    const m = dd.createElement('div');
    m.className = 'AmQJbe';
    m.innerHTML = MENU;
    dd.querySelector('ytlr-app').appendChild(m);
    await wait(80);

    const r = speedRow(b.win);
    t('[stomp] adopted before the stomp', !!r && subOf(r) === 'Normal');

    // Exactly what incremental-dom does: same node, rewritten text and class.
    const strings = r.getElementsByTagName('yt-formatted-string');
    strings[strings.length - 1].textContent = 'Not available on this device';
    r.className = 'iM3bAd pAenK aJ2IYc ZdYMbf BvKat EZJGFd';
    await wait(120);

    t('[stomp] sublabel restored after in-place re-render',
      subOf(r) === 'Normal', subOf(r));
    t('[stomp] enabled class restored', r.classList.contains('nJC1pd'), r.className);
    t('[stomp] row is not duplicated',
      dd.querySelectorAll('[data-ytaf-speed-row]').length === 1);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
