/**
 * Playback speed control.
 *
 * The stock LG Content Store YouTube app runs on Cobalt and exposes a speed
 * menu. This app is a TVHTML5 webview, where YouTube's own speed UI is not
 * offered — that decision is made server-side and there is no localStorage key
 * for it, so it cannot simply be flipped on.
 *
 * What IS available is the player itself. `#ytlr-player__player-container-player`
 * is the standard YouTube HTML5 player object, and underneath it is a plain
 * <video>. `playbackRate` is a bog-standard HTMLMediaElement property that has
 * worked since long before Chromium 38, so we drive it directly instead of
 * waiting for YouTube to expose a menu.
 *
 * Two paths, in order of preference:
 *   1. player.setPlaybackRate() — YouTube's own API. Preferred, because the
 *      player knows about its MSE buffers and audio pipeline. It may be a no-op
 *      if the feature is gated, so the result is always verified.
 *   2. video.playbackRate — set directly. Always works, but YouTube resets it
 *      on seeks, quality switches and video changes, so we watch for that and
 *      re-apply.
 *
 * If you are looking at why the *native* menu is still absent: run
 * `__ytafSpeed.diag()` in the console on a TV and send the output. It reports
 * what the player exposes and whether each path actually takes effect, which is
 * the information needed to go further.
 */
import { configRead } from './config.js';
import { showNotification } from './notifications.js';
import { SELECTORS, getVideo, isWatchPage, SYNTHETIC_KEY_FLAG } from './utils.js';

/** Matches the rates YouTube itself offers, so the OSD reads familiarly. */
export const SPEED_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_SPEED = 1;
const MIN_SPEED = 0.1;
const MAX_SPEED = 4;

/**
 * The rate the user asked for. Kept across videos within a session so binge
 * watching at 1.5x doesn't reset every time autoplay advances, and deliberately
 * NOT persisted to config — a speed left on by accident would be baffling after
 * a relaunch.
 */
let desiredSpeed = DEFAULT_SPEED;
let applying = false;
let attachedVideo = null;
let listenersBound = false;

function getPlayer() {
  const el = document.getElementById(SELECTORS.PLAYER_ID);
  return el && el.isConnected ? el : null;
}

function clamp(rate) {
  if (!isFinite(rate)) return DEFAULT_SPEED;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, rate));
}

/** Trailing .0 looks wrong on an OSD; 1.25 must keep both decimals. */
function formatSpeed(rate) {
  return `${Number(rate.toFixed(2))}x`;
}

/**
 * Apply `rate` to whatever is playing. Returns true if the video actually ended
 * up at that rate.
 */
function applySpeed(rate, { notify = false } = {}) {
  const video = getVideo();
  if (!video) return false;

  applying = true;
  try {
    // Path 1: YouTube's API, if it exists and isn't a no-op.
    const player = getPlayer();
    if (player && typeof player.setPlaybackRate === 'function') {
      try {
        player.setPlaybackRate(rate);
      } catch {
        /* gated or unimplemented — fall through */
      }
    }

    // Path 2: verify, and set it ourselves if the API didn't take.
    if (Math.abs(video.playbackRate - rate) > 0.001) {
      try {
        video.playbackRate = rate;
      } catch {
        applying = false;
        return false;
      }
    }

    // Keep audio intelligible rather than chipmunked. Chromium 38 only has the
    // prefixed form; both default to true, so this is belt and braces.
    try {
      if ('preservesPitch' in video) video.preservesPitch = true;
      else if ('webkitPreservesPitch' in video) video.webkitPreservesPitch = true;
    } catch {
      /* not fatal */
    }

    const ok = Math.abs(video.playbackRate - rate) <= 0.001;
    if (ok && notify) showNotification(`Speed: ${formatSpeed(rate)}`);
    return ok;
  } finally {
    applying = false;
  }
}

/**
 * YouTube resets playbackRate on seeks, quality switches and video changes.
 * Re-assert the user's choice when that happens, but never fight our own write.
 */
function onRateChange() {
  if (applying || desiredSpeed === DEFAULT_SPEED) return;
  const video = getVideo();
  if (!video) return;
  if (Math.abs(video.playbackRate - desiredSpeed) <= 0.001) return;
  applySpeed(desiredSpeed);
}

