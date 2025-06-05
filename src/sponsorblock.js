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
  chapter: { // This is for SB segments of type 'chapter', distinct from YouTube native chapters
    color: 'rgba(100, 100, 200, 0.6)', // Example: a muted blue
    opacity: '0.6',
    name: 'SponsorBlock Chapter'
  }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api'; // Consider using a more resilient endpoint if available

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  progressBarElement = null; // This is the main progress bar track/container (e.g., .ytp-progress-bar)
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null; // This div will contain all segment visuals

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
      'sponsor', 'intro', 'outro', 'interaction',
      'selfpromo', 'music_offtopic', 'preview', 'chapter'
    ];
    
    try {
        const apiUrl = `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(JSON.stringify(categories))}&videoID=${this.videoID}`;
        console.info(this.videoID, "Fetching segments from:", apiUrl);
        const resp = await fetch(apiUrl);

        if (!resp.ok) {
            console.error(`SponsorBlock API request failed: ${resp.status} ${resp.statusText}`);
            const errorBody = await resp.text().catch(() => "Could not read error body");
            console.error("Error details:", errorBody);
            return;
        }

        const results = await resp.json();
        let result;
        if (Array.isArray(results)) {
            result = results.find((v) => v.videoID === this.videoID);
        } else if (results && results.videoID === this.videoID) {
            result = results;
        }

        console.info(this.videoID, 'API Response Parsed:', results);
        console.info(this.videoID, 'Matched Video Result:', result);

        if (!result || !result.segments || !result.segments.length) {
          console.info(this.videoID, 'No segments found for this video or result structure unexpected.');
          this.segments = []; // Ensure segments is an empty array if none found
          // Still try to attach to video to allow for future segment loads or manual additions if supported
        } else {
           this.segments = result.segments;
        }

        this.skippableCategories = this.getSkippableCategories();
        this.scheduleSkipHandler = () => this.scheduleSkip();
        this.durationChangeHandler = () => {
            console.info(this.videoID, "Video duration or metadata changed. Rebuilding overlay.");
            this.buildOverlay();
        };

        this.attachVideo();
    } catch (error) {
        console.error("Error initializing SponsorBlock or fetching segments:", error);
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    try {
        if (configRead('enableSponsorBlockSponsor')) skippableCategories.push('sponsor');
        if (configRead('enableSponsorBlockIntro')) skippableCategories.push('intro');
        if (configRead('enableSponsorBlockOutro')) skippableCategories.push('outro');
        if (configRead('enableSponsorBlockInteraction')) skippableCategories.push('interaction');
        if (configRead('enableSponsorBlockSelfPromo')) skippableCategories.push('selfpromo');
        if (configRead('enableSponsorBlockMusicOfftopic')) skippableCategories.push('music_offtopic');
        if (configRead('enableSponsorBlockPreview')) skippableCategories.push('preview');
        // if (configRead('enableSponsorBlockChapter')) skippableCategories.push('chapter'); // For SB 'chapter' type
    } catch (e) {
        console.warn("Could not read SponsorBlock config, using defaults (all skippable). Error:", e);
        return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
    }
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video');
    if (!this.video) {
      console.info(this.videoID, 'No video element found yet. Retrying...');
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 250);
      return;
    }

    console.info(this.videoID, 'Video element found. Binding event listeners.');
    this.video.removeEventListener('loadedmetadata', this.durationChangeHandler); // Remove first to prevent duplicates
    this.video.removeEventListener('durationchange', this.durationChangeHandler);
    this.video.removeEventListener('play', this.scheduleSkipHandler);
    this.video.removeEventListener('pause', this.scheduleSkipHandler);
    this.video.removeEventListener('seeking', this.scheduleSkipHandler);
    this.video.removeEventListener('seeked', this.scheduleSkipHandler);
    this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);

    this.video.addEventListener('loadedmetadata', this.durationChangeHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('seeking', this.scheduleSkipHandler);
    this.video.addEventListener('seeked', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    
    if (this.video.readyState >= 1 && this.video.duration && this.segments) { // readyState >= HAVE_METADATA
        console.info(this.videoID, "Video metadata ready on attach, building overlay.");
        this.buildOverlay();
    } else {
        console.info(this.videoID, "Video metadata not yet ready on attach. Overlay will build on event.");
    }
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
      console.info(this.videoID, 'Video duration not available or invalid. Overlay build deferred.');
      return;
    }
    
    if (!this.segments) { // Check if segments is null/undefined (could be empty array from init)
        console.info(this.videoID, 'Segments data not available. Overlay not built.');
        return;
    }
     if (!this.segments.length) {
        console.info(this.videoID, 'No segments to display. Overlay not built.');
        // Clear any existing overlay if segments were removed
        if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
            this.sliderSegmentsOverlay.remove();
            this.sliderSegmentsOverlay = null;
        }
        return;
    }


    const videoDuration = this.video.duration;
    console.info(this.videoID, `Building overlay for duration: ${videoDuration}s with ${this.segments.length} segments.`);

    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
        this.sliderSegmentsOverlay.remove();
        this.sliderSegmentsOverlay = null;
    }
    if (this.sliderObserver) {
        this.sliderObserver.disconnect();
        this.sliderObserver = null;
    }

    this.sliderSegmentsOverlay = document.createElement('div');
    this.sliderSegmentsOverlay.style.position = 'absolute';
    this.sliderSegmentsOverlay.style.left = '0';
    this.sliderSegmentsOverlay.style.top = '0'; // Should align with the progress bar's track
    this.sliderSegmentsOverlay.style.width = '100%';
    this.sliderSegmentsOverlay.style.height = '100%'; // Takes height of its parent (progressBarElement)
    this.sliderSegmentsOverlay.style.pointerEvents = 'none';
    this.sliderSegmentsOverlay.style.zIndex = '1'; // Reduced z-index to be less intrusive
    this.sliderSegmentsOverlay.id = 'sponsorblock-segments-overlay';

    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const segmentStart = Math.max(0, Math.min(start, videoDuration));
      const segmentEnd = Math.max(segmentStart, Math.min(end, videoDuration));

      if (segmentEnd <= segmentStart) return;

      const barType = barTypes[segment.category] || barTypes.sponsor;
      const segmentWidthPercent = ((segmentEnd - segmentStart) / videoDuration) * 100;
      const segmentLeftPercent = (segmentStart / videoDuration) * 100;

      const elm = document.createElement('div');
      elm.classList.add('sponsorblock-segment-visual');
      elm.style.backgroundColor = barType.color;
      elm.style.opacity = barType.opacity;
      elm.style.position = 'absolute';
      elm.style.left = `${segmentLeftPercent}%`;
      elm.style.width = `${segmentWidthPercent}%`;
      elm.style.height = '100%'; // Segments take full height of the overlay (which takes height of progress bar)
      elm.style.borderRadius = 'inherit';
      elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s - ${segmentEnd.toFixed(1)}s`;
      this.sliderSegmentsOverlay.appendChild(elm);
    });

    const attachOverlayToProgressBar = () => {
      if (this.progressBarElement && this.sliderSegmentsOverlay) {
        const currentPosition = window.getComputedStyle(this.progressBarElement).position;
        if (currentPosition === 'static') {
            this.progressBarElement.style.position = 'relative';
            console.info(this.videoID, `Set ${this.progressBarElement.className || this.progressBarElement.id || 'progressBarElement'} to position: relative`);
        }
        
        // Prepending makes it an early child, potentially allowing YouTube's own later children
        // (like chapter markers if they are siblings) to render on top if z-indexes are similar.
        this.progressBarElement.prepend(this.sliderSegmentsOverlay);
        console.info(this.videoID, 'Segments overlay attached to progress bar:', this.progressBarElement);

        if (this.progressBarElement.parentNode) {
            this.sliderObserver = new MutationObserver((mutations) => {
              let reAttachOverlay = false;
              let reFindProgressBar = false;
              for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                  if (mutation.removedNodes) {
                    mutation.removedNodes.forEach(node => {
                      if (node === this.sliderSegmentsOverlay) reAttachOverlay = true;
                      if (node === this.progressBarElement) reFindProgressBar = true;
                    });
                  }
                }
              }
              if (reFindProgressBar) {
                console.info(this.videoID, 'Progress bar element was removed. Re-finding.');
                this.progressBarElement = null;
                if(this.sliderObserver) this.sliderObserver.disconnect();
                watchForProgressBar();
              } else if (reAttachOverlay && this.progressBarElement && this.sliderSegmentsOverlay) {
                 if (document.body.contains(this.progressBarElement)) {
                    console.info(this.videoID, 'Segments overlay removed by YouTube. Re-attaching.');
                    this.progressBarElement.prepend(this.sliderSegmentsOverlay);
                } else {
                    console.info(this.videoID, 'Progress bar element no longer in DOM. Re-finding.');
                    this.progressBarElement = null;
                    if(this.sliderObserver) this.sliderObserver.disconnect();
                    watchForProgressBar();
                }
              }
            });
            this.sliderObserver.observe(this.progressBarElement.parentNode, { childList: true }); // Observe parent for removal of progress bar
            this.sliderObserver.observe(this.progressBarElement, { childList: true });      // Observe progress bar for removal of our overlay
        }
      } else {
          console.warn(this.videoID, "Progress bar element or overlay missing during attach attempt.");
      }
    };

    const watchForProgressBar = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);
      // Selectors inspired by previewBar.ts and common YouTube structure.
      // Prioritize elements that are containers for progress visuals.
      const progressBarSelectors = [
        '.ytp-progress-bar', // Often the direct parent for progress-list and chapters-container
        '.ytp-progress-bar-container .ytp-progress-list', // More specific to the list of segments
        '.ytp-progress-bar-container .html5-progress-bar .ytp-progress-list', // Even more specific
        '.html5-progress-bar .ytp-progress-list', // Common variant
        '.ytlr-progress-bar__slider', // From original code, TV UIs
        '.ytlr-player-bar__slider-container', // TV UIs
        '.ypcs-scrub-slider-slot.ytu-player-controls', // YTTV
        '.player-controls__player-bar-container', // Generic
         // Less specific, try last:
        '.ytp-progress-bar-container', // Could be too broad, might contain controls outside the bar
      ];

      this.sliderInterval = setInterval(() => {
        for (const selector of progressBarSelectors) {
          try {
            const element = document.querySelector(selector);
            // Check if element is visible and has a reasonable width
            if (element && window.getComputedStyle(element).display !== 'none' && element.offsetWidth > 50) {
              this.progressBarElement = element;
              console.info(this.videoID, `Progress bar found with selector "${selector}":`, this.progressBarElement);
              clearInterval(this.sliderInterval);
              this.sliderInterval = null;
              attachOverlayToProgressBar();
              return;
            }
          } catch (e) {
            console.warn(`Error querying selector "${selector}":`, e);
          }
        }
        // console.info(this.videoID, 'Still searching for progress bar...'); // Reduce log noise
      }, 750); // Slightly increased interval
    };
    watchForProgressBar();
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active || !this.video || this.video.paused || !this.segments || !this.segments.length) {
      return;
    }

    const currentTime = this.video.currentTime;
    const nextSegments = this.segments.filter(
      (seg) => seg.segment[1] > currentTime && seg.segment[0] >= currentTime - 0.75 // segment ends after now, starts not too far in past
    ).sort((s1, s2) => s1.segment[0] - s2.segment[0]);


    if (!nextSegments.length) return;

    const segmentToSkip = nextSegments[0];
    const [start, end] = segmentToSkip.segment;

    if (this.skippableCategories.includes(segmentToSkip.category)) {
        if (currentTime >= start - 0.25 && currentTime < end) { // If already in segment or very close to start
            const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
            console.info(this.videoID, `Immediately skipping ${skipName} (current: ${currentTime.toFixed(1)}, segment: ${start.toFixed(1)}-${end.toFixed(1)}) to ${end.toFixed(1)}s.`);
            if (typeof showNotification === 'function') showNotification(`Skipping ${skipName}`);
            this.video.currentTime = end;
            this.scheduleSkip(); // Reschedule for next
            return;
        }
        
        // If segment is upcoming
        if (start > currentTime) {
            const timeUntilSkip = (start - currentTime) * 1000;
            // console.info(this.videoID, `Scheduling skip of '${segmentToSkip.category}' from ${start.toFixed(1)}s to ${end.toFixed(1)}s in ${Math.max(0, timeUntilSkip / 1000).toFixed(1)}s`);
            this.nextSkipTimeout = setTimeout(() => {
                if (!this.active || !this.video || this.video.paused) return;
                // Re-check if still in skippable portion before jump
                if (this.video.currentTime >= start - 0.5 && this.video.currentTime < end) {
                    const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
                    console.info(this.videoID, `Performing scheduled skip of ${skipName} to ${end.toFixed(1)}s.`);
                    if (typeof showNotification === 'function') showNotification(`Skipping ${skipName}`);
                    this.video.currentTime = end;
                    this.scheduleSkip();
                } else {
                    this.scheduleSkip(); // Missed it or sought away, reschedule
                }
            }, Math.max(0, timeUntilSkip));
        }
    } else {
        // If the immediate next segment is not skippable, we might want to find the *next skippable* one.
        // For simplicity now, just let timeupdate call this again.
        // console.info(this.videoID, `Next segment '${segmentToSkip.category}' (${start.toFixed(1)}s) is not in skippable categories.`);
    }
  }

  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlockHandler instance.');
    this.active = false;
    clearTimeout(this.nextSkipTimeout);
    clearTimeout(this.attachVideoTimeout);
    clearInterval(this.sliderInterval);

    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
      this.sliderObserver = null;
    }
    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
      this.sliderSegmentsOverlay.remove();
      this.sliderSegmentsOverlay = null;
    }
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
    this.segments = null;
  }
}

// Global instance management
if (typeof window !== 'undefined') {
    window.sponsorblock = null;
    function uninitializeSponsorblock() {
      if (window.sponsorblock) {
        try { window.sponsorblock.destroy(); }
        catch (err) { console.warn('window.sponsorblock.destroy() failed!', err); }
        window.sponsorblock = null;
        console.info("SponsorBlock uninitialized.");
      }
    }

    const handleNavigationChange = () => {
        let currentPath = '';
        let searchParamsString = '';
        try {
            const hash = window.location.hash;
            if (hash.startsWith('#')) {
                const pathAndQuery = hash.substring(1);
                const queryIndex = pathAndQuery.indexOf('?');
                currentPath = queryIndex !== -1 ? pathAndQuery.substring(0, queryIndex) : pathAndQuery;
                searchParamsString = queryIndex !== -1 ? pathAndQuery.substring(queryIndex) : '';
            } else { // Fallback for URLs not using hash for path (less common in SPA YouTube clones)
                currentPath = window.location.pathname;
                searchParamsString = window.location.search;
            }
        } catch (e) {
            console.error("Error parsing window.location for navigation:", e);
            currentPath = "/"; // Default if parsing fails
        }

        const searchParams = new URLSearchParams(searchParamsString);
        const videoID = searchParams.get('v');
        console.info(`Navigation detected. Path: '${currentPath}', Video ID: '${videoID}'`);

        if (!videoID || currentPath.indexOf('watch') === -1) { // More generic check for 'watch' in path
            if (window.sponsorblock) {
                console.info('Not a watch page or no video ID. Uninitializing SponsorBlock.');
                uninitializeSponsorblock();
            }
            return;
        }

        const needsReload = !window.sponsorblock || window.sponsorblock.videoID !== videoID;
        if (needsReload) {
          console.info(`Video ID changed to ${videoID} or SponsorBlock not initialized. Reloading.`);
          uninitializeSponsorblock();
          let sbEnabled = true;
          try { sbEnabled = configRead('enableSponsorBlock'); }
          catch (e) { console.warn("Could not read 'enableSponsorBlock' config. Defaulting to enabled.", e); }
          
          if (sbEnabled) {
            console.info(`SponsorBlock is enabled. Initializing for video ID: ${videoID}`);
            window.sponsorblock = new SponsorBlockHandler(videoID);
            window.sponsorblock.init();
          } else {
            console.info('SponsorBlock is disabled in config. Not loading.');
          }
        }
    };

    window.addEventListener('hashchange', handleNavigationChange, false);
    // For WebOS, 'popstate' might also be relevant if it uses History API for navigation
    // window.addEventListener('popstate', handleNavigationChange, false);


    // Initial run on load
    const initialLoadHandler = () => {
        // Check if `document.body` is available before trying to use it for `contains`
        if(document.body){
             setTimeout(handleNavigationChange, 750); // Increased delay for TV startup
        } else {
            // If body isn't ready, wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', () => setTimeout(handleNavigationChange, 750));
        }
    };
    
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
       initialLoadHandler();
    } else {
       document.addEventListener('DOMContentLoaded', initialLoadHandler);
    }

} else {
    console.warn("SponsorBlock: 'window' object not found. Assuming non-browser environment.");
}

// Dummy configRead and showNotification if not provided by WebOS environment
if (typeof configRead === 'undefined' && typeof window !== 'undefined') {
    console.warn("configRead function is not defined. Using dummy implementation.");
    window.configRead = function(key) {
        if (key === 'enableSponsorBlock') return true;
        if (key.startsWith('enableSponsorBlock')) return true;
        return false;
    };
}

if (typeof showNotification === 'undefined' && typeof window !== 'undefined') {
    console.warn("showNotification function is not defined. Using console.log fallback.");
    window.showNotification = function(message) {
        console.info(`[Notification] ${message}`);
        // For WebOS, you'd use its specific toast/notification API.
        // Example: if (typeof webOS !== 'undefined' && webOS.notification) {
        //   webOS.notification.showToast({ message: message, duration: 2000 }, function() {});
        // }
    };
}
