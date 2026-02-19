import { configRead, configAddChangeListener } from './config.js';
import { SELECTORS, REMOTE_KEYS, isGuestMode, sendKey, extractLaunchParams } from './utils';

const STORAGE_KEY = 'yt.leanback.default::recurring_actions';
const TARGET_ACTIONS = [
  'startup-screen-account-selector-with-guest',
  'whos_watching_fullscreen_zero_accounts',
  'startup-screen-signed-out-welcome-back'
];

const BYPASS_STYLE_ID = 'login-bypass-css';
let hasBypassed = false;
let pageObserverAttached = false;

/**
 * Disables "Who's watching" by pushing the lastFired date 7 days into the future.
 * Credit: reisxd || https://github.com/reisxd/TizenTube/
 */
function disableWhosWatching() {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (!storedData) return console.warn('Auto login: No recurring actions found');

    const json = JSON.parse(storedData);
    const actions = json.data?.data;

    if (!actions) return;

    const futureDate = Date.now() + (7 * 24 * 60 * 60 * 1000); // +7 days
    let isModified = false;

    for (const key of TARGET_ACTIONS) {
      if (actions[key]) {
        actions[key].lastFired = futureDate;
        isModified = true;
      }
    }

    if (isModified) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
      console.info('Auto login: "Who\'s watching" screens disabled');
    }
  } catch (error) {
    console.error('Auto login: Failed to update settings:', error);
  }
}

function injectBypassCSS() {
    if (document.head && !document.getElementById(BYPASS_STYLE_ID)) {
        const style = document.createElement('style');
        style.id = BYPASS_STYLE_ID;
        style.textContent = `
            .${SELECTORS.ACCOUNT_SELECTOR},
            ytlr-account-selector,
            .ytlr-account-selector,
            [class*="account-selector"] {
                opacity: 0 !important;
                visibility: hidden !important;
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

function finalizeBypass() {
    console.info('[Auto Login] Bypass: Done. Cleaning up...');
    setTimeout(() => {
        const style = document.getElementById(BYPASS_STYLE_ID);
        if (style) style.remove();
        hasBypassed = false; 
    }, 2000);
}

export function attemptActiveBypass(force = false) {
    const isSelector = document.body && document.body.classList.contains(SELECTORS.ACCOUNT_SELECTOR);
    
    const params = extractLaunchParams();
    const hasParams = params && Object.keys(params).length > 0;

    if (!isSelector && !force) return;
    if (!hasParams && !force && !configRead('enableAutoLogin')) return;
    
    if (hasBypassed) return;

    console.info('[Auto Login] Active Bypass: Selector Detected! Executing sequence...');
    hasBypassed = true;
    injectBypassCSS();

    setTimeout(() => {
        if (isGuestMode()) {
            sendKey(REMOTE_KEYS.DOWN);
            setTimeout(() => { sendKey(REMOTE_KEYS.ENTER); finalizeBypass(); }, 200);
        } else {
            sendKey(REMOTE_KEYS.ENTER);
            finalizeBypass();
        }
    }, 500);
}

function setupActiveBypassListener() {
    if (pageObserverAttached) return;
    window.addEventListener('ytaf-page-update', (evt) => {
        if (evt.detail && evt.detail.isAccountSelector) {
            attemptActiveBypass();
        }
    });
    pageObserverAttached = true;
}

export function initAutoLogin() {
  if (configRead('enableAutoLogin')) {
    console.info('[Auto Login] Initializing...');
    disableWhosWatching();
    setupActiveBypassListener();
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', initAutoLogin)
  : initAutoLogin();

configAddChangeListener('enableAutoLogin', ({ detail }) => {
  if (detail.newValue) {
    console.info('Auto login setting enabled');
    initAutoLogin();
  } else {
    console.info('Auto login disabled');
  }
});