function bindVideo() {
  const video = getVideo();
  if (!video || video === attachedVideo) return;
  if (attachedVideo) {
    attachedVideo.removeEventListener('ratechange', onRateChange);
  }
  attachedVideo = video;
  video.addEventListener('ratechange', onRateChange);
  // A fresh <video> starts at 1x; restore the session's choice.
  if (desiredSpeed !== DEFAULT_SPEED) applySpeed(desiredSpeed);
}

/** Set an absolute rate. */
export function setSpeed(rate, { notify = true } = {}) {
  if (!isWatchPage()) return false;
  desiredSpeed = clamp(Number(rate) || DEFAULT_SPEED);
  bindVideo();
  const ok = applySpeed(desiredSpeed, { notify });
  if (!ok && notify) {
    showNotification('Speed control unavailable for this video');
  }
  return ok;
}

/** Move `direction` steps along SPEED_STEPS from wherever we are now. */
export function stepSpeed(direction) {
  if (!isWatchPage()) return false;
  const video = getVideo();
  const current = video ? video.playbackRate : desiredSpeed;

  // Nearest step, so stepping still behaves if something else set an odd rate.
  let nearest = 0;
  for (let i = 1; i < SPEED_STEPS.length; i++) {
    if (Math.abs(SPEED_STEPS[i] - current) < Math.abs(SPEED_STEPS[nearest] - current)) {
      nearest = i;
    }
  }

  const next = Math.min(SPEED_STEPS.length - 1, Math.max(0, nearest + direction));
  if (next === nearest && Math.abs(SPEED_STEPS[nearest] - current) <= 0.001) {
    showNotification(`Speed: ${formatSpeed(SPEED_STEPS[nearest])}`);
    return false;
  }
  return setSpeed(SPEED_STEPS[next]);
}

export function resetSpeed() {
  return setSpeed(DEFAULT_SPEED);
}

export function getSpeed() {
  const video = getVideo();
  return video ? video.playbackRate : desiredSpeed;
}

/**
 * Advertise the full rate list to anything that asks the player what it
 * supports. YouTube's own UI checks getAvailablePlaybackRates() before offering
 * a speed menu, so on builds where that is the only gate this can surface the
 * native menu. Where it isn't the gate, it is harmless — nothing else in this
 * app reads it.
 */
