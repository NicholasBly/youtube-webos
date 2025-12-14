/*global navigate*/
import './spatial-navigation-polyfill.js';
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
import { WebOSVersion } from './webos-utils.js';
import { initVideoQuality } from './video-quality.js';
import sponsorBlockUI from './Sponsorblock-UI.js';
import { sendKey, REMOTE_KEYS, isGuestMode } from './utils.js';

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
  let pageShortcuts = null;

  const setActivePage = (pageIndex) => {
    activePage = pageIndex;
    elmContainer.activePage = pageIndex;

    pageMain.style.display = 'none';
    pageSponsor.style.display = 'none';
    pageShortcuts.style.display = 'none';

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
  const webOSVersion = WebOSVersion(); 
  if (webOSVersion === 25) {
		  elmHeading.textContent = `YouTube Extended — webOS ${webOSVersion}`;
	  } else {
		  elmHeading.textContent = 'YouTube Extended';
	  }
  elmContainer.appendChild(elmHeading);

  // --- Page 1: Main ---
  pageMain = document.createElement('div');
  pageMain.classList.add('ytaf-settings-page');
  pageMain.id = 'ytaf-page-main';

  pageMain.appendChild(createConfigCheckbox('enableAdBlock'));
  pageMain.appendChild(createConfigCheckbox('forceHighResVideo'));
  pageMain.appendChild(createConfigCheckbox('upgradeThumbnails'));
  pageMain.appendChild(createConfigCheckbox('hideLogo'));
  pageMain.appendChild(createConfigCheckbox('enableOledCareMode'));
  if (!isGuestMode()) {
  pageMain.appendChild(createConfigCheckbox('removeShorts'));
  }
  pageMain.appendChild(createConfigCheckbox('enableAutoLogin'));
  pageMain.appendChild(createConfigCheckbox('hideEndcards'));
  pageMain.appendChild(createConfigCheckbox('enableReturnYouTubeDislike'));
  if (isGuestMode()) {
    pageMain.appendChild(createConfigCheckbox('hideGuestSignInPrompts'));
  }
  pageMain.appendChild(createConfigCheckbox('disableNotifications'));
  
  const navHintNextMain = document.createElement('div');
  navHintNextMain.className = 'ytaf-nav-hint right';
  navHintNextMain.tabIndex = 0;
  navHintNextMain.innerHTML = 'SponsorBlock Settings <span class="arrow">&rarr;</span>';
  navHintNextMain.addEventListener('click', () => setActivePage(1));
  pageMain.appendChild(navHintNextMain);

  elmContainer.appendChild(pageMain);

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
    
    // Try accessing the internal Polymer/Lit instance
    const instance = element.__instance;
    
    if (instance && typeof instance.onSelect === 'function') {
        console.log(`[Shortcut] Calling internal onSelect() for ${name}`);
        try {
            const mockEvent = {
                type: 'click',
                stopPropagation: () => {},
                preventDefault: () => {},
                target: element,
                currentTarget: element
            };

            instance.onSelect(mockEvent); 
            return true;
        } catch (e) {
            console.error(`[Shortcut] Internal call failed for ${name}:`, e);
        }
    }
    
    element.click();
    return true;
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
                const capsBtn = document.querySelector('ytlr-captions-button ytlr-button') || 
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
            const commBtn = document.querySelector('[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_COMMENTS"] ytlr-button') ||
                            document.querySelector('ytlr-redux-connect-ytlr-like-button-renderer + ytlr-button-renderer ytlr-button');
            
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
                showNotification('Closed Comments');
            } else {
                // IF CLOSED: Open via internal trigger
                if (triggerInternal(commBtn, 'Comments')) {
                    showNotification('Opened Comments');
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
  } else if (evt.type === 'keydown' && evt.keyCode >= 48 && evt.keyCode <= 57) {
      // Check for user-defined shortcuts (Keys 0-9)
      const keyIndex = evt.keyCode - 48;
      const action = configRead(`shortcut_key_${keyIndex}`);
	  
	  evt.preventDefault();
      evt.stopPropagation();
      
      if (action && action !== 'none') {
          handleShortcutAction(action);
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
  if (configRead('disableNotifications')) return;
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