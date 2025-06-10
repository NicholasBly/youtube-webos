import sha256 from 'tiny-sha256';
import { configRead } from './config';
import { showNotification } from './ui';

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
  }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
  video = null;
  active = true;

  // Timers/intervals for element detection and skip scheduling
  attachVideoInterval = null; // Changed from Timeout to Interval for continuous checking
  nextSkipTimeout = null;

  slider = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null;

  scheduleSkipHandler = null;
  durationChangeHandler = null; // Now handled within buildOverlay's attachVideoAndBuildOverlay
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
    console.log(`[SponsorBlock] Initializing for video ID: ${this.videoID}`);
  }

  // Main initialization method: fetches segments and then attempts to attach to video/build overlay.
  async init() {
    if (!this.videoID) {
      console.warn('[SponsorBlock] No video ID found, cannot initialize.');
      return;
    }

    try {
      const videoHash = sha256(this.videoID).substring(0, 4);
      const categories = [
        'sponsor',
        'intro',
        'outro',
        'interaction',
        'selfpromo',
        'music_offtopic',
        'preview'
      ];
      const resp = await fetch(
        `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
          JSON.stringify(categories)
        )}`
      );
      const results = await resp.json();

      const result = results.find((v) => v.videoID === this.videoID);
      console.info('[SponsorBlock]', this.videoID, 'Got segment data:', result);

      if (!result || !result.segments || !result.segments.length) {
        console.info('[SponsorBlock]', this.videoID, 'No segments found.');
        return;
      }

      this.segments = result.segments;
      this.skippableCategories = this.getSkippableCategories();

      // Start the process of attaching to video and building the overlay
      this.attachVideoAndBuildOverlay();

      // Only add video event listeners for skipping logic once video is found and segments are available
      this.scheduleSkipHandler = () => this.scheduleSkip();
      // No longer need durationChangeHandler as it's now handled by the polling in attachVideoAndBuildOverlay
      // and re-initialization via MutationObserver if player changes.

    } catch (error) {
      console.error('[SponsorBlock] Error fetching segments:', error);
    }
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead('enableSponsorBlockSponsor')) {
      skippableCategories.push('sponsor');
    }
    if (configRead('enableSponsorBlockIntro')) {
      skippableCategories.push('intro');
    }
    if (configRead('enableSponsorBlockOutro')) {
      skippableCategories.push('outro');
    }
    if (configRead('enableSponsorBlockInteraction')) {
      skippableCategories.push('interaction');
    }
    if (configRead('enableSponsorBlockSelfPromo')) {
      skippableCategories.push('selfpromo');
    }
    if (configRead('enableSponsorBlockMusicOfftopic')) {
      skippableCategories.push('music_offtopic');
    }
    if (configRead('enableSponsorBlockPreview')) {
      skippableCategories.push('preview');
    }
    return skippableCategories;
  }

  // Periodically checks for the presence of the video element and the seek bar slider.
  attachVideoAndBuildOverlay() {
    // Clear any existing interval to prevent multiple checks running simultaneously.
    if (this.attachVideoInterval) clearInterval(this.attachVideoInterval);

    const checkElements = () => {
      // Use more robust selectors for YouTube elements
      this.video = document.querySelector('video.html5-main-video');
      this.slider = document.querySelector('.ytp-progress-bar');

      if (this.video && this.slider) {
        console.info('[SponsorBlock] Video element found:', this.video);
        console.info('[SponsorBlock] Slider element found:', this.slider);

        if (this.video.duration > 0) {
          console.info('[SponsorBlock] Video duration available. Building overlay.');
          clearInterval(this.attachVideoInterval); // Stop the interval once elements are found
          this.buildOverlay();

          // Add video event listeners for skipping logic
          this.video.addEventListener('play', this.scheduleSkipHandler);
          this.video.addEventListener('pause', this.scheduleSkipHandler);
          this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
          // Removed durationchange listener as buildOverlay handles re-creation via observer
          // and initial placement already considers duration.
        } else {
          console.info('[SponsorBlock] Video duration not yet available. Waiting...');
        }
      } else {
        if (!this.video) console.info('[SponsorBlock] Video element not found yet.');
        if (!this.slider) console.info('[SponsorBlock] Slider element not found yet.');
        console.info('[SponsorBlock] Waiting for video and slider to load...');
      }
    };

    // Start checking every 500 milliseconds.
    this.attachVideoInterval = setInterval(checkElements, 500);
  }

  // Builds and injects the visual overlay for segments onto the seek bar.
  buildOverlay() {
    // If an overlay already exists (e.g., due to re-initialization), remove it first.
    if (this.sliderSegmentsOverlay) {
      console.info('[SponsorBlock] Existing overlay found, removing and rebuilding.');
      this.sliderSegmentsOverlay.remove();
      this.sliderSegmentsOverlay = null;
    }

    if (!this.video || !this.video.duration) {
      console.info('[SponsorBlock] Video or video duration not available for overlay build.');
      return;
    }

    const videoDuration = this.video.duration;

    // Create the main container for all segment bars.
    this.sliderSegmentsOverlay = document.createElement('div');
    this.sliderSegmentsOverlay.classList.add('sponsorblock-segments-overlay');

    // Set up basic styling for the overlay container.
    this.sliderSegmentsOverlay.style.position = 'absolute';
    this.sliderSegmentsOverlay.style.left = '0';
    this.sliderSegmentsOverlay.style.top = '0';
    this.sliderSegmentsOverlay.style.width = '100%';
    this.sliderSegmentsOverlay.style.height = '100%';
    this.sliderSegmentsOverlay.style.pointerEvents = 'none'; // Allow interactions with the underlying seek bar.
    this.sliderSegmentsOverlay.style['z-index'] = '10';

    // Iterate over each fetched segment and create a corresponding visual bar.
    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const barType = barTypes[segment.category] || {
        color: 'gray',
        opacity: 0.7
      };
      const transform = `translateX(${(start / videoDuration) * 100.0}%) scaleX(${(end - start) / videoDuration})`;

      const elm = document.createElement('div');
      // Use a more generic class name
      elm.classList.add('sponsorblock-segment-bar');
      elm.style['background-color'] = barType.color;
      elm.style['opacity'] = barType.opacity;
      elm.style['-webkit-transform'] = transform;
      elm.style['transform'] = transform;
      elm.style['position'] = 'absolute';
      elm.style['left'] = '0';
      elm.style['top'] = '0';
      elm.style['height'] = '100%';
      elm.style['width'] = '100%';
      elm.style['transform-origin'] = 'left';
      elm.style['box-sizing'] = 'border-box';

      console.info('[SponsorBlock] Generated element:', elm, 'from segment:', segment, 'with transform:', transform);
      this.sliderSegmentsOverlay.appendChild(elm);
    });

    // Append the entire overlay container to the detected YouTube progress bar.
    if (this.slider) {
      // Ensure the slider has a relative position for absolute children to work.
      this.slider.style.position = this.slider.style.position || 'relative';
      this.slider.appendChild(this.sliderSegmentsOverlay);
      console.log('[SponsorBlock] Overlay appended to slider:', this.slider);
    } else {
      console.warn('[SponsorBlock] Slider element not found during buildOverlay, cannot append overlay.');
      return;
    }

    // Sets up a MutationObserver to re-add the overlay if YouTube's dynamic UI
    // removes it or rebuilds the player elements.
    const watchForSliderChanges = () => {
      if (this.sliderObserver) this.sliderObserver.disconnect();

      // Observe the immediate parent of the slider for changes.
      // This should typically be `.ytp-chrome-bottom`.
      const observerTarget = this.slider.parentNode;

      if (observerTarget) {
        console.log("[SponsorBlock] Observing slider parent for DOM changes:", observerTarget);
        this.sliderObserver = new MutationObserver((mutations) => {
          let reattachNeeded = false;
          mutations.forEach((m) => {
            // If the segments overlay itself is removed, re-add it.
            if (m.removedNodes) {
              for (const node of m.removedNodes) {
                if (node === this.sliderSegmentsOverlay) {
                  console.info('[SponsorBlock] Segments overlay was removed, marking for re-attachment.');
                  reattachNeeded = true;
                }
                // If the slider element itself is removed, re-initiate the entire process.
                if (node === this.slider || (node.contains && node.contains(this.slider))) {
                  console.info('[SponsorBlock] Slider element removed or changed, marking for re-initialization.');
                  this.sliderObserver.disconnect();
                  // Trigger a re-initialization of the whole process for the current video.
                  // Use the global function to manage the instance.
                  initializeSponsorBlock(this.videoID);
                  return;
                }
              }
            }
            // If new nodes are added that might be the slider, re-evaluate.
            if (m.addedNodes) {
              for (const node of m.addedNodes) {
                if (node.querySelector('.ytp-progress-bar')) {
                  console.info('[SponsorBlock] New slider or container added, marking for re-initialization.');
                  this.sliderObserver.disconnect();
                  initializeSponsorBlock(this.videoID);
                  return;
                }
              }
            }
          });
          if (reattachNeeded) {
            // Only re-add the overlay if it was removed and the slider is still there
            if (this.slider && !this.slider.contains(this.sliderSegmentsOverlay)) {
              console.info('[SponsorBlock] Re-attaching segments overlay.');
              this.slider.appendChild(this.sliderSegmentsOverlay);
            }
          }
        });
        this.sliderObserver.observe(observerTarget, {
          childList: true,
          subtree: true,
        });
      } else {
        console.warn("[SponsorBlock] Observer target (slider parent) not found, cannot set up MutationObserver.");
      }
    };

    watchForSliderChanges();
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

        const skipName = barTypes[segment.category]?.name || segment.category;
        console.info(this.videoID, 'Skipping', segment);
        showNotification(`Skipping ${skipName}`);
        this.video.currentTime = end;
        this.scheduleSkip();
      },
      (start - this.video.currentTime) * 1000
    );
  }

  destroy() {
    console.info(this.videoID, 'Destroying');

    this.active = false;

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.attachVideoInterval) {
      clearInterval(this.attachVideoInterval);
      this.attachVideoInterval = null;
    }

    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
      this.sliderObserver = null;
    }

    if (this.sliderSegmentsOverlay) {
      if (this.sliderSegmentsOverlay.parentNode) {
        this.sliderSegmentsOverlay.remove();
      }
      this.sliderSegmentsOverlay = null;
    }

    if (this.video) {
      // Remove event listeners added during attachVideoAndBuildOverlay
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
    }
  }
}

