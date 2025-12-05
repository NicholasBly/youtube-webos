/* src/sponsorblock.js */
import sha256_import from 'tiny-sha256';
import { configRead, configAddChangeListener, segmentTypes } from './config';
import { showNotification } from './ui';
import { WebOSVersion, isNewYouTubeLayout } from './webos-utils.js';

let sha256 = sha256_import;

const SPONSORBLOCK_CONFIG = {
    primaryAPI: 'https://sponsorblock.inf.re/api',
    fallbackAPI: 'https://sponsor.ajay.app/api',
    timeout: 5000,
    retryAttempts: 2
};

const CONFIG_MAPPING = {
    sponsor: 'enableSponsorBlockSponsor',
    intro: 'enableSponsorBlockIntro',
    outro: 'enableSponsorBlockOutro',
    interaction: 'enableSponsorBlockInteraction',
    selfpromo: 'enableSponsorBlockSelfPromo',
    musicofftopic: 'enableSponsorBlockMusicOfftopic',
    preview: 'enableSponsorBlockPreview',
    filler: 'enableSponsorBlockFiller',
    hook: 'enableSponsorBlockHook'
};

if (typeof sha256 !== 'function') {
    sha256 = () => null;
}

class SponsorBlockHandler {
    constructor(videoID) {
        this.videoID = videoID;
        this.segments = [];
        this.video = null;
        this.progressBar = null;
        this.overlay = null;
        this.debugMode = false; 
        
        // Cache enabled categories to avoid configRead in tight loops
        this.activeCategories = new Set();
        
        // State
        this.isProcessing = false;
        this.wasMutedBySB = false; // State for muting
        this.webOSVersion = WebOSVersion();
        this.isNewLayout = isNewYouTubeLayout();
        
        // Observers & Listeners
        this.observers = new Set();
        this.listeners = new Map(); 
        
        this.updateConfigCache();
        this.setupConfigListeners();
        
        this.log('info', `Created handler for ${this.videoID}`);
    }

    log(level, message, ...args) {
        if (level === 'debug' && !this.debugMode) return;
        if (level === 'info' && !this.debugMode) return;
        
        const prefix = `[SB:${this.videoID}]`;
        console[level === 'warn' ? 'warn' : 'log'](prefix, message, ...args);
    }

    updateConfigCache() {
        this.activeCategories.clear();
        for (const [cat, configKey] of Object.entries(CONFIG_MAPPING)) {
            if (configRead(configKey)) {
                this.activeCategories.add(cat);
            }
        }
    }

    setupConfigListeners() {
        Object.values(CONFIG_MAPPING).forEach(key => {
            configAddChangeListener(key, () => this.updateConfigCache());
        });
    }

