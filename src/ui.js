/*global navigate*/
import './spatial-navigation-polyfill.js';
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc,
  segmentTypes,
  configGetDefault
} from './config.js';
import './ui.css';
import './auto-login.js';
import './return-dislike.js';
import { initYouTubeFixes } from './yt-fixes.js';
import { WebOSVersion } from './webos-utils.js';
import { initVideoQuality } from './video-quality.js';

let cachedGuestMode = null;

function isGuestMode() {
  if (cachedGuestMode !== null) {
    return cachedGuestMode;
  }

  try {
    const lastIdentity = window.localStorage.getItem('yt.leanback.default::last-identity-used');
    if (lastIdentity) {
      const parsed = JSON.parse(lastIdentity);
      // If we found an identity, trust it definitively.
      if (parsed?.data?.identityType === 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST') {
        cachedGuestMode = true;
        return true;
      }
      cachedGuestMode = false;
      return false; 
    }

    // Only check fallback keys if lastIdentity was completely missing
    const autoNav = window.localStorage.getItem('yt.leanback.default::AUTONAV_FOR_LIVING_ROOM');
    if (autoNav) {
      const parsed = JSON.parse(autoNav);
      if (parsed?.data?.guest === true) {
        cachedGuestMode = true;
        return true;
      }
    }
    cachedGuestMode = false;
    return false;
  } catch (e) {
    console.warn('Error detecting guest mode:', e);
    cachedGuestMode = false;
    return false;
  }
}

// We handle key events ourselves.
window.__spatialNavigation__.keyMode = 'NONE';

const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

// Red, Green, Yellow, Blue
// 403,   404,    405,  406
// ---,   172,    170,  191
const colorCodeMap = new Map([
  [403, 'red'],
  [166, 'red'], // fixed webOS24

  [404, 'green'],
  [172, 'green'],

  [405, 'yellow'],
  [170, 'yellow'],

  [406, 'blue'],
  [167, 'blue'], // fixed webOS24
  [191, 'blue']
]);

/**
 * Returns the name of the color button associated with a code or null if not a color button.
 * @param {number} charCode KeyboardEvent.charCode property from event
 * @returns {string | null} Color name or null
 */
function getKeyColor(charCode) {
  if (colorCodeMap.has(charCode)) {
    return colorCodeMap.get(charCode);
  }

  return null;
}

function createConfigCheckbox(key) {
  const elmInput = document.createElement('input');
  elmInput.type = 'checkbox';
  elmInput.checked = configRead(key);

  /** @type {(evt: Event) => void} */
  const changeHandler = (evt) => {
    configWrite(key, evt.target.checked);
  };

  elmInput.addEventListener('change', changeHandler);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
  });

  const elmLabel = document.createElement('label');
  
  // Create a container for the checkbox and text content
  const labelContent = document.createElement('div');
  labelContent.classList.add('label-content');
  
  labelContent.appendChild(elmInput);
  // Use non-breaking space (U+00A0)
  labelContent.appendChild(document.createTextNode('\u00A0' + configGetDesc(key)));
  
  elmLabel.appendChild(labelContent);

  // Check if this is a SponsorBlock segment type that has a corresponding color
  const segmentKey = key.replace('enableSponsorBlock', '').toLowerCase();
  const hasColorPicker = segmentTypes[segmentKey] || (segmentKey === 'highlight' && segmentTypes['poi_highlight']);
  
  if (hasColorPicker) {
    const colorKey = segmentKey === 'highlight' ? 'poi_highlightColor' : `${segmentKey}Color`;
    
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset';
    resetButton.classList.add('reset-color-btn');
    resetButton.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const defaultValue = configGetDefault(colorKey);
      configWrite(colorKey, defaultValue);
    });

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = configRead(colorKey);

    colorInput.addEventListener('input', (evt) => {
      configWrite(colorKey, evt.target.value);
    });

    configAddChangeListener(colorKey, (evt) => {
      colorInput.value = evt.detail.newValue;
      if (window.sponsorblock) {
        window.sponsorblock.buildOverlay();
      }
    });

    const controlsContainer = document.createElement('div');
    controlsContainer.classList.add('color-picker-controls');
    controlsContainer.appendChild(resetButton);
    controlsContainer.appendChild(colorInput);

    elmLabel.appendChild(controlsContainer);
  }

  return elmLabel;
}

