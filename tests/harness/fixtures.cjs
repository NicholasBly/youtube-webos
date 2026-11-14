/**
 * What the behaviour tests build around a page: remote key presses, the toasts,
 * the options panel, a playback model for jsdom's <video>, YouTube-shaped
 * panels and bars, and counters for what a code path costs.
 *
 *   wait(ms), tick()                 a timer; tick() is the next timer, which on Windows is a
 *                                    15.6 ms timer tick rather than 0 ms
 *   flush()                          the microtasks queued so far run (MutationObserver records,
 *                                    promise reactions): setImmediate, no timer
 *   waitFor(fn, timeoutMs)           polls every 10 ms until fn() is truthy; false on timeout
 *   KEYS, DIGIT(n), ALT              the remote key codes the tests press: the colour keys and
 *                                    arrows, the digit keys, the alternate colour codes some remotes send
 *   press(win, code, target)         a keydown on `target` (default the focused element, else body)
 *   pressTrusted(win, code, target, synthetic)
 *                                    the same, trusted as a real remote press is (through jsdom's
 *                                    internals); `synthetic` stamps it as a key the mod made itself
 *   toasts(win)                      the texts of the toasts on screen
 *   showPanel(win, pump)             the panel opened through its test hook, every page built
 *                                    and toggles taken (async)
 *   openPanel(page)                  the menu key on the body, the frames pumped; the panel element
 *   panelCheckbox(win, label)        the checkbox of the panel row with that label text
 *   storedConfig(win)                the configuration the bundle stored in localStorage, parsed
 *   cycleRow(win, label, pageSel)    the panel's cycle row with that label, on one page when given
 *   place(el, x, y, w, h)            the box an element reports under page.cjs's 'grid' layout
 *   intersectionStub(win)            an IntersectionObserver the test drives: { observed, disconnected,
 *                                    callbacks }
 *   videoModel(win, initial)         jsdom's <video> given currentTime, duration, paused,
 *                                    play() and pause() over a plain model, which is returned
 *   descriptionPanel(win, options)   a description panel under <ytlr-app>: `factoids` rows
 *                                    ([{ label, value }]), `items` menu items, `focus` on one
 *   progressBar(win, widths)         the chapter bar with one marker per width (per cent)
 *   countCreated(win)                { created } counting document.createElement calls
 *   instrument(win)                  { qsa, qs, matches, closest, rect } counting selector
 *                                    and layout calls from now on
 *   clock(win)                       { offset }: the page's Date.now() and performance.now()
 *                                    run `offset` ms ahead, for a wait the code measures on a clock
 *   sweepCounter(win)                the selectors of every querySelectorAll over the rendered
 *                                    thumbnail tiles, from now on (an array)
 */
'use strict';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => wait(0);
const flush = () => new Promise((r) => setImmediate(r));

/**
 * Polls `fn` every 10 ms until it returns a truthy value, which is returned;
 * false once `timeoutMs` (default 1000) has passed. For an outcome that is
 * on its way (a toast behind an animation frame, a timer under load) a poll
 * is steadier than a fixed wait sized for an idle machine.
 */
async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 1000);
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() >= deadline) return false;
    await wait(10);
  }
}

const KEYS = {
  ENTER: 13,
  ESCAPE: 27,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  RED: 403,
  GREEN: 404,
  YELLOW: 405,
  BLUE: 406,
  BACK: 461
};
/** The digit key n, as the remote sends it. */
const DIGIT = (n) => 48 + n;
/** The alternate codes some remotes and webOS 3 send for the colour keys (core/remote.js). */
const ALT = { RED: 166, GREEN: 172, YELLOW: 170, BLUE: [167, 191] };

/** A keydown as the remote sends it: jsdom honours keyCode in the init dictionary. */
function press(win, code, target) {
  const evt = new win.KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true });
  (target || win.document.activeElement || win.document.body).dispatchEvent(evt);
  return evt;
}

