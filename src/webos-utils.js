let cachedIsLegacy = undefined;
let webOS25 = false;
export let simulatorMode = false;
//let cachedNewLayout = null;

/**
 * Detects if the user is using the "New" YouTube UI
 * As of 1/7/2026 the code is no longer needed as YouTube is only using one UI
 * @returns {boolean}
 */
// export function isNewYouTubeLayout() {
  // if (cachedNewLayout !== null) {
    // return cachedNewLayout;
  // }

  // // WebOS 24 / 25 typically uses this tag for the app host
  // cachedNewLayout = !!document.querySelector('gJiGL'); // ytLrAppHost previously
  
  // if (cachedNewLayout) {
    // console.info('[WebOSUtils] New YouTube UI detected');
  // }
  
  // return cachedNewLayout;
// }

/**
 * Detects the webOS version using the User Agent string.
 * Prioritizes firmware version for newer models (webOS 25+).
 * Uses webOS.TV year detection for legacy models (2021 and older).
 * Falls back to Chrome version detection for simulator environments.
 * @returns {number} webOS version number (25, or 5 for legacy/unknown)
 */
export function isWebOS25() {
  if (cachedIsLegacy === undefined) {
    isLegacyWebOS();
  }
  return webOS25;
}
 
export function isLegacyWebOS() {
  if (cachedIsLegacy !== undefined) {
    return cachedIsLegacy;
  }

  const ua = window.navigator.userAgent;

  // 1. Check Firmware Version (Primary for webOS 25+)
  const firmwareMatch = ua.match(/_TV_O18\/(\d+\.\d+\.\d+)/);
  if (firmwareMatch) {
    const firmwareVersion = firmwareMatch[1];
    const majorVersion = parseInt(firmwareVersion.split('.')[0], 10);
    
    // Detect webOS 25 (Firmware major version >= 33)
    if (majorVersion >= 33) {
      console.info(`[WebOSUtils] Detected webOS 25 via firmware version: ${firmwareVersion}`);
	  webOS25 = true;
      return cachedIsLegacy = false;
    }
  }

  // 2. Check Platform Year (Primary for Legacy webOS 3, 4, 5, 6)
  // Format: (webOS.TV-YYYY)
  const platformMatch = ua.match(/webOS\.TV-(\d{4})/);
  if (platformMatch) {
    const year = parseInt(platformMatch[1], 10);

    // If year is 2021 or below, treat as legacy webOS
    if (year <= 2021) {
      console.info(`[WebOSUtils] Detected Legacy webOS via platform year: ${year}`);
      return cachedIsLegacy = true;
    }
  }

  // 3. Fallback: Chrome version detection (for simulator environments)
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  
  if (chromeMatch) {
    const chromeVersion = parseInt(chromeMatch[1], 10);
    console.info(`[WebOSUtils] Detected Chrome version: ${chromeVersion} (simulator mode)`);
    
    simulatorMode = true;
    
    if (chromeVersion >= 120) {
      return cachedIsLegacy = false;
    } else if (chromeVersion <= 79) {
      return cachedIsLegacy = true;
    } else {
      return cachedIsLegacy = null;
    }
  }

  console.warn('[WebOSUtils] Could not detect webOS version from user agent');
  return cachedIsLegacy = null;
}