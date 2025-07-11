import sha256 from 'tiny-sha256';
import { configRead, segmentTypes } from './config';
import { showNotification } from './ui';

// Simplified fallback for sha256
if (typeof sha256 !== 'function') {
    console.error("SHA256 function is not available. SponsorBlock functionality will be disabled.");
    // Provide a no-op function to prevent crashes
    window.sha256 = () => {
        console.warn("SHA256 not available - segments cannot be fetched");
        return null;
    };
}

// API Configuration
const SPONSORBLOCK_CONFIG = {
    primaryAPI: 'https://sponsorblock.inf.re/api',
    fallbackAPI: 'https://sponsor.ajay.app/api',
    timeout: 10000,
    retryAttempts: 2
};

class SponsorBlockHandler {
    constructor(videoID) {
        this.videoID = videoID;
        this.active = true;
        this.debugMode = false; // Can be set based on config
        
        // Centralized management
        this.timers = new Map();
        this.observers = new Set();
        this.eventListeners = new Map();
        
        // Caching
        this.configCache = new Map();
        this.cacheExpiry = Date.now() + 30000; // 30 second cache
        this.cachedElements = new Map();
        this.processedSegments = null;
        this.segmentCategories = null;
        
        // Legacy properties for compatibility
        this.video = null;
        this.progressBarElement = null;
        this.sliderSegmentsOverlay = null;
        this.mutationObserver = null;
        this.segments = null;
        this.skippableCategories = [];
        this.scheduleSkipHandler = null;
        this.durationChangeHandler = null;
        this.stylesInjected = false;
        
        // Pre-compiled selectors for better performance
        this.selectors = {
            video: 'video',
            progressBar: [
                '.ytlr-progress-bar__slider',
                '.ytlr-multi-markers-player-bar-renderer',
                '.ytlr-progress-bar',
                '.ytLrProgressBarSlider',
                '.ytLrProgressBarSliderBase',
                '.ytp-progress-bar',
                '.ytp-progress-bar-container'
            ]
        };
        
        this.log('info', `SponsorBlockHandler created for videoID: ${videoID}`);
    }

    // Logging system
    log(level, message, ...args) {
        const prefix = `[SponsorBlock:${this.videoID}]`;
        
        if (level === 'debug' && !this.debugMode) {
            return;
        }
        
        switch (level) {
            case 'error':
                console.error(prefix, message, ...args);
                break;
            case 'warn':
                console.warn(prefix, message, ...args);
                break;
            case 'info':
                console.info(prefix, message, ...args);
                break;
            case 'debug':
                console.log(prefix, '[DEBUG]', message, ...args);
                break;
            default:
                console.log(prefix, message, ...args);
        }
    }

    // Standardized error handling
    handleError(error, context, fallback = null) {
        this.log('error', `Error in ${context}:`, error);
        
        if (typeof fallback === 'function') {
            try {
                return fallback();
            } catch (fallbackError) {
                this.log('error', `Fallback failed for ${context}:`, fallbackError);
            }
        }
        
        return null;
    }

    // Centralized timer management
    setTimeout(callback, delay, name) {
        this.clearTimeout(name);
        const id = setTimeout(() => {
            this.timers.delete(name);
            callback();
        }, delay);
        this.timers.set(name, id);
        return id;
    }
    
    clearTimeout(name) {
        if (this.timers.has(name)) {
            clearTimeout(this.timers.get(name));
            this.timers.delete(name);
        }
    }
    
    setInterval(callback, delay, name) {
        this.clearInterval(name);
        const id = setInterval(callback, delay);
        this.timers.set(name, id);
        return id;
    }
    
    clearInterval(name) {
        if (this.timers.has(name)) {
            clearInterval(this.timers.get(name));
            this.timers.delete(name);
        }
    }
    
    clearAllTimers() {
        for (const [name, id] of this.timers) {
            if (name.includes('interval')) {
                clearInterval(id);
            } else {
                clearTimeout(id);
            }
        }
        this.timers.clear();
    }

    // Configuration management with caching
    readConfig(key) {
        const now = Date.now();
        if (now > this.cacheExpiry) {
            this.configCache.clear();
            this.cacheExpiry = now + 30000;
        }
        
        if (this.configCache.has(key)) {
            return this.configCache.get(key);
        }
        
        try {
            const value = configRead(key);
            this.configCache.set(key, value);
            return value;
        } catch (e) {
            this.log('warn', `Could not read config key '${key}':`, e);
            const defaultValue = this.getDefaultConfig(key);
            this.configCache.set(key, defaultValue);
            return defaultValue;
        }
    }
    
