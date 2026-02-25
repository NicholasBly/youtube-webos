import { configRead, configAddChangeListener, configRemoveChangeListener } from './config.js';
import { showNotification } from './ui';
import { isWebOS25 } from './webos-utils.js';
import { sendKey, REMOTE_KEYS, SELECTORS, isWatchPage } from './utils.js';

const DEBUG = false;

const TARGET_QUALITIES = new Set([
  'highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'
]);

const IS_WEBOS_25 = isWebOS25();
const QUALITY_KEY = 'yt-player-quality';
const ONE_YEAR_MS = 31536000000; // 365 * 24 * 60 * 60 * 1000

// Caching: In-memory cache for localStorage & Config
let cachedQualitySettings = null;
let _shouldForce = false;

let player = null;
let lastVideoId = null;
let initTimer = null;
let configCleanup = null;
let isDestroyed = false;
let lastWriteTime = 0;
let statePollingInterval = null;
let lastKnownState = null;
let _isWatchPageCached = false;
let videoBeingProcessed = null;
let kickstartInProgress = false;

const qualitySetForVideo = new Set();

// webOS 25 first video fix
let hasKickstarted = false;

// Player States
const STATE_UNSTARTED = -1;
// const STATE_ENDED = 0;
const STATE_PLAYING = 1;
// const STATE_PAUSED = 2;
const STATE_BUFFERING = 3;
// const STATE_CUED = 5;

function isForceEnabled() {
  return _shouldForce && (!player?.isInline || !player.isInline());
}

async function ensurePlaybackStarts() {
  if (!IS_WEBOS_25 || hasKickstarted || isDestroyed || !player || kickstartInProgress) return;

  kickstartInProgress = true;
  if (DEBUG) console.info('[VideoQuality] 🚀 Starting playback enforcer...');

  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS = 500;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (isDestroyed || !player || hasKickstarted) {
      kickstartInProgress = false;
      return;
    }

    try {
      const currentState = player.getPlayerState?.();

      if (currentState === STATE_PLAYING) {
        hasKickstarted = true;
        kickstartInProgress = false;
        if (DEBUG) console.info('[VideoQuality] ✅ Playback verified! Kickstart complete.');
        
        requestAnimationFrame(() => {
            const controls = document.querySelector('yt-focus-container[idomkey="controls"]');
            const isControlsVisible = controls && controls.classList.contains('MFDzfe--focused');

            if (isControlsVisible) {
                if (DEBUG) console.info('[VideoQuality] 🎮 Controls are focused. Hiding and dismissing...');

                const hideStyle = document.createElement('style');
                hideStyle.textContent = '.GLc3cc { opacity: 0 !important; transition: opacity 0.1s; }';
                document.head.appendChild(hideStyle);

                sendKey(REMOTE_KEYS.UP);                            
                setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);     
                setTimeout(() => sendKey(REMOTE_KEYS.UP), 500);     

                setTimeout(() => {
                    if (hideStyle.isConnected) hideStyle.remove();
                }, 750);
            }
        });
        
        return;
      }

      if (DEBUG) console.log(`[VideoQuality] 👊 Kick attempt ${i + 1}/${MAX_ATTEMPTS} (State: ${currentState})`);
      player.playVideo?.();

    } catch (e) {
      if (DEBUG) console.warn('[VideoQuality] Kick attempt failed:', e);
    }
	
	// eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }

  kickstartInProgress = false;
  if (DEBUG && !hasKickstarted) {
    console.warn('[VideoQuality] ⚠️ Playback enforcer timed out without confirming PLAYING state.');
  }
}

function isQualityAlreadyMax() {
  if (!player) return false;
  try {
    const currentQuality = player.getPlaybackQuality?.();
    return TARGET_QUALITIES.has(currentQuality);
  } catch (e) {
    return false;
  }
}

function setLocalStorageQuality() {
  if (!isForceEnabled()) return false;
  
  const now = Date.now();
  if (now - lastWriteTime < 2000) return false;

  if (cachedQualitySettings && cachedQualitySettings.quality === 4320) {
    return false; 
  }
  
  try {
    if (!cachedQualitySettings) {
      const stored = window.localStorage.getItem(QUALITY_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.data) {
             cachedQualitySettings = JSON.parse(parsed.data);
          }
        } catch (e) { /* ignore */ }
      }
    }

    if (cachedQualitySettings && 
        cachedQualitySettings.quality === 4320 && 
        cachedQualitySettings.previousQuality === 4320) {
        return false; 
    }

    const innerData = { quality: 4320, previousQuality: 4320 };
      
    const qualityObj = {
      data: JSON.stringify(innerData),
      creation: now,
      expiration: now + ONE_YEAR_MS
    };
    
    window.localStorage.setItem(QUALITY_KEY, JSON.stringify(qualityObj));
    cachedQualitySettings = innerData;
    lastWriteTime = now;
    
    DEBUG && console.info('[VideoQuality] Set localStorage quality to 4320p');
    return true;
    
  } catch (e) {
    DEBUG && console.warn('[VideoQuality] Failed to set localStorage quality:', e);
    return false;
  }
}

