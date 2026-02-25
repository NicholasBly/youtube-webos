import 'whatwg-fetch';
import './domrect-polyfill';
import { handleLaunch, SELECTORS, extractLaunchParams } from './utils';
import { attemptActiveBypass, resetActiveBypass } from './auto-login.js';
import { isWebOS25, simulatorMode } from './webos-utils.js';
import { initBlockWebOSCast } from './block-webos-cast';
import './adblock.js';
import './sponsorblock.js';
import './emoji-font.ts';
import './thumbnail-quality.js';
import './screensaver-fix';
import './yt-fixes.css';
import './watch.js';

(function oneTimeParamsCheck() {
    const params = extractLaunchParams();
    if (params && Object.keys(params).length > 0) {
        attemptActiveBypass();
    }
})();

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
	resetActiveBypass();
    if (document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR)) {
        console.info('[Main] Relaunch detected on Account Selector. Triggering bypass.');
        attemptActiveBypass(true);
    }
    handleLaunch(evt.detail);
  },
  true
);

if (isWebOS25() && simulatorMode === false) {
  console.info('[Main] Enabling webOS Google Cast Block');
  initBlockWebOSCast();
}