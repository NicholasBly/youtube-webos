import { configRead, configAddChangeListener } from './config.js';

class ReturnYouTubeDislike {
  constructor(videoID) {
    this.videoID = videoID;
    this.active = true;
    this.debugMode = false;
    this.dislikesCount = 0;
    
    this.timers = new Map();
    this.observers = new Set();

    this.selectors = {
        panel: 'ytlr-structured-description-content-renderer',
        standardContainer: '.ytLrVideoDescriptionHeaderRendererFactoidContainer',
        compactContainer: '.rznqCe',
        items: '.TXB27d, .ytVirtualListItem',
        virtualList: 'yt-virtual-list',
        internalWrapper: '.NUDen'
    };

    this.uiMode = null; 

    this.handleBodyMutation = this.handleBodyMutation.bind(this);
    this.handlePanelMutation = this.handlePanelMutation.bind(this);
  }

  log(level, message, ...args) {
    if (level === 'debug' && !this.debugMode) return;
    console.log(`[RYD:${this.videoID}] [${level.toUpperCase()}]`, message, ...args);
  }

  // --- Timer Management ---
  setTimeout(callback, delay, name) {
    this.clearTimeout(name);
    if (!this.active) return null; 

    const id = setTimeout(() => {
      this.timers.delete(name);
      if (this.active) callback();
    }, delay);
    this.timers.set(name, id);
    return id;
  }
  
  clearTimeout(name) {
    const id = this.timers.get(name);
    if (id) {
      clearTimeout(id);
      this.timers.delete(name);
    }
  }
  
  clearAllTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  // --- Initialization ---
  async init() {
    this.log('info', 'Initializing...');
    try {
      await this.fetchVideoData();
      if (!this.active) return; 

      if (this.dislikesCount > 0) {
        this.observeBodyForPanel();
      }
    } catch (error) {
      this.log('error', 'Init error:', error);
    }
  }

