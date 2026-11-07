// Dev diagnostics, aliased to an empty module unless built with `--env perf`.
// MUST stay first: perf_mon installs "inner" probes underneath every other hook.
import './perf_mon.js';

import 'whatwg-fetch';
import './polyfills.js';
import './domrect-polyfill';
import './adblock.js';
import './hooks/json-stringify';
import './force-codec.js';

import { SELECTORS } from './utils';
import { configAddChangeListener, configRead } from './config.js';
import { handleLaunch, extractLaunchParams } from './launch.js';
import { attemptActiveBypass, resetActiveBypass } from './auto-login.js';
import { isWebOS25, simulatorMode } from './webos-utils.js';
import { initBlockWebOSCast } from './block-webos-cast';
import './app_api/index';
import './ui.js'; // Registers the green-key handler, options panel, video-quality, global styles
import './sponsorblock.js';
import './emoji-font.js';
import './screensaver-fix.js';
import './yt-fixes.css';
import './comments-fix.js';
import './watch.js';
import './lang-settings-fix';

import { initBufferLimit } from './hooks/buffer-limit.js';
import { getWebOSVersion } from './webos-utils.js';

function syncFullAnimations() {
  const url = new URL(window.location.href);
  const flag = 'env_forceFullAnimation';
  if (configRead('fullAnimations') && url.searchParams.get('theme') !== 'k') {
    if (url.searchParams.get(flag) === '1') return;
    url.searchParams.set(flag, '1');
  } else {
    if (!url.searchParams.has(flag)) return;
    url.searchParams.delete(flag);
  }
  window.location.replace(url.toString());
}

configAddChangeListener('fullAnimations', syncFullAnimations);
syncFullAnimations();

if (typeof initBufferLimit === 'function' && getWebOSVersion() <= 4) {
	initBufferLimit();
	console.info('Initiating buffer limit');
}

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