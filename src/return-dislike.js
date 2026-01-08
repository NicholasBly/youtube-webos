import { configRead, configAddChangeListener } from './config.js';

// Global cache for API responses (shared across instances)
const dislikeCache = new Map();
const CACHE_DURATION = 300000; // 5 minutes

// Feature detection for compatibility
const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';
const HAS_INTERSECTION_OBSERVER = typeof IntersectionObserver !== 'undefined';

class ReturnYouTubeDislike {
  constructor(videoID) {
    this.videoID = videoID;
    this.active = true;
    this.dislikesCount = 0;
    this.initialInjectionDone = false;
    
    this.timers = {};
    this.observers = new Set();
    this.abortController = null;
    this.panelElement = null;

    this.selectors = {
        panel: 'ytlr-structured-description-content-renderer',
        mainContainer: 'zylon-provider-3',
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

  log(level, message, ...args) {
    console.log(`[RYD:${this.videoID}] [${level.toUpperCase()}]`, message, ...args);
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
    // Use Object.keys for compatibility
    Object.keys(this.timers).forEach(key => clearTimeout(this.timers[key]));
    this.timers = {};
  }

  // --- Initialization ---
  async init() {
    this.log('info', 'Initializing...');
    
    // Log feature availability for debugging
    if (!HAS_ABORT_CONTROLLER) {
      this.log('info', 'AbortController not available - request cancellation disabled');
    }
    if (!HAS_INTERSECTION_OBSERVER) {
      this.log('info', 'IntersectionObserver not available - visibility detection disabled');
    }
    
    try {
      await this.fetchVideoData();

      if (!this.active) return;

	  this.injectPersistentStyles();

      this.observeBodyForPanel();
    } catch (error) {
      this.log('error', 'Init error:', error);
    }
  }

  async fetchVideoData() {
    if (!this.videoID) return;
    
    // Check cache first
    const cached = dislikeCache.get(this.videoID);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
        this.dislikesCount = cached.dislikes;
        this.log('info', 'Dislikes loaded from cache:', this.dislikesCount);
        return;
    }
    
    // Abort any previous request
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
      
      // Cache the result
      dislikeCache.set(this.videoID, {
        dislikes: this.dislikesCount,
        timestamp: Date.now()
      });
      
      // Limit cache size
      if (dislikeCache.size > 50) {
        const firstKey = dislikeCache.keys().next().value;
        dislikeCache.delete(firstKey);
      }
      
      this.log('info', 'Dislikes loaded:', this.dislikesCount);
    } catch (error) {
      // Only check for AbortError if AbortController is available
      if (HAS_ABORT_CONTROLLER && error.name === 'AbortError') {
        // Silently ignore abort errors
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
    this.bodyObserver.observe(mainContainer, { childList: true, subtree: true });
    this.observers.add(this.bodyObserver);
    this.log('info', 'Watching container for panel...');

    const existingPanel = document.querySelector(this.selectors.panel);
    if (existingPanel) {
      this.setupPanel(existingPanel);
    }
  }

  handleBodyMutation(mutations) {
    if (!this.active) return;

    // Optimized check using .some()
    if (!mutations.some(m => m.addedNodes.length > 0)) return;

    const panel = document.querySelector(this.selectors.panel);
    if (!panel) return;
    
    this.setupPanel(panel);
  }

  setupPanel(panel) {
      if (!this.active) return;
      this.panelElement = panel; // Cache reference
      
      this.checkAndInjectDislike(panel);
      this.attachContentObserver(panel);
      
      // Only setup IntersectionObserver if available
      if (HAS_INTERSECTION_OBSERVER) {
          this.setupIntersectionObserver(panel);
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
    this.log('info', 'Attached panel observer.');
  }

  setupIntersectionObserver(panelElement) {
    if (!HAS_INTERSECTION_OBSERVER) {
        this.log('info', 'IntersectionObserver not available, skipping visibility detection');
        return;
    }
    
    if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
        this.observers.delete(this.intersectionObserver);
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
        if (!this.active) return;
        if (entries[0].isIntersecting) {
            this.checkAndInjectDislike(this.panelElement);
        }
    }, { threshold: 0.1 });
    
    this.intersectionObserver.observe(panelElement);
    this.observers.add(this.intersectionObserver);
    this.log('info', 'Intersection observer active');
  }

  handlePanelMutation() {
      if (!this.active) return;
      
      this.setTimeout(() => {
          if (!this.active || !this.panelElement) return;
          this.checkAndInjectDislike(this.panelElement);
      }, 200, 'injectDebounce');
  }

  // --- Core Logic ---
  checkAndInjectDislike(panelElement) {
    if (!this.active) return;

    // Early exit if already exists
    if (document.getElementById('ryd-dislike-factoid')) return;

    try {
      // Determine UI mode
      const standardContainer = panelElement.querySelector(this.modeConfigs.standard.containerSelector);
      const compactContainer = panelElement.querySelector(this.modeConfigs.compact.containerSelector);
      
      const mode = standardContainer ? this.modeConfigs.standard :
                   compactContainer ? this.modeConfigs.compact : null;
      
      if (!mode) return;

      const container = standardContainer || compactContainer;

      // Optimized single query with case-insensitive search
      const likesElement = container.querySelector(
          `div[idomkey="factoid-0"]${mode.factoidClass}, ` +
          `div[aria-label*="like"]${mode.factoidClass}, ` +
          `div[aria-label*="Like"]${mode.factoidClass}`
      );

      if (!likesElement) return;

      this.log('info', 'Injecting dislike count...');
      
      // Shallow clone and rebuild (more efficient)
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
        dislikeElement.setAttribute('tabindex', '-1'); // TV accessibility
      }

      likesElement.insertAdjacentElement('afterend', dislikeElement);
	  
	  container.classList.add('ryd-ready');
      
      // Mark initial injection as complete
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
    // Only inject once globally (not per instance)
    if (document.getElementById('ryd-persistent-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'ryd-persistent-styles';
    styleElement.textContent = `
      ytlr-structured-description-content-renderer .ytLrVideoDescriptionHeaderRendererFactoidContainer.ryd-ready,
      ytlr-structured-description-content-renderer .rznqCe.ryd-ready {
        display: flex !important;
        flex-wrap: wrap !important;
        justify-content: center !important;
        gap: 1.5rem !important;
        height: auto !important;
        overflow: visible !important;
      }
      
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] {
        margin-top: 0 !important;
      }
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .ytLrVideoDescriptionHeaderRendererValue,
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .axf6h {
        display: inline-block !important;
        margin-right: 0.4rem !important;
      }
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .ytLrVideoDescriptionHeaderRendererLabel,
      ytlr-structured-description-content-renderer .ryd-ready div[idomkey="factoid-2"] .Ph2lNb {
        display: inline-block !important;
      }
      
      /* Virtual list natural flow fixes (Keep global as these are structural fixes) */
      ytlr-structured-description-content-renderer yt-virtual-list {
        height: auto !important;
        overflow: visible !important;
        display: block !important;
      }
      ytlr-structured-description-content-renderer .NUDen {
        position: relative !important;
        height: auto !important;
        width: 100% !important;
      }
      ytlr-structured-description-content-renderer .TXB27d,
      ytlr-structured-description-content-renderer .ytVirtualListItem {
        position: relative !important;
        transform: none !important;
        height: auto !important;
        margin-bottom: 1rem !important;
        width: 100% !important;
        pointer-events: auto !important;
      }
      
      /* Description body fixes */
      ytlr-structured-description-content-renderer ytlr-expandable-video-description-body-renderer {
        height: auto !important;
        display: block !important;
      }
      ytlr-structured-description-content-renderer ytlr-expandable-video-description-body-renderer ytlr-sidesheet-item {
        height: auto !important;
        display: block !important;
      }
      
      /* RYD dislike element styling */
      #ryd-dislike-factoid {
        flex: 0 0 auto !important;
      }
    `;
    
    document.head.appendChild(styleElement);
    this.log('info', 'Persistent styles injected');
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
    
    // Abort any in-flight requests (if AbortController is available)
    if (HAS_ABORT_CONTROLLER && this.abortController) {
        this.abortController.abort();
        this.abortController = null;
    }
    
    // Clear all timers
    this.clearAllTimers();
    
    // Disconnect all observers
    this.cleanupObservers();
    
    // Remove injected elements
    const el = document.getElementById('ryd-dislike-factoid');
    if (el) el.remove();
    
    // Only remove styles if this is the last/only instance
    if (window.returnYouTubeDislike === this) {
        const styles = document.getElementById('ryd-persistent-styles');
        if (styles) styles.remove();
    }
    
    // Clear references for garbage collection
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

    // Only create new instance if video changed
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

        if (enabled) {
            window.returnYouTubeDislike = new ReturnYouTubeDislike(videoID);
            window.returnYouTubeDislike.init();
        }
    }
  };

  // Event listeners
  window.addEventListener('hashchange', handleHashChange, { passive: true });
  
  // Delayed init for SPA load
  if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => setTimeout(handleHashChange, 500));
  } else {
      setTimeout(handleHashChange, 500);
  }

  // Config change listener
  if (typeof configAddChangeListener === 'function') {
      configAddChangeListener('enableReturnYouTubeDislike', (evt) => {
          evt.detail.newValue ? handleHashChange() : cleanup();
      });
  }
  
  // Cleanup on unload
  window.addEventListener('beforeunload', cleanup, { passive: true });
}

export { ReturnYouTubeDislike };