// When this global variable was declared using let and two consecutive hashchange
// events were fired (due to bubbling? not sure...) the second call handled below
// would not see the value change from first call, and that would cause multiple
// SponsorBlockHandler initializations... This has been noticed on Chromium 38.
// This either reveals some bug in chromium/webpack/babel scope handling, or
// shows my lack of understanding of javascript. (or both)
window.sponsorblock = null; // Renamed to currentSponsorBlockHandler for clarity

// --- Main execution logic (adapted from Tampermonkey script) ---

let currentSponsorBlockHandler = null; // Stores the active handler instance.

// Initializes a new SponsorBlock handler for the given video ID.
function initializeSponsorBlock(videoID) {
    if (!videoID) {
        console.warn('[SponsorBlock] Attempted to initialize without a valid video ID.');
        return;
    }
    // Destroy any existing handler if it's for a different video or if no video is active
    if (currentSponsorBlockHandler && currentSponsorBlockHandler.videoID === videoID) {
        console.log('[SponsorBlock] Handler already active for this video ID, skipping re-initialization.');
        return; // Already initialized for this video, avoid redundant work.
    } else if (currentSponsorBlockHandler) {
         console.log('[SponsorBlock] Destroying previous handler for a different video or inactive state.');
         currentSponsorBlockHandler.destroy();
    }

    currentSponsorBlockHandler = new SponsorBlockHandler(videoID);
    currentSponsorBlockHandler.init();
    window.sponsorblock = currentSponsorBlockHandler; // Keep global reference consistent if needed externally
}

