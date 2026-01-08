import { configRead, configAddChangeListener } from './config.js';

function disableWhosWatching(enableWhoIsWatchingMenu) { // Credit to reisxd || https://github.com/reisxd/TizenTube/
  try {
    const recurringActionsKey = 'yt.leanback.default::recurring_actions';
    const storedData = localStorage.getItem(recurringActionsKey);
    
    if (!storedData) {
      console.warn('Auto login: No recurring actions data found in localStorage');
      return;
    }
    
    const LeanbackRecurringActions = JSON.parse(storedData);
    const date = new Date();
    
    if (!enableWhoIsWatchingMenu) {
      // Disable "Who's watching" by setting lastFired to 7 days in the future
      console.info('Auto login: Disabling "Who\'s watching" screen');
      date.setDate(date.getDate() + 7);
      
      // Update all relevant recurring actions
      const actions = LeanbackRecurringActions.data?.data;
      if (actions) {
        if (actions["startup-screen-account-selector-with-guest"]) {
          actions["startup-screen-account-selector-with-guest"].lastFired = date.getTime();
        }
        if (actions.whos_watching_fullscreen_zero_accounts) {
          actions.whos_watching_fullscreen_zero_accounts.lastFired = date.getTime();
        }
        if (actions["startup-screen-signed-out-welcome-back"]) {
          actions["startup-screen-signed-out-welcome-back"].lastFired = date.getTime();
        }
      }
    } else {
      // Enable "Who's watching" but respect the 2-hour cooldown
      console.info('Auto login: Enabling "Who\'s watching" screen with cooldown check');
      
      const actions = LeanbackRecurringActions.data?.data;
      if (actions && actions["startup-screen-account-selector-with-guest"]) {
        const lastFiredTime = actions["startup-screen-account-selector-with-guest"].lastFired;
        const timeDifference = date.getTime() - lastFiredTime;
        const twoHoursInMs = 2 * 60 * 60 * 1000;
        
        // Only update if more than 2 hours have passed or if lastFired is in the future
        if (timeDifference < 0 || timeDifference >= twoHoursInMs) {
          actions["startup-screen-account-selector-with-guest"].lastFired = date.getTime();
          if (actions.whos_watching_fullscreen_zero_accounts) {
            actions.whos_watching_fullscreen_zero_accounts.lastFired = date.getTime();
          }
          if (actions["startup-screen-signed-out-welcome-back"]) {
            actions["startup-screen-signed-out-welcome-back"].lastFired = date.getTime();
          }
        } else {
          console.info('Auto login: Skipping "Who\'s watching" update due to 2-hour cooldown');
          return;
        }
      }
    }
    
    // Save updated data back to localStorage
    localStorage.setItem(recurringActionsKey, JSON.stringify(LeanbackRecurringActions));
    console.info('Auto login: Successfully updated "Who\'s watching" settings');
    
  } catch (error) {
    console.error('Auto login: Failed to update "Who\'s watching" settings:', error);
  }
}

function initAutoLogin() {
  const autoLoginEnabled = configRead('enableAutoLogin');
  
  if (autoLoginEnabled) {
    disableWhosWatching(false);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoLogin);
} else {
  initAutoLogin();
}

// Listen for changes to the auto-login setting
configAddChangeListener('enableAutoLogin', (evt) => {
  if (evt.detail.newValue) {
    console.info('Auto login setting changed');
	initAutoLogin();
  } else {
    console.info('Auto login disabled');
  }
});

export { initAutoLogin };