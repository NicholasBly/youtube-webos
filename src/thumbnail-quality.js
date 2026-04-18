import { waitForChildAdd } from './utils.js';
import { configRead, configAddChangeListener } from './config.js';

// --- Configuration & Constants ---
const MAX_CONCURRENT_REQUESTS = 3;
const IMAGE_LOAD_TIMEOUT = 5000;
const CACHE_SIZE_LIMIT = 200;
const PLACEHOLDER_MAX_BYTES = 5000;

const YT_TARGET_THUMBNAIL_NAMES = new Set(['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']);

// --- Pre-compiled Regular Expressions ---
// Updated regex to properly match video IDs which can contain uppercase, dashes, and underscores.
const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-zA-Z0-9_-]+)(_\w*)?\.[a-zA-Z0-9]+$/;
const CSS_URL_REGEX = /url\(['"]?([^'"]+?)['"]?\)/;
const AMPERSAND_REGEX = /&amp;/g;
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
    // Guard against document.hidden and forced reflows for empty lists
    if (this.elements.size === 0 || document.hidden) return;
    
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
function getThumbnailUrl(originalUrl, targetQuality, pathMatch) {
  if (I_DOMAIN_REGEX.test(originalUrl.hostname)) return null;
  if (!pathMatch) return null;

  const [, pathPrefix, videoId] = pathMatch;
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
// Use HEAD request to cut memory/bandwidth overhead
async function testAndLoadImage(url) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', url, true);
    xhr.timeout = IMAGE_LOAD_TIMEOUT;
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const contentLength = parseInt(xhr.getResponseHeader('Content-Length'), 10);
        // Fallback placeholders have very small payloads
        if (!isNaN(contentLength) && contentLength <= PLACEHOLDER_MAX_BYTES) {
          resolve(false); 
        } else {
          resolve(true); 
        }
      } else {
        resolve(false);
      }
    };
    
    xhr.onerror = () => resolve(false);
    xhr.ontimeout = () => resolve(false);
    xhr.send();
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

  job().finally(() => {
    activeRequests--; // Cleanly handled via lifecycle natural drain
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

  // Consolidate Video ID extraction
  const pathMatch = currentUrl.pathname.match(YT_THUMBNAIL_PATHNAME_REGEX);
  if (!pathMatch) return;
  const videoId = pathMatch[2];

  // Cache dataset accesses to prevent garbage generation in Chrome 38
  const ds = element.dataset;

  if (
    ds.thumbVideoId === videoId &&
    ds.thumbBestQuality &&
    currentUrl.href.indexOf(ds.thumbBestQuality) !== -1
  ) {
    return;
  }

  await ensureWebpDetection();
  
  const applyUpgrade = (targetUrl, quality) => {
    requestAnimationFrame(() => {
      const freshState = elementState.get(element);
      if (document.contains(element) && freshState && freshState.generationId === generationId) {
        ds.thumbVideoId = videoId;
        ds.thumbBestQuality = quality;

        // Register explicit URL applied to avoid mutation loop and 150ms setTimeout
        freshState.lastAppliedUrl = targetUrl.href; 
        element.style.backgroundImage = `url("${targetUrl.href}")`;
      }
    });
  };

  if (qualityCache.has(videoId)) {
    const knownQuality = qualityCache.get(videoId);
    if (knownQuality) {
      const targetUrl = getThumbnailUrl(currentUrl, knownQuality, pathMatch);
      if (targetUrl && currentUrl.href !== targetUrl.href) {
        applyUpgrade(targetUrl, knownQuality);
      }
    }
    return;
  }

  const candidateQualities = ['maxresdefault', 'sddefault', 'hqdefault'];

  for (let i = 0, len = candidateQualities.length; i < len; i++) {
    const quality = candidateQualities[i];
    const currentState = elementState.get(element);
    if (!currentState || currentState.generationId !== generationId) return;
    if (document.hidden) return;

    const targetUrl = getThumbnailUrl(currentUrl, quality, pathMatch);
    if (!targetUrl) continue;

    const isValid = await testAndLoadImage(targetUrl.href);

    if (isValid) {
      // Target FIFO deletion rather than full wipe
      if (qualityCache.size >= CACHE_SIZE_LIMIT) qualityCache.delete(qualityCache.keys().next().value);
      qualityCache.set(videoId, quality);
      applyUpgrade(targetUrl, quality);
      return; 
    }
  }
  
  if (qualityCache.size >= CACHE_SIZE_LIMIT) qualityCache.delete(qualityCache.keys().next().value);
  qualityCache.set(videoId, null);
}

// --- Scoped Observers ---
const styleObserver = new MutationObserver(mutations => {
  for (let i = 0, len = mutations.length; i < len; i++) {
    const mut = mutations[i];
    if (mut.type === 'attributes') {
      const node = mut.target;
      const currentBg = node.style.backgroundImage;
      if (!currentBg) continue;

      const s = elementState.get(node);

      // Skip our exact programmatic update
      if (s && s.lastAppliedUrl && currentBg.indexOf(s.lastAppliedUrl) !== -1) {
        s.lastAppliedUrl = null; 
        continue; 
      }

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
}, { rootMargin: '100px' }); // Tightened rootMargin

const domObserver = new MutationObserver(mutations => {
  for (let i = 0, len = mutations.length; i < len; i++) {
    const mut = mutations[i];

    // Disconnect strong refs to offloaded nodes
    if (mut.removedNodes.length > 0) {
      for (let j = 0, jLen = mut.removedNodes.length; j < jLen; j++) {
        const node = mut.removedNodes[j];
        if (node.nodeType === Node.ELEMENT_NODE) {
          const matchesFn = node.matches || node.webkitMatchesSelector || node.mozMatchesSelector || node.msMatchesSelector;
          
          if (matchesFn && matchesFn.call(node, YT_THUMBNAIL_ELEMENT_TAG)) {
            visibilityObserver.unobserve(node);
            requestQueue.delete(node);
          }
          
          const nested = node.getElementsByTagName(YT_THUMBNAIL_ELEMENT_TAG);
          for (let k = 0, kLen = nested.length; k < kLen; k++) {
            visibilityObserver.unobserve(nested[k]);
            requestQueue.delete(nested[k]);
          }
        }
      }
    }

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
  if (!document.hidden) processRequestQueue();
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
  // Remove abrupt zeroing of activeRequests here
  requestQueue.clear();
  urlCache.clear();
  qualityCache.clear(); 
  elementState = new WeakMap();
}

if (configRead('upgradeThumbnails')) {
  // Defer boot cost
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    enableObserver();
  } else {
    window.addEventListener('load', enableObserver);
  }
}

configAddChangeListener('upgradeThumbnails', evt => {
  evt.detail.newValue ? enableObserver() : cleanup();
});