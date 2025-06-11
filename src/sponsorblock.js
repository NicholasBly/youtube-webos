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
 * adapted for the WebOS environment. It includes robust observation to prevent
 * segments from disappearing during UI redraws and a custom notification system.
 */

// Assuming tiny-sha256 is loaded globally in the WebOS environment.
// If not, it needs to be included directly in the app's vendor scripts.
// Example: <script src="path/to/tiny-sha256.js"></script>

(function(window) {
    'use strict';

    // --- Helper Functions & Constants ---

    // These functions should be provided by the WebOS environment.
    // They are defined here as fallbacks to prevent errors if not present.
    if (typeof window.configRead === 'undefined') {
        console.warn("SponsorBlock: configRead function is not defined. Using dummy implementation.");
        window.configRead = function(key) {
            return !key.startsWith('enable') || true; // Default to true
        };
    }

    if (typeof window.showNotification === 'undefined') {
        console.warn("SponsorBlock: showNotification function is not defined. Using internal fallback.");
        // A built-in notification system will be used.
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
     * Handles displaying on-screen notifications.
     */
    class NotificationManager {
        constructor() {
            this.notificationElement = null;
        }

        show(message) {
            // Use the app's native notification system if it exists
            if (typeof window.showNotification === 'function') {
                window.showNotification(message);
                return;
            }

            // Fallback to a custom HTML notification
            if (this.notificationElement) {
                this.notificationElement.remove();
            }

            this.notificationElement = document.createElement('div');
            this.notificationElement.textContent = message;
            Object.assign(this.notificationElement.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                zIndex: '9999',
                fontSize: '16px',
                opacity: '0',
                transition: 'opacity 0.5s',
            });
            
            document.body.appendChild(this.notificationElement);

            // Fade in
            setTimeout(() => {
                this.notificationElement.style.opacity = '1';
            }, 10);

            // Fade out and remove
            setTimeout(() => {
                if (this.notificationElement) {
                   this.notificationElement.style.opacity = '0';
                   setTimeout(() => {
                        if (this.notificationElement) this.notificationElement.remove();
                        this.notificationElement = null;
                   }, 500);
                }
            }, 2500);
        }
    }

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
                scheduleSkip: null,
            };
            this.intervals = {
                waitForElements: null,
            };
            this.observers = {
                ui: null,
            };

            this.previewBar = new PreviewBar();
            this.notificationManager = new NotificationManager();

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
                    this.waitForPlayerElements();
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

        waitForPlayerElements() {
            this.clearInterval('waitForElements');

            this.intervals.waitForElements = setInterval(() => {
                if (!this.video) {
                    this.video = document.querySelector('video.video-stream.html5-main-video');
                    if (this.video) {
                        console.info("SponsorBlock: Video element found.");
                        this.addVideoEventListeners();
                    }
                }
                
                if (this.video && !this.progressBar) {
                    const selectors = ['.ytlr-progress-bar', '.ytLrProgressBarSlider'];
                     for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element && element.offsetWidth > 100) {
                            console.info(`SponsorBlock: Progress bar found with selector: "${selector}"`);
                            this.progressBar = element;
                            break;
                        }
                    }
                }
                
                if (this.video && this.progressBar) {
                    this.clearInterval('waitForElements');
                    this.renderSegments();
                    this.observeUI();
                }
            }, 500);
        }

        addVideoEventListeners() {
            this.scheduleSkip = this.scheduleSkip.bind(this);
            this.renderSegments = this.renderSegments.bind(this);

            this.video.addEventListener('play', this.scheduleSkip);
            this.video.addEventListener('pause', this.scheduleSkip);
            this.video.addEventListener('seeking', this.scheduleSkip);
            this.video.addEventListener('timeupdate', this.scheduleSkip);
            this.video.addEventListener('loadedmetadata', this.renderSegments);
        }

        removeVideoEventListeners() {
            if (this.video) {
                this.video.removeEventListener('play', this.scheduleSkip);
                this.video.removeEventListener('pause', this.scheduleSkip);
                this.video.removeEventListener('seeking', this.scheduleSkip);
                this.video.removeEventListener('timeupdate', this.scheduleSkip);
                this.video.removeEventListener('loadedmetadata', this.renderSegments);
            }
        }
        
        renderSegments() {
            if (this.progressBar && this.video && this.video.duration > 0) {
                 this.previewBar.render(this.progressBar, this.segments, this.video.duration);
            }
        }

        observeUI() {
            if (this.observers.ui || !this.progressBar || !this.progressBar.parentNode) return;

            this.observers.ui = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                     if (mutation.type === 'childList') {
                        let segmentsRemoved = false;
                        let chaptersAdded = false;

                        mutation.removedNodes.forEach(node => {
                            if (node.id === 'sponsorblock-preview-bar') {
                                segmentsRemoved = true;
                            }
                        });

                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE && node.matches('.ytp-chapters-container, .ytLrMultiMarkersPlayerBarRendererHost')) {
                                chaptersAdded = true;
                            }
                        });

                        // If YouTube adds its chapters or removes our segments, we re-render ours on top.
                        if (segmentsRemoved || chaptersAdded) {
                            console.info("SponsorBlock: Player UI updated. Re-rendering segments to ensure visibility.");
                            this.renderSegments();
                            // We don't need to break, let it check all mutations
                        }
                    }
                }
            });

            // Observe the progress bar and its parent to catch UI changes
            this.observers.ui.observe(this.progressBar.parentNode, { childList: true, subtree: true });
        }


        scheduleSkip() {
            this.clearTimeout('scheduleSkip');

            if (!this.active || !this.video || this.video.paused || !this.segments.length) {
                return;
            }

            const currentTime = this.video.currentTime;
            let upcomingSegment = null;

            for (const segment of this.segments) {
                if (currentTime >= segment.segment[0] && currentTime < segment.segment[1]) {
                    if (this.skippableCategories.includes(segment.category)) {
                        this.performSkip(segment);
                        return;
                    }
                }
                else if (segment.segment[0] > currentTime && this.skippableCategories.includes(segment.category)) {
                    if (!upcomingSegment || segment.segment[0] < upcomingSegment.segment[0]) {
                        upcomingSegment = segment;
                    }
                }
            }

            if (upcomingSegment) {
                const timeUntilSkip = (upcomingSegment.segment[0] - currentTime) * 1000;
                this.timeouts.scheduleSkip = setTimeout(() => this.performSkip(upcomingSegment), Math.max(0, timeUntilSkip));
            }
        }

        performSkip(segment) {
            if (!this.active || !this.video || this.video.paused) {
                return;
            }
            
            // Check if we are still within a reasonable timeframe of the segment start
            if (this.video.currentTime >= segment.segment[0] - 0.5 && this.video.currentTime < segment.segment[1]) {
                const segmentName = BAR_TYPES[segment.category]?.name || segment.category;
                this.notificationManager.show(`Skipping ${segmentName}`);
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
        
        destroyObserver() {
            if(this.observers.ui) {
                this.observers.ui.disconnect();
                this.observers.ui = null;
            }
        }
        
        destroy() {
            console.info("SponsorBlock: Destroying instance.");
            this.active = false;
            
            this.removeVideoEventListeners();
            this.destroyObserver();
            
            Object.keys(this.timeouts).forEach(name => this.clearTimeout(name));
            Object.keys(this.intervals).forEach(name => this.clearInterval(name));
            
            this.previewBar.clear();

            this.video = null;
            this.progressBar = null;
        }
    }

    /**
     * Handles the creation and rendering of the sponsor segments bar.
     */
    class PreviewBar {
        constructor() {
            this.container = null;
        }

        render(progressBar, segments, duration) {
            if (!progressBar || !segments || !duration || !document.body.contains(progressBar)) return;

            this.clear();

            this.container = document.createElement('div');
            this.container.id = 'sponsorblock-preview-bar';
            Object.assign(this.container.style, {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: '5',
            });

            segments.forEach(segment => {
                const bar = this.createSegmentBar(segment, duration);
                this.container.appendChild(bar);
            });
            
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

            if (segmentDuration <= 0) return document.createDocumentFragment();

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
            const existingBar = document.getElementById('sponsorblock-preview-bar');
            if (existingBar) {
                existingBar.remove();
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
    
    window.addEventListener('hashchange', initializeSponsorBlock, false);
    setTimeout(initializeSponsorBlock, 500);

})(window);
