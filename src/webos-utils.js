let cachedWebOSVersion = null;
let cachedNewLayout = null;

/**
 * Detects if the user is using the "New" YouTube UI
 * @returns {boolean}
 */
export function isNewYouTubeLayout() {
  if (cachedNewLayout !== null) {
    return cachedNewLayout;
  }

  // WebOS 24 / 25 typically uses this tag for the app host
  cachedNewLayout = !!document.querySelector('gJiGL'); // ytLrAppHost previously
  
  if (cachedNewLayout) {
    console.info('[WebOSUtils] New YouTube UI detected');
  }
  
  return cachedNewLayout;
}

/**
 * Detects the webOS version using the User Agent string.
 * Prioritizes firmware version for newer models (webOS 25+).
 * Uses webOS.TV year detection for legacy models (2021 and older).
 * Falls back to Chrome version detection for simulator environments.
 * @returns {number} webOS version number (25, or 5 for legacy/unknown)
 */
export function WebOSVersion() {
  if (cachedWebOSVersion !== null) {
    return cachedWebOSVersion;
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
      cachedWebOSVersion = 25;
      return 25;
    }
  }

  // 2. Check Platform Year (Primary for Legacy webOS 3, 4, 5, 6)
  // Format: (webOS.TV-YYYY)
  const platformMatch = ua.match(/webOS\.TV-(\d{4})/);
  if (platformMatch) {
    const year = parseInt(platformMatch[1], 10);

    // If year is 2021 or below, treat as legacy webOS (returns 5)
    if (year <= 2021) {
      console.info(`[WebOSUtils] Detected Legacy webOS via platform year: ${year}`);
      cachedWebOSVersion = 5;
      return 5;
    }
  }

  // 3. Fallback: Chrome version detection (for simulator environments)
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  
  if (chromeMatch) {
    const chromeVersion = parseInt(chromeMatch[1], 10);
    console.info(`[WebOSUtils] Detected Chrome version: ${chromeVersion} (simulator mode)`);
    
    if (chromeVersion >= 120) {
      cachedWebOSVersion = 25;
    } else if (chromeVersion <= 79) {
      cachedWebOSVersion = 5;
    } else {
      cachedWebOSVersion = 0;
    }
    
    return cachedWebOSVersion;
  }

  console.warn('[WebOSUtils] Could not detect webOS version from user agent');
  cachedWebOSVersion = 0;
  return 0;
}