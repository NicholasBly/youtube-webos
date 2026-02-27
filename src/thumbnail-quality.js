import { waitForChildAdd } from './utils'
import { configRead, configAddChangeListener } from './config'

// --- Configuration & Constants ---
const MAX_CONCURRENT_REQUESTS = 3
const IMAGE_LOAD_TIMEOUT = 5000
const CACHE_SIZE_LIMIT = 200

const YT_TARGET_THUMBNAIL_NAMES = [
  'maxresdefault',
  'sddefault',
  'hqdefault',
  'mqdefault',
  'default'
]

const PLACEHOLDER_DIMENSIONS = [
  { width: 120, height: 90 },
  { width: 0, height: 0 }
]

const webpTestImgs = {
  lossy: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
}

// --- State Management ---
let elementState = new WeakMap()
const urlCache = new Map()
const requestQueue = new Set()
let activeRequests = 0

// --- WebP Detection ---
let webpDetectionPromise = null
let webpSupported = false

function detectWebP() {
  return new Promise(resolve => {
    let img = new Image()
    const done = (supported) => {
      webpSupported = supported
      img.onload = null
      img.onerror = null
      img = null 
      resolve()
    }
    img.onload = () => done(img.width > 0 && img.height > 0)
    img.onerror = () => done(false)
    img.src = 'data:image/webp;base64,' + webpTestImgs.lossy
  })
}

function ensureWebpDetection() {
  if (!webpDetectionPromise) webpDetectionPromise = detectWebP()
  return webpDetectionPromise
}

// --- Helpers ---

function getThumbnailUrl(originalUrl, targetQuality) {
  const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-z0-9]+)(_\w*)?\.[a-z]+$/

  if (originalUrl.hostname.match(/^i\d/) !== null) return null

  const match = originalUrl.pathname.match(YT_THUMBNAIL_PATHNAME_REGEX)
  if (!match) return null

  const [, pathPrefix, videoId] = match
  
  if (YT_TARGET_THUMBNAIL_NAMES.indexOf(videoId) === -1) return null

  const extension = webpSupported ? 'webp' : 'jpg'
  const newPathPrefix = webpSupported ? 'vi_webp' : 'vi'

  const newPathname = originalUrl.pathname.replace(
    YT_THUMBNAIL_PATHNAME_REGEX,
    `${newPathPrefix}${pathPrefix}${targetQuality}.${extension}`
  )

  if (originalUrl.pathname === newPathname) return null

  const newUrl = new URL(originalUrl)
  newUrl.pathname = newPathname
  newUrl.search = ''
  return newUrl
}

function parseCSSUrl(value) {
  if (!value) return undefined
  
  if (value.indexOf('&amp;') !== -1) {
    value = value.replace(/&amp;/g, '&')
  }

  if (urlCache.has(value)) return urlCache.get(value)

  try {
    if (value.indexOf('url(') === -1) return undefined

    const match = value.match(/url\(['"]?([^'"]+?)['"]?\)/)
    if (match && match[1]) {
      const url = new URL(match[1])
      
      if (urlCache.size >= CACHE_SIZE_LIMIT) {
        const firstKey = urlCache.keys().next().value
        urlCache.delete(firstKey)
      }
      
      urlCache.set(value, url)
      return url
    }
  } catch (e) {
    // Invalid URL
  }
  return undefined
}

function isPlaceholderImage(img) {
  return PLACEHOLDER_DIMENSIONS.some(
    dim => img.naturalWidth === dim.width && img.naturalHeight === dim.height
  )
}

// --- Image Loading ---

function probeImage(url) {
  return new Promise((resolve) => {
    let img = new Image()
    let completed = false
    let timer = null

    const cleanup = () => {
      completed = true
      if (timer) clearTimeout(timer)
      if (img) {
        img.onload = null
        img.onerror = null
        img.src = ''
        img = null
      }
    }

    timer = setTimeout(() => {
      if (!completed) {
        cleanup()
        resolve(null)
      }
    }, IMAGE_LOAD_TIMEOUT)

    img.onload = () => {
      if (!completed) {
        const isPlaceholder = isPlaceholderImage(img)
        const success = !isPlaceholder
        cleanup()
        resolve({ success })
      }
    }

    img.onerror = () => {
      if (!completed) {
        cleanup()
        resolve(null)
      }
    }

    img.src = url
  })
}

