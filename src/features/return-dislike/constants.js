// Timing, the API, feature detection and the description panel's selectors.
import { SELECTORS } from '../../core/selectors.js';
import { isLegacyWebOS } from '../../core/webos.js';

export const API = {
  url: 'https://returnyoutubedislikeapi.com/votes?videoId=',
  timeoutMs: 8000
};

export const TIMING = {
  // How long a fetched count is reused for the same video.
  CACHE_MS: 300000,
  // A cold DNS and TLS handshake on real TV hardware is slow: retries, backing off by the base each time.
  FETCH_MAX_RETRIES: 3,
  FETCH_RETRY_BASE_MS: 1200,
  // The bounded poll for the panel: interval and how many times.
  PANEL_POLL_MS: 500,
  PANEL_POLL_MAX: 20,
  // A burst of panel mutations is injected into once.
  INJECT_DEBOUNCE_MS: 200,
  // After a focusout, how long focus takes to land on the next element.
  FOCUS_SETTLE_MS: 50,
  // The highlight stays this long after Enter, so the click is seen landing.
  HIGHLIGHT_CLEAR_MS: 100
};

export const HAS_INTERSECTION_OBSERVER = typeof IntersectionObserver !== 'undefined';

// Flex gap is Chrome 84; webOS 6 and older (Chromium 79 and below) space the
// factoids with margins instead (return-dislike.css).
export const NO_FLEX_GAP = isLegacyWebOS();

// Shown while the count is still unknown, so the factoid can be laid out
// immediately instead of appearing late.
export const DISLIKE_PLACEHOLDER = '—';

// The description panel, in its two layouts (standard and compact).
export const PANEL = {
  panel: 'ytlr-structured-description-content-renderer',
  // The likes factoid, the template the dislike factoid is cloned from.
  firstFactoid: 'div[idomkey="factoid-0"]',
  menuItem: '[role="menuitem"]',
  dynamicList: 'yt-dynamic-virtual-list',
  focusState: SELECTORS.FOCUS_CLASS,
  legacyHighlight: 'bNqvrc',
  focusedModifier: '--focused',
  parentWrappers:
    'ytlr-video-owner-renderer, ytlr-expandable-video-description-body-renderer, ytlr-comments-entry-point-renderer, ytlr-chapter-renderer'
};