function createOptionsPanel() {
  const elmContainer = document.createElement('div');

  elmContainer.classList.add('ytaf-ui-container');
  
  if (isGuestMode()) {
    elmContainer.classList.add('guest-mode');
  }
  
  elmContainer.style['display'] = 'none';
  elmContainer.setAttribute('tabindex', 0);

  elmContainer.addEventListener(
    'focus',
    () => console.info('Options panel focused!'),
    true
  );
  elmContainer.addEventListener(
    'blur',
    () => console.info('Options panel blurred!'),
    true
  );

  let activePage = 0; // 0: Main, 1: SponsorBlock
  let pageMain = null;
  let pageSponsor = null;

  const setActivePage = (pageIndex) => {
    if (pageIndex === 0) {
      pageMain.style.display = 'block';
      pageSponsor.style.display = 'none';
      activePage = 0;
      // Focus first element on return to main
      pageMain.querySelector('input')?.focus();
    } else {
      pageMain.style.display = 'none';
      pageSponsor.style.display = 'block';
      activePage = 1;
      // Focus the Back button or first input on switch
      // Since Back button is a nav hint, maybe focus the master switch
      // But purely focusing the container or first input is safer
      pageSponsor.querySelector('input')?.focus();
    }
  };

  elmContainer.addEventListener(
    'keydown',
    (evt) => {
      console.info('Options panel key event:', evt.type, evt.charCode);

      if (getKeyColor(evt.charCode) === 'green') {
        return;
      }

      if (evt.keyCode in ARROW_KEY_CODE) {
        // Handle Page Switching on Left/Right
        const dir = ARROW_KEY_CODE[evt.keyCode];
        if (dir === 'left' || dir === 'right') {
          const preFocus = document.activeElement;

          if (activePage === 1) {
            const sponsorMainToggle = pageSponsor.querySelector('input');
            if (dir === 'right' && preFocus === sponsorMainToggle) {
               evt.preventDefault();
               evt.stopPropagation();
               return;
            }

            const isSubItemCheckbox = preFocus.matches('blockquote input[type="checkbox"]');
            if (dir === 'left' && isSubItemCheckbox) {
               setActivePage(0);
               evt.preventDefault();
               evt.stopPropagation();
               return;
            }
          }

          navigate(dir);
          const postFocus = document.activeElement;

          // If navigation didn't move focus (hit a wall)
          if (preFocus === postFocus) {
             if (dir === 'right' && activePage === 0) {
               setActivePage(1);
               evt.preventDefault();
               evt.stopPropagation();
               return;
             }
             if (dir === 'left' && activePage === 1) {
               setActivePage(0);
               evt.preventDefault();
               evt.stopPropagation();
               return;
             }
          }
          // If we did navigate successfully (e.g. between color inputs), let it happen
          evt.preventDefault();
          evt.stopPropagation();
          return;
        }

        navigate(ARROW_KEY_CODE[evt.keyCode]);
      } else if (evt.keyCode === 13) {
        if (evt instanceof KeyboardEvent) {
          document.activeElement.click();
        }
      } else if (evt.keyCode === 27) {
        showOptionsPanel(false);
      }

      evt.preventDefault();
      evt.stopPropagation();
    },
    true
  );

  const elmHeading = document.createElement('h1');
  const webOSVersion = WebOSVersion(); 
  if (webOSVersion === 25) {
		  elmHeading.textContent = `YouTube Extended — webOS ${webOSVersion}`;
	  } else {
		  elmHeading.textContent = 'YouTube Extended';
	  }
  elmContainer.appendChild(elmHeading);

  // --- Page 1: Main Settings ---
  pageMain = document.createElement('div');
  pageMain.classList.add('ytaf-settings-page');
  pageMain.id = 'ytaf-page-main';

  pageMain.appendChild(createConfigCheckbox('enableAdBlock'));
  pageMain.appendChild(createConfigCheckbox('forceHighResVideo'));
  pageMain.appendChild(createConfigCheckbox('upgradeThumbnails'));
  pageMain.appendChild(createConfigCheckbox('hideLogo'));
  pageMain.appendChild(createConfigCheckbox('enableOledCareMode'));
  pageMain.appendChild(createConfigCheckbox('removeShorts'));
  pageMain.appendChild(createConfigCheckbox('enableAutoLogin'));
  pageMain.appendChild(createConfigCheckbox('hideEndcards'));
  pageMain.appendChild(createConfigCheckbox('enableReturnYouTubeDislike'));
  if (isGuestMode()) {
    pageMain.appendChild(createConfigCheckbox('hideGuestSignInPrompts'));
  }
  
  // Navigation Hint (Next)
  const navHintNext = document.createElement('div');
  navHintNext.className = 'ytaf-nav-hint right';
  navHintNext.innerHTML = 'SponsorBlock Settings <span class="arrow">&rarr;</span>';
  navHintNext.addEventListener('click', () => setActivePage(1));
  pageMain.appendChild(navHintNext);

  elmContainer.appendChild(pageMain);

  // --- Page 2: SponsorBlock Settings ---
  pageSponsor = document.createElement('div');
  pageSponsor.classList.add('ytaf-settings-page');
  pageSponsor.id = 'ytaf-page-sponsor';
  pageSponsor.style.display = 'none';

  // Navigation Hint (Prev)
  const navHintPrev = document.createElement('div');
  navHintPrev.className = 'ytaf-nav-hint left';
  navHintPrev.innerHTML = '<span class="arrow">&larr;</span> Main Settings';
  navHintPrev.addEventListener('click', () => setActivePage(0));
  pageSponsor.appendChild(navHintPrev);

  pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));

  const elmBlock = document.createElement('blockquote');
  
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockSponsor'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockIntro'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockOutro'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockInteraction'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockSelfPromo'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockMusicOfftopic'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockFiller'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockHook'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockHighlight'));
  elmBlock.appendChild(createConfigCheckbox('enableSponsorBlockPreview'));
  elmBlock.appendChild(createConfigCheckbox('enableHighlightJump'));
  elmBlock.appendChild(createConfigCheckbox('enableMutedSegments'));
  pageSponsor.appendChild(elmBlock);

  const elmSponsorLink = document.createElement('div');
  elmSponsorLink.innerHTML =
    '<small>Sponsor segments skipping - https://sponsor.ajay.app</small>';
  pageSponsor.appendChild(elmSponsorLink);

  elmContainer.appendChild(pageSponsor);

  return elmContainer;
}

