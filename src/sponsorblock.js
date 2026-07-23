import sha256 from 'tiny-sha256';
import { configAddChangeListener, configRemoveChangeListener, segmentTypes, configGetAll } from './config';
import { showNotification } from './notifications.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { isLegacyWebOS } from './webos-utils.js';
import './sponsorblock.css';

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

const EXTRA_CONFIG_KEYS = [
    'enableMutedSegments', 'sbMode_highlight', 'skipSegmentsOnce',
    // Color keys so the overlay redraws when the user changes a segment color
    ...Object.keys(segmentTypes).map(k => `${k}Color`)
];

const CHAIN_SKIP_CONSTANTS = {
    START_THRESHOLD: 0.5,
    OVERLAP_TOLERANCE: 0.2,
    MIN_PLAYBACK_TIME: 0.1
};

const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';

class SponsorBlockHandler {
    constructor(videoID) {
        this.videoID = videoID;
        this.logPrefix = `[SB:${this.videoID}]`;
        
        this.segments = [];
        this.highlightSegment = null;
        this.video = null;
        this.progressBar = null;
        this.overlay = null;
        this.activeBarSelector = null;
        
        this.debugMode = false;
        
        this.isLegacyWebOSVer = isLegacyWebOS();

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
        this.isDestroyed = false;
        this.skippedSegmentIndices = new Set();
        this.tempWhitelistIndex = -1; // Whitelist segment when using shortcut

        // Manual skip tracking
        this.activeManualNotification = null;
        this.currentManualSegment = null;

        // Listeners & Observers
        this.observers = new Set();
        this.listeners = new Map();
        this.configListeners = [];
        this.rafIds = new Set();

        this.abortController = null;

        // High Frequency Polling
        this.pollingRafId = null;
        this.boundHighFreqLoop = this.highFreqLoop.bind(this);

        this.isTimeListenerActive = false;
        this.boundTimeUpdate = this.handleTimeUpdate.bind(this);

        this.lastOverlayHash = null;

        // Cached _getProgressBarAnchor() result, keyed on progressBar identity.
        this._anchorCache = null;
        this._anchorCacheBar = null;

        this.setupConfigListeners();

        this.log('info', `Created handler for ${this.videoID}`);
    }

    // ==========================================
    // WebOS 3 DOM Helper Methods
    // ==========================================

    _isNodeConnected(node) {
        if (!node) return false;
        return node.isConnected !== undefined ? node.isConnected : document.body.contains(node);
    }

    _getClosest(el, selector) {
        if (!el || el.nodeType !== 1) return null;
        if (el.closest) return el.closest(selector);
        
        const matches = el.matches || el.webkitMatchesSelector || el.mozMatchesSelector || el.msMatchesSelector;
        let current = el;
        while (current && current.nodeType === 1) {
            if (matches && matches.call(current, selector)) return current;
            current = current.parentNode;
        }
        return null;
    }

    _getProgressBarAnchor() {
        if (!this.progressBar) return { container: null, asSibling: false };

        if (this._anchorCache && this._anchorCacheBar === this.progressBar) {
            return this._anchorCache;
        }

        // ALWAYS inject as a sibling. YouTube's virtual DOM destroys foreign children.
        const ytPB = this._getClosest(this.progressBar, 'ytlr-multi-markers-player-bar-renderer') ||
                     this._getClosest(this.progressBar, 'ytlr-progress-bar') || 
                     this.progressBar;
                     
        const parent = ytPB.parentNode;
        let result;

        if (!parent) {
            result = { container: this.progressBar, asSibling: false };
        } else {
            const ps = window.getComputedStyle(parent);
            if (ps.position === 'static') parent.style.setProperty('position', 'relative', 'important');
            if (ps.display === 'inline' || ps.display === '') {
                parent.style.setProperty('display', 'block', 'important');
            }
            result = { container: ytPB, asSibling: true };
        }

        this._anchorCache = result;
        this._anchorCacheBar = this.progressBar;
        return result;
    }

