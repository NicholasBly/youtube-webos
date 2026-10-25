// The options panel: the container and its tab menu, showing and hiding it
// and keeping focus inside it.
import './panel.css';
import { configRead, configWrite, uiThemes } from '../../core/config.js';
import { isWatchPage } from '../../core/page-state.js';
import popup from '../../features/sponsorblock/popup.js';
import logoBlueUrl from '../icons/logo-blue.png';
import logoRedUrl from '../icons/logo-red.png';
import logoDarkUrl from '../icons/logo-dark.png';
import { createElement } from '../dom.js';
import { buildMainPage, buildSponsorPage, buildShortcutsPage, buildUITweaksPage } from './pages.js';
import { createPanelKeyboard, pageFocusables } from './keyboard.js';
import { createFocusTrap } from './focus-trap.js';
import { createLogger } from '../../core/log.js';
import { ensureMenuKey } from '../shortcuts/bindings.js';

const log = createLogger('Panel');

// The tabs in order: the page builder, and whether the SponsorBlock segment
// popup belongs next to the page while a video is open. A tab picked from
// inside a page puts focus on the page's first control (pageFocusables).
const PAGES = [
  { name: 'Main', build: buildMainPage },
  { name: 'SponsorBlock', build: buildSponsorPage, hasPopup: true },
  { name: 'Shortcuts', build: buildShortcutsPage },
  { name: 'UI Tweaks', build: buildUITweaksPage }
];

/**
 * The pages, built lazily into `container`: `elements[i]` is page i once
 * built, `ensure(i)` builds it now, `startDeferred()` builds the rest one
 * per animation frame. A builder never runs twice.
 */
