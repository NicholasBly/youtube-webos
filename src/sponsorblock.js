import sha256 from 'tiny-sha256';
import { configRead } from './config'; // Assuming you have this file
import { showNotification } from './ui'; // Assuming you have this file

/**
 * SponsorBlock.js for LG WebOS
 *
 * This script integrates SponsorBlock functionality into the YouTube app on LG WebOS.
 * It fetches sponsorship segments, displays them on the progress bar, and automatically
 * skips them based on user configuration.
 *
 * This implementation is based on concepts from the original SponsorBlock extension,
 * fix.js, and previewBar.ts, adapted for the WebOS environment.
 */

// Assuming tiny-sha256 is loaded globally in the WebOS environment.
// If not, it needs to be included directly in the app's vendor scripts.
// Example: <script src="path/to/tiny-sha256.js"></script>

(function(window) {
    'use strict';

    // --- Helper Functions & Constants ---

    // Dummy implementations for config and UI, to be replaced by the WebOS app's actual functions.
    if (typeof window.configRead === 'undefined') {
        console.warn("SponsorBlock: configRead function is not defined. Using dummy implementation.");
        window.configRead = function(key) {
            // Default to enabling all features if config is missing.
            return !key.startsWith('enable') || true;
        };
    }

    if (typeof window.showNotification === 'undefined') {
        console.warn("SponsorBlock: showNotification function is not defined. Using console.log fallback.");
        window.showNotification = function(message) {
            console.info(`[SponsorBlock Notification] ${message}`);
            // On a real WebOS app, you would use its native notification API here.
            // For example: webOS.notification.showToast({ message: message, duration: 2000 }, () => {});
        };
    }


    const SPONSORBLOCK_API = 'https://sponsor.ajay.app/api';
    const CATEGORIES = ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview', 'filler'];
    const BAR_TYPES = {
        sponsor: { color: 'rgba(0, 212, 0, 0.7)', name: 'Sponsor' },
        intro: { color: 'rgba(0, 255, 255, 0.7)', name: 'Intro' },
        outro: { color: 'rgba(2, 2, 237, 0.7)', name: 'Outro' },
        interaction: { color: 'rgba(204, 0, 255, 0.7)', name: 'Interaction Reminder' },
        selfpromo: { color: 'rgba(255, 255, 0, 0.7)', name: 'Self-promotion' },
        music_offtopic: { color: 'rgba(255, 153, 0, 0.7)', name: 'Non-music part' },
        preview: { color: 'rgba(0, 143, 214, 0.7)', name: 'Recap/Preview' },
        filler: { color: 'rgba(175, 175, 175, 0.7)', name: 'Filler Tangent' }
    };


    /**
     * The main class for handling SponsorBlock logic.
     */
    class SponsorBlock {
        constructor(videoID) {
            this.videoID = videoID;
            this.video = null;
            this.progressBar = null;
            this.segments = [];
            this.skippableCategories = [];
            this.active = true;

            this.timeouts = {
                attachVideo: null,
                scheduleSkip: null,
            };
            this.intervals = {
                progressBar: null,
            };
            this.observers = {
                progressBar: null,
            };

            this.previewBar = new PreviewBar();

            console.info(`SponsorBlock: Initialized for videoID: ${this.videoID}`);
            this.init();
        }

        async init() {
            if (typeof sha256 !== 'function') {
                console.error("SponsorBlock: sha256 function is not available. Cannot fetch segments.");
                return;
            }

            this.skippableCategories = this.getSkippableCategories();
            
            try {
                const videoHash = sha256(this.videoID).substring(0, 4);
                const response = await fetch(`${SPONSORBLOCK_API}/skipSegments/${videoHash}?categories=${JSON.stringify(CATEGORIES)}`);
                
                if (!response.ok) {
                    console.error(`SponsorBlock: API request failed with status: ${response.status}`);
                    return;
                }
                
                const results = await response.json();
                const videoInfo = results.find(v => v.videoID === this.videoID);

                if (videoInfo && videoInfo.segments && videoInfo.segments.length > 0) {
                    this.segments = videoInfo.segments;
                    console.info(`SponsorBlock: Found ${this.segments.length} segments for video ${this.videoID}.`);
                    this.start();
                } else {
                    console.info(`SponsorBlock: No segments found for video ${this.videoID}.`);
                }
            } catch (error) {
                console.error("SponsorBlock: Error fetching segments:", error);
            }
        }

        getSkippableCategories() {
            return CATEGORIES.filter(cat => window.configRead(`skip${cat.charAt(0).toUpperCase() + cat.slice(1)}`));
        }

        start() {
            this.findVideoElement();
        }

        findVideoElement() {
            this.clearTimeout('attachVideo');
            this.video = document.querySelector('video.video-stream.html5-main-video');
            
            if (!this.video) {
                this.timeouts.attachVideo = setTimeout(() => this.findVideoElement(), 250);
                return;
            }

            console.info("SponsorBlock: Video element found. Attaching event listeners.");
            this.addVideoEventListeners();
            this.findProgressBar();

            if (this.video.duration > 0) {
                this.previewBar.render(this.progressBar, this.segments, this.video.duration);
            }
        }

        addVideoEventListeners() {
            this.scheduleSkip = this.scheduleSkip.bind(this);
            this.handleDurationChange = this.handleDurationChange.bind(this);

            this.video.addEventListener('play', this.scheduleSkip);
            this.video.addEventListener('pause', this.scheduleSkip);
            this.video.addEventListener('seeking', this.scheduleSkip);
            this.video.addEventListener('timeupdate', this.scheduleSkip);
            this.video.addEventListener('loadedmetadata', this.handleDurationChange);
        }

        removeVideoEventListeners() {
            if (this.video) {
                this.video.removeEventListener('play', this.scheduleSkip);
                this.video.removeEventListener('pause', this.scheduleSkip);
                this.video.removeEventListener('seeking', this.scheduleSkip);
                this.video.removeEventListener('timeupdate', this.scheduleSkip);
                this.video.removeEventListener('loadedmetadata', this.handleDurationChange);
            }
        }
        
        handleDurationChange() {
            if (this.progressBar && this.video && this.video.duration > 0) {
                 this.previewBar.render(this.progressBar, this.segments, this.video.duration);
            }
        }

        findProgressBar() {
            this.clearInterval('progressBar');
            // Selectors for LG WebOS YouTube App's progress bar
            const selectors = ['.ytlr-progress-bar', '.ytLrProgressBarSlider'];
            
            this.intervals.progressBar = setInterval(() => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.offsetWidth > 100) { // Ensure it's rendered and visible
                        console.info(`SponsorBlock: Progress bar found with selector: "${selector}"`);
                        this.progressBar = element;
                        this.clearInterval('progressBar');
                        this.handleDurationChange(); // Render segments now that we have the bar
                        this.observeProgressBar();
                        return;
                    }
                }
            }, 500);
        }

        observeProgressBar() {
            if (this.observers.progressBar || !this.progressBar || !this.progressBar.parentNode) return;

            this.observers.progressBar = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (mutation.removedNodes) {
                        let barRemoved = false;
                        mutation.removedNodes.forEach(node => {
                            // If the progress bar itself is removed, we need to find it again
                            if (node === this.progressBar) {
                                barRemoved = true;
                            }
                        });

                        if (barRemoved) {
                            console.warn("SponsorBlock: Progress bar was removed from DOM. Re-initializing search.");
                            this.observers.progressBar.disconnect();
                            this.observers.progressBar = null;
                            this.progressBar = null;
                            this.previewBar.clear();
                            this.findProgressBar();
                            break; 
                        }
                    }
                }
            });

            this.observers.progressBar.observe(this.progressBar.parentNode, { childList: true });
        }


        scheduleSkip() {
            this.clearTimeout('scheduleSkip');

            if (!this.active || !this.video || this.video.paused || !this.segments.length) {
                return;
            }

            const currentTime = this.video.currentTime;
            let upcomingSegment = null;

            // Check if we are currently inside a skippable segment
            for (const segment of this.segments) {
                if (currentTime >= segment.segment[0] && currentTime < segment.segment[1]) {
                    if (this.skippableCategories.includes(segment.category)) {
                        this.performSkip(segment);
                        return; // Skip performed, no need to schedule another
                    }
                }
                // Find the next upcoming skippable segment
                else if (segment.segment[0] > currentTime && this.skippableCategories.includes(segment.category)) {
                    if (!upcomingSegment || segment.segment[0] < upcomingSegment.segment[0]) {
                        upcomingSegment = segment;
                    }
                }
            }

            if (upcomingSegment) {
                const timeUntilSkip = (upcomingSegment.segment[0] - currentTime) * 1000;
                this.timeouts.scheduleSkip = setTimeout(() => this.performSkip(upcomingSegment), timeUntilSkip);
            }
        }

        performSkip(segment) {
            // Final check to prevent skipping if state changed
            if (!this.active || !this.video || this.video.paused) {
                return;
            }

            // Ensure we are still close to the segment to avoid wrongful skips after seeking
            if (Math.abs(this.video.currentTime - segment.segment[0]) < 2) {
                const segmentName = BAR_TYPES[segment.category]?.name || segment.category;
                console.info(`SponsorBlock: Skipping ${segmentName}.`);
                window.showNotification(`Skipping ${segmentName}`);
                this.video.currentTime = segment.segment[1];
            }
        }

        clearTimeout(name) {
            if (this.timeouts[name]) {
                clearTimeout(this.timeouts[name]);
                this.timeouts[name] = null;
            }
        }

        clearInterval(name) {
            if (this.intervals[name]) {
                clearInterval(this.intervals[name]);
                this.intervals[name] = null;
            }
        }
        
        destroy() {
            console.info("SponsorBlock: Destroying instance.");
            this.active = false;
            
            this.removeVideoEventListeners();
            
            Object.keys(this.timeouts).forEach(name => this.clearTimeout(name));
            Object.keys(this.intervals).forEach(name => this.clearInterval(name));
            
            if(this.observers.progressBar) {
                this.observers.progressBar.disconnect();
                this.observers.progressBar = null;
            }

            this.previewBar.clear();

            this.video = null;
            this.progressBar = null;
        }
    }

    /**
     * Handles the creation and rendering of the sponsor segments bar.
     * Adapted from previewBar.ts logic.
     */
    class PreviewBar {
        constructor() {
            this.container = null;
        }

        render(progressBar, segments, duration) {
            if (!progressBar || !segments || !duration) return;

            this.clear(); // Clear previous segments before rendering new ones

            this.container = document.createElement('div');
            this.container.id = 'sponsorblock-preview-bar';
            Object.assign(this.container.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: '5', // Appear above the base progress bar but below the playhead
            });

            segments.forEach(segment => {
                const bar = this.createSegmentBar(segment, duration);
                this.container.appendChild(bar);
            });
            
            // Ensure the progress bar is a positioning context
            if (window.getComputedStyle(progressBar).position === 'static') {
                progressBar.style.position = 'relative';
            }

            progressBar.prepend(this.container);
        }

        createSegmentBar(segment, duration) {
            const bar = document.createElement('div');
            const barType = BAR_TYPES[segment.category] || BAR_TYPES.sponsor;

            const startTime = Math.max(0, segment.segment[0]);
            const endTime = Math.min(duration, segment.segment[1]);
            const segmentDuration = endTime - startTime;

            if (segmentDuration <= 0) return bar; // Return empty bar if no duration

            const left = (startTime / duration) * 100;
            const width = (segmentDuration / duration) * 100;

            Object.assign(bar.style, {
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                height: '100%',
                backgroundColor: barType.color,
                borderRadius: 'inherit'
            });

            bar.title = `${barType.name}: ${this.formatTime(startTime)} - ${this.formatTime(endTime)}`;

            return bar;
        }
        
        formatTime(seconds) {
            const date = new Date(0);
            date.setSeconds(seconds);
            return date.toISOString().substr(11, 8);
        }

        clear() {
            if (this.container && this.container.parentNode) {
                this.container.remove();
            }
            this.container = null;
        }
    }

    // --- Global Management ---
    
    function initializeSponsorBlock() {
        if (window.sponsorBlockInstance) {
            window.sponsorBlockInstance.destroy();
            window.sponsorBlockInstance = null;
        }

        // Use a more robust way to get video ID from the URL hash
        const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const videoID = urlParams.get('v');
        const isWatchPage = window.location.hash.startsWith('#/watch');

        if (isWatchPage && videoID) {
            if (window.configRead('enableSponsorBlock')) {
                console.info("SponsorBlock: Initializing for new video.");
                window.sponsorBlockInstance = new SponsorBlock(videoID);
            } else {
                console.info("SponsorBlock is disabled in settings.");
            }
        } else {
             console.info("SponsorBlock: Not a watch page, not initializing.");
        }
    }

    // --- Entry Point ---
    
    // Listen for hash changes to handle navigation in the SPA.
    window.addEventListener('hashchange', initializeSponsorBlock, false);

    // Initial run on script load.
    // Use a small timeout to ensure the page has had a moment to render.
    setTimeout(initializeSponsorBlock, 500);

})(window);