const optionsPanel = createOptionsPanel();
document.body.appendChild(optionsPanel);

let optionsPanelVisible = false;

/**
 * Show or hide the options panel.
 * @param {boolean} [visible=true] Whether to show the options panel.
 */
function showOptionsPanel(visible) {
	visible ??= true;

	if (visible && !optionsPanelVisible) {
    console.info('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    
    const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input')).find(
      (el) => el.offsetParent !== null
    );

    if (firstVisibleInput) {
      firstVisibleInput.focus();
    } else {
      optionsPanel.focus();
    }
    
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible) {
    console.info('Hiding options panel!');
    optionsPanel.style.display = 'none';
    optionsPanel.blur();
    optionsPanelVisible = false;
  }
}

window.ytaf_showOptionsPanel = showOptionsPanel;

const eventHandler = (evt) => {
  console.info(
    'Key event:',
    evt.type,
    evt.charCode,
    evt.keyCode,
    evt.defaultPrevented
  );
  const keyColor = getKeyColor(evt.charCode);
  
  if (keyColor === 'green') {
    console.info('Taking over!');
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.type === 'keydown') {
      // Toggle visibility.
      showOptionsPanel(!optionsPanelVisible);
    }
    return false;
  } else if (keyColor === 'blue' && evt.type === 'keydown') {
    // Handle blue button for highlight jumping
    console.info('Blue button pressed - attempting highlight jump');
    
    try {
      const jumpEnabled = configRead('enableHighlightJump');
      if (jumpEnabled && window.sponsorblock) {
        const jumped = window.sponsorblock.jumpToNextHighlight();
        if (jumped) {
          evt.preventDefault();
          evt.stopPropagation();
          return false;
        } else {
          showNotification('No highlights found in this video');
        }
      }
    } catch (e) {
      console.warn('Error jumping to highlight:', e);
    }
  } else if (keyColor === 'red' && evt.type === 'keydown') {
  console.info('OLED mode activated');
  evt.preventDefault();
  evt.stopPropagation();
  
  let overlay = document.getElementById('oled-black-overlay');
  if (overlay) {
    overlay.remove();
	console.info('OLED mode deactivated');
  } else {
    overlay = document.createElement('div');
    overlay.id = 'oled-black-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9999';
    document.body.appendChild(overlay);
  }
  return false;
}
  return true;
};

document.addEventListener('keydown', eventHandler, true);
document.addEventListener('keypress', eventHandler, true);
document.addEventListener('keyup', eventHandler, true);

