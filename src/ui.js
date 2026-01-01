/*global navigate*/
import './spatial-navigation-polyfill.js';
// import QRious from 'qrious';
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc,
  segmentTypes,
  configGetDefault,
  shortcutActions
} from './config.js';
import './ui.css';
import './auto-login.js';
import './return-dislike.js';
import { initYouTubeFixes } from './yt-fixes.js';
import { initVideoQuality } from './video-quality.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { sendKey, REMOTE_KEYS, isGuestMode } from './utils.js';
import { initAdblock, destroyAdblock } from './adblock.js';

let lastSafeFocus = null;
let oledKeepAliveTimer = null;

// --- Debug: Log Capture ---
// const logBuffer = [];
// let isLogCollectionEnabled = false;

// ['log', 'info', 'warn', 'error'].forEach((method) => {
  // const orig = console[method];
  // console[method] = (...args) => {
    // if (isLogCollectionEnabled) {
      // logBuffer.push(`[${method.toUpperCase()}] ${args.join(' ')}`);
      // if (logBuffer.length > 50) logBuffer.shift(); 
    // }
    // orig.apply(console, args);
  // };
// });
// let debugClickCount = 0;
// let debugClickTimer = null;
// --------------------------

// Polyfill for Element.closest
if (!Element.prototype.closest) {
  Element.prototype.closest = function(s) {
    var el = this;
    do {
      if (Element.prototype.matches.call(el, s)) return el;
      el = el.parentElement || el.parentNode;
    } while (el !== null && el.nodeType === 1);
    return null;
  };
}

function isWatchPage() {
  return document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
}

