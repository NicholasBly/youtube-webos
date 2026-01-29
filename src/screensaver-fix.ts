/**
 * On webOS, when a video element doesn't perfectly fill
 * the entire screen, the screensaver can kick in.
 */

import { waitForChildAdd, sendKey } from './utils';

/**
 * document.querySelector but waits for the Element to be added if it doesn't already exist.
 */
export async function requireElement<E extends typeof Element>(
  cssSelectors: string,
  expected: E
): Promise<InstanceType<E>> {
  const alreadyPresent = document.querySelector(cssSelectors);
  if (alreadyPresent) {
    if (!(alreadyPresent instanceof expected)) throw new Error();
    return alreadyPresent as InstanceType<E>;
  }

  const result = await waitForChildAdd(
    document.body,
    (node): node is Element =>
      node instanceof Element && node.matches(cssSelectors),
    true
  );

  if (!(result instanceof expected)) throw new Error();
  return result as InstanceType<E>;
}

function isPlayerHidden(video: HTMLVideoElement) {
  return video.style.display == 'none' || (video.style.top && video.style.top.indexOf('-') === 0);
}

// Cached Page State
type PageType = 'WATCH' | 'SHORTS' | 'OTHER' | null;
let lastPageType: PageType = null;
let shortsKeepAliveTimer: number | null = null;
const REMOTE_KEY_YELLOW_1 = { code: 405, key: 'Yellow', charCode: 0 }; 
const REMOTE_KEY_YELLOW_2 = { code: 170, key: 'Yellow', charCode: 170 };
const MOVIE_PLAYER_ID = 'ytlr-player__player-container-player';
const STATE_PLAYING = 1;

function setShortsKeepAlive(enable: boolean) {
  if (enable) {
    if (shortsKeepAliveTimer) return;
    console.info('[ScreensaverFix] Shorts detected: Starting keep-alive (Yellow Key / 30s)');
    shortsKeepAliveTimer = window.setInterval(() => {
        // Check player state to ensure we only keep awake if actually playing
        const player = document.getElementById(MOVIE_PLAYER_ID) as any;
        const isPlaying = player && typeof player.getPlayerState === 'function' && player.getPlayerState() === STATE_PLAYING;

        if (isPlaying) {
            // Send Yellow key to reset system screensaver timer
			console.log("[Screensaver Fix] Video is playing, sending yellow presses");
            sendKey(REMOTE_KEY_YELLOW_1);
            sendKey(REMOTE_KEY_YELLOW_2);
        }
    }, 30000); 
  } else {
    if (shortsKeepAliveTimer) {
      console.info('[ScreensaverFix] Stopping Shorts keep-alive');
      clearInterval(shortsKeepAliveTimer);
      shortsKeepAliveTimer = null;
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

let currentVideoElement: HTMLVideoElement | null = null;

const bodyAttrObs = new MutationObserver(async () => {
  const classList = document.body.classList;
  const isWatch = classList.contains('WEB_PAGE_TYPE_WATCH');
  const isShorts = classList.contains('WEB_PAGE_TYPE_SHORTS');
  
  const newPageType: PageType = isWatch ? 'WATCH' : (isShorts ? 'SHORTS' : 'OTHER');

  // Optimization: If the page type hasn't changed, ignore other class mutations
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
    const playerContainer = document.getElementById('ytlr-player__player-container');
    
    // If container exists, search inside it. If not, fallback to body.
    const searchRoot = playerContainer || document.body;
    
    // Note: We manually query inside the root instead of using requireElement's default body scan
    let video = searchRoot.querySelector('video') as HTMLVideoElement;
    
    // If not found immediately, use the waiter (scoped to root)
    if (!video) {
        // We temporarily cast to any to access the internal logic if you can't modify requireElement
        // Or simply wait on the root:
         video = await waitForChildAdd(
            searchRoot,
            (node): node is HTMLVideoElement =>
                node instanceof HTMLVideoElement,
            false
        ) as HTMLVideoElement;
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
});

bodyAttrObs.observe(document.body, {
  attributes: true,
  attributeFilter: ['class']
});

window.addEventListener('beforeunload', () => {
  playerCtrlObs.disconnect();
  bodyAttrObs.disconnect();
  currentVideoElement = null;
  setShortsKeepAlive(false);
});