// jsdom marks every event a script dispatches untrusted, and the wrapper's
// isTrusted cannot be overridden; a trusted press goes through the
// implementation side. The internals are unexported, so jsdom is pinned to
// the exact version in package.json and a move shows up here as a message.
let jsdomInternals = null;
function loadJsdomInternals() {
  if (jsdomInternals) return jsdomInternals;
  try {
    const root = require('path').dirname(require.resolve('jsdom/package.json'));
    const { implForWrapper } = require(root + '/lib/generated/idl/utils.js');
    jsdomInternals = { implForWrapper };
  } catch (e) {
    throw new Error('jsdom internals moved; update pressTrusted in tests/harness/fixtures.cjs', {
      cause: e
    });
  }
  return jsdomInternals;
}
const KEY_NAMES = {
  13: 'Enter',
  37: 'ArrowLeft',
  38: 'ArrowUp',
  39: 'ArrowRight',
  40: 'ArrowDown'
};

/**
 * A keydown as the remote sends it, trusted, on `target` (default the focused
 * element). `synthetic` stamps it the way core/remote.js stamps the keys the
 * mod makes itself. Returns the event, for defaultPrevented.
 */
function pressTrusted(win, code, target, synthetic) {
  const { implForWrapper } = loadJsdomInternals();
  const el = target || win.document.activeElement;
  const evt = new win.KeyboardEvent('keydown', {
    keyCode: code,
    key: KEY_NAMES[code],
    bubbles: true,
    cancelable: true
  });
  if (synthetic) evt.__ytafSynthetic = true;
  const impl = implForWrapper(evt);
  impl.isTrusted = true;
  implForWrapper(el)._dispatch(impl);
  return evt;
}

const toasts = (win) =>
  Array.from(win.document.querySelectorAll('.ytaf-toasts .ytaf-toast')).map((m) => m.textContent);

/**
 * Opens the options panel through the test hook and resolves once all five
 * pages are built (one per frame) and the panel takes toggles (it ignores
 * them for 500 ms after its first build), as its other hook says. `target` is the page (createPage's, whose frames it pumps, or
 * sponsorBlockPage's) or a window, with `pump` when its frames are queued.
 * Throws when the pages are not built: a case without its panel says so
 * rather than going on with the first page alone.
 */
async function showPanel(target, pump) {
  const win = target.win || target;
  const pumpFrames = target.win ? target.pump : pump;
  win.ytaf_showOptionsPanel(true);
  const built = await waitFor(() => {
    if (pumpFrames) pumpFrames();
    return win.document.querySelectorAll('.ytaf-settings-page').length === 5;
  }, 3000);
  if (!built) {
    throw new Error('showPanel: the five panel pages were not built (frames not pumped?)');
  }
  await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
  return win.document.querySelector('.ytaf-ui-container');
}

/** Opens the options panel with the menu key and lets the deferred pages build. */
function openPanel(page) {
  press(page.win, KEYS.GREEN, page.win.document.body);
  for (let i = 0; i < 20; i++) page.pump();
  return page.win.document.querySelector('.ytaf-ui-container');
}

/** The configuration as the bundle last stored it in localStorage, parsed; {} before any. */
function storedConfig(win) {
  return JSON.parse(win.localStorage.getItem('ytaf-configuration') || '{}');
}

/** The checkbox of the panel row whose label reads `label` (trimmed), or null. */
function panelCheckbox(win, label) {
  const rows = Array.from(win.document.querySelectorAll('.ytaf-ui-container label'));
  const row = rows.find((l) => l.textContent.trim() === label);
  return row ? row.querySelector('input') : null;
}

/** The cycle row whose label reads `label` (trimmed), on the page `pageSel` or anywhere in the panel; null when absent. */
function cycleRow(win, label, pageSel) {
  const scope = pageSel || '.ytaf-ui-container';
  const rows = Array.from(win.document.querySelectorAll(scope + ' .ytaf-cycle-row'));
  return (
    rows.find((row) => {
      const l = row.querySelector('.ytaf-cycle-label');
      return l && l.textContent.trim() === label;
    }) || null
  );
}

