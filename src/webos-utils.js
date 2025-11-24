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

    // 1. Definitive DOM Check (Best for "Backported" UI on older OS)
    // The new UI uses <ytlr-app>, <ytlr-progress-bar>, etc.
    // The old UI uses standard <ytd-app> or <div id="player-api">
    if (document.querySelector('ytlr-app') || 
        document.querySelector('ytlr-progress-bar') || 
        document.querySelector('ytlr-multi-markers-player-bar-renderer')) {
        console.log('info', 'New YouTube UI detected via DOM tags');
        cachedNewLayout = true;
        return true;
    }

    const ua = navigator.userAgent;

    // Check Chrome Version (Web/Homebrew App)
    // Chrome 120+ (webOS 25) = New UI
    const chromeMatch = ua.match(/Chrome\/(\d+)/i) || ua.match(/Chromium\/(\d+)/i);
    if (chromeMatch && parseInt(chromeMatch[1]) >= 120) {
        cachedNewLayout = true;
        return true;
    }

    cachedNewLayout = false;
    return false;
}

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
        const ua = navigator.userAgent;
        const chromeMatch = ua.match(/Chrome\/(\d+)/i) || ua.match(/Chromium\/(\d+)/i);
        
        if (chromeMatch) {
            const chromeVersion = parseInt(chromeMatch[1]);
            console.log('info', `Detected Chrome version: ${chromeVersion}`);
            
            let webOSVersion = 24; // Default fallback
            
            if (chromeVersion >= 120) {       
                webOSVersion = 25;
            } else if (chromeVersion >= 108) { 
                webOSVersion = 24;
            } else if (chromeVersion >= 94) {  
                webOSVersion = 23;
            } else if (chromeVersion >= 87) {  
                webOSVersion = 22;
            } else if (chromeVersion >= 79) {  
                webOSVersion = 6;
            } else if (chromeVersion >= 68) {  
                webOSVersion = 5;
            } else if (chromeVersion >= 53) {  
                webOSVersion = 4;
            } else if (chromeVersion >= 38) {  
                webOSVersion = 3;
            } else {
                webOSVersion = 2; 
            }
            
            console.log('info', `Mapped to webOS TV ${webOSVersion} (Chrome ${chromeVersion})`);
            cachedWebOSVersion = webOSVersion;
            return webOSVersion;
        }
        
        cachedWebOSVersion = 24;
        return 24;
    } catch (e) {
        console.log('warn', 'Error detecting webOS version:', e);
        cachedWebOSVersion = 24;
        return 24;
    }
}

export function resetWebOSVersionCache() {
    cachedWebOSVersion = null;
    cachedNewLayout = null;
}

export function getCachedWebOSVersion() {
    return cachedWebOSVersion;
}