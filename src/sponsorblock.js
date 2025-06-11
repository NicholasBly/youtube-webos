import sha256 from 'tiny-sha256';
import { configRead } from './config'; // Assuming you have this file
import { showNotification } from './ui'; // Assuming you have this file

// Fallback for tiny-sha256 if it's not found (e.g. in a raw WebOS environment without module loading)
if (typeof sha256 !== 'function' && typeof require === 'function') {
    try {
        // Attempt to load if in a CommonJS-like environment, though WebOS might not support this directly.
        // This is a placeholder; direct inclusion or a global sha256 function might be needed for WebOS.
        // For WebOS, you might need to bundle 'tiny-sha256' or use a native crypto API if available and allowed.
        // const sha256Node = require('tiny-sha256'); // This line is problematic for plain JS on WebOS
        // Instead, ensure sha256 is globally available or bundled.
        // For the purpose of this example, we'll assume sha256 is available.
        // If not, you'd need to integrate a SHA256 function directly.
        console.warn("sha256 function was not initially available. Ensure it's correctly loaded for WebOS.");
    } catch (e) {
        console.error("Failed to load sha256. SponsorBlock functionality will be impaired.", e);
        // Provide a dummy function if all else fails, to prevent crashes, though hashing won't work.
        // This is NOT a real solution for hashing but prevents 'undefined' errors.
        window.sha256 = window.sha256 || function(s) { return s; };
    }
}


