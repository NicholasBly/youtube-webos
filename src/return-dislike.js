import { configRead, configAddChangeListener } from './config.js';
import { showNotification } from './ui.js';
import { waitForChildAdd } from './utils.js';

class ReturnYouTubeDislike {
  constructor(videoID) {
    this.videoID = videoID;
    this.active = true;
    this.debugMode = false; // Can be set based on config
    
    this.likesCount = 0;
    this.dislikesCount = 0;
    this.isLiked = false;
    this.isDisliked = false;
    
    // Centralized management like SponsorBlock
    this.timers = new Map();
    this.observers = new Set();
    this.eventListeners = new Map();
    
    // Caching
    this.cachedElements = new Map();
	
    this.selectors = {
        likeButton: [
            // WebOS 24 selector
            'ytlr-toggle-button-renderer[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON"] ytlr-button[role="button"]',
            // WebOS 23 selector
            'ytlr-like-button-renderer[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON"] ytlr-button[idomkey="like-button"]'
        ],
        dislikeButton: [
            // WebOS 24 selector
            'ytlr-toggle-button-renderer[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_DISLIKE_BUTTON"] ytlr-button[role="button"]',
            // WebOS 23 selector
            'ytlr-like-button-renderer[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON"] ytlr-button[idomkey="dislike-button"]'
        ]
    };
    
    // Popup management
    this.popupCounter = 0;
    this.currentPopup = null;
    
    // Debouncing for state changes
    this.lastStateChangeTime = 0;
    this.stateChangeDebounceMs = 300; // 300ms debounce
    this.lastKnownLikedState = false;
    this.lastKnownDislikedState = false;
    
    this.log('info', `ReturnYouTubeDislike created for videoID: ${videoID}`);
    this.addStyles();
  }

