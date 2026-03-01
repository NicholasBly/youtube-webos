const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

export const SELECTORS = {
  PLAYER_ID: 'ytlr-player__player-container-player',
  PLAYER_CONTAINER: 'ytlr-player__player-container',
  WATCH_PAGE_CLASS: 'WEB_PAGE_TYPE_WATCH',
  SHORTS_PAGE_CLASS: 'WEB_PAGE_TYPE_SHORTS',
  ACCOUNT_SELECTOR: 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR',
  SEARCH_PAGE_CLASS: 'WEB_PAGE_TYPE_SEARCH'
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

let _isWatchPage = false;
let _isShortsPage = false;
let _isAccountSelectorPage = false;
let _isSearchPage = false;

// Cache document.body to avoid DOM lookup overhead if used frequently
let _body = typeof document !== 'undefined' ? document.body : null;

function updatePageState() {
    if (!_body) {
        _body = document.body;
        if (!_body) return;
    }
    
    const cl = _body.classList;
    const newWatch = cl.contains(SELECTORS.WATCH_PAGE_CLASS);
    const newShorts = cl.contains(SELECTORS.SHORTS_PAGE_CLASS);
	const newAccountSelector = cl.contains(SELECTORS.ACCOUNT_SELECTOR);
	const newSearch = cl.contains(SELECTORS.SEARCH_PAGE_CLASS);
    
    if (newWatch === _isWatchPage && 
        newShorts === _isShortsPage && 
        newAccountSelector === _isAccountSelectorPage &&
        newSearch === _isSearchPage) return;

    _isWatchPage = newWatch;
    _isShortsPage = newShorts;
    _isAccountSelectorPage = newAccountSelector;
	_isSearchPage = newSearch;
    
    window.dispatchEvent(new CustomEvent('ytaf-page-update', { 
        detail: { 
            isWatch: _isWatchPage, 
            isShorts: _isShortsPage,
            isAccountSelector: _isAccountSelectorPage,
			isSearch: _isSearchPage
        } 
    }));
}

if (typeof document !== 'undefined') {
	const initObserver = () => {
		_body = document.body;
		const pageObserver = new MutationObserver((mutations) => {
			for (let m of mutations) {
				if (m.target.className !== m.oldValue) {
					updatePageState();
					break;
				}
			}
		});
		pageObserver.observe(_body, { 
			attributes: true, 
			attributeFilter: ['class'],
			attributeOldValue: true 
		});
		updatePageState();
	};

	if (document.body) {
		initObserver();
	} else {
		document.addEventListener('DOMContentLoaded', initObserver);
	}
}

export const isWatchPage = () => _isWatchPage;
export const isShortsPage = () => _isShortsPage;
export const isSearchPage = () => _isSearchPage;

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
        return (cachedGuestMode = true);
      }
      return (cachedGuestMode = false); 
    }
    
    const autoNav = window.localStorage.getItem('yt.leanback.default::AUTONAV_FOR_LIVING_ROOM');
    if (autoNav) {
      const parsed = JSON.parse(autoNav);
      if (parsed?.data?.guest === true) {
        return (cachedGuestMode = true);
      }
    }
    
    return (cachedGuestMode = false);
  } catch (e) {
    return (cachedGuestMode = false);
  }
}

// Define Property Descriptor factory to reduce object allocation
const createDescriptor = (val) => ({ get: () => val });

// Feature Detect once at startup
let createEventStrategy;

try {
    // Check if modern constructor works
    new KeyboardEvent('keydown');
    createEventStrategy = (type, opts) => new KeyboardEvent(type, opts);
} catch (e) {
    // Fallback for webOS 3.0 / Legacy
    createEventStrategy = (type, opts) => {
        const evt = document.createEvent('KeyboardEvent');
        if (evt.initKeyboardEvent) {
             evt.initKeyboardEvent(type, true, false, window, opts.key, 0, '', false);
        } else {
             evt.initEvent(type, true, true);
        }
        return evt;
    };
}

export function sendKey(keyDef, target = document.body) {
  if (!keyDef?.code) { 
      if (process.env.NODE_ENV !== 'production') console.warn('[Utils] Invalid key definition');
      return; 
  }

  const eventOpts = {
    bubbles: true, cancelable: false, composed: true, view: window,
    key: keyDef.key, code: keyDef.key, keyCode: keyDef.code, which: keyDef.code, charCode: keyDef.charCode || 0
  };

  const keyDownEvt = createEventStrategy('keydown', eventOpts);
  const keyUpEvt = createEventStrategy('keyup', eventOpts);

  const codeDesc = createDescriptor(keyDef.code);
  const charDesc = createDescriptor(keyDef.charCode || 0);

  Object.defineProperties(keyDownEvt, { keyCode: codeDesc, which: codeDesc, charCode: charDesc });
  Object.defineProperties(keyUpEvt,   { keyCode: codeDesc, which: codeDesc, charCode: charDesc });

  target.dispatchEvent(keyDownEvt);
  target.dispatchEvent(keyUpEvt);
}

let cachedLaunchParams = null;

export function extractLaunchParams() {
  if (cachedLaunchParams) return cachedLaunchParams;
  
  if (window.launchParams) {
    try {
      cachedLaunchParams = JSON.parse(window.launchParams);
      return cachedLaunchParams;
    } catch (e) {
      console.warn('Failed to parse launchParams', e);
    }
  }
  return (cachedLaunchParams = {});
}

function getYTURL() {
  const ytURL = new URL('https://www.youtube.com/tv#/');
  ytURL.searchParams.set('env_forceFullAnimation', '1');
  ytURL.searchParams.set('env_enableWebSpeech', '1');
  ytURL.searchParams.set('env_enableVoice', '1');
  return ytURL;
}

function concatSearchParams(a, b) {
    b.forEach((value, key) => { a.append(key, value); });
    return a;
}

export function handleLaunch(params) {
  console.info('handleLaunch', params);
  let ytURL = getYTURL();
  let { target, contentTarget = target } = params;

  if (typeof contentTarget === 'string') {
      if (contentTarget.startsWith(ytURL.origin)) {
        ytURL = new URL(contentTarget);
      } else {
        if (contentTarget.startsWith('v=v=')) contentTarget = contentTarget.substring(2);
        
        concatSearchParams(ytURL.searchParams, new URLSearchParams(contentTarget));
      }
  } else if (typeof contentTarget === 'object') {
      const { intent, intentParam } = contentTarget;
      const search = ytURL.searchParams;
      const voiceContentIntent = intent.match(CONTENT_INTENT_REGEX)?.[0]?.toLowerCase();

      search.set('inApp', true);
      search.set('vs', 9); 
      if (voiceContentIntent) search.set('va', voiceContentIntent);
      search.append('launch', 'voice');
      if (voiceContentIntent === 'search') search.append('launch', 'search');
      search.set('vq', intentParam);
  }

  window.location.href = ytURL.toString();
}

export async function waitForChildAdd(parent, predicate, observeAttributes, abortSignal, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    
    const obs = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const mut = mutations[i];
        
        if (mut.type === 'attributes') {
          if (predicate(mut.target)) {
            cleanup();
            resolve(mut.target);
            return;
          }
        } else if (mut.type === 'childList') {
          const addedNodes = mut.addedNodes;
          for (let j = 0; j < addedNodes.length; j++) {
            const node = addedNodes[j];
            if (node.nodeType !== 1) continue; 
            
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

    if (abortSignal) abortSignal.addEventListener('abort', onAbort);

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