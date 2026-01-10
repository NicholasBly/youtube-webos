/*global navigate*/
import './spatial-navigation-polyfill.js';
import { configAddChangeListener, configRead, configWrite, configGetDesc, segmentTypes, configGetDefault, shortcutActions } from './config.js';
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

const isWatchPage = () => document.body.classList.contains('WEB_PAGE_TYPE_WATCH');

window.__spatialNavigation__.keyMode = 'NONE';
const ARROW_KEY_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
const colorCodeMap = new Map([[403, 'red'], [166, 'red'], [404, 'green'], [172, 'green'], [405, 'yellow'], [170, 'yellow'], [406, 'blue'], [167, 'blue'], [191, 'blue']]);
const getKeyColor = (charCode) => colorCodeMap.get(charCode) || null;

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

function createConfigCheckbox(key) {
  const elmInput = createElement('input', { type: 'checkbox', checked: configRead(key), events: { change: (evt) => configWrite(key, evt.target.checked) }});
  configAddChangeListener(key, (evt) => elmInput.checked = evt.detail.newValue);
  
  const labelContent = createElement('div', { class: 'label-content' }, elmInput, `\u00A0${configGetDesc(key)}`);
  const elmLabel = createElement('label', {}, labelContent);

  const segmentKey = key.replace('enableSponsorBlock', '').toLowerCase();
  const hasColorPicker = segmentTypes[segmentKey] || (segmentKey === 'highlight' && segmentTypes['poi_highlight']);
  
  if (hasColorPicker) {
    const colorKey = segmentKey === 'highlight' ? 'poi_highlightColor' : `${segmentKey}Color`;
    const resetButton = createElement('button', { text: 'Reset', class: 'reset-color-btn', events: { 
      click: (evt) => { evt.preventDefault(); evt.stopPropagation(); configWrite(colorKey, configGetDefault(colorKey)); }}});
    const colorInput = createElement('input', { type: 'color', value: configRead(colorKey), events: { input: (evt) => configWrite(colorKey, evt.target.value) }});
    configAddChangeListener(colorKey, (evt) => { colorInput.value = evt.detail.newValue; window.sponsorblock?.buildOverlay(); });
    elmLabel.appendChild(createElement('div', { class: 'color-picker-controls' }, resetButton, colorInput));
  }
  return elmLabel;
}

