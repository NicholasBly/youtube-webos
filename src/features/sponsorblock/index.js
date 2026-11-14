// SponsorBlock: skips sponsored segments and draws them on the progress bar.
// This class owns the fields, the lifecycle and the public surface; the
// sibling modules take the handler as `sb`.
import {
  configAddChangeListener,
  configRemoveChangeListener,
  configGetAll
} from '../../core/config.js';
import { showNotification } from '../../ui/toast/index.js';
import { createDisposables } from '../../core/disposables.js';
import { isLegacyWebOS } from '../../core/webos.js';
import { getVideo, waitForChildAdd } from '../../core/dom.js';
import { createLogger } from '../../core/log.js';
import { MODE_KEYS, COLOR_KEYS, LABEL_KEYS, TIMING } from './constants.js';
import { fetchSegmentsRetrying } from './api.js';
import { clampSegments } from './segments.js';
import {
  refreshSkipSegments,
  detachTimeListener,
  stopHighFreqLoop,
  clearManualNotification,
  clearSkipWatchdog,
  handleTimeUpdate,
  highFreqLoop
} from './skipping.js';
import { executeChainSkip, cancelChainRetry } from './chain.js';
import { jumpToHighlight, skipToPreviousSegment, manualSkipOrHighlight } from './blue-key.js';
import { leaveMutedSegment } from './mute.js';
import {
  watchProgressBar,
  acquireProgressBar,
  redrawOverlay,
  disconnectObservers,
  stopBarRetry
} from './bar.js';
import { bindWindowEvents, bindVideoEvents } from './video-events.js';
import { recolourOverlay } from './overlay.js';
import popup from './popup.js';
import labels, { isFullVideoSegment } from './labels.js';
import { bootstrapSponsorBlock } from './bootstrap.js';
import './sponsorblock.css';

class SponsorBlockHandler {
  /**
   * A handler for one video: empty state (segments, the bound <video>, the bar, the overlay, the
   * skip state) and the config listeners. init() fetches the segments.
   */
  constructor(videoID) {
    this.videoID = videoID;
    this.logger = createLogger(`SB:${videoID}`);
    this.legacy = isLegacyWebOS();
    this.isDestroyed = false;
    // Everything destroy() undoes: the window listeners and the config listeners.
    this.bag = createDisposables();
    // The current <video>'s listeners, undone on a rebind as well.
    this.videoBag = null;

    // The API's segments (sorted by start) and the ones to act on.
    this.segments = [];
    this.highlightSegment = null;
    // The highlight's auto jump, waiting for a <video> to be bound.
    this.highlightPending = false;
    this.skipSegments = [];
    // The mode of every category, joined: the overlay hash changes with it.
    this.modeSig = '';

    this.video = null;
    this.videoWait = null;
    this.progressBar = null;
    // Which BAR_SELECTORS entry the tracked bar matched; a fallback match is narrowed later.
    this.barSelectorIndex = -1;
    this.overlay = null;
    // Each mark of the overlay with its category and colour, for a recolour in place.
    this.overlayMarks = [];
    this.lastOverlayHash = null;
    // Set by bar.js while the chrome is watched.
    this.domObserver = null;
    this.attrObserver = null;
    this.finderObserver = null;
    this.observedRoot = null;
    this.barRetry = null;
    // A bar check is on the next frame, one at a time (bar.js scheduleCheck);
    // how many the observers asked for, for the diagnostics.
    this.isProcessing = false;
    this.barChecks = 0;
    // The overlay's geometry: when it was last synced, what it last synced to,
    // and the cached anchor with the bar it was found for (overlay.js).
    this.lastSyncTime = 0;
    this.lastSyncSig = null;
    this.anchor = null;

    // Where the playhead is relative to the segments, and what was skipped.
    this.nextSegmentIndex = 0;
    this.nextSegmentStart = Infinity;
    this.lastSkipTime = -1;
    this.lastSkippedSegmentIndex = -1;
    this.skippedSegmentIndices = new Set();
    this.tempWhitelistIndex = -1; // the segment the blue key seeked back into
    // The wait for a <video> without metadata yet (chain.js).
    this.chainRetry = null;
    this.isSkipping = false;
    this.skipWatchdogTimer = null;

    // The manual-skip prompt and the muted segment.
    this.activeManualNotification = null;
    this.currentManualSegment = null;
    this.mutedSegment = null;
    this.mutedBefore = false;

    this.timeListenerActive = false;

    /** The <video>'s timeupdate listener, bound to this handler. */
    this.boundTimeUpdate = () => handleTimeUpdate(this);
    this.pollingRafId = null;

    /** The frame loop's callback, bound to this handler. */
    this.boundHighFreqLoop = () => highFreqLoop(this);
    this.rafIds = new Set();

    // Drops the segment fetch in flight (api.js).
    this.abortFetch = null;

    this.setupConfigListeners();
    this.logger.info(`Created handler for ${videoID}`);
  }