  async fetchVideoData() {
    if (!this.videoID) return;
    try {
      const response = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${this.videoID}`);
      const data = await response.json();
      this.dislikesCount = data?.dislikes || 0;
      this.log('info', 'Dislikes loaded:', this.dislikesCount);
    } catch (error) {
      this.log('error', 'Fetch error:', error);
      this.dislikesCount = 0;
    }
  }

  // --- Observer Logic ---
  observeBodyForPanel() {
    this.cleanupBodyObserver();
    
    this.bodyObserver = new MutationObserver(this.handleBodyMutation);
    this.bodyObserver.observe(document.body, { childList: true, subtree: true });
    this.observers.add(this.bodyObserver);
    this.log('info', 'Watching body for panel...');

    const existingPanel = document.querySelector(this.selectors.panel);
    if (existingPanel) {
      this.setupPanel(existingPanel);
    }
  }

  handleBodyMutation(mutations) {
    if (!this.active) return;

    let nodesAdded = false;
    for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
            nodesAdded = true;
            break;
        }
    }
    if (!nodesAdded) return;

    this.setTimeout(() => {
        const panel = document.querySelector(this.selectors.panel);
        if (panel) {
            this.setupPanel(panel);
        }
    }, 50, 'findPanelDebounce');
  }

  setupPanel(panel) {
      if (!this.active) return;
      this.checkAndInjectDislike(panel);
      this.attachContentObserver(panel);
  }

  attachContentObserver(panelElement) {
    if (this.panelContentObserver) this.panelContentObserver.disconnect();

    this.panelContentObserver = new MutationObserver(this.handlePanelMutation);
    this.panelContentObserver.observe(panelElement, { childList: true, subtree: true });
    this.log('info', 'Attached localized observer to panel.');
  }

  handlePanelMutation() {
      if (!this.active) return;
      this.setTimeout(() => {
          const panel = document.querySelector(this.selectors.panel);
          if (panel) this.checkAndInjectDislike(panel);
      }, 100, 'injectDebounce');
  }

  // --- Core Logic ---

  checkAndInjectDislike(panelElement) {
    if (!this.active) return;

    // 1. EARLY EXIT
    if (document.getElementById('ryd-dislike-factoid')) return;

    try {
      const standardContainer = panelElement.querySelector(this.selectors.standardContainer);
      const compactContainer = panelElement.querySelector(this.selectors.compactContainer);

      let container, factoidClass, valueSelector, labelSelector;

      if (standardContainer) {
        this.uiMode = 'standard';
        container = standardContainer;
        factoidClass = '.ytLrVideoDescriptionHeaderRendererFactoid';
        valueSelector = '.ytLrVideoDescriptionHeaderRendererValue';
        labelSelector = '.ytLrVideoDescriptionHeaderRendererLabel';
      } else if (compactContainer) {
        this.uiMode = 'compact';
        container = compactContainer;
        factoidClass = '.nOJlw';
        valueSelector = '.axf6h';
        labelSelector = '.Ph2lNb';
      } else {
        return;
      }

      const likesElement = container.querySelector(`div[aria-label*="likes"]${factoidClass}`) || 
                           container.querySelector(`div[aria-label*="Likes"]${factoidClass}`);

      if (!likesElement) return;

      const dateElement = container.querySelector('div[idomkey="factoid-2"]');
      
      this.applyNaturalFlow(panelElement);

      container.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:center; gap:1.5rem; height:auto; overflow:visible;';

      if (dateElement) {
        dateElement.style.marginTop = '0';
        const vEl = dateElement.querySelector(valueSelector);
        const lEl = dateElement.querySelector(labelSelector);
        if(vEl) vEl.style.cssText += 'display:inline-block; margin-right:0.4rem;';
        if(lEl) lEl.style.cssText += 'display:inline-block;';
      }

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

    } catch (error) {
      this.log('error', 'Injection error:', error);
    }
  }

  applyNaturalFlow(panelElement) {
      const virtualList = panelElement.querySelector(this.selectors.virtualList);
      if (virtualList) virtualList.style.cssText += 'height:auto; overflow:visible; display:block;';

      const internalWrapper = panelElement.querySelector(this.selectors.internalWrapper);
      if (internalWrapper) internalWrapper.style.cssText += 'position:relative; height:auto; width:100%;';

      const items = panelElement.querySelectorAll(this.selectors.items);
      const len = items.length;
      
      for (let i = 0; i < len; i++) {
          const item = items[i];
          item.style.cssText += 'position:relative; transform:none; height:auto; margin-bottom:1rem; width:100%; pointer-events:auto;';
          
          const focusable = item.firstElementChild?.tagName === 'BUTTON' ? item.firstElementChild : item.querySelector('[tabindex]');
          if (focusable) focusable.setAttribute('tabindex', '0');
      }

      const descBody = panelElement.querySelector('ytlr-expandable-video-description-body-renderer');
      if (descBody) {
          descBody.style.cssText += 'height:auto; display:block;';
          const sidesheet = descBody.querySelector('ytlr-sidesheet-item');
          if (sidesheet) sidesheet.style.cssText += 'height:auto; display:block;';
      }
  }

  formatNumber(num) {
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
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
    if (this.panelContentObserver) {
        this.panelContentObserver.disconnect();
        this.panelContentObserver = null;
    }
  }

  destroy() {
    this.log('info', 'Destroying...');
    this.active = false; 
    
    this.clearAllTimers();
    this.cleanupObservers();
    
    const el = document.getElementById('ryd-dislike-factoid');
    if (el) el.remove();
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
            try { enabled = configRead('enableReturnYouTubeDislike'); } catch(e) {}
        }

        if (enabled) {
            window.returnYouTubeDislike = new ReturnYouTubeDislike(videoID);
            window.returnYouTubeDislike.init();
        }
    }
  };

  window.addEventListener('hashchange', handleHashChange, { passive: true });
  window.addEventListener('load', () => setTimeout(handleHashChange, 500));

  if (typeof configAddChangeListener === 'function') {
      configAddChangeListener('enableReturnYouTubeDislike', (evt) => {
          evt.detail.newValue ? handleHashChange() : cleanup();
      });
  }
}

export { ReturnYouTubeDislike };