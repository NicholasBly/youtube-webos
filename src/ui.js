/*global navigate*/
import './spatial-navigation-polyfill.js';
import { configAddChangeListener, configRead, configWrite, configGetDesc, segmentTypes, configGetDefault, shortcutActions, sbModes, sbModesHighlight } from './config.js';
import './ui.css';
import './auto-login.js';
import './return-dislike.js';
// import { initYouTubeFixes } from './yt-fixes.js';
import { initVideoQuality } from './video-quality.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { sendKey, REMOTE_KEYS, isGuestMode, isWatchPage, isShortsPage, SELECTORS } from './utils.js';
import { initAdblock, destroyAdblock } from './adblock.js';

let lastSafeFocus = null;
let oledKeepAliveTimer = null;

let lastShortcutTime = 0;
let lastShortcutKey = -1;
let shortcutDebounceTime = 100;

// Seek Burst Variables
let seekAccumulator = 0;
let seekResetTimer = null;
let activeSeekNotification = null;

let activePlayPauseNotification = null;
let playPauseNotificationTimer = null;

// Lazy load variable
let optionsPanel = null;
let optionsPanelVisible = false;

const shortcutCache = {};
// Define keys including colors
const shortcutKeys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'red', 'green', 'blue'];

function updateShortcutCache(key) {
    shortcutCache[key] = configRead(`shortcut_key_${key}`);
}

// Initialize cache and listeners
shortcutKeys.forEach(key => {
    updateShortcutCache(key);
    configAddChangeListener(`shortcut_key_${key}`, () => updateShortcutCache(key));
});

// --- Polyfills & Helpers ---

if (!Element.prototype.matches) {
    Element.prototype.matches = 
        Element.prototype.webkitMatchesSelector || 
        Element.prototype.mozMatchesSelector || 
        Element.prototype.msMatchesSelector || 
        Element.prototype.oMatchesSelector;
}
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

const simulateBack = () => { console.log('[Shortcut] Simulating Back/Escape...'); sendKey(REMOTE_KEYS.BACK); };

window.__spatialNavigation__.keyMode = 'NONE';
const ARROW_KEY_CODE = { 
  [REMOTE_KEYS.LEFT.code]: 'left', 
  [REMOTE_KEYS.UP.code]: 'up', 
  [REMOTE_KEYS.RIGHT.code]: 'right', 
  [REMOTE_KEYS.DOWN.code]: 'down' 
};

const colorCodeMap = new Map([
    [403, 'red'], [166, 'red'], 
    [404, 'green'], [172, 'green'], 
    [405, 'yellow'], [170, 'yellow'], 
    [406, 'blue'], [167, 'blue'], [191, 'blue']
]);
const getKeyColor = (charCode) => colorCodeMap.get(charCode) || null;

// --- DOM Utility Functions ---

const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  
  for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
          const val = props[key];
          if (key === 'style' && typeof val === 'object') {
              for (const styleKey in val) {
                  if (Object.prototype.hasOwnProperty.call(val, styleKey)) {
                      el.style[styleKey] = val[styleKey];
                  }
              }
          }
          else if (key === 'class') el.className = val;
          else if (key === 'events' && typeof val === 'object') {
              for (const evt in val) {
                  if (Object.prototype.hasOwnProperty.call(val, evt)) {
                      el.addEventListener(evt, val[evt]);
                  }
              }
          }
          else if (key === 'text') el.textContent = val;
          else if (key === 'html') el.innerHTML = val;
          else el[key] = val;
      }
  }

  for (let i = 0; i < children.length; i++) {
      const child = children[i];
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
};

// --- UI Construction Functions ---

function createConfigCheckbox(key) {
  const elmInput = createElement('input', { type: 'checkbox', checked: configRead(key), events: { change: (evt) => configWrite(key, evt.target.checked) }});
  
  const labelContent = createElement('div', { class: 'label-content', style: { fontSize: '2.1vh' } }, elmInput, `\u00A0${configGetDesc(key)}`);
  const elmLabel = createElement('label', {}, labelContent);
  
  elmInput.addEventListener('focus', () => elmLabel.classList.add('focused'));
  elmInput.addEventListener('blur', () => elmLabel.classList.remove('focused'));
  configAddChangeListener(key, (evt) => elmInput.checked = evt.detail.newValue);
  
  return elmLabel;
}

function createSegmentControl(key) {
  const isHighlight = key === 'sbMode_highlight';
  const modesMap = isHighlight ? sbModesHighlight : sbModes;
  const modes = Object.keys(modesMap);
  const colorKey = isHighlight ? 'poi_highlightColor' : key.replace('sbMode_', '') + 'Color';
  
  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => valueText.textContent = modesMap[configRead(key)] || configRead(key);
  
  const cycle = (dir) => {
    let idx = modes.indexOf(configRead(key));
    if (idx === -1) idx = 0;
    idx = dir === 'next' ? (idx + 1) % modes.length : (idx - 1 + modes.length) % modes.length;
    configWrite(key, modes[idx]);
    updateDisplay();
  };

  const container = createElement('div', { 
    class: 'shortcut-control-row',
    style: { padding: '0.6vh 0', margin: '0.2vh 0' }, 
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (e.keyCode === REMOTE_KEYS.LEFT.code) { cycle('prev'); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === REMOTE_KEYS.RIGHT.code || e.keyCode === REMOTE_KEYS.ENTER.code) { cycle('next'); e.stopPropagation(); e.preventDefault(); }
      },
      click: () => cycle('next')
    }
  },
    createElement('span', { text: configGetDesc(key), class: 'shortcut-label', style: { fontSize: '2.1vh' } }),
    createElement('div', { class: 'shortcut-value-container' },
      createElement('span', { text: '<', class: 'arrow-btn' }),
      valueText,
      createElement('span', { text: '>', class: 'arrow-btn' })
    )
  );

  const hasColorPicker = segmentTypes[key.replace('sbMode_', '')] || (isHighlight && segmentTypes['poi_highlight']);
  if (hasColorPicker) {
      const resetButton = createElement('button', { 
          text: 'R', 
          class: 'reset-color-btn', 
          tabIndex: -1,
          events: { 
            click: (evt) => { evt.preventDefault(); evt.stopPropagation(); configWrite(colorKey, configGetDefault(colorKey)); }
          }
      });
      const colorInput = createElement('input', { 
          type: 'color', 
          value: configRead(colorKey), 
          tabIndex: -1,
          events: { 
              click: (evt) => { evt.stopPropagation(); },
              input: (evt) => configWrite(colorKey, evt.target.value) 
          }
      });
      
      configAddChangeListener(colorKey, (evt) => { colorInput.value = evt.detail.newValue; window.sponsorblock?.buildOverlay(); });
      container.querySelector('.shortcut-value-container').appendChild(createElement('div', { style: { display: 'flex', marginLeft: '10px' } }, resetButton, colorInput));
  }
  
  configAddChangeListener(key, updateDisplay);
  updateDisplay();
  return container;
}