    async init() {
        if (!this.videoID) return;
        const hash = sha256(this.videoID);
        if (!hash) return;

        const hashPrefix = hash.substring(0, 4);
        try {
            const data = await this.fetchSegments(hashPrefix);
            const videoData = Array.isArray(data) ? data.find(x => x.videoID === this.videoID) : data;
            
            if (videoData && videoData.segments && videoData.segments.length) {
                this.segments = videoData.segments;
                this.log('info', `Found ${this.segments.length} segments.`);
                this.start();
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
            // Optimize: Iterate backwards and break early if possible,
            // or just check if relevant nodes are involved.
            for (const m of mutations) {
                // Optimization: Don't check attributes of unrelated elements
                if (m.type === 'attributes' && m.target !== this.progressBar) continue;

                if (m.type === 'childList') {
                    if (this.overlay && Array.from(m.removedNodes).includes(this.overlay)) {
                        shouldCheck = true;
                        break;
                    }
                    if (this.progressBar && Array.from(m.removedNodes).some(n => n === this.progressBar || n.contains(this.progressBar))) {
                         shouldCheck = true;
                         break;
                    }
                    
                    // Only check added nodes if we don't have a progress bar or it's potentially new UI
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1 && (
                            node.nodeName.includes('PLAYER-BAR') || 
                            node.classList?.contains('ytLrProgressBarSliderBase') ||
                            node.getAttribute?.('idomkey') === 'slider'
                        )) {
                            shouldCheck = true;
                            break;
                        }
                    }
                }
                if (shouldCheck) break;
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
            attributeFilter: ['class', 'style', 'hidden'] // Restrict attributes
        });
        this.observers.add(domObserver);
    }

    checkForProgressBar() {
        if (this.overlay && document.body.contains(this.overlay) && this.progressBar && document.body.contains(this.progressBar)) {
             return;
        }

        let target = document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]') ||
                     document.querySelector('ytlr-multi-markers-player-bar-renderer') ||
                     document.querySelector('ytlr-progress-bar [idomkey="slider"]') ||
                     document.querySelector('.ytLrProgressBarSliderBase') || 
                     document.querySelector('.afTAdb');

        if (target) {
            this.progressBar = target;
            const style = window.getComputedStyle(target);
            if (style.position === 'static') target.style.position = 'relative';
            if (style.overflow !== 'visible') target.style.setProperty('overflow', 'visible', 'important');

            this.drawOverlay();
        }
    }

    drawOverlay() {
        if (!this.progressBar || !this.segments.length) return;
        
        const duration = this.video ? this.video.duration : 0;
        if (!duration || isNaN(duration)) return;

        if (this.overlay) this.overlay.remove();

        const fragment = document.createDocumentFragment();
        const highlightEnabled = configRead('enableSponsorBlockHighlight');

        this.segments.forEach(segment => {
            const isHighlight = segment.category === 'poi_highlight';
            // Use Cached Config
            if (isHighlight && !highlightEnabled) return;
            if (!isHighlight && !this.activeCategories.has(segment.category)) return;

            const [start, end] = segment.segment;
            const div = document.createElement('div');
            
            const colorKey = isHighlight ? 'poi_highlightColor' : `${segment.category}Color`;
            // We still read config for color, but that's one-time per overlay draw, not per frame.
            const color = configRead(colorKey) || segmentTypes[segment.category]?.color || '#00d400';
            
            div.style.backgroundColor = color;
            div.style.position = 'absolute';
            div.style.height = '100%'; 
            div.style.top = '0';
            
            const left = (start / duration) * 100;
            div.className = isHighlight ? 'previewbar highlight' : 'previewbar';
            div.style.left = `${left}%`;
            div.style.zIndex = isHighlight ? '2001' : '2000';
            
            if (!isHighlight) {
                const width = ((end - start) / duration) * 100;
                div.style.width = `${width}%`;
                div.style.opacity = segmentTypes[segment.category]?.opacity || '0.7';
            }
            
            fragment.appendChild(div);
        });

        this.overlay = document.createElement('div');
        this.overlay.id = 'previewbar';
        this.overlay.appendChild(fragment); 
        this.progressBar.appendChild(this.overlay);
    }

    handleTimeUpdate() {
        if (!this.video || this.video.paused || this.video.seeking) return;
        
        const currentTime = this.video.currentTime;
        let shouldBeMuted = false;
        
        // Performance: Use simple for loop
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            
            // Fast bounding box check
            if (currentTime < seg.segment[0] || currentTime >= seg.segment[1]) continue;
            
            if (seg.category === 'poi_highlight') continue;

            // Use cached category check (O(1))
            if (this.activeCategories.has(seg.category)) {
                // If actionType is skip (default or explicit), skip it
                if (!seg.actionType || seg.actionType === 'skip') {
                    this.skipSegment(seg);
                    return; 
                }
                
                // If actionType is mute and mute is enabled, mark for mute
                if (seg.actionType === 'mute' && configRead('enableMutedSegments')) {
                    shouldBeMuted = true;
                }
            }
        }

        // Handle Muting State
        if (shouldBeMuted) {
            if (!this.wasMutedBySB) {
                this.wasMutedBySB = true;
                this.video.muted = true;
                showNotification('Muting Segment');
            }
        } else {
            if (this.wasMutedBySB) {
                this.wasMutedBySB = false;
                this.video.muted = false;
                showNotification('Unmuting');
            }
        }
    }

    skipSegment(segment) {
        showNotification(`Skipped ${segmentTypes[segment.category]?.name || segment.category}`);
        this.video.currentTime = segment.segment[1];
    }

    jumpToNextHighlight() {
        if (!this.video || !configRead('enableSponsorBlockHighlight')) return false;

        const highlight = this.segments.find(s => s.category === 'poi_highlight');
        if (highlight) {
            this.video.currentTime = highlight.segment[0];
            showNotification('Jumped to Highlight');
            return true;
        }
        return false;
    }

    async fetchSegments(hashPrefix) {
        const categories = JSON.stringify([
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'musicofftopic', 'preview', 'chapter', 'poi_highlight', 
            'filler', 'hook'
        ]);
        
        // Request mute and skip actions
        const actionTypes = JSON.stringify(['skip', 'mute']);
        
        const tryFetch = async (url) => {
            try {
                // Add short timeout for fetch to prevent hanging
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), SPONSORBLOCK_CONFIG.timeout);
                const res = await fetch(`${url}/skipSegments/${hashPrefix}?categories=${encodeURIComponent(categories)}&actionTypes=${encodeURIComponent(actionTypes)}&videoID=${this.videoID}`, { signal: controller.signal });
                clearTimeout(id);
                if (res.ok) return await res.json();
            } catch(e) {}
            return null;
        };

        let res = await tryFetch(SPONSORBLOCK_CONFIG.primaryAPI);
        if (!res) res = await tryFetch(SPONSORBLOCK_CONFIG.fallbackAPI);
        return res;
    }

    injectCSS() {
        if (document.getElementById('sb-css')) return;
        // ... (Keep existing CSS logic)
        const css = `
            #previewbar { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; pointer-events: none !important; z-index: 2000 !important; overflow: visible !important; }
            .previewbar { position: absolute !important; list-style: none !important; height: 100% !important; top: 0 !important; display: block !important; z-index: 2001 !important; }
            .previewbar.highlight { min-width: 5.47px !important; max-width: 5.47px !important; height: 100% !important; top: 0 !important; background-color: #ff0000; }
        `;
        const style = document.createElement('style');
        style.id = 'sb-css';
        style.textContent = css;
        document.head.appendChild(style);
    }

    addEvent(elem, type, handler) {
        if (!elem) return;
        elem.addEventListener(type, handler);
        if (!this.listeners.has(elem)) this.listeners.set(elem, new Map());
        this.listeners.get(elem).set(type, handler);
    }

    destroy() {
        this.log('info', 'Destroying instance.');
        // Ensure we unmute if we are destroyed while muting
        if (this.wasMutedBySB && this.video) {
            this.video.muted = false;
        }
        
        this.listeners.forEach((events, elem) => {
            events.forEach((handler, type) => elem.removeEventListener(type, handler));
        });
        this.listeners.clear();
        this.observers.forEach(obs => obs.disconnect());
        this.observers.clear();
        if (this.overlay) this.overlay.remove();
        // Don't remove CSS, it might be used by next instance or just leave it
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