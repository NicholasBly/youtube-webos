import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import './watch.css';

class Watch {
  constructor() {
    // Standard properties (No '#' private fields for webOS 3 compatibility)
    this._watch = null;
    this._timer = null;
    this._debounceTimer = null;
    this._globalListeners = [];
    
    // Constants
    this._PLAYER_SELECTOR = 'ytlr-watch-default';
    this._DEBOUNCE_DELAY = 50;

    // Bind methods
    this.onOledChange = this.onOledChange.bind(this);
    this.updateVisibility = this.updateVisibility.bind(this);
    this.debouncedUpdate = this.debouncedUpdate.bind(this);

    // Initialize
    this.createElement();
    this.startClock();
    this.setupGlobalListeners();
    
    this.applyOledMode(configRead('enableOledCareMode'));
    configAddChangeListener('enableOledCareMode', this.onOledChange);

    // Initial check
    this.updateVisibility();
  }

  onOledChange(evt) {
    this.applyOledMode(evt.detail.newValue);
  }

  applyOledMode(enabled) {
    if (this._watch) {
      // Chrome 38 supports classList.toggle with second argument
      this._watch.classList.toggle('oled-mode', enabled);
    }
  }

  createElement() {
    this._watch = document.createElement('div');
    this._watch.className = 'webOs-watch';
    // Accessibility helper
    this._watch.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._watch);
  }

  startClock() {
    const nextSeg = (60 - new Date().getSeconds()) * 1000;

    // Intl is supported in Chrome 24+, safe for webOS 3
    const formatter = new Intl.DateTimeFormat(navigator.language, {
      hour: 'numeric',
      minute: 'numeric'
    });

    const setTime = () => {
      if (this._watch) {
        // textContent is faster than innerText (Optimization Kept)
        this._watch.textContent = formatter.format(new Date());
        
        // Safety check on the minute mark
        this.updateVisibility();
      }
    };

    setTime();
    setTimeout(() => {
      setTime();
      this._timer = setInterval(setTime, 60000);
    }, nextSeg);
  }

  debouncedUpdate() {
    // Debounce rapid visibility updates (Optimization Kept)
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this.updateVisibility();
      this._debounceTimer = null;
    }, this._DEBOUNCE_DELAY);
  }

  updateVisibility() {
    if (!this._watch) return;

    // Direct query is safer than MutationObserver on old hardware
    const player = document.querySelector(this._PLAYER_SELECTOR);
    
    // If player doesn't exist (Home Screen), Clock is Visible
    if (!player) {
      if (this._watch.style.display !== 'block') {
         this._watch.style.display = 'block';
      }
      return;
    }

    const isPlayerFocused = document.activeElement === player;
    const shouldShow = !isPlayerFocused;
    
    // Conditional Reflow: Only touch DOM if value changed (Optimization Kept)
    const newDisplay = shouldShow ? 'block' : 'none';
    
    if (this._watch.style.display !== newDisplay) {
      this._watch.style.display = newDisplay;
    }
  }

  setupGlobalListeners() {
    // webOS 3 (Chrome 38) does not support passive options object.
    // We use boolean 'true' for capture.
    
    const addListener = (type, handler) => {
      document.addEventListener(type, handler, true);
      this._globalListeners.push({ type, fn: handler });
    };

    addListener('focusin', this.debouncedUpdate);
    addListener('play', this.debouncedUpdate);
    addListener('pause', this.debouncedUpdate);
    addListener('loadeddata', this.debouncedUpdate);
    // Added focusout to catch blur events just in case
    addListener('focusout', this.debouncedUpdate); 
  }

  destroy() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    configRemoveChangeListener('enableOledCareMode', this.onOledChange);
    
    this._globalListeners.forEach(l => {
      document.removeEventListener(l.type, l.fn, true);
    });
    this._globalListeners = [];
    
    if (this._watch) {
      this._watch.remove();
      this._watch = null;
    }
  }
}

let watchInstance = null;

function toggleWatch(show) {
  if (show) {
    if (!watchInstance) {
      watchInstance = new Watch();
    }
  } else {
    if (watchInstance) {
      watchInstance.destroy();
      watchInstance = null;
    }
  }
}

toggleWatch(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  toggleWatch(evt.detail.newValue);
});