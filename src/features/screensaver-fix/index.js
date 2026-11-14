// Keeps the screensaver off. On webOS it kicks in when the <video> does not
// fill the screen, so this file resizes the watch-page <video> to the screen
// whenever its inline style changes; shorts-keep-alive.js handles Shorts, and
// decoder-stall.js the frozen picture after a video screensaver did run.

import './decoder-stall.js';
import { SELECTORS } from '../../core/selectors.js';
import { isWatchPage, isShortsPage } from '../../core/page-state.js';
import { waitForChildAdd, getVideo } from '../../core/dom.js';
import { setShortsKeepAlive } from './shorts-keep-alive.js';
import { log } from './log.js';

/** Whether YouTube has hidden the <video> (display none, or moved off screen to a negative top). */
function isPlayerHidden(video) {
  return video.style.display === 'none' || (video.style.top && video.style.top.indexOf('-') === 0);
}

// The page classifyPage() saw last: the player fix works on 'WATCH' only.
let lastPageType = null;

let rafPending = false;
let rafTargetVideo = null;

// The screen size as CSS lengths, read once and on resize rather than on
// every style mutation of the <video>.
const screenSize = { w: '', h: '' };

/** Reads the window size, in px, for the screensaver check. */
function readScreenSize() {
  screenSize.w = `${window.innerWidth}px`;
  screenSize.h = `${window.innerHeight}px`;
}
readScreenSize();
window.addEventListener('resize', readScreenSize);

const playerCtrlObs = new MutationObserver((mutations) => {
  // Only watch page has a full-screen player fix logic.
  if (lastPageType !== 'WATCH') {
    playerCtrlObs.disconnect();
    return;
  }

  const video = mutations[0]?.target;
  // Both of these are normal during navigation teardown, not error conditions.
  if (!video || !(video instanceof HTMLVideoElement) || !video.isConnected) {
    log.debug('Video element gone, disconnecting observer');
    playerCtrlObs.disconnect();
    // The page may still be the watch page with a new <video>: look again.
    // (page-state sends no event for a watch-to-watch change.)
    setTimeout(updateState, 0);
    return;
  }

  // A burst of style mutations is handled once, on the next frame: Chromium 38
  // on webOS 3 pays a reflow per write, so the style is compared with the
  // cached screen size (screenSize, kept current on resize) once per frame.
  rafTargetVideo = video;
  if (rafPending) return;
  rafPending = true;

  requestAnimationFrame(() => {
    rafPending = false;
    const v = rafTargetVideo;
    rafTargetVideo = null;
    if (!v || !v.isConnected || lastPageType !== 'WATCH') return;
    if (isPlayerHidden(v)) return;

    // Read at startup, before the window had a size: read again, and with
    // still no size leave the <video> alone rather than shrink it to nothing.
    if (screenSize.w === '0px' || screenSize.h === '0px') {
      readScreenSize();
      if (screenSize.w === '0px' || screenSize.h === '0px') return;
    }
    const style = v.style;
    const tw = screenSize.w;
    const th = screenSize.h;
    try {
      // Some webOS versions fire a mutation even when assignment is a no-op,
      // causing an infinite loop — only write when the value actually differs.
      if (style.width !== tw) style.width = tw;
      if (style.height !== th) style.height = th;
      if (style.left !== '0px') style.left = '0px';
      if (style.top !== '0px') style.top = '0px';
    } catch (e) {
      log.warn('Error updating video styles:', e);
      playerCtrlObs.disconnect();
    }
  });
});

// The <video> itself, or a subtree mounted with it inside.
const holdsVideo = (node) =>
  node instanceof HTMLVideoElement || !!(node.querySelector && node.querySelector('video'));

let currentVideoElement = null;
// The pending wait for a <video> on the watch page, cancelled on page change
// so its observer does not outlive the page.
let videoWait = null;

/** WATCH, SHORTS or OTHER, from the page classes. */
function classifyPage() {
  if (isWatchPage()) return 'WATCH';
  if (isShortsPage()) return 'SHORTS';
  return 'OTHER';
}

/** Stops following the bound <video>. */
function unbindVideo() {
  playerCtrlObs.disconnect();
  currentVideoElement = null;
}

/** The watch page's <video>, waited for when it has not mounted yet; null when it never does. */
async function findWatchVideo() {
  const video = getVideo();
  if (video) return video;
  // Scoped to the player container where there is one.
  const searchRoot = document.getElementById(SELECTORS.PLAYER_CONTAINER) || document.body;
  const wait = waitForChildAdd(searchRoot, holdsVideo);
  videoWait = wait;
  try {
    // The added node can be a player subtree with the <video> inside.
    const node = await wait.promise;
    return node instanceof HTMLVideoElement ? node : node.querySelector('video');
  } catch (e) {
    // Left the page, or no <video> ever mounted: both ordinary.
    log.debug('No video element to attach to:', e.message);
    return null;
  } finally {
    if (videoWait === wait) videoWait = null;
  }
}

/** Follows the style of the watch page's <video>, once it is there. */
async function bindWatchVideo() {
  try {
    const video = await findWatchVideo();
    // Still on the watch page after the wait, and a different element.
    if (!video || lastPageType !== 'WATCH' || video === currentVideoElement) return;
    if (currentVideoElement) playerCtrlObs.disconnect();
    currentVideoElement = video;
    if (video.isConnected) {
      playerCtrlObs.observe(video, { attributes: true, attributeFilter: ['style'] });
    }
  } catch (e) {
    log.warn('Error attaching to video element:', e);
  }
}

/** The page changed (or the <video> was remounted): the keep-alive and the video binding follow. */
async function updateState() {
  const pageType = classifyPage();
  if (pageType === lastPageType) {
    // Watch to watch: bind a remounted <video>, or one that mounted after the
    // wait for it ran out; a wait still running is left to find it.
    if (pageType !== 'WATCH') return;
    if (currentVideoElement ? currentVideoElement.isConnected : videoWait) return;
    unbindVideo();
  }
  lastPageType = pageType;

  if (videoWait) {
    videoWait.cancel();
    videoWait = null;
  }
  setShortsKeepAlive(pageType === 'SHORTS');
  if (pageType === 'WATCH') await bindWatchVideo();
  else unbindVideo();
}

window.addEventListener('ytaf-page-update', updateState);
// A video-to-video navigation keeps the page type and may replace the <video>.
window.addEventListener('hashchange', updateState);

// Initial Check
if (document.body) updateState();
else document.addEventListener('DOMContentLoaded', updateState);
