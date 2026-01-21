import sha256 from 'tiny-sha256';
import { configRead, configAddChangeListener, configRemoveChangeListener, segmentTypes } from './config';
import { showNotification } from './ui';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { WebOSVersion } from './webos-utils.js';

const SPONSORBLOCK_CONFIG = {
    primaryAPI: 'https://sponsorblock.inf.re/api',
    fallbackAPI: 'https://sponsor.ajay.app/api',
    timeout: 5000,
    retryAttempts: 2
};

const CONFIG_MAPPING = {
    sponsor: 'sbMode_sponsor',
    intro: 'sbMode_intro',
    outro: 'sbMode_outro',
    interaction: 'sbMode_interaction',
    selfpromo: 'sbMode_selfpromo',
    musicofftopic: 'sbMode_musicofftopic',
    preview: 'sbMode_preview',
    filler: 'sbMode_filler',
    hook: 'sbMode_hook'
};

const CHAIN_SKIP_CONSTANTS = {
    START_THRESHOLD: 0.5,
    OVERLAP_TOLERANCE: 0.2,
    UNMUTE_DELAY: 600,
    MIN_PLAYBACK_TIME: 0.1
};

class SponsorBlockHandler {
    constructor(videoID) {
        this.videoID = videoID;
        this.segments = [];
        this.highlightSegment = null;
        this.video = null;
        this.progressBar = null;
        this.overlay = null;
        this.debugMode = false;
        this.isLegacyWebOS = WebOSVersion() === 5;

        // Tracking state
        this.lastSkipTime = -1;
        this.lastSkippedSegmentIndex = -1;
		this.lastNotifiedSegmentIndex = -1;
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
        
        // Manual skip tracking
        this.activeManualNotification = null;
        this.currentManualSegment = null;

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

        this.configCache = {};
        this.lastOverlayHash = null;

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
        if ((level === 'debug' || level === 'info') && !this.debugMode) return;
        const prefix = `[SB:${this.videoID}]`;
        console[level === 'warn' ? 'warn' : 'log'](prefix, message, ...args);
    }

    updateConfigCache() {
        this.activeCategories.clear();
        this.configCache = {};

        for (const [cat, configKey] of Object.entries(CONFIG_MAPPING)) {
            const mode = configRead(configKey);
            this.configCache[cat] = mode;
            if (mode !== 'disable') {
                this.activeCategories.add(cat);
            }
        }

        this.configCache.enableMutedSegments = configRead('enableMutedSegments');
        this.configCache.sbMode_highlight = configRead('sbMode_highlight');

        this.rebuildSkipSegments();
    }

    rebuildSkipSegments() {
        this.stopHighFreqLoop();

        if (!this.segments || this.segments.length === 0 || this.activeCategories.size === 0) {
            this.skipSegments = [];
            this.resetSegmentTracking();
            return;
        }

        this.skipSegments = [];

        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];

            if (seg.category === 'poi_highlight') continue;
            
            const mode = this.configCache[seg.category];
            if (!mode || mode === 'disable' || mode === 'seek_bar') continue; // seek_bar only shows in overlay, doesn't need skip tracking
            if (seg.actionType && seg.actionType !== 'skip') continue;

