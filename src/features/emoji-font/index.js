// Legacy Emoji Fix (webOS 3 and 4): swaps the emoji the adblock text pass
// wrapped in sentinel characters for twemoji images. This file follows the
// setting and the page.
import { getWebOSVersion } from '../../core/webos.js';
import { configAddChangeListener } from '../../core/config.js';
import './emoji-font.css';
import { manageObserverState, flushQueue } from './observer.js';

// The Noto fonts the font rules in emoji-font.css fall back to. A <link>, not
// an @import in that file: core/styles.js joins every stylesheet of the bundle
// into one <style>, where an @import that is not first is ignored.
const NOTO_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic&family=Noto+Sans+Math&display=swap';

/**
 * Links Google's Noto Sans Arabic and Math stylesheet, the fonts emoji-font.css falls back to for
 * characters webOS 3/4 cannot draw.
 */
function linkNotoFonts() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = NOTO_FONTS_URL;
  (document.head || document.documentElement).appendChild(link);
}

if (document.characterSet === 'UTF-8' && getWebOSVersion() <= 4) {
  // The font rules in emoji-font.css are gated by html.ytaf-legacy-emoji; the
  // rules for the emoji images and their hidden twins need no gate, only this
  // module makes those elements.
  document.documentElement.classList.add('ytaf-legacy-emoji');
  linkNotoFonts();

  // Hook into configurations
  manageObserverState();
  configAddChangeListener('enableLegacyEmojiFix', manageObserverState);

  // The account selector replaces the whole UI: drop whatever is queued.
  window.addEventListener('ytaf-page-update', (e) => {
    if (e.detail.isAccountSelector) flushQueue();
  });
}
