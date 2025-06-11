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

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  progressBarElement = null; // Renamed from 'slider' for clarity, this is the main progress bar track/container
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null; // This div will contain all segment visuals

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
    // Basic logging to confirm instantiation
    console.info(`SponsorBlockHandler created for videoID: ${videoID}`);
  }

  async init() {
    // Ensure sha256 is available before trying to use it
    if (typeof sha256 !== 'function') {
        console.error("SHA256 function is not available. Cannot fetch segments by hash.");
        // Potentially try fetching by videoID directly if API supports it, or fail gracefully
        // For now, we'll return, as the original logic relies on the hash.
        return;
    }
    // It's good practice to ensure videoID is a string before hashing
    const videoHash = sha256(String(this.videoID)).substring(0, 4);

    const categories = [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'music_offtopic',
      'preview',
      'chapter' // Include chapter if you plan to fetch/display them
    ];
    
    // Use try-catch for network requests
    try {
        const resp = await fetch(
          `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
            JSON.stringify(categories)
          )}&videoID=${this.videoID}` // Also passing videoID to help disambiguate if API supports
        );

        if (!resp.ok) {
            console.error(`SponsorBlock API request failed with status: ${resp.status}`);
            const errorBody = await resp.text();
            console.error("Error details:", errorBody);
            return;
        }

        const results = await resp.json();
        
        // The API might return an array of video objects if queried by hash prefix,
        // or a single object if queried by full videoID.
        // Or it might return an empty array/object if no segments.
        let result;
        if (Array.isArray(results)) {
            result = results.find((v) => v.videoID === this.videoID);
        } else if (results && results.videoID === this.videoID) {
            result = results; // If API returns a single object matching videoID
        } else if (Array.isArray(results) && results.length > 0 && !results.find(v => v.videoID)) {
            // If API returns array of segments directly (older behavior for specific videoID query)
            // This structure is less common now but good to be aware of.
            // Assuming `results` itself is the array of segments if no `videoID` field is present at the top level of `result`.
            // This part might need adjustment based on actual API response for the specific endpoint.
            // The example API returns an array of objects, each with videoID and segments.
             console.info(this.videoID, "API returned an array, attempting to find matching videoID.");
        }


        console.info(this.videoID, 'API Response:', results);
        console.info(this.videoID, 'Matched Result:', result);

        if (!result || !result.segments || !result.segments.length) {
          console.info(this.videoID, 'No segments found or result structure unexpected.');
          return;
        }

        this.segments = result.segments;
        this.skippableCategories = this.getSkippableCategories();

        this.scheduleSkipHandler = () => this.scheduleSkip();
        this.durationChangeHandler = () => this.buildOverlay(); // Rebuild overlay on duration change

        this.attachVideo(); // Start looking for the video element
        // buildOverlay will be called once video duration is known (via durationChangeHandler or attachVideo success)
    } catch (error) {
        console.error("Error initializing SponsorBlock or fetching segments:", error);
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    // Assuming configRead is available and works
    try {
        if (configRead('enableSponsorBlockSponsor')) skippableCategories.push('sponsor');
        if (configRead('enableSponsorBlockIntro')) skippableCategories.push('intro');
        if (configRead('enableSponsorBlockOutro')) skippableCategories.push('outro');
        if (configRead('enableSponsorBlockInteraction')) skippableCategories.push('interaction');
        if (configRead('enableSponsorBlockSelfPromo')) skippableCategories.push('selfpromo');
        if (configRead('enableSponsorBlockMusicOfftopic')) skippableCategories.push('music_offtopic');
        if (configRead('enableSponsorBlockPreview')) skippableCategories.push('preview');
        // Add chapter if you have a separate config for it
        // if (configRead('enableSponsorBlockChapter')) skippableCategories.push('chapter');
    } catch (e) {
        console.warn("Could not read SponsorBlock config, using defaults (all skippable). Error:", e);
        // Default to skipping all known types if configRead fails
        return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
    }
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video'); // Standard selector for the main video element
    if (!this.video) {
      console.info(this.videoID, 'No video element found yet. Retrying...');
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 250); // Increased retry interval slightly
      return;
    }

    console.info(this.videoID, 'Video element found. Binding event listeners.');

    // Use { once: true } for durationchange if it should only trigger overlay build once initially
    // However, duration can change (e.g., live streams), so keeping it as is.
    this.video.addEventListener('loadedmetadata', this.durationChangeHandler); // Often better than durationchange for initial setup
    this.video.addEventListener('durationchange', this.durationChangeHandler);
    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler); // To clear skip timeouts
    this.video.addEventListener('seeking', this.scheduleSkipHandler); // Reschedule on seek
    this.video.addEventListener('seeked', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    
    // Initial call to build overlay if duration is already available
    if (this.video.duration && this.segments) {
        this.buildOverlay();
    }
  }