/** The box `el` reports under page.cjs's `layout: 'grid'`. */
function place(el, x, y, w, h) {
  el.setAttribute('data-x', String(x));
  el.setAttribute('data-y', String(y));
  el.setAttribute('data-w', String(w));
  el.setAttribute('data-h', String(h));
}

/**
 * An IntersectionObserver the test can count and drive. Installs one when the
 * page has none (every observed element reports itself intersecting on the
 * next tick, as the harness's does) and wraps whichever is there: `observed`
 * and `disconnected` count the calls, `callbacks` holds each observer's.
 */
function intersectionStub(win) {
  const io = { observed: 0, disconnected: 0, callbacks: [] };
  if (typeof win.IntersectionObserver !== 'function') {
    win.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        win.setTimeout(() => this.callback([{ target, isIntersecting: true }], this), 0);
      }
      disconnect() {}
    };
  }
  const Real = win.IntersectionObserver;
  win.IntersectionObserver = class extends Real {
    constructor(callback, options) {
      super(callback, options);
      io.callbacks.push(callback);
    }
    observe(target) {
      io.observed++;
      return super.observe(target);
    }
    disconnect() {
      io.disconnected++;
      return super.disconnect();
    }
  };
  return io;
}

/**
 * jsdom's <video> has no playback model: this gives the page's first <video>
 * one, over the returned plain object (`plays` and `pauses` count the calls).
 */
function videoModel(win, initial) {
  const model = Object.assign(
    { currentTime: 0, duration: 100, paused: true, readyState: 4, seeking: false },
    initial
  );
  model.plays = 0;
  model.pauses = 0;
  const video = win.document.querySelector('video');
  const getter = (key) => ({ get: () => model[key], configurable: true });
  Object.defineProperties(video, {
    currentTime: {
      get: () => model.currentTime,
      set: (v) => {
        model.currentTime = v;
      },
      configurable: true
    },
    duration: getter('duration'),
    paused: getter('paused'),
    readyState: getter('readyState'),
    seeking: getter('seeking'),
    play: {
      value: () => {
        model.plays++;
        model.paused = false;
      },
      configurable: true
    },
    pause: {
      value: () => {
        model.pauses++;
        model.paused = true;
      },
      configurable: true
    }
  });
  return model;
}

/**
 * A description panel shaped like YouTube's, a few levels below <ytlr-app>.
 * `factoids` ([{ label, value }]) fill the factoid container the dislike
 * counter injects into; `items` menu items (role=menuitem, each with a
 * focusable child) are what its navigation walks. `focus` is 'factoid' or an
 * item index: opening the panel puts focus in it, which is how the instance
 * finds it. Returns { panel, factoids, items: [{ it, inner }] }.
 */
function descriptionPanel(win, options) {
  const o = options || {};
  const d = win.document;
  const panel = d.createElement('ytlr-structured-description-content-renderer');
  const factoids = [];
  if (o.factoids) {
    const container = d.createElement('div');
    container.className = 'ytLrVideoDescriptionHeaderRendererFactoidContainer';
    o.factoids.forEach(({ label, value }, i) => {
      const row = d.createElement('div');
      row.className = 'ytLrVideoDescriptionHeaderRendererFactoid';
      row.setAttribute('idomkey', 'factoid-' + i);
      row.setAttribute('aria-label', `${value} ${label}`);
      row.setAttribute('tabindex', '0');
      const v = d.createElement('span');
      v.className = 'ytLrVideoDescriptionHeaderRendererValue';
      v.textContent = value;
      const l = d.createElement('span');
      l.className = 'ytLrVideoDescriptionHeaderRendererLabel';
      l.textContent = label;
      row.appendChild(v);
      row.appendChild(l);
      container.appendChild(row);
      factoids.push(row);
    });
    panel.appendChild(container);
  }
  const items = [];
  for (let i = 0; i < (o.items || 0); i++) {
    const it = d.createElement('div');
    it.setAttribute('role', 'menuitem');
    it.setAttribute('tabindex', '0');
    const inner = d.createElement('span');
    inner.setAttribute('tabindex', '0');
    it.appendChild(inner);
    panel.appendChild(it);
    items.push({ it, inner });
  }
  const wrap1 = d.createElement('div');
  const wrap2 = d.createElement('div');
  wrap2.appendChild(panel);
  wrap1.appendChild(wrap2);
  d.querySelector('ytlr-app').appendChild(wrap1);
  if (o.focus === 'factoid' && factoids[0]) factoids[0].focus();
  else if (typeof o.focus === 'number' && items[o.focus]) items[o.focus].inner.focus();
  return { panel, factoids, items };
}