function createSection(title, elements) {
  const legend = createElement('div', { text: title, style: { color: '#aaa', fontSize: '2.4vh', marginBottom: '0.4vh', fontWeight: 'bold', textTransform: 'uppercase' }});
  const fieldset = createElement('div', { class: 'ytaf-settings-section', style: { marginTop: '1vh', marginBottom: '0.5vh', padding: '0vh', border: '2px solid #444', borderRadius: '5px' }}, legend, ...elements);
  return fieldset;
}

function createShortcutControl(keyIdentifier) {
  const configKey = `shortcut_key_${keyIdentifier}`;
  const actions = Object.keys(shortcutActions);
  const isColor = ['red', 'green', 'blue'].includes(keyIdentifier);
  
  const labelText = isColor 
    ? `${keyIdentifier.charAt(0).toUpperCase() + keyIdentifier.slice(1)} Button` 
    : `Key ${keyIdentifier}`;

  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => valueText.textContent = shortcutActions[configRead(configKey)] || configRead(configKey);
  const cycle = (dir) => {
    let idx = actions.indexOf(configRead(configKey));
    if (idx === -1) idx = 0;
    idx = dir === 'next' ? (idx + 1) % actions.length : (idx - 1 + actions.length) % actions.length;
    configWrite(configKey, actions[idx]);
    updateDisplay();
  };

  const container = createElement('div', { 
    class: 'shortcut-control-row', 
    style: { padding: '0.6vh 0', margin: '0.2vh 0' },
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (e.keyCode === REMOTE_KEYS.LEFT.code) { cycle('prev'); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === REMOTE_KEYS.RIGHT.code || e.keyCode === REMOTE_KEYS.ENTER.code) { cycle('next'); e.stopPropagation(); e.preventDefault(); }
      },
      click: () => cycle('next')
    }
  }, 
    createElement('span', { text: labelText, class: 'shortcut-label', style: { fontSize: '2.1vh' } }),
    createElement('div', { class: 'shortcut-value-container' },
      createElement('span', { text: '<', class: 'arrow-btn' }),
      valueText,
      createElement('span', { text: '>', class: 'arrow-btn' })
    )
  );
  
  configAddChangeListener(configKey, updateDisplay);
  updateDisplay();
  return container;
}

// --- Main Options Panel Logic ---

function createOpacityControl(key) {
  const step = 5;
  const min = 0;
  const max = 100;
  
  const valueText = createElement('span', { class: 'current-value' });
  const updateDisplay = () => valueText.textContent = `${configRead(key)}%`;
  
  const changeValue = (delta) => {
    let val = configRead(key);
    val = Math.min(max, Math.max(min, val + delta));
    configWrite(key, val);
    updateDisplay();
  };

  const container = createElement('div', { 
    class: 'shortcut-control-row',
    style: { padding: '0.6vh 0', margin: '0.2vh 0' },
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (e.keyCode === REMOTE_KEYS.LEFT.code) { // Left
          changeValue(-step); 
          e.stopPropagation(); 
          e.preventDefault(); 
        }
        else if (e.keyCode === REMOTE_KEYS.RIGHT.code || e.keyCode === REMOTE_KEYS.ENTER.code) { // Right or Enter
          changeValue(step); 
          e.stopPropagation(); 
          e.preventDefault(); 
        }
      },
      click: () => changeValue(step)
    }
  }, 
    createElement('span', { text: configGetDesc(key), class: 'shortcut-label', style: { fontSize: '2.1vh' } }),
    createElement('div', { class: 'shortcut-value-container' },
      createElement('span', { text: '<', class: 'arrow-btn', events: { click: (e) => { e.stopPropagation(); changeValue(-step); } } }),
      valueText,
      createElement('span', { text: '>', class: 'arrow-btn', events: { click: (e) => { e.stopPropagation(); changeValue(step); } } })
    )
  );
  
  configAddChangeListener(key, updateDisplay);
  updateDisplay();
  return container;
}

