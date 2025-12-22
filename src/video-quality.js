import { configRead, configAddChangeListener, configRemoveChangeListener } from './config.js';

let player = null;
let lastVideoId = null;
let qualityTimer = null;
let stateHandler = null;
let initTimer = null;
let configCleanup = null;

// Player States
const STATE_UNSTARTED = -1;
const STATE_BUFFERING = 3;
const STATE_PLAYING = 1;

function shouldForce() {
  return configRead('forceHighResVideo') && 
         (!player?.isInline || !player.isInline());
}

function setQuality() {
  if (!player || !shouldForce()) return;
  
  try {
    player.setPlaybackQualityRange('highres', 'highres');
    player.setPlaybackQuality?.('highres');
  } catch (e) {}
}

function clearTimer() {
  if (qualityTimer) {
    clearTimeout(qualityTimer);
    qualityTimer = null;
  }
}

function checkQuality(tries = 1) {
  clearTimer();
  if (!shouldForce() || !player || tries > 3) return;
  
  const label = player.getPlaybackQualityLabel?.() || '';
  if (!label || label === 'auto') {
    qualityTimer = setTimeout(() => checkQuality(tries + 1), 1000);
  }
}

function onStateChange(state) {
  if (state === STATE_BUFFERING || state === STATE_UNSTARTED) {
    setQuality();
  }

  if (state === STATE_PLAYING) {
    const videoId = player.getVideoData?.().video_id;
    if (videoId && videoId !== lastVideoId) {
      lastVideoId = videoId;
      setQuality();
      clearTimer();
      qualityTimer = setTimeout(checkQuality, 1000);
    }
  }
}

export function destroyVideoQuality() {
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
  
  clearTimer();
  
  if (player && stateHandler) {
    player.removeEventListener?.('onStateChange', stateHandler);
  }
  
  configCleanup?.();
  
  player = null;
  stateHandler = null;
  lastVideoId = null;
  configCleanup = null;
}

export function initVideoQuality() {
  if (player) return;
  
  const attach = () => {
    // Direct query - fastest on webOS
    const p = document.querySelector('.html5-video-player');
    if (p?.setPlaybackQualityRange) {
      player = p;
      stateHandler = onStateChange;
      
      player.removeEventListener?.('onStateChange', stateHandler);
      player.addEventListener?.('onStateChange', stateHandler);
      
      if (player.getPlayerState?.() === STATE_PLAYING) {
        setQuality();
      }
      
      // Set up config listener AFTER player is attached
      if (configAddChangeListener && !configCleanup) {
        const onChange = (evt) => {
          if (evt.detail.newValue) setQuality();
        };
        
        configCleanup = configAddChangeListener('forceHighResVideo', onChange) || 
          (() => configRemoveChangeListener?.('forceHighResVideo', onChange));
      }
      
      return true;
    }
    return false;
  };

  if (attach()) return;

  // Lightweight polling for webOS - more efficient than MutationObserver on older TVs
  let attempts = 0;
  const poll = () => {
    if (attach() || attempts++ >= 50) {
      clearTimeout(initTimer);
      initTimer = null;
    } else {
      initTimer = setTimeout(poll, 200);
    }
  };
  
  poll();
}