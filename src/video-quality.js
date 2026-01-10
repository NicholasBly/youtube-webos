import { configRead, configAddChangeListener, configRemoveChangeListener } from './config.js';
import { showNotification } from './ui';
import { WebOSVersion } from './webos-utils.js';
import { sendKey, REMOTE_KEYS } from './utils.js';

// Debug mode - set to false for production
const DEBUG = false;

// O(1) Lookup: Static Set for quality levels
const TARGET_QUALITIES = new Set([
  'highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'
]);

const movie_player = 'ytlr-player__player-container-player';

// Caching: In-memory cache for localStorage
let cachedQualitySettings = null;

let player = null;
let lastVideoId = null;
let initTimer = null;
let configCleanup = null;
let isDestroyed = false;
let lastWriteTime = 0;
let statePollingInterval = null;
let lastKnownState = null;
let isWatchPage = false;
let qualitySetForVideo = new Set();
let videoBeingProcessed = null;

// Flag to track if we've applied the "First Load Kick" this session
let hasKickstarted = false;

// Player States
const STATE_UNSTARTED = -1;
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_PAUSED = 2;
const STATE_BUFFERING = 3;
const STATE_CUED = 5;

const STATE_NAMES = {
  '-1': 'UNSTARTED',
  '0': 'ENDED',
  '1': 'PLAYING',
  '2': 'PAUSED',
  '3': 'BUFFERING',
  '5': 'CUED'
};

function checkIsWatchPage() {
  return location.pathname === '/watch' || document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
}

function shouldForce() {
  return configRead('forceHighResVideo') && 
         (!player?.isInline || !player.isInline());
}

async function ensurePlaybackStarts() {
  // Only run this logic on webOS 25
  if (WebOSVersion() !== 25) return;
  
  if (hasKickstarted) return;

  if (DEBUG) console.info('[VideoQuality] 🚀 Starting playback enforcer...');

  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS = 500;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (isDestroyed || !player || hasKickstarted) return;

    try {
      const currentState = player.getPlayerState?.();

      if (currentState === STATE_PLAYING) {
        hasKickstarted = true;
        if (DEBUG) console.info('[VideoQuality] ✅ Playback verified! Kickstart complete.');
        
        // Send UP key twice to dismiss UI
        sendKey(REMOTE_KEYS.UP);
        setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
		setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
        
        return;
      }

      if (DEBUG) console.log(`[VideoQuality] 👊 Kick attempt ${i + 1}/${MAX_ATTEMPTS} (State: ${currentState})`);
      player.playVideo?.();

    } catch (e) {
      if (DEBUG) console.warn('[VideoQuality] Kick attempt failed:', e);
    }

    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }

  if (DEBUG && !hasKickstarted) {
    console.warn('[VideoQuality] ⚠️ Playback enforcer timed out without confirming PLAYING state.');
  }
}

function isQualityAlreadyMax() {
  if (!player) return false;
  
  try {
    const currentQuality = player.getPlaybackQuality?.();
    const isMax = TARGET_QUALITIES.has(currentQuality);
    
    if (DEBUG) {
      console.log('[VideoQuality] Quality check:', {
        current: currentQuality,
        isAlreadyMax: isMax
      });
    }
    
    return isMax;
  } catch (e) {
    return false;
  }
}

function setLocalStorageQuality() {
  if (!shouldForce()) return false;
  
  if (cachedQualitySettings && cachedQualitySettings.quality === 4320) {
    return false; 
  }

  const now = Date.now();
  if (now - lastWriteTime < 2000) {
    return false;
  }
  
  try {
    const QUALITY_KEY = 'yt-player-quality';
    
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
    const oneYear = 365 * 24 * 60 * 60 * 1000;
      
    const qualityObj = {
      data: JSON.stringify(innerData),
      creation: now,
      expiration: now + oneYear
    };
    
    window.localStorage.setItem(QUALITY_KEY, JSON.stringify(qualityObj));
    cachedQualitySettings = innerData;
    lastWriteTime = now;
    
    if (DEBUG) {
      console.info('[VideoQuality] Set localStorage quality to 4320p');
    }
    
    return true;
    
  } catch (e) {
    if (DEBUG) {
      console.warn('[VideoQuality] Failed to set localStorage quality:', e);
    }
    return false;
  }
}

function setQualityOnPlayer() {
  if (!player || !shouldForce() || isDestroyed) {
    return { success: false, upgraded: false };
  }
  
  try {
    if (!player.setPlaybackQualityRange) {
      return { success: false, upgraded: false };
    }
    
    if (isQualityAlreadyMax()) {
      return { success: true, upgraded: false };
    }
    
    const beforeQuality = player.getPlaybackQuality?.();
    
    if (DEBUG) {
      console.log('[VideoQuality] Upgrading quality from:', beforeQuality);
    }
    
    player.setPlaybackQualityRange('highres', 'highres');
    player.setPlaybackQuality?.('highres');
    
    const afterQuality = player.getPlaybackQuality?.();
    const qualityLabel = player.getPlaybackQualityLabel?.();
    
    if (DEBUG) {
      console.info('[VideoQuality] ✅ Quality upgraded to:', afterQuality, qualityLabel);
    }
    
    return { 
      success: true, 
      upgraded: true,
      newQuality: qualityLabel || afterQuality
    };
    
  } catch (e) {
    if (DEBUG) {
      console.warn('[VideoQuality] Error setting quality:', e);
    }
    return { success: false, upgraded: false };
  }
}