// Copied from https://github.com/ajayyy/SponsorBlock/blob/9392d16617d2d48abb6125c00e2ff6042cb7bebe/src/config.ts#L179-L233
const barTypes = {
  sponsor: {
    color: '#00d400',
    opacity: '0.7',
    name: 'sponsored segment'
  },
  intro: {
    color: '#00ffff',
    opacity: '0.7',
    name: 'intro'
  },
  outro: {
    color: '#0202ed',
    opacity: '0.7',
    name: 'outro'
  },
  interaction: {
    color: '#cc00ff',
    opacity: '0.7',
    name: 'interaction reminder'
  },
  selfpromo: {
    color: '#ffff00',
    opacity: '0.7',
    name: 'self-promotion'
  },
  music_offtopic: {
    color: '#ff9900',
    opacity: '0.7',
    name: 'non-music part'
  },
  preview: {
    color: '#008fd6',
    opacity: '0.7',
    name: 'recap or preview'
  },
  // Adding 'chapter' as it's commonly used, though not in original snippet's barTypes
  chapter: {
    color: 'rgba(128, 128, 128, 0.5)', // Example: semi-transparent grey
    opacity: '0.5',
    name: 'chapter'
  }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api'; // Consider using a more resilient endpoint if available

class SponsorBlockHandler {
  video = null;
  active = true;

  // Timers and element references
  attachVideoTimeout = null;
  nextSkipTimeout = null;
  progressBarElement = null;
  sliderInterval = null;
  sliderSegmentsOverlay = null;

  // For detached overlay
  animationFrameId = null;
  
  // For watching the main controls container
  controlsContainer = null;
  controlsInterval = null;
  controlsObserver = null;

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
    console.info(`SponsorBlockHandler created for videoID: ${videoID}`);
  }

  async init() {
    if (typeof sha256 !== 'function') {
        return console.error("SHA256 function is not available.");
    }
    const videoHash = sha256(String(this.videoID)).substring(0, 4);
    const categories = ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview', 'chapter'];
    try {
        const resp = await fetch(`${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(JSON.stringify(categories))}&videoID=${this.videoID}`);
        if (!resp.ok) return console.error(`SponsorBlock API request failed: ${resp.status}`);
        const results = await resp.json();
        let result = Array.isArray(results) ? results.find((v) => v.videoID === this.videoID) : results;
        if (!result || !result.segments || !result.segments.length) return console.info(this.videoID, 'No segments found.');
        this.segments = result.segments;
        this.skippableCategories = this.getSkippableCategories();
        this.scheduleSkipHandler = () => this.scheduleSkip();
        this.durationChangeHandler = () => this.buildOverlay();
        this.attachVideo();
    } catch (error) {
        console.error("Error initializing SponsorBlock:", error);
    }
  }

  getSkippableCategories() {
    const skippable = [];
    try {
        if (configRead('enableSponsorBlockSponsor')) skippable.push('sponsor');
        if (configRead('enableSponsorBlockIntro')) skippable.push('intro');
        if (configRead('enableSponsorBlockOutro')) skippable.push('outro');
        if (configRead('enableSponsorBlockInteraction')) skippable.push('interaction');
        if (configRead('enableSponsorBlockSelfPromo')) skippable.push('selfpromo');
        if (configRead('enableSponsorBlockMusicOfftopic')) skippable.push('music_offtopic');
        if (configRead('enableSponsorBlockPreview')) skippable.push('preview');
    } catch (e) {
        return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
    }
    return skippable;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.video = document.querySelector('video');
    if (!this.video) {
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 250);
      return;
    }
    console.info(this.videoID, 'Video element found.');
    this.video.addEventListener('loadedmetadata', this.durationChangeHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('seeking', this.scheduleSkipHandler);
    this.video.addEventListener('seeked', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    if (this.video.duration && this.segments) this.buildOverlay();
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration)) return;
    if (!this.segments || !this.segments.length) return;

    this.destroyOverlay();
    console.info(this.videoID, `Building overlay...`);
    
    this.sliderSegmentsOverlay = document.createElement('ul');
    this.sliderSegmentsOverlay.style.cssText = 'position: fixed; display: none; padding: 0; margin: 0; pointer-events: none; z-index: 999;';

    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const segmentStart = Math.max(0, Math.min(start, this.video.duration));
      const segmentEnd = Math.max(segmentStart, Math.min(end, this.video.duration));
      if (segmentEnd <= segmentStart) return;
      const barType = barTypes[segment.category] || barTypes.sponsor;
      const elm = document.createElement('li');
      elm.style.cssText = `position: absolute; list-style: none; height: 100%; background-color: ${barType.color}; opacity: ${barType.opacity}; left: ${(segmentStart / this.video.duration) * 100}%; width: ${((segmentEnd - segmentStart) / this.video.duration) * 100}%; border-radius: inherit;`;
      this.sliderSegmentsOverlay.appendChild(elm);
    });

    const updateOverlayVisibility = () => {
        if (!this.controlsContainer || !this.sliderSegmentsOverlay) return;

        const controlsAreVisible = this.controlsContainer.getAttribute('ishidden') === 'false';
        
        // --- MODIFICATION START: RACE CONDITION FIX ---
        // We can only show the overlay if the controls are visible AND we've found the progress bar.
        const canShow = controlsAreVisible && this.progressBarElement;

        if (canShow) {
            this.sliderSegmentsOverlay.style.display = 'block';
        } else {
            this.sliderSegmentsOverlay.style.display = 'none';
            // As requested, log when controls are the reason for hiding.
            if (!controlsAreVisible) {
                console.info('SponsorBlock: Hiding segments because player controls are hidden.');
            }
        }
    };
    // --- MODIFICATION END ---

    const syncOverlayPosition = () => {
        if (!this.progressBarElement || !document.body.contains(this.progressBarElement)) {
            watchForProgressBar();
            return;
        }
        const rect = this.progressBarElement.getBoundingClientRect();
        this.sliderSegmentsOverlay.style.left = `${rect.left}px`;
        this.sliderSegmentsOverlay.style.top = `${rect.top}px`;
        this.sliderSegmentsOverlay.style.width = `${rect.width}px`;
        this.sliderSegmentsOverlay.style.height = `${rect.height}px`;
        this.animationFrameId = requestAnimationFrame(syncOverlayPosition);
    };

    const watchForProgressBar = () => {
      clearInterval(this.sliderInterval);
      const selectors = ['.ytlr-progress-bar__slider', '.ytlr-progress-bar', '.ytp-progress-bar'];
      this.sliderInterval = setInterval(() => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.offsetWidth > 50) {
            this.progressBarElement = element;
            console.info(this.videoID, `Progress bar found with selector "${selector}".`);
            clearInterval(this.sliderInterval);
            
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = requestAnimationFrame(syncOverlayPosition);

            // --- MODIFICATION: Trigger a visibility check now that the progress bar is found.
            updateOverlayVisibility();
            return;
          }
        }
      }, 500);
    };

    const watchForControlsContainer = () => {
        clearInterval(this.controlsInterval);
        this.controlsInterval = setInterval(() => {
            const element = document.querySelector('ytlr-pivot.ytLrPivotHost');
            if (element) {
                this.controlsContainer = element;
                console.info(this.videoID, "Controls container (ytlr-pivot) found.");
                clearInterval(this.controlsInterval);
                
                this.controlsObserver = new MutationObserver(updateOverlayVisibility);
                this.controlsObserver.observe(this.controlsContainer, { attributes: true, attributeFilter: ['ishidden'] });
                
                updateOverlayVisibility();
            }
        }, 500);
    };
    
    document.body.appendChild(this.sliderSegmentsOverlay);
    watchForProgressBar();
    watchForControlsContainer();
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    if (!this.active || !this.video || this.video.paused) return;
    const currentTime = this.video.currentTime;
    const nextSegment = this.segments.filter(seg => seg.segment[1] > currentTime && this.skippableCategories.includes(seg.category)).sort((a, b) => a.segment[0] - b.segment[0])[0];
    if (!nextSegment) return;
    const [start, end] = nextSegment.segment;
    if (currentTime >= start && currentTime < end) {
      showNotification(`Skipping ${barTypes[nextSegment.category]?.name || 'segment'}`);
      this.video.currentTime = end;
    } else if (start > currentTime) {
      this.nextSkipTimeout = setTimeout(() => {
        if (this.video.paused || this.video.seeking) return;
        showNotification(`Skipping ${barTypes[nextSegment.category]?.name || 'segment'}`);
        this.video.currentTime = end;
      }, (start - currentTime) * 1000);
    }
  }

  destroyOverlay() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.controlsObserver) this.controlsObserver.disconnect();
    clearInterval(this.sliderInterval);
    clearInterval(this.controlsInterval);
    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
      this.sliderSegmentsOverlay.remove();
    }
    this.animationFrameId = null;
    this.controlsObserver = null;
    this.sliderInterval = null;
    this.controlsInterval = null;
    this.sliderSegmentsOverlay = null;
    this.progressBarElement = null;
    this.controlsContainer = null;
  }
  
  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlockHandler instance.');
    this.active = false;
    clearTimeout(this.nextSkipTimeout);
    clearTimeout(this.attachVideoTimeout);
    this.destroyOverlay();
    if (this.video) {
      this.video.removeEventListener('loadedmetadata', this.durationChangeHandler);
      this.video.removeEventListener('durationchange', this.durationChangeHandler);
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.addEventListener('pause', this.scheduleSkipHandler);
      this.video.addEventListener('seeking', this.scheduleSkipHandler);
      this.video.addEventListener('seeked', this.scheduleSkipHandler);
      this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    }
  }
}

