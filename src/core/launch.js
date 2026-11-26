/**
 * Launch-URL handling, kept apart from the rest of core/.
 *
 * index.js is the tiny bootstrap page that only redirects to youtube.com/tv,
 * so these two functions live here rather than in core/dom.js or remote.js -
 * importing those would drag their module-level side effects onto a page with
 * no YouTube in it.
 */
import '../polyfills/polyfills.js';
import { createLogger } from './log.js';

const log = createLogger('Launch');

const CONTENT_INTENT_REGEX = /^.+(?=Content)/;

let cachedLaunchParams = null;

/**
 * The launch parameters webOS passed to the app (window.launchParams), parsed once; {} when there
 * are none.
 */
export function extractLaunchParams() {
  if (cachedLaunchParams) return cachedLaunchParams;

  if (window.launchParams) {
    try {
      cachedLaunchParams = JSON.parse(window.launchParams);
      return cachedLaunchParams;
    } catch (e) {
      log.warn('Failed to parse launchParams', e);
    }
  }
  return (cachedLaunchParams = {});
}

/**
 * Whether launch parameters ask for something to open: a deep link, a cast
 * (DIAL), a search or a voice intent, all of which come as `target` or
 * `contentTarget`. A plain relaunch (back from another app, or the app icon
 * pressed again) carries neither.
 */
export function hasLaunchTarget(params) {
  const { target, contentTarget } = params ?? {};
  return !!(target || contentTarget);
}

/**
 * The YouTube TV start URL, with the flags the app always sets (full animation, web speech, voice).
 */
function getYTURL() {
  const ytURL = new URL('https://www.youtube.com/tv#/');
  ytURL.searchParams.set('env_forceFullAnimation', '1');
  ytURL.searchParams.set('env_enableWebSpeech', '1');
  ytURL.searchParams.set('env_enableVoice', '1');
  return ytURL;
}

/** Appends every parameter of `b` to `a`, keeping repeated keys, and returns `a`. */
function concatSearchParams(a, b) {
  b.forEach((value, key) => {
    a.append(key, value);
  });
  return a;
}

/** `candidate` as a URL when it parses and has `expectedOrigin`, else null. */
function sameOriginURL(candidate, expectedOrigin) {
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  return parsed.origin === expectedOrigin ? parsed : null;
}

/**
 * Opens YouTube for a launch or relaunch: a deep link (video, search, voice intent from the remote
 * or the system) becomes the URL the leanback app starts on.
 */
export function handleLaunch(params) {
  log.info('handleLaunch', params);
  let ytURL = getYTURL();
  const { target } = params ?? {};
  let { contentTarget = target } = params ?? {};

  if (typeof contentTarget === 'string') {
    const sameOrigin = sameOriginURL(contentTarget, ytURL.origin);
    if (sameOrigin) {
      ytURL = sameOrigin;
    } else {
      if (contentTarget.startsWith('v=v=')) contentTarget = contentTarget.substring(2);

      concatSearchParams(ytURL.searchParams, new URLSearchParams(contentTarget));
    }
  } else if (contentTarget && typeof contentTarget === 'object') {
    const { intent, intentParam } = contentTarget;
    const search = ytURL.searchParams;
    const voiceContentIntent =
      typeof intent === 'string'
        ? intent.match(CONTENT_INTENT_REGEX)?.[0]?.toLowerCase()
        : undefined;

    search.set('inApp', true);
    search.set('vs', 9);
    if (voiceContentIntent) search.set('va', voiceContentIntent);
    search.append('launch', 'voice');
    if (voiceContentIntent === 'search') search.append('launch', 'search');
    // The query; a voice launch without one carries no vq rather than "undefined".
    if (intentParam != null) search.set('vq', intentParam);
  }

  if (ytURL.searchParams.get('theme') === 'k') {
    ytURL.searchParams.delete('env_forceFullAnimation');
    ytURL.searchParams.delete('env_enableWebSpeech');
    ytURL.searchParams.delete('env_enableVoice');
  }

  window.location.href = ytURL.toString();
}
