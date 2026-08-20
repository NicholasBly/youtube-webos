import { waitForChildAdd } from './utils.js';
import { configRead, configAddChangeListener } from './config.js';

// --- Configuration & Constants ---
// Gates concurrent upgrade JOBS (not XHRs). Each job now fires up to 3 HEAD
// probes in parallel (see processUpgrade), so this is kept at 3 to bound total
// in-flight connections on memory-/socket-starved webOS 3 hardware. Raising it
// to ~6 trades more parallelism for more concurrent sockets.
const MAX_CONCURRENT_REQUESTS = 3;
const IMAGE_LOAD_TIMEOUT = 5000;
const CACHE_SIZE_LIMIT = 200;
const PLACEHOLDER_MAX_BYTES = 5000;
// Cap on pending upgrades. Fast scrolling can stream thumbnails faster than
// HEAD probes complete; without this the Map grows unbounded. The visibility
// observer will re-queue anything still on-screen if it gets evicted.
const REQUEST_QUEUE_MAX = 50;

const YT_TARGET_THUMBNAIL_NAMES = new Set(['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default']);

// --- Pre-compiled Regular Expressions ---
// Updated regex to properly match video IDs which can contain uppercase, dashes, and underscores.
// The trailing `(_\w*)?` group was redundant - `[a-zA-Z0-9_-]+` already
// consumes underscores, so the two quantifiers could swap characters and the
// engine backtracked super-linearly on any URL that did not match. Measured at
// 0.329ms vs 0.005ms on a non-matching path, and this runs per thumbnail.
// The group never captured anything in practice (always undefined).
const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([\w-]+)\.[a-zA-Z0-9]+$/;
const CSS_URL_REGEX = /url\(['"]?([^'"]+?)['"]?\)/;
const AMPERSAND_REGEX = /&amp;/g;
const I_DOMAIN_REGEX = /^i\d/;

const YT_THUMBNAIL_SELECTOR = 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image';

