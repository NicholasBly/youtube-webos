import 'whatwg-fetch';
import './domrect-polyfill';

import { handleLaunch } from './utils';
import { WebOSVersion } from './webos-utils.js';

import { initBlockWebOSCast } from './block-webos-cast'; 

document.addEventListener(
  'webOSRelaunch',
  (evt) => {
    console.info('RELAUNCH:', evt, window.launchParams);
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