// webos-utils.js
let cachedWebOSVersion = null;

/**
 * Detects the webOS version based on Chrome version in user agent
 * and caches the result for subsequent calls
 * @returns {number} webOS version number
 */
	export function detectWebOSVersion() {
	if (cachedWebOSVersion !== null) {
        return cachedWebOSVersion;
    }
    try {
        // Check user agent for Chrome version and map to webOS
        const ua = navigator.userAgent;
        
        // Extract Chrome version
        const chromeMatch = ua.match(/Chrome\/(\d+)/i) || ua.match(/Chromium\/(\d+)/i);
        if (chromeMatch) {
            const chromeVersion = parseInt(chromeMatch[1]);
            console.log('info', `Detected Chrome version: ${chromeVersion}`);
            
            // Map Chrome version to webOS version based on the table
            let webOSVersion = 24; // Default fallback
            
            if (chromeVersion == 120) {
                webOSVersion = 25;
            } else if (chromeVersion == 108) {
                webOSVersion = 24;
            } else if (chromeVersion == 94) {
                webOSVersion = 23;
            } else if (chromeVersion == 87) {
                webOSVersion = 22;
            } else if (chromeVersion == 79) {
                webOSVersion = 6; // 6.x
            } else if (chromeVersion == 68) {
                webOSVersion = 5; // 5.x
            } else if (chromeVersion == 53) {
                webOSVersion = 4; // 4.x
            } else if (chromeVersion == 38) {
                webOSVersion = 3; // 3.x
            } else {
                webOSVersion = 2; // 2.x and 1.x don't use Chrome, this needs to be rewritten if 2.x and 1.x need specific detection.
            }
            
            console.log('info', `Mapped to webOS TV ${webOSVersion} (Chrome ${chromeVersion})`);
            return webOSVersion;
        }
        // Default fallback
        console.log('warn', 'Could not detect webOS version, assuming 24');
        return 24;
        
    } catch (e) {
        console.log('warn', 'Error detecting webOS version:', e);
        return 24; // Default to newer version
    }
}

/**
 * Force re-detection of webOS version (useful for testing)
 */
export function resetWebOSVersionCache() {
    cachedWebOSVersion = null;
}

/**
 * Get cached webOS version without re-detecting
 * @returns {number|null} Cached webOS version or null if not detected yet
 */
export function getCachedWebOSVersion() {
    return cachedWebOSVersion;
}