function createSection(title, elements) {
  const legend = createElement('div', { text: title, style: { color: '#aaa', fontSize: '22px', marginBottom: '5px', fontWeight: 'bold', textTransform: 'uppercase' }});
  const fieldset = createElement('div', { class: 'ytaf-settings-section', style: { marginTop: '15px', marginBottom: '5px', padding: '2px', border: '2px solid #444', borderRadius: '5px' }}, legend, ...elements);
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
    tabIndex: 0,
    events: {
      keydown: (e) => {
        if (e.keyCode === 37) { cycle('prev'); e.stopPropagation(); e.preventDefault(); }
        else if (e.keyCode === 39 || e.keyCode === 13) { cycle('next'); e.stopPropagation(); e.preventDefault(); }
      },
      click: () => cycle('next')
    }
  }, 
    createElement('span', { text: `Key ${keyIndex}`, class: 'shortcut-label' }),
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
  let pageMain, pageSponsor, pageShortcuts;

  const setActivePage = (pageIndex) => {
    activePage = elmContainer.activePage = pageIndex;
    [pageMain, pageSponsor, pageShortcuts].forEach(p => p.style.display = 'none');
    
    const pages = [
      { page: pageMain, selector: 'input', popup: false },
      { page: pageSponsor, selector: 'input', popup: isWatchPage() },
      { page: pageShortcuts, selector: '.shortcut-control-row', popup: false }
    ];
    
    if (pages[pageIndex]) {
      pages[pageIndex].page.style.display = 'block';
      pages[pageIndex].page.querySelector(pages[pageIndex].selector)?.focus();
      sponsorBlockUI.togglePopup(pages[pageIndex].popup);
    }
  };

  elmContainer.addEventListener('keydown', (evt) => {
    if (getKeyColor(evt.charCode) === 'green') return;
    if (evt.keyCode in ARROW_KEY_CODE) {
      const dir = ARROW_KEY_CODE[evt.keyCode];
      if (dir === 'left' || dir === 'right') {
        const preFocus = document.activeElement;
        if (preFocus.classList.contains('shortcut-control-row')) return;
        if (activePage === 1) {
          const sponsorMainToggle = pageSponsor.querySelector('input');
          if (dir === 'right' && preFocus === sponsorMainToggle) { evt.preventDefault(); evt.stopPropagation(); return; }
          if (dir === 'left' && preFocus.matches('blockquote input[type="checkbox"]')) { setActivePage(0); evt.preventDefault(); evt.stopPropagation(); return; }
        }
        navigate(dir);
        if (preFocus === document.activeElement) {
          if (dir === 'right' && activePage < 2) setActivePage(activePage + 1);
          else if (dir === 'left' && activePage > 0) setActivePage(activePage - 1);
          evt.preventDefault(); evt.stopPropagation(); return;
        }
        evt.preventDefault(); evt.stopPropagation(); return;
      }
      navigate(ARROW_KEY_CODE[evt.keyCode]);
    } else if (evt.keyCode === 13) {
      if (evt instanceof KeyboardEvent) document.activeElement.click();
    } else if (evt.keyCode === 27) showOptionsPanel(false);
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

  // Page 1: Main
  pageMain = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-main' });
  
  const elAdBlock = createConfigCheckbox('enableAdBlock');
  const cosmeticGroup = [elAdBlock];
  let elRemoveGlobalShorts = null, elRemoveTopLiveGames = null, elGuestPrompts = null;
  
  elRemoveGlobalShorts = createConfigCheckbox('removeGlobalShorts');
  elRemoveTopLiveGames = createConfigCheckbox('removeTopLiveGames');
  cosmeticGroup.push(elRemoveGlobalShorts, elRemoveTopLiveGames);
  if (isGuestMode()) { elGuestPrompts = createConfigCheckbox('hideGuestSignInPrompts'); cosmeticGroup.push(elGuestPrompts); }

  pageMain.appendChild(createSection('Cosmetic Filtering', cosmeticGroup));

  // Dependency management
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

  // Page 2: SponsorBlock
  pageSponsor = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-sponsor', style: { display: 'none' }});
  pageSponsor.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> Main Settings', events: { click: () => setActivePage(0) }}));
  pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));
  
  const elmBlock = createElement('blockquote', {},
    ...['Sponsor', 'Intro', 'Outro', 'Interaction', 'SelfPromo', 'MusicOfftopic', 'Filler', 'Hook', 'Highlight', 'Preview'].map(s => createConfigCheckbox(`enableSponsorBlock${s}`)),
    createConfigCheckbox('enableHighlightJump'),
    createConfigCheckbox('enableMutedSegments')
  );
  pageSponsor.appendChild(elmBlock);
  pageSponsor.appendChild(createElement('div', { html: '<small>Sponsor segments skipping - https://sponsor.ajay.app</small>' }));
  pageSponsor.appendChild(createElement('div', { class: 'ytaf-nav-hint right', tabIndex: 0, html: 'Shortcuts <span class="arrow">&rarr;</span>', events: { click: () => setActivePage(2) }}));
  elmContainer.appendChild(pageSponsor);

  // Page 3: Shortcuts
  pageShortcuts = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-shortcuts', style: { display: 'none' }});
  pageShortcuts.appendChild(createElement('div', { class: 'ytaf-nav-hint left', tabIndex: 0, html: '<span class="arrow">&larr;</span> SponsorBlock Settings', events: { click: () => setActivePage(1) }}));
  for (let i = 0; i <= 9; i++) pageShortcuts.appendChild(createShortcutControl(i));
  elmContainer.appendChild(pageShortcuts);

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
    if (optionsPanel.activePage === 1 && isWatchPage()) sponsorBlockUI.togglePopup(true);
    else sponsorBlockUI.togglePopup(false);
    
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

