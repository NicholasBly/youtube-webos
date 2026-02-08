import 'whatwg-fetch';
import './domrect-polyfill';
import { handleLaunch, sendKey, isGuestMode, REMOTE_KEYS } from './utils';
import { WebOSVersion } from './webos-utils.js';
import { initBlockWebOSCast } from './block-webos-cast'; 
import './adblock.js';
import './sponsorblock.js';
import './font-fix.css';
import './thumbnail-quality.js';
import './screensaver-fix';
import './yt-fixes.css';
import './watch.js';

(function initLoginBypass() {
    console.info('[Main] Bypass: Service started.');
    
    const styleId = 'login-bypass-css';
    const cssContent = `
        .WEB_PAGE_TYPE_ACCOUNT_SELECTOR,
        ytlr-account-selector,
        .ytlr-account-selector,
        [class*="account-selector"] {
            opacity: 0 !important;
            visibility: hidden !important;
            display: none !important;
        }
    `;

    let attempts = 0;
    const maxAttempts = 300; // 30 seconds
    let hasBypassed = false;

    const poller = setInterval(() => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(poller);
            return;
        }

        if (document.head && !document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = cssContent;
            document.head.appendChild(style);
        }

        if (document.body && !hasBypassed && document.body.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR')) {
            console.info('[Main] Bypass: Selector Detected!');
            hasBypassed = true;

            setTimeout(() => {
                if (isGuestMode()) {
                    sendKey(REMOTE_KEYS.DOWN);
                    setTimeout(() => { sendKey(REMOTE_KEYS.ENTER); finalize(); }, 200);
                } else {
                    sendKey(REMOTE_KEYS.ENTER);
                    finalize();
                }
            }, 500);
        }
    }, 100);

    function finalize() {
        console.info('[Main] Bypass: Done. Cleaning up...');
        clearInterval(poller);
        setTimeout(() => {
            const style = document.getElementById(styleId);
            if (style) style.remove();
            
            const player = document.getElementById('movie_player');
            if (player) player.focus();
        }, 2000);
    }
})();

function extractVideoId(params) {
    if (!params) return null;

    if (typeof params === 'string') {
        try {
            if (params.trim().startsWith('{')) {
                const parsed = JSON.parse(params);
                return extractVideoId(parsed);
            }
            if (params.includes('v=')) {
                return extractVideoId({ contentTarget: params });
            }
        } catch (e) { }
    }

    const rawTarget = params.contentTarget || params.target;

    if (typeof rawTarget === 'string' && rawTarget.includes('v=')) {
        let cleanQuery = rawTarget;
        if (cleanQuery.startsWith('v=v=')) cleanQuery = cleanQuery.substring(2);

        const urlParams = new URLSearchParams(cleanQuery);
        return urlParams.get('v');
    }
    return null;
}

function performNavigation(videoId) {
    if (!videoId) return;
    console.info(`[Main] Deep Link: Navigating to ${videoId}`);

    const navPoller = setInterval(() => {
        if (document.body) {
            clearInterval(navPoller);
            // Verify we aren't already there to avoid reload loops
            if (!window.location.hash.includes(videoId)) {
                window.location.hash = `/watch?v=${videoId}`;
            }
        }
    }, 100);
}

(function initDeepLinkParams() {
    console.info('[Main] Deep Link: Scanning...');
    let attempts = 0;
    
    const paramPoller = setInterval(() => {
        attempts++;
        let foundId = null;

        if (window.launchParams) foundId = extractVideoId(window.launchParams);
        if (!foundId && window.PalmSystem && window.PalmSystem.launchParams) {
             foundId = extractVideoId(window.PalmSystem.launchParams);
        }

        if (!foundId && window.location.search) {
             foundId = extractVideoId({ contentTarget: window.location.search });
        }

        if (!foundId && window.location.hash && window.location.hash.includes('/watch?v=')) {
             clearInterval(paramPoller);
             return;
        }

        if (foundId) {
            console.info('[Main] Deep Link: Params captured.');
            clearInterval(paramPoller);
            performNavigation(foundId);
        } else if (attempts > 200) { // 20 seconds
            clearInterval(paramPoller);
            console.info('[Main] Deep Link: No params found (Timeout).');
        }
    }, 100);
})();

document.addEventListener('webOSLaunch', (evt) => {
    const id = extractVideoId(evt.detail);
    if (id) performNavigation(id);
}, true);

document.addEventListener('webOSRelaunch', (evt) => {
    const id = extractVideoId(evt.detail);
    if (id) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        performNavigation(id);
    } else {
        handleLaunch(evt.detail);
    }
}, true);

const version = WebOSVersion();
if (version === 25) {
  initBlockWebOSCast();
}