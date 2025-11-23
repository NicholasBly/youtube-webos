import sha256_import from 'tiny-sha256';
import { configRead, segmentTypes } from './config';
import { showNotification } from './ui';
import { detectWebOSVersion, isNewYouTubeLayout } from './webos-utils.js';

let sha256 = sha256_import;

// Simplified fallback for sha256
if (typeof sha256 !== 'function') {
    console.error("SHA256 function is not available. SponsorBlock functionality will be disabled.");
    // Provide a no-op function to prevent crashes
    sha256 = () => {
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
		this.webOSVersion = detectWebOSVersion();
		this.isNewYouTubeLayout = isNewYouTubeLayout();
        
        // Pre-compiled selectors for better performance
		this.selectors = {
			video: 'video',
			progressBar: [
				'ytlr-progress-bar',  // Add tag name selector first
				'.ytlr-progress-bar',
				'.ytlr-multi-markers-player-bar-renderer',
				'.ytlr-progress-bar__slider',
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
		if (level === 'debug' && !this.debugMode) return;
		if (level === 'info' && !this.debugMode) return; // Skip info in production too
		console[level === 'warn' ? 'warn' : 'error'](`[SB:${this.videoID}]`, message, ...args);
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
		const id = setTimeout(callback, delay);
		this.timers.set(name, id);
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
		for (const id of this.timers.values()) {
			clearTimeout(id); // clearTimeout works on intervals too
		}
		this.timers.clear();
	}

    // Configuration management with caching
    readConfig(key) {
		if (this.configCache[key] !== undefined) {
			return this.configCache[key];
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

	addEventListener(element, event, handler, name) {
        const key = `${name || 'unnamed'}_${event}`;
        this.removeEventListener(element, event, key);
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
        const sortByStart = (a, b) => a.processedStart - b.processedStart;
		if (this.processedSegments.highlights.length) {
			this.processedSegments.highlights.sort(sortByStart);
		}
        
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
		
		const highlight = highlights[0];
		this.video.currentTime = highlight.processedStart;
		showNotification(`Jumped to highlight at ${Math.floor(highlight.processedStart)}s`);
		return true;
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
        let visibilityChanged = false;
        
        for (let i = 0; i < mutations.length; i++) {
            const mutation = mutations[i];
            
            // Watch for removed nodes (existing logic)
            if (mutation.type === 'childList' && mutation.removedNodes.length) {
                if (mutation.removedNodes[0] === this.sliderSegmentsOverlay || 
                    this.progressBarElement.contains(this.sliderSegmentsOverlay) === false) {
                    needsReattach = true;
                    break;
                }
            }
            
            // Watch for class changes on progress bar (NEW)
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                // Check if this is the progress bar element or its parent
                if (target === this.progressBarElement || target.classList.contains('ytLrProgressBarReduxConnector')) {
                    visibilityChanged = true;
                }
            }
        }
        
        if (visibilityChanged && this.sliderSegmentsOverlay) {
            // Toggle segment visibility based on progress bar visibility
            const isHidden = this.progressBarElement.classList.contains('ytLrProgressBarHidden');
            this.sliderSegmentsOverlay.style.display = isHidden ? 'none' : 'block';
            this.log('info', `Progress bar visibility changed. Segments ${isHidden ? 'hidden' : 'shown'}`);
        }

        if (needsReattach && this.sliderSegmentsOverlay && !this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
            this.log('info', "Segments removed by DOM mutation. Re-attaching immediately...");
            this.attachOverlayToProgressBar();
        }
    });

    this.mutationObserver.observe(this.progressBarElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    
    // Also observe the parent redux connector if it exists
    const reduxConnector = this.progressBarElement.closest('ytlr-redux-connect-ytlr-progress-bar');
    if (reduxConnector && reduxConnector !== this.progressBarElement) {
        const parentObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const isHidden = this.progressBarElement.classList.contains('ytLrProgressBarHidden');
                    if (this.sliderSegmentsOverlay) {
                        this.sliderSegmentsOverlay.style.display = isHidden ? 'none' : 'block';
                    }
                }
            }
        });
        
        parentObserver.observe(reduxConnector, {
            attributes: true,
            attributeFilter: ['class'],
            subtree: true
        });
        
        this.observers.add(parentObserver);
    }
    
    this.observers.add(this.mutationObserver);
}

