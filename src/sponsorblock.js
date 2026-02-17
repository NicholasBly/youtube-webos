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

const EXTRA_CONFIG_KEYS = ['enableMutedSegments', 'sbMode_highlight', 'skipSegmentsOnce'];

const CHAIN_SKIP_CONSTANTS = {
    START_THRESHOLD: 0.5,
    OVERLAP_TOLERANCE: 0.2,
    UNMUTE_DELAY: 600,
    MIN_PLAYBACK_TIME: 0.1
};

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
        this.unmuteTimeoutId = null;

        // High Frequency Polling
        this.pollingRafId = null;
        this.boundHighFreqLoop = this.highFreqLoop.bind(this);

        this.isTimeListenerActive = false;
        this.boundTimeUpdate = this.handleTimeUpdate.bind(this);
        this.longDistanceTimer = null;

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
        
        console[level === 'warn' ? 'warn' : 'log'](this.logPrefix, message, ...args);
    }

    updateConfigCache() {
		this.activeCategories.clear();
		this.configCache = {};

		for (const [cat, configKey] of Object.entries(CONFIG_MAPPING)) {
			const mode = configRead(configKey);
			this.configCache[cat] = mode;
			if (mode !== 'disable') this.activeCategories.add(cat);
		}

		EXTRA_CONFIG_KEYS.forEach(key => {
			this.configCache[key] = configRead(key);
		});

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

        const len = this.segments.length;
        for (let i = 0; i < len; i++) {
            const seg = this.segments[i];

            if (seg.category === 'poi_highlight') continue;

            const mode = this.configCache[seg.category];
            if (!mode || mode === 'disable' || mode === 'seek_bar') continue;
            if (seg.actionType && seg.actionType !== 'skip') continue;

            this.skipSegments.push({
                start: seg.segment[0],
                end: seg.segment[1],
                category: seg.category,
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
        } else {
            if (this.isTimeListenerActive) {
                this.video.removeEventListener('timeupdate', this.boundTimeUpdate);
                this.isTimeListenerActive = false;
				this.log('debug', 'Time listener detached');
            }
        }
    }

    clearLongDistanceTimer() {
        if (this.longDistanceTimer) {
            clearTimeout(this.longDistanceTimer);
            this.longDistanceTimer = null;
        }
    }

    resetSegmentTracking() {
        this.clearLongDistanceTimer();
        
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
            if (this.skipSegments[mid].start > time) {
                res = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        return res;
    }

    setupConfigListeners() {
		this.boundConfigUpdate = this.updateConfigCache.bind(this);
		
		const configKeys = [...Object.values(CONFIG_MAPPING), ...EXTRA_CONFIG_KEYS];

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
            // Clean up existing listener if exists to prevent dupe
            if (this.boundChainSkipRetry) {
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

        this.chainSkipVideo = video;
        this.boundChainSkipSeeked = () => {
            video.removeEventListener('seeked', this.boundChainSkipSeeked);
            this.boundChainSkipSeeked = null;
            this.chainSkipVideo = null;

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

        video.addEventListener('seeked', this.boundChainSkipSeeked);

        this.unmuteTimeoutId = setTimeout(() => {
            if (this.isDestroyed) return;

            if (this.boundChainSkipSeeked) {
                video.removeEventListener('seeked', this.boundChainSkipSeeked);
                this.boundChainSkipSeeked = null;
                this.chainSkipVideo = null;
            }

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
		
		enabledSegs.forEach(seg => {
            if (seg.segment[1] <= chain.endTime + 0.1) {
                const idx = this.segments.indexOf(seg);
                if (idx !== -1) this.skippedSegmentIndices.add(idx);
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
        if (window.__sb_pending_unmute) {
            const v = document.querySelector('video');
            if (v) v.muted = false;
            window.__sb_pending_unmute = false;
        }

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

            if (!videoData?.segments?.length) return;

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
        // Initial tracking setup
        this.resetSegmentTracking();

        this.addEvent(this.video, 'ended', () => {
            this.hasPerformedChainSkip = false;
            this.clearLongDistanceTimer();
            this.toggleTimeListener(false);
        });

        this.addEvent(this.video, 'play', () => {
            // Check for progress bar existence on play in case UI was destroyed (e.g. after side-panel interaction)
            this.checkForProgressBar();
            
            // Re-evaluate tracking (re-enables time listener if needed)
            this.resetSegmentTracking();

            this.hasPerformedChainSkip = false;
			this.executeChainSkip(this.video);
        });

        this.addEvent(this.video, 'pause', () => {
            this.stopHighFreqLoop();
            this.toggleTimeListener(false);
        });

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
                if (!this.video.paused) {
                    this.handleTimeUpdate(); 
                }
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
        // Don't re-query if we have a valid progress bar in DOM
        if (this.overlay && this.overlay.parentNode && document.body.contains(this.overlay.parentNode)) {
            return;
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

        const len = this.segments.length;
        for (let i = 0; i < len; i++) {
            const segment = this.segments[i];
            const isHighlight = segment.category === 'poi_highlight';

            if (isHighlight) {
                if (!highlightMode || highlightMode === 'disable') continue;
            } else {
                const mode = this.configCache[segment.category];
                if (!mode || mode === 'disable') continue;
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
        }

        this.overlay = document.createElement('div');
        this.overlay.id = 'previewbar';
        this.overlay.appendChild(fragment);
        this.progressBar.appendChild(this.overlay);
    }

    processSegments(duration) {
        if (!duration || isNaN(duration)) return;

        let changed = false;
        for (const segment of this.segments) {
            if (segment.segment[1] > duration) {
                segment.segment[1] = duration;
                changed = true;
            }
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

        if (timeToNext > 3.0 && !this.currentManualSegment) {
            const sleepTime = timeToNext - 1.0;
            if (sleepTime > 1.0) {
                this.toggleTimeListener(false);
                this.longDistanceTimer = setTimeout(() => {
                    this.longDistanceTimer = null;
                    this.toggleTimeListener(true);
                }, sleepTime * 1000);
                return;
            }
        }

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

        if (expectedSeg && currentTime >= expectedSeg.start && currentTime < expectedSeg.end) {
            segmentIdx = this.nextSegmentIndex;
        } else {
            // Fallback to Binary Search
            segmentIdx = this.findSegmentAtTime(currentTime);
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
                const categoryName = this.getCategoryName(seg.category);
                const title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);

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
		
		if (seg.originalIndex === this.tempWhitelistIndex) {
            return;
        }

        if (this.configCache.skipSegmentsOnce && this.skippedSegmentIndices.has(seg.originalIndex)) {
            return;
        }

        if (this.isLegacyWebOS &&
            segmentIdx === this.lastSkippedSegmentIndex &&
            this.video.duration - currentTime < 1.0) {
            return;
        }

        let jumpTarget = seg.end;
        const skippedCategories = [this.getCategoryName(seg.category)];
        const segmentsToMark = [seg.originalIndex];

        for (let i = segmentIdx + 1; i < this.skipSegments.length; i++) {
            const next = this.skipSegments[i];

            if (next.mode !== 'auto_skip') break;
            if (next.start > jumpTarget + 0.2) break;

            jumpTarget = Math.max(jumpTarget, next.end);
            skippedCategories.push(this.getCategoryName(next.category));
            segmentsToMark.push(next.originalIndex);
        }

        if (segmentIdx === this.lastSkippedSegmentIndex && Math.abs(currentTime - this.lastSkipTime) < 0.1) {
            return;
        }

        this.isSkipping = true;
        this.lastSkipTime = currentTime;
        this.lastSkippedSegmentIndex = segmentIdx;
		
		segmentsToMark.forEach(idx => this.skippedSegmentIndices.add(idx));

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
        // Re-find next index properly via binary search just to be safe after a skip
        const nextIdx = this.findNextSegmentIndex(jumpTarget);
        this.nextSegmentIndex = nextIdx;
        
        if (this.nextSegmentIndex < this.skipSegments.length) {
            this.nextSegmentStart = this.skipSegments[this.nextSegmentIndex].start;
        } else {
            this.nextSegmentStart = Infinity;
            this.toggleTimeListener(false);
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

        this.toggleTimeListener(false);
        this.clearLongDistanceTimer();

        this.rafIds.forEach(id => cancelAnimationFrame(id));
        this.rafIds.clear();
        this.stopHighFreqLoop();

        if (this.unmuteTimeoutId) {
            clearTimeout(this.unmuteTimeoutId);
            this.unmuteTimeoutId = null;
        }

        if (this.chainSkipVideo) {
            if (this.boundChainSkipRetry) {
                this.chainSkipVideo.removeEventListener('loadedmetadata', this.boundChainSkipRetry);
            }
            if (this.boundChainSkipSeeked) {
                this.chainSkipVideo.removeEventListener('seeked', this.boundChainSkipSeeked);
            }
        }
        this.boundChainSkipRetry = null;
        this.boundChainSkipSeeked = null;
        this.chainSkipVideo = null;

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
		this.tempWhitelistIndex = -1;

        if (this.skippedSegmentIndices) {
            this.skippedSegmentIndices.clear();
            this.skippedSegmentIndices = null;
        }

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