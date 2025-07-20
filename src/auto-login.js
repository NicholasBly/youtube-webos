import { configRead } from './config.js';

let autoLoginChecked = false;
let pageObserver = null;
let currentPageType = null;

function enableAutoNavForAccount() {
  if (autoLoginChecked) return false;

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
      autoLoginChecked = true;
      return true;
    }
    
    // Enable auto-nav for the first account found
    const targetAccountId = accountIds[0];
    autonavData.data.guest = true;
    autonavData.data[targetAccountId] = true;
    
    // Save back to localStorage
    localStorage.setItem(storageKey, JSON.stringify(autonavData));
    
    console.info(`Auto login: Enabled auto-nav for account ${targetAccountId}`);
    console.info('Auto login: Modified AUTONAV_FOR_LIVING_ROOM:', autonavData);
    
    autoLoginChecked = true;
    return true;
    
  } catch (error) {
    console.error('Auto login: Error modifying AUTONAV storage:', error);
    return false;
  }
}

function checkForLoginPrompt() {
  if (autoLoginChecked) return false;

  const bodyElement = document.body;
  
  if (bodyElement) { // if YouTube app is loaded
    return enableAutoNavForAccount();
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
          if (newPageType === 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR') {
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
  if (!configRead('enableAutoLogin')) {
    console.info('Auto login disabled');
    return;
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

export { initAutoLogin };