// Global instance management
if (typeof window !== 'undefined') {
    window.sponsorblock = null;

    function uninitializeSponsorblock() {
      if (window.sponsorblock) {
        try {
          window.sponsorblock.destroy();
        } catch (err) {
          console.warn('window.sponsorblock.destroy() failed!', err);
        }
        window.sponsorblock = null;
        console.info("SponsorBlock uninitialized.");
      }
    }

    const handleHashChange = () => {
        // It's safer to construct the URL based on window.location to handle various base URLs on WebOS
        let currentPath = '';
        let searchParamsString = '';
        try {
            // location.hash on YouTube typically looks like #/watch?v=VIDEO_ID or similar
            const hash = window.location.hash;
            if (hash.startsWith('#')) {
                const pathAndQuery = hash.substring(1); // Remove #
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
            // Fallback or default behavior if hash parsing fails
            currentPath = "/"; // Or some other sensible default
        }

        const searchParams = new URLSearchParams(searchParamsString);
        const videoID = searchParams.get('v');

        console.info(`Hash changed. Path: '${currentPath}', Video ID: '${videoID}'`);

        if (currentPath !== '/watch' && window.sponsorblock) {
          console.info('Not on a /watch path. Uninitializing SponsorBlock.');
          uninitializeSponsorblock();
          return;
        }

        const needsReload = videoID && (!window.sponsorblock || window.sponsorblock.videoID !== videoID);

        if (needsReload) {
          console.info(`Video ID changed to ${videoID} or SponsorBlock not initialized. Reloading.`);
          uninitializeSponsorblock();

          let sbEnabled = true; // Default to true if configRead fails
          try {
            sbEnabled = configRead('enableSponsorBlock');
          } catch (e) {
            console.warn("Could not read 'enableSponsorBlock' config. Defaulting to enabled. Error:", e);
          }
          
          if (sbEnabled) {
            console.info(`SponsorBlock is enabled. Initializing for video ID: ${videoID}`);
            window.sponsorblock = new SponsorBlockHandler(videoID);
            window.sponsorblock.init();
          } else {
            console.info('SponsorBlock is disabled in config. Not loading.');
          }
        } else if (!videoID && window.sponsorblock) {
            console.info('No video ID in URL. Uninitializing SponsorBlock.');
            uninitializeSponsorblock();
        } else {
            // console.info('Conditions for reload not met or no video ID.');
        }
    };

    // Listen for hash changes to handle navigation within the YouTube single-page app
    window.addEventListener('hashchange', handleHashChange, false);

    // Also run on initial load, as hashchange might not fire if the page loads directly with a hash
    // Use a slight delay to ensure the page is somewhat settled, especially on slower devices like TVs
    if (document.readyState === 'complete') {
        setTimeout(handleHashChange, 500);
    } else {
        window.addEventListener('load', () => setTimeout(handleHashChange, 500));
    }

} else {
    console.warn("SponsorBlock: 'window' object not found. Running in a non-browser environment?");
}

// Dummy configRead and showNotification if not provided by WebOS environment
// You MUST replace these with actual implementations for your LG WebOS environment.
if (typeof configRead === 'undefined') {
    console.warn("configRead function is not defined. Using dummy implementation.");
    window.configRead = function(key) {
        // Example: return true for features you want enabled by default if config is missing
        if (key === 'enableSponsorBlock') return true;
        if (key.startsWith('enableSponsorBlock')) return true; // Enable all segment types
        return false; // Default for unknown keys
    };
}

if (typeof showNotification === 'undefined') {
    console.warn("showNotification function is not defined. Using console.log fallback.");
    window.showNotification = function(message) {
        console.info(`[Notification] ${message}`);
        // On WebOS, you'd use its specific toast/notification API if available and permitted.
        // e.g., webOS.notification.showToast({ message: message, duration: 2000 }, function() {});
        // This requires permission and proper API usage.
    };
}
