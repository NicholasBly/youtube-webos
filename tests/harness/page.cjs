/**
 * One jsdom page for the behaviour tests and benches: the host surface the
 * bundle pokes at, stubbed the same way everywhere, so a test only states what
 * differs.
 *
 * The flavour under test is the harness's: `flavour` is 'modern' when the
 * script was started with `modern` as its second argument or YTAF_FLAVOUR says
 * so, 'legacy' otherwise. `engine` is the one a page simulates by default:
 * 'webos3' for legacy, 'webos22' for modern, and 'webos6' when the second
 * argument is `webos6` (the legacy bundle on webOS 6's Chrome 79, where it
 * takes its IntersectionObserver, idle-callback and AbortController paths).
 *
 *   createPage(options) -> page
 *     html          the document; default a browse page with an empty <ytlr-app>
 *     page          'watch': a watch page with the player container, a <video> and a
 *                   watch url, in place of `html` and `url`
 *     url           default https://www.youtube.com/tv
 *     ua            'webos3', 'webos6', 'webos22', 'webos23' or 'webos25'; default the engine (webos3
 *                   for legacy, webos22 for modern: the oldest engine each bundle runs on, a
 *                   'webos22' page without what Chrome 87 lacks, a 'webos6' one without what
 *                   Chrome 79 lacks). A modern page (any ua but
 *                   'webos3') gets requestIdleCallback and IntersectionObserver, which jsdom
 *                   lacks and Chrome 87 has: an idle callback runs on a short timer, an
 *                   observed element reports itself intersecting on the next tick; a
 *                   'webos3' page gets the Chromium 38 downgrade, with the NodeList and
 *                   HTMLCollection prototypes sealed
 *     config        merged over the defaults below into ytaf-configuration
 *     storage       extra localStorage entries, values JSON-stringified
 *     xhr           'silent' (default: never answers), 'error' (send() fires onerror),
 *                   'record' (never answers), 'sddefault' (a HEAD probe answers 200 with a
 *                   Content-Length for /sddefault. urls whose video id does not start with
 *                   "nosd", and a 404 otherwise, as i.ytimg.com answers a missing rung: with
 *                   CORS headers, so onload reads its status; `{ mode: 'sddefault', noLength:
 *                   true }` answers without a Content-Length), 'held' (each request waits in
 *                   page.requests for the test's answer(status, length), expire() or fail(),
 *                   a network error), or a class to
 *                   install. The modes but 'silent' record the requests in page.requests
 *                   (`answered` once the stub's handlers ran); a class installed records
 *                   nothing there
 *     raf           'queue' (default; page.pump() runs the queued frames) or 'timeout'
 *                   (frames fire on 15 ms timers: one 15.6 ms timer tick on Windows, where
 *                   16 ms takes two)
 *     image         'none' (default: jsdom never loads an image, so an image probe never
 *                   answers) or 'error' (every image fails on the next tick, as if the rung
 *                   probed did not exist)
 *     fetch         default rejects 'offline'; false leaves whatever the downgrade left (the
 *                   bundle's whatwg-fetch polyfill); set after the downgrade, which deletes window.fetch
 *     timers        { scale, from, to }: setTimeout and setInterval delays of `from` ms and
 *                   more are divided by `scale`, so a test of a retry, a poll or a settle
 *                   delay need not wait for the real one. Delays under `from` (debounces,
 *                   the next-tick timers) keep their length, and so do delays of `to` ms and
 *                   more when given (a timeout the case must not run into)
 *     captureKeys   record keydown keyCodes seen on the document in page.keys (default false)
 *     allowErrors   a RegExp: page errors matching it are expected and not collected (jsdom's
 *                   'navigation to another Document', for a test that makes the app reload)
 *     layout        true: stub getBoundingClientRect (200x100 at the origin) and scrollIntoView;
 *                   'grid': every element reports the box fixtures.place() gave it (nothing
 *                   by default)
 *     setup(win)    runs after everything above and before the bundle is evaluated
 *     autoRun       evaluate the bundle now (default true); otherwise call page.run()
 *
 *   page: { win, requests, keys, errors, NS, NP, pump(), run() }
 *     requests are { url, sent } records of the XMLHttpRequest stub; NS / NP are the
 *     page's JSON.stringify / JSON.parse captured before the bundle installs its hooks;
 *     errors collects jsdomError and console.error, and every report fails at finish()
 *     when any page of the script collected one. The bundle is the script's first
 *     argument, else dist/. createPage throws when the bundle throws while loading;
 *     with autoRun off, run() returns that error (or null).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const {
  applyChrome38Downgrade,
  applyChrome79Downgrade,
  applyChrome87Downgrade,
  sealDomCollectionPrototypes,
  UA,
  setUserAgent
} = require('./chrome38-env.cjs');
const { addFinishCheck } = require('./report.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const BUNDLE = process.argv[2] || ROOT + '/dist/webOSUserScripts/userScript.js';
// The bundle read and compiled once per process, then run in each page's own
// context: a script boots dozens of pages, and the compile was a third of each.
let bundleScript = null;
const compiledBundle = () =>
  bundleScript ||
  (bundleScript = new vm.Script(fs.readFileSync(BUNDLE, 'utf8'), { filename: BUNDLE }));
const flavourArg = process.argv[3] || process.env.YTAF_FLAVOUR || 'legacy';
const flavour = flavourArg === 'modern' ? 'modern' : 'legacy';
// The engine each second argument simulates by default.
const ENGINES = { modern: 'webos22', legacy: 'webos3', webos6: 'webos6' };
const engine = ENGINES[flavourArg] || 'webos3';
const DEFAULT_UA = engine;

const BROWSE_HTML =
  '<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>';
const WATCH_HTML =
  '<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>' +
  '<div id="ytlr-player__player-container"><video></video></div></ytlr-app></body></html>';
const WATCH_URL = 'https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ';
const CONFIG_DEFAULTS = {
  enableAdBlock: true,
  enableLegacyEmojiFix: false,
  enableSponsorBlock: false,
  enableReturnYouTubeDislike: false,
  upgradeThumbnails: false,
  enableAutoLogin: false
};

function xhrClass(spec, requests) {
  if (typeof spec === 'function') return spec;
  const mode = typeof spec === 'string' ? spec : spec.mode;
  const noLength = typeof spec === 'object' && !!spec.noLength;
  return class {
    open(m, u) {
      this.url = String(u);
      if (mode === 'record') requests.push({ url: this.url, sent: false });
    }
    send() {
      if (mode === 'record' || mode === 'silent') return;
      if (mode === 'held') {
        requests.push(this);
        return;
      }
      // `answered` turns true once the handlers have run: what a test waits for.
      const rec = { url: this.url, sent: true, answered: false };
      requests.push(rec);
      if (mode === 'error') {
        if (this.onerror) this.onerror();
        rec.answered = true;
        return;
      }
      // 'sddefault': the one rung that exists answers 200 on the next tick,
      // any other a 404.
      const exists = this.url.indexOf('/sddefault.') !== -1 && this.url.indexOf('/vi/nosd') === -1;
      setTimeout(() => {
        this.status = exists ? 200 : 404;
        if (this.onload) this.onload();
        rec.answered = true;
      }, 0);
    }
    setRequestHeader() {}
    getResponseHeader(h) {
      if (mode === 'held') return h === 'Content-Length' ? this.length : null;
      if (mode !== 'sddefault' || h !== 'Content-Length' || noLength) return null;
      // The grey placeholder's body, or a real image's.
      return this.status === 404 ? '1097' : '48000';
    }
    addEventListener() {}
    // 'held': the test settles each request itself.
    answer(status, length) {
      this.status = status;
      this.length = length == null ? null : String(length);
      this.answered = true;
      if (this.onload) this.onload();
    }
    fail() {
      this.answered = true;
      if (this.onerror) this.onerror();
    }
    expire() {
      this.answered = true;
      if (this.ontimeout) this.ontimeout();
    }
  };
}

// What Chrome 87 has and jsdom lacks, on the modern pages: the thumbnail
// probes queue on requestIdleCallback and the dislike counter watches its
// panel with an IntersectionObserver when they exist.
function installModernApis(win) {
  win.requestIdleCallback = (cb) =>
    win.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);
  win.cancelIdleCallback = (id) => win.clearTimeout(id);
  win.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
    }
    observe(target) {
      this.targets.add(target);
      win.setTimeout(() => {
        if (!this.targets.has(target)) return;
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
      }, 0);
    }
    unobserve(target) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
    }
  };
}

// Every page of the script, for the finish check on their errors; the check
// is registered with the first page, so a script that makes none has none.
const pages = [];
function checkPagesAtFinish() {
  addFinishCheck((check) => {
    const noisy = pages.filter((p) => p.errors.length > 0);
    check(
      `no console.error or jsdomError on any of the ${pages.length} page(s)`,
      noisy.length === 0,
      noisy
        .slice(0, 3)
        .map((p) => `page ${pages.indexOf(p) + 1}: ${p.errors[0]}`)
        .join(' || ')
    );
  });
}

function createPage(options) {
  const o = options || {};
  const errors = [];
  const vc = new VirtualConsole();
  const collect = (text) => {
    if (!(o.allowErrors && o.allowErrors.test(text))) errors.push(text);
  };
  vc.on('jsdomError', (e) => collect('jsdomError: ' + (e.stack || e.message)));
  vc.on('error', (...a) => collect('console.error: ' + a.join(' ')));
  const watch = o.page === 'watch';
  const dom = new JSDOM(o.html || (watch ? WATCH_HTML : BROWSE_HTML), {
    runScripts: 'outside-only',
    url: o.url || (watch ? WATCH_URL : 'https://www.youtube.com/tv'),
    virtualConsole: vc,
    pretendToBeVisual: true
  });
  const win = dom.window;
  const ua = o.ua || DEFAULT_UA;
  setUserAgent(win, UA[ua]);
  win.launchParams = '{}';

  if (ua !== 'webos3') installModernApis(win);

  const requests = [];
  win.XMLHttpRequest = xhrClass(o.xhr || 'silent', requests);

  let rafQ = [];
  if (o.raf === 'timeout') {
    win.requestAnimationFrame = (cb) => win.setTimeout(() => cb(Date.now()), 15);
    win.cancelAnimationFrame = (id) => win.clearTimeout(id);
  } else {
    win.requestAnimationFrame = (cb) => {
      rafQ.push(cb);
      return rafQ.length;
    };
    win.cancelAnimationFrame = () => {};
  }
  const pump = () => {
    const q = rafQ;
    rafQ = [];
    for (const cb of q) cb(Date.now());
  };
  if (o.timers) {
    const { scale, from, to } = o.timers;
    const shorten = (ms) => (ms >= from && !(to && ms >= to) ? ms / scale : ms);
    const realSetTimeout = win.setTimeout;
    const realSetInterval = win.setInterval;
    win.setTimeout = (cb, ms, ...args) => realSetTimeout(cb, shorten(ms), ...args);
    win.setInterval = (cb, ms, ...args) => realSetInterval(cb, shorten(ms), ...args);
  }

  if (o.image === 'error') {
    win.Image = class {
      set src(_v) {
        setTimeout(() => this.onerror && this.onerror(), 0);
      }
    };
  }
  if (o.layout === 'grid') {
    win.Element.prototype.getBoundingClientRect = function () {
      const x = +(this.getAttribute('data-x') || 0);
      const y = +(this.getAttribute('data-y') || 0);
      const w = +(this.getAttribute('data-w') || 0);
      const h = +(this.getAttribute('data-h') || 0);
      return { x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
    };
  } else if (o.layout) {
    win.Element.prototype.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0 };
    };
    win.Element.prototype.scrollIntoView = function () {};
  }

  const NS = win.JSON.stringify;
  const NP = win.JSON.parse;
  win.localStorage.setItem(
    'ytaf-configuration',
    NS(Object.assign({}, CONFIG_DEFAULTS, o.config || {}))
  );
  for (const [k, v] of Object.entries(o.storage || {})) {
    win.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }

  const keys = [];
  if (o.captureKeys) win.document.addEventListener('keydown', (e) => keys.push(e.keyCode), true);

  if (ua === 'webos3') {
    applyChrome38Downgrade(win);
    // The polyfill cannot put the iterators back here, so a covered path that
    // runs a for-of over a DOM collection fails on a legacy page (polyfills/dom.js).
    sealDomCollectionPrototypes(win, ['NodeList', 'HTMLCollection']);
  }
  if (ua === 'webos6') applyChrome79Downgrade(win);
  if (ua === 'webos22') applyChrome87Downgrade(win);
  // After the downgrade: it deletes window.fetch (Chromium 38 had none). `false`
  // leaves it that way, so the whatwg-fetch polyfill in the bundle takes over.
  if (o.fetch !== false) win.fetch = o.fetch || (() => Promise.reject(new Error('offline')));
  if (o.setup) o.setup(win);

  const page = { win, requests, keys, errors, NS, NP, pump };
  page.run = () => {
    try {
      compiledBundle().runInContext(dom.getInternalVMContext());
    } catch (e) {
      const message = (e && e.message) || String(e);
      return new Error('bundle threw while loading: ' + message, { cause: e });
    }
    return null;
  };
  if (pages.length === 0) checkPagesAtFinish();
  pages.push(page);
  if (o.autoRun !== false) {
    const error = page.run();
    if (error) throw error;
  }
  return page;
}

module.exports = { createPage, flavour, engine };
