/* eslint-disable no-console */
/**
 * perf_mon.js — YTAF Engine Diagnostics
 * =====================================================================
 * Dev-only instrumentation for the webOS YouTube mod.
 *
 * WHAT IT DOES
 *   1. Hooks every runtime boundary this mod actually crosses (JSON.parse,
 *      JSON.stringify, fetch, XHR, MutationObserver, IntersectionObserver,
 *      timers, rAF, DOM queries, layout reads, event listeners) and charges
 *      the cost back to the module + function responsible.
 *   2. Carries a registry of every function in the codebase and its role, so
 *      the cluster reports "this is firing / this is silent / this should not
 *      be running here" instead of anonymous numbers.
 *   3. Runs a feature-expectation sweep on every page transition: for each
 *      enabled option it knows what should happen on this page, and verifies
 *      it against live DOM and runtime evidence.
 *   4. Renders an automotive instrument cluster sized for a TV across a room.
 *   5. Emits machine-readable bottleneck reports for an AI agent to review.
 *
 * LOAD ORDER MATTERS. Import this FIRST in userScript.js. It installs "inner"
 * probes immediately, so it sits underneath adblock's JSON.parse hook and can
 * time the native parse; then it arms "outer" probes in a deferred task once
 * the bundle has finished evaluating, so it also sits above every mod hook and
 * can time the total. Mod overhead = outer - inner.
 *
 * REMOTE   YELLOW toggles the cluster. LEFT/RIGHT tab. UP/DOWN scroll.
 * CONSOLE  __PERF.help()
 */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.__PERF && window.__PERF.__installed) return;

  // ===================================================================
  // 0. TUNING
  // ===================================================================

  var OPTIONS = {
    probeJson: true,
    probeNetwork: true,
    probeObservers: true,
    probeTimers: true,
    probeRaf: true,
    probeDom: true,
    probeLayout: true,
    probeEvents: true,
    probeProtos: true,

    uiHz: 2,
    domCountEveryNTicks: 4,
    autoReport: true,
    autoReportCooldownMs: 20000,
    sweepDelayMs: 1200,
    // Several features bind late: the player reports PLAYING, the description
    // panel mounts, segments arrive. A single sweep at 1.2s calls them stalled
    // before they have had a chance to run.
    lateSweepMs: 6000,
    ignitionSweep: true,
    startVisible: false
  };

  var THRESHOLDS = {
    fpsFloor: 30,
    fpsCritical: 20,
    frameBudgetMs: 16.7,
    longTaskMs: 50,
    longTaskSevereMs: 200,
    moduleBudgetMsPerSec: 60,
    moduleCriticalMsPerSec: 140,
    parseHookMsPerSec: 40,
    domNodesWarn: 6000,
    domNodesCritical: 9000,
    headProbesPerSec: 6,
    layoutReadsPerSec: 200,
    fastIntervalMs: 250,
    heapGrowthMbPerMin: 12
  };

  // ===================================================================
  // 1. DESIGN TOKENS — night-drive instrument cluster.
  //    Warm tungsten backlight in a deep instrument well. Amber is the
  //    lamp, red is the needle and the redline, green is signal only.
  // ===================================================================

  var C = {
    well: 'rgba(6,8,11,0.94)',
    bezel: '#171c24',
    bezelLine: '#2b333f',
    tungsten: '#ffb648',
    tungstenDim: 'rgba(255,182,72,0.32)',
    needle: '#ff4433',
    live: '#3ee08a',
    idle: '#5a6472',
    warn: '#ffcc00',
    alarm: '#ff2d20',
    ink: '#eef2f7',
    inkDim: '#8b95a5'
  };

  var FONT_UI = "'Roboto Condensed','Arial Narrow',Roboto,Arial,sans-serif";
  var FONT_DATA = "'Roboto Mono',Menlo,Consolas,monospace";

  // ===================================================================
  // 2. PRIMITIVES
  // ===================================================================

  var perfObj = window.performance || {};
  var now =
    perfObj && perfObj.now
      ? function () {
          return perfObj.now();
        }
      : function () {
          return Date.now();
        };

  var BOOT = now();
  var nativeSetTimeout = window.setTimeout.bind(window);
  var nativeClearTimeout = window.clearTimeout.bind(window);
  var nativeSetInterval = window.setInterval.bind(window);
  var nativeClearInterval = window.clearInterval.bind(window);
  var nativeRaf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (cb) {
        return nativeSetTimeout(cb, 16);
      };

  /** Instrumentation must never take the app down. */
  function safe(fn, label) {
    try {
      return fn();
    } catch (e) {
      if (!safe._seen) safe._seen = {};
      var k = label || 'anon';
      if (!safe._seen[k]) {
        safe._seen[k] = 1;
        console.warn('[PERF] probe error in ' + k, e);
      }
      return undefined;
    }
  }

  /**
   * Windowed meter: cumulative totals plus a ring of recent samples, so we can
   * answer "how many ms of blocking work in the last second" — the only figure
   * that correlates with dropped frames.
   */
  function Meter(name) {
    this.name = name;
    this.count = 0;
    this.total = 0;
    this.max = 0;
    this.last = 0;
    this.ring = new Array(64);
    this.ringT = new Array(64);
    this.head = 0;
    this.filled = 0;
  }
  Meter.prototype.add = function (v) {
    this.count++;
    this.total += v;
    this.last = v;
    if (v > this.max) this.max = v;
    this.ring[this.head] = v;
    this.ringT[this.head] = now();
    this.head = (this.head + 1) % 64;
    if (this.filled < 64) this.filled++;
  };
  Meter.prototype.window = function (w) {
    var cutoff = now() - (w || 1000);
    var sum = 0;
    var n = 0;
    for (var i = 0; i < this.filled; i++) {
      if (this.ringT[i] >= cutoff) {
        sum += this.ring[i];
        n++;
      }
    }
    return { ms: sum, count: n };
  };
  Meter.prototype.avg = function () {
    return this.count ? this.total / this.count : 0;
  };

  /** Rate counter for events with no duration. */
  function Counter() {
    this.count = 0;
    this.times = new Array(128);
    this.head = 0;
    this.filled = 0;
  }
  Counter.prototype.hit = function (n) {
    this.count += n || 1;
    this.times[this.head] = now();
    this.head = (this.head + 1) % 128;
    if (this.filled < 128) this.filled++;
  };
  Counter.prototype.rate = function (w) {
    var win = w || 1000;
    var cutoff = now() - win;
    var n = 0;
    for (var i = 0; i < this.filled; i++) if (this.times[i] >= cutoff) n++;
    return (n * 1000) / win;
  };

  function fmtMs(v) {
    if (v == null || isNaN(v)) return '--';
    if (v >= 1000) return (v / 1000).toFixed(2) + 's';
    if (v >= 100) return v.toFixed(0) + 'ms';
    if (v >= 10) return v.toFixed(1) + 'ms';
    return v.toFixed(2) + 'ms';
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function trunc(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  }

  // ===================================================================
  // 3. ATTRIBUTION — which module and function caused this work?
  //
  // Two independent signals, because the build may be minified:
  //   a) stack frame URL -> module file (dev / source-mapped builds)
  //   b) function .name  -> FUNCTION_REGISTRY (survives most builds, and
  //      yields the function's ROLE, not just an identifier)
  // Resolved once per unique function object and memoised in a WeakMap, so the
  // stack capture never repeats on a hot path.
  // ===================================================================

  var OWN_URL = (function () {
    try {
      throw new Error('probe');
    } catch (e) {
      var m = /((?:https?|file|blob|webpack)[^\s)]+?):\d+:\d+/.exec(e.stack || '');
      return m ? m[1] : '';
    }
  })();

  var BUNDLE_RE = /ytaf|userScript|webpack-internal|perf_mon/i;

  // When the bundle is injected with eval() or an inline <script>, frames carry
  // no file URL at all — Chrome labels them VM<n>. Capture our own tag at boot
  // so we can still recognise our own code. Without this every stack test
  // fails, no listener gets wrapped, and every feature looks dead.
  var OWN_TAG = (function () {
    try {
      throw new Error('probe');
    } catch (e) {
      var m = /(VM\d+|<anonymous>|eval)/.exec(e.stack || '');
      return m ? m[1] : '';
    }
  })();
  var EVAL_HOSTED = !OWN_URL && !!OWN_TAG;

  // Last-resort attribution for anonymous callbacks. Nearly every observer,
  // timer and listener in this codebase is an arrow function passed inline, so
  // it has no .name, and an eval-hosted bundle gives no URL either. Matching a
  // distinctive token from the function's own source text is the only signal
  // left. Cost is one toString() per unique function, memoised in originCache.
  var SOURCE_SIGNATURES = [
    [/generationId|qualityCache|testAndLoadImage|urlCache/, 'thumbnail-quality.js'],
    [/shortsKeepAliveTimer|shortsBufferTimer|isPlayerHidden|playerCtrlObs/, 'screensaver-fix.js'],
    [/previewbar|skipSegment|sponsorTimes|segmentsFor|barTypes/, 'sponsorblock.js'],
    [/ryd-dislike-factoid|returnyoutubedislike|dislikeCount/, 'return-dislike.js'],
    [/hookedParse|SCHEMA_REGISTRY|walkAndProcess|adPlacements|trackingParams/, 'adblock.js'],
    [/twemoji|EMOJI_RE|processTextNode/, 'emoji-font.js'],
    [/setPlaybackQualityRange|yt-player-quality/, 'video-quality.js'],
    [/ytaf-hide-logo|ytaf-fix-titles|oled-theme-active|ytaf-remove-borders|configWrite/, 'ui.js'],
    [/webOs-watch/, 'watch.js'],
    [/whosWatching|identityBypass|attemptActiveBypass/, 'auto-login.js'],
    [/WEB_PAGE_TYPE_|ytaf-page-update/, 'utils.js'],
    [/navigate|spatialNavigation|focusableAreas/, 'spatial-navigation-polyfill.js']
  ];

  function moduleFromSource(fn) {
    var src;
    try {
      src = Function.prototype.toString.call(fn);
    } catch (e) {
      return null;
    }
    if (!src || src.length > 20000) return null;
    for (var i = 0; i < SOURCE_SIGNATURES.length; i++) {
      if (SOURCE_SIGNATURES[i][0].test(src)) return SOURCE_SIGNATURES[i][1];
    }
    return null;
  }

  // performance.now() is coarsened on this platform. Measure the real grain so
  // the report can say whether a 0.00ms reading means "free" or "below the
  // clock's resolution" — those are very different answers.
  var CLOCK_RES_MS = (function () {
    try {
      var t0 = performance.now();
      var t1 = t0;
      var spins = 0;
      while (t1 === t0 && spins < 2000000) {
        t1 = performance.now();
        spins++;
      }
      return t1 - t0;
    } catch (e) {
      return 0;
    }
  })();

  var MODULE_FILES = [
    'adblock.js',
    'sponsorblock.js',
    'Sponsorblock-UI.js',
    'return-dislike.js',
    'thumbnail-quality.js',
    'video-quality.js',
    'screensaver-fix.js',
    'emoji-font.js',
    'auto-login.js',
    'notifications.js',
    'watch.js',
    'yt-fixes.js',
    'lang-settings-fix',
    'block-webos-cast',
    'spatial-navigation-polyfill.js',
    'spatial-navigation.modern.js',
    'domrect-polyfill.js',
    'ui.js',
    'utils.js',
    'config.js',
    'webos-utils.js',
    'polyfills.js',
    'userScript.js',
    'fetch.ts',
    'json-stringify.ts',
    'perf_mon.js'
  ];

  /**
   * Every function in the mod with the role it plays. This is what lets the
   * cluster explain what is running rather than merely that something is.
   * Shape: name -> [module, role, costClass]
   * costClass: free | light | medium | heavy | hot
   *   hot = runs per frame or per network response.
   */
  var FUNCTION_REGISTRY = {
    // ---- adblock.js : JSON.parse interception + response filtering -------
    hookedParse: ['adblock.js', 'Entry point: filters every JSON response', 'hot'],
    detectResponseType: ['adblock.js', 'Classifies a response against the schema registry', 'hot'],
    applySchemaFilters: ['adblock.js', 'Targeted path-based strip (fast path)', 'medium'],
    applyFallbackFilters: ['adblock.js', 'Blind deep search when the schema misses', 'heavy'],
    processSectionListOptimized: ['adblock.js', 'Walks shelves, drops Shorts/live/ads', 'medium'],
    filterItemsOptimized: ['adblock.js', 'Per-tile ad and guest-prompt filter', 'medium'],
    processActions: ['adblock.js', 'Filters onResponseReceivedActions payloads', 'light'],
    getShelfTitleOptimized: ['adblock.js', 'Reads a shelf title for name matching', 'light'],
    isReelAd: ['adblock.js', 'Detects REEL_VIDEO_TYPE_AD entries', 'free'],
    hasAdRenderer: ['adblock.js', 'Detects ad renderer keys on a tile', 'free'],
    hasGuestPromptRenderer: ['adblock.js', 'Detects guest sign-in prompt tiles', 'free'],
    removeEndcardsOptimized: ['adblock.js', 'Clears endcard arrays on PLAYER responses', 'light'],
    removePlayerAdsOptimized: ['adblock.js', 'Strips playerAds and adPlacements', 'light'],
    findObjects: ['adblock.js', 'Recursive needle search (fallback path only)', 'heavy'],
    walkAndProcess: ['adblock.js', 'Deep walk: trackingParams strip + emoji wrap', 'heavy'],
    findAndProcessText: ['adblock.js', 'Entry to the emoji text walk', 'medium'],
    processTextFieldsInPlace: ['adblock.js', 'Rewrites text runs for the emoji font', 'medium'],
    splitIntoRuns: ['adblock.js', 'Splits a string into emoji and text runs', 'medium'],
    processEmojiString: ['adblock.js', 'Strips zero-width joiners from a string', 'light'],
    recomputeFilterFlags: ['adblock.js', 'Rebuilds cached config flags on change', 'free'],
    getByPath: ['adblock.js', 'Safe nested property read', 'free'],
    clearArrayIfExists: ['adblock.js', 'Empties an array at a path', 'free'],
    telemetryFetchHandler: ['adblock.js', 'Cancels telemetry fetches', 'free'],
    initTrackingBlock: ['adblock.js', 'Installs the XHR and fetch telemetry blocks', 'free'],
    destroyTrackingBlock: ['adblock.js', 'Restores the XHR and fetch originals', 'free'],
    initAdblock: ['adblock.js', 'Installs the JSON.parse hook', 'free'],
    destroyAdblock: ['adblock.js', 'Restores native JSON.parse', 'free'],
    logSchemaMiss: ['adblock.js', 'Debug: logs unmatched response shapes', 'light'],

    // ---- thumbnail-quality.js -------------------------------------------
    enableObserver: ['thumbnail-quality.js', 'Attaches the DOM observer to <ytlr-app>', 'free'],
    processUpgrade: ['thumbnail-quality.js', 'Probes candidates and applies a better thumbnail', 'heavy'],
    processRequestQueue: ['thumbnail-quality.js', 'Drains the upgrade queue (3 jobs max)', 'light'],
    testAndLoadImage: ['thumbnail-quality.js', 'HEAD probe for one candidate quality', 'medium'],
    getThumbnailUrl: ['thumbnail-quality.js', 'Rewrites a URL to the target quality', 'free'],
    parseCSSUrl: ['thumbnail-quality.js', 'Extracts the URL from background-image', 'light'],
    eachThumb: ['thumbnail-quality.js', 'Visits a node plus nested thumbnails', 'medium'],
    track: ['thumbnail-quality.js', 'Starts observing one thumbnail element', 'light'],
    untrack: ['thumbnail-quality.js', 'Releases a removed thumbnail element', 'free'],
    enqueue: ['thumbnail-quality.js', 'Queues an upgrade job for an element', 'free'],
    detectWebP: ['thumbnail-quality.js', 'One-time WebP support probe', 'free'],
    ensureWebpDetection: ['thumbnail-quality.js', 'Memoised WebP probe gate', 'free'],
    capSet: ['thumbnail-quality.js', 'FIFO-capped Map insert', 'free'],
    handleVisibilityChange: ['thumbnail-quality.js', 'Resumes the queue when visible', 'free'],
    handlePageUpdate: ['thumbnail-quality.js', 'Clears the queue on the account selector', 'free'],
    _check: ['thumbnail-quality.js', 'IntersectionObserver polyfill scan (webOS 3)', 'heavy'],

    // ---- sponsorblock.js -------------------------------------------------
    init: ['sponsorblock.js', 'Fetches segments and wires up the handler', 'medium'],
    start: ['sponsorblock.js', 'Binds the video element and player UI observers', 'medium'],
    fetchSegments: ['sponsorblock.js', 'Network: hashed segment lookup', 'medium'],
    handleTimeUpdate: ['sponsorblock.js', 'Per-tick skip decision engine', 'hot'],
    highFreqLoop: ['sponsorblock.js', 'rAF loop for precise skip boundaries', 'hot'],
    startHighFreqLoop: ['sponsorblock.js', 'Arms the per-frame skip loop', 'free'],
    stopHighFreqLoop: ['sponsorblock.js', 'Disarms the per-frame skip loop', 'free'],
    buildSkipChain: ['sponsorblock.js', 'Merges adjacent segments into one skip', 'light'],
    executeChainSkip: ['sponsorblock.js', 'Performs the currentTime jump', 'light'],
    rebuildSkipSegments: ['sponsorblock.js', 'Recomputes active segments from config', 'light'],
    findSegmentAtTime: ['sponsorblock.js', 'Segment lookup at the playhead', 'hot'],
    findNextSegmentIndex: ['sponsorblock.js', 'Finds the upcoming segment index', 'hot'],
    processSegments: ['sponsorblock.js', 'Normalises API segments against duration', 'light'],
    drawOverlay: ['sponsorblock.js', 'Paints segment bars over the scrubber', 'medium'],
    checkForProgressBar: ['sponsorblock.js', 'Locates the YouTube progress bar', 'medium'],
    observePlayerUI: ['sponsorblock.js', 'Watches player chrome for re-renders', 'heavy'],
    _syncOverlayPosition: ['sponsorblock.js', 'Aligns the overlay to the progress bar', 'medium'],
    _getProgressBarAnchor: ['sponsorblock.js', 'Resolves the anchor element', 'light'],
    _offsetRelativeTo: ['sponsorblock.js', 'Layout read: relative offset maths', 'medium'],
    _rebindVideo: ['sponsorblock.js', 'Re-attaches after a player swap', 'light'],
    _ensureObserverAlive: ['sponsorblock.js', 'Self-heal for dropped observers', 'light'],
    _scheduleBarRetry: ['sponsorblock.js', 'Interval retry for a missing bar', 'medium'],
    _armSkipWatchdog: ['sponsorblock.js', 'Timeout guard for a pending skip', 'free'],
    _clearSkipWatchdog: ['sponsorblock.js', 'Clears the skip guard', 'free'],
    toggleTimeListener: ['sponsorblock.js', 'Attaches or detaches timeupdate', 'free'],
    resetSegmentTracking: ['sponsorblock.js', 'Clears per-video skip state', 'free'],
    jumpToNextHighlight: ['sponsorblock.js', 'Blue-key jump to poi_highlight', 'light'],
    skipToPreviousSegment: ['sponsorblock.js', 'Rewinds to the last segment start', 'light'],
    handleBlueButton: ['sponsorblock.js', 'Manual skip / highlight shortcut', 'light'],
    clearManualNotification: ['sponsorblock.js', 'Dismisses the manual-skip toast', 'free'],
    setupConfigListeners: ['sponsorblock.js', 'Re-arms on a category mode change', 'free'],
    requestAF: ['sponsorblock.js', 'Coalesces overlay work into one frame', 'free'],

    // ---- Sponsorblock-UI.js ---------------------------------------------
    createPopup: ['Sponsorblock-UI.js', 'Builds the segment list popup', 'medium'],
    updateSegments: ['Sponsorblock-UI.js', 'Rebuilds popup rows from segments', 'medium'],
    togglePopup: ['Sponsorblock-UI.js', 'Shows or hides the segment popup', 'light'],
    getSegmentColor: ['Sponsorblock-UI.js', 'Maps a category to its configured colour', 'free'],
    formatTime: ['Sponsorblock-UI.js', 'Seconds to mm:ss', 'free'],

    // ---- return-dislike.js ----------------------------------------------
    fetchVideoData: ['return-dislike.js', 'Network: Return YouTube Dislike votes lookup', 'medium'],
    observeBodyForPanel: ['return-dislike.js', 'Polls and observes for the info panel', 'heavy'],
    setupPanel: ['return-dislike.js', 'Binds to the engagement panel', 'medium'],
    attachContentObserver: ['return-dislike.js', 'Watches panel content re-renders', 'medium'],
    setupIntersectionObserver: ['return-dislike.js', 'Tracks panel visibility', 'light'],
    checkAndInjectDislike: ['return-dislike.js', 'Injects the dislike factoid node', 'medium'],
    handlePanelMutation: ['return-dislike.js', 'Reacts to panel DOM changes', 'medium'],
    refreshMenuCache: ['return-dislike.js', 'Re-reads focusable menu items', 'medium'],
    handleFocusIn: ['return-dislike.js', 'Remote focus enters the panel', 'light'],
    handleFocusOut: ['return-dislike.js', 'Remote focus leaves the panel', 'light'],
    updateVisualState: ['return-dislike.js', 'Repaints the focus highlight', 'medium'],
    setFocusByIndex: ['return-dislike.js', 'Moves focus to an index', 'light'],
    clearAllHighlights: ['return-dislike.js', 'Removes all focus highlights', 'light'],
    triggerEnter: ['return-dislike.js', 'Synthesises Enter on an element', 'light'],
    injectPersistentStyles: ['return-dislike.js', 'One-time style injection', 'free'],
    formatNumber: ['return-dislike.js', 'Compact number formatting', 'free'],
    stopBodyPoll: ['return-dislike.js', 'Stops the panel discovery poll', 'free'],
    resetPanelState: ['return-dislike.js', 'Clears cached panel references', 'free'],

    // ---- video-quality.js ------------------------------------------------
    initVideoQuality: ['video-quality.js', 'Polls for the player and attaches hooks', 'medium'],
    handleStateChange: ['video-quality.js', 'Reacts to player state transitions', 'light'],
    interceptAndUpgradeQuality: ['video-quality.js', 'Forces max quality on a video', 'medium'],
    setQualityOnPlayer: ['video-quality.js', 'Calls setPlaybackQualityRange', 'light'],
    setLocalStorageQuality: ['video-quality.js', 'Writes the yt-player-quality key', 'light'],
    isQualityAlreadyMax: ['video-quality.js', 'Skips work when already maxed', 'free'],
    ensurePlaybackStarts: ['video-quality.js', 'webOS 25 first-play kickstart', 'medium'],
    startStatePolling: ['video-quality.js', 'Fallback 500ms player state poll', 'heavy'],
    stopStatePolling: ['video-quality.js', 'Stops the fallback poll', 'free'],
    notifyIfUpgraded: ['video-quality.js', 'Toast when the quality changed', 'free'],
    destroyVideoQuality: ['video-quality.js', 'Detaches player listeners', 'free'],
    isForceEnabled: ['video-quality.js', 'Gate: forcing on and not an inline preview', 'free'],

    // ---- screensaver-fix.js ----------------------------------------------
    updateState: ['screensaver-fix.js', 'Page router: watch vs shorts vs other', 'light'],
    setShortsKeepAlive: ['screensaver-fix.js', '30s synthetic YELLOW keep-alive', 'light'],
    isPlayerHidden: ['screensaver-fix.js', 'Detects an off-screen video element', 'free'],

    // ---- emoji-font.js ---------------------------------------------------
    manageObserverState: ['emoji-font.js', 'Arms or disarms the text observer', 'free'],
    scanElement: ['emoji-font.js', 'Full subtree text scan', 'heavy'],
    processQueue: ['emoji-font.js', 'Drains queued text nodes inside a frame', 'heavy'],
    processTextNode: ['emoji-font.js', 'Wraps emoji runs in styled spans', 'medium'],
    queueTextNode: ['emoji-font.js', 'Queues a node for processing', 'free'],

    // ---- ui.js -----------------------------------------------------------
    eventHandler: ['ui.js', 'Global keydown router for shortcuts', 'hot'],
    handleShortcutAction: ['ui.js', 'Dispatches the mapped shortcut action', 'light'],
    createOptionsPanel: ['ui.js', 'Builds the settings panel (lazy, one-off)', 'heavy'],
    showOptionsPanel: ['ui.js', 'Shows or hides settings and moves focus', 'medium'],
    initGlobalStyles: ['ui.js', 'One-time global stylesheet injection', 'free'],
    applyOledMode: ['ui.js', 'Toggles the OLED classes on <html>', 'light'],
    applyTheme: ['ui.js', 'Applies the UI theme classes', 'light'],
    updateLogoState: ['ui.js', 'Swaps the logo variant for the theme', 'light'],
    syncOledShelfOpacity: ['ui.js', 'Updates the shelf opacity property', 'free'],
    skipChapter: ['ui.js', 'Chapter navigation shortcut', 'medium'],
    performBurstSeek: ['ui.js', 'Accumulated seek with debounce', 'light'],
    toggleSubtitlesLogic: ['ui.js', 'Subtitle toggle via the player menu', 'medium'],
    toggleCommentsLogic: ['ui.js', 'Opens or closes the comments panel', 'medium'],
    toggleDescriptionLogic: ['ui.js', 'Opens or closes the description panel', 'medium'],
    saveToPlaylistLogic: ['ui.js', 'Triggers Save / Watch Later', 'medium'],
    refreshPageLogic: ['ui.js', 'Soft reloads the app', 'light'],
    playPauseLogic: ['ui.js', 'Play/pause with control hiding', 'light'],
    resolveCached: ['ui.js', 'Cached multi-selector element lookup', 'medium'],
    updateShortcutCache: ['ui.js', 'Re-reads one shortcut binding', 'free'],
    triggerInternal: ['ui.js', 'Fires an internal YouTube UI action', 'light'],
    createConfigCheckbox: ['ui.js', 'Settings row: boolean', 'light'],
    createCycleControl: ['ui.js', 'Settings row: cycling enum', 'light'],
    createSegmentControl: ['ui.js', 'Settings row: SponsorBlock category', 'light'],
    createShortcutControl: ['ui.js', 'Settings row: key binding', 'light'],
    createOpacityControl: ['ui.js', 'Settings row: opacity', 'light'],

    // ---- utils.js / config.js -------------------------------------------
    updatePageState: ['utils.js', 'Detects page type, fires ytaf-page-update', 'light'],
    waitForChildAdd: ['utils.js', 'Promise over a scoped MutationObserver', 'medium'],
    getVideo: ['utils.js', 'Cached <video> lookup', 'free'],
    sendKey: ['utils.js', 'Synthesises a remote key event', 'light'],
    isGuestMode: ['utils.js', 'Cached guest identity check', 'free'],
    handleLaunch: ['utils.js', 'Builds the YouTube TV URL from launch params', 'free'],
    debounce: ['utils.js', 'Generic debounce factory', 'free'],
    configRead: ['config.js', 'Reads one config key', 'free'],
    configWrite: ['config.js', 'Writes a key and notifies listeners', 'light'],
    writeNow: ['config.js', 'Flushes the config to localStorage', 'light'],
    scheduleWrite: ['config.js', 'Debounces the localStorage write', 'free'],

    // ---- auto-login / watch / notifications / yt-fixes ------------------
    attemptActiveBypass: ['auto-login.js', 'Skips the "who is watching" screen', 'medium'],
    disableWhosWatching: ['auto-login.js', 'Writes the identity bypass flags', 'light'],
    setInlinePlayback: ['auto-login.js', 'Forces preview autoplay on or off', 'light'],
    initPreviews: ['auto-login.js', 'Applies the preview preference', 'free'],
    injectBypassCSS: ['auto-login.js', 'Hides the selector while bypassing', 'free'],
    finalizeBypass: ['auto-login.js', 'Cleans up after a successful bypass', 'free'],
    startClock: ['watch.js', 'Per-minute clock tick', 'light'],
    updateVisibility: ['watch.js', 'Shows the clock only where allowed', 'light'],
    showNotification: ['notifications.js', 'Queues an on-screen toast', 'light'],
    ensureContainer: ['notifications.js', 'Creates the toast container', 'free'],
    initYouTubeFixes: ['yt-fixes.js', 'Enables the search history patch', 'free'],
    attemptSearchHistoryFix: ['yt-fixes.js', 'Repopulates search history rows', 'medium'],
    populateSearchHistory: ['yt-fixes.js', 'Writes history entries into the DOM', 'medium'],

    // ---- hooks -----------------------------------------------------------
    stringify: ['json-stringify.ts', 'Injects isInlinePlaybackNoAd into requests', 'hot'],
    resolveCommand: ['app_api/index.ts', 'Intercepts YouTube internal commands', 'hot']
  };

  var registryIndex = {};
  (function buildIndex() {
    for (var k in FUNCTION_REGISTRY) {
      if (!Object.prototype.hasOwnProperty.call(FUNCTION_REGISTRY, k)) continue;
      var v = FUNCTION_REGISTRY[k];
      registryIndex[k] = { module: v[0], role: v[1], cost: v[2] };
    }
  })();

  function captureStack() {
    var prev = Error.stackTraceLimit;
    try {
      Error.stackTraceLimit = 12;
      return new Error().stack || '';
    } catch (err) {
      return '';
    } finally {
      Error.stackTraceLimit = prev;
    }
  }

  function moduleFromStack(stack) {
    if (!stack) return null;
    var lines = stack.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('perf_mon') !== -1) continue;
      for (var j = 0; j < MODULE_FILES.length; j++) {
        if (line.indexOf(MODULE_FILES[j]) !== -1) return MODULE_FILES[j];
      }
    }
    return null;
  }

  function isOurCode(stack) {
    if (!stack) return false;
    if (OWN_URL && stack.indexOf(OWN_URL) !== -1) return true;
    if (OWN_TAG && stack.indexOf(OWN_TAG) !== -1) return true;
    return BUNDLE_RE.test(stack);
  }

  var originCache = new WeakMap();

  /** Resolve and memoise {module, fn, role, cost, ours} for a callback. */
  function originOf(fn, hint) {
    if (typeof fn !== 'function') return unknownOrigin(hint);
    var cached = originCache.get(fn);
    if (cached) return cached;

    var name = fn.name || '';
    var stack = captureStack();

    // Registrations made by the monitor itself must never be charged to the
    // mod, or we would be measuring our own reflection.
    var frames = stack.split('\n');
    var callerFrame = (frames[2] || '') + (frames[3] || '');
    if (callerFrame.indexOf('perf_mon') !== -1) {
      var self = {
        module: 'perf_mon.js',
        fn: name || 'monitor',
        role: 'Monitor internals',
        cost: 'free',
        ours: false,
        key: 'perf_mon.js:' + (name || 'monitor')
      };
      originCache.set(fn, self);
      return self;
    }

    var mod = moduleFromStack(stack);
    if (!mod) mod = moduleFromSource(fn);
    var reg = name && registryIndex[name] ? registryIndex[name] : null;

    if (!mod && reg) mod = reg.module;
    if (!mod && hint && hint.module) mod = hint.module;

    var ours = !!mod || isOurCode(stack);
    var o = {
      module: mod || (ours ? 'ytaf (minified)' : 'youtube'),
      fn: name || (hint && hint.fn) || 'anonymous',
      role: reg ? reg.role : (hint && hint.role) || null,
      cost: reg ? reg.cost : null,
      ours: ours,
      key: (mod || (ours ? 'ytaf' : 'yt')) + ':' + (name || (hint && hint.fn) || 'anon')
    };
    originCache.set(fn, o);
    return o;
  }

  function unknownOrigin(hint) {
    var mod = (hint && hint.module) || 'unknown';
    var fn = (hint && hint.fn) || 'anonymous';
    return {
      module: mod,
      fn: fn,
      role: (hint && hint.role) || null,
      cost: null,
      ours: !!(hint && hint.module),
      key: mod + ':' + fn
    };
  }

  // ===================================================================
  // 4. CALL LEDGER + ASYNC ATTRIBUTION CONTEXT
  //    Work started inside a wrapped callback inherits that callback's
  //    attribution, so a timer scheduled by processUpgrade is still charged
  //    to thumbnail-quality.js when it eventually fires.
  // ===================================================================

  var ledger = {};
  var moduleMeters = {};
  var contextStack = [];

  function ledgerFor(origin) {
    var e = ledger[origin.key];
    if (!e) {
      e = ledger[origin.key] = {
        origin: origin,
        meter: new Meter(origin.key),
        firstSeen: now(),
        lastSeen: 0
      };
    }
    return e;
  }

  function moduleMeter(mod) {
    var m = moduleMeters[mod];
    if (!m) m = moduleMeters[mod] = new Meter(mod);
    return m;
  }

  function currentContext() {
    return contextStack.length ? contextStack[contextStack.length - 1] : null;
  }

  /** Run fn under an attribution context and charge its inclusive wall time. */
  function charge(origin, fn, thisArg, args) {
    var t0 = now();
    contextStack.push(origin);
    try {
      return fn.apply(thisArg, args);
    } finally {
      var d = now() - t0;
      contextStack.pop();
      safe(function () {
        var e = ledgerFor(origin);
        e.meter.add(d);
        e.lastSeen = now();
        if (origin.ours) moduleMeter(origin.module).add(d);
      }, 'charge');
    }
  }

  function topFunctions(limit, windowMs) {
    var out = [];
    for (var k in ledger) {
      if (!Object.prototype.hasOwnProperty.call(ledger, k)) continue;
      var e = ledger[k];
      if (!e.origin.ours) continue;
      var w = e.meter.window(windowMs || 2000);
      out.push({
        key: k,
        module: e.origin.module,
        fn: e.origin.fn,
        role: e.origin.role,
        calls: e.meter.count,
        totalMs: e.meter.total,
        maxMs: e.meter.max,
        recentMs: w.ms,
        recentCalls: w.count,
        lastSeen: e.lastSeen
      });
    }
    out.sort(function (a, b) {
      return b.recentMs - a.recentMs || b.totalMs - a.totalMs;
    });
    return out.slice(0, limit || 8);
  }

  // ===================================================================
  // 5. STATS
  // ===================================================================

  var STATS = {
    fps: 0,
    frameMs: 0,
    frames: 0,
    domNodes: 0,
    heapMB: 0,
    heapSamples: [],

    longTasks: [],
    longTaskMeter: new Meter('longtask'),

    json: {
      parseCount: 0,
      parseBytes: 0,
      nativeMeter: new Meter('json.parse.native'),
      totalMeter: new Meter('json.parse.total'),
      hookMeter: new Meter('json.parse.hook'),
      byType: {},
      stringifyNative: new Meter('json.stringify.native'),
      stringifyTotal: new Meter('json.stringify.total'),
      stringifyHook: new Meter('json.stringify.hook'),
      stringifyPatched: 0
    },

    net: {
      fetch: new Counter(),
      xhr: new Counter(),
      inFlight: 0,
      blocked: new Counter(),
      beacons: new Counter(),
      seenTelemetry: new Counter(),
      byChannel: {},
      slow: []
    },

    observers: [], // {id, kind, origin, targets, options, mutations, meter}
    timers: { active: {}, created: new Counter(), fired: new Meter('timer') },
    raf: { meter: new Meter('raf'), counter: new Counter(), loops: {} },
    dom: {
      querySelector: new Counter(),
      querySelectorAll: new Counter(),
      qsaMeter: new Meter('qsa'),
      getElementById: new Counter()
    },
    layout: { rect: new Counter(), computedStyle: new Counter() },
    events: { dispatched: new Counter(), meter: new Meter('event') },

    selfMeter: new Meter('perf_mon self'),
    /** Scheduler drift, in ms. Replaces fps where rAF is not vsync-locked. */
    lagMs: 0,
    domNodesLight: 0,
    domNodesShadow: 0,
    shadowRoots: 0,
    /** Synthetic (untrusted) YELLOW presses — screensaver-fix's keep-alive. */
    syntheticYellow: 0,

    page: 'boot',
    pageSince: now(),
    navCount: 0
  };

  function channel(name) {
    var c = STATS.net.byChannel[name];
    if (!c) {
      c = STATS.net.byChannel[name] = {
        count: 0,
        bytes: 0,
        meter: new Meter(name),
        counter: new Counter(),
        errors: 0,
        lastUrl: ''
      };
    }
    return c;
  }

  // ===================================================================
  // 6. PAGE STATE
  //    utils.js already computes this and fires ytaf-page-update, but we
  //    must not depend on the mod's own eventing to observe the mod — so
  //    we derive it independently and use the event only as a trigger.
  // ===================================================================

  var PAGES = {
    watch: 'WATCH',
    shorts: 'SHORTS',
    search: 'SEARCH',
    account: 'ACCOUNT',
    home: 'HOME'
  };

  function detectPage() {
    var cl = document.body ? document.body.className || '' : '';
    if (cl.indexOf('WEB_PAGE_TYPE_WATCH') !== -1) return 'watch';
    if (cl.indexOf('WEB_PAGE_TYPE_SHORTS') !== -1) return 'shorts';
    if (cl.indexOf('WEB_PAGE_TYPE_SEARCH') !== -1) return 'search';
    if (cl.indexOf('WEB_PAGE_TYPE_ACCOUNT_SELECTOR') !== -1) return 'account';
    var h = location.hash || '';
    if (h.indexOf('/watch') !== -1) return 'watch';
    if (h.indexOf('/shorts') !== -1) return 'shorts';
    if (h.indexOf('/search') !== -1) return 'search';
    return 'home';
  }

  var pageListeners = [];
  function onPageChange(fn) {
    pageListeners.push(fn);
  }

  function checkPage() {
    var p = detectPage();
    if (p === STATS.page) return;
    var prev = STATS.page;
    STATS.page = p;
    STATS.pageSince = now();
    STATS.navCount++;
    for (var i = 0; i < pageListeners.length; i++) {
      safe(
        (function (f) {
          return function () {
            f(p, prev);
          };
        })(pageListeners[i]),
        'pageListener'
      );
    }
  }

  // ===================================================================
  // 7. PROBE: JSON — the sandwich
  //
  //   native  <- inner probe (installed first, at import time)
  //             adblock.hookedParse
  //             ...any other hook...
  //           <- outer probe (installed after the bundle evaluates)
  //
  //   hook cost = outer total - inner native time
  // ===================================================================

  var jsonInnerAccum = 0;
  var jsonOuterDepth = 0;
  var nativeParse = JSON.parse;
  // A rolling sample of real response bodies, kept so calibrate() can benchmark
  // against payloads this TV actually receives rather than a synthetic string.
  var lastPayloads = [];
  function keepSample(text) {
    if (typeof text !== 'string' || text.length < 2000) return;
    for (var i = 0; i < lastPayloads.length; i++) {
      if (Math.abs(lastPayloads[i].length - text.length) < 512) return;
    }
    lastPayloads.push(text);
    if (lastPayloads.length > 5) lastPayloads.shift();
  }
  var nativeStringify = JSON.stringify;
  var innerParseRef = null;
  var outerParseRef = null;
  var parseChainHooked = false;
  // Synthetic origins for the mod's own JSON hooks. The outer-minus-inner
  // delta IS the hook's self time, so charging it here puts adblock's real
  // cost into the module ledger and onto the load gauge — otherwise the
  // single most expensive thing the mod does would never move the needle.
  var parseHookOrigin = null;
  var stringifyHookOrigin = null;

  function synthOrigin(fnName, fallbackModule) {
    var reg = registryIndex[fnName];
    var mod = reg ? reg.module : fallbackModule;
    return {
      module: mod,
      fn: fnName,
      role: reg ? reg.role : null,
      cost: reg ? reg.cost : 'hot',
      ours: true,
      key: mod + ':' + fnName
    };
  }

  function chargeHook(origin, msSpent) {
    if (!origin || !(msSpent > 0)) return;
    var e = ledgerFor(origin);
    e.meter.add(msSpent);
    e.lastSeen = now();
    moduleMeter(origin.module).add(msSpent);
  }

  function classifyResponse(text) {
    // indexOf against the raw string: no allocation, no reparse.
    if (text.indexOf('"streamingData"') !== -1) return 'PLAYER';
    if (text.indexOf('singleColumnWatchNextResults') !== -1) return 'NEXT';
    if (text.indexOf('tvSecondaryNavRenderer') !== -1) return 'BROWSE_TABS';
    if (text.indexOf('tvSurfaceContentRenderer') !== -1) return 'HOME_BROWSE';
    if (text.indexOf('continuationContents') !== -1) return 'CONTINUATION';
    if (text.indexOf('reelWatchEndpoint') !== -1) return 'SHORTS_SEQUENCE';
    if (text.indexOf('sectionListRenderer') !== -1) return 'SEARCH';
    if (text.indexOf('onResponseReceived') !== -1) return 'ACTION';
    if (text.indexOf('responseContext') !== -1) return 'OTHER_API';
    return 'NON_API';
  }

  function typeBucket(t) {
    var b = STATS.json.byType[t];
    if (!b) {
      b = STATS.json.byType[t] = {
        count: 0,
        bytes: 0,
        native: new Meter(t + '.native'),
        hook: new Meter(t + '.hook'),
        lastAt: 0
      };
    }
    return b;
  }

  function installInnerJsonProbe() {
    if (!OPTIONS.probeJson) return;

    var innerParse = function (text, reviver) {
      var t0 = now();
      try {
        return nativeParse.call(this, text, reviver);
      } finally {
        var d = now() - t0;
        jsonInnerAccum += d;
        STATS.json.nativeMeter.add(d);
      }
    };
    innerParse.__perfInner = true;
    innerParseRef = innerParse;
    JSON.parse = innerParse;

    JSON.stringify = function (value, replacer, space) {
      var t0 = now();
      try {
        return nativeStringify.call(this, value, replacer, space);
      } finally {
        STATS.json.stringifyNative.add(now() - t0);
      }
    };
  }

  function installOuterJsonProbe() {
    if (!OPTIONS.probeJson) return;

    var midParse = JSON.parse;
    var midStringify = JSON.stringify;

    // If nothing hooked in between, the sandwich has no filling: the mod is
    // not intercepting responses at all, which is itself worth knowing.
    parseChainHooked = midParse !== innerParseRef;
    parseHookOrigin = parseChainHooked
      ? synthOrigin(
          midParse.name && registryIndex[midParse.name] ? midParse.name : 'hookedParse',
          'adblock.js'
        )
      : null;
    stringifyHookOrigin =
      midStringify !== nativeStringify ? synthOrigin('stringify', 'json-stringify.ts') : null;

    var outerParse = function (text, reviver) {
      var isRoot = jsonOuterDepth === 0;
      jsonOuterDepth++;
      var innerBefore = jsonInnerAccum;
      var t0 = now();
      try {
        return midParse.call(this, text, reviver);
      } finally {
        var total = now() - t0;
        jsonOuterDepth--;
        if (isRoot) {
          var nativeMs = jsonInnerAccum - innerBefore;
          var hookMs = total - nativeMs;
          if (hookMs < 0) hookMs = 0;
          safe(function () {
            var len = typeof text === 'string' ? text.length : 0;
            STATS.json.parseCount++;
            STATS.json.parseBytes += len;
            keepSample(text);
            STATS.json.totalMeter.add(total);
            STATS.json.hookMeter.add(hookMs);
            chargeHook(parseHookOrigin, hookMs);
            // Only classify responses big enough for the mod to care about,
            // and only when the hook actually did measurable work — string
            // scanning every tiny parse would cost more than it reveals.
            if (len > 500 && (hookMs > 0.12 || total > 3)) {
              var t = classifyResponse(text);
              var b = typeBucket(t);
              b.count++;
              b.bytes += len;
              b.native.add(nativeMs);
              b.hook.add(hookMs);
              b.lastAt = now();
            }
          }, 'json.parse.outer');
        }
      }
    };

    JSON.parse = outerParse;
    outerParseRef = outerParse;

    JSON.stringify = function (value, replacer, space) {
      var t0 = now();
      var beforeNative = STATS.json.stringifyNative.total;
      try {
        return midStringify.call(this, value, replacer, space);
      } finally {
        var total = now() - t0;
        safe(function () {
          var nativeMs = STATS.json.stringifyNative.total - beforeNative;
          STATS.json.stringifyTotal.add(total);
          var hookMs = total - nativeMs;
          STATS.json.stringifyHook.add(hookMs > 0 ? hookMs : 0);
          chargeHook(stringifyHookOrigin, hookMs);
          // json-stringify.ts deep-clones only when it finds a playback
          // context to flag. Two native passes in one call means it cloned.
          if (nativeMs > 0 && total > nativeMs * 1.8 && total > 1) {
            STATS.json.stringifyPatched++;
          }
        }, 'json.stringify.outer');
      }
    };

    return parseChainHooked;
  }

  // ===================================================================
  // 8. PROBE: NETWORK
  // ===================================================================

  var CHANNELS = [
    [/i\d?\.ytimg\.com|ytimg\.com\/vi/, 'thumbnails'],
    [/sponsor\.ajay\.app|sponsorblock/i, 'sponsorblock'],
    [/returnyoutubedislike/i, 'return-dislike'],
    [/googlevideo\.com/, 'media'],
    [/log_event|ptracking|api\/stats\/(atr|qoe)|viewthroughconversion/, 'telemetry'],
    [/youtubei\/v1/, 'yt-api'],
    [/\.(css|woff2?|ttf|otf)(\?|$)/, 'fonts-css'],
    [/\.(js)(\?|$)/, 'scripts']
  ];

  function classifyUrl(url) {
    var u = String(url || '');
    for (var i = 0; i < CHANNELS.length; i++) {
      if (CHANNELS[i][0].test(u)) return CHANNELS[i][1];
    }
    return 'other';
  }

  function recordRequest(kind, method, url, ms, ok) {
    var ch = classifyUrl(url);
    var c = channel(ch);
    c.count++;
    c.counter.hit();
    c.meter.add(ms);
    c.lastUrl = String(url).slice(0, 160);
    if (!ok) c.errors++;
    if (kind === 'fetch') STATS.net.fetch.hit();
    else STATS.net.xhr.hit();

    if (ms > 500 && ch !== 'media') {
      STATS.net.slow.push({
        ms: Math.round(ms),
        channel: ch,
        method: method,
        url: String(url).slice(0, 120),
        at: Date.now()
      });
      STATS.net.slow.sort(function (a, b) {
        return b.ms - a.ms;
      });
      if (STATS.net.slow.length > 6) STATS.net.slow.pop();
    }
    return ch;
  }

  function installNetworkProbes() {
    // navigator.sendBeacon carries the bulk of YouTube's log_event traffic on
    // TV. Without this probe the telemetry counters read zero and the feature
    // looks inert when it is in fact working hard.
    safe(function () {
      if (!navigator || typeof navigator.sendBeacon !== 'function') return;
      var nativeBeacon = navigator.sendBeacon;
      navigator.sendBeacon = function (url, data) {
        var name = classifyUrl(String(url));
        var ch = channel(name);
        ch.count++;
        ch.counter.hit();
        ch.lastUrl = String(url);
        STATS.net.beacons.hit();
        var ok = nativeBeacon.apply(navigator, arguments);
        // The mod cancels telemetry by making the send fail outright.
        if (name === 'telemetry') {
          STATS.net.seenTelemetry.hit();
          if (ok === false) STATS.net.blocked.hit();
        }
        return ok;
      };
      instrumentedMethods['navigator.sendBeacon'] = true;
    });
    if (!OPTIONS.probeNetwork) return;

    // ---- fetch ----
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (resource, init) {
        var url =
          resource && resource.url ? resource.url : String(resource == null ? '' : resource);
        var method = (init && init.method) || (resource && resource.method) || 'GET';
        var t0 = now();
        STATS.net.inFlight++;
        var done = function (ok) {
          STATS.net.inFlight--;
          safe(function () {
            recordRequest('fetch', method, url, now() - t0, ok);
          }, 'fetch.record');
        };
        var p;
        try {
          p = origFetch.call(this, resource, init);
        } catch (e) {
          done(false);
          throw e;
        }
        if (!p || typeof p.then !== 'function') {
          done(true);
          return p;
        }
        return p.then(
          function (res) {
            done(!!(res && res.ok !== false));
            return res;
          },
          function (err) {
            // A rejection here is often the mod cancelling telemetry on purpose.
            safe(function () {
              if (classifyUrl(url) === 'telemetry') STATS.net.blocked.hit();
            }, 'fetch.blocked');
            done(false);
            throw err;
          }
        );
      };
    }

    // ---- XMLHttpRequest ----
    var XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      var origOpen = XHR.prototype.open;
      var origSend = XHR.prototype.send;

      XHR.prototype.open = function (method, url) {
        try {
          this.__perfMethod = method;
          this.__perfUrl = url;
        } catch (e) {
          /* frozen instance */
        }
        return origOpen.apply(this, arguments);
      };

      XHR.prototype.send = function () {
        var self = this;
        var t0 = now();
        STATS.net.inFlight++;
        var settled = false;
        var finish = function () {
          if (settled) return;
          settled = true;
          STATS.net.inFlight--;
          safe(function () {
            var ok = self.status >= 200 && self.status < 400;
            recordRequest('xhr', self.__perfMethod || 'GET', self.__perfUrl || '', now() - t0, ok);
          }, 'xhr.record');
        };
        try {
          this.addEventListener('loadend', finish);
        } catch (e) {
          var prev = this.onreadystatechange;
          this.onreadystatechange = function () {
            if (self.readyState === 4) finish();
            if (prev) return prev.apply(this, arguments);
          };
        }
        try {
          return origSend.apply(this, arguments);
        } catch (e) {
          // adblock's tracking block throws to cancel telemetry sends.
          safe(function () {
            if (classifyUrl(self.__perfUrl) === 'telemetry') STATS.net.blocked.hit();
          }, 'xhr.blocked');
          finish();
          throw e;
        }
      };
    }
  }

  // ===================================================================
  // 9. PROBE: OBSERVERS
  //    Observers are the single biggest cost centre in this mod: five
  //    modules run subtree observers over the whole app. We record who
  //    created each one, what it watches, how many records it receives,
  //    and how long its callback blocks.
  // ===================================================================

  var observerSeq = 0;

  function describeTarget(target) {
    if (!target) return '?';
    if (target === document) return 'document';
    if (target === document.body) return 'body';
    if (target === document.documentElement) return 'html';
    var n = target.nodeName || '?';
    if (target.id) return n + '#' + target.id;
    if (target.className && typeof target.className === 'string') {
      var first = target.className.split(/\s+/)[0];
      if (first) return n + '.' + first;
    }
    return n;
  }

  function describeOptions(o) {
    if (!o) return '';
    var bits = [];
    if (o.subtree) bits.push('subtree');
    if (o.childList) bits.push('childList');
    if (o.characterData) bits.push('characterData');
    if (o.attributes) {
      bits.push(
        'attributes' + (o.attributeFilter ? '[' + o.attributeFilter.join(',') + ']' : '')
      );
    }
    return bits.join('+');
  }

  function registerObserver(rec) {
    rec.id = ++observerSeq;
    STATS.observers.push(rec);
    return rec;
  }

  function installObserverProbes() {
    if (!OPTIONS.probeObservers) return;

    // ---- MutationObserver ----
    var NativeMO = window.MutationObserver || window.WebKitMutationObserver;
    if (NativeMO) {
      var PatchedMO = function (callback) {
        var origin = originOf(callback, { fn: 'mutationCallback' });
        var rec = registerObserver({
          kind: 'mutation',
          origin: origin,
          targets: [],
          options: '',
          records: 0,
          maxBatch: 0,
          meter: new Meter('mo#' + (observerSeq + 1)),
          connected: false,
          createdAt: now()
        });

        var wrapped = function (records, observer) {
          safe(function () {
            rec.records += records.length;
            if (records.length > rec.maxBatch) rec.maxBatch = records.length;
          }, 'mo.count');
          var t0 = now();
          contextStack.push(origin);
          try {
            return callback.call(this, records, observer);
          } finally {
            var d = now() - t0;
            contextStack.pop();
            safe(function () {
              rec.meter.add(d);
              var e = ledgerFor(origin);
              e.meter.add(d);
              e.lastSeen = now();
              if (origin.ours) moduleMeter(origin.module).add(d);
            }, 'mo.charge');
          }
        };

        // Returning a real native instance keeps instanceof, subclassing and
        // every native invariant intact — safer than proxying the class.
        var inst = new NativeMO(wrapped);
        var nObserve = inst.observe;
        var nDisconnect = inst.disconnect;

        inst.observe = function (target, options) {
          safe(function () {
            var d = describeTarget(target);
            if (rec.targets.indexOf(d) === -1) rec.targets.push(d);
            rec.options = describeOptions(options);
            rec.connected = true;
            rec.observedAt = now();
          }, 'mo.observe');
          return nObserve.call(this, target, options);
        };
        inst.disconnect = function () {
          rec.connected = false;
          return nDisconnect.call(this);
        };
        inst.__perfRec = rec;
        return inst;
      };
      PatchedMO.prototype = NativeMO.prototype;
      window.MutationObserver = PatchedMO;
    }

    // ---- IntersectionObserver ----
    var NativeIO = window.IntersectionObserver;
    if (NativeIO) {
      var PatchedIO = function (callback, options) {
        var origin = originOf(callback, { fn: 'intersectionCallback' });
        var rec = registerObserver({
          kind: 'intersection',
          origin: origin,
          targets: [],
          options: options && options.rootMargin ? 'rootMargin ' + options.rootMargin : '',
          records: 0,
          maxBatch: 0,
          meter: new Meter('io'),
          connected: false,
          createdAt: now()
        });
        var wrapped = function (entries, observer) {
          safe(function () {
            rec.records += entries.length;
            if (entries.length > rec.maxBatch) rec.maxBatch = entries.length;
          }, 'io.count');
          return charge(origin, callback, this, [entries, observer]);
        };
        var inst = new NativeIO(wrapped, options);
        var nObserve = inst.observe;
        inst.observe = function (target) {
          safe(function () {
            rec.connected = true;
            rec.observedCount = (rec.observedCount || 0) + 1;
            var d = describeTarget(target);
            if (rec.targets.length < 4 && rec.targets.indexOf(d) === -1) rec.targets.push(d);
          }, 'io.observe');
          return nObserve.call(this, target);
        };
        inst.__perfRec = rec;
        return inst;
      };
      PatchedIO.prototype = NativeIO.prototype;
      window.IntersectionObserver = PatchedIO;
    }
  }

  // ===================================================================
  // 10. PROBE: TIMERS + rAF
  // ===================================================================

  function installTimerProbes() {
    if (!OPTIONS.probeTimers) return;

    var origSetTimeout = window.setTimeout;
    var origSetInterval = window.setInterval;
    var origClearInterval = window.clearInterval;

    window.setTimeout = function (fn, delay) {
      if (typeof fn !== 'function') return origSetTimeout.apply(window, arguments);
      var origin = originOf(fn);
      if (!origin.ours) {
        var inherited = currentContext();
        if (inherited && inherited.ours) origin = inherited;
      }
      STATS.timers.created.hit();
      var extra = Array.prototype.slice.call(arguments, 2);
      var wrapped = function () {
        var t0 = now();
        try {
          return charge(origin, fn, this, arguments.length ? arguments : extra);
        } finally {
          STATS.timers.fired.add(now() - t0);
        }
      };
      return origSetTimeout.apply(window, [wrapped, delay].concat(extra));
    };

    window.setInterval = function (fn, delay) {
      if (typeof fn !== 'function') return origSetInterval.apply(window, arguments);
      var origin = originOf(fn);
      if (!origin.ours) {
        var inherited = currentContext();
        if (inherited && inherited.ours) origin = inherited;
      }
      var extra = Array.prototype.slice.call(arguments, 2);
      var rec = {
        id: null,
        delay: delay || 0,
        origin: origin,
        startedAt: now(),
        ticks: 0,
        meter: new Meter('interval:' + origin.key)
      };
      var wrapped = function () {
        var t0 = now();
        try {
          return charge(origin, fn, this, arguments.length ? arguments : extra);
        } finally {
          var d = now() - t0;
          rec.ticks++;
          rec.meter.add(d);
          STATS.timers.fired.add(d);
        }
      };
      var id = origSetInterval.apply(window, [wrapped, delay].concat(extra));
      rec.id = id;
      STATS.timers.active[id] = rec;
      return id;
    };

    window.clearInterval = function (id) {
      if (STATS.timers.active[id]) delete STATS.timers.active[id];
      return origClearInterval.apply(window, arguments);
    };

    if (OPTIONS.probeRaf && window.requestAnimationFrame) {
      var origRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function (fn) {
        if (typeof fn !== 'function') return origRaf.apply(window, arguments);
        var origin = originOf(fn);
        if (!origin.ours) {
          var inherited = currentContext();
          if (inherited && inherited.ours) origin = inherited;
        }
        var wrapped = function (ts) {
          STATS.raf.counter.hit();
          var t0 = now();
          try {
            return charge(origin, fn, this, [ts]);
          } finally {
            var d = now() - t0;
            STATS.raf.meter.add(d);
            safe(function () {
              if (!origin.ours) return;
              var l = STATS.raf.loops[origin.key];
              if (!l) {
                l = STATS.raf.loops[origin.key] = {
                  origin: origin,
                  frames: 0,
                  meter: new Meter(origin.key),
                  counter: new Counter()
                };
              }
              l.frames++;
              l.meter.add(d);
              l.counter.hit();
            }, 'raf.loop');
          }
        };
        return origRaf.call(window, wrapped);
      };
    }
  }

  // ===================================================================
  // 11. PROBE: DOM QUERIES + LAYOUT READS
  //     Layout reads interleaved with writes are the classic webOS 3
  //     stall. We count them rather than timing them: the count is what
  //     tells you a polling fallback has kicked in.
  // ===================================================================

  function installDomProbes() {
    if (OPTIONS.probeDom) {
      var wrapQuery = function (proto, name, counter, meter) {
        if (!proto || typeof proto[name] !== 'function') return;
        var orig = proto[name];
        proto[name] = function (sel) {
          counter.hit();
          if (!meter) return orig.apply(this, arguments);
          var t0 = now();
          try {
            return orig.apply(this, arguments);
          } finally {
            meter.add(now() - t0);
          }
        };
      };
      wrapQuery(Document.prototype, 'querySelector', STATS.dom.querySelector, null);
      wrapQuery(Document.prototype, 'querySelectorAll', STATS.dom.querySelectorAll, STATS.dom.qsaMeter);
      wrapQuery(Document.prototype, 'getElementById', STATS.dom.getElementById, null);
      wrapQuery(Element.prototype, 'querySelector', STATS.dom.querySelector, null);
      wrapQuery(Element.prototype, 'querySelectorAll', STATS.dom.querySelectorAll, STATS.dom.qsaMeter);
    }

    if (OPTIONS.probeLayout) {
      var origRect = Element.prototype.getBoundingClientRect;
      if (typeof origRect === 'function') {
        Element.prototype.getBoundingClientRect = function () {
          STATS.layout.rect.hit();
          return origRect.apply(this, arguments);
        };
      }
      var origCS = window.getComputedStyle;
      if (typeof origCS === 'function') {
        window.getComputedStyle = function () {
          STATS.layout.computedStyle.hit();
          return origCS.apply(window, arguments);
        };
      }
    }
  }

  // ===================================================================
  // 12. PROBE: EVENT LISTENERS
  //     Only listeners registered by our bundle get wrapped; YouTube's own
  //     handlers pass through untouched so we add no cost to their paths.
  //     removeEventListener is patched in step to keep identity working.
  // ===================================================================

  var listenerWrappers = new WeakMap();
  var suppressListenerWrap = false;

  function listenerKey(type, options) {
    var capture = options === true || (options && options.capture) ? 1 : 0;
    return type + '|' + capture;
  }

  function installEventProbes() {
    if (!OPTIONS.probeEvents) return;
    var ET = window.EventTarget;
    if (!ET || !ET.prototype || !ET.prototype.addEventListener) return;

    var origAdd = ET.prototype.addEventListener;
    var origRemove = ET.prototype.removeEventListener;

    ET.prototype.addEventListener = function (type, listener, options) {
      if (suppressListenerWrap || typeof listener !== 'function') {
        return origAdd.apply(this, arguments);
      }
      var origin = originOf(listener, { fn: type + 'Handler' });
      if (!origin.ours) return origAdd.apply(this, arguments);

      var map = listenerWrappers.get(listener);
      if (!map) {
        map = {};
        listenerWrappers.set(listener, map);
      }
      var key = listenerKey(type, options);
      var wrapped = map[key];
      if (!wrapped) {
        wrapped = map[key] = function (evt) {
          STATS.events.dispatched.hit();
          var t0 = now();
          try {
            return charge(origin, listener, this, arguments);
          } finally {
            STATS.events.meter.add(now() - t0);
          }
        };
      }
      return origAdd.call(this, type, wrapped, options);
    };

    ET.prototype.removeEventListener = function (type, listener, options) {
      if (typeof listener === 'function') {
        var map = listenerWrappers.get(listener);
        if (map) {
          var wrapped = map[listenerKey(type, options)];
          if (wrapped) return origRemove.call(this, type, wrapped, options);
        }
      }
      return origRemove.apply(this, arguments);
    };
  }

  // ===================================================================
  // 13. PROBE: CLASS PROTOTYPES
  //     SponsorBlockHandler and ReturnYouTubeDislike are the two big
  //     stateful classes, and both publish their instance on window. When
  //     one appears we wrap its prototype once, which gives real per-method
  //     timings for ~60 methods that no global hook could see.
  //     Caveat: methods already .bind()-ed in the constructor keep pointing
  //     at the unwrapped original, so a handful of handlers stay invisible.
  // ===================================================================

  var wrappedProtos = new WeakSet();
  // Names we can see directly, as opposed to functions we can only infer from
  // aggregate cost at a hooked boundary. The sweep must not report an
  // unobservable function as "silent" — that would be a false alarm.
  var instrumentedMethods = {};
  /** module:name -> true for handlers bound before we could wrap them. */
  var boundCopies = {};
  /** module -> timestamp the prototype was wrapped. */
  var protoWrappedAt = {};
  var protoTargets = [
    { global: 'sponsorblock', module: 'sponsorblock.js' },
    { global: 'returnYouTubeDislike', module: 'return-dislike.js' }
  ];

  function wrapPrototype(obj, moduleName) {
    if (!obj) return false;
    var proto = Object.getPrototypeOf(obj);
    if (!proto || proto === Object.prototype) return false;
    if (wrappedProtos.has(proto)) return false;
    wrappedProtos.add(proto);

    var names = Object.getOwnPropertyNames(proto);
    var wrappedCount = 0;
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (name === 'constructor') continue;
      var desc = Object.getOwnPropertyDescriptor(proto, name);
      if (!desc || !desc.value || typeof desc.value !== 'function') continue;
      if (!desc.writable || !desc.configurable) continue;

      (function (name, fn) {
        // The prototype we are walking is the authority on which module this
        // method belongs to. Several names (init, log, destroy, handleNavigation)
        // exist on more than one class, so a bare registry lookup would
        // mislabel them — only accept the registry's role when it agrees.
        var reg = registryIndex[name];
        var role = reg && reg.module === moduleName ? reg.role : null;
        var origin = {
          module: moduleName,
          fn: name,
          role: role,
          cost: reg && reg.module === moduleName ? reg.cost : null,
          ours: true,
          key: moduleName + ':' + name
        };
        var wrapper = function () {
          return charge(origin, fn, this, arguments);
        };
        try {
          Object.defineProperty(wrapper, 'name', { value: name, configurable: true });
        } catch (e) {
          /* older engines */
        }
        originCache.set(wrapper, origin);
        instrumentedMethods[origin.key] = true;
        proto[name] = wrapper;
        wrappedCount++;
      })(name, desc.value);
    }
    if (wrappedCount) {
      console.info(
        '[PERF] instrumented ' + wrappedCount + ' methods on ' + moduleName + ' prototype'
      );
    }
    return wrappedCount > 0;
  }

  function pollForPrototypes() {
    if (!OPTIONS.probeProtos) return;
    var tick = function () {
      safe(function () {
        for (var i = 0; i < protoTargets.length; i++) {
          var t = protoTargets[i];
          var inst = window[t.global];
          if (inst && typeof inst === 'object') wrapPrototype(inst, t.module);
        }
      }, 'protoPoll');
    };
    tick();
    nativeSetInterval(tick, 2000);
  }

  // ===================================================================
  // 14. NATIVE DOM HELPERS
  //     Captured before the DOM probes are installed so the monitor's own
  //     queries never show up in the monitor's own counters.
  // ===================================================================

  var nQS = Document.prototype.querySelector;
  var nQSA = Document.prototype.querySelectorAll;
  var nGetById = Document.prototype.getElementById;

  function q(sel) {
    try {
      return nQS ? nQS.call(document, sel) : document.querySelector(sel);
    } catch (e) {
      return null;
    }
  }
  function qa(sel) {
    try {
      return nQSA ? nQSA.call(document, sel) : document.querySelectorAll(sel);
    } catch (e) {
      return [];
    }
  }
  function byId(id) {
    try {
      return nGetById ? nGetById.call(document, id) : document.getElementById(id);
    } catch (e) {
      return null;
    }
  }
  function hasClass(cls) {
    return !!(document.documentElement && document.documentElement.className.indexOf(cls) !== -1);
  }

  // ===================================================================
  // 15. CONFIG MIRROR
  //     Read straight from localStorage rather than importing config.js.
  //     A diagnostic tool should not depend on the subsystem it is
  //     diagnosing: if config.js throws or is mid-migration, the monitor
  //     must still boot and still be able to say so.
  //     Defaults mirror config.js — keep in sync when adding options.
  // ===================================================================

  var CONFIG_KEY = 'ytaf-configuration';

  var CONFIG_DEFAULTS = {
    uiTheme: 'blue-force-field',
    enableAdBlock: true,
    enableTrackingBlock: false,
    enableReturnYouTubeDislike: true,
    upgradeThumbnails: false,
    removeGlobalShorts: false,
    removeTopLiveGames: false,
    removeMostRelevant: false,
    enableSponsorBlock: true,
    enableMutedSegments: false,
    skipSegmentsOnce: false,
    hideEndcards: false,
    enableAutoLogin: true,
    hideLogo: false,
    showWatch: false,
    enableOledCareMode: false,
    videoShelfOpacity: 100,
    fixMultilineTitles: true,
    removeBlackBorders: false,
    forcePreviews: 'disabled',
    enableLegacyEmojiFix: true,
    hideGuestSignInPrompts: false,
    forceHighResVideo: false,
    disableNotifications: false
  };

  var configCache = null;
  var configReadAt = 0;

  function cfg() {
    if (configCache && now() - configReadAt < 2000) return configCache;
    var merged = {};
    for (var k in CONFIG_DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(CONFIG_DEFAULTS, k)) merged[k] = CONFIG_DEFAULTS[k];
    }
    safe(function () {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      if (!raw) return;
      var parsed = nativeParse(raw);
      for (var k2 in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, k2)) merged[k2] = parsed[k2];
      }
    }, 'cfg.read');
    configCache = merged;
    configReadAt = now();
    return merged;
  }

  function cfgGet(key) {
    var c = cfg();
    return c[key];
  }

  // ===================================================================
  // 16. FEATURE MANIFEST
  //
  //   Every user-facing option, the module that implements it, the pages
  //   where it should be doing work, the functions it should be running,
  //   and a live probe that verifies it.
  //
  //   state:
  //     off      - the option is disabled; nothing should run
  //     idle     - enabled, but this page is out of scope. Correct silence.
  //     armed    - enabled and in scope, hooked, waiting for input
  //     firing   - enabled, in scope, observed doing work
  //     stalled  - enabled and in scope, but the expected work is missing
  //     degraded - working, but paying more than it should
  // ===================================================================

  var ALL_PAGES = ['home', 'watch', 'shorts', 'search', 'account'];

  function chan(name) {
    return STATS.net.byChannel[name] || null;
  }
  function chanRate(name, w) {
    var c = chan(name);
    return c ? c.counter.rate(w || 5000) : 0;
  }
  function fnStats(module, fn) {
    var e = ledger[module + ':' + fn];
    if (!e) return null;
    return {
      calls: e.meter.count,
      totalMs: e.meter.total,
      maxMs: e.meter.max,
      recentMs: e.meter.window(3000).ms,
      lastSeen: e.lastSeen
    };
  }
  function anyFnRan(module, fns) {
    for (var i = 0; i < fns.length; i++) {
      var s = fnStats(module, fns[i]);
      if (s && s.calls > 0) return true;
    }
    return false;
  }
  // Copied verbatim from thumbnail-quality.js:27 (YT_THUMBNAIL_SELECTOR).
  // Guessing at this selector is how the probe produced a false stall the first
  // time; if the module changes what it tracks, change this line with it.
  var THUMB_SELECTOR = 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image';

  /**
   * thumbnail-quality.js layers the upgraded image in front of the original:
   *   background-image: url("...maxresdefault..."), url("...original...")
   * so an upgraded tile is one whose background-image holds two url() layers
   * with a high-res filename in the first. No attribute is written, which is
   * why an attribute-based probe reported a false stall.
   */
  var UPGRADE_RE = /maxresdefault|sddefault|hq720|hqdefault/;

  function isUpgradedTile(el) {
    var bg = el && el.style && el.style.backgroundImage;
    if (!bg) return false;
    // Two url() layers with a high-res filename in the mix: that is the upgrade
    // sitting in front of the original as a fallback.
    return bg.indexOf('url(') !== bg.lastIndexOf('url(') && UPGRADE_RE.test(bg);
  }

  function countUpgradedThumbs() {
    var n = 0;
    try {
      var els = qa(THUMB_SELECTOR);
      if (!els.length) {
        // The selector is the module's own, but if this YouTube build renamed
        // its elements a bounded sweep still finds the effect. Capped so the
        // probe can never become the expensive thing on the page.
        els = document.getElementsByTagName('*');
        var cap = els.length > 4000 ? 4000 : els.length;
        for (var j = 0; j < cap; j++) if (isUpgradedTile(els[j])) n++;
        return n;
      }
      for (var i = 0; i < els.length; i++) if (isUpgradedTile(els[i])) n++;
    } catch (e) {
      return 0;
    }
    return n;
  }

  /** The one <video> the mod cares about. */
  function playerVideo() {
    return q('video');
  }

  // We cannot see sponsorblock's timeupdate handler: it is bound in the
  // constructor before we can wrap the prototype. Attach our own passive
  // listener to the same element and count ticks, which answers the real
  // question — is the skip loop receiving time updates — without needing to
  // observe the mod's function at all.
  var videoTicks = new Counter();
  var tickTarget = null;
  function ensureVideoTickProbe() {
    var v = playerVideo();
    if (!v || v === tickTarget) return;
    tickTarget = v;
    suppressListenerWrap = true;
    try {
      v.addEventListener('timeupdate', function () {
        videoTicks.hit();
      });
    } catch (e) {
      /* ignore */
    }
    suppressListenerWrap = false;
  }

  /**
   * getElementsByTagName('*') stops at a shadow boundary, and YouTube's ytlr-*
   * elements are custom elements that may hold their subtree in a shadow root.
   * A count of a few hundred on a full watch page is the signature of exactly
   * that, so walk any open roots too and report both figures — the light-DOM
   * number alone would make the DOM gauge meaningless.
   */
  function countDom() {
    var light = 0;
    var shadow = 0;
    try {
      var all = document.getElementsByTagName('*');
      light = all.length;
      var roots = [];
      var cap = all.length > 6000 ? 6000 : all.length;
      for (var i = 0; i < cap; i++) {
        if (all[i].shadowRoot) roots.push(all[i].shadowRoot);
      }
      // One level deep is enough to tell a lean app from a hidden subtree, and
      // it keeps this off the hot path.
      for (var j = 0; j < roots.length && j < 400; j++) {
        try {
          shadow += roots[j].querySelectorAll('*').length;
        } catch (e) {
          /* closed root */
        }
      }
      STATS.shadowRoots = roots.length;
    } catch (e) {
      /* ignore */
    }
    STATS.domNodesLight = light;
    STATS.domNodesShadow = shadow;
    STATS.domNodes = light + shadow;
    return STATS.domNodes;
  }

  function observersFrom(moduleName) {
    var out = [];
    for (var i = 0; i < STATS.observers.length; i++) {
      var o = STATS.observers[i];
      if (o.origin && o.origin.module === moduleName) out.push(o);
    }
    return out;
  }
  function parseTypeSeen(type, withinMs) {
    var b = STATS.json.byType[type];
    if (!b) return false;
    if (!withinMs) return b.count > 0;
    return b.lastAt > 0 && now() - b.lastAt < withinMs;
  }

  var FEATURES = [
    {
      key: 'enableAdBlock',
      label: 'Ad Blocking',
      lamp: 'ADBLK',
      module: 'adblock.js',
      pages: ALL_PAGES,
      cost: 'medium',
      expect:
        'JSON.parse is hooked. Every response over 500 bytes is classified and ad renderers, ' +
        'reel ads and player ads are stripped before YouTube renders them.',
      fns: [
        'hookedParse',
        'detectResponseType',
        'applySchemaFilters',
        'filterItemsOptimized',
        'removePlayerAdsOptimized'
      ],
      perPage: {
        home: 'HOME_BROWSE responses filtered as shelves load and on every continuation.',
        watch: 'PLAYER + NEXT responses filtered; playerAds and adPlacements cleared.',
        shorts: 'SHORTS_SEQUENCE entries filtered for REEL_VIDEO_TYPE_AD.',
        search: 'SEARCH sectionListRenderer contents filtered.',
        account: 'Little to do here; the account selector carries no ad surfaces.'
      },
      probe: function () {
        var hooked = JSON.parse !== nativeParse;
        if (!hooked) {
          return { state: 'stalled', detail: 'JSON.parse is not hooked — nothing is filtering.' };
        }
        var hookMs = STATS.json.hookMeter.window(5000).ms;
        var parses = STATS.json.hookMeter.window(5000).count;
        if (parses === 0) {
          return { state: 'armed', detail: 'Hook installed. No responses parsed in the last 5s.' };
        }
        return {
          state: 'firing',
          detail:
            parses + ' responses in 5s, ' + fmtMs(hookMs) + ' spent inside the filter chain.',
          data: { hookMs5s: Math.round(hookMs * 10) / 10, parses5s: parses }
        };
      }
    },

    {
      key: 'enableTrackingBlock',
      label: 'Reduce Telemetry & Tracking',
      lamp: 'TRACK',
      module: 'adblock.js',
      pages: ALL_PAGES,
      cost: 'heavy',
      expect:
        'XHR and fetch to log_event, ptracking, stats/atr and stats/qoe are cancelled, AND ' +
        'walkAndProcess deep-walks every parsed response to depth 15 to strip trackingParams.',
      fns: ['initTrackingBlock', 'telemetryFetchHandler', 'walkAndProcess'],
      perPage: {
        home: 'Heavy: home responses are the largest, and each one gets a full depth-15 walk.',
        watch: 'Player and next responses walked; watchtime stats are deliberately left alone.'
      },
      probe: function () {
        var blocked = STATS.net.blocked.count;
        var tel = chan('telemetry');
        var telRate = chanRate('telemetry', 10000);
        var beacons = STATS.net.beacons.count;
        if (!tel && !beacons) {
          return {
            state: 'armed',
            detail:
              'No telemetry traffic observed at all. Either it is being cancelled ' +
              'upstream of our probes, or it leaves by a transport we do not watch.',
            data: { blocked: 0, seen: 0, beacons: 0 }
          };
        }
        if (blocked === 0 && telRate > 0.2) {
          return {
            state: 'stalled',
            detail: 'Telemetry requests are still completing (' + telRate.toFixed(1) + '/s).'
          };
        }
        return {
          state: blocked > 0 ? 'firing' : 'armed',
          detail:
            blocked +
            ' telemetry calls cancelled' +
            (tel ? ', ' + tel.count + ' seen' : '') +
            '. Deep-walk tax on every response is the real cost here.',
          data: {
            blocked: blocked,
            seen: tel ? tel.count : 0,
            beacons: beacons
          }
        };
      }
    },

    {
      key: 'upgradeThumbnails',
      label: 'Max Thumbnail Quality',
      lamp: 'THUMB',
      module: 'thumbnail-quality.js',
      pages: ['home', 'search', 'watch'],
      idlePages: ['shorts', 'account'],
      cost: 'heavy',
      expect:
        'A subtree observer on <ytlr-app> tracks every thumbnail tile. Each newly visible tile ' +
        'fires up to three parallel HEAD probes (maxres, sd, hq) against ytimg, capped at 3 ' +
        'concurrent jobs, and the winner is layered onto background-image.',
      fns: ['enableObserver', 'processUpgrade', 'testAndLoadImage', 'processRequestQueue', 'track'],
      perPage: {
        home: 'Highest load in the app: every shelf scroll streams new tiles into the queue.',
        search: 'Same path as home; result tiles are tracked as they mount.',
        watch: 'Only the related shelf, so probe volume should be much lower than home.',
        shorts: 'Nothing to do — Shorts tiles are not upgraded.'
      },
      probe: function () {
        // thumbnail-quality.js marks an upgrade by PREPENDING a second url()
        // to background-image, keeping the original as a fallback layer. There
        // is no marker attribute, so count the layered tiles directly.
        var upgraded = countUpgradedThumbs();
        var obs = observersFrom('thumbnail-quality.js');
        var headRate = chanRate('thumbnails', 5000);
        var c = chan('thumbnails');
        var tiles = qa(THUMB_SELECTOR).length;
        if (!upgraded && !headRate && !c) {
          // Only call this stalled if there was something to upgrade. An empty
          // shelf is not a failure.
          if (!tiles) {
            return { state: 'armed', detail: 'No thumbnail tiles on screen yet.' };
          }
          return {
            state: 'stalled',
            detail:
              tiles + ' tiles on screen, none upgraded and no ytimg probes seen.',
            data: { tiles: tiles }
          };
        }
        if (headRate > THRESHOLDS.headProbesPerSec) {
          return {
            state: 'degraded',
            detail:
              headRate.toFixed(1) +
              ' probes/s against ytimg — 3 HEADs per tile is saturating the socket pool.',
            data: { upgraded: upgraded, probesPerSec: headRate }
          };
        }
        return {
          state: upgraded > 0 || headRate > 0 ? 'firing' : 'armed',
          detail:
            upgraded +
            ' tiles upgraded on screen, ' +
            headRate.toFixed(1) +
            ' probes/s, ' +
            (c ? c.count : 0) +
            ' total.',
          data: { upgraded: upgraded, probesPerSec: headRate, observers: obs.length }
        };
      }
    },

    {
      key: 'enableSponsorBlock',
      label: 'SponsorBlock',
      lamp: 'SPNSR',
      module: 'sponsorblock.js',
      pages: ['watch'],
      idlePages: ['home', 'search', 'shorts', 'account'],
      cost: 'medium',
      expect:
        'On each watch navigation a handler is constructed, segments are fetched by hash prefix, ' +
        'the #previewbar overlay is drawn over the scrubber, and a timeupdate listener plus an ' +
        'rAF loop near a boundary decide skips.',
      fns: [
        'init',
        'fetchSegments',
        'start',
        'drawOverlay',
        'handleTimeUpdate',
        'highFreqLoop',
        'checkForProgressBar'
      ],
      perPage: {
        watch:
          'Expect: init -> fetchSegments -> processSegments -> checkForProgressBar -> drawOverlay, ' +
          'then handleTimeUpdate on every tick and highFreqLoop only near a segment edge.'
      },
      probe: function () {
        var sb = window.sponsorblock;
        if (!sb) {
          return {
            state: 'stalled',
            detail: 'No handler on window.sponsorblock for this video.'
          };
        }
        var segs = (sb.segments && sb.segments.length) || 0;
        var overlay = byId('previewbar');
        // handleTimeUpdate and highFreqLoop are bound in the constructor, so
        // the listener holds a copy taken before we could wrap the prototype.
        // Counting our own timeupdate listener on the same <video> answers the
        // question the call counter cannot.
        ensureVideoTickProbe();
        var ticks = videoTicks.rate(5000);
        if (segs === 0) {
          return {
            state: 'armed',
            detail: 'Handler live, zero segments returned for this video — nothing to skip.'
          };
        }
        if (!overlay) {
          return {
            state: 'degraded',
            detail: segs + ' segments loaded but #previewbar is not in the DOM.',
            data: { segments: segs }
          };
        }
        if (tickTarget && ticks === 0 && !tickTarget.paused) {
          return {
            state: 'stalled',
            detail:
              segs +
              ' segments and overlay drawn, but the video is playing and emitting no ' +
              'timeupdate events — skips will never fire.',
            data: { segments: segs, videoTicksPerSec: 0 }
          };
        }
        return {
          state: 'firing',
          detail:
            segs +
            ' segments, overlay drawn, ' +
            ticks.toFixed(1) +
            ' timeupdate/s reaching the skip loop.',
          data: {
            segments: segs,
            videoTicksPerSec: Math.round(ticks * 10) / 10,
            boundBeforeInstrumentation: !!boundCopies['sponsorblock.js:handleTimeUpdate']
          }
        };
      }
    },

    {
      key: 'enableReturnYouTubeDislike',
      label: 'Return YouTube Dislike',
      lamp: 'DSLKE',
      module: 'return-dislike.js',
      pages: ['watch'],
      idlePages: ['home', 'search', 'shorts', 'account'],
      cost: 'medium',
      expect:
        'On a watch hash change an instance is built, votes are fetched, the engagement panel is ' +
        'located, and #ryd-dislike-factoid is injected into it.',
      fns: ['init', 'fetchVideoData', 'observeBodyForPanel', 'checkAndInjectDislike'],
      perPage: {
        watch:
          'The panel only exists once the description is opened, so "armed" is normal until then.'
      },
      probe: function () {
        var ryd = window.returnYouTubeDislike;
        if (!ryd) return { state: 'stalled', detail: 'No instance on window.returnYouTubeDislike.' };
        var injected = byId('ryd-dislike-factoid');
        var c = chan('return-dislike');
        return {
          state: injected ? 'firing' : 'armed',
          detail: injected
            ? 'Factoid injected into the engagement panel.'
            : 'Instance live, waiting for the panel to mount. ' +
              (c ? c.count + ' vote lookups.' : 'No vote lookup yet.'),
          data: { injected: !!injected, requests: c ? c.count : 0 }
        };
      }
    },

    {
      key: 'forceHighResVideo',
      label: 'Force Max Quality',
      lamp: 'QUALT',
      module: 'video-quality.js',
      pages: ['watch'],
      idlePages: ['home', 'search', 'shorts', 'account'],
      cost: 'light',
      expect:
        'yt-player-quality is written to localStorage, the player element is polled for up to 10s, ' +
        'and setPlaybackQualityRange is called once the player reports PLAYING.',
      fns: ['initVideoQuality', 'handleStateChange', 'interceptAndUpgradeQuality', 'setQualityOnPlayer'],
      probe: function () {
        var player = byId('ytlr-player__player-container-player');
        if (!player) return { state: 'armed', detail: 'Player element not mounted yet.' };
        var applied = fnStats('video-quality.js', 'setQualityOnPlayer');
        var poll = STATS.timers.active;
        var polling = false;
        for (var id in poll) {
          if (poll[id].origin && poll[id].origin.module === 'video-quality.js') polling = true;
        }
        return {
          state: applied && applied.calls ? 'firing' : 'armed',
          detail:
            (applied && applied.calls ? 'Quality applied ' + applied.calls + 'x. ' : 'Attached, no upgrade yet. ') +
            (polling ? 'Fallback state poll is running (native listener failed).' : 'Using the native onStateChange listener.'),
          data: { applied: applied ? applied.calls : 0, fallbackPolling: polling }
        };
      }
    },

    {
      key: 'enableLegacyEmojiFix',
      label: 'Emoji + Characters Fix',
      lamp: 'EMOJI',
      module: 'emoji-font.js',
      pages: ALL_PAGES,
      cost: 'heavy',
      expect:
        'Only on webOS 4 and below. A childList + subtree + characterData observer on <body> ' +
        'queues text nodes, and a rAF drain wraps emoji runs in .twemoji-injected spans. ' +
        'adblock also wraps emoji inside frameworkUpdates on every response.',
      fns: ['manageObserverState', 'scanElement', 'processQueue', 'processTextNode'],
      probe: function () {
        if (!hasClass('ytaf-legacy-emoji')) {
          return {
            state: 'idle',
            detail: 'Not a legacy webOS build (or the document is not UTF-8) — this module is inert.'
          };
        }
        var wrapped = qa('.twemoji-injected').length;
        var obs = observersFrom('emoji-font.js');
        var pq = fnStats('emoji-font.js', 'processQueue');
        return {
          state: wrapped > 0 ? 'firing' : obs.length ? 'armed' : 'stalled',
          detail:
            wrapped +
            ' spans wrapped, ' +
            obs.length +
            ' observer(s), processQueue x' +
            (pq ? pq.calls : 0) +
            '. This observer sees every text mutation in the app.',
          data: { wrapped: wrapped, observers: obs.length }
        };
      }
    },

    {
      key: 'removeGlobalShorts',
      label: 'Remove Shorts (Global)',
      lamp: 'SHRTS',
      module: 'adblock.js',
      pages: ['home', 'search'],
      idlePages: ['watch', 'shorts', 'account'],
      cost: 'light',
      expect:
        'Shelves whose title is "Shorts" and tiles with TILE_STYLE_YTLR_SHORTS are dropped from ' +
        'HOME_BROWSE, SEARCH and CONTINUATION responses before render.',
      fns: ['processSectionListOptimized', 'filterItemsOptimized'],
      probe: function () {
        // The honest test is whether a Shorts shelf survived to the DOM.
        var leaked = 0;
        var titles = qa('ytlr-shelf-header-layout, .shelf-title, h2');
        for (var i = 0; i < titles.length && i < 60; i++) {
          var t = (titles[i].textContent || '').trim();
          if (t === 'Shorts') leaked++;
        }
        if (leaked) {
          return {
            state: 'stalled',
            detail: leaked + ' Shorts shelf/shelves reached the DOM — a schema path was missed.',
            data: { leaked: leaked }
          };
        }
        return {
          state: parseTypeSeen('HOME_BROWSE') || parseTypeSeen('SEARCH') ? 'firing' : 'armed',
          detail: 'No Shorts shelf present in the rendered page.'
        };
      }
    },

    {
      key: 'removeTopLiveGames',
      label: 'Remove Top Live Games',
      lamp: 'LIVEG',
      module: 'adblock.js',
      pages: ['home'],
      idlePages: ['watch', 'shorts', 'search', 'account'],
      cost: 'free',
      expect: 'The shelf titled "Top live games" is dropped from HOME_BROWSE responses.',
      fns: ['processSectionListOptimized'],
      probe: function () {
        return {
          state: parseTypeSeen('HOME_BROWSE') ? 'firing' : 'armed',
          detail: 'Title match runs inside the existing shelf walk; no extra traversal.'
        };
      }
    },

    {
      key: 'removeMostRelevant',
      label: 'Remove "Most Relevant" Shelf',
      lamp: 'MRELV',
      module: 'adblock.js',
      pages: ['home', 'search'],
      idlePages: ['watch', 'shorts', 'account'],
      cost: 'free',
      expect: 'The shelf titled "Most relevant" is dropped during the same shelf walk.',
      fns: ['processSectionListOptimized'],
      probe: function () {
        return {
          state: parseTypeSeen('HOME_BROWSE') || parseTypeSeen('SEARCH') ? 'firing' : 'armed',
          detail: 'Title match runs inside the existing shelf walk; no extra traversal.'
        };
      }
    },

    {
      key: 'hideGuestSignInPrompts',
      label: 'Guest Mode: Hide Sign-in Buttons',
      lamp: 'GUEST',
      module: 'adblock.js',
      pages: ['home', 'search', 'watch'],
      cost: 'light',
      expect: 'Tiles carrying the guest sign-in prompt renderer are filtered out of every list.',
      fns: ['hasGuestPromptRenderer', 'filterItemsOptimized'],
      probe: function () {
        return { state: 'armed', detail: 'Filter is part of the per-tile pass.' };
      }
    },

    {
      key: 'hideEndcards',
      label: 'Hide Endcards',
      lamp: 'ENDCD',
      module: 'adblock.js',
      pages: ['watch'],
      idlePages: ['home', 'search', 'shorts', 'account'],
      cost: 'free',
      expect: 'Endcard arrays are emptied on the PLAYER response as the video loads.',
      fns: ['removeEndcardsOptimized'],
      probe: function () {
        return {
          state: parseTypeSeen('PLAYER', 60000) ? 'firing' : 'armed',
          detail: parseTypeSeen('PLAYER', 60000)
            ? 'A PLAYER response was filtered for this session.'
            : 'Waiting for the next PLAYER response.'
        };
      }
    },

    {
      key: 'enableAutoLogin',
      label: 'Auto Login',
      lamp: 'LOGIN',
      module: 'auto-login.js',
      pages: ['account'],
      idlePages: ['home', 'watch', 'shorts', 'search'],
      cost: 'light',
      expect:
        'On the account selector the identity flags are written and the selector is bypassed, ' +
        'with CSS hiding the flash while it happens.',
      fns: ['attemptActiveBypass', 'disableWhosWatching', 'finalizeBypass'],
      probe: function () {
        var ran = anyFnRan('auto-login.js', ['attemptActiveBypass', 'disableWhosWatching']);
        return {
          state: ran ? 'firing' : 'armed',
          detail: ran ? 'Bypass attempted this session.' : 'Waiting for an account selector screen.'
        };
      }
    },

    {
      key: 'showWatch',
      label: 'Display Time in UI',
      lamp: 'CLOCK',
      module: 'watch.js',
      pages: ALL_PAGES,
      cost: 'free',
      expect: 'A .webOs-watch element is mounted and updated once a minute.',
      fns: ['startClock', 'updateVisibility'],
      probe: function () {
        var el = q('.webOs-watch');
        return {
          state: el ? 'firing' : 'stalled',
          detail: el ? 'Clock element mounted, one tick per minute.' : 'No .webOs-watch element found.'
        };
      }
    },

    {
      key: 'enableOledCareMode',
      label: 'OLED-Care Mode',
      lamp: 'OLED',
      module: 'ui.js',
      pages: ALL_PAGES,
      cost: 'free',
      expect: 'html.oled-theme-active is set; everything else is static CSS with no runtime cost.',
      fns: ['applyOledMode', 'syncOledShelfOpacity'],
      probe: function () {
        var on = hasClass('oled-theme-active');
        return {
          state: on ? 'firing' : 'stalled',
          detail: on
            ? 'Class applied to <html>. Pure CSS from here — zero per-frame cost.'
            : 'Enabled in config but html.oled-theme-active is missing.'
        };
      }
    },

    {
      key: 'hideLogo',
      label: 'Hide YouTube Logo',
      lamp: 'LOGO',
      module: 'ui.js',
      pages: ALL_PAGES,
      cost: 'free',
      expect: 'html.ytaf-hide-logo is set. Static CSS only.',
      fns: ['initGlobalStyles', 'updateLogoState'],
      probe: function () {
        var on = hasClass('ytaf-hide-logo');
        return {
          state: on ? 'firing' : 'stalled',
          detail: on ? 'Class applied. No runtime cost.' : 'Class missing from <html>.'
        };
      }
    },

    {
      key: 'fixMultilineTitles',
      label: 'Fix Multiline Titles',
      lamp: 'TITLE',
      module: 'ui.js',
      pages: ALL_PAGES,
      cost: 'free',
      expect: 'html.ytaf-fix-titles is set. Static CSS only.',
      fns: ['initGlobalStyles'],
      probe: function () {
        var on = hasClass('ytaf-fix-titles');
        return {
          state: on ? 'firing' : 'stalled',
          detail: on ? 'Class applied. No runtime cost.' : 'Class missing from <html>.'
        };
      }
    },

    {
      key: 'removeBlackBorders',
      label: 'New Liquid Glass UI',
      lamp: 'GLASS',
      module: 'ui.js',
      pages: ALL_PAGES,
      cost: 'light',
      expect:
        'html.ytaf-remove-borders is set. Static CSS, but blur and transparency raise GPU ' +
        'compositing cost on older panels.',
      fns: ['initGlobalStyles'],
      probe: function () {
        var on = hasClass('ytaf-remove-borders');
        return {
          state: on ? 'firing' : 'stalled',
          detail: on ? 'Class applied. Watch FPS if the panel is a webOS 3 unit.' : 'Class missing.'
        };
      }
    },

    {
      key: 'disableNotifications',
      label: 'Disable Notifications',
      lamp: 'TOAST',
      module: 'notifications.js',
      pages: ALL_PAGES,
      cost: 'free',
      expect: 'showNotification returns a no-op handle and never touches the DOM.',
      fns: ['showNotification'],
      probe: function () {
        return { state: 'firing', detail: 'Toasts suppressed at the entry point.' };
      }
    },

    {
      key: 'forcePreviews',
      label: 'Force Previews',
      lamp: 'PREVW',
      module: 'auto-login.js',
      pages: ['home', 'search'],
      idlePages: ['watch', 'shorts', 'account'],
      cost: 'light',
      enabledWhen: function (v) {
        return v && v !== 'disabled';
      },
      expect: 'The inline playback preference is written so shelf tiles autoplay (or do not).',
      fns: ['setInlinePlayback', 'initPreviews'],
      probe: function () {
        var ran = anyFnRan('auto-login.js', ['setInlinePlayback', 'initPreviews']);
        return {
          state: ran ? 'firing' : 'armed',
          detail: 'Mode: ' + cfgGet('forcePreviews')
        };
      }
    }
  ];

  // Always-on modules with no config key — they still need to be accounted for.
  var ALWAYS_ON = [
    {
      key: null,
      label: 'Screensaver Fix',
      lamp: 'SCRSV',
      module: 'screensaver-fix.js',
      pages: ['watch', 'shorts'],
      idlePages: ['home', 'search', 'account'],
      cost: 'light',
      expect:
        'On watch: a style observer keeps the <video> filling the screen, coalesced into one rAF. ' +
        'On shorts: a synthetic YELLOW key every 30s while playing.',
      fns: ['updateState', 'setShortsKeepAlive', 'isPlayerHidden'],
      probe: function () {
        var obs = observersFrom('screensaver-fix.js');
        var page = STATS.page;
        // The keep-alive is an anonymous arrow inside window.setInterval, so it
        // carries no name and (in an eval-hosted bundle) no file URL either.
        // A 30s interval is unique to this module in this codebase, so match on
        // the delay and treat module attribution as a bonus, not a requirement.
        var keepAlive = false;
        var keepAliveOwned = false;
        for (var id in STATS.timers.active) {
          var t = STATS.timers.active[id];
          if (t.delay >= 25000 && t.delay <= 60000) {
            keepAlive = true;
            if (t.origin && t.origin.module === 'screensaver-fix.js') keepAliveOwned = true;
          }
        }
        // Second, independent signal: we filter synthetic YELLOW presses out of
        // our own remote handler, so we can simply count them.
        var synthetic = STATS.syntheticYellow || 0;
        if (page === 'shorts') {
          if (keepAlive || synthetic > 0) {
            return {
              state: 'firing',
              detail:
                'Keep-alive running' +
                (keepAliveOwned ? '' : ' (matched by 30s period; callback is anonymous)') +
                ', ' + synthetic + ' synthetic YELLOW presses seen.',
              data: { syntheticPresses: synthetic }
            };
          }
          // The interval only starts once a Short is actually playing.
          var v = playerVideo();
          if (!v || v.paused) {
            return {
              state: 'armed',
              detail: 'Waiting for playback to start before arming the keep-alive.'
            };
          }
          return {
            state: 'stalled',
            detail: 'A Short is playing but no keep-alive interval is registered.'
          };
        }
        var connected = 0;
        for (var i = 0; i < obs.length; i++) if (obs[i].connected) connected++;
        return {
          state: connected ? 'firing' : 'armed',
          detail: connected + ' style observer(s) on the video element.'
        };
      }
    },
    {
      key: null,
      label: 'Spatial Navigation Polyfill',
      lamp: 'SPNAV',
      module: 'spatial-navigation-polyfill.js',
      pages: ALL_PAGES,
      cost: 'medium',
      expect:
        'Provides window.navigate and directional focus for the remote. Every arrow keypress ' +
        'runs a candidate search across focusable elements.',
      fns: [],
      probe: function () {
        var present = typeof window.navigate === 'function' || !!window.__spatialNavigation__;
        return {
          state: present ? 'firing' : 'stalled',
          detail: present
            ? 'Installed. Cost scales with focusable element count on the page.'
            : 'window.navigate is missing — remote navigation will fall back to YouTube.'
        };
      }
    },
    {
      key: null,
      label: 'Inline Playback Flag (JSON.stringify)',
      lamp: 'NOADS',
      module: 'json-stringify.ts',
      pages: ALL_PAGES,
      cost: 'medium',
      expect:
        'Every JSON.stringify is inspected for a playback context; when found, the object is ' +
        'deep-cloned and isInlinePlaybackNoAd is set before serialising.',
      fns: ['stringify'],
      probe: function () {
        var clones = STATS.json.stringifyPatched;
        var overhead = STATS.json.stringifyHook.window(5000).ms;
        return {
          state: clones > 0 ? 'firing' : 'armed',
          detail:
            clones +
            ' payloads cloned and flagged. ' +
            fmtMs(overhead) +
            ' of stringify overhead in the last 5s.',
          data: { clones: clones }
        };
      }
    },
    {
      key: null,
      label: 'Shortcut Key Router',
      lamp: 'KEYS',
      module: 'ui.js',
      pages: ALL_PAGES,
      cost: 'light',
      expect: 'A capture-phase keydown listener maps colour and number keys to actions.',
      fns: ['eventHandler', 'handleShortcutAction'],
      probe: function () {
        var s = fnStats('ui.js', 'eventHandler');
        return {
          state: s && s.calls ? 'firing' : 'armed',
          detail: s ? s.calls + ' key events routed.' : 'No key events yet this session.'
        };
      }
    }
  ];

  function allFeatures() {
    return FEATURES.concat(ALWAYS_ON);
  }

  function featureEnabled(f) {
    if (!f.key) return true;
    var v = cfgGet(f.key);
    if (f.enabledWhen) return !!f.enabledWhen(v);
    return !!v;
  }

  /**
   * Evaluate one feature against the current page. This is the function that
   * answers "what should be happening right now, and is it?".
   */
  function evaluateFeature(f, page) {
    var enabled = featureEnabled(f);
    if (!enabled) {
      return {
        key: f.key,
        label: f.label,
        lamp: f.lamp,
        module: f.module,
        enabled: false,
        state: 'off',
        detail: 'Disabled in settings. No code path active.',
        expect: f.expect,
        cost: f.cost
      };
    }

    var inScope = !f.pages || f.pages.indexOf(page) !== -1;
    if (!inScope) {
      return {
        key: f.key,
        label: f.label,
        lamp: f.lamp,
        module: f.module,
        enabled: true,
        state: 'idle',
        detail: 'Enabled, but out of scope on the ' + page + ' page. Silence here is correct.',
        expect: f.expect,
        cost: f.cost
      };
    }

    var res = safe(function () {
      return f.probe();
    }, 'probe:' + f.label) || { state: 'error', detail: 'Probe threw.' };

    return {
      key: f.key,
      label: f.label,
      lamp: f.lamp,
      module: f.module,
      enabled: true,
      state: res.state,
      detail: res.detail,
      data: res.data || null,
      expect: f.expect,
      pageNote: f.perPage ? f.perPage[page] || null : null,
      fns: f.fns || [],
      cost: f.cost
    };
  }

  function evaluateAll(page) {
    var p = page || STATS.page;
    var list = allFeatures();
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(evaluateFeature(list[i], p));
    return out;
  }

  // Probes touch the DOM, so the 2Hz render loop reuses a recent result rather
  // than re-querying for every gauge tick. The monitor is allowed to cost
  // something; it is not allowed to cost enough to change what it measures.
  var evalCache = null;
  var evalCacheAt = 0;
  var evalCachePage = '';

  function evaluateAllCached(ttl) {
    var p = STATS.page;
    if (evalCache && p === evalCachePage && now() - evalCacheAt < (ttl || 1500)) return evalCache;
    evalCache = evaluateAll(p);
    evalCacheAt = now();
    evalCachePage = p;
    return evalCache;
  }

  /**
   * Page-entry sweep. On every navigation, wait for the page to settle, then
   * walk the manifest and log exactly what should be running here, which of
   * the expected functions actually fired, and what is silent.
   */
  var lastSweep = null;

  function dedupe(list) {
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (seen[list[i]]) continue;
      seen[list[i]] = true;
      out.push(list[i]);
    }
    return out;
  }

  function runSweep(page, reason) {
    var results = evaluateAll(page);
    var fnReport = [];

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.state === 'off' || r.state === 'idle') continue;
      var fns = r.fns || [];
      for (var j = 0; j < fns.length; j++) {
        var key = r.module + ':' + fns[j];
        var s = fnStats(r.module, fns[j]);
        var reg = registryIndex[fns[j]];
        fnReport.push({
          feature: r.label,
          module: r.module,
          fn: fns[j],
          role: reg ? reg.role : null,
          costClass: reg ? reg.cost : null,
          fired: !!(s && s.calls),
          calls: s ? s.calls : 0,
          totalMs: s ? Math.round(s.totalMs * 100) / 100 : 0,
          maxMs: s ? Math.round(s.maxMs * 100) / 100 : 0,
          // A function is directly observable only if it crosses a hooked
          // boundary or lives on an instrumented prototype. Everything else
          // is inferred from its module's aggregate cost, and calling it
          // "silent" would be a false alarm.
          observable: !!instrumentedMethods[key] || !!s,
          // Handlers bound in a constructor hold a copy taken before we wrapped
          // the prototype, so a zero call count says nothing about whether they
          // run. Same for methods that had already finished by the time the
          // instance appeared on window.
          boundBefore: !!boundCopies[key],
          preInstrumentation:
            !!protoWrappedAt[r.module] && !!s === false && !!instrumentedMethods[key]
        });
      }
    }

    lastSweep = {
      page: page,
      reason: reason,
      at: Date.now(),
      features: results,
      functions: fnReport
    };

    logSweep(lastSweep);
    return lastSweep;
  }

  var STATE_MARK = {
    firing: '\u25CF',
    armed: '\u25CB',
    idle: '\u00B7',
    off: '\u00B7',
    stalled: '\u25B2',
    degraded: '\u25B2',
    error: '\u2716'
  };

  function logSweep(sweep) {
    var group = console.groupCollapsed || console.log;
    var problems = [];
    for (var i = 0; i < sweep.features.length; i++) {
      var f = sweep.features[i];
      if (f.state === 'stalled' || f.state === 'degraded' || f.state === 'error') problems.push(f);
    }
    safe(function () {
      group.call(
        console,
        '%c[PERF] ' +
          sweep.page.toUpperCase() +
          ' sweep — ' +
          sweep.features.length +
          ' features, ' +
          problems.length +
          ' need attention',
        'color:' + (problems.length ? '#ff9d00' : '#3ee08a') + ';font-weight:bold'
      );
      for (var i = 0; i < sweep.features.length; i++) {
        var f = sweep.features[i];
        if (f.state === 'off') continue;
        console.log(
          STATE_MARK[f.state] + ' ' + f.state.toUpperCase() + '  ' + f.label + ' — ' + f.detail
        );
        if (f.pageNote) console.log('     expected here: ' + f.pageNote);
      }
      var fired = [];
      var silent = [];
      var opaque = [];
      var blind = [];
      for (var j = 0; j < sweep.functions.length; j++) {
        var fr = sweep.functions[j];
        if (fr.fired) fired.push(fr.fn + ' x' + fr.calls);
        else if (fr.boundBefore) blind.push(fr.fn);
        else if (fr.observable) silent.push(fr.fn);
        else opaque.push(fr.fn);
      }
      fired = dedupe(fired);
      silent = dedupe(silent);
      opaque = dedupe(opaque);
      blind = dedupe(blind);
      if (fired.length) console.log('  fired: ' + fired.join(', '));
      if (silent.length) console.log('  hooked but silent so far: ' + silent.join(', '));
      if (blind.length) {
        console.log(
          '  bound before instrumentation (call count is meaningless): ' + blind.join(', ')
        );
      }
      if (opaque.length) {
        console.log(
          '  no hook boundary (cost rolls up into the module total): ' + opaque.join(', ')
        );
      }
      if (console.groupEnd) console.groupEnd();
    }, 'logSweep');

    // The 1.2s sweep exists to show the transition, not to judge it. Let the
    // settled sweep be the one that can raise an alarm, or the early pass will
    // report every late-binding feature as broken on every navigation.
    var provisional = sweep.reason && sweep.reason.indexOf('navigation from') === 0;
    if (problems.length && OPTIONS.autoReport && !provisional) {
      maybeEmitReport('sweep found ' + problems.length + ' issue(s)');
    }
  }

  // ===================================================================
  // 17. BOTTLENECK RULES
  //     Each rule reads the live stats and returns a finding or null.
  //     Findings carry a suggestion because the report is meant to be
  //     handed to an agent that will act on it.
  // ===================================================================

  var RULES = [
    function longTasks() {
      var w = STATS.longTaskMeter.window(5000);
      if (!w.count) return null;
      var worst = STATS.longTasks.length ? STATS.longTasks[0].duration : 0;
      if (worst < THRESHOLDS.longTaskSevereMs && w.ms < 500) return null;
      return {
        id: 'main-thread-blocked',
        severity: worst >= THRESHOLDS.longTaskSevereMs ? 'critical' : 'warn',
        metric: 'longtask.ms/5s',
        value: Math.round(w.ms),
        threshold: 500,
        why:
          w.count +
          ' long tasks in 5s, worst ' +
          Math.round(worst) +
          'ms. The main thread was unavailable to paint for that long.',
        suggestion:
          'Check the FUNCTIONS tab for the top self-time entry in the same window and split its work across frames.'
      };
    },

    function parseHook() {
      var w = STATS.json.hookMeter.window(1000);
      if (w.ms < THRESHOLDS.parseHookMsPerSec) return null;
      var worstType = null;
      var worstMs = 0;
      for (var t in STATS.json.byType) {
        var b = STATS.json.byType[t];
        var bw = b.hook.window(1000).ms;
        if (bw > worstMs) {
          worstMs = bw;
          worstType = t;
        }
      }
      return {
        id: 'json-hook-tax',
        severity: w.ms > THRESHOLDS.parseHookMsPerSec * 2.5 ? 'critical' : 'warn',
        module: 'adblock.js',
        metric: 'json.parse hook ms/s',
        value: Math.round(w.ms),
        threshold: THRESHOLDS.parseHookMsPerSec,
        why:
          'Response filtering is adding ' +
          Math.round(w.ms) +
          'ms per second on top of native parsing' +
          (worstType ? ', worst on ' + worstType + ' responses' : '') +
          '.',
        suggestion: cfgGet('enableTrackingBlock')
          ? 'Reduce Telemetry is on, which forces a depth-15 walkAndProcess over every response. Test with it off to separate the two costs.'
          : 'Check whether responses are falling through to applyFallbackFilters — that path deep-searches instead of using a schema path.'
      };
    },

    function thumbnailStorm() {
      if (!cfgGet('upgradeThumbnails')) return null;
      var rate = chanRate('thumbnails', 5000);
      if (rate < THRESHOLDS.headProbesPerSec) return null;
      return {
        id: 'thumbnail-probe-storm',
        severity: rate > THRESHOLDS.headProbesPerSec * 2 ? 'critical' : 'warn',
        module: 'thumbnail-quality.js',
        metric: 'ytimg HEAD probes/s',
        value: Math.round(rate * 10) / 10,
        threshold: THRESHOLDS.headProbesPerSec,
        why:
          'processUpgrade fires up to three parallel HEAD probes per tile. Fast scrolling is ' +
          'queueing tiles faster than the 3-job gate can drain them.',
        suggestion:
          'Lower MAX_CONCURRENT_REQUESTS, or probe sequentially (maxres, then sd) so a hit on the first candidate costs one request instead of three.'
      };
    },

    function heavyObservers() {
      var worst = null;
      for (var i = 0; i < STATS.observers.length; i++) {
        var o = STATS.observers[i];
        if (!o.origin.ours || !o.connected) continue;
        var w = o.meter.window(2000);
        var perSec = w.ms / 2;
        if (perSec > 25 && (!worst || perSec > worst.perSec)) {
          worst = { o: o, perSec: perSec };
        }
      }
      if (!worst) return null;
      return {
        id: 'observer-callback-cost',
        severity: worst.perSec > 60 ? 'critical' : 'warn',
        module: worst.o.origin.module,
        metric: 'observer callback ms/s',
        value: Math.round(worst.perSec),
        threshold: 25,
        why:
          'The ' +
          worst.o.origin.module +
          ' observer (' +
          (worst.o.options || 'no options') +
          ' on ' +
          worst.o.targets.join(', ') +
          ') is burning ' +
          Math.round(worst.perSec) +
          'ms/s in its callback, with batches up to ' +
          worst.o.maxBatch +
          ' records.',
        suggestion:
          'Narrow the observed root or add an attributeFilter, and bail out of the callback before touching the DOM when nothing relevant changed.'
      };
    },

    function fastIntervals() {
      var found = [];
      for (var id in STATS.timers.active) {
        var t = STATS.timers.active[id];
        if (!t.origin.ours) continue;
        if (t.delay && t.delay < THRESHOLDS.fastIntervalMs) found.push(t);
      }
      if (!found.length) return null;
      return {
        id: 'fast-interval',
        severity: 'warn',
        module: found[0].origin.module,
        metric: 'interval delay (ms)',
        value: found[0].delay,
        threshold: THRESHOLDS.fastIntervalMs,
        why:
          found.length +
          ' interval(s) under ' +
          THRESHOLDS.fastIntervalMs +
          'ms are running: ' +
          found
            .map(function (t) {
              return t.origin.key + '@' + t.delay + 'ms';
            })
            .join(', ') +
          '. On webOS these keep the CPU out of its idle state.',
        suggestion: 'Replace polling with an event or observer, or back the interval off once the expected element is found.'
      };
    },

    function layoutThrash() {
      var rate = STATS.layout.rect.rate(2000);
      if (rate < THRESHOLDS.layoutReadsPerSec) return null;
      return {
        id: 'layout-read-storm',
        severity: rate > THRESHOLDS.layoutReadsPerSec * 2 ? 'critical' : 'warn',
        metric: 'getBoundingClientRect/s',
        value: Math.round(rate),
        threshold: THRESHOLDS.layoutReadsPerSec,
        why:
          Math.round(rate) +
          ' layout reads per second. Each one can force a synchronous reflow if a style write ' +
          'happened since the last frame.',
        suggestion:
          'On webOS 3 the IntersectionObserver polyfill in thumbnail-quality.js polls getBoundingClientRect for every tracked tile every 600ms — check whether the native observer is available before falling back.'
      };
    },

    function domSize() {
      if (STATS.domNodes < THRESHOLDS.domNodesWarn) return null;
      return {
        id: 'dom-size',
        severity: STATS.domNodes > THRESHOLDS.domNodesCritical ? 'critical' : 'warn',
        metric: 'DOM nodes',
        value: STATS.domNodes,
        threshold: THRESHOLDS.domNodesWarn,
        why:
          STATS.domNodes +
          ' elements in the tree. Every subtree observer in the mod pays for this on each batch.',
        suggestion:
          'Check whether removed shelves are being detached or merely hidden, and confirm untrack() is releasing thumbnail elements.'
      };
    },

    function mainThreadLag() {
      if (STATS.lagMs < 60) return null;
      var worst = null;
      var worstMs = 0;
      for (var m in moduleMeters) {
        if (!Object.prototype.hasOwnProperty.call(moduleMeters, m)) continue;
        var ms = moduleMeters[m].window(3000).ms;
        if (ms > worstMs) {
          worstMs = ms;
          worst = m;
        }
      }
      return {
        id: 'main-thread-lag',
        severity: STATS.lagMs > 150 ? 'critical' : 'warn',
        metric: 'scheduler drift',
        value: Math.round(STATS.lagMs),
        threshold: 60,
        why:
          'A 100ms timer is landing ' +
          Math.round(STATS.lagMs) +
          'ms late, so the main thread is congested' +
          (worst ? '. Heaviest mod module in the same window: ' + worst : '') +
          '. This is the reliable smoothness signal on builds where rAF is not vsync-locked.',
        suggestion:
          'Look at the ENGINE tab for the module holding the thread, and at any interval ' +
          'under 250ms. Deferring work to requestIdleCallback usually recovers the drift.'
      };
    },

    function fpsFloor() {
      // Above ~70fps the platform is running rAF off a timer, not vsync, so the
      // reading is not a frame rate at all and the rule would be meaningless.
      // Main-thread lag is the honest metric on those devices.
      if (STATS.fps > 70) return null;
      if (STATS.fps === 0 || STATS.fps >= THRESHOLDS.fpsFloor) return null;
      var top = topFunctions(1, 2000)[0];
      return {
        id: 'frame-rate',
        severity: STATS.fps < THRESHOLDS.fpsCritical ? 'critical' : 'warn',
        metric: 'fps',
        value: STATS.fps,
        threshold: THRESHOLDS.fpsFloor,
        why:
          'Rendering at ' +
          STATS.fps +
          'fps on the ' +
          STATS.page +
          ' page' +
          (top ? '. Heaviest mod function right now: ' + top.key + ' at ' + fmtMs(top.recentMs) + '/2s.' : '.'),
        suggestion: top
          ? 'Start with ' + top.key + ' — ' + (top.role || 'no registered role') + '.'
          : 'No mod function is dominating; the cost is likely YouTube-side or GPU compositing.'
      };
    },

    function heapGrowth() {
      var s = STATS.heapSamples;
      if (s.length < 6) return null;
      var first = s[0];
      var last = s[s.length - 1];
      var minutes = (last.t - first.t) / 60000;
      if (minutes < 1) return null;
      var growth = (last.mb - first.mb) / minutes;
      if (growth < THRESHOLDS.heapGrowthMbPerMin) return null;
      return {
        id: 'heap-growth',
        severity: growth > THRESHOLDS.heapGrowthMbPerMin * 2 ? 'critical' : 'warn',
        metric: 'heap MB/min',
        value: Math.round(growth * 10) / 10,
        threshold: THRESHOLDS.heapGrowthMbPerMin,
        why:
          'JS heap grew ' +
          Math.round(growth * 10) / 10 +
          'MB per minute over ' +
          Math.round(minutes) +
          ' minutes. webOS never reclaims this until the app is killed.',
        suggestion:
          'Check the caches with FIFO caps (urlCache, qualityCache, requestQueue) and confirm every destroy() path disconnects its observers and clears its listener map.'
      };
    },

    function featureStalls() {
      if (!lastSweep) return null;
      var stalled = [];
      for (var i = 0; i < lastSweep.features.length; i++) {
        var f = lastSweep.features[i];
        if (f.state === 'stalled') stalled.push(f);
      }
      if (!stalled.length) return null;
      return {
        id: 'feature-stalled',
        severity: 'warn',
        metric: 'stalled features',
        value: stalled.length,
        threshold: 0,
        why:
          stalled
            .map(function (f) {
              return f.label + ' (' + f.module + '): ' + f.detail;
            })
            .join(' | '),
        suggestion:
          'These options are enabled and in scope but produced no observable effect. Verify the selector or schema path each one depends on still matches this YouTube build.'
      };
    }
  ];

  function findBottlenecks() {
    var out = [];
    for (var i = 0; i < RULES.length; i++) {
      var r = safe(RULES[i], 'rule#' + i);
      if (r) out.push(r);
    }
    out.sort(function (a, b) {
      var rank = { critical: 0, warn: 1, info: 2 };
      return (rank[a.severity] || 3) - (rank[b.severity] || 3);
    });
    return out;
  }

  // ===================================================================
  // 18. MACHINE-READABLE REPORT
  // ===================================================================

  function buildReport() {
    var t = now();
    var mods = [];
    for (var m in moduleMeters) {
      if (!Object.prototype.hasOwnProperty.call(moduleMeters, m)) continue;
      var mm = moduleMeters[m];
      mods.push({
        module: m,
        calls: mm.count,
        totalMs: Math.round(mm.total * 10) / 10,
        msPerSec2s: Math.round((mm.window(2000).ms / 2) * 10) / 10,
        maxMs: Math.round(mm.max * 100) / 100
      });
    }
    mods.sort(function (a, b) {
      return b.msPerSec2s - a.msPerSec2s || b.totalMs - a.totalMs;
    });

    var obs = [];
    for (var i = 0; i < STATS.observers.length; i++) {
      var o = STATS.observers[i];
      if (!o.origin.ours) continue;
      obs.push({
        kind: o.kind,
        module: o.origin.module,
        callback: o.origin.fn,
        watching: o.targets.join(','),
        options: o.options,
        connected: o.connected,
        records: o.records,
        maxBatch: o.maxBatch,
        callbackMs: Math.round(o.meter.total * 10) / 10,
        msPerSec2s: Math.round((o.meter.window(2000).ms / 2) * 10) / 10
      });
    }
    obs.sort(function (a, b) {
      return b.msPerSec2s - a.msPerSec2s;
    });

    var timers = [];
    for (var id in STATS.timers.active) {
      var tm = STATS.timers.active[id];
      if (!tm.origin.ours) continue;
      timers.push({ module: tm.origin.module, fn: tm.origin.fn, everyMs: tm.delay });
    }

    var channels = {};
    for (var cName in STATS.net.byChannel) {
      var c = STATS.net.byChannel[cName];
      channels[cName] = {
        count: c.count,
        perSec5s: Math.round(c.counter.rate(5000) * 10) / 10,
        avgMs: Math.round(c.meter.avg() * 10) / 10,
        maxMs: Math.round(c.meter.max),
        errors: c.errors
      };
    }

    var parseTypes = {};
    for (var pt in STATS.json.byType) {
      var b = STATS.json.byType[pt];
      parseTypes[pt] = {
        count: b.count,
        avgKB: b.count ? Math.round(b.bytes / b.count / 1024) : 0,
        nativeMs: Math.round(b.native.total * 10) / 10,
        hookMs: Math.round(b.hook.total * 10) / 10,
        worstHookMs: Math.round(b.hook.max * 10) / 10
      };
    }

    var features = evaluateAll(STATS.page).map(function (f) {
      return {
        key: f.key,
        label: f.label,
        module: f.module,
        enabled: f.enabled,
        state: f.state,
        detail: f.detail,
        data: f.data || undefined
      };
    });

    return {
      schema: 'ytaf-perfmon/2',
      generatedAt: new Date().toISOString(),
      uptimeSec: Math.round((t - BOOT) / 100) / 10,
      runtime: {
        page: STATS.page,
        pageAgeSec: Math.round((t - STATS.pageSince) / 100) / 10,
        navigations: STATS.navCount,
        userAgent: navigator.userAgent,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        bundleUrl: OWN_URL || 'unknown',
        evalHosted: EVAL_HOSTED,
        ownTag: OWN_TAG || null
      },
      // How far to trust the numbers above. An eval-hosted bundle kills
      // URL-based attribution; a coarse clock floors small per-call timings to
      // zero. Both change how a reading should be interpreted, so they travel
      // with the data rather than living in a README.
      instrumentation: {
        clockResolutionMs: Math.round(CLOCK_RES_MS * 1000) / 1000,
        subResolutionTiming: CLOCK_RES_MS >= 0.05,
        urlAttribution: !!OWN_URL,
        // If nothing hooked between our inner and outer probes, a 0.00ms
        // filtering cost means the mod is not intercepting at all — a very
        // different story from "the filter is cheap".
        jsonSandwichIntact: parseChainHooked,
        sourceSignatureFallback: EVAL_HOSTED,
        rafIsVsyncLocked: STATS.fps > 0 && STATS.fps < 70,
        mainThreadLagMs: Math.round(STATS.lagMs * 10) / 10,
        beaconsSeen: STATS.net.beacons.count,
        boundBeforeInstrumentation: Object.keys(boundCopies)
      },

      vitals: {
        fps: STATS.fps,
        fpsTrustworthy: STATS.fps > 0 && STATS.fps < 70,
        mainThreadLagMs: Math.round(STATS.lagMs * 10) / 10,
        domNodes: STATS.domNodes,
        domNodesLight: STATS.domNodesLight,
        domNodesShadow: STATS.domNodesShadow,
        shadowRoots: STATS.shadowRoots,
        heapMB: STATS.heapMB || null,
        longTasks5s: STATS.longTaskMeter.window(5000).count,
        longTaskMs5s: Math.round(STATS.longTaskMeter.window(5000).ms),
        worstLongTaskMs: STATS.longTasks.length ? Math.round(STATS.longTasks[0].duration) : 0,
        monitorOverheadMsPerSec: Math.round(STATS.selfMeter.window(2000).ms / 2 * 100) / 100
      },
      config: cfg(),
      features: features,
      modules: mods,
      hotFunctions: topFunctions(12, 3000).map(function (f) {
        return {
          module: f.module,
          fn: f.fn,
          role: f.role,
          calls: f.calls,
          totalMs: Math.round(f.totalMs * 10) / 10,
          maxMs: Math.round(f.maxMs * 100) / 100,
          msPer3s: Math.round(f.recentMs * 10) / 10
        };
      }),
      observers: obs,
      intervals: timers,
      rafLoops: (function () {
        var out = [];
        for (var k in STATS.raf.loops) {
          var l = STATS.raf.loops[k];
          out.push({
            module: l.origin.module,
            fn: l.origin.fn,
            frames: l.frames,
            fps: Math.round(l.counter.rate(2000)),
            msPerSec2s: Math.round((l.meter.window(2000).ms / 2) * 10) / 10
          });
        }
        return out;
      })(),
      json: {
        parses: STATS.json.parseCount,
        totalMB: Math.round((STATS.json.parseBytes / 1048576) * 100) / 100,
        nativeMs: Math.round(STATS.json.nativeMeter.total),
        hookMs: Math.round(STATS.json.hookMeter.total),
        hookMsPerSec: Math.round(STATS.json.hookMeter.window(1000).ms),
        byResponseType: parseTypes,
        stringifyClones: STATS.json.stringifyPatched
      },
      network: { channels: channels, slowest: STATS.net.slow, inFlight: STATS.net.inFlight },
      dom: {
        querySelectorPerSec: Math.round(STATS.dom.querySelector.rate(2000)),
        querySelectorAllPerSec: Math.round(STATS.dom.querySelectorAll.rate(2000)),
        layoutReadsPerSec: Math.round(STATS.layout.rect.rate(2000)),
        computedStylePerSec: Math.round(STATS.layout.computedStyle.rate(2000))
      },
      lastSweep: lastSweep,
      bottlenecks: findBottlenecks(),
      coverage: coverage()
    };
  }

  function coverage() {
    var registered = 0;
    for (var k in registryIndex) if (Object.prototype.hasOwnProperty.call(registryIndex, k)) registered++;
    var observed = [];
    var unregistered = [];
    for (var key in ledger) {
      if (!Object.prototype.hasOwnProperty.call(ledger, key)) continue;
      var e = ledger[key];
      if (!e.origin.ours) continue;
      observed.push(key);
      if (!registryIndex[e.origin.fn]) unregistered.push(key);
    }
    return {
      registeredFunctions: registered,
      observedFunctions: observed.length,
      unregistered: unregistered.slice(0, 40),
      note:
        'Coverage is function-level, not line-level. Functions reached only through direct ' +
        'internal calls (never via a hooked boundary or an instrumented prototype) stay invisible.'
    };
  }

  var lastReportAt = 0;
  var lastReportSignature = '';

  function emitReport(reason) {
    var report = buildReport();
    report.reason = reason || 'manual';
    lastReportAt = now();

    var crit = 0;
    for (var i = 0; i < report.bottlenecks.length; i++) {
      if (report.bottlenecks[i].severity === 'critical') crit++;
    }

    safe(function () {
      var head =
        '%c[PERF-MON] ' +
        report.runtime.page.toUpperCase() +
        ' report — ' +
        report.bottlenecks.length +
        ' finding(s), ' +
        crit +
        ' critical';
      var style = 'color:' + (crit ? '#ff2d20' : report.bottlenecks.length ? '#ffb648' : '#3ee08a') + ';font-weight:bold';
      (console.group || console.log).call(console, head, style);

      for (var i = 0; i < report.bottlenecks.length; i++) {
        var b = report.bottlenecks[i];
        console.log(
          (b.severity === 'critical' ? '[CRITICAL] ' : '[WARN] ') +
            b.id +
            ' — ' +
            b.metric +
            '=' +
            b.value +
            ' (limit ' +
            b.threshold +
            ')\n  why: ' +
            b.why +
            '\n  fix: ' +
            b.suggestion
        );
      }

      console.log('--- BEGIN PERF-MON JSON (paste this to an agent) ---');
      console.log(nativeStringify(report));
      console.log('--- END PERF-MON JSON ---');
      if (console.groupEnd) console.groupEnd();
    }, 'emitReport');

    return report;
  }

  function maybeEmitReport(reason) {
    if (!OPTIONS.autoReport) return;
    if (now() - lastReportAt < OPTIONS.autoReportCooldownMs) return;
    var b = findBottlenecks();
    if (!b.length) return;
    var sig = b
      .map(function (x) {
        return x.id + ':' + x.severity;
      })
      .join('|');
    if (sig === lastReportSignature && now() - lastReportAt < OPTIONS.autoReportCooldownMs * 3) return;
    lastReportSignature = sig;
    emitReport(reason || 'threshold');
  }

  // ===================================================================
  // 19. VITALS
  // ===================================================================

  function installVitals() {
    // ---- frame rate: uses the native rAF so the monitor never counts itself
    var frames = 0;
    var lastT = now();
    var lastFrame = now();
    var loop = function () {
      frames++;
      var t = now();
      STATS.frameMs = t - lastFrame;
      lastFrame = t;
      if (t - lastT >= 1000) {
        STATS.fps = Math.round((frames * 1000) / (t - lastT));
        STATS.frames += frames;
        frames = 0;
        lastT = t;
      }
      nativeRaf(loop);
    };
    nativeRaf(loop);

    // ---- main-thread lag
    // On this webOS build rAF is not vsync-locked (it reports 250fps+, i.e. a
    // ~4ms timer), so frame rate says nothing about smoothness. Scheduler drift
    // does: schedule a 100ms timer and measure how late it actually lands.
    (function lagProbe() {
      var due = now() + 100;
      nativeSetTimeout(function () {
        var late = now() - due;
        STATS.lagMs = STATS.lagMs * 0.7 + (late > 0 ? late : 0) * 0.3;
        lagProbe();
      }, 100);
    })();

    // ---- long tasks
    safe(function () {
      if (typeof PerformanceObserver !== 'function') return;
      var po = new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          STATS.longTaskMeter.add(e.duration);
          var attribution = '';
          if (e.attribution && e.attribution.length) {
            attribution = e.attribution[0].name || e.attribution[0].containerType || '';
          }
          // Name the likeliest culprit from our own ledger in the same window.
          var top = topFunctions(1, 300)[0];
          STATS.longTasks.push({
            duration: e.duration,
            at: Date.now(),
            attribution: attribution,
            suspect: top ? top.key : null
          });
          STATS.longTasks.sort(function (a, b) {
            return b.duration - a.duration;
          });
          if (STATS.longTasks.length > 8) STATS.longTasks.pop();
        }
      });
      po.observe({ type: 'longtask', buffered: true });
    }, 'longtask');

    // ---- heap + DOM size, sampled
    nativeSetInterval(function () {
      safe(function () {
        if (perfObj.memory && perfObj.memory.usedJSHeapSize) {
          STATS.heapMB = Math.round(perfObj.memory.usedJSHeapSize / 1048576);
          STATS.heapSamples.push({ t: Date.now(), mb: STATS.heapMB });
          if (STATS.heapSamples.length > 60) STATS.heapSamples.shift();
        }
      }, 'heap');
    }, 5000);

    // ---- page transitions
    nativeSetInterval(checkPage, 400);
    suppressListenerWrap = true;
    window.addEventListener('hashchange', function () {
      nativeSetTimeout(checkPage, 50);
    });
    suppressListenerWrap = false;
  }

  // ===================================================================
  // 20. INSTRUMENT CLUSTER
  //
  //   Design brief: a night-drive cluster. Warm tungsten backlight in a
  //   deep well, a red needle, and a redline that means something literal —
  //   past it, the mod is eating more than a frame's worth of budget per
  //   second. Signature: the ignition sweep. A real cluster slams every
  //   needle to full and back when you turn the key; so does this one, and
  //   it doubles as a self-test that the render path works.
  // ===================================================================

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ui = {
    root: null,
    visible: false,
    tab: 0,
    scroll: 0,
    gauges: {},
    lamps: {},
    listEl: null,
    headEl: null,
    subEl: null,
    ignition: 0
  };

  var TABS = ['ENGINE', 'FEATURES', 'FUNCTIONS', 'SYSTEMS'];

  /**
   * All elements are created here so they can all carry the
   * `twemoji-injected` marker: emoji-font.js treats that class as "already
   * processed" and skips the subtree, which keeps the monitor out of the
   * observer it is measuring.
   */
  function el(tag, styles, text) {
    var e = document.createElement(tag);
    e.className = 'twemoji-injected ytaf-perf';
    if (styles) {
      for (var k in styles) {
        if (Object.prototype.hasOwnProperty.call(styles, k)) e.style[k] = styles[k];
      }
    }
    if (text != null) e.textContent = text;
    return e;
  }

  function svg(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  var GAUGE_START = 150;
  var GAUGE_SWEEP = 240;

  function polar(cx, cy, r, deg) {
    var rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arcPath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0);
    var p1 = polar(cx, cy, r, a1);
    var large = a1 - a0 > 180 ? 1 : 0;
    return 'M ' + p0.x.toFixed(1) + ' ' + p0.y.toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1);
  }

  /**
   * @param {object} o {size, label, unit, max, redFrom, invert}
   *   invert: low values are the problem (used for FPS)
   */
  function makeGauge(o) {
    var size = o.size;
    var cx = size / 2;
    var cy = size / 2;
    var r = size / 2 - 10;

    var root = svg('svg', {
      width: size,
      height: size,
      viewBox: '0 0 ' + size + ' ' + size
    });

    root.appendChild(
      svg('circle', { cx: cx, cy: cy, r: r + 6, fill: C.bezel, stroke: C.bezelLine, 'stroke-width': 1 })
    );
    root.appendChild(
      svg('path', {
        d: arcPath(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP),
        fill: 'none',
        stroke: C.tungstenDim,
        'stroke-width': 2
      })
    );

    // redline arc
    var redStart = GAUGE_START + (o.redFrom / o.max) * GAUGE_SWEEP;
    var redA = o.invert ? GAUGE_START : redStart;
    var redB = o.invert ? redStart : GAUGE_START + GAUGE_SWEEP;
    root.appendChild(
      svg('path', {
        d: arcPath(cx, cy, r, redA, redB),
        fill: 'none',
        stroke: C.needle,
        'stroke-width': 3,
        opacity: '0.75'
      })
    );

    // ticks
    for (var i = 0; i <= 10; i++) {
      var a = GAUGE_START + (i / 10) * GAUGE_SWEEP;
      var major = i % 2 === 0;
      var p1 = polar(cx, cy, r - 2, a);
      var p2 = polar(cx, cy, r - (major ? 11 : 6), a);
      root.appendChild(
        svg('line', {
          x1: p1.x.toFixed(1),
          y1: p1.y.toFixed(1),
          x2: p2.x.toFixed(1),
          y2: p2.y.toFixed(1),
          stroke: major ? C.tungsten : C.tungstenDim,
          'stroke-width': major ? 2 : 1
        })
      );
    }

    var needle = svg('g');
    var nLine = svg('line', {
      x1: cx - r * 0.16,
      y1: cy,
      x2: cx + r * 0.8,
      y2: cy,
      stroke: C.needle,
      'stroke-width': 3,
      'stroke-linecap': 'round'
    });
    needle.appendChild(nLine);
    root.appendChild(needle);
    root.appendChild(svg('circle', { cx: cx, cy: cy, r: 5, fill: C.bezelLine, stroke: C.tungsten, 'stroke-width': 1 }));

    var value = svg('text', {
      x: cx,
      y: cy + r * 0.46,
      'text-anchor': 'middle',
      fill: C.ink,
      'font-family': FONT_DATA,
      'font-size': Math.round(size * 0.17),
      'font-weight': 'bold'
    });
    value.textContent = '0';
    root.appendChild(value);

    var unit = svg('text', {
      x: cx,
      y: cy + r * 0.66,
      'text-anchor': 'middle',
      fill: C.inkDim,
      'font-family': FONT_UI,
      'font-size': Math.round(size * 0.085),
      'letter-spacing': '1.5'
    });
    unit.textContent = o.unit || '';
    root.appendChild(unit);

    var label = svg('text', {
      x: cx,
      y: size - 2,
      'text-anchor': 'middle',
      fill: C.tungsten,
      'font-family': FONT_UI,
      'font-size': Math.round(size * 0.095),
      'letter-spacing': '2'
    });
    label.textContent = o.label;
    root.appendChild(label);

    return {
      el: root,
      set: function (v, displayText) {
        var frac = clamp(v / o.max, 0, 1);
        var deg = GAUGE_START + frac * GAUGE_SWEEP;
        needle.setAttribute('transform', 'rotate(' + deg.toFixed(1) + ' ' + cx + ' ' + cy + ')');
        var over = o.invert ? v < o.redFrom : v > o.redFrom;
        nLine.setAttribute('stroke', over ? C.alarm : C.needle);
        value.setAttribute('fill', over ? C.alarm : C.ink);
        value.textContent = displayText != null ? displayText : String(Math.round(v));
      }
    };
  }

  function makeLamp(label) {
    var box = el('div', {
      display: 'inline-block',
      padding: '3px 7px',
      margin: '0 4px 4px 0',
      border: '1px solid ' + C.bezelLine,
      borderRadius: '3px',
      fontFamily: FONT_UI,
      fontSize: '13px',
      letterSpacing: '1px',
      color: C.idle,
      background: 'rgba(255,255,255,0.02)'
    });
    box.textContent = label;
    return box;
  }

  var LAMP_COLORS = {
    firing: [C.live, 'rgba(62,224,138,0.12)'],
    armed: [C.tungsten, 'rgba(255,182,72,0.10)'],
    degraded: [C.warn, 'rgba(255,204,0,0.14)'],
    stalled: [C.alarm, 'rgba(255,45,32,0.16)'],
    error: [C.alarm, 'rgba(255,45,32,0.16)'],
    idle: [C.idle, 'transparent'],
    off: ['#39414d', 'transparent']
  };

  function buildUI() {
    if (ui.root) return;
    if (!document.body) return;

    var root = el('div', {
      position: 'fixed',
      top: '24px',
      right: '24px',
      width: '640px',
      maxHeight: '86vh',
      background: C.well,
      border: '1px solid ' + C.bezelLine,
      borderRadius: '10px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      color: C.ink,
      fontFamily: FONT_UI,
      zIndex: '2147483000',
      pointerEvents: 'none',
      overflow: 'hidden',
      display: 'none'
    });

    // --- header
    var head = el('div', {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: '1px solid ' + C.bezelLine,
      background: 'linear-gradient(180deg, rgba(255,182,72,0.07), transparent)'
    });
    var title = el(
      'div',
      { fontSize: '17px', letterSpacing: '3px', color: C.tungsten, fontWeight: 'bold' },
      'YTAF ENGINE DIAGNOSTICS'
    );
    var pageBadge = el('div', { fontSize: '14px', letterSpacing: '2px', color: C.ink });
    head.appendChild(title);
    head.appendChild(pageBadge);
    root.appendChild(head);
    ui.headEl = pageBadge;

    // --- gauges
    var gaugeRow = el('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '8px 10px 2px'
    });
    ui.gauges.load = makeGauge({
      size: 168,
      label: 'MOD LOAD',
      unit: 'MS / SEC',
      max: 500,
      redFrom: 250
    });
    ui.gauges.fps = makeGauge({ size: 118, label: 'FRAMES', unit: 'FPS', max: 60, redFrom: 30, invert: true });
    ui.gauges.dom = makeGauge({ size: 118, label: 'DOM', unit: 'NODES', max: 12000, redFrom: 6000 });
    gaugeRow.appendChild(ui.gauges.load.el);
    gaugeRow.appendChild(ui.gauges.fps.el);
    gaugeRow.appendChild(ui.gauges.dom.el);
    root.appendChild(gaugeRow);

    // --- digital strip
    var strip = el('div', {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 16px 8px',
      fontFamily: FONT_DATA,
      fontSize: '12px',
      color: C.inkDim
    });
    ui.strip = {};
    ['HEAP', 'NET', 'BLOCK', 'PARSE', 'SELF'].forEach(function (k) {
      var cell = el('div', { textAlign: 'center', minWidth: '92px' });
      var lab = el('div', { color: C.inkDim, fontSize: '10px', letterSpacing: '1.5px' }, k);
      var val = el('div', { color: C.ink, fontSize: '14px' }, '--');
      cell.appendChild(lab);
      cell.appendChild(val);
      strip.appendChild(cell);
      ui.strip[k] = val;
    });
    root.appendChild(strip);

    // --- shift lights
    var lampRow = el('div', {
      padding: '6px 14px 8px',
      borderTop: '1px solid ' + C.bezelLine,
      borderBottom: '1px solid ' + C.bezelLine
    });
    var list = allFeatures();
    for (var i = 0; i < list.length; i++) {
      var lamp = makeLamp(list[i].lamp);
      ui.lamps[list[i].label] = lamp;
      lampRow.appendChild(lamp);
    }
    root.appendChild(lampRow);

    // --- tabs
    var tabRow = el('div', { display: 'flex', padding: '8px 14px 4px', gap: '18px' });
    ui.tabEls = [];
    for (var t = 0; t < TABS.length; t++) {
      var tb = el('div', { fontSize: '14px', letterSpacing: '2px', color: C.idle }, TABS[t]);
      tabRow.appendChild(tb);
      ui.tabEls.push(tb);
    }
    root.appendChild(tabRow);

    // --- content
    var content = el('div', {
      padding: '6px 14px 14px',
      fontFamily: FONT_DATA,
      fontSize: '13px',
      lineHeight: '1.45',
      overflow: 'hidden'
    });
    root.appendChild(content);
    ui.listEl = content;

    var foot = el(
      'div',
      {
        padding: '6px 14px 10px',
        fontSize: '11px',
        color: C.inkDim,
        letterSpacing: '1px',
        borderTop: '1px solid ' + C.bezelLine
      },
      'YELLOW close   \u25C0 \u25B6 tab   \u25B2 \u25BC scroll   OK report to console'
    );
    root.appendChild(foot);

    document.body.appendChild(root);
    ui.root = root;
  }

  function setRow(container, cells) {
    var row = el('div', { display: 'flex', justifyContent: 'space-between', gap: '10px' });
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var d = el(
        'div',
        {
          color: c.color || C.ink,
          flex: c.flex || '1',
          textAlign: c.align || 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        },
        c.text
      );
      row.appendChild(d);
    }
    container.appendChild(row);
    return row;
  }

  function renderEngine(c) {
    var mods = [];
    for (var m in moduleMeters) {
      if (!Object.prototype.hasOwnProperty.call(moduleMeters, m)) continue;
      mods.push({ m: m, per: moduleMeters[m].window(2000).ms / 2, tot: moduleMeters[m].total, n: moduleMeters[m].count });
    }
    mods.sort(function (a, b) {
      return b.per - a.per || b.tot - a.tot;
    });

    setRow(c, [
      { text: 'MODULE', color: C.tungsten, flex: '2' },
      { text: 'MS/S', color: C.tungsten, align: 'right' },
      { text: 'TOTAL', color: C.tungsten, align: 'right' },
      { text: 'CALLS', color: C.tungsten, align: 'right' }
    ]);
    if (!mods.length) {
      setRow(c, [{ text: 'No instrumented module work observed yet.', color: C.inkDim, flex: '4' }]);
    }
    for (var i = 0; i < Math.min(mods.length, 7); i++) {
      var r = mods[i];
      var hot = r.per > THRESHOLDS.moduleBudgetMsPerSec;
      setRow(c, [
        { text: r.m, color: hot ? C.alarm : C.ink, flex: '2' },
        { text: r.per.toFixed(1), color: hot ? C.alarm : C.live, align: 'right' },
        { text: fmtMs(r.tot), align: 'right', color: C.inkDim },
        { text: String(r.n), align: 'right', color: C.inkDim }
      ]);
    }

    c.appendChild(el('div', { height: '8px' }));
    var b = findBottlenecks();
    setRow(c, [
      { text: b.length ? 'FINDINGS (' + b.length + ')' : 'NO FINDINGS', color: b.length ? C.alarm : C.live, flex: '4' }
    ]);
    for (var j = 0; j < Math.min(b.length, 4); j++) {
      setRow(c, [
        {
          text:
            (b[j].severity === 'critical' ? '\u25B2 ' : '\u25B3 ') +
            b[j].id +
            ' — ' +
            b[j].metric +
            ' ' +
            b[j].value,
          color: b[j].severity === 'critical' ? C.alarm : C.warn,
          flex: '4'
        }
      ]);
      setRow(c, [{ text: '   ' + trunc(b[j].why, 96), color: C.inkDim, flex: '4' }]);
    }
  }

  function renderFeatures(c) {
    var results = evaluateAllCached(1500);
    var visible = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].state !== 'off') visible.push(results[i]);
    }
    var start = clamp(ui.scroll, 0, Math.max(0, visible.length - 8));
    setRow(c, [
      { text: 'FEATURE', color: C.tungsten, flex: '2' },
      { text: 'STATE', color: C.tungsten, flex: '1' },
      { text: 'PAGE ' + STATS.page.toUpperCase(), color: C.tungsten, flex: '1', align: 'right' }
    ]);
    for (var j = start; j < Math.min(visible.length, start + 8); j++) {
      var f = visible[j];
      var col = LAMP_COLORS[f.state] ? LAMP_COLORS[f.state][0] : C.ink;
      setRow(c, [
        { text: STATE_MARK[f.state] + ' ' + f.label, color: col, flex: '2' },
        { text: f.state, color: col, flex: '1' },
        { text: f.module, color: C.inkDim, flex: '1', align: 'right' }
      ]);
      setRow(c, [{ text: '   ' + trunc(f.detail, 100), color: C.inkDim, flex: '4' }]);
    }
    if (visible.length > 8) {
      setRow(c, [
        {
          text: 'showing ' + (start + 1) + '-' + Math.min(visible.length, start + 8) + ' of ' + visible.length + '  (\u25B2\u25BC)',
          color: C.inkDim,
          flex: '4'
        }
      ]);
    }
  }

  function renderFunctions(c) {
    var fns = topFunctions(40, 3000);
    var start = clamp(ui.scroll, 0, Math.max(0, fns.length - 10));
    setRow(c, [
      { text: 'FUNCTION', color: C.tungsten, flex: '2' },
      { text: 'MS/3S', color: C.tungsten, align: 'right' },
      { text: 'MAX', color: C.tungsten, align: 'right' },
      { text: 'CALLS', color: C.tungsten, align: 'right' }
    ]);
    if (!fns.length) {
      setRow(c, [
        { text: 'Nothing charged yet. Navigate the app to generate traffic.', color: C.inkDim, flex: '4' }
      ]);
      return;
    }
    for (var i = start; i < Math.min(fns.length, start + 10); i++) {
      var f = fns[i];
      var hot = f.recentMs > 30 || f.maxMs > THRESHOLDS.longTaskMs;
      setRow(c, [
        { text: f.fn + '  ' + trunc(f.module, 18), color: hot ? C.alarm : C.ink, flex: '2' },
        { text: f.recentMs.toFixed(1), color: hot ? C.alarm : C.live, align: 'right' },
        { text: f.maxMs.toFixed(1), color: C.inkDim, align: 'right' },
        { text: String(f.calls), color: C.inkDim, align: 'right' }
      ]);
      if (f.role) setRow(c, [{ text: '   ' + trunc(f.role, 100), color: C.inkDim, flex: '4' }]);
    }
  }

  function renderSystems(c) {
    setRow(c, [{ text: 'OBSERVERS', color: C.tungsten, flex: '4' }]);
    var obs = [];
    for (var i = 0; i < STATS.observers.length; i++) {
      if (STATS.observers[i].origin.ours) obs.push(STATS.observers[i]);
    }
    obs.sort(function (a, b) {
      return b.meter.window(2000).ms - a.meter.window(2000).ms;
    });
    if (!obs.length) setRow(c, [{ text: '  none registered by the mod', color: C.inkDim, flex: '4' }]);
    for (var j = 0; j < Math.min(obs.length, 5); j++) {
      var o = obs[j];
      var per = o.meter.window(2000).ms / 2;
      setRow(c, [
        {
          text: (o.connected ? '\u25CF ' : '\u25CB ') + o.origin.module + ' [' + trunc(o.options || 'n/a', 28) + ']',
          color: per > 25 ? C.alarm : C.ink,
          flex: '3'
        },
        { text: per.toFixed(1) + ' ms/s', color: per > 25 ? C.alarm : C.live, flex: '1', align: 'right' }
      ]);
      setRow(c, [
        { text: '   watching ' + trunc(o.targets.join(','), 40) + '  ' + o.records + ' records, max batch ' + o.maxBatch, color: C.inkDim, flex: '4' }
      ]);
    }

    c.appendChild(el('div', { height: '6px' }));
    setRow(c, [{ text: 'NETWORK', color: C.tungsten, flex: '4' }]);
    var names = [];
    for (var n in STATS.net.byChannel) names.push(n);
    names.sort(function (a, b) {
      return STATS.net.byChannel[b].count - STATS.net.byChannel[a].count;
    });
    for (var k = 0; k < Math.min(names.length, 5); k++) {
      var ch = STATS.net.byChannel[names[k]];
      setRow(c, [
        { text: names[k], flex: '2' },
        { text: ch.count + ' reqs', color: C.inkDim, align: 'right' },
        { text: ch.counter.rate(5000).toFixed(1) + '/s', color: C.live, align: 'right' },
        { text: 'avg ' + fmtMs(ch.meter.avg()), color: C.inkDim, align: 'right' }
      ]);
    }

    c.appendChild(el('div', { height: '6px' }));
    setRow(c, [{ text: 'JSON RESPONSES', color: C.tungsten, flex: '4' }]);
    var types = [];
    for (var tName in STATS.json.byType) types.push(tName);
    types.sort(function (a, b) {
      return STATS.json.byType[b].hook.total - STATS.json.byType[a].hook.total;
    });
    if (!types.length) setRow(c, [{ text: '  no classified responses yet', color: C.inkDim, flex: '4' }]);
    for (var m = 0; m < Math.min(types.length, 5); m++) {
      var bkt = STATS.json.byType[types[m]];
      setRow(c, [
        { text: types[m], flex: '2' },
        { text: bkt.count + 'x', color: C.inkDim, align: 'right' },
        { text: 'native ' + fmtMs(bkt.native.total), color: C.inkDim, align: 'right' },
        { text: 'hook ' + fmtMs(bkt.hook.total), color: bkt.hook.total > bkt.native.total ? C.alarm : C.live, align: 'right' }
      ]);
    }
  }

  function updateUI() {
    if (!ui.visible || !ui.root) return;
    var t0 = now();

    safe(function () {
      // --- header
      var upt = Math.round((now() - BOOT) / 1000);
      ui.headEl.textContent = STATS.page.toUpperCase() + '  \u2022  ' + upt + 's  \u2022  nav ' + STATS.navCount;

      // --- gauges
      var modLoad = 0;
      for (var m in moduleMeters) {
        if (Object.prototype.hasOwnProperty.call(moduleMeters, m)) {
          modLoad += moduleMeters[m].window(2000).ms / 2;
        }
      }
      // Ignition self-test: slam every needle to full and let it fall back to
      // the real reading, the way a cluster does when you turn the key. It
      // also proves the render path works before you trust a number on it.
      if (ui.ignition > 0) {
        var phase = clamp(ui.ignition, 0, 1);
        ui.gauges.load.set(500 * phase, '\u2014');
        ui.gauges.fps.set(60 * phase, '\u2014');
        ui.gauges.dom.set(12000 * phase, '\u2014');
        ui.ignition -= 0.34;
      } else {
        ui.gauges.load.set(modLoad, modLoad.toFixed(0));
        ui.gauges.fps.set(STATS.fps, String(STATS.fps));
        ui.gauges.dom.set(STATS.domNodes, String(STATS.domNodes));
      }

      // --- digital strip
      ui.strip.HEAP.textContent = STATS.heapMB ? STATS.heapMB + ' MB' : 'n/a';
      ui.strip.NET.textContent = STATS.net.inFlight + ' live';
      ui.strip.BLOCK.textContent = Math.round(STATS.longTaskMeter.window(5000).ms) + ' ms/5s';
      ui.strip.PARSE.textContent = Math.round(STATS.json.hookMeter.window(1000).ms) + ' ms/s';
      ui.strip.SELF.textContent = (STATS.selfMeter.window(2000).ms / 2).toFixed(2) + ' ms/s';
      ui.strip.BLOCK.style.color =
        STATS.longTaskMeter.window(5000).ms > 500 ? C.alarm : C.ink;
      ui.strip.PARSE.style.color =
        STATS.json.hookMeter.window(1000).ms > THRESHOLDS.parseHookMsPerSec ? C.alarm : C.ink;

      // --- shift lights
      var results = evaluateAllCached(1500);
      for (var i = 0; i < results.length; i++) {
        var f = results[i];
        var lamp = ui.lamps[f.label];
        if (!lamp) continue;
        var pair = LAMP_COLORS[f.state] || LAMP_COLORS.idle;
        lamp.style.color = pair[0];
        lamp.style.background = pair[1];
        lamp.style.borderColor = f.state === 'stalled' || f.state === 'degraded' ? pair[0] : C.bezelLine;
      }

      // --- tabs
      for (var t = 0; t < ui.tabEls.length; t++) {
        ui.tabEls[t].style.color = t === ui.tab ? C.tungsten : C.idle;
        ui.tabEls[t].style.borderBottom = t === ui.tab ? '2px solid ' + C.tungsten : '2px solid transparent';
      }

      // --- content
      var c = ui.listEl;
      c.textContent = '';
      if (ui.tab === 0) renderEngine(c);
      else if (ui.tab === 1) renderFeatures(c);
      else if (ui.tab === 2) renderFunctions(c);
      else renderSystems(c);
    }, 'updateUI');

    STATS.selfMeter.add(now() - t0);
  }

  var uiTimer = null;

  function show() {
    buildUI();
    if (!ui.root) {
      console.warn('[PERF] cannot show the cluster before <body> exists.');
      return;
    }
    ui.visible = true;
    ui.root.style.display = 'block';
    if (OPTIONS.ignitionSweep) ui.ignition = 1;
    if (!uiTimer) uiTimer = nativeSetInterval(updateUI, Math.round(1000 / OPTIONS.uiHz));
    updateUI();
  }

  function hide() {
    ui.visible = false;
    if (ui.root) ui.root.style.display = 'none';
    if (uiTimer) {
      nativeClearInterval(uiTimer);
      uiTimer = null;
    }
  }

  function toggle() {
    if (ui.visible) hide();
    else show();
  }

  // ===================================================================
  // 21. REMOTE
  //     YELLOW is unbound in config.js (only red/green/blue are mapped), so
  //     it is safe to claim. screensaver-fix.js synthesises YELLOW every 30s
  //     on Shorts, so we require a trusted event.
  // ===================================================================

  var YELLOW_CODES = { 405: 1, 170: 1 };

  function installRemote() {
    suppressListenerWrap = true;
    document.addEventListener(
      'keydown',
      function (evt) {
        var code = evt.keyCode || evt.charCode;

        if (YELLOW_CODES[code]) {
          if (evt.isTrusted === false) {
            // screensaver-fix synthesises YELLOW every 30s to keep the panel
            // awake. Not a user press — but it is direct proof the keep-alive
            // is alive, which no attribution signal can give us.
            STATS.syntheticYellow++;
            return;
          }
          evt.preventDefault();
          evt.stopPropagation();
          toggle();
          return false;
        }

        if (!ui.visible) return;

        if (code === 37 || code === 39) {
          ui.tab = (ui.tab + (code === 39 ? 1 : TABS.length - 1)) % TABS.length;
          ui.scroll = 0;
        } else if (code === 38) {
          ui.scroll = Math.max(0, ui.scroll - 1);
        } else if (code === 40) {
          ui.scroll = ui.scroll + 1;
        } else if (code === 13) {
          emitReport('manual (OK key)');
        } else if (code === 461 || code === 27) {
          hide();
        } else {
          return;
        }

        evt.preventDefault();
        evt.stopPropagation();
        updateUI();
        return false;
      },
      true
    );
    suppressListenerWrap = false;
  }

  // ===================================================================
  // 22. BOOT
  // ===================================================================

  // Inner probes must be installed synchronously, before any other module
  // in the bundle has a chance to capture a reference to JSON.parse.
  installInnerJsonProbe();
  installObserverProbes();
  installTimerProbes();
  installDomProbes();
  installEventProbes();
  installNetworkProbes();

  var domTick = 0;

  function boot() {
    installVitals();
    installRemote();
    pollForPrototypes();

    nativeSetInterval(function () {
      safe(function () {
        domTick++;
        if (domTick % OPTIONS.domCountEveryNTicks === 0) {
          countDom();
        }
        // Toggling Ad Blocking in settings re-runs initAdblock(), which
        // captures whatever JSON.parse currently is and installs itself on
        // top — putting the mod outside our measurement. Re-arm when we
        // notice we have been displaced.
        if (outerParseRef && JSON.parse !== outerParseRef) {
          console.info('[PERF] JSON.parse was re-hooked downstream; re-arming the outer probe.');
          installOuterJsonProbe();
        }
        maybeEmitReport('periodic');
      }, 'tick');
    }, 1000);

    onPageChange(function (page, prev) {
      console.info('[PERF] page ' + prev + ' \u2192 ' + page + '; sweeping in ' + OPTIONS.sweepDelayMs + 'ms');
      nativeSetTimeout(function () {
        safe(function () {
          runSweep(page, 'navigation from ' + prev);
        }, 'sweep');
      }, OPTIONS.sweepDelayMs);
      // Force Max Quality waits for PLAYING, the dislike panel mounts with the
      // description, SponsorBlock needs segments back from the network. At
      // 1.2s all three look stalled; at 6s the verdict is real. Only the later
      // sweep is allowed to raise an alarm.
      nativeSetTimeout(function () {
        safe(function () {
          if (STATS.page !== page) return;
          runSweep(page, 'settled (' + Math.round(OPTIONS.lateSweepMs / 1000) + 's after ' + page + ')');
        }, 'lateSweep');
      }, OPTIONS.lateSweepMs);
    });

    checkPage();
    nativeSetTimeout(function () {
      safe(function () {
        runSweep(STATS.page, 'startup');
      }, 'startupSweep');
    }, 3000);

    if (OPTIONS.startVisible) show();

    console.info(
      '%c[PERF] YTAF engine diagnostics armed. YELLOW opens the cluster, __PERF.help() lists the API.',
      'color:#ffb648;font-weight:bold'
    );
  }

  // Outer probes go on last, once every other module in the bundle has
  // installed its own hooks — that is what makes the parse sandwich work.
  var armOuter = function () {
    safe(function () {
      installOuterJsonProbe();
    }, 'armOuter');
    safe(boot, 'boot');
  };

  if (typeof Promise === 'function') {
    Promise.resolve().then(function () {
      nativeSetTimeout(armOuter, 0);
    });
  } else {
    nativeSetTimeout(armOuter, 0);
  }

  // ===================================================================
  // 23. PUBLIC API
  // ===================================================================

  window.__PERF = {
    __installed: true,
    show: show,
    hide: hide,
    toggle: toggle,

    /** Full machine-readable snapshot, also printed to the console. */
    report: function (reason) {
      return emitReport(reason || 'manual');
    },
    /** Snapshot object without printing. */
    snapshot: buildReport,
    /** Re-run the feature expectation sweep right now. */
    sweep: function () {
      return runSweep(STATS.page, 'manual');
    },
    /** What every feature should be doing on this page, and whether it is. */
    features: function () {
      var r = evaluateAll(STATS.page);
      if (console.table) {
        console.table(
          r.map(function (f) {
            return { feature: f.label, module: f.module, state: f.state, detail: f.detail };
          })
        );
      } else {
        console.log(r);
      }
      return r;
    },
    /** Hottest instrumented functions in the last N ms. */
    functions: function (windowMs) {
      var f = topFunctions(30, windowMs || 3000);
      if (console.table) console.table(f);
      else console.log(f);
      return f;
    },
    /** Everything the monitor knows about the codebase. */
    registry: function () {
      return FUNCTION_REGISTRY;
    },
    /** Which registered functions have actually been seen running. */
    coverage: coverage,
    /** Current findings without printing the whole report. */
    bottlenecks: findBottlenecks,
    /** The config the monitor is reasoning about. */
    config: cfg,
    /** Live stat objects, for poking at in the console. */
    stats: STATS,
    ledger: ledger,
    /**
     * Definitive measurement of what the mod's JSON filtering actually costs.
     *
     * Per-call timings read 0.00ms on this platform because performance.now()
     * is coarsened to ~100us and a single parse finishes well inside that. A
     * loop of N parses takes milliseconds, which is far above the grain, so
     * benchmarking the hooked global against the captured native gives a real
     * per-call figure that the live counters cannot.
     */
    calibrate: function (samples, iterations) {
      var n = iterations || 200;
      var payloads = samples || lastPayloads.slice(0);
      if (!payloads.length) {
        console.warn('[PERF] no captured payloads yet — browse for a few seconds first.');
        return null;
      }
      var results = [];
      for (var p = 0; p < payloads.length; p++) {
        var text = payloads[p];
        var t0 = now();
        for (var i = 0; i < n; i++) nativeParse.call(JSON, text);
        var nativeMs = now() - t0;
        var t1 = now();
        for (var j = 0; j < n; j++) JSON.parse(text);
        var totalMs = now() - t1;
        results.push({
          kb: Math.round(text.length / 102.4) / 10,
          nativeUsPerCall: Math.round((nativeMs / n) * 1000),
          totalUsPerCall: Math.round((totalMs / n) * 1000),
          modUsPerCall: Math.round(((totalMs - nativeMs) / n) * 1000),
          overheadPct: nativeMs > 0 ? Math.round(((totalMs - nativeMs) / nativeMs) * 100) : null
        });
      }
      console.log('[PERF] calibration over ' + n + ' iterations per payload:');
      (console.table || console.log).call(console, results);
      var rate = STATS.json.totalMeter.window(5000).count / 5;
      if (rate > 0) {
        var avg = 0;
        for (var k = 0; k < results.length; k++) avg += results[k].modUsPerCall;
        avg = avg / results.length;
        console.log(
          '[PERF] at the current ' +
            rate.toFixed(1) +
            ' parses/s that is roughly ' +
            Math.round((avg * rate) / 1000) +
            'ms of filtering per second of wall clock.'
        );
      }
      return results;
    },

    /** Force a prototype-instrumentation pass (normally polled every 2s). */
    __wrapProtos: function () {
      for (var i = 0; i < protoTargets.length; i++) {
        var inst = window[protoTargets[i].global];
        if (inst && typeof inst === 'object') wrapPrototype(inst, protoTargets[i].module);
      }
    },
    options: OPTIONS,
    thresholds: THRESHOLDS,

    help: function () {
      console.log(
        [
          'YTAF ENGINE DIAGNOSTICS',
          '',
          '  YELLOW key        toggle the instrument cluster',
          '  LEFT / RIGHT      change tab (ENGINE, FEATURES, FUNCTIONS, SYSTEMS)',
          '  UP / DOWN         scroll the list',
          '  OK                print a full report to the console',
          '',
          '  __PERF.report()      full report + JSON block for an agent',
          '  __PERF.features()    per-feature state on this page',
          '  __PERF.functions()   hottest instrumented functions',
          '  __PERF.sweep()       re-run the expectation sweep',
          '  __PERF.bottlenecks() current findings only',
          '  __PERF.coverage()    registered vs observed functions',
          '  __PERF.registry()    every known function and its role',
          '  __PERF.config()      config the monitor is reasoning about',
          '  __PERF.options       probe toggles (probeEvents, probeDom, ...)',
          '',
          '  Gauges: MOD LOAD is milliseconds of mod work per second of wall',
          '  clock. Redline at 250 means the mod alone is eating 25% of the',
          '  main thread. FRAMES redlines below 30fps — but if it reads above 70,\n' +
          '  rAF is timer-driven on this panel and LAG (scheduler drift) is the\n' +
          '  metric to trust instead. DOM redlines at 6000 and includes open\n' +
          '  shadow roots.\n' +
          '\n' +
          '  __PERF.calibrate() gives a true per-call filtering cost when the\n' +
          '  platform clock is too coarse for per-call timing (see\n' +
          '  __PERF.report().instrumentation).'
        ].join('\n')
      );
    }
  };
})();