// --- Request Queue & Processor ---

function processRequestQueue() {
  if (document.hidden || requestQueue.size === 0 || activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return
  }

  const job = requestQueue.values().next().value
  requestQueue.delete(job)
  activeRequests++

  job()
    .finally(() => {
      activeRequests--
      processRequestQueue()
    })
}

async function processUpgrade(element, generationId) {
  if (!document.contains(element)) return

  const state = elementState.get(element)
  if (!state || state.generationId !== generationId) return

  const style = element.style
  const oldBackgroundStyle = style.backgroundImage
  const currentUrl = parseCSSUrl(oldBackgroundStyle)
  
  if (!currentUrl) return

  const videoIdMatch = currentUrl.pathname.match(/\/vi(?:_webp)?\/([^/]+)\//)
  if (!videoIdMatch) return
  const videoId = videoIdMatch[1]

  if (
    element.dataset.thumbVideoId === videoId &&
    element.dataset.thumbBestQuality &&
    currentUrl.href.indexOf(element.dataset.thumbBestQuality) !== -1
  ) {
    return
  }

  await ensureWebpDetection()

  const candidateQualities = ['maxresdefault', 'sddefault', 'hqdefault']

  for (const quality of candidateQualities) {
    const currentState = elementState.get(element)
    if (!currentState || currentState.generationId !== generationId) return
    if (document.hidden) return

    const targetUrl = getThumbnailUrl(currentUrl, quality)
    if (!targetUrl) continue

    const result = await probeImage(targetUrl.href)

    if (result && result.success) {
      const freshState = elementState.get(element)
      if (
        document.contains(element) && 
        freshState && freshState.generationId === generationId &&
        element.style.backgroundImage === oldBackgroundStyle
      ) {
        style.backgroundImage = `url("${targetUrl.href}"), ${oldBackgroundStyle}`
        element.dataset.thumbVideoId = videoId
        element.dataset.thumbBestQuality = quality
      }
      return 
    }
  }
}

// --- Fallback Visibility Detection (webOS 3) ---

const observedElements = new Set()
let scrollCheckTimeout = null

function runFallbackCheck() {
  if (observedElements.size === 0) return

  const rootMargin = 200
  const winHeight = window.innerHeight
  const winWidth = window.innerWidth

  // Safely iterate by converting to array
  const elements = Array.from(observedElements)

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]

    // 1. Strict Garbage Collection:
    // Only remove if the node is physically gone from the DOM.
    // We do NOT remove "off-screen" elements, because if the user scrolls
    // back to them, they need to be checked again.
    if (!document.contains(element)) {
      observedElements.delete(element)
      continue
    }

    // 2. Check Visibility
    const rect = element.getBoundingClientRect()
    const isVisible = (
      rect.top < winHeight + rootMargin &&
      rect.bottom > -rootMargin &&
      rect.left < winWidth &&
      rect.right > 0
    )

    if (isVisible) {
      const state = elementState.get(element)
      if (state) {
        const job = () => processUpgrade(element, state.generationId)
        requestQueue.add(job)
        processRequestQueue()
      }
    }
  }
}

function handleScrollForFallback() {
  // Clear existing timeout
  if (scrollCheckTimeout) clearTimeout(scrollCheckTimeout)
  
  // Debounce - run 500ms after scroll stops
  // This delay makes it safe to check the entire Set without lagging
  scrollCheckTimeout = setTimeout(() => {
    runFallbackCheck()
    scrollCheckTimeout = null
  }, 500)
}

// --- IntersectionObserver with Fallback ---

const intersectionObserver = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const element = entry.target
          const state = elementState.get(element)
          if (state) {
            const job = () => processUpgrade(element, state.generationId)
            requestQueue.add(job)
            processRequestQueue()
          }
        }
      }
    }, { rootMargin: '200px' })
  : null

