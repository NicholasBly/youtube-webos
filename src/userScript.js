import 'whatwg-fetch';
import './domrect-polyfill';
import { handleLaunch, SELECTORS, extractLaunchParams } from './utils';
import { attemptActiveBypass } from './auto-login.js';
import { WebOSVersion, simulatorMode } from './webos-utils.js';
import { initBlockWebOSCast } from './block-webos-cast';
import './adblock.js';
import './sponsorblock.js';
import './font-fix.css';
import './thumbnail-quality.js';
import './screensaver-fix';
import './yt-fixes.css';
import './watch.js';

const version = WebOSVersion();

(function oneTimeParamsCheck() {
	const params = extractLaunchParams();
    if (!params || Object.keys(params).length === 0) {
		return;
	}
	else attemptActiveBypass();
})();

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
    if (document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR)) {
        console.info('[Main] Relaunch detected on Account Selector. Triggering bypass.');
        attemptActiveBypass(true);
    }
    handleLaunch(evt.detail);
  },
  true
);

if (version === 25 && simulatorMode === false) {
  console.info('[Main] Enabling webOS Google Cast Block');
  initBlockWebOSCast();
}