window.__spatialNavigation__.keyMode = 'NONE';
const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
const colorCodeMap = new Map([
  [403, 'red'], [166, 'red'],
  [404, 'green'], [172, 'green'],
  [405, 'yellow'], [170, 'yellow'],
  [406, 'blue'], [167, 'blue'], [191, 'blue']
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

// Helper to create grouped sections
function createSection(title, elements) {
    const fieldset = document.createElement('div');
    fieldset.classList.add('ytaf-settings-section');
	fieldset.style.marginTop = '15px';
    fieldset.style.marginBottom = '15px';
    fieldset.style.padding = '10px';
    fieldset.style.border = '1px solid #444';
    fieldset.style.borderRadius = '5px';
    
    const legend = document.createElement('div');
    legend.textContent = title;
    legend.style.color = '#aaa';
    legend.style.fontSize = '22px';
    legend.style.marginBottom = '5px';
    legend.style.fontWeight = 'bold';
    legend.style.textTransform = 'uppercase';
    
    fieldset.appendChild(legend);
    elements.forEach(el => fieldset.appendChild(el));
    return fieldset;
}

function createShortcutControl(keyIndex) {
  const configKey = `shortcut_key_${keyIndex}`;
  const container = document.createElement('div');
  container.classList.add('shortcut-control-row');
  container.setAttribute('tabindex', '0'); 

  const label = document.createElement('span');
  label.textContent = `Key ${keyIndex}`;
  label.classList.add('shortcut-label');

  const valueContainer = document.createElement('div');
  valueContainer.classList.add('shortcut-value-container');

  const leftArrow = document.createElement('span');
  leftArrow.textContent = '<';
  leftArrow.classList.add('arrow-btn');

  const valueText = document.createElement('span');
  valueText.classList.add('current-value');
  
  const rightArrow = document.createElement('span');
  rightArrow.textContent = '>';
  rightArrow.classList.add('arrow-btn');

  valueContainer.appendChild(leftArrow);
  valueContainer.appendChild(valueText);
  valueContainer.appendChild(rightArrow);
  container.appendChild(label);
  container.appendChild(valueContainer);

  const actions = Object.keys(shortcutActions);
  
  const updateDisplay = () => {
    const currentVal = configRead(configKey);
    valueText.textContent = shortcutActions[currentVal] || currentVal;
  };

  const cycle = (dir) => {
    const currentVal = configRead(configKey);
    let idx = actions.indexOf(currentVal);
    if (idx === -1) idx = 0;
    
    if (dir === 'next') {
        idx = (idx + 1) % actions.length;
    } else {
        idx = (idx - 1 + actions.length) % actions.length;
    }
    configWrite(configKey, actions[idx]);
    updateDisplay();
  };

  container.addEventListener('keydown', (e) => {
      if (e.keyCode === 37) { // Left
          cycle('prev');
          e.stopPropagation(); 
          e.preventDefault();
      } else if (e.keyCode === 39) { // Right
          cycle('next');
          e.stopPropagation();
          e.preventDefault();
      } else if (e.keyCode === 13) { // Enter
          cycle('next');
          e.stopPropagation();
          e.preventDefault();
      }
  });
  
  container.addEventListener('click', () => cycle('next'));
  
  configAddChangeListener(configKey, updateDisplay);
  updateDisplay();

  return container;
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
    false
  );
  elmContainer.addEventListener(
    'blur',
    () => console.info('Options panel blurred!'),
    false
  );

  let activePage = 0; 
  elmContainer.activePage = 0;
  
  let pageMain = null;
  let pageSponsor = null;
  let pageShortcuts = null;
  // let pageDebug = null;

  const setActivePage = (pageIndex) => {
    activePage = pageIndex;
    elmContainer.activePage = pageIndex;

    pageMain.style.display = 'none';
    pageSponsor.style.display = 'none';
    pageShortcuts.style.display = 'none';
    // pageDebug.style.display = 'none';

    if (pageIndex === 0) { // Main
      pageMain.style.display = 'block';
      pageMain.querySelector('input')?.focus();
      sponsorBlockUI.togglePopup(false);
    } else if (pageIndex === 1) { // Sponsor
      pageSponsor.style.display = 'block';
      pageSponsor.querySelector('input')?.focus();
      if (isWatchPage()) {
        sponsorBlockUI.togglePopup(true);
      }
    } else if (pageIndex === 2) { // Shortcuts
      pageShortcuts.style.display = 'block';
      pageShortcuts.querySelector('.shortcut-control-row')?.focus();
      sponsorBlockUI.togglePopup(false);
      } // else if (pageIndex === 3) { // Debug
      // pageDebug.style.display = 'block';
      // pageDebug.querySelector('button')?.focus();
      // sponsorBlockUI.togglePopup(false);
    // }
  };

  // elmContainer.goToDebug = () => setActivePage(3);

  elmContainer.addEventListener(
    'keydown',
    (evt) => {
      if (getKeyColor(evt.charCode) === 'green') {
        return;
      }
      if (evt.keyCode in ARROW_KEY_CODE) {
        const dir = ARROW_KEY_CODE[evt.keyCode];
        if (dir === 'left' || dir === 'right') {
          const preFocus = document.activeElement;
          if (preFocus.classList.contains('shortcut-control-row')) {
              return;
          }
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
             if (dir === 'right') {
               if (activePage === 0) setActivePage(1);
               else if (activePage === 1) setActivePage(2);
             } else if (dir === 'left') {
               if (activePage === 1) setActivePage(0);
               else if (activePage === 2) setActivePage(1);
               // else if (activePage === 3) setActivePage(0); // Exit debug
             }
             evt.preventDefault();
             evt.stopPropagation();
             return;
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
  
  const toggleTheme = (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const currentTheme = configRead('uiTheme');
    const newTheme = currentTheme === 'blue-force-field' ? 'classic-red' : 'blue-force-field';
    configWrite('uiTheme', newTheme);
  };

  const logoBlue = document.createElement('img');
  logoBlue.src = 'https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel.png';
  logoBlue.alt = 'Logo';
  logoBlue.classList.add('ytaf-logo', 'logo-blue'); 
  logoBlue.title = 'Click to switch theme';
  logoBlue.addEventListener('click', toggleTheme);
  
  const logoRed = document.createElement('img');
  logoRed.src = 'https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel2.png';
  logoRed.alt = 'Logo';
  logoRed.classList.add('ytaf-logo', 'logo-red'); 
  logoRed.title = 'Click to switch theme';
  logoRed.style.display = 'none'; 
  logoRed.addEventListener('click', toggleTheme);
  
  const logoDark = document.createElement('img');
  logoDark.src = 'https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel4.png';
  logoDark.alt = 'Logo';
  logoDark.classList.add('ytaf-logo', 'logo-dark'); 
  logoDark.title = 'Click to switch theme';
  logoDark.style.display = 'none'; 
  logoDark.addEventListener('click', toggleTheme);
  
  const titleText = document.createElement('span');
  titleText.textContent = 'YouTube Extended';
  
  elmHeading.appendChild(titleText);
  elmHeading.appendChild(logoBlue);
  elmHeading.appendChild(logoRed);
  elmHeading.appendChild(logoDark);
  
  elmContainer.appendChild(elmHeading);

  // --- Page 1: Main (Grouped) ---
  pageMain = document.createElement('div');
  pageMain.classList.add('ytaf-settings-page');
  pageMain.id = 'ytaf-page-main';

  // Group 1: Cosmetic Filtering (AdBlock Master)
  const elAdBlock = createConfigCheckbox('enableAdBlock');
  const cosmeticGroup = [elAdBlock];
  
  let elRemoveGlobalShorts = null;
  let elRemoveTopLiveGames = null;
  let elGuestPrompts = null;
  
  elRemoveGlobalShorts = createConfigCheckbox('removeGlobalShorts');
  elRemoveTopLiveGames = createConfigCheckbox('removeTopLiveGames');
  cosmeticGroup.push(elRemoveGlobalShorts);
  cosmeticGroup.push(elRemoveTopLiveGames);
  
  if (isGuestMode()) {
      elGuestPrompts = createConfigCheckbox('hideGuestSignInPrompts');
      cosmeticGroup.push(elGuestPrompts);
  }

  pageMain.appendChild(createSection('Cosmetic Filtering', cosmeticGroup));

  // Logic: Manage dependencies (AdBlock Master Switch & Shorts Overlap)
  const updateDependencyState = () => {
      const isAdBlockOn = configRead('enableAdBlock');
      const isGlobalShortsOn = configRead('removeGlobalShorts');

      const setState = (el, enabled) => {
          if (!el) return;
          const input = el.querySelector('input');
          if (input) {
              input.disabled = !enabled;
              el.style.opacity = enabled ? '1' : '0.5';
          }
      };

      // 1. If AdBlock is OFF, disable all sub-settings
      if (!isAdBlockOn) {
          setState(elRemoveGlobalShorts, false);
          setState(elRemoveTopLiveGames, false);
          setState(elGuestPrompts, false);
          return;
      }

      // 2. AdBlock is ON, so enable general sub-settings
      setState(elRemoveGlobalShorts, true);
      setState(elRemoveTopLiveGames, true);
      setState(elGuestPrompts, true);
  };

  // Attach listeners to inputs
  const adBlockInput = elAdBlock.querySelector('input');
  adBlockInput.addEventListener('change', updateDependencyState);

  if (elRemoveGlobalShorts) {
      const globalShortsInput = elRemoveGlobalShorts.querySelector('input');
      globalShortsInput.addEventListener('change', updateDependencyState);
      
      // Listen for external config changes to global shorts
      configAddChangeListener('removeGlobalShorts', (evt) => updateDependencyState());
  }
  
  // Listen for external config changes to AdBlock
  configAddChangeListener('enableAdBlock', (evt) => updateDependencyState());

  // Initialize State
  updateDependencyState();

  // Group 2: Video & Player
  pageMain.appendChild(createSection('Video Player', [
      createConfigCheckbox('forceHighResVideo'),
      createConfigCheckbox('hideEndcards'),
      createConfigCheckbox('enableReturnYouTubeDislike')
  ]));

  // Group 3: User Interface
  pageMain.appendChild(createSection('Interface', [
      createConfigCheckbox('enableAutoLogin'),
      createConfigCheckbox('upgradeThumbnails'),
      createConfigCheckbox('hideLogo'),
      createConfigCheckbox('enableOledCareMode'),
      createConfigCheckbox('disableNotifications')
  ]));

  const navHintNextMain = document.createElement('div');
  navHintNextMain.className = 'ytaf-nav-hint right';
  navHintNextMain.tabIndex = 0;
  navHintNextMain.innerHTML = 'SponsorBlock Settings <span class="arrow">&rarr;</span>';
  navHintNextMain.addEventListener('click', () => setActivePage(1));
  pageMain.appendChild(navHintNextMain);

  elmContainer.appendChild(pageMain);
  // ------------------------------------

  // --- Page 2: SponsorBlock ---
  pageSponsor = document.createElement('div');
  pageSponsor.classList.add('ytaf-settings-page');
  pageSponsor.id = 'ytaf-page-sponsor';
  pageSponsor.style.display = 'none';

  const navHintPrevSponsor = document.createElement('div');
  navHintPrevSponsor.className = 'ytaf-nav-hint left';
  navHintPrevSponsor.tabIndex = 0;
  navHintPrevSponsor.innerHTML = '<span class="arrow">&larr;</span> Main Settings';
  navHintPrevSponsor.addEventListener('click', () => setActivePage(0));
  pageSponsor.appendChild(navHintPrevSponsor);

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

  const navHintNextSponsor = document.createElement('div');
  navHintNextSponsor.className = 'ytaf-nav-hint right';
  navHintNextSponsor.tabIndex = 0;
  navHintNextSponsor.innerHTML = 'Shortcuts <span class="arrow">&rarr;</span>';
  navHintNextSponsor.addEventListener('click', () => setActivePage(2));
  pageSponsor.appendChild(navHintNextSponsor);

  elmContainer.appendChild(pageSponsor);

  // --- Page 3: Shortcuts ---
  pageShortcuts = document.createElement('div');
  pageShortcuts.classList.add('ytaf-settings-page');
  pageShortcuts.id = 'ytaf-page-shortcuts';
  pageShortcuts.style.display = 'none';

  const navHintPrevShortcuts = document.createElement('div');
  navHintPrevShortcuts.className = 'ytaf-nav-hint left';
  navHintPrevShortcuts.tabIndex = 0;
  navHintPrevShortcuts.innerHTML = '<span class="arrow">&larr;</span> SponsorBlock Settings';
  navHintPrevShortcuts.addEventListener('click', () => setActivePage(1));
  pageShortcuts.appendChild(navHintPrevShortcuts);

  for (let i = 0; i <= 9; i++) {
      pageShortcuts.appendChild(createShortcutControl(i));
  }

  elmContainer.appendChild(pageShortcuts);

  // --- Page 4: Debug ---
  // pageDebug = document.createElement('div');
  // pageDebug.classList.add('ytaf-settings-page');
  // pageDebug.style.display = 'none';
  
  // const navHintExitDebug = document.createElement('div');
  // navHintExitDebug.className = 'ytaf-nav-hint left';
  // navHintExitDebug.tabIndex = 0;
  // navHintExitDebug.innerHTML = '<span class="arrow">&larr;</span> Exit Debug';
  // navHintExitDebug.addEventListener('click', () => setActivePage(0));
  // pageDebug.appendChild(navHintExitDebug);

  // const logLabel = document.createElement('label');
  // const logInput = document.createElement('input');
  // logInput.type = 'checkbox';
  // logInput.checked = isLogCollectionEnabled;
  // logInput.addEventListener('change', (e) => {
      // isLogCollectionEnabled = e.target.checked;
	  // if (!isLogCollectionEnabled) { logBuffer.length = 0; }
  // });
  
  // const logContent = document.createElement('div');
  // logContent.classList.add('label-content');
  // logContent.appendChild(logInput);
  // logContent.appendChild(document.createTextNode('\u00A0Enable console log collection'));
  // logLabel.appendChild(logContent);
  // pageDebug.appendChild(logLabel);

  // const qrCanvas = document.createElement('canvas');
  // qrCanvas.style.cssText = 'display:block;margin:10px auto;background:white;padding:10px;border-radius:4px;max-width:600px;width:100%;height:auto;';
  
  // const genQr = (text) => {
    // if (!text) { showNotification('Buffer Empty'); return; }
    // try {
        // new QRious({
            // element: qrCanvas,
            // value: text,
            // size: 600,
            // level: 'L'
        // });
    // } catch (e) {
        // console.error('QR Gen Error:', e);
        // showNotification('Data too big for QR');
    // }
  // };

  // const btnLogs = document.createElement('button');
  // btnLogs.textContent = 'Show Console Logs (QR)';
  // btnLogs.className = 'reset-color-btn';
  // btnLogs.style.fontSize = '24px';
  // btnLogs.style.marginBottom = '10px';
  // btnLogs.onclick = () => genQr(logBuffer.join('\n'));

  // const btnStore = document.createElement('button');
  // btnStore.textContent = 'Show Storage (QR)';
  // btnStore.className = 'reset-color-btn';
  // btnStore.style.fontSize = '24px';
  // btnStore.onclick = () => {
      // const configVal = localStorage.getItem('ytaf-configuration');
      // genQr(configVal || 'No Configuration Found');
  // };

  // pageDebug.appendChild(btnLogs);
  // pageDebug.appendChild(btnStore);
  // pageDebug.appendChild(qrCanvas);
  // elmContainer.appendChild(pageDebug);
  // ---------------------

  return elmContainer;
}

const optionsPanel = createOptionsPanel();
document.body.appendChild(optionsPanel);

let optionsPanelVisible = false;

function showOptionsPanel(visible) {
	if (visible === undefined || visible === null) {
    		visible = true;
  	}

	if (visible && !optionsPanelVisible) {
    console.info('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    
    if (optionsPanel.activePage === 1 && isWatchPage()) {
        sponsorBlockUI.togglePopup(true);
    } else {
        sponsorBlockUI.togglePopup(false);
    }
    
    const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input, .shortcut-control-row')).find(
      (el) => el.offsetParent !== null && !el.disabled 
    );

    if (firstVisibleInput) {
      firstVisibleInput.focus();
	  lastSafeFocus = firstVisibleInput;
    } else {
      optionsPanel.focus();
	  lastSafeFocus = optionsPanel;
    }
    
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible) {
    console.info('Hiding options panel!');
    optionsPanel.style.display = 'none';
    
    sponsorBlockUI.togglePopup(false);

    optionsPanel.blur();
    optionsPanelVisible = false;
	lastSafeFocus = null;
	// clearTimeout(debugClickTimer);
    // debugClickCount = 0;
  }
}

document.addEventListener('focus', (e) => {
    if (!optionsPanelVisible) return;
    const target = e.target;
    const isSafeFocus = (optionsPanel && optionsPanel.contains(target)) || 
                        (target.closest && target.closest('.sb-segments-popup'));
    if (isSafeFocus) {
        lastSafeFocus = target;
    } else {
        e.stopPropagation();
        e.preventDefault();
        if (lastSafeFocus && document.body.contains(lastSafeFocus)) {
            lastSafeFocus.focus();
        } else {
            const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input, .shortcut-control-row')).find(
              (el) => el.offsetParent !== null && !el.disabled 
            );
            if (firstVisibleInput) firstVisibleInput.focus();
            else optionsPanel.focus();
        }
    }
}, true);

window.ytaf_showOptionsPanel = showOptionsPanel;

async function skipChapter(direction = 'next') {
  const video = document.querySelector('video');
  if (!video || !video.duration) return;

  // Initialize static state to track if we've already forced the UI open
  skipChapter.lastSrc = skipChapter.lastSrc || '';
  skipChapter.hasForced = skipChapter.hasForced || false;

  const currentSrc = video.src || window.location.href;
  let wasForcedNow = false;
  
  // Reset state if video changes
  if (skipChapter.lastSrc !== currentSrc) {
      skipChapter.lastSrc = currentSrc;
      skipChapter.hasForced = false;
  }

  const getChapterEls = () => {
      const bar = document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]');
      if (!bar) return [];
      return Array.from(bar.children).filter(el => {
        const key = el.getAttribute('idomkey');
        return key && key.startsWith('chapter-');
      });
  };

  let chapterEls = getChapterEls();

  // Force UI open if no chapters found (only once per video)
  if (chapterEls.length === 0 && !skipChapter.hasForced) {
      console.log('[Chapters] No chapters found. Forcing UI...');
      skipChapter.hasForced = true;
      wasForcedNow = true;
      showNotification('Loading chapters...');
	  
	  sendKey(REMOTE_KEYS.ENTER);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      chapterEls = getChapterEls();
  }

  if (chapterEls.length === 0) {
      showNotification('No chapters found');
      if (wasForcedNow) setTimeout(() => simulateBack(), 250);
      return;
  }

  // Calculate timestamps
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
  let targetTime;

  if (direction === 'next') {
      // Find first timestamp significantly greater than current
      targetTime = timestamps.find(t => t > currentTime + 1);
  } else {
      // Previous Logic: 
      // 1. Identify current chapter index
      let currentIdx = -1;
      for (let i = 0; i < timestamps.length; i++) {
          if (currentTime >= timestamps[i]) currentIdx = i;
          else break;
      }

      if (currentIdx !== -1) {
          const chapterStart = timestamps[currentIdx];
          // If we are more than 3 seconds into the chapter, restart it.
          // Otherwise, go to the previous chapter.
          if (currentTime - chapterStart > 3) {
              targetTime = chapterStart;
          } else if (currentIdx > 0) {
              targetTime = timestamps[currentIdx - 1];
          } else {
              targetTime = 0; // Start of video
          }
      } else {
          targetTime = 0;
      }
  }

  if (targetTime !== undefined && targetTime < video.duration) {
      video.currentTime = targetTime;
      showNotification(direction === 'next' ? 'Next Chapter' : 'Previous Chapter');
      if (wasForcedNow) setTimeout(() => simulateBack(), 250);
  } else {
      showNotification(direction === 'next' ? 'No next chapter' : 'Start of video');
      if (wasForcedNow) setTimeout(() => simulateBack(), 250);
  }
}

function simulateBack() {
    console.log('[Shortcut] Simulating Back/Escape...');
	sendKey(REMOTE_KEYS.BACK);
}

// Helper: Execute internal component logic
function triggerInternal(element, name) {
    if (!element) return false;
    
    let success = false;
    
    // Try standard click
    try {
        element.click();
        console.log(`[Shortcut] Standard click triggered for ${name}`);
        success = true;
    } catch (e) {
        console.warn(`[Shortcut] Standard click failed for ${name}:`, e);
    }
    
    // Also try internal method if available (for older webOS versions)
    const instance = element.__instance;
    if (instance && typeof instance.onSelect === 'function') {
        console.log(`[Shortcut] Also calling internal onSelect() for ${name}`);
        try {
            const mockEvent = {
                type: 'click',
                stopPropagation: () => {},
                preventDefault: () => {},
                target: element,
                currentTarget: element,
                bubbles: true,
                cancelable: true
            };

            instance.onSelect(mockEvent);
            success = true;
        } catch (e) {
            console.warn(`[Shortcut] Internal call failed for ${name}:`, e);
        }
    }
    
    return success;
}

function handleShortcutAction(action) {
    const video = document.querySelector('video');
    const player = document.querySelector('.html5-video-player') || document.getElementById('movie_player');

    if (!video) return;

    switch (action) {
        case 'chapter_skip':
            skipChapter('next');
            break;
        case 'chapter_skip_prev':
            skipChapter('prev');
            break;
        case 'seek_15_fwd':
            video.currentTime = Math.min(video.duration, video.currentTime + 15);
            showNotification('Skipped +15s');
            break;
        case 'seek_15_back':
            video.currentTime = Math.max(0, video.currentTime - 15);
            showNotification('Skipped -15s');
            break;
        case 'play_pause':
            if (video.paused) {
                video.play();
                showNotification('Playing');
            } else {
                video.pause();
                showNotification('Paused');
            }
            break;

        case 'toggle_subs':
            let toggledViaApi = false;

            // 1. Attempt Native Player API (Preferred)
            if (player) {
                // Ensure the module is loaded (just in case)
                if (typeof player.loadModule === 'function') {
                    player.loadModule('captions');
                }

                if (typeof player.getOption === 'function' && typeof player.setOption === 'function') {
                    try {
                        const currentTrack = player.getOption('captions', 'track');
                        // Check if captions are currently active
                        const isEnabled = currentTrack && (currentTrack.languageCode || currentTrack.vssId);
                        if (isEnabled) {
                            // Turn OFF via API
                            player.setOption('captions', 'track', {});
                            showNotification('Subtitles: OFF');
                            toggledViaApi = true;
                        } else {
                            // Turn ON via API
                            const trackList = player.getOption('captions', 'tracklist');
                            const videoData = player.getVideoData ? player.getVideoData() : null;

                            // Find any valid track (API Tracklist OR Raw Metadata)
                            const targetTrack = (trackList && trackList[0]) ||
                                (videoData && videoData.captionTracks && videoData.captionTracks[0]);

                            if (targetTrack) {
                                player.setOption('captions', 'track', targetTrack);
                                showNotification(`Subtitles: ON (${targetTrack.languageName || targetTrack.name || targetTrack.languageCode})`);
                                toggledViaApi = true;
                            }
                        }
                    } catch (e) {
                        console.warn('[Shortcut] Subtitle API Error:', e);
                    }
                }
            }
            // 2. DOM Fallback (Only runs if API failed/was empty)
            if (!toggledViaApi) {
                const capsBtn = document.querySelector('ytlr-captions-button yt-button-container') || // New selector
                                document.querySelector('ytlr-captions-button ytlr-button') ||
                                document.querySelector('ytlr-toggle-button-renderer ytlr-button');
                
                if (capsBtn) {
                    // Simulate a physical click on the button
                    if (triggerInternal(capsBtn, 'Captions')) {
                        // Read the new state from the button's aria-pressed attribute after a tiny delay
                        setTimeout(() => {
                            const isPressed = capsBtn.getAttribute('aria-pressed') === 'true';
                            showNotification(isPressed ? 'Subtitles: ON' : 'Subtitles: OFF');
                        }, 250);
                        return;
                    }
                }
                showNotification('No subtitles found');
            }
            break;

        case 'toggle_comments':
            // 1. Try explicit new selector first
            let commBtn = document.querySelector('yt-button-container[aria-label="Comments"]');

            // 2. Fallback to icon search
            if (!commBtn) {
                const commIcon = document.querySelector('yt-icon.qHxFAf.ieYpu.wFZPnb');
                commBtn = commIcon ? commIcon.closest('ytlr-button') : null;
            }

            // 3. Fallback to positional selectors (Legacy method)
            if (!commBtn) {
                commBtn =
                    document.querySelector('ytlr-button-renderer[idomkey="item-1"] ytlr-button') ||
                    document.querySelector('[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_COMMENTS"] ytlr-button') ||
                    document.querySelector('ytlr-redux-connect-ytlr-like-button-renderer + ytlr-button-renderer ytlr-button');
            }

            if(commBtn) console.log(`[UI] Comments toggle button found:`, commBtn);

            // Check active state via button OR visible panel
            const isCommentsActive = commBtn && (
                commBtn.getAttribute('aria-pressed') === 'true' ||
                commBtn.getAttribute('aria-selected') === 'true'
            );

            const panel = document.querySelector('ytlr-engagement-panel-section-list-renderer') ||
                document.querySelector('ytlr-engagement-panel-title-header-renderer');

            const isPanelVisible = panel && window.getComputedStyle(panel).display !== 'none';

            if (isCommentsActive || isPanelVisible) {
                // IF OPEN: Close via Back simulation
                simulateBack();
                //showNotification('Closed Comments');
            } else {
                // IF CLOSED: Open via internal trigger
                if (triggerInternal(commBtn, 'Comments')) {
                    //showNotification('Opened Comments');
                } else {
                    const titleBtn = document.querySelector('.ytlr-video-title') || document.querySelector('h1');
                    if (titleBtn) {
                        titleBtn.click();
                        showNotification('Opened Desc (Title)');
                    } else {
                        showNotification('Comments Unavailable');
                    }
                }
            }
            break;
    }
}

const eventHandler = (evt) => {
  if (evt.repeat) return;
  console.info(
    'Key event:',
    evt.type,
    evt.charCode,
    evt.keyCode,
    evt.defaultPrevented
  );
  
  // --- Debug: Hold 0 Handling ---
	// if (evt.type === 'keydown' && optionsPanelVisible && evt.keyCode === 48) {
         // debugClickCount++;
         // // console.info(`Debug: Click count ${debugClickCount}`);
         
         // clearTimeout(debugClickTimer);
         
         // if (debugClickCount >= 5) {
             // console.info('Debug: Opening debug page');
             // if (optionsPanel.goToDebug) optionsPanel.goToDebug();
             // debugClickCount = 0;
         // } else {
             // // Reset count if user stops pressing for 2000ms
             // debugClickTimer = setTimeout(() => {
                 // debugClickCount = 0;
             // }, 2000); 
         // }
     
     // // Block '0' from doing anything else while panel is open
     // evt.preventDefault();
     // evt.stopPropagation();
     // return false;
  // }
  // ------------------------------

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
	if (!isWatchPage()) return true;
    console.info('Blue button pressed - attempting highlight jump');
    
    const jumpEnabled = configRead('enableHighlightJump');
    if (!jumpEnabled) return true; // Let default behavior happen
    
    // Prevent default early to avoid race condition
    evt.preventDefault();
    evt.stopPropagation();
    
    try {
      if (window.sponsorblock) {
        const jumped = window.sponsorblock.jumpToNextHighlight();
        if (!jumped) {
          showNotification('No highlights found in this video');
        }
      } else {
        showNotification('SponsorBlock not loaded');
      }
    } catch (e) {
      console.warn('Error jumping to highlight:', e);
      showNotification('Error: Unable to jump to highlight');
    }
    
    return false;
  } else if (keyColor === 'red' && evt.type === 'keydown') {
    console.info('OLED mode activated');
    evt.preventDefault();
    evt.stopPropagation();
    
    let overlay = document.getElementById('oled-black-overlay');
    if (overlay) {
      overlay.remove();
      console.info('OLED mode deactivated');

      if (oledKeepAliveTimer) {
        clearInterval(oledKeepAliveTimer);
        oledKeepAliveTimer = null;
      }
    } else {
	  if (optionsPanelVisible) {
        showOptionsPanel(false);
      }
      overlay = document.createElement('div');
      overlay.id = 'oled-black-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:9999';
      document.body.appendChild(overlay);

      // Start timer: Every 30 minutes, send UP twice to prevent sleep
      oledKeepAliveTimer = setInterval(() => {
        console.info('OLED Keep-alive: Sending UP x2');
        sendKey(REMOTE_KEYS.UP);
        setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
      }, 30 * 60 * 1000);
    }
    return false;
  } else if (evt.type === 'keydown' && evt.keyCode >= 48 && evt.keyCode <= 57) {
      // Check for user-defined shortcuts (Keys 0-9)
      const keyIndex = evt.keyCode - 48;
      
      if (optionsPanelVisible) {
          evt.preventDefault();
          evt.stopPropagation();
          return false;
      }
	  
	  // prevent shortcut keys on non-videos
	  if (!isWatchPage()) {
          return true;
      }

      const action = configRead(`shortcut_key_${keyIndex}`);
	  
	  // Always prevent default behavior for number keys on watch page
      // This prevents unassigned keys from triggering the player UI
      evt.preventDefault();
      evt.stopPropagation();
	  
      if (action && action !== 'none') {
          handleShortcutAction(action);
      }
  }
  return true;
};

// Only listen to keydown - keypress is deprecated and keyup is unnecessary
// This prevents triple event processing (66% reduction in overhead)
document.addEventListener('keydown', eventHandler, true);

// Cache the notification container reference for better performance
let notificationContainer = null;

export function showNotification(text, time = 3000) {
  if (configRead('disableNotifications')) return;
  
  // Create container only once (eliminates repeated DOM queries)
  if (!notificationContainer) {
    console.info('Adding notification container');
    notificationContainer = document.createElement('div');
    notificationContainer.classList.add('ytaf-notification-container');
    if (configRead('enableOledCareMode')) {
      notificationContainer.classList.add('oled-care');
    }
    document.body.appendChild(notificationContainer);
  }

  const elm = document.createElement('div');
  const elmInner = document.createElement('div');
  elmInner.innerText = text;
  elmInner.classList.add('message', 'message-hidden');
  elm.appendChild(elmInner);
  notificationContainer.appendChild(elm);

  // Use requestAnimationFrame for smoother animations
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      elmInner.classList.remove('message-hidden');
    });
  });

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

