import { configRead, configAddChangeListener } from './config.js';

let autoLoginChecked = false;
let pageObserver = null;
let currentPageType = null;

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
  
  if (bodyElement && bodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR')) {
    console.info('Auto login: Found account selector page, sending keyboard events');
    
    // Send keyCode 13 (Enter) first
    sendKeyboardEvent(13, 'Enter');
    
    // Wait 500ms and check if still on account page, then try keyCode 28
    setTimeout(() => {
      const currentBodyElement = document.body;
      if (currentBodyElement && currentBodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR')) {
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
          // FIXED: Use array includes method for better compatibility
          const accountPageTypes = ['WEB_PAGE_TYPE_ACCOUNT_SELECTOR'];
          if (accountPageTypes.includes(newPageType)) {
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

  setupPageChangeObserver();
  setupResumeDetection();
  
  // Also try to enable auto-nav immediately if we're already on the account selector
  runAutoLoginCheck();
}

function handleAppResume() {
  console.info('Auto login: App resumed from hibernation/background');
  
  // Reset the auto-login flag since we're resuming
  autoLoginChecked = false;
  
  // Wait a short moment for the app to fully resume, then check
  setTimeout(() => {
    runAutoLoginCheck();
  }, 1000);
}

function setupResumeDetection() {
  // Page Visibility API - detects when tab/app becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.info('Auto login: Document became visible');
      handleAppResume();
    }
  });
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
    initAutoLogin();
  } else {
    console.info('Auto login disabled');
  }
});

export { initAutoLogin };