/**
 * Fixes webosbrew/youtube-webos/issues/343
 */

import { FetchRegistry } from './hooks';

export function initBlockWebOSCast() {
  console.info('[Block WebOS Cast] Initialized');

  FetchRegistry.getInstance().addEventListener('request', (evt) => {
    const { url } = evt.detail;
    if (url.pathname === '/wake_cast_core') evt.preventDefault();
  });
}