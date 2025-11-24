import sha256_import from 'tiny-sha256';
import { configRead, segmentTypes } from './config';
import { showNotification } from './ui';
import { detectWebOSVersion, isNewYouTubeLayout } from './webos-utils.js';

let sha256 = sha256_import;

const SPONSORBLOCK_CONFIG = {
    primaryAPI: 'https://sponsorblock.inf.re/api',
    fallbackAPI: 'https://sponsor.ajay.app/api',
    timeout: 5000,
    retryAttempts: 2
};

if (typeof sha256 !== 'function') {
    sha256 = () => null;
}

class SponsorBlockHandler {
    constructor(videoID) {
        this.videoID = videoID;
        this.segments = [];
        this.skippableCategories = [];
        this.video = null;
        this.progressBar = null;
        this.overlay = null;
        this.debugMode = false; 
        
        // State
        this.isProcessing = false;
        this.webOSVersion = detectWebOSVersion();
        this.isNewLayout = isNewYouTubeLayout();
        
        // Observers & Listeners
        this.observers = new Set();
        this.listeners = new Map(); 
        
        this.log('info', `Created handler for ${this.videoID}`);
    }

    log(level, message, ...args) {
        if (level === 'debug' && !this.debugMode) return;
        if (level === 'info' && !this.debugMode) return;
        
        const prefix = `[SB:${this.videoID}]`;
        const method = console[level === 'warn' ? 'warn' : 'log'] || console.log;
        method(prefix, message, ...args);
    }

    handleError(error, context, fallback = null) {
        this.log('error', `Error in ${context}:`, error);
        if (typeof fallback === 'function') {
            try { return fallback(); } catch (e) { }
        }
        return null;
    }

    async init() {
        if (!this.videoID) return;
        const hash = sha256(this.videoID);
        if (!hash) return;

        try {
            this.skippableCategories = this.getSkippableCategories();
        } catch (e) {
            this.skippableCategories = ['sponsor', 'intro', 'outro']; 
        }

        const hashPrefix = hash.substring(0, 4);
        try {
            const data = await this.fetchSegments(hashPrefix);
            const videoData = Array.isArray(data) ? data.find(x => x.videoID === this.videoID) : data;
            
            if (videoData && videoData.segments && videoData.segments.length) {
                this.segments = videoData.segments;
                this.log('info', `Found ${this.segments.length} segments.`);
                this.start();
            } else {
                this.log('info', 'No segments found.');
            }
        } catch (e) {
            this.log('warn', 'Fetch failed', e);
        }
    }

    start() {
        this.video = document.querySelector('video');
        if (this.video) {
            this.addEvent(this.video, 'timeupdate', this.handleTimeUpdate.bind(this));
            this.addEvent(this.video, 'durationchange', () => this.drawOverlay());
        }

        this.injectCSS();
        this.observePlayerUI();
        this.checkForProgressBar();
    }