    // Copies ytlr-progress-bar's offset rect onto the sibling overlay so they
    // occupy exactly the same visual space.
    // Positions the sibling overlay to exactly cover the inner progress track element
    _offsetRelativeTo(el, ancestor) {
        if (!el || !ancestor) return { top: 0, left: 0 };
        // getBoundingClientRect gives the exact pixel coordinates relative to the viewport
        const rectEl = el.getBoundingClientRect();
        const rectAncestor = ancestor.getBoundingClientRect();
        return {
            top: rectEl.top - rectAncestor.top,
            left: rectEl.left - rectAncestor.left
        };
    }

    _syncOverlayPosition(ytPB) {
        if (!this.overlay || !ytPB) return;
        const parent = ytPB.parentNode;
        if (!parent) return;

        // Use the inner slider element for precise height/position.
        // Fall back to ytPB itself only if progressBar is the same node or unset.
        const trackEl = (this.progressBar && this.progressBar !== ytPB)
            ? this.progressBar
            : ytPB;

        const ov = this.overlay;
        function set(prop, val) { ov.style.setProperty(prop, val, 'important'); }

        // Sync visibility to mirror YouTube's UI state. classList.contains and
        // the inline-style read are both recalc-free, unlike the previous
        // getComputedStyle(ytPB).opacity poll; the inline check still catches UI
        // builds that hide via inline opacity without the zylon-hidden class.
        const isHidden = ytPB.classList.contains('zylon-hidden') || ytPB.style.opacity === '0';
        set('opacity', isHidden ? '0' : '1');

        const pos = this._offsetRelativeTo(trackEl, parent);
        set('top',    pos.top  + 'px');
        set('left',   pos.left + 'px');
        set('width',  trackEl.offsetWidth  + 'px');
        set('height', trackEl.offsetHeight + 'px');
    }

