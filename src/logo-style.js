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
 * Applied once at startup: the element is rendered by the app shell rather than
 * per-page, so navigating or watching a video does not revert it. A short
 * bounded wait covers the shell not having painted yet; no observer is left
 * running afterwards.
 */
import { configRead, configAddChangeListener } from './config.js';

const LOGO_SELECTOR = 'ytlr-logo-entity';
const IMAGE_SELECTOR = 'ytlr-thumbnail-details';
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

const MAX_WAIT_MS = 15000;
const POLL_MS = 500;

let pollTimer = null;

function applyToElement(logo, style) {
  // 'hidden' is handled by a CSS class on <html> so it survives re-renders
  // without us touching the element at all.
  document.documentElement.classList.toggle(HIDDEN_CLASS, style === 'hidden');
  if (style === 'hidden') return true;

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
export function applyLogoStyle() {
  const style = configRead('logoStyle');
  document.documentElement.classList.toggle(HIDDEN_CLASS, style === 'hidden');
  if (style === 'hidden') return true;

  const logo = document.querySelector(LOGO_SELECTOR);
  if (!logo) return false;
  return applyToElement(logo, style);
}

export function initLogoStyle() {
  if (applyLogoStyle()) return bindChanges();

  // The app shell may not have painted yet. Poll briefly rather than leaving a
  // MutationObserver on the document for the life of the session.
  const deadline = Date.now() + MAX_WAIT_MS;
  const tick = () => {
    if (applyLogoStyle() || Date.now() > deadline) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
  pollTimer = setInterval(tick, POLL_MS);
  bindChanges();
}

function bindChanges() {
  configAddChangeListener('logoStyle', () => applyLogoStyle());
}