injectCSS() {
    if (document.getElementById('sponsorblock-styles')) return;

    /* const webOSVersion = this.webOSVersion; */
    
    const style = document.createElement('style');
    style.id = 'sponsorblock-styles';

    let css = `
        #previewbar {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important; /* Fill the correct container completely */
            pointer-events: none !important;
            z-index: 100 !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
        }
        
        .previewbar {
            position: absolute !important;
            list-style: none !important;
            height: 100% !important;
            top: 0 !important;
            bottom: 0 !important;
            transform: none !important;
            display: block !important;
            z-index: 101 !important;
        }

        .previewbar.highlight {
            min-width: 5.47px !important;
            max-width: 5.47px !important;
            height: 100% !important;
            top: 0 !important;
        }

        ytlr-progress-bar > #previewbar,
        .ytlr-progress-bar > #previewbar {
            height: 13px !important;
            top: 67% !important;		/* Fixed alignment */
            bottom: auto !important;
            margin: auto !important;
            transform: none !important;
        }

        .ytLrProgressBarHidden #previewbar {
            display: none !important;
        }

        ytlr-multi-markers-player-bar-renderer,
        .ytLrProgressBarSliderBase,
        ytlr-progress-bar {
            overflow: visible !important;
        }
    `;

    style.textContent = css;
    document.head.appendChild(style);
    this.stylesInjected = true;

    this.log('info', `CSS injected`);
}

	attachOverlayToProgressBar() {
    if (!this.progressBarElement || !this.sliderSegmentsOverlay) return;

    // 1. Try Primary Target: Multi-markers renderer (used for Chapters/Heatmaps)
    let targetContainer = this.progressBarElement.querySelector('ytlr-multi-markers-player-bar-renderer');
    
    // 2. Fallback Target: Slider Base (standard videos without chapters)
    if (!targetContainer) {
        // Try specific internal containers often found in the new layout
        targetContainer = this.progressBarElement.querySelector('ytlr-progress-bar') || 
                          this.progressBarElement.querySelector('.ytlr-progress-bar');
                          
        // 3. Last Resort: The progress bar itself
        if (!targetContainer) {
            targetContainer = this.progressBarElement;
        }
    }

    // Sanity check: If we still somehow have a null target (very unlikely), retry briefly
    if (!targetContainer) {
        this.log('info', 'No valid container found for overlay, waiting...');
        this.setTimeout(() => this.attachOverlayToProgressBar(), 150, 'attach_retry');
        return;
    }

    // Check if already attached to this specific container
    if (targetContainer.contains(this.sliderSegmentsOverlay)) return;
    
    // Wait for the container to have actual dimensions (prevents attaching to hidden/init states)
    const rect = targetContainer.getBoundingClientRect();
    if (rect.height === 0 || rect.width === 0) {
        // Only wait if the MAIN progress bar also has no dimensions (meaning the whole UI is hidden)
        // If the main bar has size but our target doesn't, we might have picked a bad target, so we proceed anyway to avoid hanging.
        const parentRect = this.progressBarElement.getBoundingClientRect();
        if (parentRect.width === 0) {
            // this.log('info', 'Container not yet rendered (zero dimensions), waiting...');
            this.setTimeout(() => this.attachOverlayToProgressBar(), 150, 'attach_retry');
            return;
        }
    }
    
    // Ensure proper positioning context
    const computedStyle = window.getComputedStyle(targetContainer);
    if (computedStyle.position === 'static') {
        targetContainer.style.position = 'relative';
    }
    
    // Ensure no overflow clipping
    targetContainer.style.overflow = 'visible';
    
    // Insert as first child
    targetContainer.insertBefore(this.sliderSegmentsOverlay, targetContainer.firstChild);
    
    const targetName = targetContainer.tagName ? targetContainer.tagName.toLowerCase() : targetContainer.className;
    this.log('info', `Attached segments overlay to: ${targetName}`);
    
    // Debug: log overlay position and visibility
    setTimeout(() => {
        if (this.sliderSegmentsOverlay) {
            const rect = this.sliderSegmentsOverlay.getBoundingClientRect();
            this.log('info', 'Overlay bounds:', rect);
        }
    }, 100);
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
            
            // Add immediate re-attachment on video events that might cause DOM changes
            this.addEventListener(this.video, 'loadstart', () => {
                this.setTimeout(() => {
                    if (this.progressBarElement && this.sliderSegmentsOverlay && 
                        !this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
                        this.log('info', "Re-attaching after loadstart event");
                        this.attachOverlayToProgressBar();
                    }
                }, 50, 'loadstart_reattach');
            }, 'video_loadstart');
            
            this.addEventListener(this.video, 'canplay', () => {
                this.setTimeout(() => {
                    if (this.progressBarElement && this.sliderSegmentsOverlay && 
                        !this.progressBarElement.contains(this.sliderSegmentsOverlay)) {
                        this.log('info', "Re-attaching after canplay event");
                        this.attachOverlayToProgressBar();
                    }
                }, 50, 'canplay_reattach');
            }, 'video_canplay');
            
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
    }, 250, 'progressBarWatch'); // Reduced from 500ms to 100ms
};

        watchForProgressBar();
		if (this.sliderSegmentsOverlay) {
			void this.sliderSegmentsOverlay.offsetHeight;
			
			// Log for debugging
			this.log('info', 'Segments rendered:', this.sliderSegmentsOverlay.children.length);
			Array.from(this.sliderSegmentsOverlay.children).forEach((child, i) => {
				const style = window.getComputedStyle(child);
				this.log('info', `Segment ${i}:`, {
					left: child.style.left,
					width: child.style.width,
					backgroundColor: child.style.backgroundColor,
					display: style.display,
					visibility: style.visibility,
					zIndex: style.zIndex
				});
			});
		}
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
        const currentTime = this.video.currentTime - 0.3;
		let nextSegment = null;
		for (let i = 0; i < processed.skippable.length; i++) {
			const seg = processed.skippable[i];
			if (seg.processedStart > currentTime && seg.processedEnd > currentTime) {
				nextSegment = seg;
				break;
			}
		}
		
		if (!nextSegment) return;
		const segment = nextSegment;

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