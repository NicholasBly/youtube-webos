import { configRead, configAddChangeListener } from './config.js';
import { SYNTHETIC_KEY_FLAG } from './utils.js';

// Global cache for API responses
const dislikeCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

// Feature detection
const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';
const HAS_INTERSECTION_OBSERVER = typeof IntersectionObserver !== 'undefined';

// closest() runs the selector engine at every level of the ancestor chain.
// handleFocusIn calls it on EVERY focus change in the whole app while a watch
// page is open - measured at 19 matches() invocations per keypress. Both
// selectors we search for are trivial (one tag name, one attribute), so a hand
// -rolled walk gives the identical answer without touching the engine.
const PANEL_TAG = 'YTLR-STRUCTURED-DESCRIPTION-CONTENT-RENDERER';

function closestPanel(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.tagName === PANEL_TAG) return n;
  }
  return null;
}

function closestMenuItem(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (n.getAttribute('role') === 'menuitem') return n;
  }
  return null;
}

// Shown while the count is still unknown, so the factoid can be laid out
// immediately instead of appearing late.
const DISLIKE_PLACEHOLDER = '\u2014'; // em dash
const FETCH_MAX_RETRIES = 3;
const FETCH_RETRY_BASE_MS = 1200;

const SELECTORS = {
    panel: 'ytlr-structured-description-content-renderer',
    standardContainer: '.ytLrVideoDescriptionHeaderRendererFactoidContainer',
    compactContainer: '.rznqCe',
    stdFactoid: '.ytLrVideoDescriptionHeaderRendererFactoid',
    stdValue: '.ytLrVideoDescriptionHeaderRendererValue',
    stdLabel: '.ytLrVideoDescriptionHeaderRendererLabel',
    cptFactoid: '.nOJlw',
    cptValue: '.axf6h',
    cptLabel: '.Ph2lNb',
    menuItem: '[role="menuitem"]',
    dynamicList: 'yt-dynamic-virtual-list',
    focusState: 'zylon-focus',
    legacyHighlight: 'bNqvrc',
    focusedModifier: '--focused',
    parentWrappers: 'ytlr-video-owner-renderer, ytlr-expandable-video-description-body-renderer, ytlr-comments-entry-point-renderer, ytlr-chapter-renderer'
};

class ReturnYouTubeDislike {
  constructor(videoID, enableDislikes = true) {
    this.videoID = videoID;
    this.enableDislikes = enableDislikes;
    this.active = true;
    this.dislikesCount = 0;
    // null until a fetch actually succeeds. The old code could not tell "the
    // API said zero" from "the request failed", so a failure rendered a
    // permanent 0 with no retry and no later correction.
    this.dislikesValue = null;
    this.dislikeValueElement = null;
    this.dislikeFactoidElement = null;
    this.fetchAttempts = 0;
    this.dataReady = !enableDislikes;
    
    this.timers = {};
    this.observers = new Set();
    this.abortController = null;
    this.panelElement = null;
    
    this.menuItemsCache = [];
    this.menuItemsMap = new Map(); // O(1) lookup
    this.focusedIndex = -1;
    this.lastFocusedElement = null; // Track active element
	this.cachedMode = null;
    
    // PERF: Boolean flag to avoid DOM checks on every keypress
    this.isPanelFocused = false; 
    
    this.navigationActive = false;
    this.isProgrammaticFocus = false; 
    this.dispatching = false;
    
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);
    this.handlePanelMutation = this.handlePanelMutation.bind(this);