// Destroys the current SponsorBlock handler.
function uninitializeSponsorblock() { // Renamed for consistency with global window.sponsorblock
    if (currentSponsorBlockHandler) {
        console.log('[SponsorBlock] Uninitializing current handler.');
        currentSponsorBlockHandler.destroy();
        currentSponsorBlockHandler = null;
    }
    window.sponsorblock = null;
}

// Helper function to extract the video ID from a given URL.
function getVideoIdFromUrl(url) {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.pathname === '/watch') {
            return parsedUrl.searchParams.get('v');
        }
    } catch (e) {
        // console.error("[SponsorBlock] Error parsing URL:", e); // Suppress frequent errors for malformed hashes
    }
    return null;
}

// Listens for hash changes, which YouTube uses for navigation without full page reloads.
window.addEventListener(
  'hashchange',
  () => {
    const newURL = new URL(location.hash.substring(1), location.href);
    const videoID = getVideoIdFromUrl(newURL.toString());

    console.info('[SponsorBlock] Hashchange detected. New video ID:', videoID);

    if (videoID) {
        initializeSponsorBlock(videoID);
    } else {
        // Uninitialize sponsorblock when not on `/watch` path.
        console.info('uninitializing sponsorblock on a non-video page');
        uninitializeSponsorblock();
    }
  },
  false
);

// Initial check on page load.
window.addEventListener('load', () => {
    const videoID = getVideoIdFromUrl(location.href);
    console.info('[SponsorBlock] Page loaded. Initial video ID:', videoID);
    if (videoID) {
        initializeSponsorBlock(videoID);
    }
});

// A robust MutationObserver to catch scenarios where the player
// is dynamically loaded or changed in ways not caught by hashchange or load.
const playerContainer = document.getElementById('movie_player') || document.body;
if (playerContainer) {
    const generalObserver = new MutationObserver((mutations) => {
        const currentVideoID = getVideoIdFromUrl(location.href);
        if (currentVideoID) {
            initializeSponsorBlock(currentVideoID);
        } else if (currentSponsorBlockHandler) {
            uninitializeSponsorblock();
        }
    });
    generalObserver.observe(playerContainer, { childList: true, subtree: true });
    console.info('[SponsorBlock] General MutationObserver started on:', playerContainer);
} else {
    console.warn('[SponsorBlock] Could not find player container (#movie_player), general observer not started.');
}
