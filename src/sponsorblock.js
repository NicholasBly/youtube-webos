import sha256 from 'tiny-sha256';
import { configRead } from './config'; // Assuming you have this file
import { showNotification } from './ui'; // Assuming you have this file

// Fallback for tiny-sha256 if it's not found (e.g. in a raw WebOS environment without module loading)
if (typeof sha256 !== 'function' && typeof require === 'function') {
    try {
        console.warn("sha256 function was not initially available. Ensure it's correctly loaded for WebOS.");
    } catch (e) {
        console.error("Failed to load sha256. SponsorBlock functionality will be impaired.", e);
        // Provide a dummy function if all else fails, to prevent crashes.
        window.sha256 = window.sha256 || function(s) { return s; };
    }
}

const barTypes = {
  sponsor: { color: '#00d400', opacity: '0.7', name: 'sponsored segment' },
  intro: { color: '#00ffff', opacity: '0.7', name: 'intro' },
  outro: { color: '#0202ed', opacity: '0.7', name: 'outro' },
  interaction: { color: '#cc00ff', opacity: '0.7', name: 'interaction reminder' },
  selfpromo: { color: '#ffff00', opacity: '0.7', name: 'self-promotion' },
  music_offtopic: { color: '#ff9900', opacity: '0.7', name: 'non-music part' },
  preview: { color: '#008fd6', opacity: '0.7', name: 'recap or preview' },
  chapter: { color: 'rgba(128, 128, 128, 0.5)', opacity: '0.5', name: 'chapter' }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
  video = null;
  active = true;
  attachVideoTimeout = null;
  nextSkipTimeout = null;

  sliderSegmentsOverlay = null;
  maintainOverlayInterval = null; // For the persistent check loop

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
        
        let result = Array.isArray(results) ? results.find((v) => v.videoID === this.videoID) : (results && results.videoID === this.videoID ? results : null);

        if (!result || !result.segments || !result.segments.length) {
          console.info(this.videoID, 'No segments found.');
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
    const skippableCategories = [];
    try {
        if (configRead('enableSponsorBlockSponsor')) skippableCategories.push('sponsor');
        if (configRead('enableSponsorBlockIntro')) skippableCategories.push('intro');
        if (configRead('enableSponsorBlockOutro')) skippableCategories.push('outro');
        if (configRead('enableSponsorBlockInteraction')) skippableCategories.push('interaction');
        if (configRead('enableSponsorBlockSelfPromo')) skippableCategories.push('selfpromo');
        if (configRead('enableSponsorBlockMusicOfftopic')) skippableCategories.push('music_offtopic');
        if (configRead('enableSponsorBlockPreview')) skippableCategories.push('preview');
    } catch (e) {
        console.warn("Could not read SponsorBlock config, using defaults.", e);
        return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
    }
    return skippableCategories;
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

  maintainOverlay() {
    // If handler is not active or the overlay hasn't been built, do nothing.
    if (!this.active || !this.sliderSegmentsOverlay) {
        return;
    }

    // 1. Find the progress bar every single time to get a fresh reference.
    const progressBarSelectors = [
      '.ytlr-progress-bar__slider',
      '.ytlr-multi-markers-player-bar-renderer',
      '.ytlr-progress-bar',
      '.ytp-progress-bar',
      '.ytp-progress-bar-container',
      '.ytLrProgressBarSlider',
      '.ytLrProgressBarSliderBase'
    ];
    let progressBarElement = null;
    for (const selector of progressBarSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetWidth > 50) {
	console.info('slider found...', element);
        progressBarElement = element;
        break;
      }
    }
    
    // If no progress bar is found on the page, we can't do anything.
    if (!progressBarElement) {
        return;
    }

    // 2. Ensure its position is 'relative' for absolute children to be placed correctly.
    if (window.getComputedStyle(progressBarElement).position === 'static') {
        progressBarElement.style.position = 'relative';
    }

    // 3. If our overlay isn't a child of the progress bar, add it.
    if (!progressBarElement.contains(this.sliderSegmentsOverlay)) {
        console.info(this.videoID, "Overlay missing or detached, re-attaching...");
        progressBarElement.prepend(this.sliderSegmentsOverlay);
    }
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
      console.info(this.videoID, 'Video duration not ready. Overlay build deferred.');
      return;
    }
    
    if (!this.segments || !this.segments.length) {
        console.info(this.videoID, 'No segments loaded. Overlay not built.');
        return;
    }

    const videoDuration = this.video.duration;
    console.info(this.videoID, `Building overlay for duration: ${videoDuration}s`);

    // Create the overlay container element if it doesn't already exist.
    if (!this.sliderSegmentsOverlay) {
        this.sliderSegmentsOverlay = document.createElement('div');
        this.sliderSegmentsOverlay.style.position = 'absolute';
        this.sliderSegmentsOverlay.style.left = '0';
        this.sliderSegmentsOverlay.style.top = '0';
        this.sliderSegmentsOverlay.style.width = '100%';
        this.sliderSegmentsOverlay.style.height = '100%';
        this.sliderSegmentsOverlay.style.pointerEvents = 'none';
        this.sliderSegmentsOverlay.style.zIndex = '10';
        this.sliderSegmentsOverlay.id = 'sponsorblock-segments-overlay';
    } else {
        // Clear old segments if we are rebuilding the overlay.
        while (this.sliderSegmentsOverlay.firstChild) {
            this.sliderSegmentsOverlay.removeChild(this.sliderSegmentsOverlay.firstChild);
        }
    }

    // Populate the overlay with the visual segment bars.
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
      elm.style.height = '60%'; // Position on bottom 60% to avoid covering chapters.
      elm.style.bottom = '0px';
      elm.style.top = 'auto'; // Unset top positioning.
      elm.style.borderRadius = 'inherit';
      elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s - ${segmentEnd.toFixed(1)}s`;

      this.sliderSegmentsOverlay.appendChild(elm);
    });

    // Start the persistent overlay loop if it's not already running.
    if (!this.maintainOverlayInterval) {
        this.maintainOverlayInterval = setInterval(() => this.maintainOverlay(), 250);
    }
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active || !this.video || this.video.paused || !this.segments) {
      return;
    }

    const currentTime = this.video.currentTime;
    const nextSegment = this.segments
      .filter(seg => seg.segment[1] > currentTime && this.skippableCategories.includes(seg.category))
      .sort((a, b) => a.segment[0] - b.segment[0])[0];
      
    if (!nextSegment) return;

    const [start, end] = nextSegment.segment;

    // If we are currently inside a skippable segment
    if (start <= currentTime && end > currentTime) {
        const skipName = barTypes[nextSegment.category]?.name || nextSegment.category;
        console.info(this.videoID, `Skipping current segment '${skipName}'.`);
        if (typeof showNotification === 'function') showNotification(`Skipping ${skipName}`);
        this.video.currentTime = end;
        this.scheduleSkip(); // Immediately check for the next segment
        return;
    }
    
    // If the next segment is in the future
    if (start > currentTime) {
      const timeUntilSkip = (start - currentTime) * 1000;
      this.nextSkipTimeout = setTimeout(() => {
        // Re-check conditions before skipping
        if (!this.active || this.video.paused || this.video.seeking) return;
        // Check if we are still on track for this segment
        if (Math.abs(this.video.currentTime - start) < 1) {
            const skipName = barTypes[nextSegment.category]?.name || nextSegment.category;
            console.info(this.videoID, `Skipping upcoming segment '${skipName}'.`);
            if (typeof showNotification === 'function') showNotification(`Skipping ${skipName}`);
            this.video.currentTime = end;
        }
        this.scheduleSkip();
      }, timeUntilSkip);
    }
  }

  destroy() {
    console.info(this.videoID, 'Destroying SponsorBlockHandler instance.');
    this.active = false;

    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    if (this.maintainOverlayInterval) {
        clearInterval(this.maintainOverlayInterval);
        this.maintainOverlayInterval = null;
    }

    if (this.sliderSegmentsOverlay?.parentNode) {
      this.sliderSegmentsOverlay.remove();
    }
    this.sliderSegmentsOverlay = null;

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
        window.sponsorblock.destroy();
        window.sponsorblock = null;
        console.info("SponsorBlock uninitialized.");
      }
    }

    const handleHashChange = () => {
        let currentPath = '';
        let searchParamsString = '';
        try {
            const hash = window.location.hash.substring(1);
            const queryIndex = hash.indexOf('?');
            if (queryIndex !== -1) {
                currentPath = hash.substring(0, queryIndex);
                searchParamsString = hash.substring(queryIndex);
            } else {
                currentPath = hash;
            }
        } catch (e) {
            console.error("Error parsing window.location.hash:", e);
        }

        const videoID = new URLSearchParams(searchParamsString).get('v');
        console.info(`Hash changed. Path: '${currentPath}', Video ID: '${videoID}'`);

        if (currentPath !== '/watch' || !videoID) {
          uninitializeSponsorblock();
          return;
        }

        const needsReload = !window.sponsorblock || window.sponsorblock.videoID !== videoID;
        if (needsReload) {
          uninitializeSponsorblock();
          let sbEnabled = true;
          try {
            sbEnabled = configRead('enableSponsorBlock');
          } catch (e) {
            console.warn("Could not read config, defaulting to enabled.", e);
          }
          if (sbEnabled) {
            console.info(`SponsorBlock enabled. Initializing for video ID: ${videoID}`);
            window.sponsorblock = new SponsorBlockHandler(videoID);
            window.sponsorblock.init();
          } else {
            console.info('SponsorBlock is disabled in config.');
          }
        }
    };

    window.addEventListener('hashchange', handleHashChange, false);
    // Initial run on page load
    setTimeout(handleHashChange, 500);

} else {
    console.warn("SponsorBlock: 'window' object not found.");
}

// Dummy/fallback implementations for environments where these aren't provided.
if (typeof configRead === 'undefined') {
    console.warn("configRead function is not defined. Using dummy implementation.");
    window.configRead = function(key) { return true; };
}

if (typeof showNotification === 'undefined') {
    console.warn("showNotification function is not defined. Using console.log fallback.");
    window.showNotification = function(message) {
        console.info(`[Notification] ${message}`);
    };
}