function setQualityOnPlayer() {
  if (!player || !isForceEnabled() || isDestroyed) {
    return { success: false, upgraded: false };
  }
  
  try {
    if (!player.setPlaybackQualityRange) {
      return { success: false, upgraded: false };
    }
    
    if (isQualityAlreadyMax()) {
      return { success: true, upgraded: false };
    }
    
    DEBUG && console.log('[VideoQuality] Upgrading quality from:', player.getPlaybackQuality?.());
    
    player.setPlaybackQualityRange('highres', 'highres');
    player.setPlaybackQuality?.('highres');
    
    const afterQuality = player.getPlaybackQuality?.();
    const qualityLabel = player.getPlaybackQualityLabel?.();
    
    DEBUG && console.info('[VideoQuality] ✅ Quality upgraded to:', afterQuality, qualityLabel);
    
    return { 
      success: true, 
      upgraded: true,
      newQuality: qualityLabel || afterQuality
    };
    
  } catch (e) {
    DEBUG && console.warn('[VideoQuality] Error setting quality:', e);
    return { success: false, upgraded: false };
  }
}

function notifyIfUpgraded(result) {
  if (result && result.upgraded) {
    setTimeout(() => {
      try {
        const finalQuality = player.getPlaybackQualityLabel?.() || result.newQuality || 'high quality';
        showNotification(`Video quality upgraded to ${finalQuality}`);
        DEBUG && console.info('[VideoQuality] Notification shown:', finalQuality);
      } catch (e) {
        showNotification('Video quality upgraded to high quality');
      }
    }, 500);
  }
}

function interceptAndUpgradeQuality(videoId) {
  if (!player || !isForceEnabled() || isDestroyed) return;
  
  if (videoBeingProcessed === videoId) return;
  
  if (isQualityAlreadyMax()) {
    qualitySetForVideo.add(videoId);
    return;
  }
  
  videoBeingProcessed = videoId;
  DEBUG && console.info('[VideoQuality] 🛑 Intercepting playback to upgrade quality:', videoId);
  
  const currentState = player.getPlayerState?.();
  const wasPlaying = currentState === STATE_PLAYING;
  
  try {
    if (wasPlaying) player.pauseVideo?.();
  } catch (e) { /* ignore */ }
  
  requestAnimationFrame(() => {
    const result = setQualityOnPlayer();
    
    if (result.success) {
      qualitySetForVideo.add(videoId);
    }
    
    requestAnimationFrame(() => {
      if (wasPlaying) {
        try {
          player.playVideo?.();
        } catch (e) { /* ignore */ }
      }
      notifyIfUpgraded(result);
      videoBeingProcessed = null;
    });
  });
}

function handleStateChange(state) {
  if (isDestroyed || !player || !_shouldForce) return;
  
  const actualState = (state && state.data !== undefined) ? state.data : state;

  try {
    const videoData = player.getVideoData?.();
    const videoId = videoData?.video_id;
    
    if (!videoId) return;
    
    const isNewVideo = videoId !== lastVideoId;
    
    if (isNewVideo) {
      lastVideoId = videoId;
      DEBUG && console.info('[VideoQuality] 🎬 New video:', videoId);
      
      if (actualState === STATE_UNSTARTED) {
          setLocalStorageQuality();
      }
    }
    
    if (qualitySetForVideo.has(videoId)) {
      if (actualState === STATE_PLAYING) ensurePlaybackStarts();
      return;
    }
    
    switch (actualState) {
        case STATE_UNSTARTED:
            if (isNewVideo) {
                const availableQualities = player.getAvailableQualityLevels?.();
                if (availableQualities?.length > 0) {
                    const result = setQualityOnPlayer();
                    notifyIfUpgraded(result);
                    qualitySetForVideo.add(videoId);
                }
            }
            break;
            
        case STATE_BUFFERING:
            if (isNewVideo) {
                const availableQualities = player.getAvailableQualityLevels?.();
                if (availableQualities?.length > 0) {
                   if (!isQualityAlreadyMax()) {
                       const result = setQualityOnPlayer();
                       notifyIfUpgraded(result);
                       qualitySetForVideo.add(videoId);
                   } else {
                       qualitySetForVideo.add(videoId);
                   }
                }
            }
            break;
            
        case STATE_PLAYING:
            if (!isQualityAlreadyMax()) {
                interceptAndUpgradeQuality(videoId);
            } else {
                qualitySetForVideo.add(videoId);
            }
            break;
    }

	ensurePlaybackStarts();
  } catch (e) {
    DEBUG && console.warn('[VideoQuality] Error in state change handler:', e);
  }
}