// Centralized logic for logo visibility
function updateLogoState() {
  const theme = configRead('uiTheme');
  const isOled = configRead('enableOledCareMode');

  const logoBlue = document.querySelector('.ytaf-logo.logo-blue');
  const logoRed = document.querySelector('.ytaf-logo.logo-red');
  const logoDark = document.querySelector('.ytaf-logo.logo-dark');

  // Safety check
  if (!logoBlue || !logoRed || !logoDark) return;

  if (isOled) {
    // If OLED mode is active, FORCE the dark logo regardless of theme
    logoBlue.style.display = 'none';
    logoRed.style.display = 'none';
    logoDark.style.display = '';
  } else {
    // If OLED is off, revert to theme preference
    logoDark.style.display = 'none';
    
    if (theme === 'classic-red') {
      logoRed.style.display = '';
      logoBlue.style.display = 'none';
    } else {
      logoRed.style.display = 'none';
      logoBlue.style.display = '';
    }
  }
}

function applyOledMode(enabled) {
  const optionsPanel = document.querySelector('.ytaf-ui-container');

  const oledClass = 'oled-care';
  if (enabled) {
    optionsPanel?.classList.add(oledClass);
    notificationContainer?.classList.add(oledClass);

    const style = document.createElement('style');
    style.id = 'style-gray-ui-oled-care';
    style.textContent = `
      #container { background-color: black !important; }
      .ytLrGuideResponseMask { background-color: black !important; }
      .ytLrGuideResponseGradient { display: none; }
      .ytLrAnimatedOverlayContainer { background-color: black !important; }
    `;
    document.head.appendChild(style);
  } else {
    optionsPanel?.classList.remove(oledClass);
    notificationContainer?.classList.remove(oledClass);
    document.getElementById('style-gray-ui-oled-care')?.remove();
  }
  
  // Update logos whenever OLED mode changes
  updateLogoState();
}

