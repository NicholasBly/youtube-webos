import 'whatwg-fetch';
import './domrect-polyfill';

import { handleLaunch, sendKey, isGuestMode, REMOTE_KEYS } from './utils';
import { WebOSVersion } from './webos-utils.js';

import { initBlockWebOSCast } from './block-webos-cast'; 

function attemptLoginBypass() {
    console.info('[Main] Bypass: Initializing Detection...');

    // Make the login screen invisible immediately
    const styleId = 'login-bypass-css';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .WEB_PAGE_TYPE_ACCOUNT_SELECTOR,
            ytlr-account-selector,
            .ytlr-account-selector,
            [class*="account-selector"] {
                opacity: 0 !important;
                visibility: hidden !important;
            }
        `;
        document.head.appendChild(style);
    }

    // poll for the body class
    let attempts = 0;
    const maxAttempts = 40; // Approx 10 seconds
    
    const interval = setInterval(() => {
        attempts++;
        
        if (attempts > maxAttempts) {
            console.warn('[Main] Bypass: Timed out waiting for Account Selector.');
            cleanup();
            return;
        }

        if (document.body.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR')) {
            console.info('[Main] Bypass: Account Selector Detected!');
            
            if (isGuestMode()) {
			 sendKey(REMOTE_KEYS.DOWN);
			 setTimeout(() => { sendKey(REMOTE_KEYS.ENTER); finalize(); }, 50);
		} else {
			 sendKey(REMOTE_KEYS.ENTER);
			 finalize();
		}
        }
    }, 250);

    function cleanup() {
        clearInterval(interval);
        const style = document.getElementById(styleId);
        if (style) style.remove();
    }
    
    function finalize() {
        clearInterval(interval);
        setTimeout(() => {
            console.info('[Main] Bypass: Reverting CSS visibility.');
            const style = document.getElementById(styleId);
            if (style) style.remove();
            
            const player = document.getElementById('movie_player');
            if (player) player.focus();
        }, 1000);
    }
}

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);

    const params = evt.detail;
    if (params) {
        const target = params.contentTarget || params.target;
        
        if (typeof target === 'string' && target.includes('v=')) {
            let cleanTarget = target.startsWith('v=v=') ? target.substring(2) : target;
            const urlParams = new URLSearchParams(cleanTarget);
            const videoId = urlParams.get('v');

            if (videoId) {
                console.info(`[Main] Relaunch: Deep linking to video ${videoId}`);

                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();

                window.location.hash = `/watch?v=${videoId}`;

                attemptLoginBypass();
                
                return;
            }
        }
    }

    handleLaunch(evt.detail);
  },
  true
);

import './adblock.js';
import './sponsorblock.js';
import './font-fix.css';
import './thumbnail-quality.js';
import './screensaver-fix';
import './yt-fixes.css';
import './watch.js';

const version = WebOSVersion();

if (version === 25) {
  console.info('[Main] Enabling webOS Google Cast Block');
  initBlockWebOSCast();
}