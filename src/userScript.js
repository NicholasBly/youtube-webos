import 'whatwg-fetch';
import './domrect-polyfill';

import { handleLaunch, SELECTORS, REMOTE_KEYS, isGuestMode, sendKey, extractLaunchParams } from './utils';
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
	const params = extractLaunchParams();
    if (!params || Object.keys(params).length === 0) {
		return;
	}
    console.info('[Main] Bypass: Service started.');
    
    const styleId = 'login-bypass-css';

    const cssContent = `
        .${SELECTORS.ACCOUNT_SELECTOR},
        ytlr-account-selector,
        .ytlr-account-selector,
        [class*="account-selector"] {
            opacity: 0 !important;
            visibility: hidden !important;
            display: none !important;
        }
    `;

    if (document.head && !document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = cssContent;
        document.head.appendChild(style);
    }

    let hasBypassed = false;

    function runBypass() {
        if (hasBypassed) return;
        
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

    window.addEventListener('ytaf-page-update', (evt) => {
        if (evt.detail && evt.detail.isAccountSelector) {
            runBypass();
        }
    });

    if (document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR)) {
        runBypass();
    }

    function finalize() {
        console.info('[Main] Bypass: Done. Cleaning up...');
        
        setTimeout(() => {
            const style = document.getElementById(styleId);
            if (style) style.remove();
        }, 2000);
    }
})();

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
    handleLaunch(evt.detail);
  },
  true
);

const version = WebOSVersion();

if (version === 25) {
  console.info('[Main] Enabling webOS Google Cast Block');
  initBlockWebOSCast();
}