function applyTheme(theme) {
  const optionsPanel = document.querySelector('.ytaf-ui-container');
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  
  // Handle CSS Classes
  if (theme === 'classic-red') {
    optionsPanel?.classList.add('theme-classic-red');
    notificationContainer?.classList.add('theme-classic-red');
  } else {
    optionsPanel?.classList.remove('theme-classic-red');
    notificationContainer?.classList.remove('theme-classic-red');
  }
  
  // Update logos whenever Theme changes
  updateLogoState();
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

// Initialize OLED Mode
applyOledMode(configRead('enableOledCareMode'));
configAddChangeListener('enableOledCareMode', (evt) => {
  applyOledMode(evt.detail.newValue);
});

// Initialize Theme
applyTheme(configRead('uiTheme'));
configAddChangeListener('uiTheme', (evt) => {
  applyTheme(evt.detail.newValue);
});

configAddChangeListener('enableAdBlock', (evt) => {
  if (evt.detail.newValue) {
    initAdblock();
    showNotification('AdBlock Enabled');
  } else {
    destroyAdblock();
    showNotification('AdBlock Disabled');
  }
});

// Sync initial state
if (!configRead('enableAdBlock')) {
    destroyAdblock();
}

setTimeout(() => {
  showNotification('Press [GREEN] to open SponsorBlock configuration screen');
}, 2000);