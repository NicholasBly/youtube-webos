import { configRead, configAddChangeListener } from './config.js';

// Global cache for API responses (shared across instances)
const dislikeCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

// Feature detection
const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';
const HAS_INTERSECTION_OBSERVER = typeof IntersectionObserver !== 'undefined';

// --- Centralized Selector Configuration ---
const SELECTORS = {
    // Main Containers
    panel: 'ytlr-structured-description-content-renderer',
    mainContainer: 'zylon-provider-6',
    
    // Factoid Containers
    standardContainer: '.ytLrVideoDescriptionHeaderRendererFactoidContainer',
    compactContainer: '.rznqCe',

    // Standard Mode Classes
    stdFactoid: '.ytLrVideoDescriptionHeaderRendererFactoid',
    stdValue: '.ytLrVideoDescriptionHeaderRendererValue',
    stdLabel: '.ytLrVideoDescriptionHeaderRendererLabel',

    // Compact Mode Classes
    cptFactoid: '.nOJlw',
    cptValue: '.axf6h',
    cptLabel: '.Ph2lNb',

    // Navigation & Interaction
    menuItem: '[role="menuitem"]',
    dynamicList: 'yt-dynamic-virtual-list',
    
    // State Classes
    focusState: 'zylon-focus',
    legacyHighlight: 'bNqvrc',
    focusedModifier: '--focused',
    
    // Parent Containers (for focus toggling)
    parentWrappers: 'ytlr-video-owner-renderer, ytlr-expandable-video-description-body-renderer, ytlr-comments-entry-point-renderer, ytlr-chapter-renderer'
};

class ReturnYouTubeDislike {
  constructor(videoID, enableDislikes = true) {
    this.videoID = videoID;
    this.enableDislikes = enableDislikes;
    this.active = true;
    this.dislikesCount = 0;
    this.initialInjectionDone = false;
    
    this.timers = {};
    this.observers = new Set();
    this.abortController = null;
    this.panelElement = null;
	
	this.menuItemsCache = [];
	this.focusedIndex = -1;
    
    // Navigation state
    this.isProgrammaticFocus = false; 
    this.dispatching = false; // Recursion guard
    
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);

    // UI mode configurations using cached selectors
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

