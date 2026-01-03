/**
 * On webOS, when a video element doesn't perfectly fill
 * the entire screen, the screensaver can be kick in.
 */

import { waitForChildAdd } from './utils';

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
  return video.style.display == 'none' || video.style.top.startsWith('-');
}

function isWatchPage() {
  return document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
}

const playerCtrlObs = new MutationObserver((mutations, obs) => {
  // Only watch page has a full-screen player.
  if (!isWatchPage()) {
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
  if (!isWatchPage()) {
    playerCtrlObs.disconnect();
    currentVideoElement = null;
    return;
  }

  try {
    // Youtube TV re-uses the same video element for everything.
    const video = await requireElement('video', HTMLVideoElement);
    
    // FIX: Only attach if it's a different video element
    if (video !== currentVideoElement) {
      // Clean up old observer
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
});