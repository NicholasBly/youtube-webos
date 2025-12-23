/* src/sponsorblock.js */
import sha256_import from 'tiny-sha256';
import { configRead, configAddChangeListener, configRemoveChangeListener, segmentTypes } from './config';
import { showNotification } from './ui';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { WebOSVersion } from './webos-utils.js';

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
		this.highlightSegment = null;
        this.video = null;
        this.progressBar = null;
        this.overlay = null;
        this.debugMode = false; 
        
        // Cache enabled categories to avoid configRead in tight loops
        this.activeCategories = new Set();
        
        // State
        this.isProcessing = false;
        this.wasMutedBySB = false; // State for muting
        
        this.mutedSegmentsEnabled = false;
        
        // Observers & Listeners
        this.observers = new Set();
        this.listeners = new Map(); 
		
		this.configListeners = [];
		this.rafIds = new Set();
        
        this.abortController = null;
        
        this.updateConfigCache();
        this.setupConfigListeners();
        
        this.log('info', `Created handler for ${this.videoID}`);
    }
	
	requestAF(callback) {
        const id = requestAnimationFrame(() => {
            this.rafIds.delete(id);
            callback();
        });
        this.rafIds.add(id);
        return id;
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
        this.mutedSegmentsEnabled = configRead('enableMutedSegments');
    }

	setupConfigListeners() {
        this.boundConfigUpdate = this.updateConfigCache.bind(this);
        Object.values(CONFIG_MAPPING).forEach(key => {
            configAddChangeListener(key, this.boundConfigUpdate);
            this.configListeners.push({ key, callback: this.boundConfigUpdate });
        });
        // Also listen to muted segments config
        configAddChangeListener('enableMutedSegments', this.boundConfigUpdate);
        this.configListeners.push({ key: 'enableMutedSegments', callback: this.boundConfigUpdate });
    }

    async init() {
        if (!this.videoID) return;
		
        const initVideoID = this.videoID;
        sponsorBlockUI.updateSegments([]);
        const hash = sha256(this.videoID);
        if (!hash) return;
        const hashPrefix = hash.substring(0, 4);
        try {
            const data = await this.fetchSegments(hashPrefix);
            
            if (this.videoID !== initVideoID) {
                this.log('info', 'Video changed during fetch, aborting init');
                return;
            }
            
            const videoData = Array.isArray(data) ? data.find(x => x.videoID === this.videoID) : data;
            
            if (videoData && videoData.segments && videoData.segments.length) {
                this.segments = videoData.segments.sort((a, b) => a.segment[0] - b.segment[0]);
                this.highlightSegment = this.segments.find(s => s.category === 'poi_highlight');
                this.log('info', `Found ${this.segments.length} segments.`);
                
				this.start();
				
                // Update UI with new segments
                sponsorBlockUI.updateSegments(this.segments);
            }
        } catch (e) {
			showNotification("SB Error: " + e.message);
            this.log('warn', 'Fetch failed', e);
        }
    }

    start() {
        this.video = document.querySelector('video');
        if (this.video) {
            this.addEvent(this.video, 'timeupdate', this.handleTimeUpdate.bind(this));
            
            // [Updated] Sanitize segments whenever duration changes (load or resolution switch)
            this.addEvent(this.video, 'durationchange', () => {
                this.sanitizeSegments();
                this.drawOverlay();
            });

            // [New] If metadata is already loaded (e.g. late injection), sanitize immediately
            if (this.video.duration) {
                this.sanitizeSegments();
            }
        }

        this.injectCSS();
        
        this.observePlayerUI();
        this.checkForProgressBar();
    }
	
	sanitizeSegments() {
        if (!this.video || !this.video.duration || isNaN(this.video.duration)) return;
        
		this.log('debug', 'Sanitizing segments, duration:', this.video.duration);
        const duration = this.video.duration;
        
        this.segments.forEach(segment => {
            // If the segment ends after the video ends, clamp it to the video duration
            if (segment.segment[1] >= duration) {
                const oldEnd = segment.segment[1];
                segment.segment[1] = Math.max(0, duration - 0.01); // Fix webOS 5 video restarting issue on outro segments
                this.log('info', `Clamped segment end from ${oldEnd} to ${duration - 0.01}`);
            }
        });
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
                this.requestAF(() => {
                    this.checkForProgressBar();
                    this.isProcessing = false;
                });
            }
        });

		const playerRoot = document.querySelector('ytlr-app') || 
                           document.getElementById('container') ||
                           document.body;
						   
		console.log('[SponsorBlock] Observing player root:', playerRoot);

        domObserver.observe(playerRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
        
        this.observers.add(domObserver);
    }

    checkForProgressBar() {
        if (this.overlay && document.body.contains(this.overlay) && this.progressBar && document.body.contains(this.progressBar)) {
             return;
        }

        let target = document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="segment"]') ||
                     document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]') ||
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
        if (!this.video || !this.video.isConnected || this.video.paused || this.video.seeking) return;
        
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
                if (seg.actionType === 'mute' && this.mutedSegmentsEnabled) {
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
		let skipTarget = segment.segment[1];
        
        // WebOS 5 Specific Check: Run the sanitize segment check/logic
        if (WebOSVersion() === 5) {
            const duration = this.video.duration;
            if (skipTarget >= duration - 0.5) {
                const buffer = 0.25; 
                skipTarget = Math.max(0, duration - buffer);
                if (buffer > 0.1 && !this.video.muted) {
                     this.video.muted = true;
                     setTimeout(() => { if(!this.video.paused) this.video.muted = false; }, 1000); 
                }
            }
        }
		
		this.video.currentTime = skipTarget;
		
		// Resume playback if not near end (non-WebOS5 only)
		if (WebOSVersion() !== 5) {
			const timeRemaining = this.video.duration - this.video.currentTime;
			if (timeRemaining > 0.5 && this.video.paused) { 
				this.video.play();
			}
		}

        this.requestAF(() => {
            showNotification(`Skipped ${segmentTypes[segment.category]?.name || segment.category}`);
        });
    }

    jumpToNextHighlight() {
        if (!this.video || !this.highlightSegment || !configRead('enableSponsorBlockHighlight')) return false;
        this.video.currentTime = this.highlightSegment.segment[0];
        this.requestAF(() => {
            showNotification('Jumped to Highlight');
        });
        return true;
    }

    async fetchSegments(hashPrefix) {
        const categories = JSON.stringify([
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'musicofftopic', 'preview', 'chapter', 'poi_highlight', 
            'filler', 'hook'
        ]);
        
        // Request mute and skip actions
        const actionTypes = JSON.stringify(['skip', 'mute']);
        
        if (this.abortController) {
            this.abortController.abort();
        }
        
        const tryFetch = async (url) => {
            try {
                // FALLBACK: Logic to support WebOS 3.x (No AbortController)
                const fetchURL = `${url}/skipSegments/${hashPrefix}?categories=${encodeURIComponent(categories)}&actionTypes=${encodeURIComponent(actionTypes)}&videoID=${this.videoID}`;
                
                if (typeof AbortController !== 'undefined') {
                    this.abortController = new AbortController();
                    const controller = this.abortController;
                    const id = setTimeout(() => controller.abort(), SPONSORBLOCK_CONFIG.timeout);
                    const res = await fetch(fetchURL, { signal: controller.signal });
                    clearTimeout(id);
                    if (res.ok) return await res.json();
                } else {
                    // Legacy Fallback for older TVs
                    const res = await Promise.race([
                        fetch(fetchURL),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SPONSORBLOCK_CONFIG.timeout))
                    ]);
                    if (res.ok) return await res.json();
                }
            } catch(e) {
                this.log('warn', 'Fetch attempt failed:', e.message);
            }
            return null;
        };

        let res = await tryFetch(SPONSORBLOCK_CONFIG.primaryAPI);
        if (!res) res = await tryFetch(SPONSORBLOCK_CONFIG.fallbackAPI);
        return res;
    }

    injectCSS() {
        if (document.getElementById('sb-css')) return;
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
		
		// Clear all pending Animation Frames
		this.rafIds.forEach(id => cancelAnimationFrame(id));
        this.rafIds.clear();
        
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        
        // 1. Clean up UI
        sponsorBlockUI.togglePopup(false); 
        sponsorBlockUI.updateSegments([]);
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        // 2. Clean up Injected CSS
        const style = document.getElementById('sb-css');
        if (style) {
            style.remove();
        }

        // 3. Reset Audio State
        if (this.wasMutedBySB && this.video) {
            this.video.muted = false;
        }
        
        // 4. Remove DOM Event Listeners
        this.listeners.forEach((events, elem) => {
            events.forEach((handler, type) => elem.removeEventListener(type, handler));
        });
        this.listeners.clear();

        // 5. Disconnect Observers
        this.observers.forEach(obs => obs.disconnect());
        this.observers.clear();

        // 6. Remove Config Listeners
        this.configListeners.forEach(({ key, callback }) => {
            configRemoveChangeListener(key, callback);
        });
        this.configListeners = [];
        
        // 7. Release Memory / DOM References
        this.segments = [];
        this.highlightSegment = null;
        this.video = null;
        this.progressBar = null;
        this.activeCategories = null;
    }
}

