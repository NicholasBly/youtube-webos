/**
 * src/video-quality.js
 * Forces maximum video quality when enabled.
 */
import { configRead, configAddChangeListener } from './config.js';

let playerInstance = null;
let lastForcedVideoId = null;

// YouTube Player States
const STATE_UNSTARTED = -1;
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_BUFFERING = 3;

/**
 * Checks if we should be forcing quality.
 * Prevents forcing quality on "Preview" (inline) players to avoid UI lag.
 */
function shouldForceQuality() {
  if (!configRead('forceHighResVideo')) return false;
  
  if (playerInstance) {
    // 1. Check for Inline/Preview mode (hovering on home screen)
    if (typeof playerInstance.isInline === 'function' && playerInstance.isInline()) {
      return false;
    }
  }
  return true;
}

/**
 * The core function to force the quality.
 * Uses 'highres' to target the maximum available resolution (4K/8K).
 */
function enforceQuality() {
  if (!playerInstance || !shouldForceQuality()) return;

  try {
    // 'highres' forces the player to select the highest available stream
    playerInstance.setPlaybackQualityRange('highres', 'highres');
    
    // Also explicitly set the suggested quality just in case
    if (playerInstance.setPlaybackQuality) {
        playerInstance.setPlaybackQuality('highres');
    }
    
    console.info('[VideoQuality] Enforced highres quality');
  } catch (e) {
    console.warn('[VideoQuality] Failed to set quality:', e);
  }
}

/**
 * Displays the current quality to the user.
 * Retries a few times because quality changes aren't instant.
 */
function reportQuality(attempt = 1) {
    if (!configRead('forceHighResVideo') || !playerInstance) return;
    
    // Give the player a moment to switch streams
    const currentLabel = playerInstance.getPlaybackQualityLabel ? playerInstance.getPlaybackQualityLabel() : 'Unknown';
    
    // If we see a "real" high-def label, or if we've tried enough times, show it.
    // We filter out 'auto' or empty strings if we are still early in the retry cycle.
    if ((currentLabel && currentLabel !== 'auto' && currentLabel !== '') || attempt >= 3) {
        // showNotification(`Quality Forced: ${currentLabel || 'Max'}`);
    } else {
        // Retry in 1 second if we just see "auto" or nothing yet
        setTimeout(() => reportQuality(attempt + 1), 1000);
    }
}

function handleStateChange(state) {
  // Always enforce quality on Buffering (3) and Unstarted (-1)
  // This overrides YouTube's "sticky" preferences (like 144p) every time a video loads.
  if (state === STATE_BUFFERING || state === STATE_UNSTARTED) {
      enforceQuality();
  }

  // Handle Notifications and Debouncing
  const currentVideoId = playerInstance.getVideoData ? playerInstance.getVideoData().video_id : null;

  // If this is a new video session (or we just started playing), report the status
  if (state === STATE_PLAYING && currentVideoId && currentVideoId !== lastForcedVideoId) {
      lastForcedVideoId = currentVideoId;
      
      // We enforce one more time on Play, just to be sure
      enforceQuality(); 
      
      // Start the reporting cycle (wait 1s for buffer to settle)
      setTimeout(() => reportQuality(), 1000);
  }
}

/**
 * Initializes the module by finding the player element.
 */
export function initVideoQuality() {
  console.info('[VideoQuality] Initializing...');

  const observer = new MutationObserver((mutations, obs) => {
    const player = document.querySelector('.html5-video-player');
    if (player && player.setPlaybackQualityRange) {
      playerInstance = player;
      
      // Hook into the native YouTube player event system
      if (typeof playerInstance.addEventListener === 'function') {
        playerInstance.addEventListener('onStateChange', handleStateChange);
        console.info('[VideoQuality] Attached to player successfully');
        
        // If we attached late and the video is already playing, force it now
        if (playerInstance.getPlayerState && playerInstance.getPlayerState() === STATE_PLAYING) {
            enforceQuality();
        }
      }

      obs.disconnect();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// Re-apply immediately if the user toggles the setting in the UI
configAddChangeListener('forceHighResVideo', (evt) => {
  if (evt.detail.newValue === true) {
    enforceQuality();
  }
});