function patchAvailableRates() {
  const player = getPlayer();
  if (!player || player.__ytafRatesPatched) return false;
  try {
    const original = player.getAvailablePlaybackRates;
    player.getAvailablePlaybackRates = function () {
      try {
        const native = typeof original === 'function' ? original.call(this) : null;
        // Only widen the list; never shrink what the player already offers.
        if (Array.isArray(native) && native.length > SPEED_STEPS.length) return native;
      } catch {
        /* fall through to our list */
      }
      return SPEED_STEPS.slice();
    };
    player.__ytafRatesPatched = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Diagnostic for figuring out whether the *native* speed menu can be unlocked.
 * Run on a TV while a video is playing and send the output.
 */
function diag() {
  const player = getPlayer();
  const video = getVideo();
  const out = {
    watchPage: isWatchPage(),
    playerFound: !!player,
    videoFound: !!video,
    desiredSpeed
  };

  if (player) {
    out.playerMethods = ['setPlaybackRate', 'getPlaybackRate', 'getAvailablePlaybackRates']
      .filter((m) => typeof player[m] === 'function');
    try {
      out.availableRates = player.getAvailablePlaybackRates
        ? player.getAvailablePlaybackRates()
        : null;
    } catch (e) {
      out.availableRates = 'threw: ' + e.message;
    }
    try {
      out.playerRate = player.getPlaybackRate ? player.getPlaybackRate() : null;
    } catch (e) {
      out.playerRate = 'threw: ' + e.message;
    }
  }

  if (video) {
    out.videoRateBefore = video.playbackRate;
    // Does the player API actually take effect?
    if (player && typeof player.setPlaybackRate === 'function') {
      try {
        player.setPlaybackRate(1.5);
        out.afterPlayerApi = video.playbackRate;
        out.playerApiWorks = Math.abs(video.playbackRate - 1.5) <= 0.001;
      } catch (e) {
        out.playerApiWorks = 'threw: ' + e.message;
      }
    }
    // Does a direct write take effect?
    try {
      video.playbackRate = 1.25;
      out.afterDirectWrite = video.playbackRate;
      out.directWriteWorks = Math.abs(video.playbackRate - 1.25) <= 0.001;
    } catch (e) {
      out.directWriteWorks = 'threw: ' + e.message;
    }
    // Put it back.
    try {
      video.playbackRate = out.videoRateBefore;
    } catch {
      /* ignore */
    }
  }

  // Any experiment flags that mention rate/speed, for the native-menu question.
  try {
    const flags = window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS;
    if (flags) {
      const hits = {};
      for (const k in flags) {
        if (/rate|speed|tempo/i.test(k)) hits[k] = flags[k];
      }
      out.rateRelatedFlags = hits;
      out.totalFlags = Object.keys(flags).length;
    } else {
      out.rateRelatedFlags = 'yt.config_.EXPERIMENT_FLAGS not found';
    }
  } catch (e) {
    out.rateRelatedFlags = 'threw: ' + e.message;
  }

  console.info('[Speed] diagnostic', out);
  return out;
}


/* ------------------------------------------- YouTube's own Settings row --- */

/*
 * YouTube's playback Settings menu renders a "Speed" row that reads
 * "Not available on this device" and cannot be selected.
 *
 * Comparing it against the rows that DO work (captured from a real webOS 25
 * session) shows the renderer emits a deliberately disabled variant:
 *
 *   Quality      ... class="iM3bAd aJ2IYc ZdYMbf nJC1pd BvKat EZJGFd ..."
 *   Captions     ... class="iM3bAd pAenK aJ2IYc ZdYMbf nJC1pd BvKat EZJGFd"
 *   Audio Track  ... class="iM3bAd pAenK aJ2IYc ZdYMbf nJC1pd BvKat EZJGFd"
 *   Speed        ... class="iM3bAd pAenK aJ2IYc ZdYMbf        BvKat EZJGFd"
 *                                                     ^^^^^^ missing
 *
 * The Speed row is the only one lacking that class, it has no trailing
 * submenu chevron, and its sublabel is replaced with the localized
 * PLAYBACK_SPEED_UNAVAILABLE string. Notably the app still ships VIDEO_SPEED,
 * VIDEO_SPEED_NORMAL and PLAYBACK_RATE ("${rate}×") - the submenu is fully
 * built, just gated off. On Cobalt, variable rate is a platform capability
 * (SbPlayerSetPlaybackRate); the TVHTML5 webview does not declare it, so the
 * disabled variant is rendered. It is decided before render, so there is no
 * CSS state or storage key to flip.
 *
 * Rather than trying to convince YouTube's internals, we adopt the row: mark
 * it enabled, show the live rate in its sublabel, and handle OK/click
 * ourselves. Speed is already being applied successfully by the code above.
 *
 * The obfuscated class names above WILL change when YouTube redeploys, so
 * nothing here hardcodes them. The enabled-marker classes are derived at
 * runtime by majority vote across the sibling rows: whatever classes most rows
 * share but exactly one row lacks are, by construction, the disabled markers.
 */
const MENU_ITEM_SELECTOR = 'ytlr-button[role="menuitem"]';
const SPEED_ROW_FLAG = 'data-ytaf-speed-row';
let settingsObserver = null;
let adoptedMarkers = null;

/**
 * The localized "Not available on this device" string.
 *
 * The page ships it as PLAYBACK_SPEED_UNAVAILABLE via
 * `setMessage({...})` -> `yt.setMsg(...)` / `ytcfg.msgs`, so it can be read at
 * runtime in whatever language the user runs. Matching on it exactly is what
 * separates the Speed row from OTHER disabled rows - a video with no alternate
 * audio tracks also renders "Audio / Unavailable" with no chevron and no
 * enabled class, which is why keying on the missing chevron alone failed.
 */
let cachedUnavailableMsg;

function getUnavailableMessage() {
  if (cachedUnavailableMsg !== undefined) return cachedUnavailableMsg;
  const KEY = 'PLAYBACK_SPEED_UNAVAILABLE';
  const sources = [];
  try {
    if (window.ytcfg) {
      sources.push(window.ytcfg.msgs);
      if (typeof window.ytcfg.get === 'function') sources.push(window.ytcfg.get('msgs'));
    }
    if (window.yt) {
      sources.push(window.yt.msgs_, window.yt.msgs, window.yt.config_ && window.yt.config_.msgs);
    }
  } catch {
    /* ignore */
  }
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    if (src && typeof src[KEY] === 'string' && src[KEY]) {
      cachedUnavailableMsg = src[KEY];
      return cachedUnavailableMsg;
    }
  }
  cachedUnavailableMsg = null;
  return null;
}

/** The sublabel is the last yt-formatted-string in the row. */
function sublabelText(row) {
  const strings = row.getElementsByTagName('yt-formatted-string');
  return strings.length >= 2 ? (strings[strings.length - 1].textContent || '').trim() : '';
}

function hasChevron(row) {
  for (let c = row.firstElementChild; c; c = c.nextElementSibling) {
    if (c.tagName === 'YT-ICON') return true;
  }
  return false;
}

/**
 * Find the Speed row and work out which classes mark a row as enabled.
 *
 * Identification is by the localized PLAYBACK_SPEED_UNAVAILABLE sublabel, which
 * is exact. If the message table cannot be read, fall back to the single
 * chevron-less row - correct only when Speed is the sole disabled row, so it is
 * a fallback rather than the primary test.
 *
 * The enabled-state classes are never hardcoded: they are derived by comparing
 * the candidate against the rows that DO have a chevron, so YouTube renaming
 * its obfuscated classes cannot break this.
 */
function findDisabledRow(rows) {
  if (rows.length < 2) return null;

  const withChevron = [];
  const without = [];
  for (let i = 0; i < rows.length; i++) {
    (hasChevron(rows[i]) ? withChevron : without).push(rows[i]);
  }
  if (!without.length || !withChevron.length) return null;

  let candidate = null;
  const msg = getUnavailableMessage();
  if (msg) {
    for (let i = 0; i < without.length; i++) {
      if (sublabelText(without[i]) === msg) { candidate = without[i]; break; }
    }
    // Already adopted: our own sublabel replaced the message, so match the flag.
    if (!candidate) {
      for (let i = 0; i < without.length; i++) {
        if (without[i].hasAttribute(SPEED_ROW_FLAG)) { candidate = without[i]; break; }
      }
    }
  } else if (without.length === 1) {
    candidate = without[0];
  }
  if (!candidate) return null;

  const counts = Object.create(null);
  for (let i = 0; i < withChevron.length; i++) {
    const list = (withChevron[i].className || '').split(/\s+/).filter(Boolean);
    const seen = Object.create(null);
    for (let j = 0; j < list.length; j++) {
      if (seen[list[j]]) continue;
      seen[list[j]] = 1;
      counts[list[j]] = (counts[list[j]] || 0) + 1;
    }
  }
  const majority = Math.ceil(withChevron.length / 2);
  const have = ' ' + (candidate.className || '') + ' ';
  const markers = [];
  for (const cls in counts) {
    if (counts[cls] >= majority && have.indexOf(' ' + cls + ' ') === -1) markers.push(cls);
  }
  return { row: candidate, markers };
}

function getSublabel(row) {
  const strings = row.getElementsByTagName('yt-formatted-string');
  return strings.length >= 2 ? strings[strings.length - 1] : null;
}

function expectedSublabel() {
  const rate = getSpeed();
  return Math.abs(rate - DEFAULT_SPEED) <= 0.001 ? 'Normal' : formatSpeed(rate);
}

/** Re-apply everything YouTube may have stomped, without re-detecting. */
function reassertSpeedRow(row) {
  if (adoptedMarkers) {
    for (let i = 0; i < adoptedMarkers.length; i++) row.classList.add(adoptedMarkers[i]);
  }
  row.removeAttribute('aria-hidden');
  paintSpeedRow(row);
}

function paintSpeedRow(row) {
  const sublabel = getSublabel(row);
  if (!sublabel) return;
  const text = expectedSublabel();
  if (sublabel.textContent !== text) sublabel.textContent = text;
  const label = row.getAttribute('aria-label') || 'Speed';
  row.setAttribute('aria-label', label.split('.')[0] + '. ' + text);
}

function adoptSpeedRow() {
  if (!configRead('enablePlaybackSpeed') || !isWatchPage()) return false;

  const rows = document.querySelectorAll(MENU_ITEM_SELECTOR);
  if (!rows.length) return false;

  const found = findDisabledRow(Array.prototype.slice.call(rows));
  if (!found) return false;

  const { row, markers } = found;
  if (markers.length) adoptedMarkers = markers;
  row.setAttribute(SPEED_ROW_FLAG, '1');
  reassertSpeedRow(row);
  return true;
}

/** Is `node` our adopted row, or inside it? */
function inSpeedRow(node) {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    if (n.hasAttribute && n.hasAttribute(SPEED_ROW_FLAG)) return n;
  }
  return null;
}

