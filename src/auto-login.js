import { configRead } from './config.js';

let autoLoginChecked = false;
let pageObserver = null;
let currentPageType = null;

function checkForLoginPrompt() {
  if (autoLoginChecked) return;

  const bodyElement = document.body;
  
  if (bodyElement && bodyElement.classList.contains('WEB_PAGE_TYPE_ACCOUNT_SELECTOR')) {
    console.info('Auto login: Found account selector page, pressing OK');
    
    const keydownEvent = new KeyboardEvent('keydown', {
      charCode: 0,
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    
    const keyupEvent = new KeyboardEvent('keyup', {
      charCode: 0,
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    
    document.dispatchEvent(keydownEvent);
    document.dispatchEvent(keyupEvent);
    
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

  console.info('Auto login: Starting 10-second check period');
  
  let checkCount = 0;
  const maxChecks = 20; // 10 seconds with 500ms intervals
  
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
  
  runAutoLoginCheck();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoLogin);
} else {
  initAutoLogin();
}

export { initAutoLogin };
