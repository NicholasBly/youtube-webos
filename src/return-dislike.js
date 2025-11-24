import { configRead, configAddChangeListener } from './config.js';

class ReturnYouTubeDislike {
  constructor(videoID) {
    this.videoID = videoID;
    this.active = true;
    this.debugMode = false; // Can be set based on config
    
    this.dislikesCount = 0;
    
    this.timers = new Map();
    this.observers = new Set();
    
	this.panelContentObserver = null;
	this.bodyObserver = null;
  }
  
  // Logging system
  log(level, message, ...args) {
    const prefix = `[ReturnYouTubeDislike:${this.videoID}]`;
    if (level === 'debug' && !this.debugMode) {
      return;
    }
    // Simplified logger
    console.log(prefix, `[${level.toUpperCase()}]`, message, ...args);
  }

  // Centralized timer management
  setTimeout(callback, delay, name) {
    this.clearTimeout(name);
    const id = setTimeout(() => {
      this.timers.delete(name);
      callback();
    }, delay);
    this.timers.set(name, id);
    return id;
  }
  
  clearTimeout(name) {
    if (this.timers.has(name)) {
      clearTimeout(this.timers.get(name));
      this.timers.delete(name);
    }
  }
  
  clearAllTimers() {
    for (const [name, id] of this.timers) {
      clearTimeout(id);
    }
    this.timers.clear();
  }

  async init() {
    this.log('info', 'Initializing Return YouTube Dislike...');
    
    try {
      await this.fetchVideoData();
      if (this.dislikesCount > 0) {
        this.observeBodyForPanel();
      } else {
        this.log('info', 'No dislikes found, not observing panel.');
      }
    } catch (error) {
      this.log('error', 'Error during initialization:', error);
    }
  }