    this.modeConfigs = {
        standard: {
            containerSelector: SELECTORS.standardContainer,
            factoidClass: SELECTORS.stdFactoid,
            valueSelector: SELECTORS.stdValue,
            labelSelector: SELECTORS.stdLabel
        },
        compact: {
            containerSelector: SELECTORS.compactContainer,
            factoidClass: SELECTORS.cptFactoid,
            valueSelector: SELECTORS.cptValue,
            labelSelector: SELECTORS.cptLabel
        }
    };
  }

  log(level, message) {
    let args = [].slice.call(arguments, 2); 
    let prefix = '[RYD:' + this.videoID + '] [' + level.toUpperCase() + ']';
    console.log.apply(console, [prefix, message].concat(args));
  }

  // --- Timer Management ---
  setTimeout(callback, delay, name) {
    clearTimeout(this.timers[name]);
    if (!this.active) return null;
    this.timers[name] = setTimeout(() => {
      delete this.timers[name];
      if (this.active) callback();
    }, delay);
    return this.timers[name];
  }
  
  clearAllTimers() {
    Object.keys(this.timers).forEach(key => { clearTimeout(this.timers[key]); });
    this.timers = {};
  }

  // --- Initialization ---
  async init() {
    this.log('info', 'Initializing...');
    try {
      this.injectPersistentStyles();
      this.setupNavigation();

      // Panel detection must not sit behind the network. A cold first request
      // to the RYD API can take seconds (up to the 8s race timeout), which used
      // to burn the poll window on the first video of the session.
      this.observeBodyForPanel();

      if (this.enableDislikes) {
          await this.fetchVideoData();
          if (!this.active) return;
          this.dataReady = true;
          // The panel may already have been set up while the fetch was in
          // flight; inject now that we actually have a number.
          if (this.panelElement) this.checkAndInjectDislike(this.panelElement);
      }
    } catch (error) {
      this.log('error', 'Init error:', error);
    }
  }

  async fetchVideoData() {
    if (!this.videoID) return;
    
    const cached = dislikeCache.get(this.videoID);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        this.dislikesCount = cached.dislikes;
        this.dislikesValue = cached.dislikes;
        this.updateDislikeDisplay();
        return;
    }
    
    if (HAS_ABORT_CONTROLLER) {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();
    }
    
    try {
      const fetchOptions = {};
      if (HAS_ABORT_CONTROLLER && this.abortController) fetchOptions.signal = this.abortController.signal;
      
      const response = await Promise.race([
        fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${this.videoID}`, fetchOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
      ]);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      this.dislikesCount = data?.dislikes || 0;
      this.dislikesValue = this.dislikesCount;
      this.fetchAttempts = 0;
      
      dislikeCache.set(this.videoID, { dislikes: this.dislikesCount, timestamp: Date.now() });
      if (dislikeCache.size > 50) dislikeCache.delete(dislikeCache.keys().next().value);

      // The panel may already be on screen showing the placeholder.
      this.updateDislikeDisplay();
      
    } catch (error) {
      if (!HAS_ABORT_CONTROLLER || error.name !== 'AbortError') this.log('error', 'Fetch error:', error);
      this.dislikesCount = 0;
      this.dislikesValue = null;   // unknown, NOT zero - never cached

      // A cold DNS + TLS handshake to the RYD API on real TV hardware is much
      // slower than on the simulator, and a transient failure used to be
      // permanent for that video. Back off and try again.
      if (this.active && error.name !== 'AbortError' && ++this.fetchAttempts <= FETCH_MAX_RETRIES) {
        const delay = FETCH_RETRY_BASE_MS * this.fetchAttempts;
        this.log('info', `Retrying dislike fetch in ${delay}ms (attempt ${this.fetchAttempts})`);
        this.setTimeout(() => {
          if (this.active) this.fetchVideoData();
        }, delay, 'rydRetry');
      }
    } finally {
      if (HAS_ABORT_CONTROLLER) this.abortController = null;
    }
  }

  /**
   * Rewrite the already-injected factoid in place. Injection no longer waits
   * for the network, so this is what turns the placeholder into the real number
   * whenever the fetch lands - first try or third.
   */
  updateDislikeDisplay() {
    const valueElement = this.dislikeValueElement;
    if (!valueElement || !valueElement.isConnected) return;
    const text = this.dislikesValue === null
      ? DISLIKE_PLACEHOLDER
      : this.formatNumber(this.dislikesValue);
    if (valueElement.textContent === text) return;
    valueElement.textContent = text;
    if (this.dislikeFactoidElement) {
      this.dislikeFactoidElement.setAttribute('aria-label', `${text} Dislikes`);
    }
  }

  // --- Observer Logic ---

  // Shared reset for a panel that has gone away. Was duplicated verbatim
  // between the poll body and handleFocusIn.
  resetPanelState() {
    this.dislikeValueElement = null;
    this.dislikeFactoidElement = null;
    this.panelElement = null;
    this.isPanelFocused = false;
    this.menuItemsCache = [];
    this.menuItemsMap.clear();
    this.lastFocusedElement = null;
    this.focusedIndex = -1;
    this.cachedMode = null;
  }

  stopBodyPoll() {
    if (this.bodyPollInterval) {
      clearInterval(this.bodyPollInterval);
      this.bodyPollInterval = null;
    }
  }

  // BOUNDED poll. This used to run at 2Hz for the entire lifetime of every
  // watch page, doing a compound querySelector on each tick — the single
  // largest idle cost on older hardware.
  //
  // It is only a safety net: the panel is also detected by handleFocusIn
  // (focus is the only reliable signal for the role="dialog" description
  // panel) and by ui.js calling observeBodyForPanel() after the description
  // shortcut fires. So we give it ~10s per arm and then go idle until
  // something re-arms it.
  observeBodyForPanel() {
    if (!this.active) return;

    this.stopBodyPoll();
    if (this.bodyObserver) { this.bodyObserver.disconnect(); this.bodyObserver = null; }

    // Immediate check first — usually resolves without ever arming the timer.
    const existingPanel = document.querySelector(SELECTORS.panel);
    if (existingPanel) {
      this.setupPanel(existingPanel);
      return;
    }

    let attempts = 0;
    this.bodyPollInterval = setInterval(() => {
      if (!this.active || ++attempts > 20) { // ~10s ceiling
        this.stopBodyPoll();
        return;
      }

      if (this.panelElement) {
        if (this.panelElement.isConnected) return; // Panel is active and connected
        this.resetPanelState();
      }

      const panel = document.querySelector(SELECTORS.panel);
      if (panel) {
        this.setupPanel(panel);
        this.stopBodyPoll();
      }
    }, 500);
  }

  setupPanel(panel) {
      if (!this.active) return;
      
      if (this.panelElement === panel) {
          this.checkAndInjectDislike(panel);
          return;
      }
	  
	  this.menuItemsCache = [];
      this.menuItemsMap.clear();
      this.focusedIndex = -1;
      this.lastFocusedElement = null;
      
      this.panelElement = panel;
	  if (this.panelElement.contains(document.activeElement)) {
        this.isPanelFocused = true;
	  } else {
        this.isPanelFocused = false;
      }
      this.attachContentObserver(panel);
      this.setupNavigation(); // Global listeners
      
      if (HAS_INTERSECTION_OBSERVER) {
          this.setupIntersectionObserver(panel);
      } else {
          this.checkAndInjectDislike(panel);
      }
  }

  attachContentObserver(panelElement) {
    if (this.panelContentObserver) {
        this.panelContentObserver.disconnect();
        this.observers.delete(this.panelContentObserver);
    }
    this.panelContentObserver = new MutationObserver(this.handlePanelMutation);
    this.panelContentObserver.observe(panelElement, { childList: true, subtree: true });
    this.observers.add(this.panelContentObserver);
  }

  setupIntersectionObserver(panelElement) {
    if (!HAS_INTERSECTION_OBSERVER) return;
    if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.observers.delete(this.intersectionObserver);
    }
    this.intersectionObserver = new IntersectionObserver((entries) => {
        if (!this.active) return;
        if (entries[0].isIntersecting) {
            this.checkAndInjectDislike(this.panelElement);
            // Sync logic if focus is already inside
            if (this.panelElement.contains(document.activeElement)) {
                this.isPanelFocused = true;
                this.updateVisualState(document.activeElement);
            }
        } else {
            this.isPanelFocused = false;
            this.clearAllHighlights();
        }
    }, { threshold: 0.1 });
    this.intersectionObserver.observe(panelElement);
    this.observers.add(this.intersectionObserver);
  }
  
  refreshMenuCache() {
      if (!this.panelElement) return;
      // PERF: Only query once
      let rawItems = [].slice.call(this.panelElement.querySelectorAll(SELECTORS.menuItem));
      // Filter nested items
      this.menuItemsCache = rawItems.filter(item => !item.querySelector(SELECTORS.menuItem));
      
      // Optimization: Build Map for O(1) lookup
      this.menuItemsMap.clear();
      this.menuItemsCache.forEach((item, index) => { this.menuItemsMap.set(item, index); });

      // Reset index
      this.focusedIndex = -1;
      const currentFocused = this.panelElement.querySelector('.' + SELECTORS.focusState);
      if (currentFocused) {
          this.focusedIndex = this.menuItemsMap.get(currentFocused) ?? -1;
      }
  }

  handlePanelMutation() {
      if (!this.active) return;
      // Invalidate cache immediately
      this.menuItemsCache = []; 
      this.menuItemsMap.clear();
      this.focusedIndex = -1;
      this.lastFocusedElement = null;
      
      this.setTimeout(() => {
          if (!this.active || !this.panelElement) return;
          this.checkAndInjectDislike(this.panelElement);
      }, 200, 'injectDebounce');
  }

  // --- Optimized Navigation Logic ---
  
  setupNavigation() {
      if (!this.navigationActive) {
          window.addEventListener('keydown', this.handleNavigation, { capture: true });
          document.addEventListener('focusin', this.handleFocusIn, { capture: true });
          document.addEventListener('focusout', this.handleFocusOut, { capture: true });
          
          this.navigationActive = true;
          this.log('info', 'Global navigation listeners attached (Capture Mode)');
      }
  }

  handleFocusIn(e) {
      if (!this.active || this.isProgrammaticFocus) return;

      // Defensive: if our cached panel is somehow stale (the bodyObserver
      // normally clears panelElement on disconnect, but timing races can
      // leave it stranded), drop the reference so the focusin fallback
      // below can rebind to whatever's actually in the DOM now.
      if (this.panelElement && !this.panelElement.isConnected) {
          this.resetPanelState();
          // Re-arm the bounded poll: the panel we were tracking is gone, so a
          // replacement may be mounting right now.
          this.observeBodyForPanel();
      }

      // Primary panel detection path: focus crossed into something matching
      // the panel selector, so wire it up. The description dialog has
      // role="dialog" and is appended to a sibling overlay container — focus
      // is the only reliable signal we get for it on webOS.
      if (!this.panelElement) {
          const found = closestPanel(e.target);
          if (!found) return;
          this.setupPanel(found);
          if (!this.panelElement) return; // setup bailed for some reason
      }

      // PERF: fast DOM check only on focus change
      if (this.panelElement.contains(e.target)) {
          this.isPanelFocused = true;

          const targetItem = closestMenuItem(e.target);
          if (targetItem && !targetItem.querySelector(SELECTORS.menuItem)) {
              this.updateVisualState(targetItem);
          }
      } else {
          this.isPanelFocused = false;
      }
  }
  
  handleFocusOut(_e) {
	  if (this.isProgrammaticFocus) return;
      // Delay to allow focus to land on new element
      setTimeout(() => {
         if (!this.panelElement) return;
         
         const active = document.activeElement;
         const stillInside = this.panelElement.contains(active);
         
         this.isPanelFocused = stillInside;
         
         if (!stillInside) {
             this.clearAllHighlights();
			 this.isPanelFocused = false;
         }
      }, 50);
  }

  updateVisualState(targetItem) {
      if (this.menuItemsCache.length === 0) this.refreshMenuCache();
      
      // Optimization: O(1) Map lookup
      if (!this.menuItemsMap.has(targetItem)) return;

      const newIndex = this.menuItemsMap.get(targetItem);

      let itemToClear = this.lastFocusedElement;
      
      if (!itemToClear && this.focusedIndex !== -1 && this.menuItemsCache[this.focusedIndex]) {
          itemToClear = this.menuItemsCache[this.focusedIndex];
      }

      // Clear the previous item (whether tracked or inferred)
      if (itemToClear && itemToClear !== targetItem) {
          itemToClear.classList.remove(SELECTORS.legacyHighlight, SELECTORS.focusState);
          this.toggleParentFocus(itemToClear, false);
      }

      targetItem.classList.add(SELECTORS.legacyHighlight, SELECTORS.focusState);
      this.toggleParentFocus(targetItem, true);
      
      this.focusedIndex = newIndex;
      this.lastFocusedElement = targetItem;

      const dynList = this.panelElement.querySelector(SELECTORS.dynamicList);
      if (dynList) {
          dynList.classList.add(SELECTORS.focusState);
      }
  }

  setFocusByIndex(newIndex) {
      if (this.menuItemsCache.length === 0) this.refreshMenuCache();
      const items = this.menuItemsCache;
      if (!items[newIndex]) return;

      const newItem = items[newIndex];
      
      // Use efficient state update
      this.updateVisualState(newItem);

      newItem.scrollIntoView({ behavior: 'auto', block: 'center' });
  }

  toggleParentFocus(element, shouldFocus) {
      const parentContainer = element.closest(SELECTORS.parentWrappers);
      if (parentContainer) {
          const baseClass = parentContainer.classList[0]; 
          if (shouldFocus) {
              parentContainer.classList.add(`${baseClass}${SELECTORS.focusedModifier}`, SELECTORS.focusState, 'zylon-ve');
          } else {
              parentContainer.classList.remove(`${baseClass}${SELECTORS.focusedModifier}`, SELECTORS.focusState);
          }
      }
  }
  
  clearAllHighlights() {
      if (!this.panelElement) return;

      // Optimization: Try to clear known element first (O(1))
      if (this.lastFocusedElement) {
          this.lastFocusedElement.classList.remove(SELECTORS.focusState, SELECTORS.legacyHighlight);
          this.toggleParentFocus(this.lastFocusedElement, false);
          this.lastFocusedElement = null;
      }
      
      // Fallback: Only if state is possibly desynced (rare), do the expensive query
      // but strictly speaking, if logic is correct, the above is enough. 
      // Keeping a safe cleanup for dynamic list container.
      const dynList = this.panelElement.querySelector(SELECTORS.dynamicList);
      if (dynList) dynList.classList.remove(SELECTORS.focusState);
  }

  handleNavigation(e) {
      if (this.dispatching) return;
      // isTrusted alone is not enough: on Chromium 38 an event built with
      // document.createEvent('KeyboardEvent') can report it as undefined, and
      // `undefined === false` is false - so the mod's own synthetic UP/ENTER
      // presses (ui.js OLED keep-alive, video-quality's control dismiss) would
      // move focus inside this panel. utils.sendKey stamps every key it makes.
      if (e[SYNTHETIC_KEY_FLAG] || e.isTrusted === false) return;
      if (!this.active || !this.panelElement) return;

      if (!this.isPanelFocused) {
        return;
      }

      const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
      const isDown = e.key === 'ArrowDown' || e.keyCode === 40;
      const isEnter = e.key === 'Enter' || e.keyCode === 13;

      if (!isUp && !isDown && !isEnter) return;

      if (this.menuItemsCache.length === 0) {
          this.refreshMenuCache();
          if (this.menuItemsCache.length === 0) return;
      }

      if (isEnter) {
          const current = this.menuItemsCache[this.focusedIndex];
          // Only intercept Enter when the menuitem container is *itself* the
          // active element. If focus is on a focusable descendant (e.g. the
          // Description chip's inner <yt-button-container role="button">),
          // the real Enter must reach YouTube's native handler — dispatching
          // a synthetic keydown on the parent menuitem targets the wrong node
          // and, being isTrusted=false, is rejected by YT's nav handlers
          // anyway. Net effect of the old `contains` branch: real Enter was
          // swallowed and the panel never opened.
          if (current && current === document.activeElement) {
              e.preventDefault();
              e.stopPropagation();
              this.dispatching = true;
              try { this.triggerEnter(current); } finally { this.dispatching = false; }

              // Cleanup visuals after click
              setTimeout(() => {
                  this.clearAllHighlights(); // Use optimized clear
              }, 100);
          }
          return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Sync index if drift occurred
      if (this.focusedIndex === -1 || (this.menuItemsCache[this.focusedIndex] !== this.lastFocusedElement)) {
           // Fallback to finding index if state drifted
           if (this.lastFocusedElement) {
                this.focusedIndex = this.menuItemsMap.get(this.lastFocusedElement) ?? -1;
           } else if (document.activeElement) {
                this.focusedIndex = this.menuItemsMap.get(document.activeElement) ?? -1;
           }
           if (this.focusedIndex === -1) this.focusedIndex = 0;
      }

      let nextIndex = this.focusedIndex;
      if (isDown) {
          nextIndex = (this.focusedIndex + 1) % this.menuItemsCache.length;
      } else {
          nextIndex = (this.focusedIndex - 1 + this.menuItemsCache.length) % this.menuItemsCache.length;
      }

      const nextItem = this.menuItemsCache[nextIndex];
      this.isProgrammaticFocus = true;
      nextItem.focus({ preventScroll: true }); 
      this.isProgrammaticFocus = false;

      this.setFocusByIndex(nextIndex);
  }

  triggerEnter(element) {
    if (!element) return;
    const dispatchKey = (type) => {
        const evt = document.createEvent('Event');
        evt.initEvent(type, true, true);
        evt.keyCode = 13;
        evt.which = 13;
        evt.key = 'Enter';
        evt.code = 'Enter';
        element.dispatchEvent(evt);
    };
    dispatchKey('keydown');
    dispatchKey('keyup');
  }

  checkAndInjectDislike(panelElement) {
    if (!this.active || !this.enableDislikes) return;
    // Deliberately NOT gated on the fetch. Waiting for the network meant that
    // on a slow first request the panel finished rendering with no dislike
    // factoid at all, and it only appeared later when some unrelated mutation
    // or focus change happened to re-run this - the "it shows up a couple of
    // seconds late" symptom. Inject now, fill in the number when it arrives.
    if (document.getElementById('ryd-dislike-factoid')) return;

    try {
      // Check if we already detected the mode. If so, skip the DOM queries.
      let mode = this.cachedMode;
      if (!mode) {
          const standardContainer = panelElement.querySelector(this.modeConfigs.standard.containerSelector);
          const compactContainer = panelElement.querySelector(this.modeConfigs.compact.containerSelector);    
          mode = standardContainer ? this.modeConfigs.standard :
                 compactContainer ? this.modeConfigs.compact : null;
          if (mode) this.cachedMode = mode;
      }
      if (!mode) return;

      const container = panelElement.querySelector(mode.containerSelector);
      const likesElement = container.querySelector(
          `div[idomkey="factoid-0"]${mode.factoidClass}, div[aria-label*="like"]${mode.factoidClass}, div[aria-label*="Like"]${mode.factoidClass}`
      );

      if (!likesElement) return;

      const dislikeElement = likesElement.cloneNode(false);
      dislikeElement.id = 'ryd-dislike-factoid';
      dislikeElement.setAttribute('idomkey', 'factoid-ryd');
      while (dislikeElement.firstChild) {
          dislikeElement.removeChild(dislikeElement.firstChild);
      }
      Array.from(likesElement.childNodes).forEach(child => {
          dislikeElement.appendChild(child.cloneNode(true));
      });

      const valueElement = dislikeElement.querySelector(mode.valueSelector);
      const labelElement = dislikeElement.querySelector(mode.labelSelector);

      if (valueElement && labelElement) {
        const dislikeText = this.dislikesValue === null
          ? DISLIKE_PLACEHOLDER
          : this.formatNumber(this.dislikesValue);
        valueElement.textContent = dislikeText;
        labelElement.textContent = 'Dislikes';
        dislikeElement.setAttribute('aria-label', `${dislikeText} Dislikes`);
        // Keep handles so updateDislikeDisplay() can fill this in later.
        this.dislikeValueElement = valueElement;
        this.dislikeFactoidElement = dislikeElement;
      }

      likesElement.insertAdjacentElement('afterend', dislikeElement);
      container.classList.add('ryd-ready');
      this.initialInjectionDone = true;

    } catch (error) {
      this.log('error', 'Injection error:', error);
    }
  }

  formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return num.toString();
  }
  
  injectPersistentStyles() {
    if (document.getElementById('ryd-persistent-styles')) return;
    const styleElement = document.createElement('style');
    styleElement.id = 'ryd-persistent-styles';
    styleElement.textContent = `
      ${SELECTORS.panel} ${SELECTORS.standardContainer}.ryd-ready, ${SELECTORS.panel} ${SELECTORS.compactContainer}.ryd-ready {
        display: flex !important; flex-wrap: wrap !important; justify-content: center !important; gap: 1.0rem !important; height: auto !important; overflow: visible !important;
      }
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] { margin-top: 0 !important; }
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.stdValue}, ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.cptValue} { display: inline-block !important; margin-right: 0.2rem !important; }
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.stdLabel}, ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.cptLabel} { display: inline-block !important; }
      ${SELECTORS.panel} .TXB27d, ${SELECTORS.panel} .ytVirtualListItem, yt-rich-text-list-view-model .TXB27d, yt-rich-text-list-view-model .ytVirtualListItem { position: relative !important; height: auto !important; margin-bottom: 1rem !important; }
      #ryd-dislike-factoid { flex: 0 0 auto !important; }
    `;
    document.head.appendChild(styleElement);
  }

  destroy() {
    this.log('info', 'Destroying...');
    this.active = false;
    if (HAS_ABORT_CONTROLLER && this.abortController) this.abortController.abort();
    
    this.clearAllTimers();
    this.observers.forEach(obs => { obs.disconnect(); });
    this.observers.clear();
    
    this.stopBodyPoll();
    if (this.bodyMutationRaf) cancelAnimationFrame(this.bodyMutationRaf);
    
    if (this.navigationActive) {
        window.removeEventListener('keydown', this.handleNavigation, { capture: true });
        document.removeEventListener('focusin', this.handleFocusIn, { capture: true });
        document.removeEventListener('focusout', this.handleFocusOut, { capture: true });
        this.navigationActive = false;
    }

    const el = document.getElementById('ryd-dislike-factoid');
    if (el) el.remove();
    if (window.returnYouTubeDislike === this) {
        const styles = document.getElementById('ryd-persistent-styles');
        if (styles) styles.remove();
    }
    
    // Cleanup references
    this.menuItemsCache = [];
    this.menuItemsMap.clear();
    this.lastFocusedElement = null;
    this.panelElement = null;
    this.cachedMode = null;
  }
}

// --- Global Management ---
if (typeof window !== 'undefined') {
  window.returnYouTubeDislike = null;

  const cleanup = () => {
      if (window.returnYouTubeDislike) {
          window.returnYouTubeDislike.destroy();
          window.returnYouTubeDislike = null;
      }
  };

  const handleHashChange = () => {
    const urlStr = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!urlStr) { cleanup(); return; }
    const url = new URL(urlStr, location.href);
    if (url.pathname !== '/watch' || !url.searchParams.get('v')) { cleanup(); return; }

    if (!window.returnYouTubeDislike || window.returnYouTubeDislike.videoID !== url.searchParams.get('v')) {
        cleanup();
        let enabled = true;
        if (typeof configRead === 'function') {
            try { enabled = configRead('enableReturnYouTubeDislike'); } catch {}
        }
        window.returnYouTubeDislike = new ReturnYouTubeDislike(url.searchParams.get('v'), enabled);
        window.returnYouTubeDislike.init();
    }
  };

  window.addEventListener('hashchange', handleHashChange, { passive: true });
  if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => setTimeout(handleHashChange, 500));
  } else {
      setTimeout(handleHashChange, 500);
  }
  if (typeof configAddChangeListener === 'function') {
      configAddChangeListener('enableReturnYouTubeDislike', () => { cleanup(); handleHashChange(); });
  }
  window.addEventListener('beforeunload', cleanup, { passive: true });
}

export { ReturnYouTubeDislike };