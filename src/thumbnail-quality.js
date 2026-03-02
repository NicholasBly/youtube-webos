import { waitForChildAdd } from './utils.js';
import { configRead, configAddChangeListener } from './config.js';

// --- Configuration & Constants ---
const MAX_CONCURRENT_REQUESTS = 3;
const IMAGE_LOAD_TIMEOUT = 5000;
const CACHE_SIZE_LIMIT = 200;

const YT_TARGET_THUMBNAIL_NAMES = new Set(['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']);

const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-z0-9]+)(_\w*)?\.[a-z]+$/;

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

function probeImage(url) {
  return new Promise((resolve) => {
    let img = new Image();
    let completed = false;
    let timer = null;

    const cleanup = () => {
      completed = true;
      if (timer) clearTimeout(timer);
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.src = '';
        img = null;
      }
    };

    timer = setTimeout(() => {
      if (!completed) {
        cleanup();
        resolve(null);
      }
    }, IMAGE_LOAD_TIMEOUT);

    img.onload = () => {
      if (!completed) {
        const isPlaceholder = isPlaceholderImage(img);
        const success = !isPlaceholder;
        cleanup();
        resolve({ success });
      }
    };

    img.onerror = () => {
      if (!completed) {
        cleanup();
        resolve(null);
      }
    };

    img.src = url;
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

  const style = element.style;
  const oldBackgroundStyle = style.backgroundImage;
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
  
  if (qualityCache.has(videoId)) {
    const knownQuality = qualityCache.get(videoId);
    
    // If we found a better quality previously, apply it instantly
    if (knownQuality) {
      const targetUrl = getThumbnailUrl(currentUrl, knownQuality);
      if (targetUrl && currentUrl.href !== targetUrl.href) {
        style.backgroundImage = `url("${targetUrl.href}"), ${oldBackgroundStyle}`;
        element.dataset.thumbVideoId = videoId;
        element.dataset.thumbBestQuality = knownQuality;
      }
    }
    // Whether it was successful or null, we're done here. No network requests needed.
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
      const freshState = elementState.get(element);
      if (
        document.contains(element) && 
        freshState && freshState.generationId === generationId &&
        element.style.backgroundImage === oldBackgroundStyle
      ) {
        style.backgroundImage = `url("${targetUrl.href}"), ${oldBackgroundStyle}`;
        element.dataset.thumbVideoId = videoId;
        element.dataset.thumbBestQuality = quality;
      }
      return; 
    }
  }
  if (qualityCache.size >= CACHE_SIZE_LIMIT) qualityCache.clear();
  qualityCache.set(videoId, null);
}

// --- Scoped Mutation Observers ---

const YT_THUMBNAIL_ELEMENT_TAG = 'ytlr-thumbnail-details';
const dummy = document.createElement('div');

// 1. Dedicated observer JUST for thumbnail background image changes
const styleObserver = new MutationObserver(mutations => {
  for (const mut of mutations) {
    if (mut.type === 'attributes') {
      const node = mut.target;
      dummy.style.cssText = mut.oldValue || '';
      
      if (
        node.style.backgroundImage !== '' &&
        node.style.backgroundImage !== dummy.style.backgroundImage
      ) {
        const s = elementState.get(node);
        const currentGen = s ? s.generationId : 0;
        elementState.set(node, { generationId: currentGen + 1 });
        
        // Immediately queue up the upgrade, no visibility required
        const state = elementState.get(node);
        if (state) {
          const job = () => processUpgrade(node, state.generationId);
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
        if (node instanceof HTMLElement) {
          // Added webkit fallback for legacy smart TV matches
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
            const nested = node.querySelectorAll(YT_THUMBNAIL_ELEMENT_TAG);
            for(let i=0; i<nested.length; i++) {
               elementState.set(nested[i], { generationId: 1 });
               styleObserver.observe(nested[i], { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
               
               if (nested[i].style.backgroundImage !== '') {
                 const job = () => processUpgrade(nested[i], 1);
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
  requestQueue.clear();
  urlCache.clear();
  elementState = new WeakMap();
}

if (configRead('upgradeThumbnails')) enableObserver();

configAddChangeListener('upgradeThumbnails', evt => {
  evt.detail.newValue ? enableObserver() : cleanup();
});