function onSettingsKey(evt) {
  if (evt[SYNTHETIC_KEY_FLAG] || !configRead('enablePlaybackSpeed')) return;
  const isEnter = evt.key === 'Enter' || evt.keyCode === 13;
  const isRight = evt.key === 'ArrowRight' || evt.keyCode === 39;
  const isLeft = evt.key === 'ArrowLeft' || evt.keyCode === 37;
  if (!isEnter && !isRight && !isLeft) return;

  const row = inSpeedRow(document.activeElement);
  if (!row) return;

  evt.preventDefault();
  if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
  else evt.stopPropagation();

  stepSpeed(isLeft ? -1 : 1);
  reassertSpeedRow(row);
  // YouTube re-renders the menu right after a selection; re-assert next frame.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const live = document.querySelector('[' + SPEED_ROW_FLAG + ']');
      if (live && live.isConnected) reassertSpeedRow(live);
    });
  }
}

/**
 * Watch the settings menu for re-renders. Scoped to the menu container rather
 * than body: YouTube rebuilds these rows with incremental-dom, which would wipe
 * the adoption, but a body-wide subtree observer is exactly the cost this
 * release spent effort removing.
 */
function watchSettingsMenu() {
  const host = document.querySelector('.AmQJbe') || document.querySelector('ytlr-app');
  if (!host || settingsObserver) return;
  settingsObserver = new MutationObserver(() => {
    // incremental-dom REUSES these nodes: it rewrites textContent and className
    // in place, so the row element survives with our flag attached while the
    // sublabel has been stomped back to "Not available on this device" and the
    // enabled class stripped. Checking only for the flag's absence missed that
    // entirely - which is why the message reappeared while arrowing around.
    const row = document.querySelector('[' + SPEED_ROW_FLAG + ']');
    if (!row || !row.isConnected) {
      adoptSpeedRow();
      return;
    }
    if (sublabelText(row) !== expectedSublabel()) reassertSpeedRow(row);
  });
  settingsObserver.observe(host, { childList: true, subtree: true });
}

function stopWatchingSettingsMenu() {
  if (!settingsObserver) return;
  settingsObserver.disconnect();
  settingsObserver = null;
}

export function initPlaybackSpeed() {
  if (listenersBound) return;
  listenersBound = true;

  const onPageUpdate = () => {
    if (!isWatchPage()) {
      // Leaving the player: drop the reference, keep the chosen speed.
      if (attachedVideo) {
        attachedVideo.removeEventListener('ratechange', onRateChange);
        attachedVideo = null;
      }
      stopWatchingSettingsMenu();
      return;
    }
    bindVideo();
    if (configRead('enablePlaybackSpeed')) {
      patchAvailableRates();
      watchSettingsMenu();
      adoptSpeedRow();
    }
  };

  window.addEventListener('ytaf-page-update', onPageUpdate);
  document.addEventListener('keydown', onSettingsKey, true);
  onPageUpdate();

  if (typeof window !== 'undefined') {
    window.__ytafSpeed = {
      diag, setSpeed, stepSpeed, resetSpeed, getSpeed, SPEED_STEPS,
      adoptSpeedRow, findDisabledRow
    };
  }
}
