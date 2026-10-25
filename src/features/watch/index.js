// The clock in the top right corner (Display Time in UI).
//
// On the watch page it comes and goes with YouTube's own player UI. YouTube
// switches between the video alone and the video with its controls by setting
// hybridnavfocusable="true" on the player shell (ytlr-watch-default) while the
// video holds the focus; the clock watches that attribute with a
// MutationObserver, so it changes in the same task YouTube does, and fades
// with the timing YouTube's controls fade with (read from their computed
// transition once per player). Focus, player-state and page events cover the
// rest: a side panel opening over the player, the focus resting on the player
// itself or nowhere, and a player that mounts after the page changes.
//
// The clock stays a child of <body>: YouTube re-renders its own elements and
// drops nodes it did not create, and a fixed element inside a transformed
// ancestor would lose its place in the corner.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { debounce } from '../../core/dom.js';
import { createDisposables } from '../../core/disposables.js';
import { PLAYER_STATE } from '../../core/player-state.js';
import { isWatchPage } from '../../core/page-state.js';
import { createLogger } from '../../core/log.js';
import './watch.css';
import { SELECTORS } from '../../core/selectors.js';

const log = createLogger('Clock');

const PLAYER_SELECTOR = SELECTORS.WATCH_PLAYER;
const FOCUS_ATTRIBUTE = 'hybridnavfocusable';
const HIDDEN_CLASS = 'ytaf-watch-hidden';
// 200 ms rather than 50 ms: a focus check can run a document-wide
// querySelector (the overlay panel when the cheap tests do not decide), and at
// 50 ms the remote's key-repeat interval let one through per press. At 200 ms
// a burst of presses coalesces into a single check once the user stops. The
// attribute YouTube flips is watched directly and is not delayed.
const DEBOUNCE_DELAY = 200;
// Tries at reading YouTube's fade before the clock settles for its own
// (watch.css): the controls may not be rendered the first time the attribute
// changes.
const FADE_READ_TRIES = 3;

/**
 * Hours and minutes in the TV's language. Intl is in Chrome 24+, so webOS 3
 * has it; a language tag Intl refuses (a POSIX suffix such as "en-US@posix")
 * would throw and leave no clock at all, so it falls back to the default locale.
 */
function createTimeFormatter() {
  const options = { hour: 'numeric', minute: 'numeric' };
  try {
    return new Intl.DateTimeFormat(navigator.language, options);
  } catch {
    log.debug('Language tag refused by Intl:', navigator.language);
    return new Intl.DateTimeFormat(undefined, options);
  }
}

/** The comma-separated items of a computed transition longhand; parentheses keep their commas. */
function listItems(value) {
  return (value || '').match(/(?:[^,(]|\([^)]*\))+/g) || [];
}

/**
 * YouTube's own fade for its player UI: the first opacity (or all) transition
 * on the controls, the player shadow, or an ancestor of either up to the
 * player shell. '' when none of them has one (or they are not rendered yet).
 */
function readPlayerFade(player) {
  const starts = [
    player.querySelector(SELECTORS.CONTROLS),
    player.querySelector(SELECTORS.PLAYER_SHADOWS)
  ];
  for (let s = 0; s < starts.length; s++) {
    for (let el = starts[s]; el && el !== player.parentNode; el = el.parentNode) {
      const cs = window.getComputedStyle(el);
      const props = listItems(cs.transitionProperty);
      const durations = listItems(cs.transitionDuration);
      const timings = listItems(cs.transitionTimingFunction);
      for (let i = 0; i < props.length; i++) {
        const prop = props[i].trim();
        if (prop !== 'opacity' && prop !== 'all') continue;
        const duration = (durations[i % durations.length] || '').trim();
        if (!(parseFloat(duration) > 0)) continue;
        const timing = (timings[i % timings.length] || 'ease').trim();
        return duration + ' ' + timing;
      }
    }
  }
  return '';
}

class Watch {
  /**
   * The clock: builds the element, starts the minute ticks and the listeners, and adds it to the
   * page.
   */
  constructor() {
    this.el = null;
    this.cachedPlayer = null;
    this.cachedOverlay = null;
    // The player whose attribute is observed, and the observer.
    this.observedPlayer = null;
    this.playerObserver = null;
    // YouTube's fade, as read for observedPlayer; null until read.
    this.fade = null;
    this.fadeTries = 0;
    // Everything destroy() has to undo.
    this.bag = createDisposables();

    this.updateVisibility = this.updateVisibility.bind(this);
    this.debouncedUpdate = debounce(this.updateVisibility, DEBOUNCE_DELAY);
    this.bag.add(() => this.debouncedUpdate.cancel());
    this.bag.add(() => this.observePlayer(null));

    this.createClock();
    this.startClock();
    this.setupGlobalListeners();
    // Placed before it is drawn: the first state does not fade in.
    document.body.appendChild(this.el);
  }

  /** The clock element; its look comes from watch.css and the theme classes on <html>. */
  createClock() {
    this.el = document.createElement('div');
    // Its look follows the theme classes on <html> (watch.css).
    this.el.className = 'ytaf-watch';
    this.el.setAttribute('aria-hidden', 'true');
  }