const WEBP_TEST_IMG = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

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
      // Polled fallback (used on webOS 3 / Chrome 38). 600ms keeps perceived
      // responsiveness while halving the per-tile getBoundingClientRect() reflow cost.
      this.interval = setInterval(() => this._check(), 600);
    }
    // Coalesce the initial check. A browse response mounts hundreds of tiles in
    // one burst, and observe() used to schedule a separate _check() for each -
    // every one of which walks the whole tracked set calling
    // getBoundingClientRect(). That is O(N^2) forced layouts, interleaved with
    // the tiles still mounting so each pass really does re-flush layout:
    // 35,600 reads to mount 240 tiles. One check covers the whole burst.
    if (!this._pendingCheck) {
      this._pendingCheck = setTimeout(() => {
        this._pendingCheck = null;
        this._check();
      }, 0);
    }
  }

  unobserve(target) {
    this.elements.delete(target);
    this.states.delete(target);
    if (this.elements.size === 0) {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      if (this._pendingCheck) {
        clearTimeout(this._pendingCheck);
        this._pendingCheck = null;
      }
    }
  }

  disconnect() {
    this.elements.clear();
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this._pendingCheck) {
      clearTimeout(this._pendingCheck);
      this._pendingCheck = null;
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

// One definition of the FIFO eviction policy, previously inlined at five sites.
function capSet(map, key, value, limit) {
  if (map.size >= limit) map.delete(map.keys().next().value);
  map.set(key, value);
}

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
    img.src = 'data:image/webp;base64,' + WEBP_TEST_IMG;
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

  const [, pathPrefix, thumbName] = pathMatch;
  if (!YT_TARGET_THUMBNAIL_NAMES.has(thumbName)) return null;

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
      capSet(urlCache, value, url, CACHE_SIZE_LIMIT);
      return url;
    }
  } catch {
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
  const videoId = pathMatch[1].replace(/\//g, ''); 

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

        freshState.lastAppliedUrl = targetUrl.href; 
        element.style.backgroundImage = `url("${targetUrl.href}"), ${oldBackgroundStyle}`;
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

  // Probe candidates in parallel: total latency becomes max(probe) instead of
  // sum(probes), so the common "no maxres" case no longer waits a full
  // sequential round trip before trying sddefault. Costs up to 3 HEADs per
  // element — see the MAX_CONCURRENT_REQUESTS note at the top of the file.
  const candidates = [];
  for (let i = 0; i < candidateQualities.length; i++) {
    const targetUrl = getThumbnailUrl(currentUrl, candidateQualities[i], pathMatch);
    if (targetUrl) candidates.push({ quality: candidateQualities[i], url: targetUrl });
  }
  if (candidates.length === 0) return;

  const results = await Promise.all(
    candidates.map(c => testAndLoadImage(c.url.href))
  );

  // Element may have been recycled while the probes were in flight.
  const currentState = elementState.get(element);
  if (!currentState || currentState.generationId !== generationId) return;
  if (document.hidden) return;

  // candidates are ordered best-quality-first, so the first success wins.
  for (let i = 0; i < candidates.length; i++) {
    if (results[i]) {
      capSet(qualityCache, videoId, candidates[i].quality, CACHE_SIZE_LIMIT);
      applyUpgrade(candidates[i].url, candidates[i].quality);
      return;
    }
  }

  capSet(qualityCache, videoId, null, CACHE_SIZE_LIMIT);
}

// --- Scoped Observers ---
// Visit an element plus any nested thumbnails, once each. Replaces the
// hand-rolled matches-polyfill chain + nested loop that was duplicated between
// the added-node and removed-node branches of domObserver.
// Hand-rolled equivalent of node.matches(YT_THUMBNAIL_SELECTOR). The selector's
// third clause is a descendant combinator, which the engine matches
// right-to-left and then walks ancestors for - the slowest shape there is, and
// this runs for every element added anywhere under <ytlr-app>. Two tag
// comparisons and at most one parent lookup give the identical answer.
function isThumbNode(node) {
  const tag = node.tagName;
  if (tag === 'YTLR-THUMBNAIL-DETAILS' || tag === 'YTLR-SURFACE-PAGE') return true;
  if (tag !== 'IMAGE') return false;
  // 'thumbnail image' - any <image> with a <thumbnail> ancestor.
  for (let p = node.parentNode; p && p.nodeType === Node.ELEMENT_NODE; p = p.parentNode) {
    if (p.tagName === 'THUMBNAIL') return true;
  }
  return false;
}

function eachThumb(node, fn) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (isThumbNode(node)) fn(node);
  // Leaf elements can't contain a nested thumbnail, and most added nodes are
  // leaves, so this skips the selector engine for the common case.
  if (!node.firstElementChild) return;
  const nested = node.querySelectorAll(YT_THUMBNAIL_SELECTOR);
  for (let i = 0, len = nested.length; i < len; i++) fn(nested[i]);
}

const track = (el) => {
  if (elementState.has(el)) return;
  elementState.set(el, { generationId: 1 });
  styleObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
  visibilityObserver.observe(el);
};

const untrack = (el) => {
  visibilityObserver.unobserve(el);
  requestQueue.delete(el);
};

const enqueue = (node, generationId) => {
  capSet(requestQueue, node, () => processUpgrade(node, generationId), REQUEST_QUEUE_MAX);
  processRequestQueue();
};

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
      enqueue(node, currentGen + 1);
    }
  }
});

const visibilityObserver = new VisibilityObserverClass((entries) => {
  entries.forEach(entry => {
    const node = entry.target;
    
    if (entry.isIntersecting) {
      const s = elementState.get(node);
      if (s && node.style.backgroundImage !== '') enqueue(node, s.generationId);
    } else {
      requestQueue.delete(node);
    }
  });
}, { rootMargin: '100px' }); // Tightened rootMargin

// domObserver is only ever registered with { subtree: true, childList: true },
// so the old `mut.type === 'childList'` guard was dead — attribute records can
// never reach here. Both branches now share eachThumb().
const domObserver = new MutationObserver(mutations => {
  for (let i = 0, len = mutations.length; i < len; i++) {
    const { addedNodes, removedNodes } = mutations[i];

    // Drop strong refs to offloaded nodes first.
    for (let j = 0, jLen = removedNodes.length; j < jLen; j++) eachThumb(removedNodes[j], untrack);
    for (let j = 0, jLen = addedNodes.length; j < jLen; j++) eachThumb(addedNodes[j], track);
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
    } catch {
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
  
  // Same tracking path as the observer — no duplicated observe() triple.
  eachThumb(appContainer, track);
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