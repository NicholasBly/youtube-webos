import { configRead, configAddChangeListener } from './config.js';

let autoLoginChecked = false;
let pageObserver = null;
let currentPageType = null;

function enableAutoNavForAccount() {
  const storageKey = 'yt.leanback.default::AUTONAV_FOR_LIVING_ROOM';
  
  try {
    // Get current storage value
    const currentValue = localStorage.getItem(storageKey);
    
    if (!currentValue) {
      console.warn('Auto login: AUTONAV_FOR_LIVING_ROOM storage key not found');
      return false;
    }
    
    // Parse the current value
    const autonavData = JSON.parse(currentValue);
    
    if (!autonavData.data) {
      console.warn('Auto login: Invalid AUTONAV data structure');
      return false;
    }
    
    // Find the account ID (any key that's not 'guest')
    const accountIds = Object.keys(autonavData.data).filter(key => key !== 'guest');
    
    if (accountIds.length === 0) {
      console.warn('Auto login: No account ID found in AUTONAV data');
      return false;
    }
    
    // Check if any account already has auto-nav enabled
    const hasEnabledAccount = accountIds.some(accountId => autonavData.data[accountId] === true);
    
    if (hasEnabledAccount) {
      console.info('Auto login: Auto-nav already enabled for an account');
      return true; // REMOVED: autoLoginChecked = true; - this was preventing login checks
    }
    
    // Enable auto-nav for the first account found
    const targetAccountId = accountIds[0];
    autonavData.data.guest = true;
    autonavData.data[targetAccountId] = true;
    
    // Save back to localStorage
    localStorage.setItem(storageKey, JSON.stringify(autonavData));
    
    console.info(`Auto login: Enabled auto-nav for account ${targetAccountId}`);
    console.info('Auto login: Modified AUTONAV_FOR_LIVING_ROOM:', autonavData);
    
    return true;
    
  } catch (error) {
    console.error('Auto login: Error modifying AUTONAV storage:', error);
    return false;
  }
}

function disableAutoNavForAccount() {
  const storageKey = 'yt.leanback.default::AUTONAV_FOR_LIVING_ROOM';
  
  try {
    // Get current storage value
    const currentValue = localStorage.getItem(storageKey);
    
    if (!currentValue) {
      console.warn('Auto login: AUTONAV_FOR_LIVING_ROOM storage key not found');
      return false;
    }
    
    // Parse the current value
    const autonavData = JSON.parse(currentValue);
    
    if (!autonavData.data) {
      console.warn('Auto login: Invalid AUTONAV data structure');
      return false;
    }
    
    // Find the account ID (any key that's not 'guest')
    const accountIds = Object.keys(autonavData.data).filter(key => key !== 'guest');
    
    if (accountIds.length === 0) {
      console.warn('Auto login: No account ID found in AUTONAV data');
      return false;
    }
    
    // Disable auto-nav for all accounts (set to false), but leave guest as true
    accountIds.forEach(accountId => {
      autonavData.data[accountId] = false;
    });
    
    // Save back to localStorage
    localStorage.setItem(storageKey, JSON.stringify(autonavData));
    
    console.info('Auto login: Disabled auto-nav for all accounts');
    console.info('Auto login: Modified AUTONAV_FOR_LIVING_ROOM:', autonavData);
    
    autoLoginChecked = false;
    
    return true;
    
  } catch (error) {
    console.error('Auto login: Error disabling AUTONAV storage:', error);
    return false;
  }
}

function sendKeyboardEvent(keyCode, keyName = '') {
  console.info(`Auto login: Sending keyCode ${keyCode} (${keyName})`);
  
  try {
    const events = [
      new KeyboardEvent('keydown', {
        keyCode: keyCode,
        which: keyCode,
        charCode: keyCode === 13 ? 13 : 0,
        bubbles: true,
        cancelable: true
      }),
      new KeyboardEvent('keypress', {
        keyCode: keyCode,
        which: keyCode,
        charCode: keyCode,
        bubbles: true,
        cancelable: true
      }),
      new KeyboardEvent('keyup', {
        keyCode: keyCode,
        which: keyCode,
        charCode: keyCode === 13 ? 13 : 0,
        bubbles: true,
        cancelable: true
      })
    ];
    
    // Try multiple targets for better compatibility
    const targets = [
      document.activeElement,
      document.querySelector('.focused'),
      document.querySelector('[focused]'),
      document.body,
      document,
      window
    ].filter(Boolean);
    
    for (const target of targets) {
      events.forEach(event => {
        try {
          target.dispatchEvent(event);
        } catch (e) {
          // Silently continue to next target
        }
      });
    }
    
    return true;
  } catch (error) {
    console.error('Auto login: Key event dispatch failed:', error);
    return false;
  }
}

