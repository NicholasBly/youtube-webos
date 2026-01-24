import { configRead, configAddChangeListener } from './config.js';

// Global cache for API responses (shared across instances)
const dislikeCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

// Feature detection for compatibility
const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';
const HAS_INTERSECTION_OBSERVER = typeof IntersectionObserver !== 'undefined';

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
    
    // Navigation state
    this.navigationActive = false;
    this.isProgrammaticFocus = false; 
    this.dispatching = false; // Recursion guard
    
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleGlobalFocusIn = this.handleGlobalFocusIn.bind(this);
    this.handleGlobalFocusOut = this.handleGlobalFocusOut.bind(this);

    this.selectors = {
        panel: 'ytlr-structured-description-content-renderer',
        mainContainer: 'zylon-provider-6',
        standardContainer: '.ytLrVideoDescriptionHeaderRendererFactoidContainer',
        compactContainer: '.rznqCe'
    };

    // UI mode configurations
    this.modeConfigs = {
        standard: {
            containerSelector: this.selectors.standardContainer,
            factoidClass: '.ytLrVideoDescriptionHeaderRendererFactoid',
            valueSelector: '.ytLrVideoDescriptionHeaderRendererValue',
            labelSelector: '.ytLrVideoDescriptionHeaderRendererLabel'
        },
        compact: {
            containerSelector: this.selectors.compactContainer,
            factoidClass: '.nOJlw',
            valueSelector: '.axf6h',
            labelSelector: '.Ph2lNb'
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
    
    const mainContainer = document.querySelector(this.selectors.mainContainer) || document.body;
	
	console.log('[RYD] Observing player root:', mainContainer);
    
    this.bodyObserver = new MutationObserver(this.handleBodyMutation);
    this.bodyObserver.observe(mainContainer, { childList: true, subtree: true, attributes: true });
    this.observers.add(this.bodyObserver);

    const existingPanel = document.querySelector(this.selectors.panel);
    if (existingPanel) {
      this.setupPanel(existingPanel);
    }
  }

  handleBodyMutation(mutations) {
    if (!this.active) return;
    const panel = document.querySelector(this.selectors.panel);
    if (!panel) return;
    
    this.setupPanel(panel);
  }

  setupPanel(panel) {
      if (!this.active) return;
	  if (this.panelElement === panel) {
          this.checkAndInjectDislike(panel);
          return;
      }
	  
      this.panelElement = panel;
      this.attachContentObserver(panel);
      this.setupNavigation(); // Ensures global listeners are active
      
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

  handlePanelMutation() {
      if (!this.active) return;
      
      this.setTimeout(() => {
          if (!this.active || !this.panelElement) return;
          this.checkAndInjectDislike(this.panelElement);
      }, 200, 'injectDebounce');
  }

  // --- Navigation Logic ---
  setupNavigation() {
      if (!this.navigationActive) {
          window.addEventListener('keydown', this.handleNavigation, { capture: true });
          document.addEventListener('focusin', this.handleGlobalFocusIn, { capture: true });
          document.addEventListener('focusout', this.handleGlobalFocusOut, { capture: true });
          
          this.navigationActive = true;
          this.log('info', 'Global navigation listeners attached');
      }
  }

  handleGlobalFocusIn(e) {
      if (!this.active || !this.panelElement || this.isProgrammaticFocus) return;
      
      // Check if the focused element is inside our panel
      if (this.panelElement.contains(e.target)) {
          const targetItem = e.target.closest('[role="menuitem"]');
          
          // Filter out container menuitems to avoid selecting the whole list
          if (targetItem && !targetItem.querySelector('[role="menuitem"]')) {
              // this.log('info', 'Native focus detected in panel, syncing state');
              this.updateVisualState(targetItem);
          }
      }
  }
  
  handleGlobalFocusOut(e) {
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
	  const rawItems = [].slice.call(this.panelElement.querySelectorAll('[role="menuitem"]'));
      return rawItems.filter(item => !item.querySelector('[role="menuitem"]'));
  }

  updateVisualState(targetItem) {
      const items = this.getMenuItems();
      let foundTarget = false;
      
      items.forEach(item => {
          if (item === targetItem) {
              item.classList.add('bNqvrc', 'zylon-focus');
              this.toggleParentFocus(item, true);
              foundTarget = true;
          } else {
              item.classList.remove('bNqvrc', 'zylon-focus');
              this.toggleParentFocus(item, false);
          }
      });

      // Handle the dynamic list container focus
      const dynList = this.panelElement.querySelector('yt-dynamic-virtual-list');
      if (dynList) {
          if (foundTarget) {
              dynList.classList.add('zylon-focus');
          } else {
              dynList.classList.remove('zylon-focus');
          }
      }
  }

  clearAllHighlights() {
      if (!this.panelElement) return;
      
      // Query specifically for elements that might have our classes
      const dirtyItems = this.panelElement.querySelectorAll('.zylon-focus, .bNqvrc');
      dirtyItems.forEach(el => {
          el.classList.remove('zylon-focus', 'bNqvrc');
          this.toggleParentFocus(el, false);
      });
      
      // Cleanup parents specifically
      const parents = this.panelElement.querySelectorAll('[class*="--focused"]');
      parents.forEach(p => {
           // Remove any class ending in --focused
           p.classList.forEach(cls => {
               if (cls.endsWith('--focused')) p.classList.remove(cls);
           });
      });
  }

  toggleParentFocus(element, shouldFocus) {
      const parentContainer = element.closest('ytlr-video-owner-renderer, ytlr-expandable-video-description-body-renderer, ytlr-comments-entry-point-renderer, ytlr-chapter-renderer');
      
      if (parentContainer) {
          const baseClass = parentContainer.classList[0]; 
          if (shouldFocus) {
              parentContainer.classList.add(`${baseClass}--focused`, 'zylon-focus', 'zylon-ve');
          } else {
              parentContainer.classList.remove(`${baseClass}--focused`, 'zylon-focus');
          }
      }
  }

  handleNavigation(e) {
      if (this.dispatching) return;
      if (e.isTrusted === false) return;

      if (!this.active || !this.panelElement) return;
      if (!this.panelElement.contains(document.activeElement)) {
        return;
	  }

      const isUp = e.key === 'ArrowUp' || e.keyCode === 38;
      const isDown = e.key === 'ArrowDown' || e.keyCode === 40;
      const isEnter = e.key === 'Enter' || e.keyCode === 13;

      // --- HANDLE ENTER/OK ---
      if (isEnter) {
          const current = this.panelElement.querySelector('.zylon-focus[role="menuitem"]');
          if (current) {
              e.preventDefault();
              e.stopPropagation();
              
              // this.log('info', 'Intercepted Enter, dispatching synthetic keys to:', current);
              this.dispatching = true;
              try {
                  this.triggerEnter(current);
              } finally {
                  this.dispatching = false;
              }
          }
          return;
      }

      if (!isUp && !isDown) return;

      const dynList = this.panelElement.querySelector('yt-dynamic-virtual-list');
      if (dynList && !dynList.classList.contains('zylon-focus')) {
          return;
      }

      // --- HANDLE ARROWS ---
      const items = this.getMenuItems();
      if (items.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      let currentIndex = items.findIndex(el => el.classList.contains('zylon-focus'));
      if (currentIndex === -1) {
          currentIndex = items.findIndex(el => el === document.activeElement);
      }

      let nextIndex = 0;
      if (currentIndex !== -1) {
          if (isDown) {
              nextIndex = (currentIndex + 1) % items.length;
          } else {
              nextIndex = (currentIndex - 1 + items.length) % items.length;
          }
      }

      const nextItem = items[nextIndex];
      if (nextItem) {
          this.updateVisualState(nextItem);
          
          this.isProgrammaticFocus = true;
          nextItem.focus();
          this.isProgrammaticFocus = false;

          nextItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
    dispatchKey('keypress');
    
    try {
        element.click();
    } catch (err) {
        // Fallback for elements that might not support .click() directly
        const clickEvt = document.createEvent('MouseEvents');
        clickEvt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        element.dispatchEvent(clickEvt);
    }

    dispatchKey('keyup');
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
      ytlr-structured-description-content-renderer .ytLrVideoDescriptionHeaderRendererFactoidContainer.ryd-ready,
      ytlr-structured-description-content-renderer .rznqCe.ryd-ready {
        display: flex !important;
        flex-wrap: wrap !important;
        justify-content: center !important;
        gap: 1.0rem !important;
        height: auto !important;
        overflow: visible !important;
      }
      
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] {
        margin-top: 0 !important;
      }
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .ytLrVideoDescriptionHeaderRendererValue,
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .axf6h {
        display: inline-block !important;
        margin-right: 0.2rem !important;
      }
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .ytLrVideoDescriptionHeaderRendererLabel,
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .Ph2lNb {
        display: inline-block !important;
      }

      ytlr-structured-description-content-renderer .TXB27d,
      ytlr-structured-description-content-renderer .ytVirtualListItem,
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
    
    if (this.navigationActive) {
        window.removeEventListener('keydown', this.handleNavigation, { capture: true });
        // REMOVE GLOBAL LISTENERS
        document.removeEventListener('focusin', this.handleGlobalFocusIn, { capture: true });
        document.removeEventListener('focusout', this.handleGlobalFocusOut, { capture: true });
        this.navigationActive = false;
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