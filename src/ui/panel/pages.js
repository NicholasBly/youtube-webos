// The five pages of the options panel. Each builder returns its page element;
// the panel appends it and decides when it is built (Main up front, the rest
// one per frame once the panel is on screen).
import {
  configRead,
  configAddChangeListener,
  dearrowTitleFormats,
  dearrowThumbnailFallbacks,
  clockModes
} from '../../core/config.js';
import { titleFormattingSupported } from '../../features/dearrow/index.js';
import { playbackSpeedSupported } from '../../features/playback-speed/index.js';
import { isGuestMode } from '../../core/guest-mode.js';
import { getWebOSVersion } from '../../core/webos.js';
import { createElement } from '../dom.js';
import { SHORTCUT_KEYS } from '../../core/config-options.js';
import {
  createConfigCheckbox,
  setUnavailable,
  createSection,
  createChoiceControl,
  createLogoControl,
  createVideoCodecControl,
  createThumbnailQualityControl,
  createSegmentControl,
  createShortcutControl,
  createPreviewControl,
  createOpacityControl,
  createThemeControl
} from './controls/index.js';
import './pages.css';

/** A line of small help text under a row. */
const helpLine = (text) => createElement('div', { text, class: 'ytaf-help' });

/** The centred small print at the foot of a page: what the feature is and where it comes from. */
const footNote = (text) => createElement('div', {}, createElement('small', { text }));

// --- Page 1: Main ---
/**
 * The Main page: Cosmetic Filtering (Ad Blocking and the filters that depend on it, greyed out
 * while it is off), then the other features.
 */
export function buildMainPage() {
  const pageMain = createElement('div', { class: 'ytaf-settings-page', id: 'ytaf-page-main' });

  const elAdBlock = createConfigCheckbox('enableAdBlock');
  const elTrackingBlock = createConfigCheckbox('enableTrackingBlock');
  const cosmeticGroup = [elAdBlock, elTrackingBlock];
  const elRemoveGlobalShorts = createConfigCheckbox('removeGlobalShorts');
  const elRemoveLiveVideos = createConfigCheckbox('removeLiveVideos');
  const elRemoveTopLiveGames = createConfigCheckbox('removeTopLiveGames');
  const elRemoveMostRelevant = createConfigCheckbox('removeMostRelevant');
  cosmeticGroup.push(
    elRemoveGlobalShorts,
    elRemoveLiveVideos,
    elRemoveTopLiveGames,
    elRemoveMostRelevant
  );
  if (isGuestMode()) cosmeticGroup.push(createConfigCheckbox('hideGuestSignInPrompts'));

  pageMain.appendChild(createSection('Cosmetic Filtering', cosmeticGroup, 'ytaf-section-2col'));

  // Tracking Block and the cosmetic filters ride on the same hooks as Ad
  // Blocking and do nothing while it is off.
  // Every row of the group after Ad Blocking itself.
  const adBlockDependents = cosmeticGroup.slice(1);

  /** Greys out the rows that depend on Ad Blocking while it is off. */
  const updateDependencyState = () => {
    const enabled = configRead('enableAdBlock');
    adBlockDependents.forEach((el) => {
      setUnavailable(el, !enabled);
    });
  };

  configAddChangeListener('enableAdBlock', updateDependencyState);
  updateDependencyState();

  pageMain.appendChild(
    createSection('Video Player', [
      createConfigCheckbox('forceHighResVideo'),
      createVideoCodecControl(),
      createConfigCheckbox('hideEndcards'),
      createConfigCheckbox('enableReturnYouTubeDislike')
    ])
  );
  pageMain.appendChild(
    createSection('Interface', [
      createConfigCheckbox('enableAutoLogin'),
      createConfigCheckbox('upgradeThumbnails'),
      createThumbnailQualityControl(),
      createLogoControl(),
      createChoiceControl('showWatch', clockModes),
      createConfigCheckbox('enableOledCareMode'),
      createConfigCheckbox('disableNotifications')
    ])
  );
  return pageMain;
}

// --- Page 2: SponsorBlock ---
/** The SponsorBlock page: the switch, one row per category, and the SponsorBlock options. */
export function buildSponsorPage() {
  const pageSponsor = createElement('div', {
    class: 'ytaf-settings-page',
    id: 'ytaf-page-sponsor',
    style: { display: 'none' }
  });
  pageSponsor.appendChild(createConfigCheckbox('enableSponsorBlock'));

  const elBlock = createElement(
    'blockquote',
    {},
    ...[
      'sbMode_sponsor',
      'sbMode_intro',
      'sbMode_outro',
      'sbMode_interaction',
      'sbMode_selfpromo',
      'sbMode_musicofftopic',
      'sbMode_filler',
      'sbMode_hook',
      'sbMode_preview',
      'sbMode_highlight'
    ].map((key) => createSegmentControl(key)),
    createConfigCheckbox('enableMutedSegments'),
    createConfigCheckbox('skipSegmentsOnce'),
    createConfigCheckbox('sbFullVideoLabel'),
    createConfigCheckbox('sbShowTimeWithSkips')
  );
  pageSponsor.appendChild(elBlock);
  pageSponsor.appendChild(footNote('Sponsor segments skipping - https://sponsor.ajay.app'));
  return pageSponsor;
}