function checkForLoginPrompt() {
  if (autoLoginChecked) {
    console.info('Auto login: Already checked, skipping');
    return false;
  }

  const bodyElement = document.body;
  
  if (bodyElement && (bodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR') || 
                    bodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNTS'))) {
    console.info('Auto login: Found account selector page, sending keyboard events');
    
    enableAutoNavForAccount();
    
    // Send keyCode 13 (Enter) first
    sendKeyboardEvent(13, 'Enter');
    
    // Wait 500ms and check if still on account page, then try keyCode 28
    setTimeout(() => {
      const currentBodyElement = document.body;
      if (currentBodyElement && (currentBodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR') || 
                                currentBodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNTS'))) {
        console.info('Auto login: Still on account page, trying keyCode 28');
        sendKeyboardEvent(28, 'webOS Enter');
      } else {
        console.info('Auto login: Successfully navigated away from account page');
      }
    }, 500);
    
    autoLoginChecked = true;
    return true;
  }
  return false;
}

function runAutoLoginCheck() {
  if (!configRead('enableAutoLogin')) {
    console.info('Auto login disabled');
    return;
  }

  console.info('Auto login: Starting 15-second check period');
  
  let checkCount = 0;
  const maxChecks = 30; // 15 seconds with 500ms intervals
  
  const checkInterval = setInterval(() => {
    checkCount++;
    console.info(`Auto login: Check ${checkCount}/${maxChecks}, page type: ${detectPageType()}`);
    
    if (checkForLoginPrompt() || checkCount >= maxChecks) {
      console.info('Auto login: Stopping checks');
      clearInterval(checkInterval);
    }
  }, 500);
}

function detectPageType() {
  const bodyElement = document.body;
  if (!bodyElement) return null;
  
  // Look for specific page type classes
  const classList = bodyElement.classList;
  for (const className of classList) {
    if (className.startsWith('WEB_PAGE_TYPE_')) {
      return className;
    }
  }
  return null;
}

function setupPageChangeObserver() {
  if (pageObserver) {
    pageObserver.disconnect();
  }
  
  pageObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const newPageType = detectPageType();
        
        if (newPageType !== currentPageType) {
          console.info(`Auto login: Page type changed from ${currentPageType} to ${newPageType}`);
          currentPageType = newPageType;
          
          // Reset auto-login flag when page changes to account selection screen
          // FIXED: Correct syntax for checking multiple page types
          if (newPageType === 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR' || newPageType === 'WEB_PAGE_TYPE_ACCOUNTS') {
            console.info('Auto login: Account selector page detected, resetting auto-login flag');
            autoLoginChecked = false;
            runAutoLoginCheck();
          }
        }
      }
    });
  });
  
  // Observe changes to the body's class attribute
  if (document.body) {
    pageObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    // Set initial page type
    currentPageType = detectPageType();
    console.info(`Auto login: Initial page type: ${currentPageType}`);
  }
}

function initAutoLogin() {
  const autoLoginEnabled = configRead('enableAutoLogin');
  
  if (!autoLoginEnabled) {
    console.info('Auto login disabled - disabling auto-nav');
    disableAutoNavForAccount();
    return;
  } else {
    console.info('Auto login enabled - enabling auto-nav');
    enableAutoNavForAccount(); // This no longer sets autoLoginChecked = true
  }

  setupPageChangeObserver();
  
  // Also try to enable auto-nav immediately if we're already on the account selector
  runAutoLoginCheck();
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
    console.info('Auto login enabled - setting up auto-login');
    enableAutoNavForAccount();
    initAutoLogin();
  } else {
    console.info('Auto login disabled - disabling auto-nav');
    disableAutoNavForAccount();
  }
});

export { initAutoLogin };