  /**
   * requestAnimationFrame that destroy() cancels, and that never calls back into a destroyed
   * handler.
   */
  requestAF(callback) {
    if (this.isDestroyed) return;
    const id = requestAnimationFrame(() => {
      this.rafIds.delete(id);
      if (!this.isDestroyed) callback();
    });
    this.rafIds.add(id);
  }

  /**
   * Follows the SponsorBlock settings: a mode change rebuilds the skip list, the overlay and the
   * labels; a colour repaints the marks; a label option relabels. Builds the lot once now.
   */
  setupConfigListeners() {
    // A colour repaints the marks, a label option relabels, a mode rebuilds the lot;
    // skipSegmentsOnce is read at skip time and needs no listener.
    const rebuild = () => {
      const config = configGetAll();
      this.modeSig = MODE_KEYS.map((key) => config[key]).join(',');
      refreshSkipSegments(this);
      redrawOverlay(this);
      this.updateLabels();
    };
    /** A colour changed: repaints the overlay's marks in place and the labels. */
    const recolour = () => {
      recolourOverlay(this);
      this.updateLabels();
    };
    /** A label option changed: rewrites the labels. */
    const relabel = () => this.updateLabels();

    /** Adds a config listener that destroy() removes. */
    const listen = (key, callback) => {
      configAddChangeListener(key, callback);
      this.bag.add(() => configRemoveChangeListener(key, callback));
    };
    for (const key of MODE_KEYS) listen(key, rebuild);
    for (const key of COLOR_KEYS) listen(key, recolour);
    for (const key of LABEL_KEYS) listen(key, relabel);

    rebuild();
  }

  /** Fetches the video's segments and applies them, or destroys the handler when there are none. */
  async init() {
    if (this.isDestroyed) return;
    try {
      const segments = await fetchSegmentsRetrying(this, this.videoID);
      if (this.isDestroyed) return;
      if (segments && segments.length > 0) this.applySegments(segments);
      else this.destroy();
    } catch (e) {
      // fetchSegmentsRetrying() never throws: an error here is a bug in
      // applySegments(), and not one the viewer can act on.
      if (!this.isDestroyed) this.logger.error('init failed', e);
    }
  }

  /**
   * The segments arrived: the popup and the labels, then the player events,
   * the <video> and the bar (nothing needs them before this, and most videos
   * have no segments), the skip list, the chain, the overlay, the highlight.
   */
  applySegments(segments) {
    this.segments = segments.sort((a, b) => a.segment[0] - b.segment[0]);

    // Full-video labels are [0, 0] markers meaning "this whole video is X",
    // not segments, and listing one would show a nonsense 0:00-to-0:00 row.
    const listed = this.segments.filter((s) => !isFullVideoSegment(s));
    popup.updateSegments(listed);
    this.updateLabels();
    // Whole-video labels only: nothing to skip, mute or draw, so no player
    // events, no <video> and no bar; the badge is all there is.
    if (listed.length === 0) return;

    this.highlightSegment = this.segments.find((s) => s.category === 'poi_highlight');
    bindWindowEvents(this);
    // A bound <video> builds the skip list with its duration.
    this.bindOrWaitForVideo();
    if (this.video) executeChainSkip(this, this.video);
    else refreshSkipSegments(this);

    watchProgressBar(this);
    acquireProgressBar(this);

    if (this.highlightSegment) {
      const hlMode = configGetAll().sbMode_highlight;
      if (hlMode === 'auto_skip') {
        if (this.video) jumpToHighlight(this);
        else this.highlightPending = true;
      } else if (hlMode === 'ask') showNotification('Highlight available: Press Blue to jump');
    }
  }

