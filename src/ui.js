/*global navigate*/
import './spatial-navigation-polyfill.js';
import { configAddChangeListener, configRead, configWrite, configGetDesc, segmentTypes, configGetDefault, shortcutActions, sbModes, sbModesHighlight } from './config.js';
import './ui.css';
import './auto-login.js';
import './return-dislike.js';
// import { initYouTubeFixes } from './yt-fixes.js';
import { initVideoQuality } from './video-quality.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { sendKey, REMOTE_KEYS, isGuestMode } from './utils.js';
import { initAdblock, destroyAdblock } from './adblock.js';

let lastSafeFocus = null;
let oledKeepAliveTimer = null;

let lastShortcutTime = 0;
let lastShortcutKey = -1;
let shortcutDebounceTime = 400;

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

const isWatchPage = () => document.body.classList.contains('WEB_PAGE_TYPE_WATCH');
const isShortsPage = () => document.body.classList.contains('WEB_PAGE_TYPE_SHORTS');
const simulateBack = () => { console.log('[Shortcut] Simulating Back/Escape...'); sendKey(REMOTE_KEYS.BACK); };

window.__spatialNavigation__.keyMode = 'NONE';
const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
const colorCodeMap = new Map([[403, 'red'], [166, 'red'], [404, 'green'], [172, 'green'], [405, 'yellow'], [170, 'yellow'], [406, 'blue'], [167, 'blue'], [191, 'blue']]);
const getKeyColor = (charCode) => colorCodeMap.get(charCode) || null;

// --- DOM Utility Functions ---

// Helper: Create DOM element with properties
const createElement = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([key, val]) => {
    if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (key === 'class') el.className = val;
    else if (key === 'events' && typeof val === 'object') Object.entries(val).forEach(([evt, fn]) => el.addEventListener(evt, fn));
    else if (key === 'text') el.textContent = val;
    else if (key === 'html') el.innerHTML = val;
    else el[key] = val;
  });
  children.forEach(child => el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child));
  return el;
};

// --- UI Construction Functions ---

