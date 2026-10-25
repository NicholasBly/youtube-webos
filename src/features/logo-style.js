/**
 * YouTube wordmark selection.
 *
 * YouTube ships two wordmarks and picks between them by account status:
 *
 *   premium  .../livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png
 *   default  .../livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png
 *
 * They are different widths, and the header positions the element with an
 * absolute `left` that is calculated from that width, so swapping the image
 * alone leaves it misaligned. Both values are set together.
 *
 * Applied once: the element is rendered by the app shell rather than per page,
 * so navigating or watching a video does not revert it. A short bounded wait,
 * then the page changes, cover a shell that has not painted yet; nothing is
 * left listening once it is applied.
 */
import { configRead, configAddChangeListener } from '../core/config.js';
import { pollUntil } from '../core/dom.js';
import { SELECTORS } from '../core/selectors.js';
import './logo-style.css';

const LOGO_SELECTOR = SELECTORS.LOGO;
const IMAGE_SELECTOR = SELECTORS.THUMBNAIL_TILE;
const HIDDEN_CLASS = 'ytaf-hide-logo';

const LOGO_VARIANTS = {
  default: {
    url: 'https://www.gstatic.com/youtube/img/branding/livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png',
    left: '66.375rem',
    width: '10.125rem'
  },
  premium: {
    url: 'https://www.gstatic.com/youtube/img/branding/livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png',
    left: '65.75rem',
    width: '10.75rem'
  }
};

// The poll: every POLL_MS, for 15 s counted in rounds (the TV may set its
// clock in the meantime).
const POLL_MS = 500;
const POLL_ROUNDS = 30;

/**
 * Applies a logo style to one header logo (image, position, width), writing only what differs;
 * false when the logo has no image yet.
 */
function applyToElement(logo, style) {
  const variant = LOGO_VARIANTS[style] || LOGO_VARIANTS.default;
  const image = logo.querySelector(IMAGE_SELECTOR);
  if (!image) return false;

  // Only write when something actually differs: this can be re-entered from a
  // settings change while the panel is open.
  const nextUrl = `url("${variant.url}")`;
  if (image.style.backgroundImage !== nextUrl) image.style.backgroundImage = nextUrl;
  if (logo.style.left !== variant.left) logo.style.left = variant.left;
  if (logo.style.width !== variant.width) logo.style.width = variant.width;
  return true;
}

/** Apply the configured style now, if the header exists yet. */
function applyLogoStyle() {
  const style = configRead('logoStyle');
  document.documentElement.classList.toggle(HIDDEN_CLASS, style === 'hidden');
  if (style === 'hidden') return true;

  const logo = document.querySelector(LOGO_SELECTOR);
  if (!logo) return false;
  return applyToElement(logo, style);
}

/**
 * Applies the YouTube Logo setting now or, while the header is not painted yet, by a short poll and
 * then on every page change until it takes; follows the setting.
 */
export function initLogoStyle() {
  configAddChangeListener('logoStyle', () => applyLogoStyle());
  if (applyLogoStyle()) return;

  // The app shell may not have painted yet: a short poll, and past it every
  // page change tries again (an account picked late, a slow cold start) until
  // one applies, rather than a MutationObserver on the document for the life
  // of the session.
  const onPageUpdate = () => {
    if (applyLogoStyle()) window.removeEventListener('ytaf-page-update', onPageUpdate);
  };
  window.addEventListener('ytaf-page-update', onPageUpdate);
  pollUntil(
    () => {
      if (!applyLogoStyle()) return false;
      window.removeEventListener('ytaf-page-update', onPageUpdate);
      return true;
    },
    POLL_MS,
    { maxAttempts: POLL_ROUNDS }
  );
}
