const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

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

export function sendKey(keyDef, target = document.body) {
  if (!keyDef || !keyDef.code) {
    console.warn('[Utils] Invalid key definition passed to sendKey');
    return;
  }

  const eventOpts = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    key: keyDef.key,
    keyCode: keyDef.code,
    which: keyDef.code,
    charCode: 0
  };

  target.dispatchEvent(new KeyboardEvent('keydown', eventOpts));
  target.dispatchEvent(new KeyboardEvent('keyup', eventOpts));
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