async function skipChapter(direction = 'next') {
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
    let currentIdx = -1;
    for (let i = 0; i < timestamps.length; i++) { if (currentTime >= timestamps[i]) currentIdx = i; else break; }
    if (currentIdx !== -1) {
      const chapterStart = timestamps[currentIdx];
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

const simulateBack = () => { console.log('[Shortcut] Simulating Back/Escape...'); sendKey(REMOTE_KEYS.BACK); };

function triggerInternal(element, name) {
  if (!element) return false;
  let success = false;
  try { element.click(); console.log(`[Shortcut] Standard click triggered for ${name}`); success = true; } 
  catch (e) { console.warn(`[Shortcut] Standard click failed for ${name}:`, e); }
  
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
      if (video.paused) { video.play(); showNotification('Playing'); }
      else { video.pause(); showNotification('Paused'); }
    },
    toggle_subs: () => {
      let toggledViaApi = false;
      if (player) {
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
      if (!toggledViaApi) {
        const capsBtn = document.querySelector('ytlr-captions-button yt-button-container') || document.querySelector('ytlr-captions-button ytlr-button') || document.querySelector('ytlr-toggle-button-renderer ytlr-button');
        if (capsBtn) {
          if (triggerInternal(capsBtn, 'Captions')) {
            setTimeout(() => {
              const isPressed = capsBtn.getAttribute('aria-pressed') === 'true';
              showNotification(isPressed ? 'Subtitles: ON' : 'Subtitles: OFF');
            }, 250);
            return;
          }
        }
        showNotification('No subtitles found');
      }
    },
    toggle_comments: () => {
      let commBtn = document.querySelector('yt-button-container[aria-label="Comments"]');
      if (!commBtn) {
        const commIcon = document.querySelector('yt-icon.qHxFAf.ieYpu.wFZPnb');
        commBtn = commIcon ? commIcon.closest('ytlr-button') : null;
      }
      if (!commBtn) commBtn = document.querySelector('ytlr-button-renderer[idomkey="item-1"] ytlr-button') || document.querySelector('[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_COMMENTS"] ytlr-button') || document.querySelector('ytlr-redux-connect-ytlr-like-button-renderer + ytlr-button-renderer ytlr-button');
      
      if(commBtn) console.log(`[UI] Comments toggle button found:`, commBtn);
      
      const isCommentsActive = commBtn && (commBtn.getAttribute('aria-pressed') === 'true' || commBtn.getAttribute('aria-selected') === 'true');
      const panel = document.querySelector('ytlr-engagement-panel-section-list-renderer') || document.querySelector('ytlr-engagement-panel-title-header-renderer');
      const isPanelVisible = panel && window.getComputedStyle(panel).display !== 'none';
      
      if (isCommentsActive || isPanelVisible) simulateBack();
      else {
        if (triggerInternal(commBtn, 'Comments')) {}
        else {
          const titleBtn = document.querySelector('.ytlr-video-title') || document.querySelector('h1');
          if (titleBtn) { titleBtn.click(); showNotification('Opened Desc (Title)'); }
          else showNotification('Comments Unavailable');
        }
      }
    }
  };

  if (actions[action]) actions[action]();
}

const eventHandler = (evt) => {
  if (evt.repeat) return;
  console.info('Key event:', evt.type, evt.charCode, evt.keyCode, evt.defaultPrevented);

  const keyColor = getKeyColor(evt.charCode);
  
  if (keyColor === 'green') {
    console.info('Taking over!');
    evt.preventDefault();
    evt.stopPropagation();
    if (evt.type === 'keydown') showOptionsPanel(!optionsPanelVisible);
    return false;
  } else if (keyColor === 'blue' && evt.type === 'keydown') {
    if (!isWatchPage()) return true;
    console.info('Blue button pressed - attempting highlight jump');
    if (!configRead('enableHighlightJump')) return true;
    evt.preventDefault();
    evt.stopPropagation();
    try {
      if (window.sponsorblock) {
        const jumped = window.sponsorblock.jumpToNextHighlight();
        if (!jumped) showNotification('No highlights found in this video');
      } else showNotification('SponsorBlock not loaded');
    } catch (e) { console.warn('Error jumping to highlight:', e); showNotification('Error: Unable to jump to highlight'); }
    return false;
  } else if (keyColor === 'red' && evt.type === 'keydown') {
    console.info('OLED mode activated');
    evt.preventDefault();
    evt.stopPropagation();
    let overlay = document.getElementById('oled-black-overlay');
    if (overlay) {
      overlay.remove();
      console.info('OLED mode deactivated');
      if (oledKeepAliveTimer) { clearInterval(oledKeepAliveTimer); oledKeepAliveTimer = null; }
    } else {
      if (optionsPanelVisible) showOptionsPanel(false);
      overlay = createElement('div', { id: 'oled-black-overlay', style: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: '#000', zIndex: 9999 }});
      document.body.appendChild(overlay);
      oledKeepAliveTimer = setInterval(() => {
        console.info('OLED Keep-alive: Sending UP x2');
        sendKey(REMOTE_KEYS.UP);
        setTimeout(() => sendKey(REMOTE_KEYS.UP), 250);
      }, 30 * 60 * 1000);
    }
    return false;
  } else if (evt.type === 'keydown' && evt.keyCode >= 48 && evt.keyCode <= 57) {
    const keyIndex = evt.keyCode - 48;
    if (optionsPanelVisible) { evt.preventDefault(); evt.stopPropagation(); return false; }
    if (!isWatchPage()) return true;
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
  if (configRead('disableNotifications')) return;
  
  if (!notificationContainer) {
    console.info('Adding notification container');
    notificationContainer = createElement('div', { class: 'ytaf-notification-container' });
    if (configRead('enableOledCareMode')) notificationContainer.classList.add('oled-care');
    if (configRead('uiTheme') === 'classic-red') notificationContainer.classList.add('theme-classic-red');
    document.body.appendChild(notificationContainer);
  }

  const elmInner = createElement('div', { text, class: 'message message-hidden' });
  const elm = createElement('div', {}, elmInner);
  notificationContainer.appendChild(elm);

  requestAnimationFrame(() => requestAnimationFrame(() => elmInner.classList.remove('message-hidden')));

  setTimeout(() => {
    elmInner.classList.add('message-hidden');
    setTimeout(() => elm.remove(), 1000);
  }, time);
}

function initHideLogo() {
  const style = createElement('style');
  document.head.appendChild(style);
  const setHidden = (hide) => style.textContent = `ytlr-redux-connect-ytlr-logo-entity { visibility: ${hide ? 'hidden' : 'visible'}; }`;
  setHidden(configRead('hideLogo'));
  configAddChangeListener('hideLogo', (evt) => setHidden(evt.detail.newValue));
}

function initHideEndcards() {
  const style = createElement('style');
  document.head.appendChild(style);
  const setHidden = (hide) => {
    const display = hide ? 'none' : 'block';
    style.textContent = `ytlr-endscreen-renderer { display: ${display} !important; } .ytLrEndscreenElementRendererElementContainer { display: ${display} !important; } .ytLrEndscreenElementRendererVideo { display: ${display} !important; } .ytLrEndscreenElementRendererHost { display: ${display} !important; }`;
  };
  setHidden(configRead('hideEndcards'));
  configAddChangeListener('hideEndcards', (evt) => setHidden(evt.detail.newValue));
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
  const oledClass = 'oled-care';
  if (enabled) {
    optionsPanel?.classList.add(oledClass);
    notificationContainer?.classList.add(oledClass);
    const style = createElement('style', { id: 'style-gray-ui-oled-care', html: '#container { background-color: black !important; } .ytLrGuideResponseMask { background-color: black !important; } .geClSe { background-color: black !important; } .hsdF6b { background-color: black !important; } .ytLrGuideResponseGradient { display: none; } .ytLrAnimatedOverlayContainer { background-color: black !important; }' });
    document.head.appendChild(style);
  } else {
    optionsPanel?.classList.remove(oledClass);
    notificationContainer?.classList.remove(oledClass);
    document.getElementById('style-gray-ui-oled-care')?.remove();
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

initHideLogo();
initHideEndcards();
//initYouTubeFixes();
initVideoQuality();

applyOledMode(configRead('enableOledCareMode'));
configAddChangeListener('enableOledCareMode', (evt) => applyOledMode(evt.detail.newValue));

applyTheme(configRead('uiTheme'));
configAddChangeListener('uiTheme', (evt) => applyTheme(evt.detail.newValue));

configAddChangeListener('enableAdBlock', (evt) => {
  if (evt.detail.newValue) { initAdblock(); showNotification('AdBlock Enabled'); }
  else { destroyAdblock(); showNotification('AdBlock Disabled'); }
});

if (!configRead('enableAdBlock')) destroyAdblock();

setTimeout(() => showNotification('Press [GREEN] to open SponsorBlock configuration screen'), 2000);