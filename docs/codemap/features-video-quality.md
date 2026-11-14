# Code map: features/video-quality/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/video-quality/index.js](#mod-index-js), [features/video-quality/kickstart-absent.js](#mod-kickstart-absent-js), [features/video-quality/kickstart.js](#mod-kickstart-js), [features/video-quality/log.js](#mod-log-js), [features/video-quality/player-state.js](#mod-player-state-js), [features/video-quality/quality.js](#mod-quality-js), [features/video-quality/state.js](#mod-state-js)

<a id="mod-index-js"></a>

## features/video-quality/index.js

> Force High Resolution Video: on the watch page it attaches to the TV player, forces the highest quality (quality.js) and publishes the player's state changes for the other features (player-state.js). This file follows the page and the setting.

170 lines · imports [core/config.js](core.md#mod-config-js), [core/disposables.js](core.md#mod-disposables-js), [core/dom.js](core.md#mod-dom-js), [core/selectors.js](core.md#mod-selectors-js), [core/page-state.js](core.md#mod-page-state-js), [features/video-quality/state.js](#mod-state-js), [features/video-quality/quality.js](#mod-quality-js), [features/video-quality/player-state.js](#mod-player-state-js), [features/video-quality/log.js](#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [features/video-quality/quality.js › clearLocalStorageQuality](#fn-quality-js-clearlocalstoragequality), [features/video-quality/quality.js › setLocalStorageQuality](#fn-quality-js-setlocalstoragequality), [setupListeners](#fn-index-js-setuplisteners)
- **Settings:** listens to `forceHighResVideo`
- **Hooks:** `window.__ytafQualityStats`

<a id="fn-index-js-destroyvideoquality"></a>
**`destroyVideoQuality()`** · function · L22–43

Leaves the player: timers, listeners and the per-video state go (the webOS 25 kick stays done for the session).

- **Called by:** [handleNavigation](#fn-index-js-handlenavigation)

<a id="fn-index-js-attachtoplayer"></a>
**`attachToPlayer()`** · function · L46–74

Attaches to the TV player once it is there; true when attached (pollUntil's answer).

- **Calls:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange)
- **Called by:** [initVideoQuality](#fn-index-js-initvideoquality), [pollForPlayer](#fn-index-js-pollforplayer)
- **Events:** listens to `onStateChange`
- **Selectors:** `PLAYER_ID`

<a id="fn-index-js-pollforplayer"></a>
**`pollForPlayer()`** · function · L83–96

Looks for the player every 200 ms for the first ten seconds, then once a second for another fifty: a slow first load must still be forced, and a watch page whose player never mounts is not polled for the rest of the session. The poll is cancelled with the bag, so a detached module is never looked for.

- **Calls:** [core/dom.js › pollUntil](core.md#fn-dom-js-polluntil), [attachToPlayer](#fn-index-js-attachtoplayer)
- **Called by:** [initVideoQuality](#fn-index-js-initvideoquality)

<a id="fn-index-js-initvideoquality"></a>
**`initVideoQuality()`** · function · L102–119

Attaches to the player on the watch page (polling until it exists) and sets the stored quality preference.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [attachToPlayer](#fn-index-js-attachtoplayer), [pollForPlayer](#fn-index-js-pollforplayer), [features/video-quality/quality.js › setLocalStorageQuality](#fn-quality-js-setlocalstoragequality)
- **Called by:** [handleNavigation](#fn-index-js-handlenavigation)
- **Settings:** reads `forceHighResVideo`

<a id="fn-index-js-handlenavigation"></a>
**`handleNavigation()`** · function · L140–157

Attaches on entering the watch page (a tick later, once the page is built) and detaches on leaving it.

- **Calls:** [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [destroyVideoQuality](#fn-index-js-destroyvideoquality), [initVideoQuality](#fn-index-js-initvideoquality)
- **Called by:** [setupListeners](#fn-index-js-setuplisteners)
- **Browser:** `setTimeout`

<a id="fn-index-js-setuplisteners"></a>
**`setupListeners()`** · function · L160–168

Follows page changes, and checks the current page once the document is ready.

- **Calls:** [handleNavigation](#fn-index-js-handlenavigation)
- **Called by:** [at load](#mod-index-js)
- **Events:** listens to `ytaf-page-update`, `DOMContentLoaded`

<a id="mod-kickstart-absent-js"></a>

## features/video-quality/kickstart-absent.js

> The legacy build's kickstart.js (webpack.config.js): the first-video kick is for webOS 25, which runs the webOS 22+ build.

5 lines

<a id="fn-kickstart-absent-js-ensureplaybackstarts"></a>
**`ensurePlaybackStarts()`** · function, async, exported · L5–5

Nothing to kick on webOS 3 to 6.

<a id="mod-kickstart-js"></a>

## features/video-quality/kickstart.js

> webOS 25 first-video fix: after the quality switch the player can sit in UNSTARTED, so the first playback is kicked until it reports PLAYING, and the controls bar that the kick raises is dismissed again.

80 lines · imports [core/remote.js](core.md#mod-remote-js), [features/video-quality/state.js](#mod-state-js), [core/selectors.js](core.md#mod-selectors-js), [ui/hide-controls.js](ui.md#mod-hide-controls-js), [features/video-quality/log.js](#mod-log-js), [core/player-state.js](core.md#mod-player-state-js) · imported by [features/video-quality/player-state.js](#mod-player-state-js)

<a id="fn-kickstart-js-dismissraisedcontrols"></a>
**`dismissRaisedControls(bag)`** · function · L16–26

The kick raises the controls bar: when it holds the focus it is hidden (ui/hide-controls.js) and dismissed with three UP presses. All of it is the attach's (`bag`), so leaving the watch page cancels what has not run.

- **Calls:** [core/remote.js › sendKey](core.md#fn-remote-js-sendkey), [ui/hide-controls.js › hideControlsFor](ui.md#fn-hide-controls-js-hidecontrolsfor)
- **Called by:** [ensurePlaybackStarts](#fn-kickstart-js-ensureplaybackstarts)
- **Selectors:** `CONTROLS`, `CONTROLS_FOCUSED_CLASS_WEBOS25`
- **Browser:** `querySelector`

<a id="fn-kickstart-js-ensureplaybackstarts"></a>
**`ensurePlaybackStarts()`** · function, async, exported · L32–80

webOS 25 only, once per session: calls playVideo() until the player reports PLAYING (up to KICKSTART_MAX_ATTEMPTS), then hides the controls that raised with it.

- **Calls:** [dismissRaisedControls](#fn-kickstart-js-dismissraisedcontrols)
- **Called by:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange)
- **Browser:** `requestAnimationFrame`, `setTimeout`

<a id="mod-log-js"></a>

## features/video-quality/log.js

> The logger of the feature's modules: their messages carry [VideoQuality] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/video-quality/index.js](#mod-index-js), [features/video-quality/kickstart.js](#mod-kickstart-js), [features/video-quality/player-state.js](#mod-player-state-js), [features/video-quality/quality.js](#mod-quality-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-player-state-js"></a>

## features/video-quality/player-state.js

> Player state transitions: publishes `yt-player-state-change` for the other features and drives quality forcing from it.

81 lines · imports [features/video-quality/state.js](#mod-state-js), [features/video-quality/quality.js](#mod-quality-js), [features/video-quality/kickstart.js](#mod-kickstart-js), [features/video-quality/log.js](#mod-log-js), [core/player-state.js](core.md#mod-player-state-js) · imported by [features/video-quality/index.js](#mod-index-js)

<a id="fn-player-state-js-handlestatechange"></a>
**`handleStateChange(state)`** · function, exported · L19–81

The player's state change: published as yt-player-state-change for the clock and SponsorBlock, then, with Force Max Quality on, the quality is forced for a new video.

- **Calls:** [features/video-quality/kickstart.js › ensurePlaybackStarts](#fn-kickstart-js-ensureplaybackstarts), [features/video-quality/quality.js › interceptAndUpgradeQuality](#fn-quality-js-interceptandupgradequality), [features/video-quality/quality.js › notifyIfUpgraded](#fn-quality-js-notifyifupgraded), [features/video-quality/quality.js › setLocalStorageQuality](#fn-quality-js-setlocalstoragequality), [features/video-quality/quality.js › setQualityOnPlayer](#fn-quality-js-setqualityonplayer), [features/video-quality/quality.js › settleVideo](#fn-quality-js-settlevideo)
- **Called by:** [features/video-quality/index.js › attachToPlayer](#fn-index-js-attachtoplayer)
- **Events:** creates `yt-player-state-change`

<a id="mod-quality-js"></a>

## features/video-quality/quality.js

> Quality forcing: the yt-player-quality localStorage key the app reads when it creates the player, and the player API for a video that is already playing.

187 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [features/video-quality/state.js](#mod-state-js), [features/video-quality/log.js](#mod-log-js), [core/yt-storage.js](core.md#mod-yt-storage-js), [core/player-state.js](core.md#mod-player-state-js) · imported by [features/video-quality/index.js](#mod-index-js), [features/video-quality/player-state.js](#mod-player-state-js)

<a id="fn-quality-js-isplayerqualityknown"></a>
**`isPlayerQualityKnown()`** · function · L19–27

True once the player reports any negotiated quality (see KNOWN_QUALITIES).

- **Called by:** [setQualityOnPlayer](#fn-quality-js-setqualityonplayer), [settleVideo](#fn-quality-js-settlevideo)

<a id="fn-quality-js-isforcedpair"></a>
**`isForcedPair(inner)`** · function · L30–32

The 4320/4320 pair this module writes: the app's own preference is any other.

- **Called by:** [clearLocalStorageQuality](#fn-quality-js-clearlocalstoragequality), [setLocalStorageQuality](#fn-quality-js-setlocalstoragequality)

<a id="fn-quality-js-pairof"></a>
**`pairOf(record)`** · function · L35–42

The quality pair inside a stored record (its `data` is a JSON string), or null.

- **Called by:** [clearLocalStorageQuality](#fn-quality-js-clearlocalstoragequality), [setLocalStorageQuality](#fn-quality-js-setlocalstoragequality)

<a id="fn-quality-js-setlocalstoragequality"></a>
**`setLocalStorageQuality()`** · function, exported · L49–69

Stores the 4320 pair, unless ours is there with more than RENEW_BEFORE_MS left. Read every time: the app stores its own pair whenever the viewer picks a quality.

- **Calls:** [core/yt-storage.js › readRecord](core.md#fn-yt-storage-js-readrecord), [core/yt-storage.js › writeRecord](core.md#fn-yt-storage-js-writerecord), [isForcedPair](#fn-quality-js-isforcedpair), [pairOf](#fn-quality-js-pairof), [features/video-quality/state.js › isForceEnabled](#fn-state-js-isforceenabled)
- **Called by:** [features/video-quality/index.js (at load)](#mod-index-js), [features/video-quality/index.js › initVideoQuality](#fn-index-js-initvideoquality), [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange)

<a id="fn-quality-js-clearlocalstoragequality"></a>
**`clearLocalStorageQuality()`** · function, exported · L76–82

The setting turned off: removes the 4320 preference written above, so the app chooses the quality itself again. A preference of any other shape is the app's own and stays.

- **Calls:** [core/yt-storage.js › readRecord](core.md#fn-yt-storage-js-readrecord), [core/yt-storage.js › removeRecord](core.md#fn-yt-storage-js-removerecord), [isForcedPair](#fn-quality-js-isforcedpair), [pairOf](#fn-quality-js-pairof)
- **Called by:** [features/video-quality/index.js (at load)](#mod-index-js)

<a id="fn-quality-js-setqualityonplayer"></a>
**`setQualityOnPlayer()`** · function, exported · L88–122

Asks the player for the highest quality, unless it already plays at it; says whether that was an upgrade and to what.

- **Calls:** [isPlayerQualityKnown](#fn-quality-js-isplayerqualityknown), [features/video-quality/state.js › isForceEnabled](#fn-state-js-isforceenabled)
- **Called by:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange), [interceptAndUpgradeQuality](#fn-quality-js-interceptandupgradequality)

<a id="fn-quality-js-notifyifupgraded"></a>
**`notifyIfUpgraded(result)`** · function, exported · L128–142

Toasts the new quality half a second after an upgrade (dropped when the watch page was left meanwhile).

- **Calls:** [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange), [interceptAndUpgradeQuality](#fn-quality-js-interceptandupgradequality)

<a id="fn-quality-js-settlevideo"></a>
**`settleVideo(videoId, force)`** · function, exported · L145–148

Marks the video settled when the player already reports a quality; else runs `force(videoId)`.

- **Calls:** [isPlayerQualityKnown](#fn-quality-js-isplayerqualityknown)
- **Called by:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange)

<a id="fn-quality-js-interceptandupgradequality"></a>
**`interceptAndUpgradeQuality(videoId)`** · function, exported · L151–187

A video already playing without a quality: pause, force, resume.

- **Calls:** [notifyIfUpgraded](#fn-quality-js-notifyifupgraded), [setQualityOnPlayer](#fn-quality-js-setqualityonplayer), [features/video-quality/state.js › isForceEnabled](#fn-state-js-isforceenabled)
- **Called by:** [features/video-quality/player-state.js › handleStateChange](#fn-player-state-js-handlestatechange)
- **Browser:** `requestAnimationFrame`

<a id="mod-state-js"></a>

## features/video-quality/state.js

> Everything the video-quality modules share: the constants, the player handle and the per-session flags. Scalars live on `vq` so every module reads and writes the same value; the Set is exported directly.

69 lines · imports [core/webos.js](core.md#mod-webos-js), [core/speed-cap.js](core.md#mod-speed-cap-js) · imported by [features/video-quality/index.js](#mod-index-js), [features/video-quality/kickstart.js](#mod-kickstart-js), [features/video-quality/player-state.js](#mod-player-state-js), [features/video-quality/quality.js](#mod-quality-js)

**At load:**

- **Calls:** [core/webos.js › isWebOS25](core.md#fn-webos-js-iswebos25)

<a id="fn-state-js-isforceenabled"></a>
**`isForceEnabled()`** · function, exported · L65–69

Whether quality is forced now: Force Max Quality is on, the player is not an inline preview, and the playback speed does not hold the video at 1080p (core/speed-cap.js).

- **Calls:** [core/speed-cap.js › isQualityCappedBySpeed](core.md#fn-speed-cap-js-isqualitycappedbyspeed)
- **Called by:** [features/video-quality/quality.js › interceptAndUpgradeQuality](#fn-quality-js-interceptandupgradequality), [features/video-quality/quality.js › setLocalStorageQuality](#fn-quality-js-setlocalstoragequality), [features/video-quality/quality.js › setQualityOnPlayer](#fn-quality-js-setqualityonplayer)
