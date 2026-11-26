// Which kind of page the leanback app is showing, derived from the body class
// and published as the `ytaf-page-update` window event.
import { SELECTORS } from './selectors.js';

let onWatchPage = false;
let onShortsPage = false;
let onAccountSelectorPage = false;
let onSearchPage = false;

// Set by initObserver, which runs once the body exists.
let body = null;

/**
 * Reads the page kinds off the body's classes and publishes them when one
 * changed. Body classes flip constantly for focus and animation state: four
 * classList lookups per batch, and no event unless the page changed.
 */
function updatePageState() {
  const cl = body.classList;
  const newWatch = cl.contains(SELECTORS.WATCH_PAGE_CLASS);
  const newShorts = cl.contains(SELECTORS.SHORTS_PAGE_CLASS);
  const newAccountSelector = cl.contains(SELECTORS.ACCOUNT_SELECTOR);
  const newSearch = cl.contains(SELECTORS.SEARCH_PAGE_CLASS);

  if (
    newWatch === onWatchPage &&
    newShorts === onShortsPage &&
    newAccountSelector === onAccountSelectorPage &&
    newSearch === onSearchPage
  ) {
    return;
  }

  onWatchPage = newWatch;
  onShortsPage = newShorts;
  onAccountSelectorPage = newAccountSelector;
  onSearchPage = newSearch;

  window.dispatchEvent(
    new CustomEvent('ytaf-page-update', {
      detail: {
        isWatch: onWatchPage,
        isShorts: onShortsPage,
        isAccountSelector: onAccountSelectorPage
      }
    })
  );
}

if (typeof document !== 'undefined') {
  /**
   * Watches the body's class attribute and reads the initial page state; runs once the body exists.
   */
  const initObserver = () => {
    body = document.body;
    const pageObserver = new MutationObserver(updatePageState);
    pageObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
    updatePageState();
  };

  if (document.body) {
    initObserver();
  } else {
    document.addEventListener('DOMContentLoaded', initObserver);
  }
}

/** Whether the watch (video player) page is showing. */
export const isWatchPage = () => onWatchPage;
/** Whether the Shorts player is showing. */
export const isShortsPage = () => onShortsPage;
/** Whether the search page is showing. */
export const isSearchPage = () => onSearchPage;