    observePlayerUI() {
        const domObserver = new MutationObserver((mutations) => {
            if (this.isProcessing) return;
            
            let shouldCheck = false;
            for (const m of mutations) {
                if (m.type === 'childList') {
                    // 1. Check if our overlay was nuked
                    if (this.overlay) {
                         // Check if overlay was directly removed
                        if (Array.from(m.removedNodes).includes(this.overlay)) {
                            this.log('debug', 'Overlay removed, redrawing...');
                            shouldCheck = true;
                        }
                    }

                    // 2. Check if our container was nuked
                    if (this.progressBar) {
                        if (Array.from(m.removedNodes).some(n => n === this.progressBar || n.contains(this.progressBar))) {
                             this.log('debug', 'Container removed, searching...');
                             shouldCheck = true;
                        }
                    }

                    // 3. Check if new bars appeared
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            if (node.matches('ytlr-progress-bar') || 
                                node.matches('ytlr-multi-markers-player-bar-renderer') ||
                                node.matches('[idomkey="slider"]') || // Direct slider add
                                node.querySelector('[idomkey="slider"]')) {
                                shouldCheck = true;
                            }
                        }
                    }
                }
                
                // 4. Visibility/Focus changes
                if (m.type === 'attributes' && m.target === this.progressBar) {
                    shouldCheck = true;
                }
            }

            if (shouldCheck) {
                this.isProcessing = true;
                requestAnimationFrame(() => {
                    this.checkForProgressBar();
                    this.isProcessing = false;
                });
            }
        });

        domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
        this.observers.add(domObserver);
    }

    checkForProgressBar() {
        // Validation: Is the overlay currently visible and healthy?
        if (this.overlay && document.body.contains(this.overlay)) {
            // If the progress bar is still in DOM, we assume we are good.
            if (this.progressBar && document.body.contains(this.progressBar)) {
                 return;
            }
        }

        // --- Target Selection ---

        // 1. Chapter Bar (Has priority)
        let target = document.querySelector('ytlr-multi-markers-player-bar-renderer');
        
        // 2. Standard Bar
        if (!target) {
            const genericBar = document.querySelector('ytlr-progress-bar');
            if (genericBar) {
                // STRICT CHECK: We MUST find the slider. 
                // Do not fallback to genericBar or we get giant bars.
                const slider = genericBar.querySelector('[idomkey="slider"]');
                if (slider) {
                    target = slider;
                } else {
                    // Slider not ready? Wait for mutation observer.
                    // this.log('debug', 'Generic bar found but no slider yet.');
                    return; 
                }
            }
        }
        
        // 3. Legacy Fallbacks
        if (!target) {
            target = document.querySelector('.ytLrProgressBarSliderBase') || 
                     document.querySelector('.afTAdb');
        }

        if (target) {
            this.progressBar = target;
            
            // Force layout properties to ensure visibility
            const style = window.getComputedStyle(target);
            if (style.position === 'static') target.style.position = 'relative';
            if (style.overflow !== 'visible') target.style.setProperty('overflow', 'visible', 'important');

            this.log('info', `Target acquired: ${target.tagName || target.className}`);
            this.drawOverlay();
        }
    }

    drawOverlay() {
        if (!this.progressBar) return;
        
        const duration = this.video ? this.video.duration : 0;
        if (!duration || isNaN(duration)) return;

        if (this.overlay) this.overlay.remove();

        const fragment = document.createDocumentFragment();

        this.segments.forEach(segment => {
            const isHighlight = segment.category === 'poi_highlight';
            const isSkippable = this.skippableCategories.includes(segment.category);
            const isHighlightEnabled = configRead('enableSponsorBlockHighlight');

            if (!isSkippable && (!isHighlight || !isHighlightEnabled)) return;

            const [start, end] = segment.segment;
            const div = document.createElement('div');
            
            const colorKey = isHighlight ? 'poi_highlightColor' : `${segment.category}Color`;
            let color = configRead(colorKey);
            if (!color) color = segmentTypes[segment.category]?.color || '#00d400';
            
            div.style.backgroundColor = color;
            div.style.position = 'absolute';
            div.style.height = '100%'; 
            div.style.top = '0';
            
            if (isHighlight) {
                const left = (start / duration) * 100;
                div.className = 'previewbar highlight';
                div.style.left = `${left}%`;
                div.style.zIndex = '2001'; 
            } else {
                const width = ((end - start) / duration) * 100;
                const left = (start / duration) * 100;
                div.className = 'previewbar';
                div.style.left = `${left}%`;
                div.style.width = `${width}%`;
                div.style.zIndex = '2000'; // High Z-Index to stay on top of slider tracks
                div.style.opacity = segmentTypes[segment.category]?.opacity || '0.7';
            }
            
            fragment.appendChild(div);
        });

        this.overlay = document.createElement('div');
        this.overlay.id = 'previewbar';
        this.overlay.appendChild(fragment);

        // Append to ensure we are stacked ON TOP of existing slider tracks
        this.progressBar.appendChild(this.overlay);
        
        this.log('info', 'Overlay drawn (appended).');
    }

    handleTimeUpdate() {
        if (!this.video || this.video.paused || this.video.seeking) return;
        
        const currentTime = this.video.currentTime;
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.category === 'poi_highlight') continue;

            if (currentTime >= seg.segment[0] && currentTime < seg.segment[1]) {
                if (this.skippableCategories.includes(seg.category)) {
                    this.skipSegment(seg);
                    return;
                }
            }
        }
    }

    skipSegment(segment) {
        this.log('info', `Skipping ${segment.category}`);
        showNotification(`Skipped ${segmentTypes[segment.category]?.name || segment.category}`);
        this.video.currentTime = segment.segment[1];
    }

    jumpToNextHighlight() {
        if (!this.video) {
            this.log('error', 'Jump: No Video Element');
            return false;
        }

        // Force config read
        if (!configRead('enableSponsorBlockHighlight')) {
            this.log('warn', 'Jump: Highlights disabled');
            return false;
        }

        if (!this.segments || !this.segments.length) {
            this.log('warn', 'Jump: No segments');
            return false;
        }

        const currentTime = this.video.currentTime;
        let nextHighlight = null;
        let minDiff = Infinity;

        // Debug Log
        const hls = this.segments.filter(s => s.category === 'poi_highlight');
        this.log('debug', `Scanning ${hls.length} highlights. Time: ${currentTime.toFixed(2)}`);

        this.segments.forEach(seg => {
            if (seg.category !== 'poi_highlight') return;
            
            const diff = seg.segment[0] - currentTime;
            
            // Allow 0.1s buffer for "current" highlight
            if (diff > -0.1 && diff < minDiff) {
                minDiff = diff;
                nextHighlight = seg;
            }
        });

        if (nextHighlight) {
            this.log('info', `Jumping to ${nextHighlight.segment[0]}`);
            this.video.currentTime = nextHighlight.segment[0];
            showNotification('Jumped to Highlight');
            return true;
        }

        this.log('info', 'No future highlight found');
        return false;
    }

    // --- Utilities ---
    async fetchSegments(hashPrefix) {
        const categories = JSON.stringify([
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'music_offtopic', 'preview', 'chapter', 'poi_highlight'
        ]);
        
        const tryFetch = async (url) => {
            try {
                const res = await fetch(`${url}/skipSegments/${hashPrefix}?categories=${encodeURIComponent(categories)}&videoID=${this.videoID}`);
                if (res.ok) return await res.json();
            } catch(e) {}
            return null;
        };

        let res = await tryFetch(SPONSORBLOCK_CONFIG.primaryAPI);
        if (!res) res = await tryFetch(SPONSORBLOCK_CONFIG.fallbackAPI);
        return res;
    }

    getSkippableCategories() {
        const keys = [
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'music_offtopic', 'preview'
        ];
        return keys.filter(cat => configRead(`enableSponsorBlock${cat.charAt(0).toUpperCase() + cat.slice(1)}`));
    }

    injectCSS() {
        if (document.getElementById('sb-css')) return;

        const webOSVersion = this.webOSVersion;
        const layout = this.isNewLayout;
        
        let css = `
            #previewbar {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: 100% !important;
                pointer-events: none !important;
                z-index: 2000 !important; /* Ensure on top */
                overflow: visible !important;
            }
            .previewbar {
                position: absolute !important;
                list-style: none !important;
                height: 100% !important;
                top: 0 !important;
                display: block !important;
                z-index: 2001 !important;
            }
            .previewbar.highlight {
                min-width: 5.47px !important;
                max-width: 5.47px !important;
                height: 100% !important;
                top: 0 !important;
                background-color: #ff0000;
            }
        `;

        // Legacy rules
        if (!layout && webOSVersion < 25) {
            css += `
                .previewbar, .previewbar.highlight {
                    height: 12px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                }
                ytlr-multi-markers-player-bar-renderer,
                .ytLrProgressBarSliderBase {
                    overflow: visible !important;
                }
            `;
        }

        const style = document.createElement('style');
        style.id = 'sb-css';
        style.textContent = css;
        document.head.appendChild(style);
        this.log('info', 'CSS injected.');
    }

    addEvent(elem, type, handler) {
        if (!elem) return;
        elem.addEventListener(type, handler);
        if (!this.listeners.has(elem)) this.listeners.set(elem, new Map());
        this.listeners.get(elem).set(type, handler);
    }

    destroy() {
        this.log('info', 'Destroying instance.');
        this.listeners.forEach((events, elem) => {
            events.forEach((handler, type) => elem.removeEventListener(type, handler));
        });
        this.listeners.clear();
        this.observers.forEach(obs => obs.disconnect());
        this.observers.clear();
        if (this.overlay) this.overlay.remove();
        const css = document.getElementById('sb-css');
        if (css) css.remove();
        this.segments = [];
    }
}

if (typeof window !== 'undefined') {
    window.sponsorblock = null;

    const initSB = () => {
        if (window.sponsorblock) window.sponsorblock.destroy();
        let videoID = null;
        try {
            const hash = window.location.hash;
            if (hash.startsWith('#')) {
                const parts = hash.split('?');
                if (parts.length > 1) {
                    const params = new URLSearchParams(parts[1]);
                    videoID = params.get('v');
                }
            }
        } catch(e) {}

        if (videoID && configRead('enableSponsorBlock')) {
            window.sponsorblock = new SponsorBlockHandler(videoID);
            window.sponsorblock.init();
        }
    };

    window.addEventListener('hashchange', initSB);
    if (document.readyState === 'complete') setTimeout(initSB, 500);
    else window.addEventListener('load', () => setTimeout(initSB, 500));
}