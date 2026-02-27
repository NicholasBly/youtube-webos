import { configRead, configAddChangeListener, configRemoveChangeListener } from './config';
import { debounce } from './utils';
import './watch.css';

class Watch {
  constructor() {
    // Standard properties
    this._watch = null;
    this._timer = null;
    this._globalListeners = [];
    
    // Constants
    this._PLAYER_SELECTOR = 'ytlr-watch-default'; // Kept specific to this clock feature if needed, or could use SELECTORS.PLAYER_CONTAINER if appropriate.
    this._DEBOUNCE_DELAY = 50;
	this._cachedPlayer = null;
    this._cachedOverlay = null;

    // Bind methods
    this.onOledChange = this.onOledChange.bind(this);
    this.updateVisibility = this.updateVisibility.bind(this);
    
    // Use shared debounce
    this.debouncedUpdate = debounce(this.updateVisibility, this._DEBOUNCE_DELAY);

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

  updateVisibility() {
    if (!this._watch) return;

    if (!this._cachedPlayer || !this._cachedPlayer.isConnected) {
        this._cachedPlayer = document.querySelector(this._PLAYER_SELECTOR);
    }
    
    if (!this._cachedPlayer) {
      if (this._watch.style.display !== 'block') {
         this._watch.style.display = 'block';
      }
      return;
    }

    if (!this._cachedOverlay || !this._cachedOverlay.isConnected) {
        this._cachedOverlay = document.querySelector('.AmQJbe');
    }

    const isHybridFocused = this._cachedPlayer.getAttribute('hybridnavfocusable') === 'true';
    const isPlayerElementActive = document.activeElement === this._cachedPlayer || document.activeElement === document.body;
    const isOverlayActive = !!this._cachedOverlay;

    const shouldHide = isHybridFocused || isPlayerElementActive || isOverlayActive;
    
    const newDisplay = shouldHide ? 'none' : 'block';
    
    if (this._watch.style.display !== newDisplay) {
      this._watch.style.display = newDisplay;
    }
  }

  setupGlobalListeners() {
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
    
    // Note: Debounce internal timer is managed by closure in shared helper, 
    // so strictly speaking we can't cancel it externally easily unless debounce returns a cancel method.
    // For this use case (UI visibility), letting a pending check run once after destroy is harmless, 
    // but the shared debounce usually doesn't expose cancel.
    // If strict cleanup is needed, update the shared debounce to return { run, cancel }.

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
  } else if (watchInstance) {
      watchInstance.destroy();
      watchInstance = null;
    }
}

toggleWatch(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  toggleWatch(evt.detail.newValue);
});