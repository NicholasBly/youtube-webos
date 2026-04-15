import { waitForChildAdd } from './utils.js';
import { configRead, configAddChangeListener } from './config.js';

// --- Configuration & Constants ---
const MAX_CONCURRENT_REQUESTS = 3;
const IMAGE_LOAD_TIMEOUT = 5000;
const CACHE_SIZE_LIMIT = 200;
const PLACEHOLDER_MAX_BYTES = 5000;

const YT_TARGET_THUMBNAIL_NAMES = new Set(['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']);

// --- Pre-compiled Regular Expressions ---
const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-z0-9]+)(_\w*)?\.[a-z]+$/;
const CSS_URL_REGEX = /url\(['"]?([^'"]+?)['"]?\)/;
const AMPERSAND_REGEX = /&amp;/g;
const VIDEO_ID_EXTRACT_REGEX = /\/vi(?:_webp)?\/([^/]+)\//;
const I_DOMAIN_REGEX = /^i\d/;

const YT_THUMBNAIL_ELEMENT_TAG = 'ytlr-thumbnail-details';

const webpTestImgs = {
  lossy: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
};

// --- Compatibility Fallbacks (WebOS 3 / Chrome 38) ---
const VisibilityObserverClass = window.IntersectionObserver || class {
  constructor(callback, options) {
    this.callback = callback;
    this.elements = new Set();
    this.states = new WeakMap();
    this.margin = options && options.rootMargin ? parseInt(options.rootMargin, 10) || 0 : 0;
    this.interval = null;
  }

  observe(target) {
    this.elements.add(target);
    if (!this.interval) {
      this.interval = setInterval(() => this._check(), 300);
    }
    setTimeout(() => this._check(), 0);
  }

  unobserve(target) {
    this.elements.delete(target);
    this.states.delete(target);
    if (this.elements.size === 0 && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  disconnect() {
    this.elements.clear();
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  _check() {
    if (this.elements.size === 0) return;
    
    const vh = (window.innerHeight || document.documentElement.clientHeight) + this.margin;
    const vw = (window.innerWidth || document.documentElement.clientWidth) + this.margin;
    const entries = [];
    
    this.elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const isIntersecting = (
        rect.width > 0 && rect.height > 0 &&
        rect.top < vh && 
        rect.bottom > -this.margin &&
        rect.left < vw &&
        rect.right > -this.margin
      );
      
      const previousState = this.states.get(el);
      if (previousState !== isIntersecting) {
        this.states.set(el, isIntersecting);
        entries.push({ target: el, isIntersecting: isIntersecting });
      }
    });

    if (entries.length > 0) {
      this.callback(entries);
    }
  }
};

// --- State Management ---
let elementState = new WeakMap();
const urlCache = new Map();
const qualityCache = new Map();
const requestQueue = new Map(); 
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
  if (I_DOMAIN_REGEX.test(originalUrl.hostname)) return null;

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
    value = value.replace(AMPERSAND_REGEX, '&');
  }

  if (urlCache.has(value)) return urlCache.get(value);

  try {
    if (value.indexOf('url(') === -1) return undefined;

    const match = value.match(CSS_URL_REGEX);
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

// --- Image Loading ---
async function probeImage(url) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let timeoutId;

    xhr.open('HEAD', url, true);

    xhr.onload = () => {
      clearTimeout(timeoutId);
      if (xhr.status >= 200 && xhr.status < 300) {
        const contentLength = xhr.getResponseHeader('Content-Length');
        if (contentLength && parseInt(contentLength, 10) < PLACEHOLDER_MAX_BYTES) {
          resolve(null);
        } else {
          resolve({ success: true });
        }
      } else {
        resolve(null); 
      }
    };

    xhr.onerror = () => {
      clearTimeout(timeoutId);
      resolve(null); 
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

  const [element, job] = requestQueue.entries().next().value;
  requestQueue.delete(element);
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

  const videoIdMatch = currentUrl.pathname.match(VIDEO_ID_EXTRACT_REGEX);
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
  
  const applyUpgrade = (targetUrl, quality) => {
    const img = new Image();
    
    img.onload = () => {
      requestAnimationFrame(() => {
        const freshState = elementState.get(element);
        if (
          document.contains(element) && 
          freshState && freshState.generationId === generationId
        ) {
          element.dataset.isUpgrading = "true"; 
          element.style.backgroundImage = `url("${targetUrl.href}")`;
          element.dataset.thumbVideoId = videoId;
          element.dataset.thumbBestQuality = quality;
        }
      });
    };
    img.src = targetUrl.href; 
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

  // Array length cached for older engines
  for (let i = 0, len = candidateQualities.length; i < len; i++) {
    const quality = candidateQualities[i];
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

// --- Scoped Observers ---

const styleObserver = new MutationObserver(mutations => {
  // Array length cached
  for (let i = 0, len = mutations.length; i < len; i++) {
    const mut = mutations[i];
    if (mut.type === 'attributes') {
      const node = mut.target;
      
      if (node.dataset.isUpgrading === "true") {
         node.dataset.isUpgrading = "false";
         continue; 
      }

      const currentBg = node.style.backgroundImage;
      if (!currentBg) continue;

      const s = elementState.get(node);
      const currentGen = s ? s.generationId : 0;
      elementState.set(node, { generationId: currentGen + 1 });
      
      requestQueue.set(node, () => processUpgrade(node, currentGen + 1));
      processRequestQueue();
    }
  }
});

const visibilityObserver = new VisibilityObserverClass((entries) => {
  entries.forEach(entry => {
    const node = entry.target;
    
    if (entry.isIntersecting) {
      const s = elementState.get(node);
      if (s && node.style.backgroundImage !== '') {
        requestQueue.set(node, () => processUpgrade(node, s.generationId));
        processRequestQueue();
      }
    } else {
      requestQueue.delete(node);
    }
  });
}, { rootMargin: '300px' }); 

const domObserver = new MutationObserver(mutations => {
  // Array length cached
  for (let i = 0, len = mutations.length; i < len; i++) {
    const mut = mutations[i];
    if (mut.type === 'childList') {
      const addedNodes = mut.addedNodes;
      for (let j = 0, jLen = addedNodes.length; j < jLen; j++) {
        const node = addedNodes[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          
          const matchesFn = node.matches || node.webkitMatchesSelector || node.mozMatchesSelector || node.msMatchesSelector;
          
          if (matchesFn && matchesFn.call(node, YT_THUMBNAIL_ELEMENT_TAG)) {
            elementState.set(node, { generationId: 1 });
            styleObserver.observe(node, { attributes: true, attributeFilter: ['style'] });
            visibilityObserver.observe(node);
            
          } else if (node.firstElementChild) {
            const nested = node.getElementsByTagName(YT_THUMBNAIL_ELEMENT_TAG);
            for(let k = 0, kLen = nested.length; k < kLen; k++) {
               const targetNode = nested[k];
               if (elementState.has(targetNode)) continue;

               elementState.set(targetNode, { generationId: 1 });
               styleObserver.observe(targetNode, { attributes: true, attributeFilter: ['style'] });
               visibilityObserver.observe(targetNode);
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
  visibilityObserver.disconnect();
  window.removeEventListener('ytaf-page-update', handlePageUpdate);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  
  isObserving = false;
  activeRequests = 0; 
  requestQueue.clear();
  urlCache.clear();
  qualityCache.clear(); 
  elementState = new WeakMap();
}

if (configRead('upgradeThumbnails')) enableObserver();

configAddChangeListener('upgradeThumbnails', evt => {
  evt.detail.newValue ? enableObserver() : cleanup();
});