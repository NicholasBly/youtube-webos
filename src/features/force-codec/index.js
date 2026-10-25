// Force Video Codec: the setting's switch, the codec hooks and the filter of
// the formats a player response offers. The comment below the imports explains
// the feature.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { showNotification } from '../../ui/toast/index.js';
import { PINNED_MODES, fc } from './state.js';
import { narrowing, platformSupports } from './codecs.js';
import { installHooks } from './hooks.js';
import { log } from './log.js';

/**
 * Force Video Codec.
 *
 * Lets the user pin video playback to a single codec instead of accepting
 * whatever the player and the server negotiate between them.
 *
 * WHY ANYONE WANTS THIS
 *   The negotiated codec is not always the one the set handles best. Some 2021
 *   panels advertise AV1 through MSE and then stall on it 30-60s in (issue
 *   #143); some sets decode VP9 in hardware and AV1 in software, so AV1 costs
 *   frames; some users simply want to compare. None of that is visible from
 *   inside the app, so this is a switch rather than a heuristic.
 *
 * HOW IT WORKS
 *   Three levers, all of which only ever *narrow* what the player will accept:
 *
 *     1. MediaSource.isTypeSupported - the capability probe the player runs to
 *        decide which formats to ask the server for. This is the lever that
 *        actually changes the negotiation, because the answer feeds the codec
 *        list sent upstream.
 *     2. HTMLMediaElement#canPlayType - the same question asked at the element,
 *        for the paths that go there instead.
 *     3. streamingData.adaptiveFormats / .formats - the offer that comes back.
 *        Stripped as belt and braces, in case a path trusts the offer over its
 *        own probe.
 *
 *   Narrowing only is deliberate: a forced codec is never reported as supported
 *   when the platform says it is not. The worst this can do is leave the player
 *   with fewer options, never with an option the hardware cannot drive.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *   - Touch audio. Audio entries and audio/* MIME types are passed through
 *     untouched; filtering them would silence playback.
 *   - Empty a format list. If the wanted codec has no rendition for a video,
 *     that list is left exactly as it was and the request is treated as
 *     unsatisfiable for that video. A stream the user did not ask for beats no
 *     stream at all.
 *   - Force a codec the platform denies. The choice is probed against the
 *     untouched isTypeSupported before any hook goes in. HEVC in particular is
 *     rarely exposed through MSE on webOS even where the panel decodes it in
 *     hardware, so that selection will usually be refused here with a message
 *     rather than producing a black screen.
 *
 * TAKES EFFECT ON RELOAD
 *   The player probes codecs once, at startup, and caches the answer. Changed
 *   mid-session, the setting narrows the format lists of the next player
 *   responses while the player keeps the codecs it probed, so the change
 *   handler says to reload rather than letting the setting look half broken.
 */

/**
 * Apply the stored setting.
 *
 * @param {boolean} interactive true when the user just changed it, which is the
 *   only time there is a DOM to put a notification in and the only time a
 *   "reload to apply" message is worth showing.
 */
function applyMode(interactive) {
  const stored = configRead('forceVideoCodec');
  // A value this build does not know (stored by another one) is Auto: taken
  // as a mode it would refuse every video codec.
  const known = stored === 'auto' || stored === 'no_av1' || PINNED_MODES.indexOf(stored) !== -1;
  if (!known) log.warn(`Unknown codec setting "${stored}": leaving codec selection on Auto`);
  const wanted = known ? stored : 'auto';

  if (wanted === 'auto') {
    fc.mode = 'auto';
    fc.unsatisfiable = false;
    if (interactive) showNotification('Video codec: Auto — reload to apply');
    return;
  }

  // Install first so the probe below goes through the saved original rather
  // than whatever else may have wrapped isTypeSupported since startup.
  installHooks();

  if (PINNED_MODES.indexOf(wanted) !== -1 && !platformSupports(wanted)) {
    fc.mode = 'auto';
    const label = wanted.toUpperCase();
    log.warn(
      `${label} is not available through MSE on this device; leaving codec selection alone.`
    );
    if (interactive) {
      showNotification(`${label} is not available on this TV — leaving codec on Auto`);
    }
    return;
  }

  fc.mode = wanted;
  fc.unsatisfiable = false;
  log.debug('mode set to', fc.mode);

  if (interactive) {
    const label = fc.mode === 'no_av1' ? 'Avoid AV1' : fc.mode.toUpperCase();
    showNotification(`Video codec: ${label} — reload to apply`);
  }
}

let installed = false;

/** Installs the capability hooks for the stored setting and follows its changes; idempotent. */
export function installCodecHooks() {
  if (installed) return;
  installed = true;
  configAddChangeListener('forceVideoCodec', () => applyMode(true));
  applyMode(false);
}

/** The live mode, or null when nothing is narrowed: for tests/unit/force-codec-test.cjs. */
export function forceCodecActive() {
  return narrowing() ? fc.mode : null;
}