// --- Page 3: DeArrow ---
/**
 * The DeArrow page: the switch and the logo, then the title and thumbnail options, greyed out while
 * it is off (and the thumbnail fallback while crowdsourced thumbnails are). Title formatting is in
 * the webOS 22+ build only (features/dearrow/titles.js): the legacy one gets no formatting rows.
 */
export function buildDeArrowPage() {
  const pageDeArrow = createElement('div', {
    class: 'ytaf-settings-page',
    id: 'ytaf-page-dearrow',
    style: { display: 'none' }
  });
  pageDeArrow.appendChild(createConfigCheckbox('enableDeArrow'));
  // The logo beside "4K" on every video DeArrow changed (features/dearrow/tiles.js).
  const elBadge = createConfigCheckbox('dearrowShowBadge');
  pageDeArrow.appendChild(elBadge);

  // Formatting applies to every title shown, crowdsourced or YouTube's own.
  const titleRows = [createConfigCheckbox('dearrowCrowdTitles')];
  if (titleFormattingSupported) {
    titleRows.push(
      createChoiceControl('dearrowTitleFormatting', dearrowTitleFormats),
      createConfigCheckbox('dearrowCleanEmojis')
    );
  }
  const elFallback = createChoiceControl('dearrowThumbnailFallback', dearrowThumbnailFallbacks);
  const elFallbackHelp = helpLine(
    "Random frame: a frame DeArrow picks from the video. Start, middle and end frames: YouTube's own."
  );
  const thumbRows = [createConfigCheckbox('dearrowCrowdThumbnails'), elFallback, elFallbackHelp];
  pageDeArrow.appendChild(createSection('Titles', titleRows));
  pageDeArrow.appendChild(createSection('Thumbnails', thumbRows));
  pageDeArrow.appendChild(
    footNote('Crowdsourced titles and thumbnails, in place of clickbait - https://dearrow.ajay.app')
  );

  /** Greys out the rows while DeArrow is off, and the fallback while crowdsourced thumbnails are. */
  const sync = () => {
    const on = !!configRead('enableDeArrow');
    const thumbsOn = !!configRead('dearrowCrowdThumbnails');
    [elBadge].concat(titleRows, thumbRows).forEach((row) => {
      const fallbackRow = row === elFallback || row === elFallbackHelp;
      setUnavailable(row, !on || (fallbackRow && !thumbsOn));
    });
  };
  configAddChangeListener('enableDeArrow', sync);
  configAddChangeListener('dearrowCrowdThumbnails', sync);
  sync();
  return pageDeArrow;
}

// --- Page 4: Shortcuts ---
/** The Shortcuts page: one row per configurable key. */
export function buildShortcutsPage() {
  const pageShortcuts = createElement('div', {
    class: 'ytaf-settings-page',
    id: 'ytaf-page-shortcuts',
    style: { display: 'none' }
  });
  SHORTCUT_KEYS.forEach((key) => {
    pageShortcuts.appendChild(createShortcutControl(key));
  });
  return pageShortcuts;
}

// --- Page 5: UI Tweaks ---
/**
 * The UI Tweaks page: shelf opacity, previews, titles, rows ahead, Liquid Glass, the theme, the
 * emoji fix on webOS 3/4, and playback speed where the TV can (webOS 23 and newer).
 */
export function buildUITweaksPage() {
  const pageUITweaks = createElement('div', {
    class: 'ytaf-settings-page',
    id: 'ytaf-page-ui-tweaks',
    style: { display: 'none' }
  });

  const playerUITweaks = [
    createOpacityControl('videoShelfOpacity'),
    helpLine('Adjusts opacity of black background underneath videos (Requires OLED-care mode)'),
    createPreviewControl('forcePreviews'),
    helpLine('Forces the video thumbnail preview on/off on app load'),
    createConfigCheckbox('fixMultilineTitles'),
    createConfigCheckbox('fixSearchFont'),
    // Here rather than on the Main page, which is as tall as 1080p allows.
    createConfigCheckbox('enableRowsAhead'),
    helpLine(
      'Loads the next rows of the home screen and search early, so fast scrolling never reaches empty rows'
    ),
    createConfigCheckbox('removeBlackBorders'),
    createThemeControl()
  ];

  if (getWebOSVersion() <= 4) {
    playerUITweaks.push(createConfigCheckbox('enableLegacyEmojiFix'));
  }

  pageUITweaks.appendChild(createSection('Player UI Tweaks', playerUITweaks));

  // Playback speed needs WebCodecs (webOS 23 and newer); elsewhere no row.
  if (playbackSpeedSupported) {
    pageUITweaks.appendChild(
      createSection('Experimental', [
        createConfigCheckbox('enablePlaybackSpeed'),
        helpLine(
          'Pick a speed in the player Settings > Speed menu, or map Playback Speed +/- on the Shortcuts page. Restart the app after turning it on.'
        )
      ])
    );
  }

  return pageUITweaks;
}
