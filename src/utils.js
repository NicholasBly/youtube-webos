const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

// Shared Selectors
export const SELECTORS = {
  PLAYER_ID: 'ytlr-player__player-container-player',
  PLAYER_CONTAINER: 'ytlr-player__player-container',
  WATCH_PAGE_CLASS: 'WEB_PAGE_TYPE_WATCH',
  SHORTS_PAGE_CLASS: 'WEB_PAGE_TYPE_SHORTS'
};

export const REMOTE_KEYS = {
  ENTER:  { code: 13,  key: 'Enter' },
  BACK:   { code: 461, key: 'Back' },
  LEFT:   { code: 37,  key: 'ArrowLeft' },
  UP:     { code: 38,  key: 'ArrowUp' },
  RIGHT:  { code: 39,  key: 'ArrowRight' },
  DOWN:   { code: 40,  key: 'ArrowDown' },
  RED:    { code: 403, key: 'Red' },
  GREEN:  { code: 404, key: 'Green' },
  YELLOW: { code: 405, key: 'Yellow' },
  BLUE:   { code: 406, key: 'Blue' },

  0: { code: 48, key: '0' },
  1: { code: 49, key: '1' },
  2: { code: 50, key: '2' },
  3: { code: 51, key: '3' },
  4: { code: 52, key: '4' },
  5: { code: 53, key: '5' },
  6: { code: 54, key: '6' },
  7: { code: 55, key: '7' },
  8: { code: 56, key: '8' },
  9: { code: 57, key: '9' }
};

// --- Centralized Page State Logic ---
// Reduces overhead by using a single MutationObserver for page type detection
let _isWatchPage = false;
let _isShortsPage = false;

function updatePageState() {
    if (!document.body) return;
    const cl = document.body.classList;
    const newWatch = cl.contains(SELECTORS.WATCH_PAGE_CLASS);
    const newShorts = cl.contains(SELECTORS.SHORTS_PAGE_CLASS);
    
    if (newWatch !== _isWatchPage || newShorts !== _isShortsPage) {
        _isWatchPage = newWatch;
        _isShortsPage = newShorts;
        // Dispatch event so other modules can react without their own observers
        window.dispatchEvent(new CustomEvent('ytaf-page-update', { 
            detail: { isWatch: _isWatchPage, isShorts: _isShortsPage } 
        }));
    }
}

// Auto-initialize the watcher
if (typeof document !== 'undefined') {
    if (document.body) {
        const pageObserver = new MutationObserver(updatePageState);
        pageObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        updatePageState();
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const pageObserver = new MutationObserver(updatePageState);
            pageObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            updatePageState();
        });
    }
}

// O(1) Accessors
export const isWatchPage = () => _isWatchPage;
export const isShortsPage = () => _isShortsPage;

// Generic Utilities
export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

let cachedGuestMode = null;

export function isGuestMode() {
  if (cachedGuestMode !== null) return cachedGuestMode;

  try {
    const lastIdentity = window.localStorage.getItem('yt.leanback.default::last-identity-used');
    if (lastIdentity) {
      const parsed = JSON.parse(lastIdentity);
      if (parsed?.data?.identityType === 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST') {
        cachedGuestMode = true;
        return true;
      }
      cachedGuestMode = false;
      return false; 
    }
    const autoNav = window.localStorage.getItem('yt.leanback.default::AUTONAV_FOR_LIVING_ROOM');
    if (autoNav) {
      const parsed = JSON.parse(autoNav);
      if (parsed?.data?.guest === true) {
        cachedGuestMode = true;
        return true;
      }
    }
    
    cachedGuestMode = false;
    return false;
  } catch (e) {
    return false;
  }
}