    // ==========================================
    // Core Engine
    // ==========================================

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
        console[level === 'warn' ? 'warn' : 'log'](this.logPrefix, message, ...args);
    }

    rebuildSkipSegments() {
        this.stopHighFreqLoop();

        if (!this.segments || this.segments.length === 0 || this.activeCategories.size === 0) {
            this.skipSegments = [];
            this.resetSegmentTracking();
            return;
        }

        this.skipSegments = [];
        const config = configGetAll();

        const len = this.segments.length;
        for (let i = 0; i < len; i++) {
            const seg = this.segments[i];

            if (seg.category === 'poi_highlight') continue;

            const mode = config[CONFIG_MAPPING[seg.category]];
            if (!mode || mode === 'disable' || mode === 'seek_bar') continue;
            if (seg.actionType && seg.actionType !== 'skip') continue;

            this.skipSegments.push({
                start: seg.segment[0],
                end: seg.segment[1],
                category: seg.category,
                categoryName: this.getCategoryName(seg.category),
                mode: mode,
                originalIndex: i
            });
        }
        this.resetSegmentTracking();
    }

    toggleTimeListener(enable) {
        if (!this.video) return;

        if (enable) {
            if (this.video.paused) return;

            if (!this.isTimeListenerActive) {
                this.video.addEventListener('timeupdate', this.boundTimeUpdate);
                this.isTimeListenerActive = true;
                this.log('debug', 'Time listener attached');
            }
        } else if (this.isTimeListenerActive) {
                this.video.removeEventListener('timeupdate', this.boundTimeUpdate);
                this.isTimeListenerActive = false;
                this.log('debug', 'Time listener detached');
        }
    }

    resetSegmentTracking() {
        // Default state
        this.nextSegmentIndex = 0;
        this.nextSegmentStart = this.skipSegments.length > 0 ? this.skipSegments[0].start : Infinity;

        // Find the first segment that starts AFTER the current time, or contains current time.
        if (this.video && !isNaN(this.video.currentTime) && this.skipSegments.length > 0) {
            const time = this.video.currentTime;
            
            // Check if we are currently inside a segment
            const currentIdx = this.findSegmentAtTime(time);
            
            if (currentIdx !== -1) {
                this.nextSegmentIndex = currentIdx;
                this.nextSegmentStart = this.skipSegments[currentIdx].start;
            } else {
                // Not in a segment, find the next one
                this.nextSegmentIndex = this.findNextSegmentIndex(time);
                if (this.nextSegmentIndex < this.skipSegments.length) {
                    this.nextSegmentStart = this.skipSegments[this.nextSegmentIndex].start;
                } else {
                    this.nextSegmentStart = Infinity;
                }
            }
        }

        this.clearManualNotification();
        this.toggleTimeListener(this.nextSegmentStart !== Infinity);
    }

    clearManualNotification() {
        if (this.activeManualNotification) {
            this.activeManualNotification.remove();
            this.activeManualNotification = null;
        }
        this.currentManualSegment = null;
    }

    // O(log N) - Finds segment containing time
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

    // O(log N) - Finds first segment starting after or at time
    findNextSegmentIndex(time) {
        let left = 0;
        let right = this.skipSegments.length - 1;
        let res = this.skipSegments.length;

        while (left <= right) {
            const mid = (left + right) >>> 1;
            if (this.skipSegments[mid].start >= time) {
                res = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        return res;
    }

    setupConfigListeners() {
        this.boundConfigUpdate = () => {
            this.activeCategories.clear();
            const config = configGetAll();
            for (const [cat, configKey] of Object.entries(CONFIG_MAPPING)) {
                if (config[configKey] !== 'disable') this.activeCategories.add(cat);
            }
            this.rebuildSkipSegments();
            this.drawOverlay();
        };
        
        const configKeys = [...Object.values(CONFIG_MAPPING), ...EXTRA_CONFIG_KEYS];

        for (const key of configKeys) {
            configAddChangeListener(key, this.boundConfigUpdate);
            this.configListeners.push({ key, callback: this.boundConfigUpdate });
        }
        
        // Initial setup run
        this.boundConfigUpdate();
    }

    buildSkipChain(segments) {
        if (!segments || segments.length === 0) return null;

        // Find the first auto_skip segment that starts at the beginning
        let firstSegIdx = -1;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].start < CHAIN_SKIP_CONSTANTS.START_THRESHOLD) {
                if (segments[i].mode === 'auto_skip') {
                    firstSegIdx = i;
                    break;
                } else {
                    // If the very first segment is a manual skip at 0.0s, we shouldn't chain auto skips
                    return null;
                }
            } else {
                break;
            }
        }
        
        if (firstSegIdx === -1) return null;

        const firstSeg = segments[firstSegIdx];
        let finalSeekTime = firstSeg.end;
        const chainParts = [`${firstSeg.category}[${firstSeg.start.toFixed(1)}s-${firstSeg.end.toFixed(1)}s]`];

        for (let i = firstSegIdx + 1; i < segments.length; i++) {
            const current = segments[i];

            // If we hit a manual_skip that starts before our chain ends, truncate the chain
            if (current.mode !== 'auto_skip') {
                if (current.start <= finalSeekTime) {
                    finalSeekTime = Math.min(finalSeekTime, current.start);
                    break;
                }
                continue; 
            }

            const gapToNext = current.start - finalSeekTime;
            if (gapToNext > CHAIN_SKIP_CONSTANTS.OVERLAP_TOLERANCE) break;

            if (current.end > finalSeekTime) {
                chainParts.push(`${current.category}[${current.start.toFixed(1)}s-${current.end.toFixed(1)}s]`);
                finalSeekTime = current.end;
            }
        }

        if (chainParts.length === 1 && finalSeekTime - firstSeg.start < 1) return null;

        return {
            endTime: finalSeekTime,
            chainDescription: chainParts.join(' → ')
        };
    }

    executeChainSkip(video) {
        if (!video || this.hasPerformedChainSkip || this.isDestroyed) return false;

        if (video.readyState === 0) {
            if (this.boundChainSkipRetry && this.chainSkipVideo) {
                this.chainSkipVideo.removeEventListener('loadedmetadata', this.boundChainSkipRetry);
            }
            this.chainSkipVideo = video;
            this.boundChainSkipRetry = () => {
                video.removeEventListener('loadedmetadata', this.boundChainSkipRetry);
                this.boundChainSkipRetry = null;
                this.chainSkipVideo = null;
                if (!this.isDestroyed) this.executeChainSkip(video);
            };
            video.addEventListener('loadedmetadata', this.boundChainSkipRetry);
            return false;
        }

        if (video.currentTime > CHAIN_SKIP_CONSTANTS.START_THRESHOLD) return false;

        // Use this.skipSegments instead of filtering out manual skips so buildSkipChain can evaluate them
        if (this.skipSegments.length === 0) return false;

        const chain = this.buildSkipChain(this.skipSegments);
        if (!chain) return false;
        if (chain.endTime >= video.duration) return false;

        this.log('info', `Executing chain skip: ${chain.chainDescription}`);

        video.currentTime = chain.endTime;
        this.lastSkipTime = chain.endTime;
        this.hasPerformedChainSkip = true;
        
        // Mark all auto_skip segments that were successfully bypassed as skipped
        this.skipSegments.forEach(seg => {
            if (seg.mode === 'auto_skip' && seg.start < chain.endTime && seg.end <= chain.endTime + 0.1) {
                this.skippedSegmentIndices.add(seg.originalIndex);
            }
        });

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
        if (!this.videoID || this.isDestroyed) return;

        this.start();

        const initVideoID = this.videoID;
        sponsorBlockUI.updateSegments([]);

        const hash = sha256(this.videoID);
        if (!hash) return;
        const hashPrefix = hash.substring(0, 4);

        try {
            const data = await this.fetchSegments(hashPrefix);
            if (this.isDestroyed || this.videoID !== initVideoID) return;
            const videoData = Array.isArray(data) ? data.find(x => x.videoID === this.videoID) : data;

            if (!videoData || !videoData.segments || videoData.segments.length === 0) {
                this.log('debug', 'No SponsorBlock segments available, cleaning up');
                this.destroy(); 
                return;
            }

            // sort in place is fine
            this.segments = videoData.segments.sort((a, b) => a.segment[0] - b.segment[0]);
            this.highlightSegment = this.segments.find(s => s.category === 'poi_highlight');

            // Use 'this.video' if start() already found it, or re-query
            const video = this.video || document.querySelector('video');
            if (video && video.duration && !isNaN(video.duration)) {
                this.processSegments(video.duration);
            }

            this.rebuildSkipSegments();

            if (video) {
                this.executeChainSkip(video);
            }

            // UI was already started, so now we just update the data
            sponsorBlockUI.updateSegments(this.segments);
            
            // Explicitly draw overlay now that data is ready
            // (checkForProgressBar might have run when segments were empty)
            this.drawOverlay();

            if (this.highlightSegment) {
                const config = configGetAll();
                const hlMode = config.sbMode_highlight;
                if (hlMode === 'auto_skip') {
                    this.jumpToNextHighlight();
                } else if (hlMode === 'ask') {
                    showNotification('Highlight available: Press Blue to jump');
                }
            }
        } catch (e) {
            if (!this.isDestroyed) {
                showNotification('SB Error: ' + e.message);
                this.log('warn', 'Fetch failed', e);
            }
        }
    }

    start() {
        this.video = document.querySelector('video');
        if (!this.video) return;

        // CSS is loaded via static import (./sponsorblock.css) — no runtime
        // <style> injection needed.
        this.resetSegmentTracking();

        this.boundStateChange = (e) => {
            const state = e.detail.state;
            
            if (state === 0) { // ENDED
                this.hasPerformedChainSkip = false;
                this.toggleTimeListener(false);
            } else if (state === 1) { // PLAYING
                // Check for progress bar existence on play in case UI was destroyed (e.g. after side-panel interaction)
                this.checkForProgressBar();
                // Re-evaluate tracking (re-enables time listener if needed)
                this.resetSegmentTracking();
                this.hasPerformedChainSkip = false;
                this.executeChainSkip(this.video);
            } else if (state === 2) { // PAUSED
                this.stopHighFreqLoop();
                this.toggleTimeListener(false);
            }
        };
        
        window.addEventListener('yt-player-state-change', this.boundStateChange);

        // Resize forces an immediate overlay re-sync (bypassing the timeupdate throttle).
        this.boundResize = () => {
            this._lastSyncTime = 0;
            if (this.overlay && this.progressBar && !this.isDestroyed) {
                const { container, asSibling } = this._getProgressBarAnchor();
                if (asSibling && container) this._syncOverlayPosition(container);
            }
        };
        window.addEventListener('resize', this.boundResize);

        this.addEvent(this.video, 'seeked', () => {
            if (this.isDestroyed) return;
            this.stopHighFreqLoop();
            this.hasPerformedChainSkip = false;
            this.executeChainSkip(this.video);

            if (!this.isSkipping) {
                this.lastSkipTime = -1;
                this.lastSkippedSegmentIndex = -1;
                this.lastNotifiedSegmentIndex = -1;
                this.resetSegmentTracking();
                // Only handle time update immediately if not paused
                if (!this.video.paused) this.handleTimeUpdate(); 
            }
            this.isSkipping = false;
        });

        this.addEvent(this.video, 'durationchange', () => {
            if (this.video?.duration) {
                this.processSegments(this.video.duration);
                this.drawOverlay();
            }
        });

        if (this.video.duration) this.processSegments(this.video.duration);

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
            // Observe parent to catch if the bar itself is destroyed/recreated by the framework
            const observeTarget = targetNode.parentNode || targetNode;
            this.log('info', 'Attaching optimized observer to:', observeTarget.tagName);
            
            this.domObserver = new MutationObserver((mutations) => {
                if (this.isProcessing || this.isDestroyed) return;

                let shouldCheck = false;
                for (const m of mutations) {
                    if (m.type === 'attributes') {
                        if (m.target === this.progressBar) shouldCheck = true;
                    } else if (m.type === 'childList') {
                        // If observing parent, childList changes mean the bar might be replaced
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

            this.domObserver.observe(observeTarget, {
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

        // Check if both the overlay AND the tracked progress bar are ACTUALLY in the DOM
        if (this.overlay && this._isNodeConnected(this.overlay) &&
            this.progressBar && this._isNodeConnected(this.progressBar)) {
            
            // Ensure the sibling overlay syncs visibility when attributes mutate
            const { container, asSibling } = this._getProgressBarAnchor();
            if (asSibling && container) {
                this._syncOverlayPosition(container);
            }
            return;
        }

        // If the overlay was orphaned or wiped, clear it so drawOverlay creates a fresh one
        if (this.overlay && !this._isNodeConnected(this.overlay)) {
            this.overlay.remove();
            this.overlay = null;
        }

        let target = null;

        // Try the cached selector first
        if (this.activeBarSelector) {
            target = document.querySelector(this.activeBarSelector);
        }

        // Iterate list only if cache missed
        if (!target) {
            const selectors = [
                'ytlr-multi-markers-player-bar-renderer [idomkey="segment"]',
                'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
                'ytlr-multi-markers-player-bar-renderer',
                'ytlr-progress-bar [idomkey="slider"]',
                '.ytLrProgressBarSliderBase',
                '.afTAdb'
            ];

            for (const selector of selectors) {
                target = document.querySelector(selector);
                if (target) {
                    this.activeBarSelector = selector;
                    break;
                }
            }
        }

        if (target) {
            this.progressBar = target;
            // Bar (re)acquired — drop the cached anchor so _getProgressBarAnchor
            // recomputes the positioning context for the new element.
            this._anchorCache = null;
            this._anchorCacheBar = null;
            
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

        const config = configGetAll();
        // Include a signature of every segment color so changing a color
        // mid-video invalidates the hash and forces a redraw (§5b fix).
        let colorSig = '';
        for (const k in segmentTypes) colorSig += config[`${k}Color`] || '';
        const overlayHash = `${duration}_${this.activeCategories.size}_${this.segments.length}_${config.sbMode_highlight}_${colorSig}`;
        if (overlayHash === this.lastOverlayHash && this.overlay && this._isNodeConnected(this.overlay)) {
            return;
        }
        this.lastOverlayHash = overlayHash;

        if (this.overlay) this.overlay.remove();

        const fragment = document.createDocumentFragment();
        const highlightMode = config.sbMode_highlight;

        const len = this.segments.length;
        for (let i = 0; i < len; i++) {
            const segment = this.segments[i];
            const isHighlight = segment.category === 'poi_highlight';

            if (isHighlight) {
                if (!highlightMode || highlightMode === 'disable') continue;
            } else {
                const mode = config[CONFIG_MAPPING[segment.category]];
                if (!mode || mode === 'disable') continue;
            }

            const [start, end] = segment.segment;
            const div = document.createElement('div');

            const colorKey = isHighlight ? 'poi_highlightColor' : `${segment.category}Color`;
            const color = config[colorKey] || segmentTypes[segment.category]?.color || '#00d400';

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
        }

        this.overlay = document.createElement('div');
        this.overlay.id = 'previewbar';
        this.overlay.appendChild(fragment);

        const { container, asSibling } = this._getProgressBarAnchor();
        if (asSibling) {
            // insertAdjacentElement('afterend') requires Chrome 41+, not available on
            // WebOS 3 (Chrome 38). Use insertBefore with nextSibling instead.
            const nextSib = container.nextSibling;
            if (nextSib) {
                container.parentNode.insertBefore(this.overlay, nextSib);
            } else {
                container.parentNode.appendChild(this.overlay);
            }
            this._syncOverlayPosition(container);
        } else {
            container.appendChild(this.overlay);
        }
    }

    processSegments(duration) {
        if (!duration || isNaN(duration)) return;

        let changed = false;
        for (const segment of this.segments) {
            if (segment.segment[1] > duration) {
                segment.segment[1] = duration;
                changed = true;
            }
            if (this.isLegacyWebOSVer && segment.segment[1] >= duration - 0.5) {
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

        // Only process time update if we are close to the target
        if (this.video.currentTime >= this.nextSegmentStart) {
            this.handleTimeUpdate();
            this.stopHighFreqLoop();
        } else {
            this.pollingRafId = requestAnimationFrame(this.boundHighFreqLoop);
        }
    }

    handleTimeUpdate() {
        if (this.isSkipping) return;

        // Sync overlay layout at most every 500ms — timeupdate fires ~4Hz and the
        // viewport rarely changes, so the previous unconditional sync wasted two
        // getBoundingClientRect() calls + DOM writes per frame on webOS 3.
        if (this.overlay && this.progressBar) {
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            if (!this._lastSyncTime || now - this._lastSyncTime > 500) {
                const { container, asSibling } = this._getProgressBarAnchor();
                if (asSibling && container) {
                    this._syncOverlayPosition(container);
                }
                this._lastSyncTime = now;
            }
        }

        if (this.skipSegments.length === 0) {
            this.toggleTimeListener(false);
            return;
        }
        if (this.isDestroyed || !this.video || this.video.seeking || this.video.readyState === 0) return;

        const currentTime = this.video.currentTime;

        if (this.currentManualSegment) {
            if (currentTime < this.currentManualSegment.start || currentTime >= this.currentManualSegment.end) {
                this.clearManualNotification();
            }
        }

        // Trust nextSegmentStart to avoid unnecessary searches
        const timeToNext = this.nextSegmentStart - currentTime;

		// Removed sleep timer due to possible bugs with buffering/frame drops
        // if (timeToNext > 3.0 && !this.currentManualSegment) {
            // const sleepTime = timeToNext - 1.0;
            // if (sleepTime > 1.0) {
                // this.toggleTimeListener(false);
                // this.longDistanceTimer = setTimeout(() => {
                    // this.longDistanceTimer = null;
                    // this.toggleTimeListener(true);
                // }, sleepTime * 1000);
                // return;
            // }
        // }

        if (timeToNext > 0 && !this.currentManualSegment) {
            if (timeToNext < 1.0 && !this.pollingRafId) {
                this.startHighFreqLoop();
            }
            // Early exit if we are not yet at the segment start
            return;
        }

        // Check the predicted segment index first (O(1)) before Binary Search (O(log N))
        let segmentIdx = -1;
        const expectedSeg = this.skipSegments[this.nextSegmentIndex];

        if (expectedSeg && currentTime >= expectedSeg.start) {
			// Only apply the 1.5s frame drop gap to auto_skip segments
			const isAutoSkip = expectedSeg.mode === 'auto_skip';
			if (currentTime < expectedSeg.end || (isAutoSkip && (currentTime - expectedSeg.end) < 1.5)) {
				segmentIdx = this.nextSegmentIndex;
			} else {
				// Fallback to Binary Search
				segmentIdx = this.findSegmentAtTime(currentTime);
			}
		}

        if (segmentIdx === -1) {
            // We aren't in a segment. Since resetSegmentTracking was correct, 
            // and we checked timeToNext, we are just between segments or past the last one.
            
            // Re-sync next segment just in case (e.g. slight drift)
            if (currentTime >= this.nextSegmentStart) {
                 this.nextSegmentIndex = this.findNextSegmentIndex(currentTime);
                 if (this.nextSegmentIndex < this.skipSegments.length) {
                     this.nextSegmentStart = this.skipSegments[this.nextSegmentIndex].start;
                 } else {
                     this.nextSegmentStart = Infinity;
                     this.toggleTimeListener(false);
                 }
            }
            this.tempWhitelistIndex = -1;
            return;
        }

        // We are inside a segment
        const seg = this.skipSegments[segmentIdx];
        
        if (this.tempWhitelistIndex !== -1 && seg.originalIndex !== this.tempWhitelistIndex) {
            this.tempWhitelistIndex = -1;
        }

        if (seg.mode === 'manual_skip') {
            if (this.currentManualSegment !== seg) {
                this.currentManualSegment = seg;
                const categoryName = seg.categoryName;
                const title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

                if (this.activeManualNotification) this.activeManualNotification.remove();
                this.activeManualNotification = showNotification(`${title}: Press Blue to skip`, 0);
            }
            return;
        }

        if (seg.mode !== 'auto_skip') {
            if (segmentIdx !== this.lastNotifiedSegmentIndex) {
                this.lastNotifiedSegmentIndex = segmentIdx;
                const categoryName = seg.categoryName;
                showNotification(`${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} segment`);
            }
            return;
        }
        
        if (seg.originalIndex === this.tempWhitelistIndex) {
            return;
        }

        const config = configGetAll();
        if (config.skipSegmentsOnce && this.skippedSegmentIndices.has(seg.originalIndex)) {
            return;
        }

        if (this.isLegacyWebOSVer &&
            segmentIdx === this.lastSkippedSegmentIndex &&
            this.video.duration - currentTime < 1.0) {
            return;
        }

        let jumpTarget = seg.end;
		const categoryName = seg.categoryName;
        const skippedCategories = [categoryName];
        const segmentsToMark = [seg.originalIndex];

        for (let i = segmentIdx + 1; i < this.skipSegments.length; i++) {
            const next = this.skipSegments[i];

            if (next.mode !== 'auto_skip') {
                if (next.start < jumpTarget) {
                    jumpTarget = next.start;
                }
                break;
            }
            if (next.start > jumpTarget + 0.2) break;

            jumpTarget = Math.max(jumpTarget, next.end);
            skippedCategories.push(next.categoryName);
            segmentsToMark.push(next.originalIndex);
        }

        if (segmentIdx === this.lastSkippedSegmentIndex && Math.abs(currentTime - this.lastSkipTime) < 0.1) {
            return;
        }

        this.isSkipping = true;
        this.lastSkipTime = currentTime;
        this.lastSkippedSegmentIndex = segmentIdx;
        
        segmentsToMark.forEach(idx => this.skippedSegmentIndices.add(idx));

        if (this.isLegacyWebOSVer) {
            const duration = this.video.duration;
            if (jumpTarget >= duration - 0.5) {
                jumpTarget = Math.max(0, duration - 0.25);
            }
        }

        // Prevents a micro-rewind if a frame drop caused us to overshoot the jump target
        this.video.currentTime = Math.max(jumpTarget, currentTime);

        if (!this.isLegacyWebOSVer) {
            const timeRemaining = this.video.duration - this.video.currentTime;
            if (timeRemaining > 0.5 && this.video.paused) {
                this.video.play();
            }
        }

        this.nextSegmentIndex = segmentIdx + 1;
        // Re-find next index properly via binary search just to be safe after a skip
        const targetSegIdx = this.findSegmentAtTime(jumpTarget);
        
        if (targetSegIdx !== -1) {
            // We landed exactly inside a manual segment (or another adjacent segment)
            this.nextSegmentIndex = targetSegIdx;
            this.nextSegmentStart = this.skipSegments[targetSegIdx].start;
        } else {
            // No immediate segment, look for the next upcoming one
            this.nextSegmentIndex = this.findNextSegmentIndex(jumpTarget);
            if (this.nextSegmentIndex < this.skipSegments.length) {
                this.nextSegmentStart = this.skipSegments[this.nextSegmentIndex].start;
            } else {
                this.nextSegmentStart = Infinity;
                this.toggleTimeListener(false);
            }
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

        const config = configGetAll();
        const mode = config.sbMode_highlight;
        if (!mode || mode === 'disable') return false;

        this.video.currentTime = this.highlightSegment.segment[0];
        this.requestAF(() => showNotification('Jumped to Highlight'));
        return true;
    }
    
    skipToPreviousSegment() {
    if (!this.video || !this.skipSegments.length) return false;

    const currentTime = this.video.currentTime;
    let targetSeg = null;

    for (let i = this.skipSegments.length - 1; i >= 0; i--) {
        if (this.skipSegments[i].start < currentTime - 2) {
            targetSeg = this.skipSegments[i];
            break;
        }
    }

    if (!targetSeg) return false;
    
    this.tempWhitelistIndex = targetSeg.originalIndex;
    this.video.currentTime = targetSeg.start;
    
    const categoryName = this.getCategoryName(targetSeg.category);
    const title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
    
    this.requestAF(() => showNotification(`Seeked to ${title}`));
    return true;
    }

    handleBlueButton() {
        if (this.currentManualSegment) {
            if (this.video) {
                this.isSkipping = true;
                this.lastSkipTime = this.video.currentTime;
                this.video.currentTime = this.currentManualSegment.end;

                this.clearManualNotification();

                this.requestAF(() => showNotification('Skipped Segment'));

                setTimeout(() => { this.isSkipping = false; }, 500);
                return true;
            }
        }

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
                // Do NOT send videoID with the hash-prefix endpoint — that
                // defeats the k-anonymity the prefix hashing provides. We
                // already select our video client-side via
                // data.find(x => x.videoID === this.videoID) in init().
                const fetchURL = `${url}/skipSegments/${hashPrefix}?categories=${encodeURIComponent(categories)}&actionTypes=${encodeURIComponent(actionTypes)}`;

                let res;
                if (HAS_ABORT_CONTROLLER) {
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

    addEvent(elem, type, handler) {
        if (!elem) return;
        elem.addEventListener(type, handler);
        if (!this.listeners.has(elem)) this.listeners.set(elem, new Map());
        this.listeners.get(elem).set(type, handler);
    }

    destroy() {
        this.isDestroyed = true;
        this.log('info', 'Destroying instance.');

        this.toggleTimeListener(false);
        
        if (this.boundStateChange) {
            window.removeEventListener('yt-player-state-change', this.boundStateChange);
            this.boundStateChange = null;
        }

        if (this.boundResize) {
            window.removeEventListener('resize', this.boundResize);
            this.boundResize = null;
        }

        this.rafIds.forEach(id => cancelAnimationFrame(id));
        this.rafIds.clear();
        this.stopHighFreqLoop();

        if (this.chainSkipVideo) {
            if (this.boundChainSkipRetry) {
                this.chainSkipVideo.removeEventListener('loadedmetadata', this.boundChainSkipRetry);
            }
        }
        this.boundChainSkipRetry = null;
        this.chainSkipVideo = null;

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

        // sponsorblock.css stays in the page (static import) — nothing to
        // remove. It only styles elements that exist while SB is active.

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
        this.tempWhitelistIndex = -1;

        if (this.skippedSegmentIndices) {
            this.skippedSegmentIndices.clear();
            this.skippedSegmentIndices = null;
        }
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

            const config = configGetAll();
            if (videoID && config.enableSponsorBlock) {
                window.sponsorblock = new SponsorBlockHandler(videoID);
                window.sponsorblock.init();
            }
            initTimeout = null;
        };

        initTimeout = setTimeout(run, 10);
    };

    window.__ytaf_sb_init = initSB;
    window.addEventListener('hashchange', initSB);

    if (document.readyState !== 'loading') {
        setTimeout(initSB, 500);
    } else {
        window.addEventListener('load', () => setTimeout(initSB, 500), { once: true });
    }
}