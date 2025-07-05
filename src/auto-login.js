import { configRead } from './config.js';

let autoLoginChecked = false;

function checkForLoginPrompt() {
  if (autoLoginChecked) return;

  const loginPrompt = document.querySelector('yt-formatted-string[id*="ytlr-account-selector"]');
  
  if (loginPrompt && loginPrompt.textContent.includes("Who's watching?")) {
    console.info('Auto login: Found login prompt, pressing OK');
    
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

function initAutoLogin() {
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
      autoLoginChecked = true;
    }
  }, 500);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoLogin);
} else {
  initAutoLogin();
}

export { initAutoLogin };