    getDefaultConfig(key) {
        const defaults = {
            enableSponsorBlock: true,
            enableSponsorBlockSponsor: true,
            enableSponsorBlockIntro: true,
            enableSponsorBlockOutro: true,
            enableSponsorBlockInteraction: true,
            enableSponsorBlockSelfPromo: true,
            enableSponsorBlockMusicOfftopic: true,
            enableSponsorBlockPreview: true,
            enableSponsorBlockHighlight: true
        };
        return defaults[key] || false;
    }

    // Invalidate cached segments when config changes
    invalidateSegmentCache() {
        this.processedSegments = null;
        this.segmentCategories = null;
    }

    // Cached DOM element retrieval
    getElement(type, maxAge = 1000) {
        const now = Date.now();
        const cached = this.cachedElements.get(type);
        
        if (cached && (now - cached.timestamp) < maxAge && document.contains(cached.element)) {
            return cached.element;
        }
        
        let element = null;
        if (type === 'video') {
            element = document.querySelector(this.selectors.video);
        } else if (type === 'progressBar') {
            for (const selector of this.selectors.progressBar) {
                element = document.querySelector(selector);
                if (element && window.getComputedStyle(element).display !== 'none' && element.offsetWidth > 50) {
                    break;
                }
                element = null;
            }
        }
        
        if (element) {
            this.cachedElements.set(type, { element, timestamp: now });
        }
        
        return element;
    }

    // Event listener management
    addEventListener(element, event, handler, name) {
        const key = `${name || 'unnamed'}_${event}`;
        
        // Remove existing listener if present
        this.removeEventListener(element, event, key);
        
        // Add new listener
        element.addEventListener(event, handler);
        this.eventListeners.set(key, { element, event, handler });
    }
    
    removeEventListener(element, event, key) {
        if (this.eventListeners.has(key)) {
            const { element: el, event: ev, handler } = this.eventListeners.get(key);
            el.removeEventListener(ev, handler);
            this.eventListeners.delete(key);
        }
    }
    
    removeAllEventListeners() {
        for (const [key, { element, event, handler }] of this.eventListeners) {
            element.removeEventListener(event, handler);
        }
        this.eventListeners.clear();
    }

    // API fetch with fallback and timeout
    async fetchSegments(videoHash, categories) {
        const urls = [SPONSORBLOCK_CONFIG.primaryAPI, SPONSORBLOCK_CONFIG.fallbackAPI];
        
        for (let i = 0; i < urls.length; i++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), SPONSORBLOCK_CONFIG.timeout);
                
                const resp = await fetch(
                    `${urls[i]}/skipSegments/${videoHash}?categories=${encodeURIComponent(
                        JSON.stringify(categories)
                    )}&videoID=${this.videoID}`,
                    { signal: controller.signal }
                );
                
                clearTimeout(timeoutId);
                
                if (!resp.ok) {
                    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
                }
                