function createOptionsPanel() {
  const elmContainer = createElement('div', { 
    class: isGuestMode() ? 'ytaf-ui-container guest-mode' : 'ytaf-ui-container',
    style: { display: 'none' }, 
    tabIndex: 0,
    events: {
      focus: () => console.info('Options panel focused!'),
      blur: () => console.info('Options panel blurred!')
    }
  });

  let activePage = 0;
  elmContainer.activePage = 0;
  let pageMain, pageSponsor, pageShortcuts, pageUITweaks;

  const setActivePage = (pageIndex) => {
    activePage = elmContainer.activePage = pageIndex;
    [pageMain, pageSponsor, pageShortcuts, pageUITweaks].forEach(p => { if(p) p.style.display = 'none'; });
    
    const pages = [
      { page: pageMain, selector: 'input', popup: false },
      { page: pageSponsor, selector: '.shortcut-control-row', popup: (isWatchPage()) },
      { page: pageShortcuts, selector: '.shortcut-control-row', popup: false },
      { page: pageUITweaks, selector: '.shortcut-control-row', popup: false }
    ];
    
    if (pages[pageIndex]) {
      pages[pageIndex].page.style.display = 'block';
      const focusTarget = pages[pageIndex].page.querySelector(pages[pageIndex].selector);
      if(focusTarget) focusTarget.focus();
      sponsorBlockUI.togglePopup(pages[pageIndex].popup);
    }
  };

  // Keyboard Navigation for the Options Panel
  elmContainer.addEventListener('keydown', (evt) => {
    if (getKeyColor(evt.charCode || evt.keyCode) === 'green') return; // Let global handler handle close if mapped to green (or config_menu logic)

    if (evt.keyCode in ARROW_KEY_CODE) {
      const dir = ARROW_KEY_CODE[evt.keyCode];
      if (dir === 'left' || dir === 'right') {
        const preFocus = document.activeElement;
        
        // Prevent accidental page switch when modifying controls
        if (preFocus.classList.contains('shortcut-control-row')) return;
        if (activePage === 1) {
          // Sponsor page now uses shortcut-control-row so this check is redundant but safe
          if (preFocus.matches('blockquote input[type="checkbox"]')) { setActivePage(0); evt.preventDefault(); evt.stopPropagation(); return; }
        }

        navigate(dir);
        
        // If focus didn't move (hit edge), try changing pages
        if (preFocus === document.activeElement) {
          if (dir === 'right' && activePage < 3) setActivePage(activePage + 1);
          else if (dir === 'left' && activePage > 0) setActivePage(activePage - 1);
          evt.preventDefault(); evt.stopPropagation(); return;
        }
        evt.preventDefault(); evt.stopPropagation(); return;
      }
      navigate(ARROW_KEY_CODE[evt.keyCode]);
    } else if (evt.keyCode === REMOTE_KEYS.ENTER.code) {
      if (evt instanceof KeyboardEvent) document.activeElement.click();
    } else if (evt.keyCode === 27) { // Escape
      showOptionsPanel(false);
    }
    evt.preventDefault(); evt.stopPropagation();
  }, true);

  // Logo creation with theme toggle
  const toggleTheme = (evt) => { evt.preventDefault(); evt.stopPropagation(); configWrite('uiTheme', configRead('uiTheme') === 'blue-force-field' ? 'classic-red' : 'blue-force-field'); };
  const createLogo = (src, cls) => createElement('img', { src, alt: 'Logo', class: `ytaf-logo ${cls}`, title: 'Click to switch theme', style: cls !== 'logo-blue' ? { display: 'none' } : {}, events: { click: toggleTheme }});
  
  const elmHeading = createElement('h1', {},
    createElement('span', { text: 'YouTube Extended' }),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel.png', 'logo-blue'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel2.png', 'logo-red'),
    createLogo('https://raw.githubusercontent.com/NicholasBly/youtube-webos/refs/heads/main/src/icons/NB%20Logo-gigapixel4.png', 'logo-dark')
  );
  elmContainer.appendChild(elmHeading);

  // --- Page 1: Main ---
  pageMain = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-main' });
  
  const elAdBlock = createConfigCheckbox('enableAdBlock');
  const cosmeticGroup = [elAdBlock];
  let elRemoveGlobalShorts = null, elRemoveTopLiveGames = null, elGuestPrompts = null;
  
  elRemoveGlobalShorts = createConfigCheckbox('removeGlobalShorts');
  elRemoveTopLiveGames = createConfigCheckbox('removeTopLiveGames');
  cosmeticGroup.push(elRemoveGlobalShorts, elRemoveTopLiveGames);
  if (isGuestMode()) { elGuestPrompts = createConfigCheckbox('hideGuestSignInPrompts'); cosmeticGroup.push(elGuestPrompts); }

  pageMain.appendChild(createSection('Cosmetic Filtering', cosmeticGroup));

  // Dependency Management
  const setState = (el, enabled) => { if (!el) return; const input = el.querySelector('input'); if (input) { input.disabled = !enabled; el.style.opacity = enabled ? '1' : '0.5'; }};
  const updateDependencyState = () => {
    const isAdBlockOn = configRead('enableAdBlock');
    if (!isAdBlockOn) { [elRemoveGlobalShorts, elRemoveTopLiveGames, elGuestPrompts].forEach(el => setState(el, false)); return; }
    [elRemoveGlobalShorts, elRemoveTopLiveGames, elGuestPrompts].forEach(el => setState(el, true));
  };
  
  elAdBlock.querySelector('input').addEventListener('change', updateDependencyState);
  if (elRemoveGlobalShorts) {
    elRemoveGlobalShorts.querySelector('input').addEventListener('change', updateDependencyState);
    configAddChangeListener('removeGlobalShorts', updateDependencyState);
  }
  configAddChangeListener('enableAdBlock', updateDependencyState);
  updateDependencyState();

  pageMain.appendChild(createSection('Video Player', [createConfigCheckbox('forceHighResVideo'), createConfigCheckbox('hideEndcards'), createConfigCheckbox('enableReturnYouTubeDislike')]));
  pageMain.appendChild(createSection('Interface', [createConfigCheckbox('enableAutoLogin'), createConfigCheckbox('upgradeThumbnails'), createConfigCheckbox('hideLogo'), createConfigCheckbox('showWatch'), createConfigCheckbox('enableOledCareMode'), createConfigCheckbox('disableNotifications')]));
  
  const navHintNextMain = createElement('div', { class: 'ytaf-nav-hint right', tabIndex: 0, html: 'SponsorBlock Settings <span class="arrow">&rarr;</span>', events: { click: () => setActivePage(1) }});
  pageMain.appendChild(navHintNextMain);
  elmContainer.appendChild(pageMain);

  // --- Page 2: SponsorBlock ---
  pageSponsor = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-sponsor', style: { display: 'none' }});
  pageSponsor.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> Main Settings', events: { click: () => setActivePage(0) }}));
  pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));
  
  const elmBlock = createElement('blockquote', {},
    ...['Sponsor', 'Intro', 'Outro', 'Interaction', 'SelfPromo', 'MusicOfftopic', 'Filler', 'Hook', 'Preview'].map(s => createSegmentControl(`sbMode_${s.toLowerCase()}`)),
    createSegmentControl('sbMode_highlight'),
    createConfigCheckbox('enableMutedSegments'),
	createConfigCheckbox('skipSegmentsOnce')
  );
  pageSponsor.appendChild(elmBlock);
  pageSponsor.appendChild(createElement('div', { html: '<small>Sponsor segments skipping - https://sponsor.ajay.app</small>' }));
  pageSponsor.appendChild(createElement('div', { class: 'ytaf-nav-hint right', tabIndex: 0, html: 'Shortcuts <span class="arrow">&rarr;</span>', events: { click: () => setActivePage(2) }}));
  elmContainer.appendChild(pageSponsor);

  // --- Page 3: Shortcuts ---
  pageShortcuts = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-shortcuts', style: { display: 'none' }});
  pageShortcuts.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> SponsorBlock Settings', events: { click: () => setActivePage(1) }}));
  shortcutKeys.forEach(key => pageShortcuts.appendChild(createShortcutControl(key)));
  pageShortcuts.appendChild(createElement('div', { class: 'ytaf-nav-hint right', tabIndex: 0, html: 'UI Tweaks <span class="arrow">&rarr;</span>', events: { click: () => setActivePage(3) }}));
  elmContainer.appendChild(pageShortcuts);
  
  // --- Page 4: UI Tweaks ---
  pageUITweaks = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-ui-tweaks', style: { display: 'none' }});
  pageUITweaks.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> Shortcuts', events: { click: () => setActivePage(2) }}));
  
  pageUITweaks.appendChild(createSection('Player UI Tweaks', [
      createOpacityControl('videoShelfOpacity'),
      createElement('div', { text: 'Adjusts opacity of black background underneath videos (Requires OLED-care mode)', style: { color: '#aaa', fontSize: '18px', padding: '4px 12px 12px' } }),
	  createConfigCheckbox('fixMultilineTitles')
  ]));
  
  elmContainer.appendChild(pageUITweaks);

  return elmContainer;
}

