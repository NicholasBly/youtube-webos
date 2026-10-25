/**
 * The SponsorBlock overlay on YouTube's progress bar against the built bundle:
 * the bar torn down and rebuilt, the observers that watch it, one overlay
 * element at any time, the renderer narrowed to its track, a bar that is
 * missing or tracked with nothing to draw, a video with whole-video labels
 * only that touches neither the bar nor the <video>, and the overlay's geometry
 * following the bar (hidden with it, no layout read while hidden, re-synced on
 * resize and on the bar's attributes). The popup and the labels are
 * sponsorblock-ui-test.cjs.
 *
 * Run: node tests/behaviour/sponsorblock-bar-test.cjs [bundle]
 */
const { seg, sponsorBlockPage } = require('../harness/sponsorblock.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const RENDERER = 'ytlr-multi-markers-player-bar-renderer';

/**
 * Every MutationObserver the page creates, with whether it is observing and
 * what: `on(el)` lists the live ones observing `el`.
 */
function trackObservers(win) {
  const Real = win.MutationObserver;
  const all = [];
  win.MutationObserver = function (callback) {
    const obs = new Real(callback);
    const rec = { obs, live: false, targets: [] };
    const observe = obs.observe.bind(obs);
    const disconnect = obs.disconnect.bind(obs);
    obs.observe = (target, options) => {
      rec.live = true;
      rec.targets.push({ target, options });
      return observe(target, options);
    };
    obs.disconnect = () => {
      rec.live = false;
      rec.targets = [];
      return disconnect();
    };
    all.push(rec);
    return obs;
  };
  return {
    live: () => all.filter((r) => r.live),
    on: (el) => all.filter((r) => r.live && r.targets.some((x) => x.target === el))
  };
}

/**
 * Layout for jsdom: an element's box is its `_rect` (nothing by default), read
 * through getBoundingClientRect and offsetWidth/offsetHeight; `reads(el)` is
 * how often the element's rect was read.
 */
function stubLayout(win) {
  const reads = new Map();
  const ZERO = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  win.Element.prototype.getBoundingClientRect = function () {
    reads.set(this, (reads.get(this) || 0) + 1);
    const r = this._rect;
    if (!r) return ZERO;
    return {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top
    };
  };
  for (const [prop, key] of [
    ['offsetWidth', 'width'],
    ['offsetHeight', 'height']
  ]) {
    Object.defineProperty(win.HTMLElement.prototype, prop, {
      get() {
        return this._rect ? this._rect[key] : 0;
      },
      configurable: true
    });
  }
  return { reads: (el) => reads.get(el) || 0 };
}

/**
 * The SponsorBlock page (harness/sponsorblock.cjs), with the page's
 * MutationObservers tracked and jsdom given layout. `options`: `wrapped` puts
 * ytlr-progress-bar between the renderer and the track; `duration` default 300.
 */
function boot(segments, cfg, currentTime, options) {
  const o = options || {};
  let observers;
  let layout;
  const page = sponsorBlockPage(segments, cfg, currentTime, {
    duration: o.duration,
    wrapped: o.wrapped,
    timers: o.timers,
    setup(win) {
      observers = trackObservers(win);
      layout = stubLayout(win);
    }
  });
  const d = page.win.document;
  const host = d.getElementById('bar-host');
  return Object.assign(page, {
    observers,
    layout,
    host,
    renderer: () => host.querySelector(RENDERER),
    track: () => host.querySelector('[idomkey="progress-bar"]'),
    resize: () => page.win.dispatchEvent(new page.win.Event('resize'))
  });
}

/** What the live observers watch on `el`, sorted: 'attributes,childList' for the bar's parent. */
const watching = (p, el) =>
  p.observers
    .on(el)
    .map((r) =>
      r.targets
        .filter((x) => x.target === el)
        .map((x) => (x.options.childList ? 'childList' : 'attributes'))
        .join('+')
    )
    .sort()
    .join(',');

/** Whether a live observer watches the app root and its subtree: the finder waiting for the bar. */
const finderWaiting = (p) => {
  const app = p.win.document.querySelector('ytlr-app');
  return p.observers
    .on(app)
    .some((r) => r.targets.some((x) => x.target === app && x.options.subtree));
};

(async () => {
  // ---- the bar torn down and rebuilt ---------------------------------------------
  {
    const p = boot([seg('sponsor', 20, 30), seg('selfpromo', 100, 110)], {}, 40);
    await p.ready();
    const first = p.renderer();
    t(
      "the overlay is the renderer's next sibling",
      p.overlays() === 1 && p.overlay().previousElementSibling === first,
      String(p.overlays())
    );
    t(
      'the tracked bar is the track inside the renderer',
      p.sb().progressBar === p.track(),
      p.sb().progressBar && p.sb().progressBar.tagName
    );
    const before = p.observers.live().length;

    // The chrome goes, the overlay beside it with it: with the next PLAYING
    // state the handler looks again.
    p.host.textContent = '';
    p.state(1);
    await wait(50);
    t(
      'with the bar gone the orphaned overlay is dropped',
      p.overlays() === 0,
      String(p.overlays())
    );
    t(
      'and the bar is waited for by the finder, with no poll beside it',
      finderWaiting(p) && !(p.sb().barRetry && p.sb().barRetry.active)
    );

    const second = p.rebuildBar();
    await waitFor(() => p.overlays() === 1);
    t(
      'the rebuilt bar gets the overlay back, as one element',
      p.overlays() === 1 && p.overlay().previousElementSibling === second,
      String(p.overlays())
    );
    t(
      'the finder is gone once the bar is found, and no poll runs',
      !finderWaiting(p) && !(p.sb().barRetry && p.sb().barRetry.active)
    );
    t(
      'the re-attach creates no new observers',
      p.observers.live().length === before,
      `${before} -> ${p.observers.live().length}`
    );

    // Redrawing without a change keeps the element; a changed input replaces it.
    const el = p.overlay();
    p.durationchange(300);
    p.durationchange(300);
    t('redrawing with nothing changed keeps the overlay element', p.overlay() === el);
    p.durationchange(200);
    await wait(30);
    t(
      'a new duration replaces the overlay, still one element',
      p.overlays() === 1 && p.overlay() !== el,
      String(p.overlays())
    );

    // ytlr-progress-bar shows up inside the renderer: the finder waiting on
    // the app root hands over to the pair of observers on the bar.
    const slider = p.win.document.createElement('ytlr-progress-bar');
    const track = p.track();
    slider.appendChild(track);
    second.appendChild(slider);
    await wait(50);
    t(
      'once ytlr-progress-bar exists its parent is watched for the bar being rebuilt and for being hidden',
      watching(p, second) === 'attributes,childList',
      watching(p, second)
    );
    t('the finder on the app root is gone', !finderWaiting(p));
    t('still one overlay', p.overlays() === 1 && p.overlay().isConnected, String(p.overlays()));
  }

  // ---- the observers on YouTube's full bar ------------------------------------------------
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 40, { wrapped: true });
    await p.ready();
    await wait(40);
    t(
      'adopting the bar asks for no bar check of its own (its style is written before it is watched)',
      p.sb().barChecks === 0,
      String(p.sb().barChecks)
    );
    const renderer = p.renderer();
    const track = p.track();
    t(
      'the bar watcher observes the renderer around ytlr-progress-bar: its children and its attributes',
      watching(p, renderer) === 'attributes,childList',
      watching(p, renderer)
    );
    t(
      'and the attributes of the track',
      p.observers.on(track).length === 1,
      String(p.observers.on(track).length)
    );
    const childListTargets = p.observers
      .live()
      .flatMap((r) => r.targets)
      .filter((x) => x.options.childList && p.host.contains(x.target));
    t(
      'the childList observer watches the track’s parent, the renderer and the node the overlay sits in, each for its own children only',
      childListTargets.length === 3 &&
        childListTargets.some((x) => x.target === p.host) &&
        childListTargets.every((x) => !x.options.subtree),
      childListTargets
        .map((x) => x.target.tagName + (x.options.subtree ? '+subtree' : ''))
        .join(', ')
    );
    const liveBefore = p.observers.live().length;

    // The renderer itself is rebuilt: the old pair watches a detached node and
    // must be replaced by exactly one new pair.
    const fresh = p.rebuildBar();
    p.state(1);
    await wait(50);
    t(
      'the rebuilt renderer gets its observers, the old one is disconnected',
      watching(p, fresh) === 'attributes,childList' && p.observers.on(renderer).length === 0,
      `${watching(p, fresh)} new, ${p.observers.on(renderer).length} old`
    );
    t(
      'the rebuilt track gets one observer, the old one is disconnected',
      p.observers.on(p.track()).length === 1 && p.observers.on(track).length === 0,
      `${p.observers.on(p.track()).length} new, ${p.observers.on(track).length} old`
    );
    t(
      'the number of live observers is unchanged',
      p.observers.live().length === liveBefore,
      `${liveBefore} -> ${p.observers.live().length}`
    );
    t(
      'the overlay sits beside the rebuilt renderer, once',
      p.overlays() === 1 && p.overlay().previousElementSibling === fresh,
      String(p.overlays())
    );
  }

  // ---- the overlay's geometry follows the bar ---------------------------------------------
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 40, { wrapped: true });
    await p.ready();
    const renderer = p.renderer();
    const track = p.track();
    p.host._rect = { top: 100, left: 50, width: 800, height: 40 };
    track._rect = { top: 110, left: 60, width: 400, height: 8 };
    p.resize();
    const st = () => p.overlay().style;
    t(
      "resize puts the overlay over the track, relative to the anchor's parent",
      st().top === '10px' &&
        st().left === '10px' &&
        st().width === '400px' &&
        st().height === '8px',
      st().cssText
    );
    t('the overlay is visible while the bar is', st().opacity === '1', st().opacity);

    renderer.classList.add('zylon-hidden');
    await wait(50);
    t(
      'hiding the renderer hides the overlay through the attribute observer, with no resize',
      st().opacity === '0',
      st().opacity
    );
    const reads = p.layout.reads(track);
    p.resize();
    p.timeupdate(41);
    t(
      'hidden and already synced: no layout read on the next resize or timeupdate',
      p.layout.reads(track) === reads,
      `${reads} -> ${p.layout.reads(track)}`
    );

    renderer.classList.remove('zylon-hidden');
    track._rect = { top: 110, left: 60, width: 600, height: 8 };
    p.resize();
    t(
      'shown again the overlay is visible and re-measured',
      st().opacity === '1' && st().width === '600px' && p.layout.reads(track) > reads,
      st().cssText
    );

    // The attribute observer on the track: a class write re-syncs the geometry.
    track._rect = { top: 110, left: 60, width: 500, height: 8 };
    track.setAttribute('class', 'resized');
    await wait(50);
    t('an attribute change on the track re-syncs the overlay', st().width === '500px', st().width);

    // An inline opacity 0 on the anchor hides it too.
    renderer.style.opacity = '0';
    p.resize();
    t('an inline opacity 0 on the bar hides the overlay', st().opacity === '0', st().opacity);
  }

  // ---- the renderer is built a tick before its track ------------------------------------
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 40);
    await p.ready();
    p.host.textContent = '';
    p.state(1);
    await wait(50);
    const renderer = p.win.document.createElement(RENDERER);
    p.host.appendChild(renderer);
    // The finder sees the bare renderer being built.
    await waitFor(() => p.sb().progressBar === renderer);
    t(
      'setup: a renderer without a track is tracked as the bar',
      p.sb().progressBar === renderer && p.overlays() === 1,
      p.sb().progressBar && p.sb().progressBar.tagName
    );
    const track = p.win.document.createElement('div');
    track.setAttribute('idomkey', 'progress-bar');
    renderer.appendChild(track);
    await wait(50);
    t(
      'once the track exists the bar is narrowed to it',
      p.sb().progressBar === track,
      p.sb().progressBar && p.sb().progressBar.tagName
    );
    t(
      'the overlay stays the one element beside the renderer',
      p.overlays() === 1 && p.overlay().previousElementSibling === renderer,
      String(p.overlays())
    );
  }

  // ---- whole-video labels only: no player events, no <video>, no bar ----------------
  {
    const p = boot([seg('sponsor', 0, 0, 'full')], { sbFullVideoLabel: true }, 40);
    await p.ready();
    const d = p.win.document;
    const sb = p.sb();
    const barObservers =
      p.observers.on(p.track()).length +
      p.observers.on(p.renderer()).length +
      p.observers.on(p.host).length;
    t(
      'a video with whole-video labels only binds no <video> and tracks no bar',
      !!sb &&
        sb.video === null &&
        sb.progressBar === null &&
        !sb.domObserver &&
        !sb.attrObserver &&
        !sb.finderObserver &&
        !finderWaiting(p) &&
        barObservers === 0,
      sb && `video ${!!sb.video}, bar ${!!sb.progressBar}, bar observers ${barObservers}`
    );
    t(
      'and writes no style on the track or around the renderer',
      p.track().getAttribute('style') === null && p.host.getAttribute('style') === null,
      p.track().getAttribute('style') + ' / ' + p.host.getAttribute('style')
    );
    const badge = d.getElementById('sb-labels');
    t(
      'its badge is written all the same',
      !!badge && badge.textContent.indexOf('content:"Sponsor"') !== -1,
      badge ? badge.textContent : 'no label stylesheet'
    );
  }

  // ---- nothing to draw: the tracked bar is not searched for again ----------------------
  {
    // The only segment's category switched off: the overlay stays empty, the bar is tracked.
    const p = boot([seg('sponsor', 20, 30)], { sbMode_sponsor: 'disable' }, 40);
    await p.ready();
    const d = p.win.document;
    t('setup: the bar is tracked and no overlay is drawn', !!p.sb().progressBar && !p.overlay());
    const scans = { n: 0 };
    const real = d.querySelector.bind(d);
    d.querySelector = (sel) => {
      if (sel === RENDERER + ' [idomkey="segment"]') scans.n++;
      return real(sel);
    };
    for (let i = 0; i < 3; i++) {
      p.track().className = 'shown-' + i;
      await wait(40);
    }
    p.state(1);
    await wait(40);
    t(
      'attribute changes and PLAYING on a tracked bar with no overlay cost no search',
      scans.n === 0,
      String(scans.n)
    );
    t(
      'the bar checks are counted for the diagnostics',
      p.sb().barChecks >= 3,
      String(p.sb().barChecks)
    );
  }

  // ---- no bar at all: one mechanism waits for it ---------------------------------------
  // The poll for a bar gone from under a watched root (250 ms) at a fifth too:
  // the windows below span three of its rounds.
  const POLL_FIFTH = { scale: 5, from: 250 };
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 40, { timers: POLL_FIFTH });
    await p.ready();
    const d = p.win.document;
    p.host.textContent = '';
    p.state(1);
    await wait(50);
    t('setup: the bar is gone, so is the overlay', !p.overlay());
    const lookups = { n: 0 };
    const real = d.querySelector.bind(d);
    d.querySelector = (sel) => {
      if (sel.indexOf(RENDERER) !== -1 || sel.indexOf('ytlr-progress-bar') !== -1) lookups.n++;
      return real(sel);
    };
    await wait(150);
    t(
      'while the app is quiet nothing polls for the bar: the finder waits for a mutation',
      lookups.n === 0,
      String(lookups.n)
    );
    // The renderer and its track come back with no player event.
    const renderer = d.createElement(RENDERER);
    const track = d.createElement('div');
    track.setAttribute('idomkey', 'progress-bar');
    renderer.appendChild(track);
    p.host.appendChild(renderer);
    await waitFor(() => p.overlay() && p.overlay().previousElementSibling === renderer);
    t(
      'a bar without ytlr-progress-bar is found by the finder when it is built',
      p.sb().progressBar === track && p.overlays() === 1,
      p.sb().progressBar && p.sb().progressBar.tagName
    );
  }
  {
    // Neither the bar nor the <video> is there when the segments arrive: the
    // finder takes over from the poll, which must stop rather than run on beside it.
    let observers;
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, {
      noVideo: true,
      timers: POLL_FIFTH,
      setup(w) {
        observers = trackObservers(w);
        w.document.getElementById('bar-host').textContent = '';
      }
    });
    p.observers = observers;
    await p.ready();
    await wait(100);
    t('setup: the finder waits for the bar', !!p.sb() && finderWaiting(p));
    const d = p.win.document;
    const lookups = { n: 0 };
    const real = d.querySelector.bind(d);
    d.querySelector = (sel) => {
      if (sel.indexOf(RENDERER) !== -1 || sel.indexOf('ytlr-progress-bar') !== -1) lookups.n++;
      return real(sel);
    };
    await wait(150);
    t('with the finder waiting no poll searches for the bar', lookups.n === 0, String(lookups.n));
  }

  // ---- the renderer narrowed to its track: the overlay takes the track's box at once ----
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 40);
    await p.ready();
    p.host.textContent = '';
    p.state(1);
    await wait(50);
    const renderer = p.win.document.createElement(RENDERER);
    renderer._rect = { top: 0, left: 0, width: 700, height: 40 };
    p.host.appendChild(renderer);
    await waitFor(() => p.overlay() && p.overlay().style.width === '700px');
    t(
      'setup: the bare renderer is tracked, the overlay measures it',
      p.sb().progressBar === renderer && p.overlay() && p.overlay().style.width === '700px',
      p.overlay() && p.overlay().style.width
    );
    const track = p.win.document.createElement('div');
    track.setAttribute('idomkey', 'progress-bar');
    track._rect = { top: 16, left: 30, width: 640, height: 8 };
    // Already positioned, as on the TV: tracking it writes no style, so no
    // attribute record of the module's own wakes a sync by accident.
    track.style.position = 'relative';
    track.style.overflow = 'visible';
    renderer.appendChild(track);
    await wait(50);
    const st = p.overlay() && p.overlay().style;
    t(
      'narrowed to the track: the overlay is moved onto the track without waiting for playback',
      p.sb().progressBar === track &&
        st &&
        st.width === '640px' &&
        st.height === '8px' &&
        st.top === '16px' &&
        st.left === '30px',
      st && [st.top, st.left, st.width, st.height].join(' ')
    );
  }

  // ---- the renderer itself replaced, with no player event ----
  for (const wrapped of [false, true]) {
    const p = boot([seg('sponsor', 20, 30)], {}, 40, { wrapped });
    await p.ready();
    const d = p.win.document;
    const old = p.renderer();
    t(
      `setup (${wrapped ? 'wrapped' : 'plain'}): the overlay is shown beside the renderer`,
      p.overlays() === 1 && p.overlay().style.opacity === '1'
    );
    // YouTube swaps the renderer for a new one that is already hidden.
    const fresh = d.createElement(RENDERER);
    fresh.className = 'zylon-hidden';
    const track = d.createElement('div');
    track.setAttribute('idomkey', 'progress-bar');
    if (wrapped) {
      const slider = d.createElement('ytlr-progress-bar');
      slider.appendChild(track);
      fresh.appendChild(slider);
    } else {
      fresh.appendChild(track);
    }
    p.host.replaceChild(fresh, old);
    await waitFor(() => p.sb().progressBar === track);
    t(
      `a replaced renderer is seen without a player event (${wrapped ? 'wrapped' : 'plain'}): its track is tracked`,
      p.sb().progressBar === track
    );
    await waitFor(() => p.overlay() && p.overlay().style.opacity === '0');
    t(
      `and the overlay follows the new renderer, hidden (${wrapped ? 'wrapped' : 'plain'})`,
      p.overlays() === 1 && p.overlay().style.opacity === '0',
      p.overlay() && p.overlay().style.opacity
    );
  }

  // ---- a bar check that throws does not stop the ones after it ----
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 40, {
      allowErrors: /bar check test throw/
    });
    await p.ready();
    t('setup: the overlay is shown', !!p.overlay() && p.overlay().style.opacity === '1');
    const proto = p.win.Element.prototype;
    const real = proto.getBoundingClientRect;
    let armed = true;
    proto.getBoundingClientRect = function () {
      if (armed) {
        armed = false;
        throw new Error('bar check test throw');
      }
      return real.call(this);
    };
    const renderer = p.win.document.querySelector(RENDERER);
    // The check this hide asks for throws while it measures.
    renderer.classList.add('zylon-hidden');
    await waitFor(() => !armed);
    await wait(40);
    // Still hidden; another attribute change asks for the next check.
    renderer.setAttribute('style', 'color: red');
    await waitFor(() => p.overlay().style.opacity === '0');
    t(
      'after a check threw, the next one runs: the hidden bar hides the overlay',
      p.overlay().style.opacity === '0',
      p.overlay().style.opacity
    );
  }

  report.finish();
})();