if (typeof window !== 'undefined') {
    if (window.__ytaf_sb_init) {
        window.removeEventListener('hashchange', window.__ytaf_sb_init);
    }

    window.sponsorblock = null;
    
    let initTimeout = null;

    const initSB = () => {
        // Clear any pending init
        if (initTimeout) {
            clearTimeout(initTimeout);
        }
        
        // Debounce to handle rapid navigation
        initTimeout = setTimeout(() => {
            if (window.sponsorblock) window.sponsorblock.destroy();
            let videoID = null;
            try {
                const hash = window.location.hash;
                if (hash.startsWith('#')) {
                    const parts = hash.split('?');
                    if (parts.length > 1) {
                        // FALLBACK: Check if URLSearchParams is supported
                        if (typeof URLSearchParams !== 'undefined') {
                            const params = new URLSearchParams(parts[1]);
                            videoID = params.get('v');
                        } else {
                            // Legacy Regex Fallback for WebOS 3.x
                            const match = parts[1].match(/(?:[?&]|^)v=([^&]+)/);
                            if (match) {
                                videoID = match[1];
                            }
                        }
                    }
                }
            } catch(e) {}

            if (videoID && configRead('enableSponsorBlock')) {
                window.sponsorblock = new SponsorBlockHandler(videoID);
                window.sponsorblock.init();
            }
            
            initTimeout = null;
        }, 300); // Debounce delay
    };

    window.__ytaf_sb_init = initSB;
    window.addEventListener('hashchange', initSB);

    if (document.readyState === 'complete') {
        setTimeout(initSB, 500);
    } else {
        window.addEventListener('load', () => setTimeout(initSB, 500), { once: true });
    }
}