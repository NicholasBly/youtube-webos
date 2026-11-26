// Force High Resolution Video: on the watch page it attaches to the TV player,
// forces the highest quality (quality.js) and publishes the player's state
// changes for the other features (player-state.js). This file follows the
// page and the setting.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { createDisposables } from '../../core/disposables.js';
import { pollUntil } from '../../core/dom.js';
import { SELECTORS } from '../../core/selectors.js';
import { isWatchPage } from '../../core/page-state.js';
import { vq, qualitySetForVideo, qualityStats } from './state.js';
import { setLocalStorageQuality, clearLocalStorageQuality } from './quality.js';
import { handleStateChange } from './player-state.js';
import { log } from './log.js';

// The counts of the player API path (state.js), read on the TV from the web inspector.
window.__ytafQualityStats = qualityStats;

/**
 * Leaves the player: timers, listeners and the per-video state go (the webOS 25 kick stays done for
 * the session).
 */
function destroyVideoQuality() {
  log.debug('Destroying');

  if (vq.navTimer) {
    clearTimeout(vq.navTimer);
    vq.navTimer = null;
  }
  if (vq.bag) {
    vq.bag.dispose();
    vq.bag = null;
  }

  vq.player = null;
  vq.lastVideoId = null;

  qualitySetForVideo.clear();
  vq.videoBeingProcessed = null;
  vq.kickstartInProgress = false;
  vq.kickstartRun++;
  // hasKickstarted stays set: the webOS 25 kick is for the first playback of
  // the session only (kickstart.js).
}

/** Attaches to the TV player once it is there; true when attached (pollUntil's answer). */
function attachToPlayer() {
  const p = document.getElementById(SELECTORS.PLAYER_ID);
  if (!p || !p.setPlaybackQualityRange) {
    return false;
  }

  try {
    vq.player = p;
    p.addEventListener('onStateChange', handleStateChange);
    // The player is YouTube's object, not a DOM node: it may lack the
    // remover, and a throw there must not stop the rest of the teardown.
    vq.bag.add(() => {
      try {
        p.removeEventListener?.('onStateChange', handleStateChange);
      } catch {
        /* ignore */
      }
    });
    log.debug('Attached to player');

    handleStateChange(vq.player.getPlayerState?.());

    return true;
  } catch (e) {
    log.warn('Error attaching:', e);
    vq.player = null;
    return false;
  }
}

/**
 * Looks for the player every 200 ms for the first ten seconds, then once a
 * second for another fifty: a slow first load must still be forced, and a
 * watch page whose player never mounts is not polled for the rest of the
 * session. The poll is cancelled with the bag, so a detached module is never
 * looked for.
 */
function pollForPlayer() {
  vq.poll = pollUntil(attachToPlayer, 200, {
    maxAttempts: 50,
    onGiveUp: () => {
      vq.poll = pollUntil(attachToPlayer, 1000, {
        maxAttempts: 50,
        onGiveUp: () => {
          vq.poll = null;
          log.warn('No player after a minute on the watch page: stopped looking');
        }
      });
    }
  });
}

/**
 * Attaches to the player on the watch page (polling until it exists) and sets the stored quality
 * preference.
 */
function initVideoQuality() {
  if (vq.bag) return;

  log.debug('Initializing');

  vq.bag = createDisposables();
  // The poll is whichever phase is running when the bag is disposed.
  vq.bag.add(() => {
    if (vq.poll) vq.poll.cancel();
    vq.poll = null;
  });

  vq.shouldForce = configRead('forceHighResVideo');

  setLocalStorageQuality();

  if (!attachToPlayer()) pollForPlayer();
}

// The setting is read at init; a change takes effect at once.
configAddChangeListener('forceHighResVideo', (evt) => {
  // Recorded even before the player is attached: the attach reads it.
  vq.shouldForce = !!evt.detail.newValue;
  // Off: the preference this module wrote goes, attached or not.
  if (!vq.shouldForce) {
    clearLocalStorageQuality();
    return;
  }
  // On: the preference is stored at once, for the player the app creates
  // next, and an attached player's current video is forced again.
  setLocalStorageQuality();
  qualitySetForVideo.clear();
});

/**
 * Attaches on entering the watch page (a tick later, once the page is built) and detaches on
 * leaving it.
 */
function handleNavigation() {
  if (isWatchPage()) {
    // Attached already, or the attach is on its way.
    if (vq.bag || vq.navTimer) return;
    log.debug('Navigation: Entering watch page');
    // Deferred a tick: the page-update event comes from page-state's observer
    // of the body classes, while the page is still being built, and the player
    // lookup polls anyway.
    vq.navTimer = setTimeout(() => {
      vq.navTimer = null;
      initVideoQuality();
    }, 0);
  } else if (vq.bag || vq.navTimer) {
    // Left again, possibly before the deferred attach ran: destroy() drops it.
    log.debug('Navigation: Leaving watch page');
    destroyVideoQuality();
  }
}

/** Follows page changes, and checks the current page once the document is ready. */
function setupListeners() {
  window.addEventListener('ytaf-page-update', handleNavigation);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleNavigation);
  } else {
    handleNavigation();
  }
}

setupListeners();
