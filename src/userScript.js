// The script webOS runs inside YouTube's TV site (built as
// webOSUserScripts/userScript.js). It loads every feature, installs the global
// hooks and handles launches and relaunches; the order of the imports below
// is the order things start in (docs/ARCHITECTURE.md).

// The polyfills first: whatwg-fetch reads at load whether URLSearchParams
// exists, and sends a body of one urlencoded only then.
import './polyfills/polyfills.js';
// Dev diagnostics, aliased to an empty module unless built with `--env perf`.
// MUST come before every other module but the polyfills: perf-mon installs
// "inner" probes underneath every other hook.
import './dev/perf-mon.js';

import 'whatwg-fetch';

import {
  installParseHook,
  installStringifyHook,
  startTrackingBlock
} from './features/adblock/index.js';
import { installCodecHooks } from './features/force-codec/index.js';
import { installBufferLimit } from './hooks/buffer-limit.js';

import { SELECTORS } from './core/selectors.js';
import { handleLaunch, extractLaunchParams } from './core/launch.js';
import { attemptActiveBypass, resetActiveBypass } from './features/auto-login/index.js';
import { isWebOS25, simulatorMode, getWebOSVersion } from './core/webos.js';
import { initBlockWebOSCast } from './features/block-webos-cast.ts';
// Each module registers its page listeners as it is imported, so they run in
// this order.
import './features/return-dislike/index.js';
import './features/video-quality/index.js';
import { initLogoStyle } from './features/logo-style.js';
import './ui/index.js';
import './features/sponsorblock/index.js';
import './features/emoji-font/index.js';
import './features/screensaver-fix/index.js';
import './features/comments-fix.js';
import './features/watch/index.js';
import './features/lang-settings-fix.ts';
import { createLogger } from './core/log.js';

const log = createLogger('Main');

// The global hooks, installed once every module has loaded (the codec filter
// runs inside the parse hook). The buffer limit is for webOS 3 and 4 only;
// the webOS 22+ build aliases it away, so the import is undefined there.
installParseHook();
installStringifyHook();
installCodecHooks();
if (typeof installBufferLimit === 'function' && getWebOSVersion() <= 4) {
  installBufferLimit();
  log.info('Initiating buffer limit');
}

// The features that start once the hooks are in: the wordmark style applies
// to the header, and Tracking Block's network hooks follow the adblock flags
// (it rides on Ad Blocking, as the panel shows).
initLogoStyle();
startTrackingBlock();

(function oneTimeParamsCheck() {
  const params = extractLaunchParams();
  if (params && Object.keys(params).length > 0) {
    attemptActiveBypass();
  }
})();

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    log.info('Relaunch:', evt, window.launchParams);
    resetActiveBypass();
    if (document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR)) {
      log.info('Relaunch detected on Account Selector. Triggering bypass.');
      attemptActiveBypass(true);
    }
    handleLaunch(evt.detail);
  },
  true
);

if (isWebOS25() && simulatorMode === false) {
  log.info('Enabling webOS Google Cast Block');
  initBlockWebOSCast();
}