// Lazy Load: optionsPanel is not created here.
// document.body.appendChild(optionsPanel); removed

function showOptionsPanel(visible) {
  if (visible === undefined || visible === null) visible = true;
  
  if (visible && !optionsPanelVisible) {
    
    // Lazy Initialization
    if (!optionsPanel) {
        console.log('[UI] Initializing Options Panel (Lazy Load)...');
        optionsPanel = createOptionsPanel();
        document.body.appendChild(optionsPanel);
        
        // Apply startup states that depend on panel existence
        applyOledMode(configRead('enableOledCareMode'));
        applyTheme(configRead('uiTheme'));
    }

    console.info('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    if (optionsPanel.activePage === 1 && (isWatchPage())) sponsorBlockUI.togglePopup(true);
    else sponsorBlockUI.togglePopup(false);
    
    // Find best initial focus
    const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input, .shortcut-control-row')).find(el => el.offsetParent !== null && !el.disabled);
    if (firstVisibleInput) { firstVisibleInput.focus(); lastSafeFocus = firstVisibleInput; }
    else { optionsPanel.focus(); lastSafeFocus = optionsPanel; }
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible && optionsPanel) {
    console.info('Hiding options panel!');
    optionsPanel.style.display = 'none';
    sponsorBlockUI.togglePopup(false);
    optionsPanel.blur();
    optionsPanelVisible = false;
    lastSafeFocus = null;
  }
}

// Trap focus inside options panel when visible
document.addEventListener('focus', (e) => {
  if (!optionsPanelVisible || !optionsPanel) return;
  const target = e.target;
  const isSafeFocus = (optionsPanel && optionsPanel.contains(target)) || (target.closest && target.closest('.sb-segments-popup'));
  if (isSafeFocus) lastSafeFocus = target;
  else {
    e.stopPropagation();
    e.preventDefault();
    if (lastSafeFocus && document.body.contains(lastSafeFocus)) lastSafeFocus.focus();
    else {
      const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input, .shortcut-control-row')).find(el => el.offsetParent !== null && !el.disabled);
      if (firstVisibleInput) firstVisibleInput.focus();
      else optionsPanel.focus();
    }
  }
}, true);

window.ytaf_showOptionsPanel = showOptionsPanel;

// --- Video Control Logic ---

async function skipChapter(direction = 'next') {
  if(isShortsPage()) return;
  const video = document.querySelector('video');
  if (!video || !video.duration) return;

  skipChapter.lastSrc = skipChapter.lastSrc || '';
  skipChapter.hasForced = skipChapter.hasForced || false;

  const currentSrc = video.src || window.location.href;
  let wasForcedNow = false;
  
  if (skipChapter.lastSrc !== currentSrc) { skipChapter.lastSrc = currentSrc; skipChapter.hasForced = false; }

  const getChapterEls = () => {
    const bar = document.querySelector('ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]');
    if (!bar) return [];
    // Avoid creating an array copy if possible, but structure might require it. 
    // Using bar.children directly in loop below.
    return bar.children;
  };

  let chapterEls = getChapterEls();

  // Hack: Force UI to load chapters if they aren't in DOM
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

  // Single-pass calculation O(N)
  const totalDuration = video.duration;
  const currentTime = video.currentTime;
  let accumulatedWidth = 0;
  let totalWidth = 0;

  // 1. Calculate total width first
  for (let i = 0; i < chapterEls.length; i++) {
      const el = chapterEls[i];
      if (el.getAttribute('idomkey')?.startsWith('chapter-')) {
          totalWidth += parseFloat(el.style.width || '0');
      }
  }

  if (totalWidth === 0) return;

  let targetTime = -1;
  let currentChapterStart = 0;
  let prevChapterStart = 0;

  // 2. Find target
  for (let i = 0; i < chapterEls.length; i++) {
      const el = chapterEls[i];
      if (!el.getAttribute('idomkey')?.startsWith('chapter-')) continue;

      const width = parseFloat(el.style.width || '0');
      const startTimestamp = (accumulatedWidth / totalWidth) * totalDuration;
      accumulatedWidth += width;

      if (direction === 'next') {
        if (startTimestamp > currentTime + 1) {
            targetTime = startTimestamp;
            break;
        }
      } else {
        // Prev logic
        if (currentTime >= startTimestamp) {
            prevChapterStart = currentChapterStart;
            currentChapterStart = startTimestamp;
        } else {
            // Passed current time
            break;
        }
      }
  }
  
  // Finalize Previous Target
  if (direction !== 'next') {
      if (currentTime - currentChapterStart > 3) targetTime = currentChapterStart;
      else targetTime = prevChapterStart;
  }

  if (targetTime !== -1 && targetTime < video.duration) {
    video.currentTime = targetTime;
    showNotification(direction === 'next' ? 'Next Chapter' : 'Previous Chapter');
    if (wasForcedNow) setTimeout(() => simulateBack(), 250);
  } else {
    showNotification(direction === 'next' ? 'No next chapter' : 'Start of video');
    if (wasForcedNow) setTimeout(() => simulateBack(), 250);
  }
}

function performBurstSeek(seconds, video) {
    if (!video) video = document.querySelector('video');
    if (!video) return;
	
	if ((seekAccumulator > 0 && seconds < 0) || (seekAccumulator < 0 && seconds > 0)) {
        seekAccumulator = 0;
    }

    seekAccumulator += seconds;
    video.currentTime += seconds;

    if (seekResetTimer) clearTimeout(seekResetTimer);

    const directionSymbol = seekAccumulator > 0 ? '+' : '';
    const msg = `Skipped ${directionSymbol}${seekAccumulator}s`;

    if (activeSeekNotification) {
         activeSeekNotification.update(msg);
    } else {
         activeSeekNotification = showNotification(msg);
    }

    seekResetTimer = setTimeout(() => {
        seekAccumulator = 0;
        activeSeekNotification = null;
        seekResetTimer = null;
    }, 1200);
}

function triggerInternal(element, name) {
  if (!element) return false;
  let success = false;
  try { element.click(); console.log(`[Shortcut] Standard click triggered for ${name}`); success = true; } 
  catch (e) { console.warn(`[Shortcut] Standard click failed for ${name}:`, e); }
  
  // Try to access internal React/Polymer instance for robust clicking
  const instance = element.__instance;
  if (instance && typeof instance.onSelect === 'function') {
    console.log(`[Shortcut] Also calling internal onSelect() for ${name}`);
    try {
      const mockEvent = { type: 'click', stopPropagation: () => {}, preventDefault: () => {}, target: element, currentTarget: element, bubbles: true, cancelable: true };
      instance.onSelect(mockEvent);
      success = true;
    } catch (e) { console.warn(`[Shortcut] Internal call failed for ${name}:`, e); }
  }
  return success;
}

// --- Shortcut Helper Functions (Static Logic) ---
// Extracted to prevent object allocation inside handlers

function toggleSubtitlesLogic(player) {
    let toggledViaApi = false;
    if (player) {
        // Try API first
        if (typeof player.loadModule === 'function') player.loadModule('captions');
        if (typeof player.getOption === 'function' && typeof player.setOption === 'function') {
          try {
            const currentTrack = player.getOption('captions', 'track');
            const isEnabled = currentTrack && (currentTrack.languageCode || currentTrack.vssId);
            if (isEnabled) { player.setOption('captions', 'track', {}); showNotification('Subtitles: OFF'); toggledViaApi = true; }
            else {
              const trackList = player.getOption('captions', 'tracklist');
              const videoData = player.getVideoData ? player.getVideoData() : null;
              const targetTrack = (trackList && trackList[0]) || (videoData && videoData.captionTracks && videoData.captionTracks[0]);
              if (targetTrack) { player.setOption('captions', 'track', targetTrack); showNotification(`Subtitles: ON (${targetTrack.languageName || targetTrack.name || targetTrack.languageCode})`); toggledViaApi = true; }
            }
          } catch (e) { console.warn('[Shortcut] Subtitle API Error:', e); }
        }
    }
    // Fallback to UI clicking
    if (!toggledViaApi) {
        const capsBtn = document.querySelector('ytlr-captions-button yt-button-container') || document.querySelector('ytlr-captions-button ytlr-button');
        if (capsBtn) {
          if (triggerInternal(capsBtn, 'Captions')) {
            setTimeout(() => {
              const isPressed = capsBtn.getAttribute('aria-pressed') === 'true';
              showNotification(isPressed ? 'Subtitles: ON' : 'Subtitles: OFF');
            }, 250);
            return;
          }
        }
        showNotification('Subtitles unavailable');
    }
}

function toggleCommentsLogic() {
    // 1. Try finding Comments Button
    let target = document.querySelector('yt-button-container[aria-label="Comments"]');

    if (!target) {
        target = document.querySelector('yt-icon.qHxFAf.ieYpu.nGYLgf') || 
                 document.querySelector('yt-icon.qHxFAf.ieYpu.wFZPnb') ||
                 document.querySelector('ytlr-button-renderer[idomkey="item-1"] ytlr-button') || 
                 document.querySelector('[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_COMMENTS"] ytlr-button') || 
                 document.querySelector('ytlr-redux-connect-ytlr-like-button-renderer + ytlr-button-renderer ytlr-button');
    }
    if (!target) {
          target = document.querySelector('ytlr-button-renderer[idomkey="1"] yt-button-container'); // Shorts
    }
    let commBtn = target ? target.closest('yt-button-container, ytlr-button') : null;
    let isLiveChat = false;

    // 2. Fallback: Live Chat (Only if comments not found)
    if (!commBtn) {
          const chatTarget = document.querySelector('ytlr-live-chat-toggle-button yt-button-container') ||
                             document.querySelector('yt-button-container[aria-label="Live chat"]');
          if (chatTarget) {
              commBtn = chatTarget;
              isLiveChat = true;
          }
    }

    // 3. Execution Logic
    const isBtnActive = commBtn && (commBtn.getAttribute('aria-pressed') === 'true' || commBtn.getAttribute('aria-selected') === 'true');
    const panel = document.querySelector('ytlr-engagement-panel-section-list-renderer') || document.querySelector('ytlr-engagement-panel-title-header-renderer');
    const isPanelVisible = panel && window.getComputedStyle(panel).display !== 'none';
      
    if ((isBtnActive || isPanelVisible) && !isLiveChat) simulateBack();
    else {
        if (triggerInternal(commBtn, isLiveChat ? 'Live Chat' : 'Comments')) {
            if (isLiveChat) {
                setTimeout(() => {
                    const pressed = commBtn.getAttribute('aria-pressed') === 'true';
                    showNotification(pressed ? 'Live Chat: ON' : 'Live Chat: OFF');
                }, 250);
            }
        }
        else {
            showNotification(isLiveChat ? 'Live Chat Unavailable' : 'Comments Unavailable');
        }
    }
}

function toggleDescriptionLogic() {
    // 1. Try English text finding
    let descText = Array.from(document.querySelectorAll('yt-formatted-string.XGffTd.OqGroe'))
        .find(el => el.textContent.trim() === 'Description');
    let target = descText ? descText.closest('yt-button-container') : null;

    // 2. Fallback: Structural finding for non-English (look for text-button in generic renderer, excluding subscribe/join which are usually different or have icons)
    if (!target) {
        const genericTextBtn = document.querySelector('ytlr-button-renderer yt-formatted-string.XGffTd.OqGroe');
        if (genericTextBtn) target = genericTextBtn.closest('yt-button-container');
    }

    const isDescActive = target && (target.getAttribute('aria-pressed') === 'true' || target.getAttribute('aria-selected') === 'true');
    // Re-use panel detection from comments as they share the side panel space
    const panel = document.querySelector('ytlr-engagement-panel-section-list-renderer') || document.querySelector('ytlr-engagement-panel-title-header-renderer');
    const isPanelVisible = panel && window.getComputedStyle(panel).display !== 'none';

    if (isDescActive || isPanelVisible) simulateBack();
    else {
        if (triggerInternal(target, 'Description')) {
            setTimeout(() => {
                if (window.returnYouTubeDislike) {
                    console.log('[Shortcut] Manually triggering RYD check for description panel...');
                    window.returnYouTubeDislike.observeBodyForPanel();
                }
            }, 350);
        }
        else showNotification('Description Unavailable');
    }
}

function saveToPlaylistLogic() {
    // 1. Try English Aria Label
    let target = document.querySelector('yt-button-container[aria-label="Save"]');

    // 2. Fallback: Specific icon class (p9sZp) found in Save button
    if (!target) {
        const icon = document.querySelector('yt-icon.p9sZp');
        if (icon) target = icon.closest('yt-button-container');
    }
      
    const panel = document.querySelector('.AmQJbe');
      
    if (panel) simulateBack();
    else {
        if (!triggerInternal(target, 'Save/Watch Later')) {
            showNotification('Save Button Unavailable');
        }
    }
}

function playPauseLogic(video) {
    const notify = (msg) => {
        if (activePlayPauseNotification) {
            activePlayPauseNotification.update(msg);
        } else {
            activePlayPauseNotification = showNotification(msg);
        }
        
        if (playPauseNotificationTimer) clearTimeout(playPauseNotificationTimer);
        playPauseNotificationTimer = setTimeout(() => {
            activePlayPauseNotification = null;
            playPauseNotificationTimer = null;
        }, 3000);
    };

    if (video.paused) { 
        video.play(); 
        notify('Playing');
    } else {
        const controls = document.querySelector('yt-focus-container[idomkey="controls"]');
        const isControlsVisible = controls && controls.classList.contains('MFDzfe--focused');
        const panel = document.querySelector('ytlr-engagement-panel-section-list-renderer') || document.querySelector('ytlr-engagement-panel-title-header-renderer');
        const isPanelVisible = panel && window.getComputedStyle(panel).display !== 'none';
        const watchOverlay = document.querySelector('.webOs-watch');
        let needsHide = false;
        if(!isControlsVisible) {
            needsHide = true;
            document.body.classList.add('ytaf-hide-controls');
            if (watchOverlay) watchOverlay.style.opacity = '0';
        }
        
        video.pause();
        notify('Paused');

        // Dismiss controls
        if(needsHide && !isShortsPage() && !isPanelVisible) {
            shortcutDebounceTime = 650;
        
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            
            setTimeout(() => sendKey(REMOTE_KEYS.BACK, document.activeElement), 250); // don't press back button if we're on shorts or we leave the page
        }
        
        if(needsHide && !isShortsPage()) {
            setTimeout(() => {
              document.body.classList.remove('ytaf-hide-controls');
              if (watchOverlay) watchOverlay.style.opacity = '';
            }, 750);
        }
    }
}

function handleShortcutAction(action) {
  // Global Actions - Do not require Video
  if (action === 'config_menu') {
      showOptionsPanel(!optionsPanelVisible);
      return;
  }
  
  if (action === 'oled_toggle') {
      let overlay = document.getElementById('oled-black-overlay');
      if (overlay) {
          overlay.remove();
          if (oledKeepAliveTimer) { clearInterval(oledKeepAliveTimer); oledKeepAliveTimer = null; }
          showNotification('OLED Mode Deactivated');
      } else {
          if (optionsPanelVisible) showOptionsPanel(false);
          overlay = createElement('div', { id: 'oled-black-overlay', style: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#000', zIndex: 9999 }});
          document.body.appendChild(overlay);
          
          // Keep TV awake by simulating input
          oledKeepAliveTimer = setInterval(() => {
            sendKey(REMOTE_KEYS.UP);
            setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
          }, 30 * 60 * 1000);
          showNotification('OLED Mode Activated');
      }
      return;
  }

  // Player Actions - Require Video/Context
  // Check context for player actions (same check as used previously for keys 0-9)
  if (!isWatchPage() && !isShortsPage()) return;
  
  const video = document.querySelector('video');
  const player = document.getElementById(SELECTORS.PLAYER_ID) || document.querySelector('.html5-video-player');
  if (!video) return;

  switch (action) {
    case 'chapter_skip':
        skipChapter('next');
        break;
    case 'chapter_skip_prev':
        skipChapter('prev');
        break;
    case 'seek_15_fwd':
        performBurstSeek(5, video);
        break;
    case 'seek_15_back':
        performBurstSeek(-5, video);
        break;
    case 'play_pause':
        playPauseLogic(video);
        break;
    case 'toggle_subs':
        toggleSubtitlesLogic(player);
        break;
    case 'toggle_comments':
        toggleCommentsLogic();
        break;
    case 'toggle_description':
        toggleDescriptionLogic();
        break;
    case 'save_to_playlist':
        saveToPlaylistLogic();
        break;
    case 'sb_skip_prev':
        if (window.sponsorblock) {
            const success = window.sponsorblock.skipToPreviousSegment();
            if (!success) showNotification('No previous segment found');
        } else {
            showNotification('SponsorBlock not loaded');
        }
        break;
    case 'sb_manual_skip':
        try {
          if (window.sponsorblock) {
            const handled = window.sponsorblock.handleBlueButton(); // Keep naming convention even if not blue button
            if (!handled) showNotification('No action available');
          } else showNotification('SponsorBlock not loaded');
        } catch (e) { showNotification('Error: ' + e.message); }
        break;
    default:
        console.warn(`[Shortcut] Unknown action: ${action}`);
  }
}

// --- Global Input Handler ---

const eventHandler = (evt) => {
  if (evt.repeat) return;
  // console.info('Key event:', evt.type, evt.charCode, evt.keyCode);

  // 1. Identify Key (Name or Color)
  let keyName = null;
  const code = evt.keyCode || evt.charCode; 
  const keyColor = getKeyColor(code);
  
  if (keyColor) {
      keyName = keyColor;
  } else if (evt.type === 'keydown' && evt.keyCode >= 48 && evt.keyCode <= 57) {
      keyName = String(evt.keyCode - 48);
  }

  if (!keyName) return true; // Not a managed key

  // 2. Get Action
  const action = shortcutCache[keyName];
  
  // Fast boolean check to exit early
  if (!action || action === 'none') return true;

  // 3. Debounce (only for non-burst)
  // Check action type for Burst Seek logic
  const isBurstAction = action === 'seek_15_fwd' || action === 'seek_15_back';
  const now = Date.now();

  // Distinct debounce per key index/name
  if (!isBurstAction && now - lastShortcutTime < shortcutDebounceTime && lastShortcutKey === keyName) {
      console.log(`[Shortcut] Debounced duplicate key ${keyName}`);
      evt.preventDefault(); 
      evt.stopPropagation(); 
      return false;
  }
  
  shortcutDebounceTime = 100;
  lastShortcutTime = now;
  lastShortcutKey = keyName;
  
  if (optionsPanelVisible && action !== 'config_menu') { evt.preventDefault(); evt.stopPropagation(); return false; }
  
  evt.preventDefault();
  evt.stopPropagation();
  handleShortcutAction(action);
  
  return false;
};

document.addEventListener('keydown', eventHandler, true);

let notificationContainer = null;

export function showNotification(text, time = 3000) {
  if (configRead('disableNotifications')) return { remove: () => {}, update: () => {} };
  
  if (!notificationContainer) {
    notificationContainer = createElement('div', { class: 'ytaf-notification-container' });
    if (configRead('enableOledCareMode')) notificationContainer.classList.add('oled-care');
    if (configRead('uiTheme') === 'classic-red') notificationContainer.classList.add('theme-classic-red');
    document.body.appendChild(notificationContainer);
  }

  // Check for existing notification with same text to prevent stacking
  const existing = Array.from(notificationContainer.querySelectorAll('.message'))
    .find(el => el.textContent === text && !el.classList.contains('message-hidden'));

  if (existing) {
      if (existing._removeTimer) clearTimeout(existing._removeTimer);
      if (time > 0) {
          existing._removeTimer = setTimeout(() => {
              existing.classList.add('message-hidden');
              setTimeout(() => existing.parentElement.remove(), 1000);
          }, time);
      }
      return { remove: () => {}, update: () => {} };
  }

  const elmInner = createElement('div', { text, class: 'message message-hidden' });
  const elm = createElement('div', {}, elmInner);
  notificationContainer.appendChild(elm);

  requestAnimationFrame(() => requestAnimationFrame(() => elmInner.classList.remove('message-hidden')));

  const remove = () => {
      if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
      elmInner._removeTimer = null;
      
      elmInner.classList.add('message-hidden');
      setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) {
    elmInner._removeTimer = setTimeout(remove, time);
  }
  
  const update = (newText, newTime = 3000) => {
      if (elmInner.textContent === newText) {
          if (newTime > 0) {
              if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
              elmInner._removeTimer = setTimeout(remove, newTime);
          }
          return;
      }
      
      elmInner.textContent = newText;
      elmInner.classList.remove('message-hidden');
      if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
      if (newTime > 0) elmInner._removeTimer = setTimeout(remove, newTime);
  };

  return { remove, update };
}

// --- Initialization & CSS Injection ---

function initGlobalStyles() {
    const style = createElement('style');
    document.head.appendChild(style);
    
    // Configurable styles updater
    const updateStyles = () => {
        const hideLogo = configRead('hideLogo');
        const hideEnd = configRead('hideEndcards');
		const fixTitles = configRead('fixMultilineTitles');
        const endDisplay = hideEnd ? 'none' : 'block';
        
        style.textContent = `
            /* Hide Logo */
            ytlr-redux-connect-ytlr-logo-entity { visibility: ${hideLogo ? 'hidden' : 'visible'}; }
            
            /* Hide Endcards */
            ytlr-endscreen-renderer, 
            .ytLrEndscreenElementRendererElementContainer, 
            .ytLrEndscreenElementRendererVideo, 
            .ytLrEndscreenElementRendererHost { display: ${endDisplay} !important; }
            
            /* UI Controls Hiding Class */
            body.ytaf-hide-controls .GLc3cc { opacity: 0 !important; }
            body.ytaf-hide-controls .webOs-watch { opacity: 0 !important; }
			
			/* Fix Multiline Titles */
            ${fixTitles ? `.app-quality-root .SK1srf .WVWtef, .app-quality-root .SK1srf .niS3yd { padding-bottom: 0.37vh !important; padding-top: 0.37vh !important; }` : ''}
        `;
    };

    updateStyles();
    configAddChangeListener('hideLogo', updateStyles);
    configAddChangeListener('hideEndcards', updateStyles);
	configAddChangeListener('fixMultilineTitles', updateStyles);
}

function updateLogoState() {
  const theme = configRead('uiTheme');
  const isOled = configRead('enableOledCareMode');
  const [logoBlue, logoRed, logoDark] = ['.logo-blue', '.logo-red', '.logo-dark'].map(c => document.querySelector(`.ytaf-logo${c}`));
  if (!logoBlue || !logoRed || !logoDark) return;

  if (isOled) { logoBlue.style.display = 'none'; logoRed.style.display = 'none'; logoDark.style.display = ''; }
  else {
    logoDark.style.display = 'none';
    if (theme === 'classic-red') { logoRed.style.display = ''; logoBlue.style.display = 'none'; }
    else { logoRed.style.display = 'none'; logoBlue.style.display = ''; }
  }
}

function applyOledMode(enabled) {
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  const oledClass = 'oled-care';

  document.getElementById('style-gray-ui-oled-care')?.remove();

  // Lazy Load Support: optionsPanel might be null
  if (optionsPanel) {
      if (enabled) optionsPanel.classList.add(oledClass);
      else optionsPanel.classList.remove(oledClass);
  }
  
  if (enabled) {
    if(notificationContainer) notificationContainer.classList.add(oledClass);
    
    const opacityVal = configRead('videoShelfOpacity');
    const opacity = opacityVal / 100;
    
    const transparentBgRules = opacityVal > 50 
      ? '.app-quality-root .UGcxnc .dxLAmd { background-color: rgba(0, 0, 0, 0) !important; } .app-quality-root .UGcxnc .Dc2Zic .JkDfAc { background-color: rgba(0, 0, 0, 0) !important; }' 
      : '';
    
    const style = createElement('style', { id: 'style-gray-ui-oled-care', html: `
        #container { background-color: black !important; } 
        .ytLrGuideResponseMask { background-color: black !important; } 
        .geClSe { background-color: black !important; } 
        .hsdF6b { background-color: black !important; } 
        .ytLrGuideResponseGradient { display: none; } 
        .ytLrAnimatedOverlayContainer { background-color: black !important; } 
        .iha0pc { color: #000 !important; } 
        .ZghAqf { background-color: #000 !important; } 
        .A0acyf.RAE3Re .AmQJbe { background-color: black !important; } 
        .tVp1L { background-color: black !important; } 
        .app-quality-root .DnwJH { background-color: black !important; } 
        .qRdzpd.stQChb .TYE3Ed { background-color: black !important; } 
        .k82tDb { background-color: #000 !important; } 
        .Jx9xPc { background-color: rgba(0, 0, 0, ${opacity}) !important; } 
        .p0DeOc { background-color: black !important; background-image: none !important; }
        ytlr-player-focus-ring { border: 0.375rem solid rgb(200, 200, 200) !important; }
        ${transparentBgRules}` 
    });
    document.head.appendChild(style);
  } else {
    if(notificationContainer) notificationContainer.classList.remove(oledClass);
  }
  updateLogoState();
}

function applyTheme(theme) {
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  // Lazy Load Support: optionsPanel might be null
  if (optionsPanel) {
      if (theme === 'classic-red') optionsPanel.classList.add('theme-classic-red');
      else optionsPanel.classList.remove('theme-classic-red');
  }
  
  if (theme === 'classic-red') { notificationContainer?.classList.add('theme-classic-red'); }
  else { notificationContainer?.classList.remove('theme-classic-red'); }
  updateLogoState();
}

const menuKeyExists = shortcutKeys.some(key => shortcutCache[key] === 'config_menu');

if (!menuKeyExists) {
    console.warn('[UI] No menu keybind found. Forcing Green button to Open Settings.');
    configWrite('shortcut_key_green', 'config_menu');
}

// --- Start-up ---
initGlobalStyles();
initVideoQuality();

// Initial apply (will skip UI elements if they don't exist yet, but handle global styles)
applyOledMode(configRead('enableOledCareMode'));
configAddChangeListener('enableOledCareMode', (evt) => applyOledMode(evt.detail.newValue));

applyTheme(configRead('uiTheme'));
configAddChangeListener('uiTheme', (evt) => applyTheme(evt.detail.newValue));

configAddChangeListener('enableAdBlock', (evt) => {
  if (evt.detail.newValue) { initAdblock(); showNotification('AdBlock Enabled'); }
  else { destroyAdblock(); showNotification('AdBlock Disabled'); }
});

configAddChangeListener('videoShelfOpacity', () => {
  if (configRead('enableOledCareMode')) {
    applyOledMode(true);
  }
});

if (!configRead('enableAdBlock')) destroyAdblock();

setTimeout(() => showNotification('Press [GREEN] to open SponsorBlock configuration screen'), 2000);