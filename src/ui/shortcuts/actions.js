// What each shortcut does. A `global` action runs anywhere, with nothing
// passed; the others run on a watch or Shorts page with a <video>, which
// `run` receives. `burst` marks the seeks, which batch rapid presses instead
// of being debounced.
import { showNotification } from '../toast/index.js';
import { SELECTORS } from '../../core/selectors.js';
import { isWatchPage, isShortsPage } from '../../core/page-state.js';
import { showOptionsPanel, isOptionsPanelVisible } from '../panel/panel.js';
import { skipChapter, performBurstSeek } from './seek.js';
import { playPause, toggleSubtitles } from './playback.js';
import { toggleComments, toggleDescription, saveToPlaylist } from './panels.js';
import { refreshPage } from './page.js';
import { toggleOledOverlay, isOledOverlayActive } from './oled.js';
import { getSponsorBlock } from '../../features/sponsorblock/bootstrap.js';
import { stepSpeed, resetSpeed } from '../../features/playback-speed/index.js';

/** Runs `fn` with the live SponsorBlock handler, or says there is none. */
function withSponsorBlock(fn) {
  const sb = getSponsorBlock();
  if (sb) fn(sb);
  else showNotification('SponsorBlock not loaded');
}

export const ACTIONS = {
  config_menu: {
    global: true,
    /**
     * Opens or closes the options panel, ending the OLED overlay first (it would cover the panel).
     */
    run: () => {
      // The OLED overlay sits above the panel, so opening the panel ends it.
      if (!isOptionsPanelVisible() && isOledOverlayActive()) toggleOledOverlay();
      showOptionsPanel(!isOptionsPanelVisible());
    }
  },
  oled_toggle: { global: true, run: toggleOledOverlay },
  refresh_page: {
    // Global rather than browse-only, so the press on a player page is answered.
    global: true,
    /** Soft-reloads the page, except on a player page, where it only says it cannot. */
    run: () => {
      if (isWatchPage() || isShortsPage()) showNotification('Cannot refresh on player pages');
      else refreshPage();
    }
  },
  chapter_skip: { run: () => skipChapter('next') },
  chapter_skip_prev: { run: () => skipChapter('prev') },
  seek_15_fwd: { burst: true, run: (video) => performBurstSeek(5, video) },
  seek_15_back: { burst: true, run: (video) => performBurstSeek(-5, video) },
  play_pause: { run: (video) => playPause(video) },
  toggle_subs: {
    // The player lookup is here rather than in the router: only this action
    // needs it, and the fallback is a full-document class-selector walk.
    run: () =>
      toggleSubtitles(
        document.getElementById(SELECTORS.PLAYER_ID) ||
          document.querySelector(SELECTORS.HTML5_PLAYER_FALLBACK)
      )
  },
  toggle_comments: { run: toggleComments },
  toggle_description: { run: toggleDescription },
  save_to_playlist: { run: saveToPlaylist },
  sb_skip_prev: {
    /** Jumps back to the start of the last SponsorBlock segment passed. */
    run: () =>
      withSponsorBlock((sb) => {
        if (!sb.skipToPreviousSegment()) showNotification('No previous segment found');
      })
  },
  sb_manual_skip: {
    /** Skips the segment SponsorBlock is offering, or jumps to the highlight. */
    run: () =>
      withSponsorBlock((sb) => {
        if (!sb.manualSkipOrHighlight()) showNotification('No action available');
      })
  },
  // Playback speed (features/playback-speed; the legacy build says it cannot).
  speed_up: { run: () => stepSpeed(1) },
  speed_down: { run: () => stepSpeed(-1) },
  speed_reset: { run: resetSpeed }
};
