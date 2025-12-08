/* src/ui.js */
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
import sponsorBlockUI from './Sponsorblock-UI.js';

let cachedGuestMode = null;

function isGuestMode() {
  if (cachedGuestMode !== null) {
    return cachedGuestMode;
  }

  try {
    const lastIdentity = window.localStorage.getItem('yt.leanback.default::last-identity-used');
    if (lastIdentity) {
      const parsed = JSON.parse(lastIdentity);
      if (parsed?.data?.identityType === 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST') {
        cachedGuestMode = true;
        return true;
      }
      cachedGuestMode = false;
      return false; 
    }

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

function isWatchPage() {
  return document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
}

window.__spatialNavigation__.keyMode = 'NONE';

const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

const colorCodeMap = new Map([
  [403, 'red'],
  [166, 'red'],

  [404, 'green'],
  [172, 'green'],

  [405, 'yellow'],
  [170, 'yellow'],

  [406, 'blue'],
  [167, 'blue'],
  [191, 'blue']
]);

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

  const changeHandler = (evt) => {
    configWrite(key, evt.target.checked);
  };

  elmInput.addEventListener('change', changeHandler);

  configAddChangeListener(key, (evt) => {
    elmInput.checked = evt.detail.newValue;
  });

  const elmLabel = document.createElement('label');
  
  const labelContent = document.createElement('div');
  labelContent.classList.add('label-content');
  
  labelContent.appendChild(elmInput);
  labelContent.appendChild(document.createTextNode('\u00A0' + configGetDesc(key)));
  
  elmLabel.appendChild(labelContent);

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

  let activePage = 0; 
  elmContainer.activePage = 0;
  
  let pageMain = null;
  let pageSponsor = null;

  const setActivePage = (pageIndex) => {
    activePage = pageIndex;
    elmContainer.activePage = pageIndex;

    if (pageIndex === 0) {
      pageMain.style.display = 'block';
      pageSponsor.style.display = 'none';
      pageMain.querySelector('input')?.focus();
      sponsorBlockUI.togglePopup(false);
    } else {
      pageMain.style.display = 'none';
      pageSponsor.style.display = 'block';
      pageSponsor.querySelector('input')?.focus();
      if (isWatchPage()) {
        sponsorBlockUI.togglePopup(true);
      }
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
  pageMain.appendChild(createConfigCheckbox('enableChapterSkip'));
  if (isGuestMode()) {
    pageMain.appendChild(createConfigCheckbox('hideGuestSignInPrompts'));
  }
  
  const navHintNext = document.createElement('div');
  navHintNext.className = 'ytaf-nav-hint right';
  navHintNext.innerHTML = 'SponsorBlock Settings <span class="arrow">&rarr;</span>';
  navHintNext.addEventListener('click', () => setActivePage(1));
  pageMain.appendChild(navHintNext);

  elmContainer.appendChild(pageMain);

  pageSponsor = document.createElement('div');
  pageSponsor.classList.add('ytaf-settings-page');
  pageSponsor.id = 'ytaf-page-sponsor';
  pageSponsor.style.display = 'none';

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

function showOptionsPanel(visible) {
	visible ??= true;

	if (visible && !optionsPanelVisible) {
    console.info('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    
    if (optionsPanel.activePage === 1 && isWatchPage()) {
        sponsorBlockUI.togglePopup(true);
    } else {
        sponsorBlockUI.togglePopup(false);
    }
    
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
    
    sponsorBlockUI.togglePopup(false);

    optionsPanel.blur();
    optionsPanelVisible = false;
  }
}

window.ytaf_showOptionsPanel = showOptionsPanel;

function skipToNextChapter() {
  const video = document.querySelector('video');
  if (!video || !video.duration) return;

  const progressBar = document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]');
  if (!progressBar) {
      showNotification('No chapters found');
      return;
  }

  const chapterEls = Array.from(progressBar.children).filter(el => {
    const key = el.getAttribute('idomkey');
    return key && key.startsWith('chapter-');
  });

  if (chapterEls.length === 0) {
      showNotification('No chapters found');
      return;
  }

  let totalWidth = 0;
  const chapterData = chapterEls.map(el => {
      const width = parseFloat(el.style.width || '0');
      const data = { width, startIndex: totalWidth };
      totalWidth += width;
      return data;
  });

  if (totalWidth === 0) return;

  const timestamps = chapterData.map(c => (c.startIndex / totalWidth) * video.duration);
  const currentTime = video.currentTime;
  const nextTime = timestamps.find(t => t > currentTime + 1);

  if (nextTime !== undefined && nextTime < video.duration) {
      video.currentTime = nextTime;
      showNotification('Skipped to next chapter');
  } else {
      showNotification('No next chapter');
  }
}

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
      showOptionsPanel(!optionsPanelVisible);
    }
    return false;
  } else if (keyColor === 'blue' && evt.type === 'keydown') {
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
} else if (evt.keyCode === 53 && evt.type === 'keydown') { // Key 5
    if (configRead('enableChapterSkip')) {
        skipToNextChapter();
        evt.preventDefault();
        evt.stopPropagation();
    }
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

function initHideLogo() {
  const style = document.createElement('style');
  document.head.appendChild(style);

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

initHideLogo();
initHideEndcards();

initYouTubeFixes();
initVideoQuality();

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