// The page itself: a soft reload through the app's own command bus.

import { SELECTORS } from '../../core/selectors.js';
import { log } from './log.js';

/**
 * Asks YouTube to soft-reload the current page, with the same innertube command its own UI sends.
 */
export function refreshPage() {
  const commandPayload = {
    clickTrackingParams: '',
    signalServiceEndpoint: {
      signal: 'CLIENT_SIGNAL',
      actions: [
        {
          clickTrackingParams: '',
          signalAction: {
            signal: 'SOFT_RELOAD_PAGE'
          },
          commandMetadata: {
            webCommandMetadata: {
              clientAction: true
            }
          }
        }
      ]
    }
  };

  const appRoot = document.querySelector(SELECTORS.APP_ROOT) || document.body;
  log.debug('Triggering soft reload...');

  appRoot.dispatchEvent(
    new CustomEvent('innertube-command', {
      bubbles: true,
      cancelable: false,
      composed: true,
      detail: commandPayload
    })
  );
}
