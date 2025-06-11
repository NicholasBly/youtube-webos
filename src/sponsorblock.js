import sha256 from 'tiny-sha256';
import { configRead } from './config'; // Assuming you have this file
import { showNotification } from './ui'; // Assuming you have this file

// Fallback for tiny-sha256 if it's not found (e.g. in a raw WebOS environment without module loading)
if (typeof sha256 !== 'function' && typeof require === 'function') {
    try {
        // This is a placeholder; direct inclusion or a global sha256 function might be needed for WebOS.
        console.warn("sha256 function was not initially available. Ensure it's correctly loaded for WebOS.");
    } catch (e) {
        console.error("Failed to load sha256. SponsorBlock functionality will be impaired.", e);
        // Provide a dummy function if all else fails, to prevent crashes. This is NOT a real solution.
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
  chapter: {
    color: 'rgba(128, 128, 128, 0.5)',
    opacity: '0.5',
    name: 'chapter'
  }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  progressBarElement = null;
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null;
  reattachInterval = null; // For periodic check

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
    this.reattachInterval = null;
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
        
        let result;
        if (Array.isArray(results)) {
            result = results.find((v) => v.videoID === this.videoID);
        } else if (results && results.videoID === this.videoID) {
            result = results;
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
  
  // New method for periodically checking and re-attaching the overlay
  checkAndReattachOverlay() {
    if (!this.active || !this.progressBarElement || !this.sliderSegmentsOverlay) {
        if (this.reattachInterval) {
            clearInterval(this.reattachInterval);
            this.reattachInterval = null;
        }
        return;
    }

    if (!this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
        console.info(this.videoID, "Periodic check found overlay missing. Re-attaching.");
        
        if (document.body.contains(this.progressBarElement)) {
            if (window.getComputedStyle(this.progressBarElement).position === 'static') {
                this.progressBarElement.style.position = 'relative';
            }
            this.progressBarElement.prepend(this.sliderSegmentsOverlay);
        } else {
            console.info(this.videoID, "Progress bar lost. Restarting watch process.");
            this.progressBarElement = null;
            if (this.sliderObserver) this.sliderObserver.disconnect();
            if (this.reattachInterval) clearInterval(this.reattachInterval);
            this.watchForProgressBar();
        }
    }
  }

  // Moved from buildOverlay to be a class method
  attachOverlayToProgressBar() {
    if (this.progressBarElement && this.sliderSegmentsOverlay) {
      const currentPosition = window.getComputedStyle(this.progressBarElement).position;
      if (currentPosition === 'static') {
          this.progressBarElement.style.position = 'relative';
          console.info(this.videoID, `Set ${this.progressBarElement.className || this.progressBarElement.id} to position: relative`);
      }
      
      this.progressBarElement.prepend(this.sliderSegmentsOverlay);
      console.info(this.videoID, 'Segments overlay attached to progress bar:', this.progressBarElement);

      if (this.sliderObserver) this.sliderObserver.disconnect();
      if (this.progressBarElement.parentNode) {
          this.sliderObserver = new MutationObserver((mutations) => {
            let reAttachOverlay = false;
            let reFindProgressBar = false;

            for (const mutation of mutations) {
              if (mutation.type === 'childList') {
                if (mutation.removedNodes) {
                  mutation.removedNodes.forEach(node => {
                    if (node === this.sliderSegmentsOverlay) {
                      console.info(this.videoID, 'Segments overlay removed by YouTube. Re-attaching.');
                      reAttachOverlay = true;
                    }
                    if (node === this.progressBarElement) {
                      console.info(this.videoID, 'Progress bar element removed. Re-finding.');
                      reFindProgressBar = true;
                    }
                  });
                }
              }
            }

            if (reFindProgressBar) {
              this.progressBarElement = null;
              if(this.sliderObserver) this.sliderObserver.disconnect();
              this.watchForProgressBar();
            } else if (reAttachOverlay && this.progressBarElement && this.sliderSegmentsOverlay) {
              if (document.body.contains(this.progressBarElement)) {
                  this.progressBarElement.prepend(this.sliderSegmentsOverlay);
              } else {
                  this.progressBarElement = null;
                  if(this.sliderObserver) this.sliderObserver.disconnect();
                  this.watchForProgressBar();
              }
            }
          });

          this.sliderObserver.observe(this.progressBarElement.parentNode, { childList: true, subtree: false });
          this.sliderObserver.observe(this.progressBarElement, { childList: true, subtree: false });
      }

    } else {
        console.warn(this.videoID, "Progress bar element or overlay missing, cannot attach.");
    }
  }

  // Moved from buildOverlay to be a class method
  watchForProgressBar() {
    if (this.sliderInterval) clearInterval(this.sliderInterval);

    const progressBarSelectors = [
      '.ytlr-progress-bar',
      '.ytLrProgressBarSlider',
      '.ytLrProgressBarSliderBase' // Added for better targeting
    ];

    this.sliderInterval = setInterval(() => {
      for (const selector of progressBarSelectors) {
        const element = document.querySelector(selector);
        if (element && window.getComputedStyle(element).display !== 'none' && element.offsetWidth > 50) {
          this.progressBarElement = element;
          console.info(this.videoID, `Progress bar found with selector "${selector}":`, this.progressBarElement);
          clearInterval(this.sliderInterval);
          this.sliderInterval = null;
          this.attachOverlayToProgressBar();
          return;
        }
      }
      console.info(this.videoID, 'Still searching for progress bar...');
    }, 500);
  }

  buildOverlay() {
    if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
      console.info(this.videoID, 'Video duration not available or invalid. Overlay build deferred.');
      return;
    }
    
    if (!this.segments || !this.segments.length) {
        console.info(this.videoID, 'No segments loaded. Overlay not built.');
        return;
    }

    const videoDuration = this.video.duration;
    console.info(this.videoID, `Building overlay for duration: ${videoDuration}s`);

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
      
      // MODIFICATION: Position segments on the bottom half to not cover chapters
      elm.style.height = '60%';
      elm.style.bottom = '0px';
      elm.style.top = 'auto'; // unset top
      
      elm.style.borderRadius = 'inherit';
      elm.title = `${barType.name}: ${segmentStart.toFixed(1)}s - ${segmentEnd.toFixed(1)}s`;

      this.sliderSegmentsOverlay.appendChild(elm);
    });

    this.watchForProgressBar();

    // Start the periodic check to ensure the overlay stays put.
    if (this.reattachInterval) {
        clearInterval(this.reattachInterval);
    }
    this.reattachInterval = setInterval(() => this.checkAndReattachOverlay(), 1000);
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active || !this.video || this.video.paused || !this.segments) {
      return;
    }

    const currentTime = this.video.currentTime;
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] >= currentTime - 0.5 &&
        seg.segment[1] > currentTime
    );
    
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      return;
    }

    const segmentToSkip = nextSegments[0];
    const [start, end] = segmentToSkip.segment;

    if (this.skippableCategories.includes(segmentToSkip.category) && start > currentTime - 0.3) {
      const timeUntilSkip = (start - currentTime) * 1000;
      
      this.nextSkipTimeout = setTimeout(() => {
        if (!this.active || !this.video || this.video.paused) {
          return;
        }
        if (this.video.currentTime >= start - 0.5 && this.video.currentTime < end) {
            const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
            console.info(this.videoID, `Performing skip of ${skipName} from ${this.video.currentTime.toFixed(1)}s to ${end.toFixed(1)}s.`);
            if (typeof showNotification === 'function') {
                 showNotification(`Skipping ${skipName}`);
            }
            this.video.currentTime = end;
            this.scheduleSkip();
        } else {
            this.scheduleSkip();
        }
      }, Math.max(0, timeUntilSkip));
    } else if (start <= currentTime && end > currentTime && this.skippableCategories.includes(segmentToSkip.category)) {
        const skipName = barTypes[segmentToSkip.category]?.name || segmentToSkip.category;
        console.info(this.videoID, `Currently inside skippable segment '${skipName}'. Skipping from ${currentTime.toFixed(1)}s to ${end.toFixed(1)}s.`);
        if (typeof showNotification === 'function') {
            showNotification(`Skipping ${skipName}`);
        }
        this.video.currentTime = end;
        this.scheduleSkip();
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
    
    // Clear the re-attachment interval
    if (this.reattachInterval) {
        clearInterval(this.reattachInterval);
        this.reattachInterval = null;
    }

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

          let sbEnabled = true;
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
        }
    };

    window.addEventListener('hashchange', handleHashChange, false);

    if (document.readyState === 'complete') {
        setTimeout(handleHashChange, 500);
    } else {
        window.addEventListener('load', () => setTimeout(handleHashChange, 500));
    }

} else {
    console.warn("SponsorBlock: 'window' object not found. Running in a non-browser environment?");
}

if (typeof configRead === 'undefined') {
    console.warn("configRead function is not defined. Using dummy implementation.");
    window.configRead = function(key) {
        if (key === 'enableSponsorBlock') return true;
        if (key.startsWith('enableSponsorBlock')) return true;
        return false;
    };
}

if (typeof showNotification === 'undefined') {
    console.warn("showNotification function is not defined. Using console.log fallback.");
    window.showNotification = function(message) {
        console.info(`[Notification] ${message}`);
    };
}