  async fetchVideoData() {
    if (!this.videoID) {
      this.log('warn', 'No video ID provided');
      return;
    }
    
    try {
      this.log('info', 'Fetching data for video:', this.videoID);
      
      const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${this.videoID}`);
      const data = await response.json();
      
      if (data && typeof data.dislikes === 'number') {
        this.dislikesCount = data.dislikes;
        this.log('info', 'Data received - Dislikes:', this.dislikesCount);
      } else {
        this.log('warn', 'Invalid data received:', data);
        this.dislikesCount = 0;
      }
    } catch (error) {
      this.log('error', 'Error fetching video data:', error);
      this.dislikesCount = 0;
    }
  }
  
  /**
   * (Observer 1) Watches the entire document for the description panel
   * being added or removed.
   */
  observeBodyForPanel() {
    this.cleanupObservers(); // Clear any old ones
    const panelSelector = 'ytlr-structured-description-content-renderer';
    
    this.bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Watch for the panel being ADDED
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.matches(panelSelector)) {
            this.log('info', 'Description panel added. Running check and attaching content observer.');
            // Run the check immediately
            this.checkAndInjectDislike(node);
            // Attach the persistent observer to this new panel
            this.attachContentObserver(node);
          }
        }
        // Watch for the panel being REMOVED
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.matches(panelSelector)) {
            this.log('info', 'Description panel removed. Disconnecting content observer.');
            // If the panel is removed, disconnect its observer
            if (this.panelContentObserver) {
              this.panelContentObserver.disconnect();
              this.panelContentObserver = null;
            }
          }
        }
      }
    });

    this.bodyObserver.observe(document.body, { childList: true, subtree: true });
    this.observers.add(this.bodyObserver);

    this.log('info', 'Watching document for description panel...');
    
    // Also, check if panel is *already* open on load
    const existingPanel = document.querySelector(panelSelector);
    if (existingPanel) {
      this.log('info', 'Panel already open. Running check and attaching observer.');
      this.checkAndInjectDislike(existingPanel);
      this.attachContentObserver(existingPanel);
    }
  }

  /**
   * (Observer 2) Attaches to a specific panel element and watches
   * its content for any changes, re-running the injection check.
   */
  attachContentObserver(panelElement) {
    // Disconnect any *previous* panel observer
    if (this.panelContentObserver) {
      this.panelContentObserver.disconnect();
    }
    
    this.panelContentObserver = new MutationObserver((mutations) => {
      // Any mutation inside the panel triggers a re-check
      this.log('debug', 'Panel content changed, re-running injection check.');
      this.checkAndInjectDislike(panelElement); 
    });
    
    // Observe the panel itself for any child or subtree changes
    this.panelContentObserver.observe(panelElement, { 
      childList: true, 
      subtree: true 
    });
    
    this.log('info', 'Attached persistent content observer to panel.');
  }

/**
   * REPLACEMENT METHOD
   * 1. Detects if we are in "Standard Mode" (WebOS 25+) or "Compact Mode" (WebOS 23).
   * 2. Sets the correct variables for that mode.
   * 3. Applies the layout fix and injects the dislike count.
   */
  checkAndInjectDislike(panelElement) {
    try {
      // --- 1. Feature Detection (Selector Strategy) ---
      const standardContainer = panelElement.querySelector('.ytLrVideoDescriptionHeaderRendererFactoidContainer');
      const compactContainer = panelElement.querySelector('.rznqCe');
      
      let container, factoidClass, valueSelector, labelSelector;
      
      if (standardContainer) {
        // "Standard Mode" -> WebOS 25 / New UI
        this.log('debug', 'Standard UI detected (WebOS 25/Regular).');
        container = standardContainer;
        factoidClass = '.ytLrVideoDescriptionHeaderRendererFactoid';
        valueSelector = '.ytLrVideoDescriptionHeaderRendererValue';
        labelSelector = '.ytLrVideoDescriptionHeaderRendererLabel';
      } else if (compactContainer) {
        // "Compact Mode" -> WebOS 23
        this.log('debug', 'Compact UI detected (WebOS 23).');
        container = compactContainer;
        factoidClass = '.nOJlw';
        valueSelector = '.axf6h';
        labelSelector = '.Ph2lNb';
      } else {
        // No recognizable container found yet
        return;
      }

      // --- 2. Apply Layout Fix (Universal) ---
      // Since both WebOS 25 and 23 can suffer from the "0-height/invisible items" bug,
      // we run the fix if *any* recognized UI is found.
      this.applyNaturalFlow(panelElement);

      // --- 3. Container Layout Fix ---
      // Ensure the stats row wraps correctly when we add the 4th item
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.justifyContent = 'center'; 
      container.style.gap = '1.5rem'; 
      container.style.height = 'auto';
      container.style.overflow = 'visible';

      // --- 4. Locate Likes Element ---
      const likesElement = container.querySelector(`div[aria-label*="likes"]${factoidClass}`) || 
                           container.querySelector(`div[aria-label*="Likes"]${factoidClass}`);

      if (!likesElement) return;

      // --- 5. Visual Cleanup (Date Element) ---
      const dateElement = container.querySelector('div[idomkey="factoid-2"]');
      if (dateElement) {
        dateElement.style.marginTop = '0'; 
        const vEl = dateElement.querySelector(valueSelector);
        const lEl = dateElement.querySelector(labelSelector);
        if(vEl) { vEl.style.display = 'inline-block'; vEl.style.marginRight = '0.4rem'; }
        if(lEl) { lEl.style.display = 'inline-block'; }
      }

      // --- 6. Dislike Injection ---
      if (container.querySelector('#ryd-dislike-factoid')) return;

      this.log('info', 'Injecting dislike count...');
      const dislikeElement = likesElement.cloneNode(true);
      dislikeElement.id = 'ryd-dislike-factoid';
      dislikeElement.setAttribute('idomkey', 'factoid-ryd');
      dislikeElement.style.flex = '0 0 auto'; 
      
      const valueElement = dislikeElement.querySelector(valueSelector); 
      const labelElement = dislikeElement.querySelector(labelSelector); 
      
      if (valueElement && labelElement) {
        const dislikeText = this.formatNumber(this.dislikesCount);
        valueElement.textContent = dislikeText; 
        labelElement.textContent = 'Dislikes';
        dislikeElement.setAttribute('aria-label', `${dislikeText} Dislikes`);
      }
      
      likesElement.insertAdjacentElement('afterend', dislikeElement);
      this.log('info', 'Successfully injected dislike count.');
      
    } catch (error) {
      this.log('error', 'Error during dislike injection check:', error);
    }
  }

  /**
   * HELPER: Forces "Natural Flow" and Enables LG Remote Navigation
   * Updated to support BOTH WebOS 23 (.TXB27d) and WebOS 25 (.ytVirtualListItem) classes.
   */
  applyNaturalFlow(panelElement) {
      // 1. Fix the Scroll Container
      const virtualList = panelElement.querySelector('yt-virtual-list');
      if (virtualList) {
          virtualList.style.height = 'auto';
          virtualList.style.overflow = 'visible';
          virtualList.style.display = 'block';
      }

      // 2. Fix the Wrapper
      const internalWrapper = panelElement.querySelector('.NUDen');
      if (internalWrapper) {
          internalWrapper.style.position = 'relative'; 
          internalWrapper.style.height = 'auto';      
          internalWrapper.style.width = '100%';
      }

      // 3. Fix Items & Enable Focus (Targets both old and new class names)
      const itemSelector = '.TXB27d, .ytVirtualListItem';
      const items = panelElement.querySelectorAll(itemSelector);
      
      items.forEach(item => {
          // Layout
          item.style.position = 'relative'; 
          item.style.transform = 'none';
          item.style.height = 'auto';
          item.style.marginBottom = '1rem'; 
          item.style.width = '100%';
          item.style.pointerEvents = 'auto';

          const focusable = item.querySelector('[hybridnavfocusable="true"]') || 
                            item.querySelector('[role="menuitem"]') || 
                            item.querySelector('button');
                            
          if (focusable) {
              focusable.setAttribute('tabindex', '0');
              // No background color listeners, preserving native UI style
          }
      });
      
      // 4. Expand Descriptions
      const descBody = panelElement.querySelector('ytlr-expandable-video-description-body-renderer');
      if (descBody) {
          descBody.style.height = 'auto';
          descBody.style.display = 'block';
          
          const sidesheet = descBody.querySelector('ytlr-sidesheet-item');
          if(sidesheet) {
              sidesheet.style.height = 'auto';
              sidesheet.style.display = 'block';
          }
      }
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
  }

	cleanupObservers() {
		if (this.bodyObserver) {
		  this.bodyObserver.disconnect();
		  this.observers.delete(this.bodyObserver);
		  this.bodyObserver = null;
		}
		
		if (this.panelContentObserver) {
		  this.panelContentObserver.disconnect();
		  this.panelContentObserver = null;
		}
		
		// Fallback for any other observers
		for (const observer of this.observers) {
		  try {
			observer.disconnect();
		  } catch (e) {
			// ignore
		  }
		}
		this.observers.clear();
	  }

  destroy() {
    this.log('info', 'Destroying ReturnYouTubeDislike instance.');
    this.active = false;
    
    this.clearAllTimers();
    this.cleanupObservers();
    
    // Clean up the DOM element if we added it
    const dislikeFactoid = document.getElementById('ryd-dislike-factoid');
    if (dislikeFactoid) {
      dislikeFactoid.remove();
    }
    
    this.videoID = null;
  }
}

// Global instance management
if (typeof window !== 'undefined') {
  window.returnYouTubeDislike = null;

  function uninitializeReturnYouTubeDislike() {
    if (window.returnYouTubeDislike) {
      try {
        window.returnYouTubeDislike.destroy();
      } catch (err) {
        console.warn('window.returnYouTubeDislike.destroy() failed!', err);
      }
      window.returnYouTubeDislike = null;
      console.info("[ReturnYouTubeDislike] Uninitialized.");
    }
  }

  const handleHashChangeForRYD = () => {
    let currentPath = '';
    let searchParamsString = '';
    
    try {
      const hash = window.location.hash;
      if (hash.startsWith('#')) {
        const pathAndQuery = hash.substring(1);
        const queryIndex = pathAndQuery.indexOf('?');
        if (queryIndex !== -1) {
          currentPath = pathAndQuery.substring(0, queryIndex);
          searchParamsString = pathAndQuery.substring(queryIndex);
        } else {
          currentPath = pathAndQuery;
        }
      }
    } catch (e) {
      console.error("[ReturnYouTubeDislike] Error parsing window.location.hash:", e);
      currentPath = "/";
    }

    const searchParams = new URLSearchParams(searchParamsString);
    const videoID = searchParams.get('v');

    console.info(`[ReturnYouTubeDislike] Hash changed. Path: '${currentPath}', Video ID: '${videoID}'`);

    if (currentPath !== '/watch' && window.returnYouTubeDislike) {
      console.info('[ReturnYouTubeDislike] Not on a /watch path. Uninitializing.');
      uninitializeReturnYouTubeDislike();
      return;
    }

    const needsReload = videoID && (!window.returnYouTubeDislike || window.returnYouTubeDislike.videoID !== videoID);

    if (needsReload) {
      console.info(`[ReturnYouTubeDislike] Video ID changed to ${videoID} or not initialized. Reloading.`);
      uninitializeReturnYouTubeDislike();

      let rydEnabled = true;
      try {
        rydEnabled = configRead('enableReturnYouTubeDislike');
      } catch (e) {
        console.warn("[ReturnYouTubeDislike] Could not read 'enableReturnYouTubeDislike' config. Defaulting to enabled. Error:", e);
      }
      
      if (rydEnabled) {
        console.info(`[ReturnYouTubeDislike] Enabled. Initializing for video ID: ${videoID}`);
        window.returnYouTubeDislike = new ReturnYouTubeDislike(videoID);
        window.returnYouTubeDislike.init();
      } else {
        console.info('[ReturnYouTubeDislike] Disabled in config. Not loading.');
      }
    } else if (!videoID && window.returnYouTubeDislike) {
      console.info('[ReturnYouTubeDislike] No video ID in URL. Uninitializing.');
      uninitializeReturnYouTubeDislike();
    }
  };

  // Listen for hash changes to handle navigation
  window.addEventListener('hashchange', handleHashChangeForRYD, false);

  // Also run on initial load
  if (document.readyState === 'complete') {
    setTimeout(handleHashChangeForRYD, 500);
  } else {
    window.addEventListener('load', () => setTimeout(handleHashChangeForRYD, 500));
  }

  // Listen for config changes
  try {
    configAddChangeListener('enableReturnYouTubeDislike', (evt) => {
      if (evt.detail.newValue) {
        handleHashChangeForRYD();
      } else if (window.returnYouTubeDislike) {
        uninitializeReturnYouTubeDislike();
      }
    });
  } catch (e) {
    console.warn('[ReturnYouTubeDislike] Could not set up config change listener:', e);
  }

} else {
  console.warn("ReturnYouTubeDislike: 'window' object not found.");
}

// Dummy implementations if not provided
if (typeof configRead === 'undefined') {
  console.warn("configRead function is not defined. Using dummy implementation.");
  window.configRead = function(key) {
    if (key === 'enableReturnYouTubeDislike') return true;
    return false;
  };
}

export { ReturnYouTubeDislike };