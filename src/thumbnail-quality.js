import { waitForChildAdd } from "./utils"
import { configRead, configAddChangeListener } from "./config"

const webpTestImgs = {
  lossy: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  lossless: "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
  alpha:
    "UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==",
  animation:
    "UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA"
}

// --- WebP Detection Optimization (Singleton) ---
let webpDetectionPromise = null
let webpSupported = false

function detectWebP() {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      webpSupported = img.width > 0 && img.height > 0
      resolve()
    }
    img.onerror = () => {
      webpSupported = false
      resolve()
    }
    img.src = "data:image/webp;base64," + webpTestImgs.lossy
  })
}

function ensureWebpDetection() {
  if (!webpDetectionPromise) {
    webpDetectionPromise = detectWebP()
  }
  return webpDetectionPromise
}

// --- Constants & Regex ---
const YT_TARGET_THUMBNAIL_NAMES = [
  "maxresdefault",
  "sddefault",
  "hqdefault",
  "mqdefault",
  "default"
]

// Placeholder dimensions that YouTube uses for unavailable thumbnails (Soft 404)
const PLACEHOLDER_DIMENSIONS = [
  { width: 120, height: 90 },
  { width: 0, height: 0 }
]

function isThumbnailName(value) {
  return YT_TARGET_THUMBNAIL_NAMES.includes(value)
}

function getThumbnailUrl(originalUrl, targetQuality) {
  const YT_THUMBNAIL_PATHNAME_REGEX = /vi(?:_webp)?(\/.*?\/)([a-z0-9]+?)(_\w*?)?\.[a-z]+$/g

  // Ignore A/B test hostnames (e.g. i1.ytimg.com) as they handle redirects differently
  if (originalUrl.hostname.match(/^i\d/) !== null) return null

  const replacementPathname = originalUrl.pathname.replace(
    YT_THUMBNAIL_PATHNAME_REGEX,
    (match, p1, p2, p3) => {
      if (!isThumbnailName(p2)) return match

      const newPath = p1 // Video ID part
      const extension = webpSupported ? "webp" : "jpg"
      const pathPrefix = webpSupported ? "vi_webp" : "vi"

      return `${pathPrefix}${newPath}${targetQuality}${p3 ?? ""}.${extension}`
    }
  )

  if (originalUrl.pathname === replacementPathname) return null

  const newUrl = new URL(originalUrl)
  newUrl.pathname = replacementPathname
  newUrl.search = ""
  return newUrl
}

function parseCSSUrl(value) {
  try {
    const urlString = value.slice(4, -1).replace(/["']/g, "")
    return new URL(urlString)
  } catch (e) {
    return undefined
  }
}

function isPlaceholderImage(img) {
  return PLACEHOLDER_DIMENSIONS.some(
    dim => img.naturalWidth === dim.width && img.naturalHeight === dim.height
  )
}

// --- Main Logic ---

async function upgradeBgImg(element) {
  if (!element.isConnected) return

  const style = element.style
  if (!style.backgroundImage) return

  const currentUrl = parseCSSUrl(style.backgroundImage)
  if (!currentUrl) return

  const videoIdMatch = currentUrl.pathname.match(/\/vi(?:_webp)?\/([^\/]+)\//)
  if (!videoIdMatch) return
  const videoId = videoIdMatch[1]

  // Skip if we already found the best quality for THIS specific video ID
  if (
    element.dataset.thumbVideoId === videoId &&
    element.dataset.thumbBestQuality &&
    currentUrl.href.includes(element.dataset.thumbBestQuality)
  ) {
    return
  }

  await ensureWebpDetection()

  const candidateQualities = ["maxresdefault", "sddefault", "hqdefault"]

  const tryNextQuality = index => {
    if (index >= candidateQualities.length) return // Exhausted options

    const quality = candidateQualities[index]
    const targetUrl = getThumbnailUrl(currentUrl, quality)

    if (!targetUrl) {
      tryNextQuality(index + 1)
      return
    }

    const img = new Image()

    img.onload = () => {
      // 1. Check for Soft 404 (Placeholder)
      if (isPlaceholderImage(img)) {
        tryNextQuality(index + 1)
        return
      }

      // 2. Safety Check: Did the element change while we were loading?
      const curr = parseCSSUrl(style.backgroundImage)
      if (!curr || !curr.pathname.includes(videoId)) {
        return // Element recycled, abort
      }

      // 3. Apply Upgrade
      style.backgroundImage = `url(${targetUrl.href})`

      // 4. Mark as processed
      element.dataset.thumbVideoId = videoId
      element.dataset.thumbBestQuality = quality
    }

    img.onerror = () => {
      // Hard 404 (Network Error), try next quality
      tryNextQuality(index + 1)
    }

    img.src = targetUrl.href
  }

  tryNextQuality(0)
}

// --- Batching & Observer ---

const dummy = document.createElement("div")
const upgradeQueue = new Set()
let upgradeTimer = null

function queueUpgrade(element) {
  upgradeQueue.add(element)

  if (upgradeTimer !== null) clearTimeout(upgradeTimer)

  // Process batch after 50ms of silence
  upgradeTimer = window.setTimeout(() => {
    upgradeQueue.forEach(upgradeBgImg)
    upgradeQueue.clear()
    upgradeTimer = null
  }, 50)
}

const obs = new MutationObserver(mutations => {
  const YT_THUMBNAIL_ELEMENT_TAG = "ytlr-thumbnail-details"
  const elementsToUpdate = new Set()

  for (const mut of mutations) {
    if (mut.type === "attributes") {
      const node = mut.target
      if (node.matches(YT_THUMBNAIL_ELEMENT_TAG)) {
        dummy.style.cssText = mut.oldValue ?? ""
        // Only trigger if image URL actually changed
        if (
          node.style.backgroundImage !== "" &&
          node.style.backgroundImage !== dummy.style.backgroundImage
        ) {
          elementsToUpdate.add(node)
        }
      }
    } else if (mut.type === "childList") {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches(YT_THUMBNAIL_ELEMENT_TAG)) {
            elementsToUpdate.add(node)
          } else if (node.firstElementChild) {
            const nested = node.querySelectorAll(YT_THUMBNAIL_ELEMENT_TAG)
            nested.forEach(el => elementsToUpdate.add(el))
          }
        }
      }
    }
  }

  elementsToUpdate.forEach(queueUpgrade)
})

let isObserving = false

async function enableObserver() {
  if (isObserving) return

  let appContainer = document.querySelector("ytlr-app");

  if (!appContainer) {
    try {
      // Wait up to 2 seconds for the optimized container
      appContainer = await waitForChildAdd(
        document.body,
        n => n.nodeName === "YTLR-APP",
        false,
        null,
        2000
      )
    } catch (e) {
      // Fallback to body if not found
      appContainer = document.body
      console.warn(
        "[ThumbnailFix] Optimized container not found, falling back to body"
      )
    }
  }

  console.info(`[ThumbnailFix] Observer attached to: ${appContainer.tagName}`)

  obs.observe(appContainer, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
    attributeOldValue: true
  })

  isObserving = true
}

export function cleanup() {
  obs.disconnect()
  isObserving = false
  upgradeQueue.clear()
  if (upgradeTimer !== null) {
    clearTimeout(upgradeTimer)
    upgradeTimer = null
  }
}

if (configRead("upgradeThumbnails")) enableObserver()

configAddChangeListener("upgradeThumbnails", value => {
  value ? enableObserver() : cleanup()
})
