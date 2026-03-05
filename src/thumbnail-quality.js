import { waitForChildAdd } from './utils.js';
import { configRead, configAddChangeListener } from './config.js';

// --- Configuration & Constants ---
const MAX_CONCURRENT_REQUESTS = 3;
const IMAGE_LOAD_TIMEOUT = 5000;
const CACHE_SIZE_LIMIT = 200;

const YT_TARGET_THUMBNAIL_NAMES = new Set(['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']);
const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-z0-9]+)(_\w*)?\.[a-z]+$/;
const YT_THUMBNAIL_ELEMENT_TAG = 'ytlr-thumbnail-details';
const PLACEHOLDER_MAX_BYTES = 5000;

const PLACEHOLDER_DIMENSIONS = [
  { width: 120, height: 90 },
  { width: 0, height: 0 }
];

const webpTestImgs = {
  lossy: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
};

// --- State Management ---
let elementState = new WeakMap();
const urlCache = new Map();
const qualityCache = new Map();
const requestQueue = new Set();
let activeRequests = 0;

// --- WebP Detection ---
let webpDetectionPromise = null;
let webpSupported = false;

function detectWebP() {
  return new Promise(resolve => {
    let img = new Image();
    const done = (supported) => {
      webpSupported = supported;
      img.onload = null;
      img.onerror = null;
      img = null; 
      resolve();
    };
    img.onload = () => done(img.width > 0 && img.height > 0);
    img.onerror = () => done(false);
    img.src = 'data:image/webp;base64,' + webpTestImgs.lossy;
  });
}

function ensureWebpDetection() {
  if (!webpDetectionPromise) webpDetectionPromise = detectWebP();
  return webpDetectionPromise;
}

// --- Helpers ---

function getThumbnailUrl(originalUrl, targetQuality) {
  if (originalUrl.hostname.match(/^i\d/) !== null) return null;

  const match = originalUrl.pathname.match(YT_THUMBNAIL_PATHNAME_REGEX);
  if (!match) return null;

  const [, pathPrefix, videoId] = match;
  if (!YT_TARGET_THUMBNAIL_NAMES.has(videoId)) return null;

  const extension = webpSupported ? 'webp' : 'jpg';
  const newPathPrefix = webpSupported ? 'vi_webp' : 'vi';

  const newPathname = originalUrl.pathname.replace(
    YT_THUMBNAIL_PATHNAME_REGEX,
    `${newPathPrefix}${pathPrefix}${targetQuality}.${extension}`
  );

  if (originalUrl.pathname === newPathname) return null;

  const newUrl = new URL(originalUrl);
  newUrl.pathname = newPathname;
  newUrl.search = '';
  return newUrl;
}

function parseCSSUrl(value) {
  if (!value) return undefined;
  
  if (value.indexOf('&amp;') !== -1) {
    value = value.replace(/&amp;/g, '&');
  }

  if (urlCache.has(value)) return urlCache.get(value);

  try {
    if (value.indexOf('url(') === -1) return undefined;

    const match = value.match(/url\(['"]?([^'"]+?)['"]?\)/);
    if (match && match[1]) {
      const url = new URL(match[1]);
      
      if (urlCache.size >= CACHE_SIZE_LIMIT) {
        urlCache.delete(urlCache.keys().next().value);
      }
      
      urlCache.set(value, url);
      return url;
    }
  } catch (e) {
    // Invalid URL
  }
  return undefined;
}

function isPlaceholderImage(img) {
  return PLACEHOLDER_DIMENSIONS.some(
    dim => img.naturalWidth === dim.width && img.naturalHeight === dim.height
  );
}

// --- Image Loading ---

async function probeImage(url) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let timeoutId;

    xhr.open('HEAD', url, true);

    xhr.onload = () => {
      clearTimeout(timeoutId);
      
      if (xhr.status >= 200 && xhr.status < 300) {
        // Filter out YouTube's 120x90 fallback placeholders via file size
        const contentLength = xhr.getResponseHeader('Content-Length');
        if (contentLength && parseInt(contentLength, 10) < PLACEHOLDER_MAX_BYTES) {
          resolve(null);
        } else {
          resolve({ success: true });
        }
      } else {
        // Handle 404s or other server errors
        resolve(null); 
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      resolve(null); // Handle network-level failures
    };

    xhr.send();

    timeoutId = setTimeout(() => {
      xhr.abort();
      resolve(null);
    }, IMAGE_LOAD_TIMEOUT);
  });
}

// --- Request Queue & Processor ---

function processRequestQueue() {
  if (document.hidden || requestQueue.size === 0 || activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return;
  }

  const job = requestQueue.values().next().value;
  requestQueue.delete(job);
  activeRequests++;

  job()
    .finally(() => {
      activeRequests--;
      processRequestQueue();
    });
}

