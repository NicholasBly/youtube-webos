// webOS 25 first-video fix: after the quality switch the player can sit in
// UNSTARTED, so the first playback is kicked until it reports PLAYING, and the
// controls bar that the kick raises is dismissed again.
import { sendKey, REMOTE_KEYS } from '../../core/remote.js';
import { IS_WEBOS_25, KICKSTART_MAX_ATTEMPTS, KICKSTART_INTERVAL_MS, vq } from './state.js';
import { SELECTORS } from '../../core/selectors.js';
import { hideControlsFor } from '../../ui/hide-controls.js';
import { log } from './log.js';
import { PLAYER_STATE } from '../../core/player-state.js';

/**
 * The kick raises the controls bar: when it holds the focus it is hidden
 * (ui/hide-controls.js) and dismissed with three UP presses. All of it is the
 * attach's (`bag`), so leaving the watch page cancels what has not run.
 */
function dismissRaisedControls(bag) {
  const controls = document.querySelector(SELECTORS.CONTROLS);
  if (!controls || !controls.classList.contains(SELECTORS.CONTROLS_FOCUSED_CLASS_WEBOS25)) return;
  log.debug('Controls are focused. Hiding and dismissing...');

  bag.add(hideControlsFor(750));

  sendKey(REMOTE_KEYS.UP);
  bag.timeout(() => sendKey(REMOTE_KEYS.UP), 250);
  bag.timeout(() => sendKey(REMOTE_KEYS.UP), 500);
}

/**
 * webOS 25 only, once per session: calls playVideo() until the player reports PLAYING (up to
 * KICKSTART_MAX_ATTEMPTS), then hides the controls that raised with it.
 */
export async function ensurePlaybackStarts() {
  if (!IS_WEBOS_25 || vq.hasKickstarted || !vq.player || vq.kickstartInProgress) {
    return;
  }

  vq.kickstartInProgress = true;
  const run = vq.kickstartRun;
  log.debug('Starting playback enforcer...');

  for (let i = 0; i < KICKSTART_MAX_ATTEMPTS; i++) {
    // A destroy in between started a new run: this loop is the old one.
    if (vq.kickstartRun !== run) return;
    if (!vq.player || vq.hasKickstarted) {
      vq.kickstartInProgress = false;
      return;
    }

    try {
      const currentState = vq.player.getPlayerState?.();

      if (currentState === PLAYER_STATE.PLAYING) {
        vq.hasKickstarted = true;
        vq.kickstartInProgress = false;
        log.debug('Playback verified, kickstart complete.');

        // On the next frame, in the attach's bag (dismissRaisedControls).
        const bag = vq.bag;
        if (!bag) return;
        const frame = requestAnimationFrame(() => dismissRaisedControls(bag));
        bag.add(() => cancelAnimationFrame(frame));

        return;
      }

      log.debug('Kick attempt', i + 1, 'of', KICKSTART_MAX_ATTEMPTS, '(state', currentState + ')');
      vq.player.playVideo?.();
    } catch (e) {
      log.warn('Kick attempt failed:', e);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, KICKSTART_INTERVAL_MS));
  }

  vq.kickstartInProgress = false;
  if (!vq.hasKickstarted) {
    log.warn('Playback enforcer timed out without confirming PLAYING state.');
  }
}
