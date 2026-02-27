/**
 * On webOS, when a video element doesn't perfectly fill
 * the entire screen, the screensaver can kick in.
 */

import { waitForChildAdd, sendKey, SELECTORS, REMOTE_KEYS, isWatchPage, isShortsPage } from './utils';

/**
 * document.querySelector but waits for the Element to be added if it doesn't already exist.
 */
export async function requireElement(cssSelectors, expected) {
  const alreadyPresent = document.querySelector(cssSelectors);
  if (alreadyPresent) {
    if (!(alreadyPresent instanceof expected)) throw new Error();
    return alreadyPresent;
  }

  const result = await waitForChildAdd(
    document.body,
    (node) => node instanceof Element && node.matches(cssSelectors),
    true
  );

  if (!(result instanceof expected)) throw new Error();
  return result;
}

function isPlayerHidden(video) {
  return video.style.display == 'none' || (video.style.top && video.style.top.indexOf('-') === 0);
}

// Cached Page State
let lastPageType = null;
let shortsKeepAliveTimer = null;
let shortsBufferTimer = null;
const REMOTE_KEY_YELLOW_1 = { ...REMOTE_KEYS.YELLOW, charCode: 0 }; 
const REMOTE_KEY_YELLOW_2 = { code: 170, key: 'Yellow', charCode: 170 };
const STATE_PLAYING = 1;

function setShortsKeepAlive(enable) {
  if (enable) {
    if (shortsKeepAliveTimer) return;
    console.info('[ScreensaverFix] Shorts detected: Starting keep-alive (Yellow Key / 30s)');
    shortsKeepAliveTimer = window.setInterval(() => {
        // Check player state to ensure we only keep awake if actually playing
        const player = document.getElementById(SELECTORS.PLAYER_ID);
        const isPlaying = player && typeof player.getPlayerState === 'function' && player.getPlayerState() === STATE_PLAYING;

        if (isPlaying) {
            console.log("[ScreensaverFix] Video is playing, preparing to send yellow presses");
            
            let target = null;
            let source = '';
            if (document.activeElement && document.activeElement !== document.body) {
                target = document.activeElement;
                source = 'document.activeElement (Focus)';
            }
            if (!target) {
                target = document.body;
                source = 'document.body (Fallback)';
            }

            console.log(`[ScreensaverFix] Target picked: ${source}`, target);
            console.log(`[ScreensaverFix] Sending YELLOW_1 (${REMOTE_KEY_YELLOW_1.code})`);

            sendKey(REMOTE_KEY_YELLOW_1, target);
            
            if (shortsBufferTimer) clearTimeout(shortsBufferTimer);

            shortsBufferTimer = window.setTimeout(() => {
                console.log(`[ScreensaverFix] Sending YELLOW_2 (${REMOTE_KEY_YELLOW_2.code})`);
                sendKey(REMOTE_KEY_YELLOW_2, target);
                shortsBufferTimer = null;
            }, 250);
        }
    }, 30000);
  } else {
    if (shortsKeepAliveTimer) {
      console.info('[ScreensaverFix] Stopping Shorts keep-alive');
      clearInterval(shortsKeepAliveTimer);
      shortsKeepAliveTimer = null;
    }
    if (shortsBufferTimer) {
        clearTimeout(shortsBufferTimer);
        shortsBufferTimer = null;
    }
  }
}

const playerCtrlObs = new MutationObserver((mutations, obs) => {
  // Only watch page has a full-screen player fix logic.
  if (lastPageType !== 'WATCH') {
    obs.disconnect();
    return;
  }

  const video = mutations[0]?.target;
  
  if (!video || !(video instanceof HTMLVideoElement)) {
    console.warn('[ScreensaverFix] Invalid video element in mutation, disconnecting observer');
    obs.disconnect();
    return;
  }
  
  if (!video.isConnected) {
    console.warn('[ScreensaverFix] Video element disconnected, stopping observer');
    obs.disconnect();
    return;
  }
  
  const style = video.style;

  // Not sure if there will be a race condition so just in case.
  if (isPlayerHidden(video)) return;

  const targetWidth = `${window.innerWidth}px`;
  const targetHeight = `${window.innerHeight}px`;
  const targetLeft = '0px';
  const targetTop = '0px';

  try {
    /**
     * Check to see if identical before assignment as some webOS versions will trigger a mutation
     * event even if the assignment effectively does nothing, leading to an infinite loop.
     */
    style.width !== targetWidth && (style.width = targetWidth);
    style.height !== targetHeight && (style.height = targetHeight);
    style.left !== targetLeft && (style.left = targetLeft);
    style.top !== targetTop && (style.top = targetTop);
  } catch (e) {
    console.warn('[ScreensaverFix] Error updating video styles:', e);
    obs.disconnect();
  }
});

let currentVideoElement = null;

const updateState = async () => {
  const isWatch = isWatchPage();
  const isShorts = isShortsPage();
  
  const newPageType = isWatch ? 'WATCH' : (isShorts ? 'SHORTS' : 'OTHER');

  // Optimization: If the page type hasn't changed, ignore
  if (newPageType === lastPageType) return;
  lastPageType = newPageType;

  // 1. Handle Shorts Mode
  if (newPageType === 'SHORTS') {
    // Ensure Watch logic is disabled
    if (currentVideoElement) {
        playerCtrlObs.disconnect();
        currentVideoElement = null;
    }
    setShortsKeepAlive(true);
    return;
  }

  // 2. Handle Other Modes (Disable Shorts KeepAlive)
  setShortsKeepAlive(false);

  // 3. Handle Watch Mode
  if (newPageType !== 'WATCH') {
    // If we are here, it's 'OTHER'. Ensure watchers are off.
    playerCtrlObs.disconnect();
    currentVideoElement = null;
    return;
  }

  // -- Watch Page Logic Below --

  try {
    const playerContainer = document.getElementById(SELECTORS.PLAYER_CONTAINER);
    
    // If container exists, search inside it. If not, fallback to body.
    const searchRoot = playerContainer || document.body;
    
    // Note: We manually query inside the root instead of using requireElement's default body scan
    let video = searchRoot.querySelector('video');
    
    // If not found immediately, use the waiter (scoped to root)
    if (!video) {
         video = await waitForChildAdd(
            searchRoot,
            (node) => node instanceof HTMLVideoElement,
            false
        );
    }
    
    // Double check we are still on Watch page after await
    if (lastPageType !== 'WATCH') return;

    if (video && video !== currentVideoElement) {
      if (currentVideoElement) {
        playerCtrlObs.disconnect();
      }
      
      currentVideoElement = video;
      
      if (video.isConnected) {
        playerCtrlObs.observe(video, {
          attributes: true,
          attributeFilter: ['style']
        });
      }
    }
  } catch (e) {
    console.warn('[ScreensaverFix] Error attaching to video element:', e);
  }
};

window.addEventListener('ytaf-page-update', updateState);

// Initial Check
if(document.body) updateState();
else document.addEventListener('DOMContentLoaded', updateState);

window.addEventListener('beforeunload', () => {
  playerCtrlObs.disconnect();
  window.removeEventListener('ytaf-page-update', updateState);
  currentVideoElement = null;
  setShortsKeepAlive(false);
});