import { configRead, configAddChangeListener } from './config.js';

const STORAGE_KEY = 'yt.leanback.default::recurring_actions';
const TARGET_ACTIONS = [
  'startup-screen-account-selector-with-guest',
  'whos_watching_fullscreen_zero_accounts',
  'startup-screen-signed-out-welcome-back'
];

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

export function initAutoLogin() {
  if (configRead('enableAutoLogin')) {
    disableWhosWatching();
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