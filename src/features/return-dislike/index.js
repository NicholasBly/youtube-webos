// Return YouTube Dislike: shows the dislike count in the description panel and
// keeps keyboard navigation working inside it. This class owns the fields, the
// lifecycle and the data fetch; the sibling modules take the instance as `ryd`.
import './return-dislike.css';
import { TIMING } from './constants.js';
import { createDisposables } from '../../core/disposables.js';
import { createLogger } from '../../core/log.js';
import { getCachedDislikes, setCachedDislikes, fetchDislikeCount } from './api.js';
import { updateDislikeDisplay, clearHeaderShift } from './injection.js';
import { findPanelNow, pollForPanel, stopPanelPoll, releasePanel } from './panel-observer.js';
import { attachListeners } from './focus-tracking.js';
import { bootstrapReturnDislike } from './bootstrap.js';

class ReturnYouTubeDislike {
  /**
   * A dislike counter for one video: empty state (the count, the panel, its observers, the focus
   * tracking, named timers). init() starts it.
   */
  constructor(videoID, enableDislikes = true) {
    this.videoID = videoID;
    this.logger = createLogger('RYD:' + videoID);
    this.enableDislikes = enableDislikes;
    this.isDestroyed = false;
    // Everything destroy() undoes: the window and document listeners.
    this.bag = createDisposables();
    // Named timers: scheduling one again replaces the pending one.
    this.timers = {};

    // null until a fetch succeeds, so "the API said zero" stays distinct from
    // "the request failed".
    this.dislikesValue = null;
    this.fetchAttempts = 0;
    // Drops the dislike fetch in flight (api.js).
    this.abortFetch = null;

    // The panel and the factoid in it (injection.js, panel-observer.js).
    this.panelElement = null;
    this.dislikeValueElement = null;
    this.dislikeFactoidElement = null;
    this.cachedMode = null;
    // The row the factoid went into, which got the ryd-ready class.
    this.factoidContainer = null;
    this.panelPoll = null;
    // The current panel's observers, undone when the panel changes or on destroy.
    this.panelBag = null;
    // The header shift: the shifted list, the last measurement and the stylesheet.
    this.shiftedList = null;
    this.shiftMemo = null;
    this.shiftStyle = null;

    // Keyboard navigation (navigation.js, focus-tracking.js).
    this.menuItemsCache = [];
    this.menuItemsMap = new Map();
    this.focusedIndex = -1;
    this.lastFocusedElement = null;
    // The panel's list container, looked up once per panel.
    this.dynamicList = undefined;
    // Whether focus is inside the panel, so a keypress skips the DOM check.
    this.isPanelFocused = false;
    this.isProgrammaticFocus = false;
  }

  /** A named timer: scheduling again replaces the pending one, destroy clears them all. */
  schedule(callback, delay, name) {
    clearTimeout(this.timers[name]);
    if (this.isDestroyed) return;
    this.timers[name] = setTimeout(() => {
      delete this.timers[name];
      if (!this.isDestroyed) callback();
    }, delay);
  }

  /**
   * Starts the listeners, looks for an open description panel once, and fetches the dislike count.
   */
  async init() {
    this.logger.info('Initializing');
    try {
      attachListeners(this);

      // Panel detection must not sit behind the network: a cold first request
      // to the API can take seconds, up to the timeout. One look now; the
      // bounded poll is armed by the description shortcut and by a panel that
      // went stale, not on every video.
      findPanelNow(this);

      // A panel set up while the fetch is in flight already holds the
      // placeholder; fetchVideoData() writes the number into it.
      if (this.enableDislikes) await this.fetchVideoData();
    } catch (error) {
      this.logger.error('Init error:', error);
    }
  }

  /**
   * Gets the dislike count (cached, else from the API) and shows it; a failed request is retried a
   * few times with a growing delay.
   */
  async fetchVideoData() {
    const cached = getCachedDislikes(this.videoID);
    if (cached !== undefined) {
      this.dislikesValue = cached;
      updateDislikeDisplay(this);
      return;
    }

    const request = fetchDislikeCount(this.videoID);
    this.abortFetch = request.abort;
    try {
      this.dislikesValue = await request.promise;
      this.fetchAttempts = 0;
      setCachedDislikes(this.videoID, this.dislikesValue);
      // The panel may already be on screen showing the placeholder.
      updateDislikeDisplay(this);
    } catch (error) {
      if (error.name !== 'AbortError') this.logger.warn('Fetch error:', error);
      this.dislikesValue = null; // unknown, not zero: never cached
      if (
        !this.isDestroyed &&
        error.name !== 'AbortError' &&
        ++this.fetchAttempts <= TIMING.FETCH_MAX_RETRIES
      ) {
        const delay = TIMING.FETCH_RETRY_BASE_MS * this.fetchAttempts;
        this.logger.info(
          `Retrying the dislike fetch in ${delay} ms (attempt ${this.fetchAttempts})`
        );
        this.schedule(() => this.fetchVideoData(), delay, 'retry');
      }
    } finally {
      this.abortFetch = null;
    }
  }

  /** The description shortcut and a stale panel arm the bounded poll (panel-observer.js). */
  pollForPanel() {
    pollForPanel(this);
  }

  /**
   * Undoes everything: the fetch, timers, the panel poll, listeners, the panel's observers and the
   * header shift. Safe to call twice.
   */
  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.logger.info('Destroying');
    if (this.abortFetch) this.abortFetch();

    for (const key of Object.keys(this.timers)) clearTimeout(this.timers[key]);
    this.timers = {};
    stopPanelPoll(this);
    this.bag.dispose();
    releasePanel(this);
    clearHeaderShift(this);
  }
}

bootstrapReturnDislike(ReturnYouTubeDislike);