function startStatePolling() {
  if (statePollingInterval) return;
  
  DEBUG && console.info('[VideoQuality] Starting state polling (Fallback)');
  
  statePollingInterval = setInterval(() => {
    if (isDestroyed || !player) {
      stopStatePolling();
      return;
    }
    try {
      const state = player.getPlayerState?.();
      if (state !== lastKnownState) {
        lastKnownState = state;
        handleStateChange(state);
      }
    } catch (e) { /* ignore */ }
  }, 250);
}

function stopStatePolling() {
  if (statePollingInterval) {
    clearInterval(statePollingInterval);
    statePollingInterval = null;
  }
}

export function destroyVideoQuality() {
  DEBUG && console.info('[VideoQuality] Destroying');
  
  isDestroyed = true;
  
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  
  stopStatePolling();
  
  if (player) {
    try {
      player.removeEventListener?.('onStateChange', handleStateChange);
    } catch (e) { /* ignore */ }
  }
  
  if (configCleanup) {
    try {
      configCleanup();
    } catch (e) { /* ignore */ }
  }
  
  player = null;
  lastVideoId = null;
  lastKnownState = null;
  configCleanup = null;
  qualitySetForVideo.clear();
  videoBeingProcessed = null;
  _isWatchPageCached = false;
  kickstartInProgress = false;
  // Don't reset hasKickstarted here so it persists for the session
}

export function initVideoQuality() {
  if (initTimer || player) return;
  
  DEBUG && console.info('[VideoQuality] Initializing');
  
  isDestroyed = false;
  _isWatchPageCached = true;
  
  _shouldForce = configRead('forceHighResVideo');
  
  setLocalStorageQuality();
  
  const attach = () => {
    if (isDestroyed) return true;
    
    const p = document.getElementById(SELECTORS.PLAYER_ID);
    const isConnected = p && (p.isConnected ?? document.contains(p));
    
    if (!p || !p.setPlaybackQualityRange || !isConnected) {
      return false;
    }
    
    try {
      player = p;
      let listenerAttached = false;
      
      try {
        if (player.addEventListener) {
            player.addEventListener('onStateChange', handleStateChange);
            listenerAttached = true;
            DEBUG && console.log('[VideoQuality] Native listener attached');
        }
      } catch (e) {
        DEBUG && console.warn('[VideoQuality] Event listener failed, falling back to poll:', e);
      }
      
      if (!listenerAttached) {
          startStatePolling();
      }
      
      if (configAddChangeListener && !configCleanup) {
        const onChange = (evt) => {
          if (isDestroyed) return;
          _shouldForce = !!evt.detail.newValue;
          
          if (_shouldForce) {
            cachedQualitySettings = null;
            setLocalStorageQuality();
            qualitySetForVideo.clear();
          }
        };
        configCleanup = configAddChangeListener('forceHighResVideo', onChange) || 
          (() => configRemoveChangeListener?.('forceHighResVideo', onChange));
      }
      
      DEBUG && console.info('[VideoQuality] ✅ Attached to player');
      
      handleStateChange(player.getPlayerState?.());
      
      return true;
    } catch (e) {
      DEBUG && console.warn('[VideoQuality] Error attaching:', e);
      player = null;
      return false;
    }
  };

  if (attach()) return;

  let attempts = 0;
  const poll = () => {
    if (isDestroyed) {
      clearTimeout(initTimer);
      initTimer = null;
      return;
    }
    if (attach() || attempts++ >= 50) {
      clearTimeout(initTimer);
      initTimer = null;
    } else {
      initTimer = setTimeout(poll, 200);
    }
  };
  
  poll();
}

function handleNavigation(event) {
  const isWatch = (event?.detail?.pageType === 'watch') || isWatchPage();
  
  if (isWatch && !_isWatchPageCached) {
    DEBUG && console.info('[VideoQuality] Navigation: Entering watch page');
    setTimeout(initVideoQuality, 0); 
    
  } else if (!isWatch && _isWatchPageCached) {
    DEBUG && console.info('[VideoQuality] Navigation: Leaving watch page');
    destroyVideoQuality();
  }
}

function setupListeners() {
    window.addEventListener('yt-navigate-finish', handleNavigation);
    
    window.addEventListener('ytaf-page-update', () => {
        handleNavigation({ detail: { pageType: isWatchPage() ? 'watch' : 'other' }});
    });
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => handleNavigation());
    } else {
        handleNavigation();
    }
    
    window.addEventListener('beforeunload', destroyVideoQuality);
}

setupListeners();