  // Logging system (same pattern as SponsorBlock)
  log(level, message, ...args) {
    const prefix = `[ReturnYouTubeDislike:${this.videoID}]`;
    
    if (level === 'debug' && !this.debugMode) {
      return;
    }
    
    switch (level) {
      case 'error':
        console.error(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'info':
        console.info(prefix, message, ...args);
        break;
      case 'debug':
        console.log(prefix, '[DEBUG]', message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
    }
  }

  // Centralized timer management (same as SponsorBlock)
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

  // Event listener management (same as SponsorBlock)
  addEventListener(element, event, handler, name) {
    const key = `${name || 'unnamed'}_${event}`;
    
    // Remove existing listener if present
    this.removeEventListener(element, event, key);
    
    // Add new listener
    element.addEventListener(event, handler);
    this.eventListeners.set(key, { element, event, handler });
  }
  
  removeEventListener(element, event, key) {
    if (this.eventListeners.has(key)) {
      const { element: el, event: ev, handler } = this.eventListeners.get(key);
      el.removeEventListener(ev, handler);
      this.eventListeners.delete(key);
    }
  }
  
  removeAllEventListeners() {
    for (const [key, { element, event, handler }] of this.eventListeners) {
      element.removeEventListener(event, handler);
    }
    this.eventListeners.clear();
  }

  // Cached DOM element retrieval
  getElement(type, maxAge = 1000) {
    const now = Date.now();
    const cached = this.cachedElements.get(type);
    
    if (cached && (now - cached.timestamp) < maxAge && document.contains(cached.element)) {
      return cached.element;
    }
    
    let element = null;
    
    // Check if the type exists in our new selectors list
    if (this.selectors[type]) {
        // Iterate through the array of selectors
        for (const selector of this.selectors[type]) {
            element = document.querySelector(selector);
            if (element) {
                // Found a match, stop searching
                this.log('debug', `Found ${type} using selector: ${selector}`);
                break; 
            }
        }
    }
    
    if (element) {
      this.cachedElements.set(type, { element, timestamp: now });
    } else {
      this.log('debug', `Could not find ${type} after checking ${this.selectors[type]?.length || 0} selectors.`);
    }
    
    return element;
  }

  addStyles() {
    const style = document.createElement('style');
    style.id = 'return-youtube-dislike-styles';
    style.textContent = `
      .ryd-popup {
        position: fixed;
        background-color: #373737;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      }
      
      .ryd-popup.show {
        opacity: 1;
        transform: translateY(0);
      }
      
      .ryd-popup::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #373737;
      }
    `;
    document.head.appendChild(style);
  }

  async init() {
    this.log('info', 'Initializing Return YouTube Dislike...');
    
    try {
      await this.fetchVideoData();
      this.waitForButtons();
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
      
      if (data && typeof data.likes === 'number' && typeof data.dislikes === 'number') {
        this.likesCount = data.likes;
        this.dislikesCount = data.dislikes;
        this.log('info', 'Data received - Likes:', this.likesCount, 'Dislikes:', this.dislikesCount);
      } else {
        this.log('warn', 'Invalid data received:', data);
        this.likesCount = 0;
        this.dislikesCount = 0;
      }
    } catch (error) {
      this.log('error', 'Error fetching video data:', error);
      this.likesCount = 0;
      this.dislikesCount = 0;
    }
  }

  waitForButtons() {
    this.clearTimeout('waitForButtons');
    
    // First check if transport controls are available and focusable
    const transportControls = document.querySelector('ytlr-transport-controls-renderer[idomkey="transport-controls"]');
    
    if (!transportControls) {
      this.log('debug', 'Transport controls not found, retrying...');
      this.setTimeout(() => this.waitForButtons(), 250, 'waitForButtons');
      return;
    }
    
    const isControlsVisible = transportControls.getAttribute('hybridnavfocusable') === 'true';
    
    if (!isControlsVisible) {
      this.log('debug', 'Transport controls not focusable (hybridnavfocusable=false), setting up observer...');
      this.setupTransportControlsObserver(transportControls);
      return;
    }
    
    // Controls are visible, now look for buttons
    const likeButton = this.getElement('likeButton');
    const dislikeButton = this.getElement('dislikeButton');
    
    if (likeButton && dislikeButton) {
      this.log('info', 'Buttons found, setting up listeners');
      this.setupButtonListeners();
      return;
    }
    
    this.log('debug', 'Controls visible but buttons not found, retrying...');
    this.setTimeout(() => this.waitForButtons(), 100, 'waitForButtons');
  }

  setupTransportControlsObserver(transportControls) {
    // Clean up any existing observer
    this.cleanupTransportControlsObserver();
    
    this.transportControlsObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && 
            mutation.attributeName === 'hybridnavfocusable' &&
            mutation.target.getAttribute('hybridnavfocusable') === 'true') {
          
          this.log('info', 'Transport controls became focusable, looking for buttons...');
          this.cleanupTransportControlsObserver();
          
          // Small delay to let buttons render
          this.setTimeout(() => this.waitForButtons(), 50, 'waitForButtons');
          break;
        }
      }
    });
    
    this.transportControlsObserver.observe(transportControls, {
      attributes: true,
      attributeFilter: ['hybridnavfocusable']
    });
    
    this.observers.add(this.transportControlsObserver);
    this.log('debug', 'Set up observer for transport controls visibility');
  }

  cleanupTransportControlsObserver() {
    if (this.transportControlsObserver) {
      this.transportControlsObserver.disconnect();
      this.observers.delete(this.transportControlsObserver);
      this.transportControlsObserver = null;
    }
  }

  setupButtonListeners() {
    this.removeAllEventListeners();
    
    const likeButton = this.getElement('likeButton');
    const dislikeButton = this.getElement('dislikeButton');
    
    if (likeButton) {
      // Only add hover events for popups, no click events
      this.addHoverListener(likeButton, 'like');
    }
    
    if (dislikeButton) {
      // Only add hover events for popups, no click events
      this.addHoverListener(dislikeButton, 'dislike');
    }
    
    // Update initial state and set up mutation observer for state changes
    this.updateButtonState();
    this.lastKnownLikedState = this.isLiked;
    this.lastKnownDislikedState = this.isDisliked;
    this.setupButtonVisibilityObserver();
  }

  addHoverListener(button, type) {
    this.log('info', `Setting up ${type} button hover listener`);
    
    // For TV remote navigation (focus-based)
    const focusHandler = (e) => {
      this.log('debug', `${type} button focused`);
      this.showPopup(button, type);
    };
    
    const blurHandler = (e) => {
      this.log('debug', `${type} button blurred`);
      // Small delay to allow moving between buttons
      this.setTimeout(() => {
        this.removeAllPopups();
      }, 50, 'popupRemovalTimeout');
    };
    
    // For mouse cursor navigation
    const mouseEnterHandler = (e) => {
      this.log('debug', `${type} button mouse enter`);
      this.clearTimeout('popupRemovalTimeout'); // Cancel any pending removal
      this.showPopup(button, type);
    };
    
    const mouseLeaveHandler = (e) => {
      this.log('debug', `${type} button mouse leave`);
      // Small delay to allow cursor to move to popup
      this.setTimeout(() => {
        this.removeAllPopups();
      }, 100, 'popupRemovalTimeout');
    };
    
    this.addEventListener(button, 'focus', focusHandler, `${type}_focus`);
    this.addEventListener(button, 'blur', blurHandler, `${type}_blur`);
    this.addEventListener(button, 'mouseenter', mouseEnterHandler, `${type}_mouseenter`);
    this.addEventListener(button, 'mouseleave', mouseLeaveHandler, `${type}_mouseleave`);
    
    this.log('info', `${type} button hover listeners set up successfully`);
  }

  testButtonInteraction(button, type) {
    this.log('info', `Testing ${type} button interaction...`);
    
    // For TV remote navigation (focus-based)
    const focusHandler = (e) => {
      this.log('debug', `${type} button focused`);
      this.showPopup(button, type);
    };
    
    const blurHandler = (e) => {
      this.log('debug', `${type} button blurred`);
      // Small delay to allow moving between buttons
      this.setTimeout(() => {
        this.removeAllPopups();
      }, 50, 'popupRemovalTimeout');
    };
    
    // For mouse cursor navigation
    const mouseEnterHandler = (e) => {
      this.log('debug', `${type} button mouse enter`);
      this.clearTimeout('popupRemovalTimeout'); // Cancel any pending removal
      this.showPopup(button, type);
    };
    
    const mouseLeaveHandler = (e) => {
      this.log('debug', `${type} button mouse leave`);
      // Small delay to allow cursor to move to popup
      this.setTimeout(() => {
        this.removeAllPopups();
      }, 100, 'popupRemovalTimeout');
    };
    
    // Add event listeners to outer button
    button.addEventListener('focus', focusHandler);
    button.addEventListener('blur', blurHandler);
    button.addEventListener('mouseenter', mouseEnterHandler);
    button.addEventListener('mouseleave', mouseLeaveHandler);
    
    const innerButton = button.querySelector('ytlr-button');
    if (innerButton) {
      // Also add to inner button for redundancy
      innerButton.addEventListener('focus', focusHandler);
      innerButton.addEventListener('blur', blurHandler);
      innerButton.addEventListener('mouseenter', mouseEnterHandler);
      innerButton.addEventListener('mouseleave', mouseLeaveHandler);
    }
  }

  setupPopupMouseHandling(button, type) {
    // Add a small delay before removing popup on mouseleave to handle
    // cases where cursor briefly moves over the popup
    this.popupMouseTimeout = null;
    
    const originalRemovePopup = this.removePopup.bind(this);
    this.removePopup = () => {
      // Clear any existing timeout
      if (this.popupMouseTimeout) {
        clearTimeout(this.popupMouseTimeout);
      }
      
      // Add small delay to allow cursor to move back to button
      this.popupMouseTimeout = setTimeout(() => {
        originalRemovePopup();
      }, 100);
    };
    
    // Override for immediate removal when needed
    this.removePopupImmediate = originalRemovePopup;
  }

  setupButtonVisibilityObserver() {
    // Clean up existing observer
    this.cleanupButtonVisibilityObserver();
    
    const likeButton = this.getElement('likeButton');
    const dislikeButton = this.getElement('dislikeButton');
    
    if (!likeButton && !dislikeButton) return;
    
    // Watch for attribute changes that might indicate state changes
    this.buttonVisibilityObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          const attributeName = mutation.attributeName;
          
          if (attributeName === 'aria-pressed' && target.matches('ytlr-button')) {
            this.log('debug', `Button aria-pressed changed: ${target.getAttribute('aria-pressed')}`, target);
            
            // Debounce state changes to prevent multiple rapid updates
            this.debounceStateChange();
            break;
          }
        }
      }
    });
    
    // Observe both buttons and their children
    [likeButton, dislikeButton].forEach(button => {
      if (button) {
        this.buttonVisibilityObserver.observe(button, {
          attributes: true,
          subtree: true,
          attributeFilter: ['aria-pressed']
        });
      }
    });
    
    this.observers.add(this.buttonVisibilityObserver);
    this.log('info', 'Set up button visibility observer');
  }

  debounceStateChange() {
    const now = Date.now();
    
    // Clear any existing debounce timer
    this.clearTimeout('stateChangeDebounce');
    
    // Set a new timer to process the state change
    this.setTimeout(() => {
      this.processStateChange();
    }, this.stateChangeDebounceMs, 'stateChangeDebounce');
  }

  processStateChange() {
    // Get previous state
    const wasLiked = this.lastKnownLikedState;
    const wasDisliked = this.lastKnownDislikedState;
    
    // Update current state
    this.updateButtonState();
    
    // Check if state actually changed
    if (this.isLiked === wasLiked && this.isDisliked === wasDisliked) {
      this.log('debug', 'No actual state change detected, ignoring');
      return;
    }
    
    this.log('info', `State change detected - was(liked:${wasLiked}, disliked:${wasDisliked}) -> now(liked:${this.isLiked}, disliked:${this.isDisliked})`);
    
    // Determine which button changed and handle the logic
    let buttonChanged = null;
    let changeType = null;
    
    if (this.isLiked !== wasLiked) {
      this.handleLikeStateChange(wasLiked, this.isLiked);
      buttonChanged = this.getElement('likeButton');
      changeType = 'like';
    }
    
    if (this.isDisliked !== wasDisliked) {
      this.handleDislikeStateChange(wasDisliked, this.isDisliked);
      buttonChanged = this.getElement('dislikeButton');
      changeType = 'dislike';
    }
    
    // Update our known state
    this.lastKnownLikedState = this.isLiked;
    this.lastKnownDislikedState = this.isDisliked;
    
    this.log('info', `Final counts - Likes: ${this.likesCount}, Dislikes: ${this.dislikesCount}`);
    
    // Show popup for the changed button
    if (buttonChanged && changeType) {
      this.showClickPopup(buttonChanged, changeType);
    }
  }

  handleLikeStateChange(wasLiked, isLiked) {
    if (!wasLiked && isLiked) {
      // User just liked
      this.likesCount++;
      if (this.lastKnownDislikedState) {
        // Was disliked, now liked - remove the dislike
        this.dislikesCount = Math.max(0, this.dislikesCount - 1);
      }
    } else if (wasLiked && !isLiked) {
      // User just un-liked
      this.likesCount = Math.max(0, this.likesCount - 1);
    }
  }

  handleDislikeStateChange(wasDisliked, isDisliked) {
    if (!wasDisliked && isDisliked) {
      // User just disliked
      this.dislikesCount++;
      if (this.lastKnownLikedState) {
        // Was liked, now disliked - remove the like
        this.likesCount = Math.max(0, this.likesCount - 1);
      }
    } else if (wasDisliked && !isDisliked) {
      // User just un-disliked
      this.dislikesCount = Math.max(0, this.dislikesCount - 1);
    }
  }

  showClickPopup(button, type) {
    // Show popup briefly for click feedback
    this.showPopup(button, type);
    
    // Remove after 1.5 seconds for click feedback
    this.setTimeout(() => {
      this.removeAllPopups();
    }, 1500, 'clickPopupTimeout');
  }

  cleanupButtonVisibilityObserver() {
    if (this.buttonVisibilityObserver) {
      this.buttonVisibilityObserver.disconnect();
      this.observers.delete(this.buttonVisibilityObserver);
      this.buttonVisibilityObserver = null;
    }
  }

  addButtonListener(button, type) {
    this.log('info', `Setting up ${type} button listener`);
    
    const clickHandler = (event) => {
      this.log('info', `${type} button clicked!`, event);
      this.handleButtonClick(button, type, event);
    };
    
    const focusHandler = () => {
      this.log('debug', `${type} button focused`);
      this.updateButtonState();
    };
    
    // Try multiple event types to catch interactions
    this.addEventListener(button, 'click', clickHandler, `${type}_click`);
    this.addEventListener(button, 'mousedown', clickHandler, `${type}_mousedown`);
    this.addEventListener(button, 'focus', focusHandler, `${type}_focus`);
    
    // Also listen on the inner ytlr-button element
    const innerButton = button.querySelector('ytlr-button');
    if (innerButton) {
      this.log('debug', `Found inner button for ${type}, adding listeners`);
      this.addEventListener(innerButton, 'click', clickHandler, `${type}_inner_click`);
      this.addEventListener(innerButton, 'mousedown', clickHandler, `${type}_inner_mousedown`);
    }
    
    this.log('info', `${type} button listeners set up successfully`);
  }

  handleButtonClick(button, type, event) {
    this.log('info', 'Button clicked:', type);
    
    // Update our internal state based on current button state
    this.updateButtonState();
    
    // Simulate the state change that will happen
    if (type === 'like') {
      if (this.isLiked) {
        // Unlike
        this.likesCount = Math.max(0, this.likesCount - 1);
        this.isLiked = false;
      } else {
        // Like
        this.likesCount++;
        this.isLiked = true;
        
        // If previously disliked, remove dislike
        if (this.isDisliked) {
          this.dislikesCount = Math.max(0, this.dislikesCount - 1);
          this.isDisliked = false;
        }
      }
    } else if (type === 'dislike') {
      if (this.isDisliked) {
        // Un-dislike
        this.dislikesCount = Math.max(0, this.dislikesCount - 1);
        this.isDisliked = false;
      } else {
        // Dislike
        this.dislikesCount++;
        this.isDisliked = true;
        
        // If previously liked, remove like
        if (this.isLiked) {
          this.likesCount = Math.max(0, this.likesCount - 1);
          this.isLiked = false;
        }
      }
    }
    
    // Show popup with updated counts
    this.showPopup(button, type);
  }

	updateButtonState() {
		const likeButton = this.getElement('likeButton');
		const dislikeButton = this.getElement('dislikeButton');
		
		if (likeButton) {
		  // const ytlrButton = likeButton.querySelector('ytlr-button'); // No longer needed
		  const oldState = this.isLiked;
		  this.isLiked = likeButton && likeButton.getAttribute('aria-pressed') === 'true'; // Read from the button directly
		  if (oldState !== this.isLiked) {
			this.log('debug', `Like state changed: ${oldState} -> ${this.isLiked}`);
		  }
		}
		
		if (dislikeButton) {
		  // const ytlrButton = dislikeButton.querySelector('ytlr-button'); // No longer needed
		  const oldState = this.isDisliked;
		  this.isDisliked = dislikeButton && dislikeButton.getAttribute('aria-pressed') === 'true'; // Read from the button directly
		  if (oldState !== this.isDisliked) {
			this.log('debug', `Dislike state changed: ${oldState} -> ${this.isDisliked}`);
		  }
		}
	  }

  showPopup(button, type) {
    // Always remove existing popup first
    this.removeAllPopups();
    
    const count = type === 'like' ? this.likesCount : this.dislikesCount;
    const text = type === 'like' ? 
      `${this.formatNumber(count)} like${count !== 1 ? 's' : ''}` :
      `${this.formatNumber(count)} dislike${count !== 1 ? 's' : ''}`;
    
    // Create unique ID for this popup
    this.popupCounter++;
    const popupId = `ryd-popup-${this.videoID}-${this.popupCounter}`;
    
    const popup = document.createElement('div');
    popup.className = 'ryd-popup';
    popup.textContent = text;
    popup.id = popupId;
    popup.setAttribute('data-ryd-popup', 'true'); // Add marker for easy cleanup
    
    // Store reference to current popup
    this.currentPopup = popup;
    
    // Position the popup above the button
    const rect = button.getBoundingClientRect();
    popup.style.left = `${rect.left + (rect.width / 2)}px`;
    popup.style.top = `${rect.top - 50}px`;
    popup.style.transform = 'translateX(-50%) translateY(10px)';
    
    // Add mouse event handlers to the popup itself
    popup.addEventListener('mouseenter', () => {
      this.log('debug', 'Mouse entered popup');
      // Cancel any pending removal
      this.clearTimeout('popupRemovalTimeout');
    });
    
    popup.addEventListener('mouseleave', () => {
      this.log('debug', 'Mouse left popup');
      // Remove popup when leaving the popup area
      this.removeAllPopups();
    });
    
    document.body.appendChild(popup);
    
    // Trigger animation
    requestAnimationFrame(() => {
      if (popup.parentNode) { // Make sure it's still in DOM
        popup.classList.add('show');
      }
    });
    
    this.log('debug', `Created popup with ID: ${popupId}`);
  }

  removeAllPopups() {
    // Clear any pending timers
    this.clearTimeout('popupRemovalTimeout');
    this.clearTimeout('clickPopupTimeout');
    
    // Remove ALL RYD popups, not just the one with current ID
    const allRydPopups = document.querySelectorAll('[data-ryd-popup="true"]');
    
    this.log('debug', `Removing ${allRydPopups.length} popup(s)`);
    
    allRydPopups.forEach(popup => {
      if (popup.parentNode) {
        popup.classList.remove('show');
        // Remove immediately to prevent accumulation
        popup.parentNode.removeChild(popup);
      }
    });
    
    // Clear current popup reference
    this.currentPopup = null;
    
    // Also clean up any old popups with the old ID system as fallback
    const oldPopups = document.querySelectorAll('#ryd-current-popup');
    oldPopups.forEach(popup => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
  }

  removePopup() {
    // Just call removeAllPopups for consistency
    this.removeAllPopups();
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
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch (e) {
        this.log('warn', 'Failed to disconnect observer:', e);
      }
    }
    this.observers.clear();
    this.cleanupTransportControlsObserver();
    this.cleanupButtonVisibilityObserver();
  }

  cleanupDOM() {
    this.removeAllPopups();
    
    // Remove injected styles
    const style = document.getElementById('return-youtube-dislike-styles');
    if (style) {
      style.remove();
    }
  }

  destroy() {
    this.log('info', 'Destroying ReturnYouTubeDislike instance.');
    this.active = false;
    
    // Use centralized cleanup methods
    this.clearAllTimers();
    this.removeAllEventListeners();
    this.cleanupObservers();
    this.cleanupDOM();
    
    // Clear caches
    this.cachedElements?.clear();
    
    // Clear references
    this.videoID = null;
    this.transportControlsObserver = null;
    this.buttonVisibilityObserver = null;
    this.currentPopup = null;
  }
}

// Global instance management (same pattern as SponsorBlock)
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
      console.info("ReturnYouTubeDislike uninitialized.");
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
      console.error("Error parsing window.location.hash:", e);
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

  // Listen for hash changes to handle navigation within the YouTube single-page app
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
        // Re-run hash change handler to initialize if we're on a watch page
        handleHashChangeForRYD();
      } else if (window.returnYouTubeDislike) {
        uninitializeReturnYouTubeDislike();
      }
    });
  } catch (e) {
    console.warn('[ReturnYouTubeDislike] Could not set up config change listener:', e);
  }

} else {
  console.warn("ReturnYouTubeDislike: 'window' object not found. Running in a non-browser environment?");
}

// Dummy implementations if not provided by WebOS environment
if (typeof configRead === 'undefined') {
  console.warn("configRead function is not defined. Using dummy implementation.");
  window.configRead = function(key) {
    if (key === 'enableReturnYouTubeDislike') return true;
    return false;
  };
}

if (typeof showNotification === 'undefined') {
  console.warn("showNotification function is not defined. Using console.log fallback.");
  window.showNotification = function(message) {
    console.info(`[Notification] ${message}`);
  };
}

export { ReturnYouTubeDislike };