/**
 * DeArrow behaviour against the built bundle: a browse response goes through
 * the JSON.parse hook, branding comes from a mocked API, and the rendered
 * tiles must end up with the right title and thumbnail - including the
 * auto-generated stand-in for random frames and restoring originals when
 * DeArrow is switched off.
 *
 * Usage: node bench/dearrow-test.cjs [dist/webOSUserScripts/userScript.js]
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const alea = require('seedrandom/lib/alea');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const ROOT = path.resolve(__dirname, '..');
const bundlePath = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';

const BRANDING = {
  // Crowdsourced title and thumbnail.
  custom00001: {
    titles: [{ title: 'the >iPhone review', original: false, votes: 2, locked: false }],
    thumbnails: [{ timestamp: 12.5, original: false, votes: 1, locked: false }],
    randomTime: 0.3, videoDuration: 100
  },
  // Downvoted title, no thumbnail: original title, random frame fallback.
  downvoted01: {
    titles: [{ title: 'Bad', original: false, votes: -1, locked: false }],
    thumbnails: [], randomTime: 0.5, videoDuration: 200
  },
  // No server randomTime: the time comes from alea(videoID), like the extension.
  norandom001: { titles: [], thumbnails: [], randomTime: null, videoDuration: 300 },
  // No submissions at all: the API answers 404, yet randomTime/videoDuration
  // in that body are what the random frame must use (not the tile's rounded
  // duration), or it never matches the frame other DeArrow users cached.
  nosubmit001: { titles: [], thumbnails: [], randomTime: 0.25, videoDuration: 123.456 }
};

function tile(id, title) {
  return { tileRenderer: {
    contentId: id, contentType: 'TILE_CONTENT_TYPE_VIDEO',
    header: { tileHeaderRenderer: { thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] } } },
    metadata: { tileMetadataRenderer: { title: { simpleText: title } } }
  } };
}

function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>', {
    runScripts: 'outside-only', url: 'https://www.youtube.com/tv',
    virtualConsole: new VirtualConsole(), pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class {
    open() {} send() { if (this.onerror) this.onerror(); }
    setRequestHeader() {} getResponseHeader() { return null; } addEventListener() {}
  };
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = () => {};
  win.Element.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
  win.Element.prototype.scrollIntoView = () => {};

  const fetched = [];
  const mockFetch = (url) => {
    fetched.push(url);
    const id = /videoID=([\w-]{11})/.exec(url)?.[1];
    const body = BRANDING[id] || { titles: [], thumbnails: [], randomTime: null, videoDuration: null };
    // Like the real API: no submissions -> 404, but with the usual body.
    const none = !body.titles.length && !body.thumbnails.length;
    return Promise.resolve({ ok: !none, status: none ? 404 : 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
  };
  // Submitted thumbnails and YouTube frames load; random frames are "still
  // rendering" (the server's 204).
  const images = [];
  win.Image = class {
    set src(url) {
      images.push(url);
      this._src = url;
      const ok = url.indexOf('time=12.5') !== -1 || url.indexOf('i.ytimg.com') !== -1;
      // DeArrow serves 1280x720 frames, YouTube's hq1-3 are 480x360 (4:3).
      const ytimg = url.indexOf('i.ytimg.com') !== -1;
      this.naturalWidth = ytimg ? 480 : 1280;
      this.naturalHeight = ytimg ? 360 : 720;
      setTimeout(() => (ok ? this.onload && this.onload() : this.onerror && this.onerror()), 0);
    }
  };
  // jsdom has no canvas: record the downscale and return a data URL that
  // names its source, as Chromium 38 (no toBlob) would get.
  const draws = [];
  win.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    return { drawImage: (img, ...args) => { canvas._src = img._src; draws.push({ w: canvas.width, h: canvas.height, args }); } };
  };
  win.HTMLCanvasElement.prototype.toBlob = undefined;
  win.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,SMALL#' + encodeURIComponent(this._src); };

  win.localStorage.setItem('ytaf-configuration', JSON.stringify(Object.assign({
    enableAdBlock: true, enableLegacyEmojiFix: false, enableSponsorBlock: false,
    enableReturnYouTubeDislike: false, upgradeThumbnails: false, enableAutoLogin: false,
    enableDeArrow: true, dearrowTitleFormatting: 'disable'
  }, cfg)));
  applyChrome38Downgrade(win);
  // After the downgrade, which removes fetch: the bundle's whatwg-fetch
  // polyfill leaves an existing fetch alone.
  win.fetch = mockFetch;
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, fetched, images, draws };
}

function render(win, data) {
  const app = win.document.querySelector('ytlr-app');
  for (const item of data.contents) {
    const t = item.tileRenderer;
    const el = win.document.createElement('ytlr-tile-renderer');
    el.setAttribute('data-test-id', t.contentId);
    el.innerHTML = '<ytlr-thumbnail-details></ytlr-thumbnail-details>' +
      '<ytlr-tile-metadata-renderer><div><yt-formatted-string></yt-formatted-string></div></ytlr-tile-metadata-renderer>';
    el.querySelector('ytlr-thumbnail-details').style.backgroundImage = `url("${t.header.tileHeaderRenderer.thumbnail.thumbnails[0].url}")`;
    el.querySelector('yt-formatted-string').textContent = t.metadata.tileMetadataRenderer.title.simpleText;
    app.appendChild(el);
  }
}

function shown(win, id) {
  const el = win.document.querySelector(`ytlr-tile-renderer[data-test-id="${id}"]`);
  const thumb = el && el.querySelector('ytlr-thumbnail-details').style.backgroundImage;
  return el && {
    title: el.querySelector('yt-formatted-string').textContent,
    // Downscaled copies name their source after '#'; originals are plain URLs.
    thumb: thumb && decodeURIComponent(thumb),
    small: !!thumb && thumb.indexOf('SMALL#') !== -1
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, ok, extra) => { if (ok) { pass++; console.log('PASS ' + n); }
  else { fail++; console.log('FAIL ' + n + (extra ? '\n     ' + extra : '')); } };

(async () => {
  const { win, fetched, images, draws } = boot({});
  await wait(50);

  const response = JSON.stringify({ responseContext: {}, contents: [
    tile('custom00001', 'You WON\'T believe THIS phone'),
    tile('downvoted01', 'Original title'),
    tile('norandom001', 'Another one'),
    tile('nosubmit001', 'No submissions')
  ], padding: 'x'.repeat(600) });
  render(win, win.JSON.parse(response));
  await wait(800);

  t('one branding request per video', fetched.length === 4, JSON.stringify(fetched));
  t('requests use ?videoID= (not the 20 KB hash-prefix list)', fetched.every((u) => u.indexOf('/api/branding?videoID=') !== -1));

  const a = shown(win, 'custom00001');
  t('crowdsourced title, ">" markers removed', a && a.title === 'the iPhone review', a && a.title);
  t('submitted thumbnail shown', a && a.thumb.indexOf('getThumbnail?videoID=custom00001&time=12.5') !== -1, a && a.thumb);
  t('...as a downscaled copy, not the 1280x720 original', a && a.small, a && a.thumb);
  t('every thumbnail drawn at tile size (320x180)', draws.length > 0 && draws.every((d) => d.w === 320 && d.h === 180
    && d.args[6] === 320 && d.args[7] === 180), JSON.stringify(draws.slice(0, 2)));
  const hq = draws.find((d) => d.args[2] === 480 && d.args[3] === 270);
  t('4:3 auto-generated frame cropped to 16:9 (letterbox removed)', !!hq && hq.args[1] === 45, JSON.stringify(draws.map((d) => d.args.slice(0, 4))));

  const b = shown(win, 'downvoted01');
  t('downvoted title ignored', b && b.title === 'Original title', b && b.title);
  t('random frame not ready -> auto-generated start frame', b && b.small && b.thumb.indexOf('/vi/downvoted01/hq1.jpg') !== -1, b && b.thumb);
  t('random frame requested at randomTime * duration with generateNow',
    images.some((u) => u.indexOf('videoID=downvoted01&time=100&generateNow=true') !== -1));

  let expected = alea('norandom001')();
  if (expected > 0.9) expected -= 0.9;
  t('missing randomTime falls back to alea(videoID), as in the extension',
    images.some((u) => u.indexOf('videoID=norandom001&time=' + expected * 300) !== -1),
    images.filter((u) => u.indexOf('norandom001') !== -1).join(' '));

  t('404 "no submissions" body still used for the random frame time',
    images.some((u) => u.indexOf('videoID=nosubmit001&time=' + 0.25 * 123.456) !== -1),
    images.filter((u) => u.indexOf('nosubmit001') !== -1).join(' '));

  // A later response for a known video is rewritten before it renders.
  const again = win.JSON.parse(response);
  t('known video rewritten inside JSON.parse',
    again.contents[0].tileRenderer.metadata.tileMetadataRenderer.title.simpleText === 'the iPhone review');

  // Switching DeArrow off (through the options panel, as a user would) puts
  // back exactly what it replaced.
  const green = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(green, 'keyCode', { get: () => 404 });
  win.document.body.dispatchEvent(green);
  await wait(100);
  const tab = [...win.document.querySelectorAll('.ytaf-tab-btn')].find((b) => b.textContent === 'DeArrow');
  t('DeArrow tab exists', !!tab);
  if (tab) tab.click();
  const enable = win.document.querySelector('#ytaf-page-dearrow input[type="checkbox"]');
  if (enable) enable.click();
  // Past SWEEP_DELAY: the key press scheduled a sweep that must not re-apply.
  await wait(400);
  const off = shown(win, 'custom00001');
  t('switching off restores the original title', off && off.title === 'You WON\'T believe THIS phone', off && off.title);
  t('switching off restores the original thumbnail', off && off.thumb.indexOf('/vi/custom00001/hqdefault.jpg') !== -1, off && off.thumb);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