export function showNotification(text, time = 3000) {
  if (!document.querySelector('.ytaf-notification-container')) {
    console.info('Adding notification container');
    const c = document.createElement('div');
	c.classList.add('ytaf-notification-container');
	if (configRead('enableOledCareMode')) {
	  c.classList.add('oled-care');
	}
	document.body.appendChild(c);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.innerText = text;
  elmInner.classList.add('message');
  elmInner.classList.add('message-hidden');
  elm.appendChild(elmInner);
  document.querySelector('.ytaf-notification-container').appendChild(elm);

  setTimeout(() => {
    elmInner.classList.remove('message-hidden');
  }, 100);
  setTimeout(() => {
    elmInner.classList.add('message-hidden');
    setTimeout(() => {
      elm.remove();
    }, 1000);
  }, time);
}

/**
 * Initialize ability to hide YouTube logo in top right corner.
 */
function initHideLogo() {
  const style = document.createElement('style');
  document.head.appendChild(style);

  /** @type {(hide: boolean) => void} */
  const setHidden = (hide) => {
    const visibility = hide ? 'hidden' : 'visible';
    style.textContent = `ytlr-redux-connect-ytlr-logo-entity { visibility: ${visibility}; }`;
  };

  setHidden(configRead('hideLogo'));

  configAddChangeListener('hideLogo', (evt) => {
    setHidden(evt.detail.newValue);
  });
}

function initHideEndcards() {
  const style = document.createElement('style');
  document.head.appendChild(style);

  /** @type {(hide: boolean) => void} */
  const setHidden = (hide) => {
    const display = hide ? 'none' : 'block';
    style.textContent = `
      ytlr-endscreen-renderer { display: ${display} !important; }
      .ytLrEndscreenElementRendererElementContainer { display: ${display} !important; }
      .ytLrEndscreenElementRendererVideo { display: ${display} !important; }
      .ytLrEndscreenElementRendererHost { display: ${display} !important; }
    `;
  };

  setHidden(configRead('hideEndcards'));

  configAddChangeListener('hideEndcards', (evt) => {
    setHidden(evt.detail.newValue);
  });
}

function applyUIFixes() {
  try {
    const bodyClasses = document.body.classList;

    const observer = new MutationObserver(function bodyClassCallback(
      _records,
      _observer
    ) {
      try {
        if (bodyClasses.contains('app-quality-root')) {
          bodyClasses.remove('app-quality-root');
        }
      } catch (e) {
        console.error('error in <body> class observer callback:', e);
      }
    });

    observer.observe(document.body, {
      subtree: false,
      childList: false,
      attributes: true,
      attributeFilter: ['class'],
      characterData: false
    });
  } catch (e) {
    console.error('error setting up <body> class observer:', e);
  }
}

function applyOledMode(enabled) {
  const optionsPanel = document.querySelector('.ytaf-ui-container');
  const notificationContainer = document.querySelector(
    '.ytaf-notification-container'
  );

  const oledClass = 'oled-care';
  if (enabled) {
    optionsPanel?.classList.add(oledClass);
    notificationContainer?.classList.add(oledClass);

    const style = document.createElement('style');
    style.id = 'style-gray-ui-oled-care';

    style.textContent = `
      #container {
        background-color: black !important;
      }

      .ytLrGuideResponseMask {
        background-color: black !important;
      }

      .ytLrGuideResponseGradient {
        display: none;
      }

      .ytLrAnimatedOverlayContainer {
        background-color: black !important;
      }
    `;

    document.head.appendChild(style);

  } else {
    optionsPanel?.classList.remove(oledClass);
    notificationContainer?.classList.remove(oledClass);

    document.getElementById('style-gray-ui-oled-care')?.remove();
  }
}

//applyUIFixes();
initHideLogo();
initHideEndcards();

initYouTubeFixes();
initVideoQuality();

// Listen for runtime changes to the toggle
configAddChangeListener('hideGuestSignInPrompts', (evt) => {
  if (evt.detail.newValue) {
    initYouTubeFixes();
  } else {
    showNotification('Reload required to disable fix');
  }
});

applyOledMode(configRead('enableOledCareMode'));
configAddChangeListener('enableOledCareMode', (evt) => {
  applyOledMode(evt.detail.newValue);
});

setTimeout(() => {
  showNotification('Press [GREEN] to open SponsorBlock configuration screen');
}, 2000);