  /**
   * Shows the time now and at the start of every minute, and again when the app returns to the
   * foreground.
   */
  startClock() {
    const formatter = createTimeFormatter();

    // Its timer and listener go with the bag, before the element: no tick
    // runs after destroy().
    const setTime = () => {
      this.el.textContent = formatter.format(new Date());
      // The visibility is checked again with every tick.
      this.updateVisibility();
    };

    // Every tick is aimed at the next minute: a tick that ran late (timers
    // held back while the app was in the background) does not shift the ones
    // after it, as a fixed interval would.
    let timer = null;

    /** Shows the time, then aims the next tick at the next whole minute. */
    const tick = () => {
      setTime();
      timer = setTimeout(tick, 60000 - (Date.now() % 60000));
    };
    this.bag.add(() => clearTimeout(timer));
    tick();
    // Back in the foreground the time may be stale until the next tick.
    this.bag.listen(document, 'visibilitychange', () => {
      if (!document.hidden) setTime();
    });
  }

  /** Watches `player`'s focus attribute (null: none), reading the fade again for a new one. */
  observePlayer(player) {
    if (player === this.observedPlayer) return;
    if (this.playerObserver) this.playerObserver.disconnect();
    this.observedPlayer = player;
    this.fade = null;
    this.fadeTries = 0;
    // Back to watch.css's fade until this player's is read.
    if (this.el) this.el.style.transition = '';
    if (!player) return;
    if (!this.playerObserver) {
      this.playerObserver = new MutationObserver(() => this.onPlayerToggle());
    }
    this.playerObserver.observe(player, { attributes: true, attributeFilter: [FOCUS_ATTRIBUTE] });
  }

  /** YouTube showed or hid its player UI: follow it now, with its fade. */
  onPlayerToggle() {
    const player = this.observedPlayer;
    if (!this.el || !player || !player.isConnected) return;
    if (this.fade === null && this.fadeTries < FADE_READ_TRIES) {
      this.fadeTries++;
      const fade = readPlayerFade(player);
      if (fade || this.fadeTries === FADE_READ_TRIES) {
        this.fade = fade;
        // '' keeps watch.css's own fade.
        this.el.style.transition = fade ? 'opacity ' + fade : '';
        log.debug('Fade:', fade || 'none found on the player, using the default');
      }
    }
    const videoOnly = player.getAttribute(FOCUS_ATTRIBUTE) === 'true';
    // The attribute decides the controls part; a side panel keeps it hidden.
    this.setHidden(videoOnly || this.isOverlayOpen());
  }

  /** Whether a side panel (description, comments, save) is open over the player. */
  isOverlayOpen() {
    if (!this.cachedOverlay || !this.cachedOverlay.isConnected) {
      this.cachedOverlay = document.querySelector(SELECTORS.OVERLAY_PANEL);
    }
    return !!this.cachedOverlay;
  }

  /** Hides or shows the clock (a class, so the fade applies). */
  setHidden(hidden) {
    if (this.el.classList.contains(HIDDEN_CLASS) !== hidden) {
      this.el.classList.toggle(HIDDEN_CLASS, hidden);
    }
  }

  /**
   * Decides the visibility from scratch: shown off the watch page; on it, hidden while the video
   * alone is showing, the player or nothing holds the focus, or a side panel is open.
   */
  updateVisibility() {
    // The player exists on the watch page only; a browse page is where most
    // of the focus traffic is, and it never needs the query.
    if (!this.cachedPlayer || !this.cachedPlayer.isConnected) {
      this.cachedPlayer = isWatchPage() ? document.querySelector(PLAYER_SELECTOR) : null;
    }
    this.observePlayer(this.cachedPlayer);

    if (!this.cachedPlayer) {
      this.setHidden(false);
      return;
    }

    const isHybridFocused = this.cachedPlayer.getAttribute(FOCUS_ATTRIBUTE) === 'true';
    const isPlayerElementActive =
      document.activeElement === this.cachedPlayer || document.activeElement === document.body;
    // The overlay panel is queried only when the cheap conditions did not decide.
    this.setHidden(isHybridFocused || isPlayerElementActive || this.isOverlayOpen());
  }

  /**
   * Re-decides the visibility (debounced) on play, pause and a new video, on every focus change,
   * and on a page change (with the cached elements dropped).
   */
  setupGlobalListeners() {
    this.bag.listen(window, 'yt-player-state-change', (e) => {
      const state = e.detail.state;
      if (
        state === PLAYER_STATE.PLAYING ||
        state === PLAYER_STATE.PAUSED ||
        state === PLAYER_STATE.UNSTARTED
      ) {
        this.debouncedUpdate();
      }
    });

    // focusin only: a focusout is followed by a focusin in every practical
    // case on this platform, and the callback is debounced, so the focusout
    // invocation was always coalesced away. Halves the clock's share of the
    // per-keypress focus traffic.
    this.bag.listen(document, 'focusin', this.debouncedUpdate, true);

    // A page change replaces the player and the overlay: the cached elements
    // are stale, and the visibility is decided again.
    this.bag.listen(window, 'ytaf-page-update', () => {
      this.cachedPlayer = null;
      this.cachedOverlay = null;
      this.debouncedUpdate();
    });
  }

  /** Removes the clock, its timer and its listeners. */
  destroy() {
    this.bag.dispose();
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}

let watchInstance = null;

/** Creates or destroys the clock to match Display Time in UI. */
function toggleWatch(show) {
  if (show) {
    if (!watchInstance) {
      watchInstance = new Watch();
    }
  } else if (watchInstance) {
    watchInstance.destroy();
    watchInstance = null;
  }
}

toggleWatch(configRead('showWatch'));

configAddChangeListener('showWatch', (evt) => {
  toggleWatch(evt.detail.newValue);
});
