/* src/utils.js */
const CONTENT_INTENT_REGEX = /^.+(?=Content)/g;

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

// Simple throttle to reduce observer CPU load
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}