async function processUpgrade(element, generationId) {
  if (!document.contains(element)) return;

  const state = elementState.get(element);
  if (!state || state.generationId !== generationId) return;

  const oldBackgroundStyle = element.style.backgroundImage;
  const currentUrl = parseCSSUrl(oldBackgroundStyle);
  
  if (!currentUrl) return;

  const videoIdMatch = currentUrl.pathname.match(/\/vi(?:_webp)?\/([^/]+)\//);
  if (!videoIdMatch) return;
  const videoId = videoIdMatch[1];

  if (
    element.dataset.thumbVideoId === videoId &&
    element.dataset.thumbBestQuality &&
    currentUrl.href.indexOf(element.dataset.thumbBestQuality) !== -1
  ) {
    return;
  }

  await ensureWebpDetection();
  
  // Helper to safely write to the DOM without layout thrashing
  const applyUpgrade = (targetUrl, quality) => {
    requestAnimationFrame(() => {
      const freshState = elementState.get(element);
      if (
        document.contains(element) && 
        freshState && freshState.generationId === generationId &&
        element.style.backgroundImage === oldBackgroundStyle
      ) {
        element.style.backgroundImage = `url("${targetUrl.href}"), ${oldBackgroundStyle}`;
        element.dataset.thumbVideoId = videoId;
        element.dataset.thumbBestQuality = quality;
      }
    });
  };

  if (qualityCache.has(videoId)) {
    const knownQuality = qualityCache.get(videoId);
    if (knownQuality) {
      const targetUrl = getThumbnailUrl(currentUrl, knownQuality);
      if (targetUrl && currentUrl.href !== targetUrl.href) {
        applyUpgrade(targetUrl, knownQuality);
      }
    }
    return;
  }

  const candidateQualities = ['maxresdefault', 'sddefault', 'hqdefault'];

  for (const quality of candidateQualities) {
    const currentState = elementState.get(element);
    if (!currentState || currentState.generationId !== generationId) return;
    if (document.hidden) return;

    const targetUrl = getThumbnailUrl(currentUrl, quality);
    if (!targetUrl) continue;

    const result = await probeImage(targetUrl.href);

    if (result && result.success) {
      if (qualityCache.size >= CACHE_SIZE_LIMIT) qualityCache.delete(qualityCache.keys().next().value);
      qualityCache.set(videoId, quality);
      applyUpgrade(targetUrl, quality);
      return; 
    }
  }
  
  if (qualityCache.size >= CACHE_SIZE_LIMIT) qualityCache.clear();
  qualityCache.set(videoId, null);
}

// --- Scoped Mutation Observers ---

// 1. Dedicated observer JUST for thumbnail background image changes
const styleObserver = new MutationObserver(mutations => {
  for (const mut of mutations) {
    if (mut.type === 'attributes') {
      const node = mut.target;
      const currentBg = node.style.backgroundImage;
      
      if (!currentBg) continue;

      // Extract the core URL to do a fast string inclusion check against the oldValue
      // This eliminates the need to use a dummy element and the CSS parser
      const urlMatch = currentBg.match(/url\(['"]?([^'"]+?)['"]?\)/);
      
      if (urlMatch) {
        const urlStr = urlMatch[1];
        // If the old inline style string doesn't contain the new URL, it's a genuine change
        if (!mut.oldValue || !mut.oldValue.includes(urlStr)) {
          const s = elementState.get(node);
          const currentGen = s ? s.generationId : 0;
          elementState.set(node, { generationId: currentGen + 1 });
          
          const job = () => processUpgrade(node, currentGen + 1);
          requestQueue.add(job);
          processRequestQueue();
        }
      }
    }
  }
});

// 2. Global observer strictly for finding new elements
const domObserver = new MutationObserver(mutations => {
  for (const mut of mutations) {
    if (mut.type === 'childList') {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          
          const matchesFn = node.matches || node.webkitMatchesSelector || node.mozMatchesSelector || node.msMatchesSelector;
          
          if (matchesFn && matchesFn.call(node, YT_THUMBNAIL_ELEMENT_TAG)) {
            elementState.set(node, { generationId: 1 });
            styleObserver.observe(node, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
            
            if (node.style.backgroundImage !== '') {
              const job = () => processUpgrade(node, 1);
              requestQueue.add(job);
              processRequestQueue();
            }
          } else if (node.firstElementChild) {
            // Use getElementsByTagName instead of querySelectorAll for massive performance gains on live subtrees
            const nested = node.getElementsByTagName(YT_THUMBNAIL_ELEMENT_TAG);
            for(let i=0; i<nested.length; i++) {
               const targetNode = nested[i];
               // Prevent observing the same node multiple times if it moves
               if (elementState.has(targetNode)) continue;

               elementState.set(targetNode, { generationId: 1 });
               styleObserver.observe(targetNode, { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
               
               if (targetNode.style.backgroundImage !== '') {
                 const job = () => processUpgrade(targetNode, 1);
                 requestQueue.add(job);
                 processRequestQueue();
               }
            }
          }
        }
      }
    }
  }
});

// --- Visibility & App State Handling ---

function handleVisibilityChange() {
  if (!document.hidden) {
    processRequestQueue();
  }
}

function handlePageUpdate(e) {
  if (e.detail.isAccountSelector) {
    requestQueue.clear();
  }
}

// --- Lifecycle ---

let isObserving = false;

async function enableObserver() {
  if (isObserving) return;

  let appContainer = document.querySelector('ytlr-app');

  if (!appContainer) {
    try {
      appContainer = await waitForChildAdd(
        document.body,
        n => n.nodeName === 'YTLR-APP',
        false,
        null,
        2000
      );
    } catch (e) {
      appContainer = document.body;
      console.warn('[ThumbnailFix] Container not found, using body');
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('ytaf-page-update', handlePageUpdate);

  domObserver.observe(appContainer, {
    subtree: true,
    childList: true
  });

  isObserving = true;
}

export function cleanup() {
  domObserver.disconnect();
  styleObserver.disconnect();
  window.removeEventListener('ytaf-page-update', handlePageUpdate);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  isObserving = false;
  activeRequests = 0; // Prevent queue stalling on restart
  requestQueue.clear();
  urlCache.clear();
  qualityCache.clear(); // Free up memory
  elementState = new WeakMap();
}

if (configRead('upgradeThumbnails')) enableObserver();

configAddChangeListener('upgradeThumbnails', evt => {
  evt.detail.newValue ? enableObserver() : cleanup();
});