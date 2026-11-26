# Code map: features/auto-login/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/auto-login/index.js](#mod-index-js), [features/auto-login/log.js](#mod-log-js), [features/auto-login/previews.js](#mod-previews-js), [features/auto-login/promo-upsell.js](#mod-promo-upsell-js), [features/auto-login/whos-watching.js](#mod-whos-watching-js)

<a id="mod-index-js"></a>

## features/auto-login/index.js

> Auto Login: skips the account selector, suppresses the Premium upsell and applies the preview preference. This file follows the settings.

46 lines · imports [core/config.js](core.md#mod-config-js), [features/auto-login/whos-watching.js](#mod-whos-watching-js), [features/auto-login/promo-upsell.js](#mod-promo-upsell-js), [features/auto-login/previews.js](#mod-previews-js), [features/auto-login/log.js](#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [start](#fn-index-js-start), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [initAutoLogin](#fn-index-js-initautologin), [features/auto-login/whos-watching.js › setWhosWatchingSuppressed](#fn-whos-watching-js-setwhoswatchingsuppressed), [features/auto-login/promo-upsell.js › setPromoUpsellSuppressed](#fn-promo-upsell-js-setpromoupsellsuppressed), [features/auto-login/previews.js › setInlinePlayback](#fn-previews-js-setinlineplayback)
- **Settings:** listens to `enableAutoLogin`, `forcePreviews`
- **Events:** listens to `DOMContentLoaded`

<a id="fn-index-js-initautologin"></a>
**`initAutoLogin()`** · function · L15–22

With Bypass Nag Screens on: suppresses the Who's Watching and promo screens and skips the account selector when it appears.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [features/auto-login/promo-upsell.js › setPromoUpsellSuppressed](#fn-promo-upsell-js-setpromoupsellsuppressed), [features/auto-login/whos-watching.js › setWhosWatchingSuppressed](#fn-whos-watching-js-setwhoswatchingsuppressed), [features/auto-login/whos-watching.js › setupActiveBypassListener](#fn-whos-watching-js-setupactivebypasslistener)
- **Called by:** [at load](#mod-index-js), [start](#fn-index-js-start)
- **Settings:** reads `enableAutoLogin`

<a id="fn-index-js-start"></a>
**`start()`** · function · L25–28

Starts the auto-login bypass and the Force Previews setting.

- **Calls:** [initAutoLogin](#fn-index-js-initautologin), [features/auto-login/previews.js › initPreviews](#fn-previews-js-initpreviews)
- **Called by:** [at load](#mod-index-js)

<a id="mod-log-js"></a>

## features/auto-login/log.js

> One logger for the auto-login modules.

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/auto-login/index.js](#mod-index-js), [features/auto-login/previews.js](#mod-previews-js), [features/auto-login/promo-upsell.js](#mod-promo-upsell-js), [features/auto-login/whos-watching.js](#mod-whos-watching-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-previews-js"></a>

## features/auto-login/previews.js

> Inline playback (video previews on the grid): the app's own setting, forced on or off once its initial load has had its say.

30 lines · imports [core/config.js](core.md#mod-config-js), [features/auto-login/log.js](#mod-log-js), [core/yt-storage.js](core.md#mod-yt-storage-js) · imported by [features/auto-login/index.js](#mod-index-js)

<a id="fn-previews-js-setinlineplayback"></a>
**`setInlinePlayback(mode)`** · function, exported · L10–19

Writes YouTube's own inline-playback (previews) preference: on for force_on, off for force_off.

- **Calls:** [core/yt-storage.js › writeRecord](core.md#fn-yt-storage-js-writerecord)
- **Called by:** [features/auto-login/index.js (at load)](#mod-index-js), [initPreviews](#fn-previews-js-initpreviews)

<a id="fn-previews-js-initpreviews"></a>
**`initPreviews()`** · function, exported · L22–30

Applies Force Previews 2.5 s after start, once YouTube's own start-up has written its value.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [setInlinePlayback](#fn-previews-js-setinlineplayback)
- **Called by:** [features/auto-login/index.js › start](#fn-index-js-start)
- **Settings:** reads `forcePreviews`
- **Browser:** `setTimeout`

<a id="mod-promo-upsell-js"></a>

## features/auto-login/promo-upsell.js

> The Premium / Premium Lite upsell interstitial, suppressed through the records the app itself keeps about having shown it.

76 lines · imports [features/auto-login/log.js](#mod-log-js), [core/yt-storage.js](core.md#mod-yt-storage-js) · imported by [features/auto-login/index.js](#mod-index-js)

<a id="fn-promo-upsell-js-promovaluefor"></a>
**`promoValueFor(suffix)`** · function · L38–40

The value stored for a promo record: the shown-times count, or a timestamp far enough ahead to keep the promo away.

- **Called by:** [setPromoUpsellSuppressed](#fn-promo-upsell-js-setpromoupsellsuppressed)

<a id="fn-promo-upsell-js-setpromoupsellsuppressed"></a>
**`setPromoUpsellSuppressed(on)`** · function, exported · L43–76

Suppresses the Premium upsell records (`on`), or restores them to let the app decide.

- **Calls:** [core/yt-storage.js › readRecord](core.md#fn-yt-storage-js-readrecord), [core/yt-storage.js › writeRecord](core.md#fn-yt-storage-js-writerecord), [promoValueFor](#fn-promo-upsell-js-promovaluefor)
- **Called by:** [features/auto-login/index.js (at load)](#mod-index-js), [features/auto-login/index.js › initAutoLogin](#fn-index-js-initautologin)
- **Browser:** `localStorage`

<a id="mod-whos-watching-js"></a>

## features/auto-login/whos-watching.js

> The account selector ("Who's watching"): kept from appearing by dating its recurring-action record forward, and skipped actively when it shows anyway.

137 lines · imports [core/selectors.js](core.md#mod-selectors-js), [core/config.js](core.md#mod-config-js), [core/remote.js](core.md#mod-remote-js), [core/guest-mode.js](core.md#mod-guest-mode-js), [features/auto-login/log.js](#mod-log-js), [core/yt-storage.js](core.md#mod-yt-storage-js) · imported by [features/auto-login/index.js](#mod-index-js)

<a id="fn-whos-watching-js-setwhoswatchingsuppressed"></a>
**`setWhosWatchingSuppressed(on)`** · function, exported · L45–68

Keeps "Who's watching" from appearing (`on`) by pushing its lastFired date seven days into the future, or lets it appear again by dating it now. Credit: reisxd || https://github.com/reisxd/TizenTube/

- **Calls:** [core/yt-storage.js › readRecord](core.md#fn-yt-storage-js-readrecord), [core/yt-storage.js › writeRecord](core.md#fn-yt-storage-js-writerecord)
- **Called by:** [features/auto-login/index.js (at load)](#mod-index-js), [features/auto-login/index.js › initAutoLogin](#fn-index-js-initautologin)

<a id="fn-whos-watching-js-markbypassing"></a>
**`markBypassing()`** · function · L71–77

Hides the selector, so it does not flash before the synthetic Enter.

- **Called by:** [attemptActiveBypass](#fn-whos-watching-js-attemptactivebypass)

<a id="fn-whos-watching-js-finalizebypass"></a>
**`finalizeBypass()`** · function · L80–86

Removes the stylesheet that hid the account selector, a moment after the bypass.

- **Called by:** [attemptActiveBypass](#fn-whos-watching-js-attemptactivebypass)
- **Browser:** `setTimeout`

<a id="fn-whos-watching-js-attemptactivebypass"></a>
**`attemptActiveBypass(force)`** · function, exported · L92–119

Picks the account on the account selector with synthetic key presses (Down first for a guest), once per launch window; `force` skips the window and selector checks.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/guest-mode.js › isGuestMode](core.md#fn-guest-mode-js-isguestmode), [core/remote.js › sendKey](core.md#fn-remote-js-sendkey), [finalizeBypass](#fn-whos-watching-js-finalizebypass), [markBypassing](#fn-whos-watching-js-markbypassing)
- **Called by:** [setupActiveBypassListener](#fn-whos-watching-js-setupactivebypasslistener), [userScript.js (at load)](app.md#mod-userscript-js)
- **Settings:** reads `enableAutoLogin`
- **Selectors:** `ACCOUNT_SELECTOR`
- **Browser:** `setTimeout`

<a id="fn-whos-watching-js-resetactivebypass"></a>
**`resetActiveBypass()`** · function, exported · L122–126

A relaunch from the launcher: the window opens again, from now.

- **Calls:** [core/guest-mode.js › invalidateGuestModeCache](core.md#fn-guest-mode-js-invalidateguestmodecache)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-whos-watching-js-setupactivebypasslistener"></a>
**`setupActiveBypassListener()`** · function, exported · L129–137

Runs the bypass whenever the account selector page appears (once).

- **Calls:** [attemptActiveBypass](#fn-whos-watching-js-attemptactivebypass)
- **Called by:** [features/auto-login/index.js › initAutoLogin](#fn-index-js-initautologin)
- **Events:** listens to `ytaf-page-update`
