/**
 * SponsorBlock's page and API for the behaviour scripts. The data
 * (VIDEO, PREFIX, seg) is sponsorblock-data.cjs's, passed on from here.
 *
 *   sponsorBlockPage(segments, cfg, currentTime, options)
 *     a watch page with the bar, a <video> under a playback model and the API
 *     answering with `segments`: the handler's whole surface for a test (see
 *     the function below)
 *   sponsorBlockFetch(videoID, segments, options)
 *     a page's `fetch`: /skipSegments/ requests answer with `segments` for
 *     `videoID`, anything else rejects 'offline'. `requests` collects every
 *     URL asked, `answered()` counts the answers handed back. Options: `apiStatus` answers with that HTTP status and no
 *     body; `body` answers 200 with that JSON instead; `alsoFor` lists more
 *     video ids answered with the same segments; `stallBody: n` answers the
 *     first n requests with headers and a body that never completes; `hang` never answers, each
 *     request kept in `pending` with its `signal`, `aborted`, and
 *     `resolve(segments)` to answer it late.
 */
'use strict';

const { createPage } = require('./page.cjs');
const { waitFor, press, toasts, videoModel } = require('./fixtures.cjs');
const { VIDEO, PREFIX, seg } = require('./sponsorblock-data.cjs');

function sponsorBlockFetch(videoID, segments, options) {
  const o = options || {};
  const requests = [];
  const pending = [];
  let answers = 0;
  const counted = (promise) =>
    promise.then((response) => {
      answers++;
      return response;
    });
  const fetch = (url, opts) => counted(answer(url, opts));
  const answer = (url, opts) => {
    requests.push(String(url));
    if (String(url).indexOf('/skipSegments/') === -1) {
      return Promise.reject(new Error('offline'));
    }
    if (o.hang) {
      const rec = { url: String(url), signal: opts && opts.signal, aborted: false };
      rec.promise = new Promise((resolve, reject) => {
        rec.resolve = (segs) =>
          resolve({ ok: true, json: async () => [{ videoID, segments: segs }] });
        if (rec.signal) {
          rec.signal.addEventListener('abort', () => {
            rec.aborted = true;
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        }
      });
      pending.push(rec);
      return rec.promise;
    }
    if (o.apiStatus) {
      return Promise.resolve({ ok: false, status: o.apiStatus, json: async () => [] });
    }
    if (o.body !== undefined) {
      return Promise.resolve({ ok: true, status: 200, json: async () => o.body });
    }
    if (requests.length <= (o.stallBody || 0)) {
      // The headers arrive, the body never finishes.
      return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
    }
    const ids = [videoID].concat(o.alsoFor || []);
    return Promise.resolve({
      ok: true,
      json: async () => ids.map((id) => ({ videoID: id, segments }))
    });
  };
  return { fetch, requests, pending, answered: () => answers };
}

/**
 * `options`: `apiStatus` makes the SponsorBlock API answer with that HTTP
 * status and no body; `duration` is the video's (default 300); `readyState`
 * too (default 4; 0 is a <video> still without its metadata, until
 * loadedmetadata()); `noVideo`
 * leaves the <video> out until addVideo(); `hang` makes the API never answer,
 * with each request in `pending` (its `signal`, `aborted`, and resolve(segments)
 * to answer it late); `timers` replaces the timer scale below; `wrapped` puts
 * ytlr-progress-bar between the renderer and its track (what the bar watcher
 * looks for first); `seekedAfter` makes the player report `seeked` that many
 * ms after every time the page writes; `allowErrors` is page.cjs's (page
 * errors matching it are expected); `setup(win)` runs before the bundle,
 * after the playback model is on the <video>. Returns the page with the
 * playback model, the player's events as functions, `seeks` (every time the
 * page wrote, in order), the toasts and the overlay.
 */
function sponsorBlockPage(segments, cfg, currentTime, options) {
  const o = options || {};
  const api = sponsorBlockFetch(VIDEO, segments, o);
  const seeks = [];
  let model;
  let video;
  let win;
  const attachModel = () => {
    video = win.document.querySelector('video');
    model = videoModel(win, {
      currentTime: currentTime || 0,
      duration: o.duration || 300,
      readyState: o.readyState === undefined ? 4 : o.readyState,
      paused: false
    });
    // Every time written by the page, in order; with `seekedAfter` the player
    // also reports `seeked` that many ms after each write, as a real one does.
    Object.defineProperty(video, 'currentTime', {
      get: () => model.currentTime,
      set: (v) => {
        model.currentTime = v;
        seeks.push(v);
        if (o.seekedAfter != null) {
          const target = video;
          win.setTimeout(() => target.dispatchEvent(new win.Event('seeked')), o.seekedAfter);
        }
      },
      configurable: true
    });
    // The playback model has no mute state; the muted segments need one.
    model.muted = false;
    Object.defineProperty(video, 'muted', {
      get: () => model.muted,
      set: (v) => {
        model.muted = !!v;
      },
      configurable: true
    });
  };
  const track = '<div idomkey="progress-bar"></div>';
  const bar = o.wrapped ? `<ytlr-progress-bar>${track}</ytlr-progress-bar>` : track;
  createPage({
    html: `<!doctype html><html><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app>
      <div id="ytlr-player__player-container">${o.noVideo ? '' : '<video></video>'}</div>
      <div id="bar-host"><ytlr-multi-markers-player-bar-renderer>${bar}</ytlr-multi-markers-player-bar-renderer></div>
    </ytlr-app></body></html>`,
    url: 'https://www.youtube.com/tv#/watch?v=' + VIDEO,
    config: Object.assign({ enableSponsorBlock: true }, cfg),
    raf: 'timeout',
    // The handler starts 500 ms after load, its skip watchdog is 1.5 s and the
    // API timeout 5 s: all at a fifth, so a boot settles in a few hundred ms.
    timers: o.timers || { scale: 5, from: 500 },
    fetch: api.fetch,
    allowErrors: o.allowErrors,
    setup(w) {
      win = w;
      if (!o.noVideo) attachModel();
      if (o.setup) o.setup(w);
    }
  });
  /** The player reports a new time. */
  const timeupdate = (time) => {
    model.currentTime = time;
    video.dispatchEvent(new win.Event('timeupdate'));
  };
  /** The player finished a (programmatic) seek. */
  const seeked = () => video.dispatchEvent(new win.Event('seeked'));
  /** Playback resumes. */
  const playing = () => video.dispatchEvent(new win.Event('playing'));
  /** The user seeks: the player lands on the time and reports `seeked`. */
  const seekTo = (time) => {
    model.currentTime = time;
    seeked();
  };
  /** The metadata is in: the <video> can say where it is. */
  const loadedmetadata = () => {
    model.readyState = 4;
    video.dispatchEvent(new win.Event('loadedmetadata'));
  };
  /** The player learned a new duration. */
  const durationchange = (duration) => {
    model.duration = duration;
    video.dispatchEvent(new win.Event('durationchange'));
  };
  /** The player state event the quality module publishes: 0 ended, 1 playing, 2 paused. */
  const state = (s) =>
    win.dispatchEvent(new win.CustomEvent('yt-player-state-change', { detail: { state: s } }));
  /** The TV UI tears the player chrome down and builds it again; the new bar. */
  const rebuildBar = () => {
    const d = win.document;
    const host = d.getElementById('bar-host');
    host.textContent = '';
    const renderer = d.createElement('ytlr-multi-markers-player-bar-renderer');
    const trackEl = d.createElement('div');
    trackEl.setAttribute('idomkey', 'progress-bar');
    if (o.wrapped) {
      const slider = d.createElement('ytlr-progress-bar');
      slider.appendChild(trackEl);
      renderer.appendChild(slider);
    } else {
      renderer.appendChild(trackEl);
    }
    host.appendChild(renderer);
    return renderer;
  };
  /** The <video> mounts (a `noVideo` page), with the playback model on it. */
  const addVideo = () => {
    const v = win.document.createElement('video');
    win.document.getElementById('ytlr-player__player-container').appendChild(v);
    attachModel();
    return v;
  };
  /**
   * The boot has settled: the handler asked the API and its answer was handed
   * back (a hanging API never answers), or the overlay is drawn; then two of
   * the page's frames have run, which is where the overlay and the toasts of
   * the boot (a chain skip, a highlight offer) come. Frames, not a wait: their
   * order holds on a loaded machine. Resolves to whether it settled: nothing
   * does with SponsorBlock off, which waits out the timeout and resolves to false.
   */
  const ready = async () => {
    const overlayDrawn = () => !!win.document.getElementById('previewbar');
    const asked = await waitFor(() => api.requests.length > 0 || overlayDrawn());
    if (asked && !o.hang) await waitFor(() => api.answered() > 0 || overlayDrawn());
    await new Promise((resolve) => {
      win.requestAnimationFrame(() => win.requestAnimationFrame(resolve));
    });
    return !!asked;
  };
  return {
    win,
    get model() {
      return model;
    },
    ready,
    requests: api.requests,
    pending: api.pending,
    seeks,
    timeupdate,
    seeked,
    playing,
    seekTo,
    durationchange,
    loadedmetadata,
    state,
    rebuildBar,
    addVideo,
    press: (code) => press(win, code, win.document.body),
    toasts: () => toasts(win),
    overlay: () => win.document.getElementById('previewbar'),
    overlays: () => win.document.querySelectorAll('#previewbar').length,
    sb: () => win.sponsorblock
  };
}

module.exports = { VIDEO, PREFIX, seg, sponsorBlockFetch, sponsorBlockPage };