                return await resp.json();
            } catch (error) {
                this.log('warn', `API attempt ${i + 1} failed:`, error.message);
                if (i === urls.length - 1) {
                    throw error;
                }
            }
        }
    }

    async init() {
        if (typeof sha256 !== 'function') {
            this.log('error', "SHA256 function is not available. Cannot fetch segments by hash.");
            return;
        }
        
        const videoHash = sha256(String(this.videoID));
        if (!videoHash) {
            this.log('error', "Failed to generate video hash.");
            return;
        }
        
        const hashPrefix = videoHash.substring(0, 4);
        const categories = [
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'music_offtopic', 'preview', 'chapter', 'poi_highlight'
        ];
        
        try {
            const results = await this.fetchSegments(hashPrefix, categories);
            const result = Array.isArray(results) ? results.find((v) => v.videoID === this.videoID) : results;

            if (!result || !result.segments || !result.segments.length) {
                this.log('info', 'No segments found for this video.');
                return;
            }

            this.segments = result.segments;
            this.skippableCategories = this.getSkippableCategories();

            this.scheduleSkipHandler = () => this.scheduleSkip();
            this.durationChangeHandler = () => this.buildOverlay();

            this.attachVideo();
        } catch (error) {
            this.handleError(error, 'init');
        }
    }

    getSkippableCategories() {
        const skippable = [];
        try {
            if (this.readConfig('enableSponsorBlockSponsor')) skippable.push('sponsor');
            if (this.readConfig('enableSponsorBlockIntro')) skippable.push('intro');
            if (this.readConfig('enableSponsorBlockOutro')) skippable.push('outro');
            if (this.readConfig('enableSponsorBlockInteraction')) skippable.push('interaction');
            if (this.readConfig('enableSponsorBlockSelfPromo')) skippable.push('selfpromo');
            if (this.readConfig('enableSponsorBlockMusicOfftopic')) skippable.push('music_offtopic');
            if (this.readConfig('enableSponsorBlockPreview')) skippable.push('preview');
        } catch (e) {
            this.log('warn', "Could not read SponsorBlock config, using defaults:", e);
            return ['sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 'music_offtopic', 'preview'];
        }
        return skippable;
    }

    // Process segments once and cache results
    processSegments() {
        if (!this.segments || this.processedSegments) {
            return this.processedSegments;
        }
        
        const videoDuration = this.video?.duration;
        if (!videoDuration || isNaN(videoDuration) || videoDuration <= 0) {
            return null;
        }
        
        this.processedSegments = {
            skippable: [],
            highlights: [],
            display: []
        };
        
        this.segmentCategories = this.getSkippableCategories();
        
        for (const segment of this.segments) {
            const [start, end] = segment.segment;
            const isHighlight = segment.category === 'poi_highlight';
            
            // Skip if category info is missing
            const categoryInfo = segmentTypes[segment.category];
            if (!categoryInfo) continue;
            
            // Validate segment bounds
            const segmentStart = Math.max(0, Math.min(start, videoDuration));
            const segmentEnd = Math.max(segmentStart, Math.min(end, videoDuration));
            
            if (!isHighlight && segmentEnd <= segmentStart) continue;
            
            const processedSegment = {
                ...segment,
                processedStart: segmentStart,
                processedEnd: segmentEnd,
                categoryInfo
            };
            
            // Categorize segments
            if (isHighlight && this.readConfig('enableSponsorBlockHighlight')) {
                this.processedSegments.highlights.push(processedSegment);
            } else if (!isHighlight && this.segmentCategories.includes(segment.category)) {
                this.processedSegments.skippable.push(processedSegment);
            }
            
            // Add to display list if should be shown
            if (this.shouldDisplaySegment(segment)) {
                this.processedSegments.display.push(processedSegment);
            }
        }
        
        // Sort segments by start time
        this.processedSegments.highlights.sort((a, b) => a.processedStart - b.processedStart);
        this.processedSegments.skippable.sort((a, b) => a.processedStart - b.processedStart);
        this.processedSegments.display.sort((a, b) => a.processedStart - b.processedStart);
        
        return this.processedSegments;
    }
    
    shouldDisplaySegment(segment) {
        const isHighlight = segment.category === 'poi_highlight';
        if (isHighlight) {
            return this.readConfig('enableSponsorBlockHighlight');
        }
        return true; // Show all non-highlight segments
    }
    
    getHighlightSegments() {
        const processed = this.processSegments();
        return processed ? processed.highlights : [];
    }
    
    jumpToNextHighlight() {
        if (!this.video) return false;
        
        const highlights = this.getHighlightSegments();
        if (highlights.length === 0) return false;
        
        const currentTime = this.video.currentTime;
        const nextHighlight = highlights.find(seg => seg.processedStart > currentTime + 1);
        
        if (nextHighlight) {
            this.video.currentTime = nextHighlight.processedStart;
            showNotification(`Jumped to highlight at ${Math.floor(nextHighlight.processedStart)}s`);
            return true;
        } else if (highlights.length > 0) {
            // Jump to first highlight if no next highlight found
            this.video.currentTime = highlights[0].processedStart;
            showNotification(`Jumped to first highlight at ${Math.floor(highlights[0].processedStart)}s`);
            return true;
        }
        
        return false;
    }

    attachVideo() {
        this.clearTimeout('attachVideo');
        this.video = this.getElement('video');
        
        if (!this.video) {
            this.setTimeout(() => this.attachVideo(), 250, 'attachVideo');
            return;
        }

        this.log('info', 'Video element found. Binding event listeners.');

        // Use managed event listeners
        this.addEventListener(this.video, 'loadedmetadata', this.durationChangeHandler, 'video_loadedmetadata');
        this.addEventListener(this.video, 'durationchange', this.durationChangeHandler, 'video_durationchange');
        this.addEventListener(this.video, 'play', this.scheduleSkipHandler, 'video_play');
        this.addEventListener(this.video, 'pause', this.scheduleSkipHandler, 'video_pause');
        this.addEventListener(this.video, 'seeking', this.scheduleSkipHandler, 'video_seeking');
        this.addEventListener(this.video, 'seeked', this.scheduleSkipHandler, 'video_seeked');
        this.addEventListener(this.video, 'timeupdate', this.scheduleSkipHandler, 'video_timeupdate');
        
        if (this.video.duration && this.segments) {
            this.buildOverlay();
        }
    }

    // Setup mutation observer with centralized management
    setupMutationObserver() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.observers.delete(this.mutationObserver);
        }

        if (!this.progressBarElement) return;

        this.mutationObserver = new MutationObserver((mutations) => {
            let needsReattach = false;
            
            mutations.forEach((mutation) => {
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
                this.log('info', "Segments removed by DOM mutation. Re-attaching...");
                this.attachOverlayToProgressBar();
            }
        });

        this.mutationObserver.observe(this.progressBarElement, {
            childList: true,
            subtree: true
        });
        
        this.observers.add(this.mutationObserver);
    }

    // Inject CSS once instead of inline styles
    injectCSS() {
        if (this.stylesInjected) return;
        
        const style = document.createElement('style');
        style.id = 'sponsorblock-styles';
        style.textContent = `
            #previewbar {
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
            }
            
            .previewbar {
                position: absolute !important;
                list-style: none !important;
                height: 100% !important;
                border-radius: inherit !important;
                display: block !important;
                visibility: visible !important;
                z-index: 11 !important;
            }
            
            .previewbar.highlight {
                height: 12px !important;
                min-width: 5.47px !important;
                max-width: 5.47px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
            }
        `;
        
        document.head.appendChild(style);
        this.stylesInjected = true;
    }

    attachOverlayToProgressBar() {
        if (!this.progressBarElement || !this.sliderSegmentsOverlay) return;

        if (window.getComputedStyle(this.progressBarElement).position === 'static') {
            this.progressBarElement.style.position = 'relative';
        }
        
        this.progressBarElement.appendChild(this.sliderSegmentsOverlay);
        this.log('info', 'Segments overlay (UL/LI structure) attached.');
    }

    buildOverlay() {
        if (!this.video || !this.video.duration || isNaN(this.video.duration) || this.video.duration <= 0) {
            return;
        }

        const processed = this.processSegments();
        if (!processed || !processed.display.length) {
            return;
        }

        const videoDuration = this.video.duration;
        this.log('info', `Building overlay for duration: ${videoDuration}s`);

        // Clean up existing overlay
        if (this.sliderSegmentsOverlay?.parentNode) {
            this.sliderSegmentsOverlay.remove();
        }
        this.clearInterval('persistence');
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.observers.delete(this.mutationObserver);
            this.mutationObserver = null;
        }

        // Inject CSS
        this.injectCSS();

        // Create overlay container
        this.sliderSegmentsOverlay = document.createElement('ul');
        this.sliderSegmentsOverlay.id = 'previewbar';
        this.sliderSegmentsOverlay.setAttribute('data-sponsorblock', 'segments');

        // Process and create segments
        for (const segment of processed.display) {
            const isHighlight = segment.category === 'poi_highlight';
            const categoryInfo = segment.categoryInfo;
            
            let segmentWidthPercent, segmentLeftPercent;
            
            if (isHighlight) {
                const highlightTime = segment.processedStart;
                segmentLeftPercent = (highlightTime / videoDuration) * 100;
                
                // Fixed width for highlights
                const progressBarWidth = this.progressBarElement ? this.progressBarElement.offsetWidth : 1000;
                const fixedWidthPx = 5.47;
                segmentWidthPercent = (fixedWidthPx / progressBarWidth) * 100;
            } else {
                segmentWidthPercent = ((segment.processedEnd - segment.processedStart) / videoDuration) * 100;
                segmentLeftPercent = (segment.processedStart / videoDuration) * 100;
            }

            const barType = {
                name: categoryInfo.name,
                opacity: categoryInfo.opacity,
                color: this.readConfig(`${segment.category}Color`) || categoryInfo.color
            };

            // Create segment element
            const elm = document.createElement('li');
            elm.className = `previewbar sponsorblock-category-${segment.category}${isHighlight ? ' highlight' : ''}`;
            elm.innerHTML = '&nbsp;';

            // Set dynamic styles only
            elm.style.cssText = `
                background-color: ${barType.color} !important;
                opacity: ${barType.opacity} !important;
                left: ${segmentLeftPercent}% !important;
                width: ${segmentWidthPercent}% !important;
            `;
            
            if (isHighlight) {
                elm.title = `${barType.name}: ${segment.processedStart.toFixed(1)}s`;
            } else {
                elm.title = `${barType.name}: ${segment.processedStart.toFixed(1)}s - ${segment.processedEnd.toFixed(1)}s`;
            }
            
            elm.setAttribute('data-sponsorblock-segment', segment.category);
            this.sliderSegmentsOverlay.appendChild(elm);
        }

        // Watch for progress bar and attach
        const watchForProgressBar = () => {
            this.clearInterval('progressBarWatch');
            
            this.setInterval(() => {
                const element = this.getElement('progressBar');
                if (element) {
                    this.progressBarElement = element;
                    this.log('info', 'Progress bar found');
                    this.clearInterval('progressBarWatch');
                    
                    this.attachOverlayToProgressBar();
                    this.setupMutationObserver();
                    
                    // Less frequent persistence checks
                    this.setInterval(() => {
                        if (!document.body.contains(this.progressBarElement)) {
                            this.log('info', "Progress bar lost. Re-finding...");
                            this.clearInterval('persistence');
                            this.progressBarElement = null;
                            if (this.mutationObserver) {
                                this.mutationObserver.disconnect();
                                this.observers.delete(this.mutationObserver);
                                this.mutationObserver = null;
                            }
                            watchForProgressBar();
                            return;
                        }

                        if (!this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
                            this.log('info', "Overlay detached. Re-attaching via persistence check.");
                            this.attachOverlayToProgressBar();
                        }
                    }, 1000, 'persistence');
                    
                    return;
                }
            }, 500, 'progressBarWatch');
        };

        watchForProgressBar();
    }

    scheduleSkip() {
        this.clearTimeout('nextSkip');

        if (!this.active) {
            this.log('info', 'No longer active, ignoring...');
            return;
        }

        if (this.video.paused) {
            this.log('info', 'Currently paused, ignoring...');
            return;
        }

        const processed = this.processSegments();
        if (!processed || !processed.skippable.length) {
            this.log('info', 'No skippable segments');
            return;
        }

        // Find next segments to skip
        const nextSegments = processed.skippable.filter(
            (seg) =>
                seg.processedStart > this.video.currentTime - 0.3 &&
                seg.processedEnd > this.video.currentTime - 0.3
        );

        if (!nextSegments.length) {
            this.log('info', 'No more segments');
            return;
        }

        const segment = nextSegments[0];
        this.log('info', 'Scheduling skip of', segment.category, 'in', segment.processedStart - this.video.currentTime);

        this.setTimeout(() => {
            if (this.video.paused) {
                this.log('info', 'Currently paused, ignoring...');
                return;
            }
            
            if (!this.skippableCategories.includes(segment.category)) {
                this.log('info', 'Segment', segment.category, 'is not skippable, ignoring...');
                return;
            }

            const skipName = segment.categoryInfo?.name || segment.category;
            this.log('info', 'Skipping', segment.category);
            showNotification(`Skipping ${skipName}`);
            this.video.currentTime = segment.processedEnd;
            this.scheduleSkip();
        }, (segment.processedStart - this.video.currentTime) * 1000, 'nextSkip');
    }

    cleanupObservers() {
        for (const observer of this.observers) {
            try {
                observer.disconnect();
            } catch (e) {
                this.log('warn', 'Failed to disconnect observer:', e);
            }
        }
        this.observers.clear();
    }
    
    cleanupDOM() {
        if (this.sliderSegmentsOverlay?.parentNode) {
            this.sliderSegmentsOverlay.remove();
        }
        this.sliderSegmentsOverlay = null;
        
        // Remove injected styles
        const style = document.getElementById('sponsorblock-styles');
        if (style) {
            style.remove();
        }
        this.stylesInjected = false;
    }

    destroy() {
        this.log('info', 'Destroying SponsorBlockHandler instance.');
        this.active = false;
        
        // Use centralized cleanup methods
        this.clearAllTimers();
        this.removeAllEventListeners();
        this.cleanupObservers();
        this.cleanupDOM();
        
        // Clear caches
        this.configCache?.clear();
        this.cachedElements?.clear();
        this.processedSegments = null;
        this.segmentCategories = null;
        
        // Clear references
        this.video = null;
        this.progressBarElement = null;
        this.scheduleSkipHandler = null;
        this.durationChangeHandler = null;
        this.segments = null;
        this.skippableCategories = null;
        this.mutationObserver = null;
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