// Helper: reliable notification with label fallback
function notifyIfUpgraded(result) {
  if (result && result.upgraded) {
    setTimeout(() => {
      try {
        const finalQuality = player.getPlaybackQualityLabel?.() || result.newQuality || 'high quality';
        showNotification(`Video quality upgraded to ${finalQuality}`);
        if (DEBUG) {
          console.info('[VideoQuality] Notification shown:', finalQuality);
        }
      } catch (e) {
        showNotification('Video quality upgraded to high quality');
      }
    }, 500);
  }
}

function interceptAndUpgradeQuality(videoId) {
  if (!player || !shouldForce() || isDestroyed) {
    return;
  }
  
  if (videoBeingProcessed === videoId) {
    return;
  }
  
  if (isQualityAlreadyMax()) {
    qualitySetForVideo.add(videoId);
    return;
  }
  
  videoBeingProcessed = videoId;
  
  if (DEBUG) {
    console.info('[VideoQuality] 🛑 Intercepting playback to upgrade quality:', videoId);
  }
  
  const currentState = player.getPlayerState?.();
  const wasPlaying = currentState === STATE_PLAYING;
  
  try {
    if (wasPlaying) {
      player.pauseVideo?.();
    }
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
  if (isDestroyed || !player || !shouldForce()) {
    return;
  }
  
  const actualState = (typeof state === 'object' && state.data !== undefined) ? state.data : state;

  try {
    const videoData = player.getVideoData?.();
    const videoId = videoData?.video_id;
    
    if (!videoId) return;
    
    const isNewVideo = videoId !== lastVideoId;
    
    if (isNewVideo) {
      lastVideoId = videoId;
      if (DEBUG) console.info('[VideoQuality] 🎬 New video:', videoId);
    }
    
    if (qualitySetForVideo.has(videoId)) {
      return;
    }
    
    if (actualState === STATE_UNSTARTED && isNewVideo) {
      setLocalStorageQuality();
      const availableQualities = player.getAvailableQualityLevels?.();
      if (availableQualities && availableQualities.length > 0) {
        const result = setQualityOnPlayer();
        notifyIfUpgraded(result);
        qualitySetForVideo.add(videoId);
      }
    }
    else if (actualState === STATE_BUFFERING && isNewVideo) {
      const availableQualities = player.getAvailableQualityLevels?.();
      if (availableQualities && availableQualities.length > 0) {
        if (!isQualityAlreadyMax()) {
           const result = setQualityOnPlayer();
           notifyIfUpgraded(result);
           qualitySetForVideo.add(videoId);
        } else {
           qualitySetForVideo.add(videoId);
        }
      }
    }
    else if (actualState === STATE_PLAYING) {
      if (!qualitySetForVideo.has(videoId) && !isQualityAlreadyMax()) {
        interceptAndUpgradeQuality(videoId);
      } else if (!qualitySetForVideo.has(videoId)) {
        qualitySetForVideo.add(videoId);
      }
    }
	ensurePlaybackStarts();
  } catch (e) {
    if (DEBUG) console.warn('[VideoQuality] Error in state change handler:', e);
  }
}

function startStatePolling() {
  if (statePollingInterval) return;
  
  if (DEBUG) console.info('[VideoQuality] Starting state polling (Fallback)');
  
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
  if (DEBUG) console.info('[VideoQuality] Destroying');
  
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
  // NOTE: We do NOT reset hasKickstarted here, so it persists for the session.
}

export function initVideoQuality() {
  if (initTimer || player) return;
  
  if (DEBUG) console.info('[VideoQuality] Initializing');
  
  isDestroyed = false;
  
  setLocalStorageQuality();
  
  const attach = () => {
    if (isDestroyed) return true;
    
    const p = document.getElementById(movie_player);
              
    const isConnected = p && (p.isConnected !== undefined ? p.isConnected : document.contains(p));
    
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
            if (DEBUG) console.log('[VideoQuality] Native listener attached');
        }
      } catch (e) {
        if (DEBUG) console.warn('[VideoQuality] Event listener failed, falling back to poll:', e);
      }
      
      if (!listenerAttached) {
          startStatePolling();
      }
      
      if (configAddChangeListener && !configCleanup) {
        const onChange = (evt) => {
          if (isDestroyed) return;
          if (evt.detail.newValue) {
            cachedQualitySettings = null;
            setLocalStorageQuality();
            qualitySetForVideo.clear();
          }
        };
        configCleanup = configAddChangeListener('forceHighResVideo', onChange) || 
          (() => configRemoveChangeListener?.('forceHighResVideo', onChange));
      }
      
      if (DEBUG) console.info('[VideoQuality] ✅ Attached to player');
      
      handleStateChange(player.getPlayerState?.());
      
      return true;
    } catch (e) {
      if (DEBUG) console.warn('[VideoQuality] Error attaching:', e);
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
  const isWatch = (event?.detail?.pageType === 'watch') || checkIsWatchPage();
  
  if (isWatch && !isWatchPage) {
    if (DEBUG) console.info('[VideoQuality] Navigation: Entering watch page');
    isWatchPage = true;
    setTimeout(() => initVideoQuality(), 0); 
    
  } else if (!isWatch && isWatchPage) {
    if (DEBUG) console.info('[VideoQuality] Navigation: Leaving watch page');
    isWatchPage = false;
    destroyVideoQuality();
  }
}

function setupListeners() {
    window.addEventListener('yt-navigate-finish', handleNavigation);
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => handleNavigation());
    } else {
        handleNavigation();
    }
    
    window.addEventListener('beforeunload', () => {
        destroyVideoQuality();
    });
}

setupListeners();