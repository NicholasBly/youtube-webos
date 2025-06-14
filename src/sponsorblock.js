import sha256 from 'tiny-sha256';
import { configRead, segmentTypes } from './config';
import { showNotification } from './ui';

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

const sponsorblockAPI = 'https://sponsorblock.inf.re/api'; // Consider using a more resilient endpoint if available

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  progressBarElement = null;
  sliderInterval = null;
  sliderSegmentsOverlay = null; // This will now be the <ul> element

  persistenceInterval = null;
  mutationObserver = null; // NEW: For smarter DOM change detection

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
        console.error("SHA256 function is not available. Cannot fetch segments by hash.");
        return;
    }
    const videoHash = sha256(String(this.videoID)).substring(0, 4);

    const categories = [
      'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
      'music_offtopic', 'preview', 'chapter', 'poi_highlight'
    ];
    
    try {
        const resp = await fetch(
          `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
            JSON.stringify(categories)
          )}&videoID=${this.videoID}`
        );

        if (!resp.ok) {
            console.error(`SponsorBlock API request failed with status: ${resp.status}`);
            return;
        }

        const results = await resp.json();
        let result = Array.isArray(results) ? results.find((v) => v.videoID === this.videoID) : results;

        if (!result || !result.segments || !result.segments.length) {
          console.info(this.videoID, 'No segments found for this video.');
          return;
        }

        this.segments = result.segments;
        this.skippableCategories = this.getSkippableCategories();

        this.scheduleSkipHandler = () => this.scheduleSkip();
        this.durationChangeHandler = () => this.buildOverlay();

        this.attachVideo();
    } catch (error) {
        console.error("Error initializing SponsorBlock or fetching segments:", error);
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
        console.warn("Could not read SponsorBlock config, using defaults. Error:", e);
        return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
    }
    return skippable;
  }
  
  getHighlightSegments() {
    if (!this.segments) return [];
    try {
      const highlightEnabled = configRead('enableSponsorBlockHighlight');
      if (!highlightEnabled) return [];
      
      return this.segments
        .filter(seg => seg.category === 'poi_highlight')
        .sort((a, b) => a.segment[0] - b.segment[0]);
    } catch (e) {
      console.warn("Could not read highlight config:", e);
      return [];
    }
  }
  
  jumpToNextHighlight() {
    if (!this.video) return false;
    
    const highlights = this.getHighlightSegments();
    if (highlights.length === 0) return false;
    
    const currentTime = this.video.currentTime;
    const nextHighlight = highlights.find(seg => seg.segment[0] > currentTime + 1);
    
    if (nextHighlight) {
      this.video.currentTime = nextHighlight.segment[0];
      showNotification(`Jumped to highlight at ${Math.floor(nextHighlight.segment[0])}s`);
      return true;
    } else if (highlights.length > 0) {
      // Jump to first highlight if no next highlight found
      this.video.currentTime = highlights[0].segment[0];
      showNotification(`Jumped to first highlight at ${Math.floor(highlights[0].segment[0])}s`);
      return true;
    }
    
    return false;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.video = document.querySelector('video');
    if (!this.video) {
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 250);
      return;
    }

    console.info(this.videoID, 'Video element found. Binding event listeners.');

    this.video.addEventListener('loadedmetadata', this.durationChangeHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('seeking', this.scheduleSkipHandler);
    this.video.addEventListener('seeked', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    
    if (this.video.duration && this.segments) {
        this.buildOverlay();
    }
  }

  // NEW: Create mutation observer to detect when segments are removed
  setupMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    if (!this.progressBarElement) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      let needsReattach = false;
      
      mutations.forEach((mutation) => {
        // Check if our overlay was removed
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          for (let node of mutation.removedNodes) {
            if (node === this.sliderSegmentsOverlay || 
                (node.nodeType === Node.ELEMENT_NODE && node.contains(this.sliderSegmentsOverlay))) {
              needsReattach = true;
              break;
            }
          }
        }
      });

      if (needsReattach && this.sliderSegmentsOverlay && !this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
        console.info("Segments removed by DOM mutation. Re-attaching...");
        this.attachOverlayToProgressBar();
      }
    });

    this.mutationObserver.observe(this.progressBarElement, {
      childList: true,
      subtree: true
    });
  }

  // NEW: Separated attachment logic for reuse
  attachOverlayToProgressBar() {
    if (!this.progressBarElement || !this.sliderSegmentsOverlay) return;

    if (window.getComputedStyle(this.progressBarElement).position === 'static') {
      this.progressBarElement.style.position = 'relative';
    }
    
    // Use appendChild instead of prepend - less likely to interfere with YouTube's DOM updates
    this.progressBarElement.appendChild(this.sliderSegmentsOverlay);
    console.info(this.videoID, 'Segments overlay (UL/LI structure) attached.');
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
      return;
    }
    if (!this.segments || !this.segments.length) {
        return;
    }

    const videoDuration = this.video.duration;
    console.info(this.videoID, `Building overlay for duration: ${videoDuration}s`);

    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
        this.sliderSegmentsOverlay.remove();
    }
    if (this.persistenceInterval) {
        clearInterval(this.persistenceInterval);
        this.persistenceInterval = null;
    }
    if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
    }

    this.sliderSegmentsOverlay = document.createElement('ul');
    this.sliderSegmentsOverlay.id = 'previewbar';
    
    // IMPROVED: More robust CSS with !important declarations to prevent removal
    this.sliderSegmentsOverlay.style.cssText = `
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 10 !important;
      margin: 0 !important;
      padding: 0 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    `;

    // Add a data attribute to help identify our elements
    this.sliderSegmentsOverlay.setAttribute('data-sponsorblock', 'segments');

    this.segments.forEach((segment) => {
	  const [start, end] = segment.segment;
	  const isHighlight = segment.category === 'poi_highlight';
	  
	  // Skip poi_highlight segments if highlights are disabled
	  if (isHighlight) {
		try {
		  const highlightEnabled = configRead('enableSponsorBlockHighlight');
		  if (!highlightEnabled) return;
		} catch (e) {
		  console.warn("Could not read highlight config:", e);
		  return; // Skip if we can't read the config
		}
	  }
      
      let segmentStart, segmentEnd, segmentWidthPercent, segmentLeftPercent;
      
      if (isHighlight) {
        // For poi_highlight, use only the start time as it's a point in time
        const highlightTime = Math.max(0, Math.min(start, videoDuration));
        
        // Calculate position as percentage of video duration
        segmentLeftPercent = (highlightTime / videoDuration) * 100;
        
        // Fixed width for highlights - convert 5.47px to percentage of progress bar width
        // We'll calculate this dynamically based on the progress bar's actual width
        const progressBarWidth = this.progressBarElement ? this.progressBarElement.offsetWidth : 1000; // fallback width
        const fixedWidthPx = 5.47;
        segmentWidthPercent = (fixedWidthPx / progressBarWidth) * 100;
        
        // For consistency with the rest of the code, set segmentStart and segmentEnd
        segmentStart = highlightTime;
        segmentEnd = highlightTime; // Same as start since it's a point
      } else {
        // Original logic for duration-based segments
        segmentStart = Math.max(0, Math.min(start, videoDuration));
        segmentEnd = Math.max(segmentStart, Math.min(end, videoDuration));
        
        if (segmentEnd <= segmentStart) return;
        
        segmentWidthPercent = ((segmentEnd - segmentStart) / videoDuration) * 100;
        segmentLeftPercent = (segmentStart / videoDuration) * 100;
      }

      const categoryInfo = segmentTypes[segment.category];
	  if (!categoryInfo) return; 

	  const barType = {
		name: categoryInfo.name,
		opacity: categoryInfo.opacity,
		color: configRead(`${segment.category}Color`) || categoryInfo.color
	  };

      // Create an LI element for each segment
      const elm = document.createElement('li');
      elm.className = `previewbar sponsorblock-category-${segment.category}`;
      elm.innerHTML = '&nbsp;';

      // Apply different styling based on segment type
      if (isHighlight) {
        elm.style.cssText = `
          position: absolute !important;
          list-style: none !important;
          height: 12px !important;
          background-color: ${barType.color} !important;
          opacity: ${barType.opacity} !important;
          left: ${segmentLeftPercent}% !important;
          width: ${segmentWidthPercent}% !important;
          min-width: 5.47px !important;
          max-width: 5.47px !important;
          border-radius: inherit !important;
          display: block !important;
          visibility: visible !important;
          z-index: 11 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        `;
        elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s`;
      } else {
        elm.style.cssText = `
          position: absolute !important;
          list-style: none !important;
          height: 100% !important;
          background-color: ${barType.color} !important;
          opacity: ${barType.opacity} !important;
          left: ${segmentLeftPercent}% !important;
          width: ${segmentWidthPercent}% !important;
          border-radius: inherit !important;
          display: block !important;
          visibility: visible !important;
          z-index: 11 !important;
        `;
        elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s - ${segmentEnd.toFixed(1)}s`;
      }
      
      elm.setAttribute('data-sponsorblock-segment', segment.category);
      this.sliderSegmentsOverlay.appendChild(elm);
    });

    const watchForProgressBar = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);
      
      const progressBarSelectors = [
        '.ytlr-progress-bar__slider', '.ytlr-multi-markers-player-bar-renderer',
        '.ytlr-progress-bar', '.ytLrProgressBarSlider', '.ytLrProgressBarSliderBase',
        '.ytp-progress-bar', '.ytp-progress-bar-container'
      ];

      this.sliderInterval = setInterval(() => {
        for (const selector of progressBarSelectors) {
          const element = document.querySelector(selector);
          if (element && window.getComputedStyle(element).display !== 'none' && element.offsetWidth > 50) {
            this.progressBarElement = element;
            console.info(this.videoID, `Progress bar found with selector "${selector}"`);
            clearInterval(this.sliderInterval);
            this.sliderInterval = null;
            
            this.attachOverlayToProgressBar();
            this.setupMutationObserver(); // NEW: Setup smart reattachment
            
            // IMPROVED: Less frequent persistence checks to reduce blinking
            if (this.persistenceInterval) clearInterval(this.persistenceInterval);
            this.persistenceInterval = setInterval(() => {
              if (!document.body.contains(this.progressBarElement)) {
                console.info("Progress bar lost. Stopping persistence check and re-finding...");
                clearInterval(this.persistenceInterval);
                this.persistenceInterval = null;
                this.progressBarElement = null;
                if (this.mutationObserver) {
                  this.mutationObserver.disconnect();
                  this.mutationObserver = null;
                }
                watchForProgressBar();
                return;
              }

              // Only check every 1 second instead of 250ms to reduce blinking
              if (!this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
                console.info("Overlay detached. Re-attaching via persistence check.");
                this.attachOverlayToProgressBar();
              }
            }, 1000); // CHANGED: Reduced frequency from 250ms to 1000ms
            
            return;
          }
        }
      }, 500);
    };

    watchForProgressBar();
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active) {
      console.info(this.videoID, 'No longer active, ignoring...');
      return;
    }

    if (this.video.paused) {
      console.info(this.videoID, 'Currently paused, ignoring...');
      return;
    }

    // Sometimes timeupdate event (that calls scheduleSkip) gets fired right before
    // already scheduled skip routine below. Let's just look back a little bit
    // and, in worst case, perform a skip at negative interval (immediately)...
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] > this.video.currentTime - 0.3 &&
        seg.segment[1] > this.video.currentTime - 0.3
    );
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      console.info(this.videoID, 'No more segments');
      return;
    }

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    console.info(
      this.videoID,
      'Scheduling skip of',
      segment,
      'in',
      start - this.video.currentTime
    );

    this.nextSkipTimeout = setTimeout(
      () => {
        if (this.video.paused) {
          console.info(this.videoID, 'Currently paused, ignoring...');
          return;
        }
        if (!this.skippableCategories.includes(segment.category)) {
          console.info(
            this.videoID,
            'Segment',
            segment.category,
            'is not skippable, ignoring...'
          );
          return;
        }

        const skipName = segmentTypes[segment.category]?.name || segment.category;
        console.info(this.videoID, 'Skipping', segment);
        showNotification(`Skipping ${skipName}`);
        this.video.currentTime = end;
        this.scheduleSkip();
      },
      (start - this.video.currentTime) * 1000
    );
  }

  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlockHandler instance.');
    this.active = false;

    clearTimeout(this.nextSkipTimeout);
    clearTimeout(this.attachVideoTimeout);
    clearInterval(this.sliderInterval);
    clearInterval(this.persistenceInterval);

    this.nextSkipTimeout = null;
    this.attachVideoTimeout = null;
    this.sliderInterval = null;
    this.persistenceInterval = null;

    // NEW: Clean up mutation observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
      this.sliderSegmentsOverlay.remove();
    }
    this.sliderSegmentsOverlay = null;
    this.progressBarElement = null;

    if (this.video) {
      this.video.removeEventListener('loadedmetadata', this.durationChangeHandler);
      this.video.removeEventListener('durationchange', this.durationChangeHandler);
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('seeking', this.scheduleSkipHandler);
      this.video.removeEventListener('seeked', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video = null;
    }
    
    this.scheduleSkipHandler = null;
    this.durationChangeHandler = null;
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