function createDeferredBuilder(pages, container) {
  const elements = [];
  const pending = pages.map((page) => page.build);

  /** Builds page `index` now, if it is not built yet, and adds it to the panel. */
  const ensure = (index) => {
    const build = pending[index];
    if (!build) return;
    pending[index] = null; // clear first: a builder must never run twice
    elements[index] = build();
    container.appendChild(elements[index]);
  };
  /**
   * Builds the pages not built yet, one per animation frame, so opening the panel does not wait for
   * all of them.
   */
  const startDeferred = () => {
    let index = 1;

    /** Builds the next unbuilt page and asks for another frame. */
    const step = () => {
      while (index < pages.length && !pending[index]) index++;
      if (index >= pages.length) return;
      ensure(index++);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  return { elements, ensure, startDeferred };
}

/**
 * The tab bar: a button per page, the first one active; `onPick(index)` on a
 * click, and the pointer leaving the bar puts focus back on the open tab
 * (`activeIndex()`). Returns the bar and its buttons.
 */
function createTabMenu(pages, onPick, activeIndex) {
  const buttons = pages.map((page, index) =>
    createElement('button', {
      class: index === 0 ? 'ytaf-tab-btn ytaf-active' : 'ytaf-tab-btn',
      text: page.name,
      events: {
        click: () => onPick(index),
        mouseenter: (e) => e.target.focus()
      }
    })
  );
  const element = createElement(
    'div',
    {
      class: 'ytaf-tab-menu',
      events: {
        mouseleave: () => {
          const active = document.activeElement;
          if (active && active.classList.contains('ytaf-tab-btn')) buttons[activeIndex()].focus();
        }
      }
    },
    ...buttons
  );
  return { element, buttons };
}

// Built on the first open: the container element plus the hooks
// showOptionsPanel() drives after a build.
let panel = null;
let optionsPanelVisible = false;
let panelInitBlock = false;

/** Whether the options panel is currently shown. */
export function isOptionsPanelVisible() {
  return optionsPanelVisible;
}

// The heading with the logo. A logo click (a Magic Remote pointer affordance;
// the logo is not in the focus order) flips the theme and hands focus back
// through `afterToggle`; the UI Theme row on the UI Tweaks page is the key
// path. There is one drawn logo per look (blue, red, dark): the <html> theme
// classes pick the one shown (panel.css, theme-red.css, theme-oled.css). A CSS
// filter on the blue image came out orange for red and too bright for OLED.
function createHeading(afterToggle) {
  /** Switches to the next UI theme (a click on the logo). */
  const toggleTheme = () => {
    // The next theme in the list, as the UI Theme row steps.
    const themes = Object.keys(uiThemes);
    configWrite('uiTheme', themes[(themes.indexOf(configRead('uiTheme')) + 1) % themes.length]);
    afterToggle();
  };
  /**
   * One of the heading's logos (one per theme; CSS shows the current one); a click switches the
   * theme.
   */
  const logo = (src, variant) =>
    createElement('img', {
      src,
      alt: 'Logo',
      class: `ytaf-logo ytaf-logo-${variant}`,
      title: 'Click to switch theme',
      events: { click: toggleTheme }
    });
  return createElement(
    'h1',
    {},
    createElement('span', { text: 'YouTube Extended' }),
    logo(logoBlueUrl, 'blue'),
    logo(logoRedUrl, 'red'),
    logo(logoDarkUrl, 'dark')
  );
}

/**
 * Builds the options panel: heading, tab bar, the Main page (the others are built later), the
 * keyboard handler and the focus trap. Returns the element and its controls.
 */
function createOptionsPanel() {
  const elContainer = createElement('div', {
    class: 'ytaf-ui-container',
    style: { display: 'none' }
  });

  let activePage = 0;
  const pages = createDeferredBuilder(PAGES, elContainer);
  const pageEls = pages.elements;

  /**
   * Shows the SponsorBlock segment popup beside the panel while its page is open on a watch page.
   */
  const syncPopup = () => popup.togglePopup(!!PAGES[activePage].hasPopup && isWatchPage());

  /**
   * Shows page `pageIndex` (building it first if needed), marks its tab, and moves the focus into
   * it unless the user is on the tab bar.
   */
  const setActivePage = (pageIndex) => {
    if (pageIndex === activePage) return;
    pages.ensure(pageIndex); // may still be queued behind the rAF build chain

    pageEls[activePage].style.display = 'none';
    tabBtns[activePage].classList.remove('ytaf-active');
    activePage = pageIndex;
    pageEls[activePage].style.display = 'block';
    tabBtns[activePage].classList.add('ytaf-active');

    // Focus follows the page unless the user is walking the tab bar.
    const activeEl = document.activeElement;
    if (!(activeEl && activeEl.classList.contains('ytaf-tab-btn'))) {
      const first = pageFocusables(pageEls[activePage])[0];
      if (first) first.focus();
    }

    syncPopup();
  };
  const tabMenu = createTabMenu(PAGES, setActivePage, () => activePage);
  const tabBtns = tabMenu.buttons;

  const keyboard = createPanelKeyboard(elContainer, {
    tabBtns,
    get activePage() {
      return activePage;
    },
    pages: () => pageEls,
    close: () => showOptionsPanel(false)
  });

  const elHeading = createHeading(() => {
    const activeTab = tabBtns[activePage];
    if (activeTab) activeTab.focus();
  });
  elContainer.appendChild(elHeading);
  elContainer.appendChild(tabMenu.element);

  // Only the Main page is built up front: building all four inside the keydown
  // handler cost 170 ms on webOS 3, three quarters of it on display:none pages.
  // The rest build one per animation frame once the panel is on screen, and
  // setActivePage() forces a synchronous build if the user beats the chain.
  pages.ensure(0);

  const focusTrap = createFocusTrap({
    container: elContainer,
    allowed: (target) => !!(target.closest && target.closest('.sb-segments-popup')),
    firstControl: () => tabBtns[activePage]
  });

  return {
    element: elContainer,
    /** The tab button of the open page. */
    activeTab: () => tabBtns[activePage],
    buildDeferredPages: pages.startDeferred,
    syncPopup,
    focusTrap,
    keyboard
  };
}

/**
 * Opens (building it the first time) or closes the options panel, with its keyboard handler, focus
 * trap and popup. Toggles are ignored for 500 ms after the first build.
 */
export function showOptionsPanel(visible) {
  if (panelInitBlock) {
    log.debug('toggle blocked during initialization');
    return;
  }
  if (visible && !optionsPanelVisible) {
    if (!panel) {
      log.debug('building the panel (lazy)');
      // The first open is the slow one: the Main page is built synchronously,
      // a freeze of up to 170 ms on webOS 3. A menu key held or repeated
      // through that freeze is delivered right after it and would toggle the
      // panel straight back shut, so toggles are ignored for half a second.
      panelInitBlock = true;
      setTimeout(() => {
        panelInitBlock = false;
      }, 500);
      panel = createOptionsPanel();
      document.body.appendChild(panel.element);
    }

    log.debug('shown');
    panel.element.style.display = 'block';
    panel.buildDeferredPages();
    panel.syncPopup();

    const activeTab = panel.activeTab();
    activeTab.focus();
    panel.focusTrap.attach(activeTab);
    panel.keyboard.attach();
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible && panel) {
    log.debug('hidden');
    panel.focusTrap.detach();
    panel.keyboard.detach();
    // Focus leaves the hidden control at once, not when the engine gets to it,
    // the SponsorBlock popup's too (a Magic Remote click can put it there).
    const focused = document.activeElement;
    if (focused && (panel.element.contains(focused) || focused.closest('.sb-segments-popup'))) {
      focused.blur();
    }
    panel.element.style.display = 'none';
    popup.togglePopup(false);
    optionsPanelVisible = false;
    // A binding changed on the panel may have left no key that opens it.
    ensureMenuKey(true);
  }
}

// Test hooks: the behaviour tests open and close the panel through the
// first, and wait for the panel to take toggles again through the second.
window.ytaf_showOptionsPanel = showOptionsPanel;

/** Test hook: whether the panel takes toggles again (the first build's 500 ms block is over). */
window.ytaf_panelTakesToggles = () => !panelInitBlock;