            this.skipSegments.push({
                start: seg.segment[0],
                end: seg.segment[1],
                category: seg.category,
                mode: mode, // 'auto_skip' or 'manual_skip'
                originalIndex: i
            });
        }
        this.resetSegmentTracking();
    }

    resetSegmentTracking() {
        this.nextSegmentIndex = 0;
        this.nextSegmentStart = this.skipSegments.length > 0 ? this.skipSegments[0].start : Infinity;
        this.clearManualNotification();
    }
    
    clearManualNotification() {
        if (this.activeManualNotification) {
            this.activeManualNotification.remove();
            this.activeManualNotification = null;
        }
        this.currentManualSegment = null;
    }

    findSegmentAtTime(time) {
        if (this.skipSegments.length === 0) return -1;

        let left = 0;
        let right = this.skipSegments.length - 1;

        while (left <= right) {
            const mid = (left + right) >>> 1;
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
        const configKeys = [...Object.values(CONFIG_MAPPING), 'enableMutedSegments', 'sbMode_highlight'];

        for (const key of configKeys) {
            configAddChangeListener(key, this.boundConfigUpdate);
            this.configListeners.push({ key, callback: this.boundConfigUpdate });
        }
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

            if (gapToNext > CHAIN_SKIP_CONSTANTS.OVERLAP_TOLERANCE) break;

            if (current.segment[1] > finalSeekTime) {
                chainParts.push(`${current.category}[${current.segment[0].toFixed(1)}s-${current.segment[1].toFixed(1)}s]`);
                finalSeekTime = current.segment[1];
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
            s.category !== 'poi_highlight' && this.configCache[s.category] === 'auto_skip'
        );

        if (enabledSegs.length === 0) return false;

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
                .map(cat => this.getCategoryName(cat));

            showNotification(`Skipped ${categories.join(', ')}`);
        });

        return true;
    }

    getCategoryName(category) {
        return segmentTypes[category]?.name || category;
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

            if (!videoData?.segments?.length) return;

            this.segments = videoData.segments.sort((a, b) => a.segment[0] - b.segment[0]);
            this.highlightSegment = this.segments.find(s => s.category === 'poi_highlight');

            const video = document.querySelector('video');
            if (video && video.duration && !isNaN(video.duration)) {
                this.processSegments(video.duration);
            }

            this.rebuildSkipSegments();

            if (video) {
                this.executeChainSkip(video);
            }

            this.start();
            sponsorBlockUI.updateSegments(this.segments);
            
            // Highlight Logic: "Ask when video loads" or "Auto Skip to Start"
            if (this.highlightSegment) {
                const hlMode = this.configCache.sbMode_highlight;
                if (hlMode === 'auto_skip') {
                    this.jumpToNextHighlight();
                } else if (hlMode === 'ask') {
                    showNotification('Highlight available: Press Blue to jump');
                }
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

        this.addEvent(this.video, 'ended', () => {
            this.hasPerformedChainSkip = false;
        });

        this.addEvent(this.video, 'play', () => {
            if (this.video.currentTime < CHAIN_SKIP_CONSTANTS.START_THRESHOLD) {
                this.hasPerformedChainSkip = false;
                this.executeChainSkip(this.video);
            }
        });

        this.addEvent(this.video, 'seeked', () => {
            if (this.isDestroyed) return;

            this.stopHighFreqLoop();

            if (this.video.currentTime < CHAIN_SKIP_CONSTANTS.START_THRESHOLD) {
                this.hasPerformedChainSkip = false;
                this.executeChainSkip(this.video);
            }

            if (!this.isSkipping) {
                this.lastSkipTime = -1;
                this.lastSkippedSegmentIndex = -1;
				this.lastNotifiedSegmentIndex = -1;
                this.resetSegmentTracking();
                this.handleTimeUpdate();
            }

            this.isSkipping = false;
        });

        this.addEvent(this.video, 'durationchange', () => {
            if (this.video?.duration) {
                this.processSegments(this.video.duration);
                this.drawOverlay();
            }
        });

        if (this.video.duration) {
            this.processSegments(this.video.duration);
        }

        this.observePlayerUI();
        this.checkForProgressBar();
    }

    observePlayerUI() {
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.observers.delete(this.domObserver);
        }

        const OPTIMAL_SELECTOR = 'ytlr-progress-bar';

        const startOptimizedObserver = (targetNode) => {
            this.log('info', 'Attaching optimized observer to:', targetNode.tagName);
            this.domObserver = new MutationObserver((mutations) => {
                if (this.isProcessing || this.isDestroyed) return;

                let shouldCheck = false;
                for (const m of mutations) {
                    if (m.type === 'attributes') {
                        if (m.target === this.progressBar) shouldCheck = true;
                    } else {
                        shouldCheck = true;
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

            this.domObserver.observe(targetNode, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden']
            });
            this.observers.add(this.domObserver);
            this.checkForProgressBar();
        };

        const candidate = document.querySelector(OPTIMAL_SELECTOR);
        if (candidate) {
            startOptimizedObserver(candidate);
        } else {
            const root = document.querySelector('ytlr-app') || document.body;
            this.log('info', 'Waiting for optimized container:', OPTIMAL_SELECTOR);

            const finderObserver = new MutationObserver((mutations, obs) => {
                const found = document.querySelector(OPTIMAL_SELECTOR);
                if (found) {
                    obs.disconnect();
                    this.observers.delete(obs);
                    startOptimizedObserver(found);
                }
            });

            finderObserver.observe(root, { childList: true, subtree: true });
            this.observers.add(finderObserver);
        }
    }

    checkForProgressBar() {
        if (this.isDestroyed) return;
        if (this.overlay && document.body.contains(this.overlay) &&
            this.progressBar && document.body.contains(this.progressBar)) {
            return;
        }

        const selectors = [
            'ytlr-multi-markers-player-bar-renderer [idomkey="segment"]',
            'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
            'ytlr-multi-markers-player-bar-renderer',
            'ytlr-progress-bar [idomkey="slider"]',
            '.ytLrProgressBarSliderBase',
            '.afTAdb'
        ];

        let target = null;
        for (const selector of selectors) {
            target = document.querySelector(selector);
            if (target) break;
        }

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

        const overlayHash = `${duration}_${this.activeCategories.size}_${this.segments.length}_${this.configCache.sbMode_highlight}`;
        if (overlayHash === this.lastOverlayHash && this.overlay && document.body.contains(this.overlay)) {
            return;
        }
        this.lastOverlayHash = overlayHash;

        if (this.overlay) this.overlay.remove();

        const fragment = document.createDocumentFragment();
        const highlightMode = this.configCache.sbMode_highlight;

        this.segments.forEach(segment => {
            const isHighlight = segment.category === 'poi_highlight';

            if (isHighlight) {
                if (!highlightMode || highlightMode === 'disable') return;
            } else {
                const mode = this.configCache[segment.category];
                if (!mode || mode === 'disable') return;
            }

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

    // Combined loop for clamping duration and WebOS Legacy fix
    processSegments(duration) {
        if (!duration || isNaN(duration)) return;

        let changed = false;
        for (const segment of this.segments) {
            // General Clamp
            if (segment.segment[1] > duration) {
                segment.segment[1] = duration;
                changed = true;
            }
            // WebOS Legacy Fix
            if (this.isLegacyWebOS && segment.segment[1] >= duration - 0.5) {
                segment.segment[1] = Math.max(0, duration - 0.30);
                changed = true;
            }
        }

        if (changed) {
            this.rebuildSkipSegments();
        }
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
        if (this.skipSegments.length === 0) return;
        if (this.isDestroyed || !this.video || this.video.seeking || this.video.readyState === 0) return;

        const currentTime = this.video.currentTime;
        
        // Handle Manual Skip Notification Lifecycle
        if (this.currentManualSegment) {
            if (currentTime < this.currentManualSegment.start || currentTime >= this.currentManualSegment.end) {
                // Exited the manual segment
                this.clearManualNotification();
            }
        }
        
        const timeToNext = this.nextSegmentStart - currentTime;

        // If we aren't near the next known start time, don't check
        if (timeToNext > 0 && !this.currentManualSegment) {
            if (timeToNext < 1.0 && !this.pollingRafId) {
                this.startHighFreqLoop();
            }
            return;
        }

        const segmentIdx = this.findSegmentAtTime(currentTime);

        if (segmentIdx === -1) {
            // We missed it or sought past it, find the next one linearly from current pos
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
        
        if (seg.mode === 'manual_skip') {
            if (this.currentManualSegment !== seg) {
                // Entered new manual segment
                this.currentManualSegment = seg;
                const categoryName = this.getCategoryName(seg.category);
                const title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
                
                // Show persistent notification (0 duration)
                if (this.activeManualNotification) this.activeManualNotification.remove();
                this.activeManualNotification = showNotification(`${title}: Press Blue to skip`, 0);
            }
            return;
        }
        
        if (seg.mode !== 'auto_skip') {
             if (segmentIdx !== this.lastNotifiedSegmentIndex) {
                this.lastNotifiedSegmentIndex = segmentIdx;
                const categoryName = this.getCategoryName(seg.category);
                showNotification(`${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} segment`);
            }
            return;
        }

        // Guard against spam loop on WebOS 3/4/5 at the end of video
        if (this.isLegacyWebOS &&
            segmentIdx === this.lastSkippedSegmentIndex &&
            this.video.duration - currentTime < 1.0) {
            return;
        }

        let jumpTarget = seg.end;
        const skippedCategories = [this.getCategoryName(seg.category)];

        // Chain multiple segments if they are adjacent
        for (let i = segmentIdx + 1; i < this.skipSegments.length; i++) {
            const next = this.skipSegments[i];
            
            // Only chain if next is also auto_skip
            if (next.mode !== 'auto_skip') break;
            
            if (next.start > jumpTarget + 0.2) break;

            jumpTarget = Math.max(jumpTarget, next.end);
            skippedCategories.push(this.getCategoryName(next.category));
        }

        if (segmentIdx === this.lastSkippedSegmentIndex && Math.abs(currentTime - this.lastSkipTime) < 0.1) {
            return;
        }

        this.isSkipping = true;
        this.lastSkipTime = currentTime;
        this.lastSkippedSegmentIndex = segmentIdx;

        // Legacy mute logic
        if (this.isLegacyWebOS) {
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

        if (!this.isLegacyWebOS) {
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
            const formattedName = uniqueNames.length === 1 ?
                uniqueNames[0] :
                uniqueNames.length === 2 ?
                `${uniqueNames[0]} and ${uniqueNames[1]}` :
                `${uniqueNames.slice(0, -1).join(', ')}, and ${uniqueNames[uniqueNames.length - 1]}`;

            showNotification(`Skipped ${formattedName} segment`);
        });

        this.log('info', `Skipped to ${jumpTarget}`);
    }

    jumpToNextHighlight() {
        if (!this.video || !this.highlightSegment) return false;
        
        const mode = this.configCache.sbMode_highlight;
        if (!mode || mode === 'disable') return false;
        
        this.video.currentTime = this.highlightSegment.segment[0];
        this.requestAF(() => showNotification('Jumped to Highlight'));
        return true;
    }
    
    handleBlueButton() {
        // Priority 1: Manual Skip of current segment
        if (this.currentManualSegment) {
            if (this.video) {
                this.isSkipping = true;
                this.lastSkipTime = this.video.currentTime;
                this.video.currentTime = this.currentManualSegment.end;
                
                // Reset manual tracking immediately
                this.clearManualNotification();
                
                this.requestAF(() => showNotification('Skipped Segment'));
                
                // Allow time update to resume normally
                setTimeout(() => { this.isSkipping = false; }, 500);
                return true;
            }
        }
        
        // Priority 2: Jump to Highlight
        return this.jumpToNextHighlight();
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
                const hasAbortController = typeof AbortController !== 'undefined';
                
                let res;
                if (hasAbortController) {
                    this.abortController = new AbortController();
                    const timeoutId = setTimeout(() => this.abortController.abort(), SPONSORBLOCK_CONFIG.timeout);
                    try {
                        res = await fetch(fetchURL, { signal: this.abortController.signal });
                    } finally {
                        clearTimeout(timeoutId);
                    }
                } else {
                    res = await Promise.race([
                        fetch(fetchURL),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SPONSORBLOCK_CONFIG.timeout))
                    ]);
                }
                
                return res.ok ? await res.json() : null;
            } catch (e) {
                if (!this.isDestroyed && e.name !== 'AbortError') {
                    this.log('warn', 'Fetch attempt failed:', e.message);
                }
                return null;
            }
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
        
        this.clearManualNotification();

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

        this.configCache = {};
    }
}

if (typeof window !== 'undefined') {
    if (window.__ytaf_sb_init) {
        window.removeEventListener('hashchange', window.__ytaf_sb_init);
    }

    window.sponsorblock = null;
    let initTimeout = null;

    const initSB = () => {
        if (window.sponsorblock) {
            window.sponsorblock.destroy();
            window.sponsorblock = null;
        }
        if (initTimeout) clearTimeout(initTimeout);

        const run = () => {
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
            } catch (e) { /* ignore */ }

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