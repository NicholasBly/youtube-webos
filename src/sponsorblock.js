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

const CHAIN_SKIP_CONSTANTS = {
    START_THRESHOLD: 0.5,
    OVERLAP_TOLERANCE: 0.2,
    UNMUTE_DELAY: 600,
    MIN_PLAYBACK_TIME: 0.1
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
        
        // Tracking state
        this.lastSkipTime = -1;
        this.lastSkippedSegmentIndex = -1;
        this.hasPerformedChainSkip = false;
        this.skipSegments = [];
        this.nextSegmentIndex = 0;
        this.nextSegmentStart = Infinity;
        
        // Status flags
        this.activeCategories = new Set();
        this.isProcessing = false;
        this.isSkipping = false;
        this.wasMutedBySB = false;
        this.isDestroyed = false;
        
        // Listeners & Observers
        this.observers = new Set();
        this.listeners = new Map();
        this.configListeners = [];
        this.rafIds = new Set();
        
        this.abortController = null;
        this.unmuteTimeoutId = null;
        
        // High Frequency Polling
        this.pollingRafId = null;
        this.boundHighFreqLoop = this.highFreqLoop.bind(this);
        
        this.updateConfigCache();
        this.setupConfigListeners();
        
        this.log('info', `Created handler for ${this.videoID}`);
    }
    
    requestAF(callback) {
        if (this.isDestroyed) return;
        const id = requestAnimationFrame(() => {
            this.rafIds.delete(id);
            if (!this.isDestroyed) callback();
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
        this.rebuildSkipSegments();
    }
    
    rebuildSkipSegments() {
        this.stopHighFreqLoop();
        this.skipSegments = [];
        
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            if (seg.category === 'poi_highlight') continue;
            if (!this.activeCategories.has(seg.category)) continue;
            if (!seg.actionType || seg.actionType === 'skip') {
                this.skipSegments.push({
                    start: seg.segment[0],
                    end: seg.segment[1],
                    category: seg.category,
                    originalIndex: i
                });
            }
        }
        this.resetSegmentTracking();
    }

    resetSegmentTracking() {
        this.nextSegmentIndex = 0;
        this.nextSegmentStart = this.skipSegments.length > 0 ? this.skipSegments[0].start : Infinity;
    }
    
    findSegmentAtTime(time) {
        let left = 0; 
        let right = this.skipSegments.length - 1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const seg = this.skipSegments[mid];
            
            if (time >= seg.start && time < seg.end) {
                return mid;
            } else if (time < seg.start) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        return -1;
    }

    setupConfigListeners() {
        this.boundConfigUpdate = this.updateConfigCache.bind(this);
        Object.values(CONFIG_MAPPING).forEach(key => {
            configAddChangeListener(key, this.boundConfigUpdate);
            this.configListeners.push({ key, callback: this.boundConfigUpdate });
        });
        configAddChangeListener('enableMutedSegments', this.boundConfigUpdate);
        this.configListeners.push({ key: 'enableMutedSegments', callback: this.boundConfigUpdate });
    }

    buildSkipChain(segments) {
        if (!segments || segments.length === 0) return null;

        const firstSeg = segments[0];
        if (firstSeg.segment[0] >= CHAIN_SKIP_CONSTANTS.START_THRESHOLD) return null;

        let finalSeekTime = firstSeg.segment[1];
        const chainParts = [`${firstSeg.category}[${firstSeg.segment[0].toFixed(1)}s-${firstSeg.segment[1].toFixed(1)}s]`];

        for (let i = 1; i < segments.length; i++) {
            const current = segments[i];
            const gapToNext = current.segment[0] - finalSeekTime;
            
            if (gapToNext <= CHAIN_SKIP_CONSTANTS.OVERLAP_TOLERANCE) {
                if (current.segment[1] > finalSeekTime) {
                    chainParts.push(`${current.category}[${current.segment[0].toFixed(1)}s-${current.segment[1].toFixed(1)}s]`);
                    finalSeekTime = current.segment[1];
                }
            } else {
                break;
            }
        }

        if (chainParts.length === 1 && finalSeekTime - firstSeg.segment[0] < 1) return null;

        return {
            endTime: finalSeekTime,
            chainDescription: chainParts.join(' → ')
        };
    }

    executeChainSkip(video) {
        if (!video || this.hasPerformedChainSkip || this.isDestroyed) return false;
		if (video.readyState === 0) {
            const retry = () => {
                video.removeEventListener('loadedmetadata', retry);
                if (!this.isDestroyed) this.executeChainSkip(video);
            };
            video.addEventListener('loadedmetadata', retry);
            return false;
        }
        if (video.currentTime > CHAIN_SKIP_CONSTANTS.START_THRESHOLD) return false;

        const enabledSegs = this.segments.filter(s => 
            s.category !== 'poi_highlight' && this.activeCategories.has(s.category)
        );

        const chain = this.buildSkipChain(enabledSegs);
        if (!chain) return false;

        if (chain.endTime >= video.duration) return false;

        this.log('info', `Executing chain skip: ${chain.chainDescription}`);
        
        const originalMuteState = video.muted;
        window.__sb_pending_unmute = true;
        this.wasMutedBySB = true;
        video.muted = true;
        
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            
            if (this.isDestroyed) return;

            const checkReady = () => {
                if (this.isDestroyed) return;
                
                if (video.readyState >= 3) {
                    video.muted = originalMuteState;
                    window.__sb_pending_unmute = false;
                    this.wasMutedBySB = false;
                    if (this.unmuteTimeoutId) {
                        clearTimeout(this.unmuteTimeoutId);
                        this.unmuteTimeoutId = null;
                    }
                } else {
                    this.unmuteTimeoutId = setTimeout(checkReady, 50);
                }
            };
            checkReady();
        };
        
        video.addEventListener('seeked', onSeeked);
        
        this.unmuteTimeoutId = setTimeout(() => {
            if (this.isDestroyed) return;
            video.removeEventListener('seeked', onSeeked);
            if (video.readyState >= 2) {
                video.muted = originalMuteState;
                window.__sb_pending_unmute = false;
                this.wasMutedBySB = false;
            }
            this.unmuteTimeoutId = null;
        }, CHAIN_SKIP_CONSTANTS.UNMUTE_DELAY);
        
        video.currentTime = chain.endTime;
        this.lastSkipTime = chain.endTime;
        this.hasPerformedChainSkip = true;
        
        this.requestAF(() => {
            const categories = chain.chainDescription.split(' → ')
                .map(part => part.split('[')[0])
                .filter((cat, idx, arr) => arr.indexOf(cat) === idx)
                .map(cat => segmentTypes[cat]?.name || cat);
            
            showNotification(`Skipped ${categories.join(', ')}`);
        });
        
        return true;
    }

    async init() {
        if (window.__sb_pending_unmute) {
            const v = document.querySelector('video');
            if (v) v.muted = false;
            window.__sb_pending_unmute = false;
        }

        if (!this.videoID || this.isDestroyed) return;
        
        const initVideoID = this.videoID;
        sponsorBlockUI.updateSegments([]);
        
        const hash = sha256(this.videoID);
        if (!hash) return;
        const hashPrefix = hash.substring(0, 4);
        
        try {
            const data = await this.fetchSegments(hashPrefix);
            
            if (this.isDestroyed || this.videoID !== initVideoID) return;
            
            const videoData = Array.isArray(data) ? data.find(x => x.videoID === this.videoID) : data;
            
            if (videoData && videoData.segments && videoData.segments.length) {
                this.segments = videoData.segments.sort((a, b) => a.segment[0] - b.segment[0]);
                this.highlightSegment = this.segments.find(s => s.category === 'poi_highlight');
                this.rebuildSkipSegments();
                
                const video = document.querySelector('video');
                if (video) {
                    this.executeChainSkip(video);
                }
                
                this.start();
                sponsorBlockUI.updateSegments(this.segments);
            }
        } catch (e) {
            if (!this.isDestroyed) {
                showNotification("SB Error: " + e.message);
                this.log('warn', 'Fetch failed', e);
            }
        }
    }

    start() {
        this.video = document.querySelector('video');
        if (!this.video) return;

        this.injectCSS();
        this.addEvent(this.video, 'timeupdate', this.handleTimeUpdate.bind(this));
        
        this.addEvent(this.video, 'seeked', () => {
            if (this.isDestroyed) return;
            
            // 1. Safety: Stop any existing poll immediately to prevent race conditions
            this.stopHighFreqLoop();
            
            // 2. Critical Logic: Handle Manual Seeks
            if (!this.isSkipping) {
                // Reset search cursor so we don't miss segments 'behind' us
                this.lastSkipTime = -1;
                this.lastSkippedSegmentIndex = -1;
                this.resetSegmentTracking();

                // FORCE CHECK: Instantly check if we landed in a segment or need to start polling
                // This fixes Bug 2 (audio leak) and Bug 1 (missed poll start)
                this.handleTimeUpdate();
            }
            
            this.isSkipping = false;
        });
        
        this.addEvent(this.video, 'durationchange', () => {
            this.sanitizeSegments();
            this.drawOverlay();
        });

        if (this.video.duration) {
            this.sanitizeSegments();
        }
        
        this.observePlayerUI();
        this.checkForProgressBar();
    }

    observePlayerUI() {
        const domObserver = new MutationObserver((mutations) => {
            if (this.isProcessing || this.isDestroyed) return;
            
            let shouldCheck = false;
            
            for (const m of mutations) {
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

        domObserver.observe(playerRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
        
        this.observers.add(domObserver);
    }

    checkForProgressBar() {
        if (this.isDestroyed) return;
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
        if (!this.progressBar || !this.segments.length || this.isDestroyed) return;
        
        const duration = this.video ? this.video.duration : 0;
        if (!duration || isNaN(duration)) return;

        if (this.overlay) this.overlay.remove();

        const fragment = document.createDocumentFragment();
        const highlightEnabled = configRead('enableSponsorBlockHighlight');

        this.segments.forEach(segment => {
            const isHighlight = segment.category === 'poi_highlight';
            if (isHighlight && !highlightEnabled) return;
            if (!isHighlight && !this.activeCategories.has(segment.category)) return;

            const [start, end] = segment.segment;
            const div = document.createElement('div');
            
            const colorKey = isHighlight ? 'poi_highlightColor' : `${segment.category}Color`;
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

    sanitizeSegments() {
        if (WebOSVersion() !== 5) return;
        if (!this.video || !this.video.duration || isNaN(this.video.duration)) return;
        
        const duration = this.video.duration;
        this.segments.forEach(segment => {
            if (segment.segment[1] >= duration - 0.5) {
                segment.segment[1] = Math.max(0, duration - 0.30);
            }
        });
    }

    startHighFreqLoop() {
        if (!this.pollingRafId && this.nextSegmentStart !== Infinity && !this.isDestroyed) {
            this.pollingRafId = requestAnimationFrame(this.boundHighFreqLoop);
        }
    }

    stopHighFreqLoop() {
        if (this.pollingRafId) {
            cancelAnimationFrame(this.pollingRafId);
            this.pollingRafId = null;
        }
    }

    highFreqLoop() {
        if (this.isDestroyed || !this.video || this.video.paused || this.isSkipping) {
            this.stopHighFreqLoop();
            return;
        }

        if (this.video.currentTime >= this.nextSegmentStart) {
            this.handleTimeUpdate();
            this.stopHighFreqLoop();
        } else {
            this.pollingRafId = requestAnimationFrame(this.boundHighFreqLoop);
        }
    }

    handleTimeUpdate() {
        // Removed paused check here to allow manual invocation from seeked listener
        if (this.isDestroyed || !this.video || this.video.seeking || this.video.readyState === 0) return;
        
        const currentTime = this.video.currentTime;

        // Optimization: Early exit if we are far from the next segment
        const timeToNext = this.nextSegmentStart - currentTime;
        
        if (timeToNext > 0) {
            // Trigger high precision polling when close
            if (timeToNext < 1.0 && !this.pollingRafId) {
                this.startHighFreqLoop();
            }
            return;
        }
        
        const segmentIdx = this.findSegmentAtTime(currentTime);
        
        if (segmentIdx === -1) {
            for (let i = this.nextSegmentIndex; i < this.skipSegments.length; i++) {
                if (this.skipSegments[i].start > currentTime) {
                    this.nextSegmentIndex = i;
                    this.nextSegmentStart = this.skipSegments[i].start;
                    return;
                }
            }
            this.nextSegmentStart = Infinity;
            return;
        }
        
        const seg = this.skipSegments[segmentIdx];
        let jumpTarget = seg.end;
        const skippedCategories = [segmentTypes[seg.category]?.name || seg.category];
        
        for (let i = segmentIdx + 1; i < this.skipSegments.length; i++) {
            const next = this.skipSegments[i];
            if (next.start > jumpTarget + 0.2) break;
            
            jumpTarget = Math.max(jumpTarget, next.end);
            skippedCategories.push(segmentTypes[next.category]?.name || next.category);
        }
        
        if (segmentIdx === this.lastSkippedSegmentIndex && Math.abs(currentTime - this.lastSkipTime) < 0.1) {
            return;
        }
        
        this.isSkipping = true;
        this.lastSkipTime = currentTime;
        this.lastSkippedSegmentIndex = segmentIdx;
        
        if (WebOSVersion() === 5) {
            const duration = this.video.duration;
            if (jumpTarget >= duration - 0.5) {
                jumpTarget = Math.max(0, duration - 0.25);
                if (!this.video.muted) {
                    this.video.muted = true;
                    setTimeout(() => { 
                        if (this.video && !this.isDestroyed && (this.video.paused || this.video.currentTime < 5)) {
                            this.video.muted = false; 
                        }
                    }, 1000); 
                }
            }
        }
        
        this.video.currentTime = jumpTarget;
        
        if (WebOSVersion() !== 5) {
            const timeRemaining = this.video.duration - this.video.currentTime;
            if (timeRemaining > 0.5 && this.video.paused) { 
                this.video.play();
            }
        }
        
        this.nextSegmentIndex = segmentIdx + 1;
        if (this.nextSegmentIndex < this.skipSegments.length) {
            this.nextSegmentStart = this.skipSegments[this.nextSegmentIndex].start;
        } else {
            this.nextSegmentStart = Infinity;
        }
        
        this.requestAF(() => {
            const uniqueNames = [...new Set(skippedCategories)];
            let formattedName = uniqueNames[0];
            
            if (uniqueNames.length === 2) {
                formattedName = `${uniqueNames[0]} and ${uniqueNames[1]}`;
            } else if (uniqueNames.length > 2) {
                const last = uniqueNames.pop();
                formattedName = `${uniqueNames.join(', ')}, and ${last}`;
            }
            
            showNotification(`Skipped ${formattedName}`);
        });
        
        this.log('info', `Skipped to ${jumpTarget}`);
    }

    jumpToNextHighlight() {
        if (!this.video || !this.highlightSegment || !configRead('enableSponsorBlockHighlight')) return false;
        this.video.currentTime = this.highlightSegment.segment[0];
        this.requestAF(() => showNotification('Jumped to Highlight'));
        return true;
    }

    async fetchSegments(hashPrefix) {
        if (this.isDestroyed) return null;
        
        const categories = JSON.stringify([
            'sponsor', 'intro', 'outro', 'interaction', 'selfpromo', 
            'musicofftopic', 'preview', 'chapter', 'poi_highlight', 
            'filler', 'hook'
        ]);
        const actionTypes = JSON.stringify(['skip', 'mute']);
        
        if (this.abortController) {
            this.abortController.abort();
        }
        
        const tryFetch = async (url) => {
            if (this.isDestroyed) return null;
            try {
                const fetchURL = `${url}/skipSegments/${hashPrefix}?categories=${encodeURIComponent(categories)}&actionTypes=${encodeURIComponent(actionTypes)}&videoID=${this.videoID}`;
                
                if (typeof AbortController !== 'undefined') {
                    this.abortController = new AbortController();
                    const controller = this.abortController;
                    const id = setTimeout(() => controller.abort(), SPONSORBLOCK_CONFIG.timeout);
                    const res = await fetch(fetchURL, { signal: controller.signal });
                    clearTimeout(id);
                    if (res.ok) return await res.json();
                } else {
                    const res = await Promise.race([
                        fetch(fetchURL),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SPONSORBLOCK_CONFIG.timeout))
                    ]);
                    if (res.ok) return await res.json();
                }
            } catch(e) {
                if (!this.isDestroyed && e.name !== 'AbortError') {
                    this.log('warn', 'Fetch attempt failed:', e.message);
                }
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
        this.isDestroyed = true;
        this.log('info', 'Destroying instance.');
        
        this.rafIds.forEach(id => cancelAnimationFrame(id));
        this.rafIds.clear();

        this.stopHighFreqLoop();
        
        if (this.unmuteTimeoutId) {
            clearTimeout(this.unmuteTimeoutId);
            this.unmuteTimeoutId = null;
        }
        
        if (this.wasMutedBySB && this.video) {
            this.video.muted = false;
        }
        window.__sb_pending_unmute = false;
        
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        
        sponsorBlockUI.togglePopup(false); 
        sponsorBlockUI.updateSegments([]);
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        const style = document.getElementById('sb-css');
        if (style) style.remove();
        
        this.listeners.forEach((events, elem) => {
            events.forEach((handler, type) => elem.removeEventListener(type, handler));
        });
        this.listeners.clear();

        this.observers.forEach(obs => obs.disconnect());
        this.observers.clear();

        this.configListeners.forEach(({ key, callback }) => {
            configRemoveChangeListener(key, callback);
        });
        this.configListeners = [];
        
        this.segments = [];
        this.skipSegments = [];
        this.video = null;
        this.progressBar = null;
    }
}

// Global Initialization Logic
if (typeof window !== 'undefined') {
    if (window.__ytaf_sb_init) {
        window.removeEventListener('hashchange', window.__ytaf_sb_init);
    }

    window.sponsorblock = null;
    let initTimeout = null;

    const initSB = () => {
        if (initTimeout) clearTimeout(initTimeout);
        
        const run = () => {
            if (window.sponsorblock) window.sponsorblock.destroy();
            let videoID = null;
            try {
                const hash = window.location.hash;
                if (hash.startsWith('#')) {
                    const parts = hash.split('?');
                    if (parts.length > 1) {
                        if (typeof URLSearchParams !== 'undefined') {
                            const params = new URLSearchParams(parts[1]);
                            videoID = params.get('v');
                        } else {
                            const match = parts[1].match(/(?:[?&]|^)v=([^&]+)/);
                            if (match) videoID = match[1];
                        }
                    }
                }
            } catch(e) {}

            if (videoID && configRead('enableSponsorBlock')) {
                window.sponsorblock = new SponsorBlockHandler(videoID);
                window.sponsorblock.init();
            }
            initTimeout = null;
        };

        initTimeout = setTimeout(run, 10);
    };

    window.__ytaf_sb_init = initSB;
    window.addEventListener('hashchange', initSB);

    if (document.readyState === 'complete') {
        setTimeout(initSB, 500);
    } else {
        window.addEventListener('load', () => setTimeout(initSB, 500), { once: true });
    }
}