/** The chapter bar: one marker per width, in per cent of the video. */
function progressBar(win, widths) {
  const d = win.document;
  const renderer = d.createElement('ytlr-multi-markers-player-bar-renderer');
  const bar = d.createElement('div');
  bar.setAttribute('idomkey', 'progress-bar');
  widths.forEach((w, i) => {
    const c = d.createElement('div');
    c.setAttribute('idomkey', 'chapter-' + i);
    c.style.width = w + '%';
    bar.appendChild(c);
  });
  renderer.appendChild(bar);
  d.body.appendChild(renderer);
  return renderer;
}

/** Counts document.createElement calls from now on; element creation is what a panel costs. */
function countCreated(win) {
  const counter = { created: 0 };
  const real = win.document.createElement.bind(win.document);
  win.document.createElement = function (...args) {
    counter.created++;
    return real(...args);
  };
  return counter;
}

/**
 * Counts the calls that cost on Chromium 38 from now on: the selector engine
 * (querySelectorAll, querySelector, matches, closest) and layout
 * (getBoundingClientRect, stubbed to a fixed box). Call it after the bundle
 * has loaded: the Chromium 38 downgrade deletes Element#closest and
 * polyfills.js installs a fresh one, so a wrapper put on before would count nothing.
 */
function instrument(win) {
  const c = { qsa: 0, qs: 0, matches: 0, closest: 0, rect: 0 };
  const P = win.Element.prototype;
  const wrap = (name, key) => {
    const orig = P[name];
    P[name] = function (...a) {
      c[key]++;
      return orig.apply(this, a);
    };
  };
  wrap('querySelectorAll', 'qsa');
  wrap('querySelector', 'qs');
  wrap('matches', 'matches');
  wrap('closest', 'closest');
  P.getBoundingClientRect = function () {
    c.rect++;
    return { top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 };
  };
  return c;
}

function clock(win) {
  const c = { offset: 0 };
  const realNow = win.Date.now;
  win.Date.now = () => realNow() + c.offset;
  // The monotonic clock moves with it: short intervals are measured on it.
  const perf = win.performance;
  const realPerf = perf.now.bind(perf);
  perf.now = () => realPerf() + c.offset;
  return c;
}

function sweepCounter(win) {
  const sweeps = [];
  const qsa = win.document.querySelectorAll.bind(win.document);
  win.document.querySelectorAll = (sel) => {
    if (String(sel).indexOf('ytlr-thumbnail-details') !== -1) sweeps.push(sel);
    return qsa(sel);
  };
  return sweeps;
}

/** Whether `p` rejects as fetch() does when it fails: a TypeError "Failed to fetch", by name (another realm's). */
const rejectsWithTypeError = (p) =>
  p.then(
    () => false,
    (e) => !!e && e.name === 'TypeError' && /Failed to fetch/.test(e.message)
  );

module.exports = {
  rejectsWithTypeError,
  wait,
  tick,
  flush,
  waitFor,
  KEYS,
  DIGIT,
  ALT,
  press,
  pressTrusted,
  toasts,
  openPanel,
  showPanel,
  panelCheckbox,
  storedConfig,
  cycleRow,
  place,
  intersectionStub,
  videoModel,
  descriptionPanel,
  progressBar,
  countCreated,
  instrument,
  clock,
  sweepCounter
};
