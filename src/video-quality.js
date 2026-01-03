import { configRead, configAddChangeListener, configRemoveChangeListener } from './config.js';

let player = null;
let lastVideoId = null;
let qualityTimer = null;
let stateHandler = null;
let initTimer = null;
let configCleanup = null;
let isDestroyed = false;

// Player States
// const STATE_UNSTARTED = -1;
const STATE_BUFFERING = 3;
const STATE_PLAYING = 1;

function shouldForce() {
  return configRead('forceHighResVideo') && 
         (!player?.isInline || !player.isInline());
}

function setLocalStorageQuality() {
  if (!shouldForce()) return;
  
  try {
    const QUALITY_KEY = 'yt-player-quality';
    const stored = window.localStorage.getItem(QUALITY_KEY);
    
    let qualityObj;
    
    if (stored) {
      // Parse existing value
      try {
        qualityObj = JSON.parse(stored);
        
        // Validate format
        if (!qualityObj || typeof qualityObj !== 'object' || 
            !qualityObj.data || !qualityObj.creation || !qualityObj.expiration) {
          throw new Error('Invalid format');
        }
        
        // Parse the inner data string
        const innerData = JSON.parse(qualityObj.data);
        
        // Update quality values
        innerData.quality = 4320;
        innerData.previousQuality = 4320;
        
        // Reconstruct the object
        qualityObj.data = JSON.stringify(innerData);
        
      } catch (e) {
        console.warn('[VideoQuality] Invalid yt-player-quality format, creating new');
        qualityObj = null;
      }
    }
    
    // Create new object if needed
    if (!qualityObj) {
      const now = Date.now();
      const oneYear = 365 * 24 * 60 * 60 * 1000; // ~1 year in milliseconds
      
      qualityObj = {
        data: JSON.stringify({ quality: 4320, previousQuality: 4320 }),
        creation: now,
        expiration: now + oneYear
      };
    }
    
    window.localStorage.setItem(QUALITY_KEY, JSON.stringify(qualityObj));
    console.info('[VideoQuality] Set localStorage quality to 4320');
    
  } catch (e) {
    console.warn('[VideoQuality] Failed to set localStorage quality:', e);
  }
}

function setQuality() {
  if (!player || !shouldForce() || isDestroyed) return;
  
  try {
    if (!player.setPlaybackQualityRange) {
      console.warn('[VideoQuality] Player no longer valid, cleaning up');
      destroyVideoQuality();
      return;
    }
    
    player.setPlaybackQualityRange('highres', 'highres');
    player.setPlaybackQuality?.('highres');
    setLocalStorageQuality();
  } catch (e) {
    console.warn('[VideoQuality] Error setting quality:', e);
  }
}

function clearTimer() {
  if (qualityTimer) {
    clearTimeout(qualityTimer);
    qualityTimer = null;
  }
}

function checkQuality(tries = 1) {
  clearTimer();
  
  if (!shouldForce() || !player || tries > 3 || isDestroyed) return;
  
  try {
    const label = player.getPlaybackQualityLabel?.() || '';
    if (!label || label === 'auto') {
      qualityTimer = setTimeout(() => checkQuality(tries + 1), 1000);
    }
  } catch (e) {
    console.warn('[VideoQuality] Error checking quality:', e);
    clearTimer();
  }
}

function onStateChange(state) {
  if (isDestroyed || !player) return;
  
  try {
    if (state === STATE_BUFFERING) {
      console.info('[VideoQuality] Buffering detected, forcing quality');
      setQuality();
    }

    if (state === STATE_PLAYING) {
      const videoData = player.getVideoData?.();
      const videoId = videoData?.video_id;
      
      if (videoId && videoId !== lastVideoId) {
        lastVideoId = videoId;
        setQuality();
        clearTimer();
        qualityTimer = setTimeout(checkQuality, 1000);
      }
    }
  } catch (e) {
    console.warn('[VideoQuality] Error in state change handler:', e);
  }
}

export function destroyVideoQuality() {
  console.info('[VideoQuality] Destroying video quality manager');
  
  isDestroyed = true;
  
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  
  clearTimer();
  
  if (player && stateHandler) {
    try {
      player.removeEventListener?.('onStateChange', stateHandler);
    } catch (e) {
      console.warn('[VideoQuality] Error removing event listener:', e);
    }
  }
  
  if (configCleanup) {
    try {
      configCleanup();
    } catch (e) {
      console.warn('[VideoQuality] Error in config cleanup:', e);
    }
  }
  
  player = null;
  stateHandler = null;
  lastVideoId = null;
  configCleanup = null;
}

export function initVideoQuality() {
  if (initTimer || player) {
    console.info('[VideoQuality] Already initialized or initializing, skipping');
    return;
  }
  
  isDestroyed = false;
  
  const attach = () => {
    if (isDestroyed) return true; // Return true to stop polling
    
    // Direct query - fastest on webOS
    const p = document.querySelector('.html5-video-player');
    
    if (!p || !p.setPlaybackQualityRange || !p.isConnected) {
      return false;
    }
    
    try {
      player = p;
      stateHandler = onStateChange;
      
      player.removeEventListener?.('onStateChange', stateHandler);
      player.addEventListener?.('onStateChange', stateHandler);
      
      // Set localStorage quality immediately
      setLocalStorageQuality();
      
      if (player.getPlayerState?.() === STATE_PLAYING) {
        setQuality();
      }
      
      // Set up config listener AFTER player is attached
      if (configAddChangeListener && !configCleanup) {
        const onChange = (evt) => {
          if (isDestroyed) return;
          
          if (evt.detail.newValue) {
            setLocalStorageQuality();
            setQuality();
          }
        };
        
        configCleanup = configAddChangeListener('forceHighResVideo', onChange) || 
          (() => configRemoveChangeListener?.('forceHighResVideo', onChange));
      }
      
      console.info('[VideoQuality] Successfully attached to player');
      return true;
    } catch (e) {
      console.warn('[VideoQuality] Error attaching to player:', e);
      player = null;
      return false;
    }
  };

  if (attach()) return;

  // Lightweight polling for webOS - more efficient than MutationObserver on older TVs
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
      
      if (attempts >= 50 && !player) {
        console.warn('[VideoQuality] Failed to attach after 50 attempts');
      }
    } else {
      initTimer = setTimeout(poll, 200);
    }
  };
  
  poll();
}

window.addEventListener('hashchange', () => {
  const isWatchPage = window.location.hash.includes('/watch');
  if (!isWatchPage && player) {
    console.info('[VideoQuality] Leaving watch page, cleaning up');
    destroyVideoQuality();
  }
});

window.addEventListener('beforeunload', destroyVideoQuality);