    this.handleBodyMutation = this.handleBodyMutation.bind(this);
    this.handlePanelMutation = this.handlePanelMutation.bind(this);
  }

  log(level, message) {
    var args = [].slice.call(arguments, 2); 
    var prefix = '[RYD:' + this.videoID + '] [' + level.toUpperCase() + ']';
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
  
  clearTimeout(name) {
    if (this.timers[name]) {
      clearTimeout(this.timers[name]);
      delete this.timers[name];
    }
  }
  
  clearAllTimers() {
    Object.keys(this.timers).forEach(key => clearTimeout(this.timers[key]));
    this.timers = {};
  }

  // --- Initialization ---
  async init() {
    this.log('info', 'Initializing...');
    
    if (!HAS_ABORT_CONTROLLER) {
      this.log('info', 'AbortController not available - request cancellation disabled');
    }
    
    try {
      this.injectPersistentStyles();

      if (!this.enableDislikes) {
        this.log('info', 'Dislikes disabled by config, applied layout fixes only.');
        return;
      }

      await this.fetchVideoData();

      if (!this.active) return;

      this.observeBodyForPanel();
    } catch (error) {
      this.log('error', 'Init error:', error);
    }
  }

  async fetchVideoData() {
    if (!this.videoID) return;
    
    const cached = dislikeCache.get(this.videoID);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        this.dislikesCount = cached.dislikes;
        this.log('info', 'Dislikes loaded from cache:', this.dislikesCount);
        return;
    }
    
    if (HAS_ABORT_CONTROLLER) {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
    }
    
    try {
      const fetchOptions = {};
      if (HAS_ABORT_CONTROLLER && this.abortController) {
          fetchOptions.signal = this.abortController.signal;
      }
      
      const response = await Promise.race([
        fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${this.videoID}`, fetchOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 8000)
        )
      ]);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      this.dislikesCount = data?.dislikes || 0;
      
      dislikeCache.set(this.videoID, {
        dislikes: this.dislikesCount,
        timestamp: Date.now()
      });
      
      if (dislikeCache.size > 50) {
        const firstKey = dislikeCache.keys().next().value;
        dislikeCache.delete(firstKey);
      }
      
      this.log('info', 'Dislikes loaded:', this.dislikesCount);
    } catch (error) {
      if (HAS_ABORT_CONTROLLER && error.name === 'AbortError') {
        // Silently ignore
      } else {
        this.log('error', 'Fetch error:', error);
      }
      this.dislikesCount = 0;
    } finally {
      if (HAS_ABORT_CONTROLLER) {
        this.abortController = null;
      }
    }
  }

  // --- Observer Logic ---
  observeBodyForPanel() {
    this.cleanupBodyObserver();
    
    const mainContainer = document.querySelector(SELECTORS.mainContainer) || document.body;
	
	console.log('[RYD] Observing player root:', mainContainer);
    
    this.bodyObserver = new MutationObserver(this.handleBodyMutation);
    this.bodyObserver.observe(mainContainer, { childList: true, subtree: true, attributes: true });
    this.observers.add(this.bodyObserver);

    const existingPanel = document.querySelector(SELECTORS.panel);
    if (existingPanel) {
      this.setupPanel(existingPanel);
    }
  }

  handleBodyMutation(mutations) {
    if (!this.active) return;
	if (this.panelElement && this.panelElement.isConnected) {
        return;
    }
    const panel = document.querySelector(SELECTORS.panel);
    if (!panel) return;
    
    this.setupPanel(panel);
  }

  setupPanel(panel) {
      if (!this.active) return;
      
      // If we are switching panels, ensure listeners are moved
      if (this.panelElement && this.panelElement !== panel) {
          this.unbindPanelEvents(this.panelElement);
      }
      
	  if (this.panelElement === panel) {
          this.checkAndInjectDislike(panel);
          return;
      }
	  
      this.panelElement = panel;
      this.attachContentObserver(panel);
      
      // Bind scoped events directly to the new panel
      this.bindPanelEvents(panel);
      
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
    this.panelContentObserver.observe(panelElement, { 
        childList: true, 
        subtree: true 
    });
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
        const entry = entries[0];
        
        if (entry.isIntersecting) {
            this.checkAndInjectDislike(this.panelElement);
            // Sync with current focus immediately if already there
            if (this.panelElement.contains(document.activeElement)) {
                this.updateVisualState(document.activeElement);
            }
        } else {
            // clean up ALL highlights to prevent ghosts
            this.clearAllHighlights();
        }
    }, { threshold: 0.1 });
    
    this.intersectionObserver.observe(panelElement);
    this.observers.add(this.intersectionObserver);
  }
  
  refreshMenuCache() {
      if (!this.panelElement) return;
      
      // Get all potential items
      var rawItems = [].slice.call(this.panelElement.querySelectorAll(SELECTORS.menuItem));
      
      // Filter out container items (nested menu logic)
      // Doing this once during idle time is much better than on every keypress
      this.menuItemsCache = rawItems.filter(item => !item.querySelector(SELECTORS.menuItem));
      
      // Reset index if cache invalidated
      this.focusedIndex = this.menuItemsCache.findIndex(el => el.classList.contains(SELECTORS.focusState));
  }

handlePanelMutation() {
      if (!this.active) return;

      this.menuItemsCache = []; 
      this.focusedIndex = -1;
      
      this.setTimeout(() => {
          if (!this.active || !this.panelElement) return;
          this.checkAndInjectDislike(this.panelElement);
      }, 200, 'injectDebounce');
  }
  
  setFocusByIndex(newIndex) {
      const items = this.menuItemsCache;
      if (!items[newIndex]) return;

      const oldItem = items[this.focusedIndex];
      const newItem = items[newIndex];

      // Unfocus Old (if exists)
      if (oldItem) {
          oldItem.classList.remove(SELECTORS.legacyHighlight, SELECTORS.focusState);
          this.toggleParentFocus(oldItem, false);
      }

      // Focus New
      newItem.classList.add(SELECTORS.legacyHighlight, SELECTORS.focusState);
      this.toggleParentFocus(newItem, true);

      // Handle Dynamic List Container
      const dynList = this.panelElement.querySelector(SELECTORS.dynamicList);
      if (dynList) {
           dynList.classList.add(SELECTORS.focusState);
      }

      // 3. REMOVE SMOOTH SCROLL: Use 'auto' for instant, low-cost movement
      // 'block: nearest' is also cheaper than 'center' if you don't strictly need centering
      newItem.scrollIntoView({ behavior: 'auto', block: 'center' });
      
      // Update state
      this.focusedIndex = newIndex;
  }

  // --- Navigation Logic (Event Delegation) ---
  
  bindPanelEvents(panel) {
      // Attach listeners directly to the panel container.
      // Events bubble up from children, so we catch them here (Delegation).
      panel.addEventListener('keydown', this.handleNavigation);
      panel.addEventListener('focusin', this.handleFocusIn);
      panel.addEventListener('focusout', this.handleFocusOut);
      this.log('info', 'Scoped navigation listeners attached to panel');
  }

  unbindPanelEvents(panel) {
      if (!panel) return;
      panel.removeEventListener('keydown', this.handleNavigation);
      panel.removeEventListener('focusin', this.handleFocusIn);
      panel.removeEventListener('focusout', this.handleFocusOut);
  }

  handleFocusIn(e) {
      if (!this.active || !this.panelElement || this.isProgrammaticFocus) return;
      
      // Since this listener is on the panel, e.target is guaranteed to be inside 
      // (or the panel itself) due to bubbling.
      const targetItem = e.target.closest(SELECTORS.menuItem);
          
      // Filter out container menuitems to avoid selecting the whole list
      if (targetItem && !targetItem.querySelector(SELECTORS.menuItem)) {
          this.updateVisualState(targetItem);
      }
  }
  
  handleFocusOut(e) {
      // Small delay to check where focus went
      setTimeout(() => {
         // If we don't have a panel, or focus left the panel entirely...
         if (!this.panelElement) return;
         
         const active = document.activeElement;
         const isFocusInside = this.panelElement.contains(active);
         
         // If focus is not inside the panel anymore, clean up
         if (!isFocusInside) {
             this.clearAllHighlights();
         }
      }, 50);
  }

  getMenuItems() {
      if (!this.panelElement) return [];
	  const rawItems = [].slice.call(this.panelElement.querySelectorAll(SELECTORS.menuItem));
      return rawItems.filter(item => !item.querySelector(SELECTORS.menuItem));
  }

  updateVisualState(targetItem) {
      const items = this.getMenuItems();
      let foundTarget = false;
      
      items.forEach(item => {
          if (item === targetItem) {
              item.classList.add(SELECTORS.legacyHighlight, SELECTORS.focusState);
              this.toggleParentFocus(item, true);
              foundTarget = true;
          } else {
              item.classList.remove(SELECTORS.legacyHighlight, SELECTORS.focusState);
              this.toggleParentFocus(item, false);
          }
      });

      // Handle the dynamic list container focus
      const dynList = this.panelElement.querySelector(SELECTORS.dynamicList);
      if (dynList) {
          if (foundTarget) {
              dynList.classList.add(SELECTORS.focusState);
          } else {
              dynList.classList.remove(SELECTORS.focusState);
          }
      }
  }

  clearAllHighlights() {
      if (!this.panelElement) return;
      
      // Query specifically for elements that might have our classes
      const dirtyItems = this.panelElement.querySelectorAll(`.${SELECTORS.focusState}, .${SELECTORS.legacyHighlight}`);
      dirtyItems.forEach(el => {
          el.classList.remove(SELECTORS.focusState, SELECTORS.legacyHighlight);
          this.toggleParentFocus(el, false);
      });
      
      // Cleanup parents specifically
      const parents = this.panelElement.querySelectorAll(`[class*="${SELECTORS.focusedModifier}"]`);
      parents.forEach(p => {
           // Remove any class ending in --focused
           p.classList.forEach(cls => {
               if (cls.endsWith(SELECTORS.focusedModifier)) p.classList.remove(cls);
           });
      });
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

  handleNavigation(e) {
      if (this.dispatching) return;
      if (e.isTrusted === false) return;
      if (!this.active || !this.panelElement) return;

      const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
      const isDown = e.key === 'ArrowDown' || e.keyCode === 40;
      const isEnter = e.key === 'Enter' || e.keyCode === 13;

      if (!isUp && !isDown && !isEnter) return;

      // Fail-safe: ensure cache is populated if empty
      if (this.menuItemsCache.length === 0) {
          this.refreshMenuCache();
          if (this.menuItemsCache.length === 0) return;
      }
	  if (!this.menuItemsCache.includes(document.activeElement)) {
          return;
      }

      // --- HANDLE ENTER ---
      if (isEnter) {
          const current = this.menuItemsCache[this.focusedIndex];
          if (current) {
              e.preventDefault();
              e.stopPropagation();

              this.dispatching = true;
              try {
                  // Trigger the click immediately so navigation feels instant
                  this.triggerEnter(current);
              } finally {
                  this.dispatching = false;
              }
              setTimeout(() => {
                  current.classList.remove(SELECTORS.legacyHighlight, SELECTORS.focusState);
                  this.toggleParentFocus(current, false);

                  // Also clean up the container focus state
                  if (this.panelElement) {
                      const dynList = this.panelElement.querySelector(SELECTORS.dynamicList);
                      if (dynList) {
                          dynList.classList.remove(SELECTORS.focusState);
                      }
                  }
              }, 100);
          }
          return;
      }

      // --- HANDLE ARROWS ---
      e.preventDefault();
      e.stopPropagation();

      // Recalculate index if it desynced (e.g. mouse interaction)
      if (this.focusedIndex === -1 || !this.menuItemsCache[this.focusedIndex]?.classList.contains(SELECTORS.focusState)) {
           this.focusedIndex = this.menuItemsCache.findIndex(el => el.classList.contains(SELECTORS.focusState));
           if (this.focusedIndex === -1 && document.activeElement) {
                this.focusedIndex = this.menuItemsCache.indexOf(document.activeElement);
           }
           if (this.focusedIndex === -1) this.focusedIndex = 0;
      }

      let nextIndex = this.focusedIndex;
      if (isDown) {
          nextIndex = (this.focusedIndex + 1) % this.menuItemsCache.length;
      } else {
          nextIndex = (this.focusedIndex - 1 + this.menuItemsCache.length) % this.menuItemsCache.length;
      }

      // Programmatic Focus Flag (keep your existing logic)
      const nextItem = this.menuItemsCache[nextIndex];
      this.isProgrammaticFocus = true;
      nextItem.focus({ preventScroll: true }); // optimize native focus
      this.isProgrammaticFocus = false;

      // Perform the optimized visual update
      this.setFocusByIndex(nextIndex);
  }

triggerEnter(element) {
    if (!element) return;
    
    // 1. Dispatch legacy key events (for global listeners)
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
    //dispatchKey('keypress');
    
    // try {
        // element.click();
    // } catch (err) {
        // // Fallback for elements that might not support .click() directly
        // const clickEvt = document.createEvent('MouseEvents');
        // clickEvt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        // element.dispatchEvent(clickEvt);
    // }
}

  // --- Core Logic ---
  checkAndInjectDislike(panelElement) {
    if (!this.active || !this.enableDislikes) return;
    if (document.getElementById('ryd-dislike-factoid')) return;

    try {
      const standardContainer = panelElement.querySelector(this.modeConfigs.standard.containerSelector);
      const compactContainer = panelElement.querySelector(this.modeConfigs.compact.containerSelector);
      
      const mode = standardContainer ? this.modeConfigs.standard :
                   compactContainer ? this.modeConfigs.compact : null;
      
      if (!mode) return;

      const container = standardContainer || compactContainer;

      // Construct selector dynamically from cache + specific logic
      const likesElement = container.querySelector(
          `div[idomkey="factoid-0"]${mode.factoidClass}, ` +
          `div[aria-label*="like"]${mode.factoidClass}, ` +
          `div[aria-label*="Like"]${mode.factoidClass}`
      );

      if (!likesElement) return;

      const dislikeElement = likesElement.cloneNode(false);
      dislikeElement.id = 'ryd-dislike-factoid';
      dislikeElement.setAttribute('idomkey', 'factoid-ryd');
      dislikeElement.innerHTML = likesElement.innerHTML;

      const valueElement = dislikeElement.querySelector(mode.valueSelector);
      const labelElement = dislikeElement.querySelector(mode.labelSelector);

      if (valueElement && labelElement) {
        const dislikeText = this.formatNumber(this.dislikesCount);
        valueElement.textContent = dislikeText;
        labelElement.textContent = 'Dislikes';
        dislikeElement.setAttribute('aria-label', `${dislikeText} Dislikes`);
        dislikeElement.setAttribute('role', 'text');
        dislikeElement.setAttribute('tabindex', '-1');
      }

      likesElement.insertAdjacentElement('afterend', dislikeElement);
	  container.classList.add('ryd-ready');
      this.initialInjectionDone = true;

    } catch (error) {
      this.log('error', 'Injection error:', error);
    }
  }

  formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  }
  
  injectPersistentStyles() {
    if (document.getElementById('ryd-persistent-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'ryd-persistent-styles';
    styleElement.textContent = `
      ${SELECTORS.panel} ${SELECTORS.standardContainer}.ryd-ready,
      ${SELECTORS.panel} ${SELECTORS.compactContainer}.ryd-ready {
        display: flex !important;
        flex-wrap: wrap !important;
        justify-content: center !important;
        gap: 1.0rem !important;
        height: auto !important;
        overflow: visible !important;
      }
      
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] {
        margin-top: 0 !important;
      }
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.stdValue},
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.cptValue} {
        display: inline-block !important;
        margin-right: 0.2rem !important;
      }
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.stdLabel},
      ${SELECTORS.panel} .ryd-ready div[idomkey="factoid-2"] ${SELECTORS.cptLabel} {
        display: inline-block !important;
      }

      ${SELECTORS.panel} .TXB27d,
      ${SELECTORS.panel} .ytVirtualListItem,
      yt-rich-text-list-view-model .TXB27d,
      yt-rich-text-list-view-model .ytVirtualListItem {
        position: relative !important;
        height: auto !important;
        margin-bottom: 1rem !important;
      }
      
      #ryd-dislike-factoid {
        flex: 0 0 auto !important;
      }
    `;
    
    document.head.appendChild(styleElement);
  }

  cleanupBodyObserver() {
    if (this.bodyObserver) {
        this.bodyObserver.disconnect();
        this.observers.delete(this.bodyObserver);
        this.bodyObserver = null;
    }
  }

  cleanupObservers() {
    this.observers.forEach(obs => obs.disconnect());
    this.observers.clear();
    
    this.bodyObserver = null;
    this.panelContentObserver = null;
    this.intersectionObserver = null;
  }

  destroy() {
    this.log('info', 'Destroying...');
    this.active = false;
    
    if (HAS_ABORT_CONTROLLER && this.abortController) {
        this.abortController.abort();
        this.abortController = null;
    }
    
    this.clearAllTimers();
    this.cleanupObservers();
    
    // Clean up scoped listeners if panel still exists
    if (this.panelElement) {
        this.unbindPanelEvents(this.panelElement);
    }

    const el = document.getElementById('ryd-dislike-factoid');
    if (el) el.remove();
    
    if (window.returnYouTubeDislike === this) {
        const styles = document.getElementById('ryd-persistent-styles');
        if (styles) styles.remove();
    }
    
    this.panelElement = null;
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
    if (!urlStr) { 
        cleanup(); 
        return; 
    }

    const url = new URL(urlStr, 'http://dummy.com');
    const isWatch = url.pathname === '/watch';
    const videoID = url.searchParams.get('v');

    if (!isWatch || !videoID) {
        cleanup();
        return;
    }

    if (!window.returnYouTubeDislike || window.returnYouTubeDislike.videoID !== videoID) {
        cleanup();
        
        let enabled = true;
        if (typeof configRead === 'function') {
            try { 
                enabled = configRead('enableReturnYouTubeDislike'); 
            } catch(e) {
                console.warn('Config read failed:', e);
            }
        }

        window.returnYouTubeDislike = new ReturnYouTubeDislike(videoID, enabled);
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
      configAddChangeListener('enableReturnYouTubeDislike', (evt) => {
          cleanup();
          handleHashChange();
      });
  }
  
  window.addEventListener('beforeunload', cleanup, { passive: true });
}

export { ReturnYouTubeDislike };