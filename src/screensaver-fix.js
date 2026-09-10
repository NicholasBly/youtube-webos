/**
 * On webOS, when a video element doesn't perfectly fill
 * the entire screen, the screensaver can kick in.
 */

import { waitForChildAdd, sendKey, SELECTORS, REMOTE_KEYS, isWatchPage, isShortsPage, getVideo } from './utils';

// Set to true when debugging the keep-alive / player-sizing logic.
const DEBUG = false;

function isPlayerHidden(video) {
  return video.style.display == 'none' || (video.style.top && video.style.top.indexOf('-') === 0);
}

// Cached Page State
let lastPageType = null;
let shortsKeepAliveTimer = null;
let shortsBufferTimer = null;
const STATE_PLAYING = 1;

function setShortsKeepAlive(enable) {
  if (enable) {
    if (shortsKeepAliveTimer) return;
    DEBUG && console.info('[ScreensaverFix] Shorts detected: Starting keep-alive (Yellow Key / 30s)');
    shortsKeepAliveTimer = window.setInterval(() => {
        // Check player state to ensure we only keep awake if actually playing
        const player = document.getElementById(SELECTORS.PLAYER_ID);
        const isPlaying = player && typeof player.getPlayerState === 'function' && player.getPlayerState() === STATE_PLAYING;
        if (!isPlaying) return;

        // NOTE: never log the element itself here. console.log(msg, node) makes
        // the console retain a strong reference to a DOM node that may since
        // have been removed — a slow leak firing every 30s for the whole
        // Shorts session on a runtime with no way to drain the buffer.
        DEBUG && console.log('[ScreensaverFix] keep-alive tick');

        // activeElement is document.body when nothing else has focus, null only pre-load.
        const target = document.activeElement || document.body;

        sendKey(REMOTE_KEYS.YELLOW, target);

        if (shortsBufferTimer) clearTimeout(shortsBufferTimer);
        shortsBufferTimer = window.setTimeout(() => {
            sendKey(REMOTE_KEYS.YELLOW_ALT, target);
            shortsBufferTimer = null;
        }, 250);
    }, 30000);
  } else {
    if (shortsKeepAliveTimer) {
      DEBUG && console.info('[ScreensaverFix] Stopping Shorts keep-alive');
      clearInterval(shortsKeepAliveTimer);
      shortsKeepAliveTimer = null;
    }
    if (shortsBufferTimer) {
        clearTimeout(shortsBufferTimer);
        shortsBufferTimer = null;
    }
  }
}

let rafPending = false;
let rafTargetVideo = null;

const playerCtrlObs = new MutationObserver((mutations) => {
  // Only watch page has a full-screen player fix logic.
  if (lastPageType !== 'WATCH') {
    playerCtrlObs.disconnect();
    return;
  }

  const video = mutations[0]?.target;
  // Both of these are normal during navigation teardown, not error conditions.
  if (!video || !(video instanceof HTMLVideoElement) || !video.isConnected) {
    DEBUG && console.warn('[ScreensaverFix] Video element gone, disconnecting observer');
    playerCtrlObs.disconnect();
    return;
  }

  // Coalesce bursts of style mutations into one rAF — Chrome 38 on webOS 3
  // pays a heavy reflow cost per write, so we read window dimensions and
  // diff against current style.* only once per frame.
  rafTargetVideo = video;
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;
    const v = rafTargetVideo;
    rafTargetVideo = null;
    if (!v || !v.isConnected || lastPageType !== 'WATCH') return;
    if (isPlayerHidden(v)) return;

    const style = v.style;
    const tw = `${window.innerWidth}px`;
    const th = `${window.innerHeight}px`;
    try {
      // Some webOS versions fire a mutation even when assignment is a no-op,
      // causing an infinite loop — only write when the value actually differs.
      if (style.width !== tw) style.width = tw;
      if (style.height !== th) style.height = th;
      if (style.left !== '0px') style.left = '0px';
      if (style.top !== '0px') style.top = '0px';
    } catch (e) {
      console.warn('[ScreensaverFix] Error updating video styles:', e);
      playerCtrlObs.disconnect();
    }
  });
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
    
    // Shared cached lookup (isConnected-guarded, invalidated on page change).
    let video = getVideo() || searchRoot.querySelector('video');

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