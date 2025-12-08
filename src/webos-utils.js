/* src/webos-utils.js */
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
  cachedNewLayout = !!document.querySelector('ytLrAppHost');
  
  if (cachedNewLayout) {
    console.info('[WebOSUtils] New YouTube UI detected');
  }
  
  return cachedNewLayout;
}

/**
 * Detects the webOS version using the User Agent string.
 * Prioritizes firmware version from _TV_O18 pattern (e.g., 33.22.52 = webOS 25).
 * Falls back to Chrome version detection for simulator environments.
 * @returns {number} webOS version number (25, 24, 23, 22, 6, 5, 4, 3, or 0 if unknown)
 */
export function WebOSVersion() {
  if (cachedWebOSVersion !== null) {
    return cachedWebOSVersion;
  }

  const ua = window.navigator.userAgent;

  // Primary detection: Extract firmware version from _TV_O18/x.x.x pattern
  const firmwareMatch = ua.match(/_TV_O18\/(\d+\.\d+\.\d+)/);
  
  if (firmwareMatch) {
    const firmwareVersion = firmwareMatch[1];
    const majorVersion = parseInt(firmwareVersion.split('.')[0], 10);
    
    if (majorVersion >= 33) {
      console.info(`[WebOSUtils] Detected webOS 25 via firmware version: ${firmwareVersion}`);
      cachedWebOSVersion = 25;
      return 25;
    }
    
    // Add additional firmware version mappings here as needed
    console.info(`[WebOSUtils] Found firmware version ${firmwareVersion}, but no mapping available`);
  }

  // Fallback: Chrome version detection (for simulator environments)
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  
  if (chromeMatch) {
    const chromeVersion = parseInt(chromeMatch[1], 10);
    console.info(`[WebOSUtils] Detected Chrome version: ${chromeVersion} (simulator mode)`);
    
    if (chromeVersion >= 120) {
      cachedWebOSVersion = 25;
    } else {
      cachedWebOSVersion = 0;
    }
    
    return cachedWebOSVersion;
  }

  console.warn('[WebOSUtils] Could not detect webOS version from user agent');
  cachedWebOSVersion = 0;
  return 0;
}