export function sendKey(keyDef, target = document.body) {
  if (!keyDef || !keyDef.code) {
    console.warn('[Utils] Invalid key definition passed to sendKey');
    return;
  }

  const eventOpts = {
    bubbles: true,
    cancelable: false,
    composed: true,
    view: window,
    key: keyDef.key,
    code: keyDef.key,
    keyCode: keyDef.code,
    which: keyDef.code,
    charCode: keyDef.charCode || 0
  };

  let keyDownEvt, keyUpEvt;

  try {
    // Modern Browser Approach (webOS 4+)
    keyDownEvt = new KeyboardEvent('keydown', eventOpts);
    keyUpEvt = new KeyboardEvent('keyup', eventOpts);
  } catch (e) {
    // Legacy Browser Approach (webOS 3 / Chrome 38)
    keyDownEvt = document.createEvent('KeyboardEvent');
    // initKeyboardEvent arguments: type, canBubble, cancelable, view, keyIdentifier, keyLocation, modifiersList, repeat
    if (keyDownEvt.initKeyboardEvent) {
        keyDownEvt.initKeyboardEvent('keydown', true, false, window, keyDef.key, 0, '', false);
    } else {
        // Very old WebKit fallback
        keyDownEvt.initEvent('keydown', true, true);
    }

    keyUpEvt = document.createEvent('KeyboardEvent');
    if (keyUpEvt.initKeyboardEvent) {
        keyUpEvt.initKeyboardEvent('keyup', true, false, window, keyDef.key, 0, '', false);
    } else {
        keyUpEvt.initEvent('keyup', true, true);
    }
  }

  // Common Property Overrides
  // Both Modern and Legacy often require these to ensure the app "sees" the specific keycode
  Object.defineProperty(keyDownEvt, 'keyCode', { get: () => keyDef.code });
  Object.defineProperty(keyDownEvt, 'which', { get: () => keyDef.code });
  Object.defineProperty(keyDownEvt, 'charCode', { get: () => keyDef.charCode || 0 });
  
  Object.defineProperty(keyUpEvt, 'keyCode', { get: () => keyDef.code });
  Object.defineProperty(keyUpEvt, 'which', { get: () => keyDef.code });
  Object.defineProperty(keyUpEvt, 'charCode', { get: () => keyDef.charCode || 0 });

  target.dispatchEvent(keyDownEvt);
  target.dispatchEvent(keyUpEvt);
}

export function extractLaunchParams() {
  if (window.launchParams) {
    try {
      return JSON.parse(window.launchParams);
    } catch (e) {
      console.warn('Failed to parse launchParams', e);
      return {};
    }
  }
  return {};
}

function getYTURL() {
  const ytURL = new URL('https://www.youtube.com/tv#/');
  ytURL.searchParams.append('env_forceFullAnimation', '1');
  ytURL.searchParams.append('env_enableWebSpeech', '1');
  ytURL.searchParams.append('env_enableVoice', '1');
  return ytURL;
}

function concatSearchParams(a, b) {
  return new URLSearchParams([...a.entries(), ...b.entries()]);
}

export function handleLaunch(params) {
  console.info('handleLaunch', params);
  let ytURL = getYTURL();
  let { target, contentTarget = target } = params;

  switch (typeof contentTarget) {
    case 'string': {
      if (contentTarget.indexOf(ytURL.origin) === 0) {
        ytURL = new URL(contentTarget);
      } else {
        if (contentTarget.indexOf('v=v=') === 0)
          contentTarget = contentTarget.substring(2);

        ytURL.search = concatSearchParams(
          ytURL.searchParams,
          new URLSearchParams(contentTarget)
        );
      }
      break;
    }
    case 'object': {
      const { intent, intentParam } = contentTarget;
      const search = ytURL.searchParams;
      const voiceContentIntent = intent
        .match(CONTENT_INTENT_REGEX)?.[0]
        ?.toLowerCase();

      search.set('inApp', true);
      search.set('vs', 9); 
      if (voiceContentIntent) search.set('va', voiceContentIntent);
      search.append('launch', 'voice');
      if (voiceContentIntent === 'search') search.append('launch', 'search');
      search.set('vq', intentParam);
      break;
    }
  }

  window.location.href = ytURL.toString();
}

/**
 * Wait for a child element to be added.
 * Includes a safety timeout (default 30s) to prevent memory leaks.
 */
export async function waitForChildAdd(
  parent,
  predicate,
  observeAttributes,
  abortSignal,
  timeoutMs = 30000
) {
  return new Promise((resolve, reject) => {
    let timer = null;
    
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        if (mut.type === 'attributes') {
          if (predicate(mut.target)) {
            cleanup();
            resolve(mut.target);
            return;
          }
        } else if (mut.type === 'childList') {
          for (const node of mut.addedNodes) {
            if (predicate(node)) {
              cleanup();
              resolve(node);
              return;
            }
          }
        }
      }
    });

    const cleanup = () => {
        obs.disconnect();
        if (timer) clearTimeout(timer);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
        cleanup();
        reject(new Error('aborted'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort);
    }

    // Safety timeout
    if (timeoutMs > 0) {
        timer = setTimeout(() => {
            cleanup();
            reject(new Error('waitForChildAdd timed out'));
        }, timeoutMs);
    }

    obs.observe(parent, {
      subtree: true,
      attributes: observeAttributes,
      childList: true
    });
  });
}