function observeNode(node) {
  if (intersectionObserver) {
    intersectionObserver.observe(node)
  } else {
    observedElements.add(node)
  }
}

// --- MutationObserver ---

const dummy = document.createElement('div')

const mutationObserver = new MutationObserver(mutations => {
  const YT_THUMBNAIL_ELEMENT_TAG = 'ytlr-thumbnail-details'

  for (const mut of mutations) {
    if (mut.type === 'attributes') {
      const node = mut.target
      
      // Safety check for matches support
      if (node.matches && node.matches(YT_THUMBNAIL_ELEMENT_TAG)) {
        dummy.style.cssText = mut.oldValue || ''
        
        if (
          node.style.backgroundImage !== '' &&
          node.style.backgroundImage !== dummy.style.backgroundImage
        ) {
          const s = elementState.get(node)
          const currentGen = s ? s.generationId : 0
          elementState.set(node, { generationId: currentGen + 1 })
          
          // Check visibility immediately for new items (fixes initial load)
          const rect = node.getBoundingClientRect()
          const rootMargin = 200
          const isVisible = (
            rect.top < window.innerHeight + rootMargin &&
            rect.bottom > -rootMargin &&
            rect.left < window.innerWidth &&
            rect.right > 0
          )

          if (isVisible) {
            const state = elementState.get(node)
            if (state) {
              const job = () => processUpgrade(node, state.generationId)
              requestQueue.add(job)
              processRequestQueue()
            }
          }

          observeNode(node)
        }
      }
    } else if (mut.type === 'childList') {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches && node.matches(YT_THUMBNAIL_ELEMENT_TAG)) {
            elementState.set(node, { generationId: 1 })
            observeNode(node)
          } else if (node.firstElementChild) {
            const nested = node.querySelectorAll(YT_THUMBNAIL_ELEMENT_TAG)
            for(let i=0; i<nested.length; i++) {
               elementState.set(nested[i], { generationId: 1 })
               observeNode(nested[i])
            }
          }
        }
      }
    }
  }
})

// --- Visibility Handling ---

function handleVisibilityChange() {
  if (!document.hidden) {
    processRequestQueue()
    // Trigger check when tab becomes visible again
    if (!intersectionObserver) {
      runFallbackCheck()
    }
  }
}

// --- Lifecycle ---

let isObserving = false

async function enableObserver() {
  if (isObserving) return

  let appContainer = document.querySelector('ytlr-app');

  if (!appContainer) {
    try {
      appContainer = await waitForChildAdd(
        document.body,
        n => n.nodeName === 'YTLR-APP',
        false,
        null,
        2000
      )
    } catch (e) {
      appContainer = document.body
      console.warn('[ThumbnailFix] Container not found, using body')
    }
  }

  console.info(`[ThumbnailFix] Active on: ${appContainer.tagName}`)

  document.addEventListener('visibilitychange', handleVisibilityChange)

  if (!intersectionObserver) {
    console.info('[ThumbnailFix] Using scroll-based fallback for webOS 3 (Chrome 38)')
    window.addEventListener('scroll', handleScrollForFallback, true)
    runFallbackCheck()
  }

  mutationObserver.observe(appContainer, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
    attributeOldValue: true
  })

  isObserving = true
}

export function cleanup() {
  mutationObserver.disconnect()
  
  if (intersectionObserver) {
    intersectionObserver.disconnect()
  } else {
    window.removeEventListener('scroll', handleScrollForFallback, true)
    if (scrollCheckTimeout) {
      clearTimeout(scrollCheckTimeout)
      scrollCheckTimeout = null
    }
  }
  
  observedElements.clear()
  
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  
  isObserving = false
  requestQueue.clear()
  urlCache.clear()
  elementState = new WeakMap()
}

if (configRead('upgradeThumbnails')) enableObserver()

configAddChangeListener('upgradeThumbnails', evt => {
  evt.detail.newValue ? enableObserver() : cleanup()
})