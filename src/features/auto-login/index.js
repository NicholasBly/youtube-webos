// Auto Login: skips the account selector, suppresses the Premium upsell and
// applies the preview preference. This file follows the settings.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { setWhosWatchingSuppressed, setupActiveBypassListener } from './whos-watching.js';
import { setPromoUpsellSuppressed } from './promo-upsell.js';
import { setInlinePlayback, initPreviews } from './previews.js';
import { log } from './log.js';

export { attemptActiveBypass, resetActiveBypass } from './whos-watching.js';

/**
 * With Bypass Nag Screens on: suppresses the Who's Watching and promo screens and skips the account
 * selector when it appears.
 */
function initAutoLogin() {
  if (configRead('enableAutoLogin')) {
    log.info('Initializing...');
    setWhosWatchingSuppressed(true);
    setPromoUpsellSuppressed(true);
    setupActiveBypassListener();
  }
}

/** Starts the auto-login bypass and the Force Previews setting. */
function start() {
  initAutoLogin();
  initPreviews();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

configAddChangeListener('enableAutoLogin', ({ detail }) => {
  if (detail.newValue) {
    log.info('Setting enabled');
    initAutoLogin();
  } else {
    log.info('Setting disabled');
    setWhosWatchingSuppressed(false);
    setPromoUpsellSuppressed(false);
  }
});

configAddChangeListener('forcePreviews', ({ detail }) => {
  setInlinePlayback(detail.newValue);
});