buildOverlay() {
    // Guard against missing video or duration
    if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
      console.info(this.videoID, 'Video duration not available or invalid. Overlay build deferred.');
      return;
    }
    
    // If segments haven't been loaded yet, don't try to build.
    if (!this.segments || !this.segments.length) {
        console.info(this.videoID, 'No segments loaded. Overlay not built.');
        return;
    }

    const videoDuration = this.video.duration;
    console.info(this.videoID, `Building overlay for duration: ${videoDuration}s`);

    // Remove existing overlay before rebuilding to avoid duplicates
    if (this.sliderSegmentsOverlay && this.sliderSegmentsOverlay.parentNode) {
        this.sliderSegmentsOverlay.remove();
        this.sliderSegmentsOverlay = null;
    }
    if (this.sliderObserver) { // Disconnect old observer if any
        this.sliderObserver.disconnect();
        this.sliderObserver = null;
    }


    this.sliderSegmentsOverlay = document.createElement('div');
    // Basic styling for the overlay container. It will sit on top of the progress bar.
    this.sliderSegmentsOverlay.style.position = 'absolute';
    this.sliderSegmentsOverlay.style.left = '0';
    this.sliderSegmentsOverlay.style.top = '0';
    this.sliderSegmentsOverlay.style.width = '100%';
    this.sliderSegmentsOverlay.style.height = '100%';
    this.sliderSegmentsOverlay.style.pointerEvents = 'none';
    this.sliderSegmentsOverlay.style.zIndex = '10';
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
      elm.style.height = '100%';
      elm.style.borderRadius = 'inherit';
      
      elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s - ${segmentEnd.toFixed(1)}s`;

      this.sliderSegmentsOverlay.appendChild(elm);
    });

    const attachOverlayToProgressBar = () => {
        if (!this.progressBarElement || !this.sliderSegmentsOverlay) {
            console.warn(this.videoID, "Progress bar element or overlay missing, cannot attach.");
            return;
        }

        // Ensure the parent is a positioning context
        const currentPosition = window.getComputedStyle(this.progressBarElement).position;
        if (currentPosition === 'static') {
            this.progressBarElement.style.position = 'relative';
        }
        
        this.progressBarElement.prepend(this.sliderSegmentsOverlay);
        console.info(this.videoID, 'Segments overlay attached to progress bar:', this.progressBarElement);

        // Disconnect previous observer if it exists
        if (this.sliderObserver) {
            this.sliderObserver.disconnect();
        }

        // ** START: MODIFIED LOGIC **
        this.sliderObserver = new MutationObserver(() => {
            // If progress bar element is gone, restart the search
            if (!this.progressBarElement || !document.body.contains(this.progressBarElement)) {
                console.info(this.videoID, 'Progress bar element removed from DOM. Re-finding...');
                this.sliderObserver.disconnect();
                this.progressBarElement = null;
                watchForProgressBar(); // Restart the search
                return; // Stop this observer callback
            }

            // If the overlay exists but is not a child of the progress bar, re-attach it
            if (this.sliderSegmentsOverlay && !this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
                console.info(this.videoID, 'Overlay detached by YouTube. Re-attaching.');
                // Re-apply positioning context in case it was reset
                if (window.getComputedStyle(this.progressBarElement).position === 'static') {
                    this.progressBarElement.style.position = 'relative';
                }
                this.progressBarElement.prepend(this.sliderSegmentsOverlay);
            }
        });

        // Observe the parent of the progress bar for any changes in its children or their children (subtree)
        if (this.progressBarElement.parentNode) {
            this.sliderObserver.observe(this.progressBarElement.parentNode, { childList: true, subtree: true });
        }
        // ** END: MODIFIED LOGIC **
    };

    const watchForProgressBar = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);

      const progressBarSelectors = [
        '.ytlr-progress-bar',
        '.ytlrProgressBarSlider',
      ];

      this.sliderInterval = setInterval(() => {
        for (const selector of progressBarSelectors) {
          const element = document.querySelector(selector);
          if (element && window.getComputedStyle(element).display !== 'none' && element.offsetWidth > 50) {
            this.progressBarElement = element;
            console.info(this.videoID, `Progress bar found with selector "${selector}":`, this.progressBarElement);
            clearInterval(this.sliderInterval);
            this.sliderInterval = null;
            attachOverlayToProgressBar();
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

    if (!this.active || !this.video || this.video.paused || !this.segments) {
      // console.info(this.videoID, 'Skipping is inactive, video paused, or no segments.');
      return;
    }

    const currentTime = this.video.currentTime;
    // Look for segments starting very slightly ahead or that we are already in
    // The -0.5 allows for slight timing discrepancies or if a seek lands just past the start.
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] >= currentTime - 0.5 && // Segment starts at or after current time (with small tolerance)
        seg.segment[1] > currentTime            // Segment ends after current time
    );
    
    // Sort by start time to get the very next one
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      // console.info(this.videoID, 'No more upcoming segments to schedule skip for.');
      return;
    }

    const segmentToSkip = nextSegments[0];
    const [start, end] = segmentToSkip.segment;

    // Only schedule if the segment is configured to be skipped and is not in the past
    if (this.skippableCategories.includes(segmentToSkip.category) && start > currentTime - 0.3) { // check start > currentTime for true "upcoming"
      const timeUntilSkip = (start - currentTime) * 1000;
      
      // console.info(this.videoID, `Scheduling skip of '${segmentToSkip.category}' from ${start.toFixed(1)}s to ${end.toFixed(1)}s in ${Math.max(0, timeUntilSkip / 1000).toFixed(1)}s`);

      this.nextSkipTimeout = setTimeout(() => {
        // Re-check conditions before actually skipping
        if (!this.active || !this.video || this.video.paused) {
          // console.info(this.videoID, 'Conditions for skip no longer met (inactive, no video, or paused).');
          return;
        }
        // Ensure we are still within the segment or very close to its start, to avoid issues if user seeks away
        if (this.video.currentTime >= start - 0.5 && this.video.currentTime < end) {
            const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
            console.info(this.videoID, `Performing skip of ${skipName} from ${this.video.currentTime.toFixed(1)}s to ${end.toFixed(1)}s.`);
            if (typeof showNotification === 'function') { // Check if showNotification exists
                 showNotification(`Skipping ${skipName}`);
            } else {
                console.info(`Notification: Skipping ${skipName}`);
            }
            this.video.currentTime = end; // Perform the skip
            // Immediately reschedule for any subsequent segments
            this.scheduleSkip();
        } else {
            // console.info(this.videoID, 'Current time is outside the targeted skip segment. Rescheduling.');
            this.scheduleSkip(); // Reschedule because we might have seeked past it or something changed
        }
      }, Math.max(0, timeUntilSkip)); // Ensure timeout is not negative
    } else if (start <= currentTime && end > currentTime && this.skippableCategories.includes(segmentToSkip.category)) {
        // We are already inside a skippable segment
        const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
        console.info(this.videoID, `Currently inside skippable segment '${skipName}'. Skipping from ${currentTime.toFixed(1)}s to ${end.toFixed(1)}s.`);
        if (typeof showNotification === 'function') {
            showNotification(`Skipping ${skipName}`);
        } else {
            console.info(`Notification: Skipping ${skipName}`);
        }
        this.video.currentTime = end;
        this.scheduleSkip();
    } else {
        // console.info(this.videoID, `Next segment '${segmentToSkip.category}' is not skippable or already passed. Looking for others.`);
        // If the very next segment isn't skippable, we still need to check further ones.
        // This recursive call might be too aggressive if many non-skippable segments are upcoming.
        // A better approach would be to find the *next skippable* segment in the filter.
        // For now, this simplified logic schedules for the absolute next, skippable or not (if skippable).
        // The filter `this.skippableCategories.includes(segmentToSkip.category)` handles this.
    }
  }

  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlockHandler instance.');
    this.active = false;

    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    clearInterval(this.sliderInterval);
    this.sliderInterval = null;

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
      this.video = null; // Release video reference
    }
    
    // Clear handlers
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