function createConfigCheckbox(key) {
  const elmInput = createElement('input', { type: 'checkbox', checked: configRead(key), events: { change: (evt) => configWrite(key, evt.target.checked) }});
  elmInput.addEventListener('focus', () => elmLabel.classList.add('focused'));
  elmInput.addEventListener('blur', () => elmLabel.classList.remove('focused'));
  configAddChangeListener(key, (evt) => elmInput.checked = evt.detail.newValue);
  
  const labelContent = createElement('div', { class: 'label-content', style: { fontSize: '2.1vh' } }, elmInput, `\u00A0${configGetDesc(key)}`);
  const elmLabel = createElement('label', {}, labelContent);
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
        if (e.keyCode === 37) { cycle('prev'); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === 39 || e.keyCode === 13) { cycle('next'); e.stopPropagation(); e.preventDefault(); }
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

function createShortcutControl(keyIndex) {
  const configKey = `shortcut_key_${keyIndex}`;
  const actions = Object.keys(shortcutActions);
  
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
        if (e.keyCode === 37) { cycle('prev'); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === 39 || e.keyCode === 13) { cycle('next'); e.stopPropagation(); e.preventDefault(); }
      },
      click: () => cycle('next')
    }
  }, 
    createElement('span', { text: `Key ${keyIndex}`, class: 'shortcut-label', style: { fontSize: '2.1vh' } }),
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
        if (e.keyCode === 37) { // Left
          changeValue(-step); 
          e.stopPropagation(); 
          e.preventDefault(); 
        }
        else if (e.keyCode === 39 || e.keyCode === 13) { // Right or Enter
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
    if (getKeyColor(evt.charCode) === 'green') return; // Let global handler handle close

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
    } else if (evt.keyCode === 13) {
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
  // Removed enableSponsorBlockAutoSkip checkbox
  
  const elmBlock = createElement('blockquote', {},
    ...['Sponsor', 'Intro', 'Outro', 'Interaction', 'SelfPromo', 'MusicOfftopic', 'Filler', 'Hook', 'Preview'].map(s => createSegmentControl(`sbMode_${s.toLowerCase()}`)),
    createSegmentControl('sbMode_highlight'),
    createConfigCheckbox('enableMutedSegments'),
	createConfigCheckbox('skipSegmentsOnce')
  );
  pageSponsor.appendChild(elmBlock);
  pageSponsor.appendChild(createElement('div', { html: '<small>Sponsor segments skipping - https://sponsor.ajay.app<br>Use blue button on remote to skip to highlight or skip segments manually</small>' }));
  pageSponsor.appendChild(createElement('div', { class: 'ytaf-nav-hint right', tabIndex: 0, html: 'Shortcuts <span class="arrow">&rarr;</span>', events: { click: () => setActivePage(2) }}));
  elmContainer.appendChild(pageSponsor);

  // --- Page 3: Shortcuts ---
  pageShortcuts = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-shortcuts', style: { display: 'none' }});
  pageShortcuts.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> SponsorBlock Settings', events: { click: () => setActivePage(1) }}));
  for (let i = 0; i <= 9; i++) pageShortcuts.appendChild(createShortcutControl(i));
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

const optionsPanel = createOptionsPanel();
document.body.appendChild(optionsPanel);
let optionsPanelVisible = false;

function showOptionsPanel(visible) {
  if (visible === undefined || visible === null) visible = true;
  
  if (visible && !optionsPanelVisible) {
    console.info('Showing and focusing options panel!');
    optionsPanel.style.display = 'block';
    if (optionsPanel.activePage === 1 && (isWatchPage())) sponsorBlockUI.togglePopup(true);
    else sponsorBlockUI.togglePopup(false);
    
    // Find best initial focus
    const firstVisibleInput = Array.from(optionsPanel.querySelectorAll('input, .shortcut-control-row')).find(el => el.offsetParent !== null && !el.disabled);
    if (firstVisibleInput) { firstVisibleInput.focus(); lastSafeFocus = firstVisibleInput; }
    else { optionsPanel.focus(); lastSafeFocus = optionsPanel; }
    optionsPanelVisible = true;
  } else if (!visible && optionsPanelVisible) {
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
  if (!optionsPanelVisible) return;
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
    return Array.from(bar.children).filter(el => { const key = el.getAttribute('idomkey'); return key && key.startsWith('chapter-'); });
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

  let totalWidth = 0;
  const chapterData = chapterEls.map(el => { const width = parseFloat(el.style.width || '0'); const data = { width, startIndex: totalWidth }; totalWidth += width; return data; });
  if (totalWidth === 0) return;

  const timestamps = chapterData.map(c => (c.startIndex / totalWidth) * video.duration);
  const currentTime = video.currentTime;
  let targetTime;

  if (direction === 'next') {
    targetTime = timestamps.find(t => t > currentTime + 1);
  } else {
    // Find the chapter we are currently in
    let currentIdx = -1;
    for (let i = 0; i < timestamps.length; i++) { if (currentTime >= timestamps[i]) currentIdx = i; else break; }
    
    if (currentIdx !== -1) {
      const chapterStart = timestamps[currentIdx];
      // If we are deep into the chapter (>3s), restart chapter. Else go to previous.
      if (currentTime - chapterStart > 3) targetTime = chapterStart;
      else if (currentIdx > 0) targetTime = timestamps[currentIdx - 1];
      else targetTime = 0;
    } else targetTime = 0;
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

function handleShortcutAction(action) {
  const video = document.querySelector('video');
  const player = document.getElementById('ytlr-player__player-container-player') || document.querySelector('.html5-video-player');
  if (!video) return;

  const actions = {
    chapter_skip: () => skipChapter('next'),
    chapter_skip_prev: () => skipChapter('prev'),
    seek_15_fwd: () => { video.currentTime = Math.min(video.duration, video.currentTime + 15); showNotification('Skipped +15s'); },
    seek_15_back: () => { video.currentTime = Math.max(0, video.currentTime - 15); showNotification('Skipped -15s'); },
    play_pause: () => {
      if (video.paused) { 
        video.play(); 
        showNotification('Playing');
      } else {
		const controls = document.querySelector('yt-focus-container[idomkey="controls"]');
        const isControlsVisible = controls && controls.classList.contains('MFDzfe--focused');
		const watchOverlay = document.querySelector('.webOs-watch');
		let needsHide = false;
		if(!isControlsVisible) {
		needsHide = true;
        document.body.classList.add('ytaf-hide-controls');
        if (watchOverlay) watchOverlay.style.opacity = '0';
		}
        
        video.pause();	

        // Dismiss controls
		if(needsHide) {
        shortcutDebounceTime = 650; 

        sendKey(REMOTE_KEYS.UP);                            
        setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
        setTimeout(() => sendKey(REMOTE_KEYS.UP), 500);

        setTimeout(() => {
          document.body.classList.remove('ytaf-hide-controls');
          if (watchOverlay) watchOverlay.style.opacity = '';
        }, 750);
		}
        showNotification('Paused');
      }
    },
    toggle_subs: () => {
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
    },
    toggle_comments: () => {
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
    },
    toggle_description: () => {
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
    },
    save_to_playlist: () => {
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
      if (triggerInternal(target, 'Save/Watch Later')) {
      } else {
        showNotification('Save Button Unavailable');
      }
	  }
    }
  };

  if (actions[action]) actions[action]();
}

// --- Global Input Handler ---

const eventHandler = (evt) => {
  if (evt.repeat) return;
  // console.info('Key event:', evt.type, evt.charCode, evt.keyCode);

  const keyColor = getKeyColor(evt.charCode);
  
  // 1. Handle Menu Toggle (Green)
  if (keyColor === 'green') {
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.type === 'keydown') showOptionsPanel(!optionsPanelVisible);
    return false;
  } 
  // 2. Handle Manual Skip / Highlight Jump (Blue)
  else if (keyColor === 'blue' && evt.type === 'keydown') {
    if (!isWatchPage() && !isShortsPage()) return true;
    
    evt.preventDefault();
    evt.stopPropagation();
    try {
      if (window.sponsorblock) {
        const handled = window.sponsorblock.handleBlueButton();
        if (!handled) showNotification('No action available');
      } else showNotification('SponsorBlock not loaded');
    } catch (e) { showNotification('Error: ' + e.message); }
    return false;
  } 
  // 3. Handle OLED Mode (Red)
  else if (keyColor === 'red' && evt.type === 'keydown') {
    evt.preventDefault();
    evt.stopPropagation();
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
    return false;
  } 
  // 4. Handle Number Shortcuts (0-9)
  else if (evt.type === 'keydown' && evt.keyCode >= 48 && evt.keyCode <= 57) {
    const now = Date.now();
	const keyIndex = evt.keyCode - 48;
    if (now - lastShortcutTime < shortcutDebounceTime && lastShortcutKey === keyIndex) {
        console.log(`[Shortcut] Debounced duplicate key ${keyIndex}`);
        evt.preventDefault(); 
        evt.stopPropagation(); 
        return false;
    }
    shortcutDebounceTime = 400;
    lastShortcutTime = now;
    lastShortcutKey = keyIndex;
    
    if (optionsPanelVisible) { evt.preventDefault(); evt.stopPropagation(); return false; }
    if (!isWatchPage() && !isShortsPage()) return true;
    
    const action = configRead(`shortcut_key_${keyIndex}`);
    
    evt.preventDefault();
    evt.stopPropagation();
    if (action && action !== 'none') handleShortcutAction(action);
  }
  return true;
};

document.addEventListener('keydown', eventHandler, true);

let notificationContainer = null;

export function showNotification(text, time = 3000) {
  if (configRead('disableNotifications')) return { remove: () => {} };
  
  if (!notificationContainer) {
    notificationContainer = createElement('div', { class: 'ytaf-notification-container' });
    if (configRead('enableOledCareMode')) notificationContainer.classList.add('oled-care');
    if (configRead('uiTheme') === 'classic-red') notificationContainer.classList.add('theme-classic-red');
    document.body.appendChild(notificationContainer);
  }

  const elmInner = createElement('div', { text, class: 'message message-hidden' });
  const elm = createElement('div', {}, elmInner);
  notificationContainer.appendChild(elm);

  requestAnimationFrame(() => requestAnimationFrame(() => elmInner.classList.remove('message-hidden')));

  const remove = () => {
      elmInner.classList.add('message-hidden');
      setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) {
    setTimeout(remove, time);
  }

  return { remove };
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
  const optionsPanel = document.querySelector('.ytaf-ui-container');
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  const oledClass = 'oled-care';

  document.getElementById('style-gray-ui-oled-care')?.remove();

  if (enabled) {
    optionsPanel?.classList.add(oledClass);
    if(notificationContainer) notificationContainer.classList.add(oledClass);
    
    const opacityVal = configRead('videoShelfOpacity');
    const opacity = opacityVal / 100;
    
    const transparentBgRules = opacityVal > 50 
      ? '.app-quality-root .UGcxnc .dxLAmd { background-color: rgba(0, 0, 0, 0) !important; } .app-quality-root .UGcxnc .Dc2Zic .JkDfAc { background-color: rgba(0, 0, 0, 0) !important; }' 
      : '';
    
    const style = createElement('style', { id: 'style-gray-ui-oled-care', html: `#container { background-color: black !important; } .ytLrGuideResponseMask { background-color: black !important; } .geClSe { background-color: black !important; } .hsdF6b { background-color: black !important; } .ytLrGuideResponseGradient { display: none; } .ytLrAnimatedOverlayContainer { background-color: black !important; } .iha0pc { color: #000 !important; } .ZghAqf { background-color: #000 !important; } .A0acyf.RAE3Re .AmQJbe { background-color: black !important; } .tVp1L { background-color: black !important; } .app-quality-root .DnwJH { background-color: black !important; } .qRdzpd.stQChb .TYE3Ed { background-color: black !important; } .k82tDb { background-color: #000 !important; } .Jx9xPc { background-color: rgba(0, 0, 0, ${opacity}) !important; } ${transparentBgRules}` });
    document.head.appendChild(style);
  } else {
    optionsPanel?.classList.remove(oledClass);
    if(notificationContainer) notificationContainer.classList.remove(oledClass);
  }
  updateLogoState();
}

function applyTheme(theme) {
  const optionsPanel = document.querySelector('.ytaf-ui-container');
  const notificationContainer = document.querySelector('.ytaf-notification-container');
  if (theme === 'classic-red') { optionsPanel?.classList.add('theme-classic-red'); notificationContainer?.classList.add('theme-classic-red'); }
  else { optionsPanel?.classList.remove('theme-classic-red'); notificationContainer?.classList.remove('theme-classic-red'); }
  updateLogoState();
}

// --- Start-up ---
initGlobalStyles();
initVideoQuality();

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