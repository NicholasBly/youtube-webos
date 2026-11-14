// One instance per watched video, shared by SponsorBlock and the dislike
// counter: created when the watch page shows a video, kept across hash changes
// within the same video, torn down when the video changes, off the watch page,
// when its setting changes (and then recreated) and on unload.
import { configAddChangeListener } from './config.js';

/** The id of the video being watched, or null off the watch page. */
function watchVideoIdFromHash() {
  const hash = window.location.hash;
  if (!hash) return null;
  const url = new URL(hash.slice(1), location.href);
  return url.pathname === '/watch' ? url.searchParams.get('v') : null;
}

/**
 * `create(videoID)` returns the instance (with init(), destroy(), `videoID`
 * and `isDestroyed`) or null while the feature is off; a change of the
 * `restartOn` setting recreates it; `windowName` exposes the live instance
 * on window, for the tests and for diagnostics on the TV. Returns the getter
 * of the live instance: the current one, or null once it has torn itself down.
 */
export function bootstrapPerVideo({ create, restartOn, windowName }) {
  let current = null;
  let timer = null;
  /** The current instance while it is alive, else null (also the getter published on window). */
  const live = () => (current && !current.isDestroyed ? current : null);

  Object.defineProperty(window, windowName, { configurable: true, get: live });
  /** Replaces the current instance (null: none). */
  const set = (instance) => {
    current = instance;
  };
  /** Destroys the current instance, if any, and forgets it. */
  const teardown = () => {
    if (!current) return;
    current.destroy();
    set(null);
  };
  // A setting change waiting in the timer: a hash change that replaces the
  // timer within the 10 ms must not drop it.
  let restartPending = false;
  // Deferred a moment, so a burst of hash changes settles into one decision.
  const sync = (settingChanged) => {
    if (timer) clearTimeout(timer);
    restartPending = restartPending || settingChanged;
    timer = setTimeout(() => {
      timer = null;
      const restart = restartPending;
      restartPending = false;
      const videoID = watchVideoIdFromHash();
      // The same video under a new hash (a timestamp, a playlist) keeps its
      // instance, even one that is done: a 404 is final for the video.
      if (!restart && current && current.videoID === videoID) return;
      teardown();
      const instance = videoID ? create(videoID) : null;
      if (instance) {
        set(instance);
        instance.init();
      }
    }, 10);
  };

  window.addEventListener('hashchange', () => sync(false));
  configAddChangeListener(restartOn, () => sync(true));
  window.addEventListener('beforeunload', teardown);

  // The body class and the hash are settled half a second after the document is.
  const start = () => setTimeout(() => sync(false), 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return live;
}
