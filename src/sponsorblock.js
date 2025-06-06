import sha256 from 'tiny-sha256';
import { configRead } from './config';
import { showNotification } from './ui';

// Category definitions with colors and names
// Based on: https://github.com/ajayyy/SponsorBlock/blob/master/src/config.ts
const barTypes = {
    sponsor: { color: '#00d400', name: 'Sponsor' },
    intro: { color: '#00ffff', name: 'Intro' },
    outro: { color: '#0202ed', name: 'Outro' },
    interaction: { color: '#cc00ff', name: 'Interaction Reminder' },
    selfpromo: { color: '#ffff00', name: 'Self Promotion' },
    music_offtopic: { color: '#ff9900', name: 'Music/Off-topic' },
    preview: { color: '#008fd6', name: 'Preview/Recap' },
    poi_highlight: { color: '#ff1684', name: 'Point of Interest' },
    filler: { color: '#7300ff', name: 'Filler Tangent' },
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
    videoID = null;
    video = null;
    active = true;

    // Timeouts and Intervals
    attachVideoTimeout = null;
    nextSkipTimeout = null;
    findSeekBarInterval = null;

    // DOM Elements
    seekBar = null;
    segmentsOverlay = null;

    // Event Handlers
    scheduleSkipHandler = null;
    durationChangeHandler = null;

    // Data
    segments = null;
    skippableCategories = [];

    constructor(videoID) {
        this.videoID = videoID;
    }

    async init() {
        console.info(`SponsorBlock: Initializing for video ID: ${this.videoID}`);
        // Injects the category colors as CSS variables into the document head for cleaner styling.
        this.injectCategoryStyles();

        const videoHash = sha256(this.videoID).substring(0, 4);
        const categories = Object.keys(barTypes);

        try {
            const resp = await fetch(
                `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(JSON.stringify(categories))}`
            );
            // On some platforms, fetch might not throw on network error, so check status.
            if (!resp.ok) {
                console.error(`SponsorBlock: API request failed with status: ${resp.status}`);
                return;
            }
            const results = await resp.json();
            const result = results.find((v) => v.videoID === this.videoID);

            if (!result || !result.segments || !result.segments.length) {
                console.info(`SponsorBlock: No segments found for ${this.videoID}.`);
                return;
            }

            console.info(`SponsorBlock: Found ${result.segments.length} segments.`);
            this.segments = result.segments;
            this.skippableCategories = this.getSkippableCategories();

            // Bind event handlers to the class instance
            this.scheduleSkipHandler = () => this.scheduleSkip();
            this.durationChangeHandler = () => this.buildSegmentsUI();

            this.attachToVideo();

        } catch (error) {
            console.error('SponsorBlock: Failed to fetch segments.', error);
        }
    }

    getSkippableCategories() {
        const skippable = [];
        if (configRead('enableSponsorBlockSponsor')) skippable.push('sponsor');
        if (configRead('enableSponsorBlockIntro')) skippable.push('intro');
        if (configRead('enableSponsorBlockOutro')) skippable.push('outro');
        if (configRead('enableSponsorBlockInteraction')) skippable.push('interaction');
        if (configRead('enableSponsorBlockSelfPromo')) skippable.push('selfpromo');
        if (configRead('enableSponsorBlockMusicOfftopic')) skippable.push('music_offtopic');
        if (configRead('enableSponsorBlockPreview')) skippable.push('preview');
        return skippable;
    }

    /**
     * Injects a <style> tag into the <head> with CSS variables for each category color.
     * This is a modern approach adapted from previewBar.ts.
     */
    injectCategoryStyles() {
        if (document.getElementById('sponsorblock-category-styles')) return;

        const style = document.createElement('style');
        style.id = 'sponsorblock-category-styles';
        let css = ':root {';
        for (const category in barTypes) {
            css += `--sb-category-${category}: ${barTypes[category].color};`;
        }
        css += '}';
        style.textContent = css;
        document.head.appendChild(style);
    }

    attachToVideo() {
        clearTimeout(this.attachVideoTimeout);
        this.video = document.querySelector('video');

        if (!this.video) {
            this.attachVideoTimeout = setTimeout(() => this.attachToVideo(), 250);
            return;
        }

        console.info('SponsorBlock: Video element found, attaching listeners.');

        this.video.addEventListener('play', this.scheduleSkipHandler);
        this.video.addEventListener('pause', this.scheduleSkipHandler);
        this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
        this.video.addEventListener('durationchange', this.durationChangeHandler);
        
        // Initial UI build
        this.buildSegmentsUI();
    }

    /**
     * Main function to create and display the segment bars on the progress bar.
     * This is the replacement for the old `buildOverlay`.
     */
    buildSegmentsUI() {
        if (!this.video || !this.video.duration || isNaN(this.video.duration)) {
             // If duration is not ready, retry after a short delay.
            setTimeout(() => this.buildSegmentsUI(), 100);
            return;
        }
        
        // Clear previous interval if it exists
        if (this.findSeekBarInterval) {
            clearInterval(this.findSeekBarInterval);
            this.findSeekBarInterval = null;
        }
        
        // Use an interval to robustly find the seek bar, as it might not be in the DOM immediately.
        this.findSeekBarInterval = setInterval(() => {
            // This selector is recommended for modern YouTube UIs.
            const seekBarContainer = document.querySelector(".ytp-progress-bar-container");

            if (seekBarContainer) {
                clearInterval(this.findSeekBarInterval);
                this.findSeekBarInterval = null;
                this.seekBar = seekBarContainer;

                // Remove old overlay if it exists
                this.segmentsOverlay?.remove();

                // Create the container for segment bars (inspired by previewBar.ts)
                this.segmentsOverlay = document.createElement('ul');
                this.segmentsOverlay.id = 'sponsorblock-preview-bar';
                Object.assign(this.segmentsOverlay.style, {
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none', // Allows clicks to pass through to the progress bar
                    margin: '0',
                    padding: '0',
                });

                // Create and add each segment bar
                this.segments.forEach(segment => {
                    const barElement = this.createBar(segment);
                    if (barElement) {
                        this.segmentsOverlay.appendChild(barElement);
                    }
                });
                
                // Add the overlay to the seek bar
                this.seekBar.prepend(this.segmentsOverlay);
                console.info('SponsorBlock: Segments UI built successfully.');
            }
        }, 500); // Check for the seek bar every 500ms.
    }

    /**
     * Creates a single segment bar element.
     * This function is a direct port of the logic from `previewBar.ts`.
     * @param {object} barSegment - The segment object from the API.
     * @returns {HTMLLIElement | null} The created list item element for the bar.
     */
    createBar(barSegment) {
        if (!barTypes[barSegment.category]) return null;

        const { category, segment } = barSegment;

        const bar = document.createElement('li');
        bar.setAttribute('sponsorblock-category', category);

        // Style the bar
        Object.assign(bar.style, {
            backgroundColor: `var(--sb-category-${category})`,
            opacity: '0.7',
            position: 'absolute',
            height: '100%',
            // Use left/right positioning for robustness, as in previewBar.ts
            left: this.timeToPercentage(segment[0]),
            right: this.timeToRightPercentage(segment[1]),
        });
        
        return bar;
    }
    
    // --- Helper functions ported from previewBar.ts ---
    
    timeToDecimal(time) {
        if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration === 0) return 0;
        return Math.min(1, time / this.video.duration);
    }

    timeToPercentage(time) {
        return `${this.timeToDecimal(time) * 100}%`;
    }

    timeToRightPercentage(time) {
        return `${(1 - this.timeToDecimal(time)) * 100}%`;
    }
    
    // --- End Helper functions ---


    scheduleSkip() {
        clearTimeout(this.nextSkipTimeout);
        this.nextSkipTimeout = null;

        if (!this.active || this.video.paused) {
            return;
        }

        // Find the next segment to potentially skip
        const currentTime = this.video.currentTime;
        const nextSegment = this.segments
            .filter(seg => seg.segment[1] > currentTime) // Only consider segments that end after the current time
            .sort((a, b) => a.segment[0] - b.segment[0]) // Sort by start time to find the very next one
            .find(seg => seg.segment[0] > currentTime - 0.3); // Find segment that starts near current time

        if (!nextSegment) {
            return;
        }

        const [start, end] = nextSegment.segment;
        
        // Schedule the skip
        this.nextSkipTimeout = setTimeout(() => {
            // Re-check conditions right before skipping
            if (this.video.paused || !this.skippableCategories.includes(nextSegment.category)) {
                return;
            }

            const skipName = barTypes[nextSegment.category]?.name || nextSegment.category;
            console.info(`SponsorBlock: Skipping ${skipName}`);
            showNotification(`Skipping ${skipName}`);
            this.video.currentTime = end;
            this.scheduleSkip(); // Immediately schedule the next potential skip
        }, (start - currentTime) * 1000);
    }

    destroy() {
        console.info(`SponsorBlock: Destroying instance for ${this.videoID}`);
        this.active = false;

        // Clear all timers
        clearTimeout(this.nextSkipTimeout);
        clearTimeout(this.attachVideoTimeout);
        clearInterval(this.findSeekBarInterval);

        // Remove UI elements
        this.segmentsOverlay?.remove();
        
        // Remove style tag if no other instances are active
        if (!window.sponsorblock) {
            document.getElementById('sponsorblock-category-styles')?.remove();
        }

        // Remove event listeners
        if (this.video) {
            this.video.removeEventListener('play', this.scheduleSkipHandler);
            this.video.removeEventListener('pause', this.scheduleSkipHandler);
            this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
            this.video.removeEventListener('durationchange', this.durationChangeHandler);
        }

        // Clear references
        this.video = null;
        this.seekBar = null;
        this.segmentsOverlay = null;
    }
}

// Global instance management
window.sponsorblock = null;

function uninitializeSponsorblock() {
    if (window.sponsorblock) {
        try {
            window.sponsorblock.destroy();
        } catch (err) {
            console.warn('SponsorBlock: destroy() failed!', err);
        }
        window.sponsorblock = null;
    }
}

// Listen for URL changes to initialize/de-initialize the handler.
window.addEventListener('hashchange', () => {
    const newURL = new URL(location.hash.substring(1), location.href);
    
    // Only run on watch pages
    if (newURL.pathname !== '/watch') {
        uninitializeSponsorblock();
        return;
    }

    const videoID = newURL.searchParams.get('v');
    const needsReload = videoID && (!window.sponsorblock || window.sponsorblock.videoID !== videoID);

    if (needsReload) {
        uninitializeSponsorblock();

        if (configRead('enableSponsorBlock')) {
            window.sponsorblock = new SponsorBlockHandler(videoID);
            window.sponsorblock.init();
        } else {
            console.info('SponsorBlock is disabled in settings.');
        }
    }
}, false);