  /** Binds the <video> when it is there, or waits for it to mount, one wait at a time. */
  bindOrWaitForVideo() {
    // getVideo() caches with an isConnected guard and invalidates on page
    // change; when the element is not there yet, waitForChildAdd() resolves
    // the moment it mounts. A wait that runs out is armed again by the next
    // PLAYING state (video-events.js).
    const video = getVideo();
    if (video) {
      this.bindVideo(video);
      return;
    }
    if (this.videoWait) return;
    // The <video> itself, or a player subtree mounted with it inside.
    this.videoWait = waitForChildAdd(
      document.body,
      (n) => n instanceof HTMLVideoElement || !!(n.querySelector && n.querySelector('video')),
      TIMING.VIDEO_WAIT_MS
    );
    this.videoWait.promise
      .then(() => {
        this.videoWait = null;
        if (!this.isDestroyed) this.bindOrWaitForVideo();
      })
      .catch(() => {
        this.videoWait = null;
      });
  }

  /** Lets go of the bound <video>: its listeners, the loop, the mute and the metadata wait. */
  unbindVideo() {
    detachTimeListener(this);
    stopHighFreqLoop(this);
    leaveMutedSegment(this);
    cancelChainRetry(this);
    if (this.videoBag) this.videoBag.dispose();
    this.videoBag = null;
    this.video = null;
  }

  /** The <video> was replaced: binds the new one, or waits for it to mount. */
  rebindVideo() {
    this.unbindVideo();
    this.bindOrWaitForVideo();
  }

  /**
   * Starts working with `video`: its listeners, segments clamped to its duration, the skip list,
   * the overlay, and a highlight jump that was waiting for it.
   */
  bindVideo(video) {
    // Whatever still hangs on the old element goes with it.
    this.unbindVideo();
    this.video = video;
    this.videoBag = createDisposables();
    bindVideoEvents(this);
    if (video.duration) clampSegments(this, video.duration);
    refreshSkipSegments(this);
    // A bar tracked before the <video> was there has had nothing to draw with.
    if (this.progressBar) redrawOverlay(this);
    if (this.highlightPending) {
      this.highlightPending = false;
      jumpToHighlight(this);
    }
  }

  /**
   * Refresh the title badge and the skips-removed duration. Cheap and
   * idempotent, so it is called from anywhere the inputs can move: after the
   * fetch, on durationchange, and whenever a SponsorBlock setting changes.
   */
  updateLabels() {
    if (this.isDestroyed) return;
    const video = this.video || getVideo();
    const duration = video && !isNaN(video.duration) ? video.duration : 0;
    labels.update(this.segments, duration);
  }

  /**
   * Undoes everything: the <video>'s listeners and mute, frames, the fetch, timers, observers, the
   * popup rows, the labels and the overlay. Safe to call twice.
   */
  destroy() {
    // init() tears a segment-less handler down itself and the bootstrap tears
    // it down again on the next video.
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.logger.info('Destroying instance.');

    // The <video>: its listeners, the frame loop, the mute, the metadata wait.
    this.unbindVideo();
    this.rafIds.forEach((id) => {
      cancelAnimationFrame(id);
    });
    this.rafIds.clear();
    if (this.abortFetch) this.abortFetch();

    clearManualNotification(this);
    clearSkipWatchdog(this);
    stopBarRetry(this);
    disconnectObservers(this);
    if (this.videoWait) {
      this.videoWait.cancel();
      this.videoWait = null;
    }

    // Hides the popup and keeps the panel's wish to show it for the next video.
    popup.updateSegments([]);
    labels.clear();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    this.overlayMarks = [];

    this.bag.dispose();

    this.segments = [];
    this.skipSegments = [];
    this.progressBar = null;
    this.tempWhitelistIndex = -1;
    this.skippedSegmentIndices.clear();
  }

  // --- The public surface: the shortcuts ---

  /** The 'Skip to Last SponsorBlock Segment' shortcut (skipping.js); false when there is none. */
  skipToPreviousSegment() {
    return skipToPreviousSegment(this);
  }

  /**
   * The blue key: skips the segment being offered, else jumps to the highlight (skipping.js); false
   * when neither applies.
   */
  manualSkipOrHighlight() {
    return manualSkipOrHighlight(this);
  }
}

bootstrapSponsorBlock(SponsorBlockHandler);
