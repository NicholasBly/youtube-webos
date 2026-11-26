# Code map: features/playback-speed/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/playback-speed/controller.js](#mod-controller-js), [features/playback-speed/index.js](#mod-index-js), [features/playback-speed/log.js](#mod-log-js), [features/playback-speed/native-menu.js](#mod-native-menu-js)

<a id="mod-controller-js"></a>

## features/playback-speed/controller.js

> The playback speed: what it is, changing it, and the audio engine that plays the sound at it. A change reloads the video (loadVideoById at the current position): the engine decides a MediaSource's speed once, when YouTube creates its buffers (vendor/playback-speed/mse-hook.js). Rapid changes within RELOAD_DELAY_MS are one reload.

239 lines · imports [vendor/playback-speed/audio-engine.js](vendor-playback-speed.md#mod-audio-engine-js), [vendor/playback-speed/mse-hook.js](vendor-playback-speed.md#mod-mse-hook-js), [core/config.js](core.md#mod-config-js), [core/speed-cap.js](core.md#mod-speed-cap-js), [core/player-state.js](core.md#mod-player-state-js), [features/playback-speed/log.js](#mod-log-js) · imported by [features/playback-speed/index.js](#mod-index-js)

<a id="fn-controller-js-restoreposition"></a>
**`restorePosition(player, at, capped)`** · function · L31–50

On webOS 25 loadVideoById(id, at) starts up to ~25 s before `at`, even at 1x: once the reloaded video plays it is sent back to `at`. When `capped()` the 1080p cap is set again then too: the reload drops it, and YouTube then falls to 480p on a 60 fps video (the frames a 60 Hz screen cannot show count as dropped).

- **Called by:** [createSpeedController.applyReload](#fn-controller-js-createspeedcontroller-applyreload)
- **Browser:** `setInterval`

<a id="fn-controller-js-createaudiosinks"></a>
**`createAudioSinks(onError)`** · function · L58–90

The audio engines, one at a time: `create({ speed, element })` starts one for a new MediaSource at `speed`, playing along with `element` (its volume and mute followed), and stops the previous one; `release()` stops it. `onError` is the engine's: a video it cannot play.

- **Called by:** [createSpeedController](#fn-controller-js-createspeedcontroller)

<a id="fn-controller-js-createaudiosinks-release"></a>
**`createAudioSinks.release()`** · arrow · L62–67

Stops the engine of the previous MediaSource, if one is playing.

- **Called by:** [createAudioSinks.create](#fn-controller-js-createaudiosinks-create)

<a id="fn-controller-js-createaudiosinks-create"></a>
**`createAudioSinks.create({ speed, element })`** · arrow · L70–84

A new engine for a MediaSource at `speed`, following `element`'s volume.

- **Calls:** [createAudioSinks.create.listener](#fn-controller-js-createaudiosinks-create-listener), [createAudioSinks.release](#fn-controller-js-createaudiosinks-release), [vendor/playback-speed/audio-engine.js › AudioEngine.constructor](vendor-playback-speed.md#fn-audio-engine-js-audioengine-constructor)
- **Events:** listens to `volumechange`

<a id="fn-controller-js-createaudiosinks-create-listener"></a>
**`createAudioSinks.create.listener()`** · arrow · L77–77

Follows the &lt;video>'s volume and mute.

- **Called by:** [createAudioSinks.create](#fn-controller-js-createaudiosinks-create)

<a id="fn-controller-js-createaudiosinks-current"></a>
**`createAudioSinks.current()`** · arrow · L87–87

The engine playing, or null.

<a id="fn-controller-js-createspeedcontroller"></a>
**`createSpeedController({ getPlayer, notify, isOn, isSupported })`** · function, exported · L97–239

The controller: `getPlayer()` is YouTube's player element (or null), `notify(text)` shows a toast, `isOn()` whether the setting is on, and `isSupported()` whether this TV can (WebCodecs' AudioDecoder).

- **Calls:** [createAudioSinks](#fn-controller-js-createaudiosinks), [createSpeedController.onError](#fn-controller-js-createspeedcontroller-onerror)
- **Called by:** [features/playback-speed/index.js › install](#fn-index-js-install)

<a id="fn-controller-js-createspeedcontroller-getspeed"></a>
**`createSpeedController.getSpeed()`** · arrow · L105–105

The speed in effect: 1 while the setting is off or the TV cannot.

<a id="fn-controller-js-createspeedcontroller-setcurrent"></a>
**`createSpeedController.setCurrent(speed)`** · function · L108–111

Records a new speed, and whether it holds the video at 1080p (core/speed-cap.js).

- **Calls:** [core/speed-cap.js › setQualityCappedBySpeed](core.md#fn-speed-cap-js-setqualitycappedbyspeed)
- **Called by:** [createSpeedController.onError](#fn-controller-js-createspeedcontroller-onerror), [createSpeedController.setSpeed](#fn-controller-js-createspeedcontroller-setspeed), [createSpeedController.stop](#fn-controller-js-createspeedcontroller-stop)

<a id="fn-controller-js-createspeedcontroller-position"></a>
**`createSpeedController.position(player)`** · function · L114–120

The player's position in seconds, 0 when it cannot say.

- **Called by:** [createSpeedController.scheduleReload](#fn-controller-js-createspeedcontroller-schedulereload)

<a id="fn-controller-js-createspeedcontroller-applyreload"></a>
**`createSpeedController.applyReload({ position: at, fromSpeed })`** · function · L123–153

Reloads the video at the new speed, unless the burst came back to where it started.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [restorePosition](#fn-controller-js-restoreposition)
- **Called by:** [createSpeedController.scheduleReload](#fn-controller-js-createspeedcontroller-schedulereload)
- **Settings:** reads `forceHighResVideo`
- **Browser:** `setTimeout`

<a id="fn-controller-js-createspeedcontroller-schedulereload"></a>
**`createSpeedController.scheduleReload(fromSpeed, immediate)`** · function · L156–172

Reloads RELOAD_DELAY_MS from now (at once with `immediate`), keeping the burst's start.

- **Calls:** [createSpeedController.applyReload](#fn-controller-js-createspeedcontroller-applyreload), [createSpeedController.position](#fn-controller-js-createspeedcontroller-position)
- **Called by:** [createSpeedController.onError](#fn-controller-js-createspeedcontroller-onerror), [createSpeedController.setSpeed](#fn-controller-js-createspeedcontroller-setspeed), [createSpeedController.stop](#fn-controller-js-createspeedcontroller-stop)
- **Browser:** `setTimeout`

<a id="fn-controller-js-createspeedcontroller-setspeed"></a>
**`createSpeedController.setSpeed(speed, { immediate = false })`** · function · L179–193

Plays at `speed` (one of SUPPORTED_SPEEDS): says so, and reloads (at once with `immediate`, for a pick from YouTube's menu). Says why not when the setting is off or the TV cannot.

- **Calls:** [createSpeedController.scheduleReload](#fn-controller-js-createspeedcontroller-schedulereload), [createSpeedController.setCurrent](#fn-controller-js-createspeedcontroller-setcurrent), [vendor/playback-speed/mse-hook.js › isSupportedSpeed](vendor-playback-speed.md#fn-mse-hook-js-issupportedspeed)
- **Called by:** [createSpeedController.reset](#fn-controller-js-createspeedcontroller-reset), [createSpeedController.step](#fn-controller-js-createspeedcontroller-step)

<a id="fn-controller-js-createspeedcontroller-step"></a>
**`createSpeedController.step(dir)`** · function · L196–201

One step up (dir >= 0) or down the speeds, stopping at the ends.

- **Calls:** [createSpeedController.setSpeed](#fn-controller-js-createspeedcontroller-setspeed)

<a id="fn-controller-js-createspeedcontroller-reset"></a>
**`createSpeedController.reset()`** · function · L204–206

Back to 1x.

- **Calls:** [createSpeedController.setSpeed](#fn-controller-js-createspeedcontroller-setspeed)

<a id="fn-controller-js-createspeedcontroller-stop"></a>
**`createSpeedController.stop()`** · function · L209–214

The setting was turned off: back to 1x at once, not on the next video.

- **Calls:** [createSpeedController.scheduleReload](#fn-controller-js-createspeedcontroller-schedulereload), [createSpeedController.setCurrent](#fn-controller-js-createspeedcontroller-setcurrent)

<a id="fn-controller-js-createspeedcontroller-onerror"></a>
**`createSpeedController.onError(e)`** · function · L217–224

The engine cannot play this video (an audio codec WebCodecs lacks): back to 1x.

- **Calls:** [createSpeedController.scheduleReload](#fn-controller-js-createspeedcontroller-schedulereload), [createSpeedController.setCurrent](#fn-controller-js-createspeedcontroller-setcurrent)
- **Called by:** [createSpeedController](#fn-controller-js-createspeedcontroller)

<a id="fn-controller-js-createspeedcontroller-lastreloadat"></a>
**`createSpeedController.lastReloadAt()`** · property · L237–237

When the last speed change reloaded the video (Date.now()), 0 before any.

<a id="mod-index-js"></a>

## features/playback-speed/index.js

> Playback speed (experimental, off by default; webOS 23 and newer, the webOS 22+ build only). webOS's media pipeline ignores video.playbackRate, so the engine (src/vendor/playback-speed) keeps the decoder at 1x and rescales the video's own timeline instead, and plays the sound through WebCodecs and Web Audio, time-stretched with the pitch kept. 0.25x to 2x.
>
> Picked in YouTube's own Settings > Speed menu (native-menu.js) or with the Playback Speed +, - and 1x shortcuts. Nothing is installed until the setting is on; turned off, the speed goes back to 1x at once and everything installed stands aside. The legacy build has playback-speed-absent.js in its place.

118 lines · imports [core/config.js](core.md#mod-config-js), [core/selectors.js](core.md#mod-selectors-js), [core/player-state.js](core.md#mod-player-state-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [vendor/playback-speed/mse-hook.js](vendor-playback-speed.md#mod-mse-hook-js), [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/playback-speed/controller.js](#mod-controller-js), [features/playback-speed/native-menu.js](#mod-native-menu-js), [features/playback-speed/log.js](#mod-log-js) · imported by [ui/panel/pages.js](ui-panel.md#mod-pages-js), [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js), [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [install](#fn-index-js-install), [isOn](#fn-index-js-ison)
- **Settings:** listens to `enablePlaybackSpeed`

<a id="fn-index-js-ison"></a>
**`isOn()`** · arrow · L39–39

Whether the setting is on.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [at load](#mod-index-js), [install](#fn-index-js-install), [stepSpeed](#fn-index-js-stepspeed)
- **Settings:** reads `enablePlaybackSpeed`

<a id="fn-index-js-getplayer"></a>
**`getPlayer()`** · arrow · L42–44

YouTube's player element, or null.

- **Called by:** [install](#fn-index-js-install)
- **Selectors:** `PLAYER_ID`, `HTML5_PLAYER_FALLBACK`
- **Browser:** `querySelector`

<a id="fn-index-js-install"></a>
**`install()`** · function · L53–93

Installs everything, once, the first time the setting is on: the engine's MediaSource hook, YouTube's speed menu and button, and the cap of the next video at 1080p above 1.25x.

- **Calls:** [features/adblock/parse-hook.js › setParsedObjectStep](features-adblock.md#fn-parse-hook-js-setparsedobjectstep), [features/playback-speed/controller.js › createSpeedController](#fn-controller-js-createspeedcontroller), [getPlayer](#fn-index-js-getplayer), [isOn](#fn-index-js-ison), [features/playback-speed/native-menu.js › bindPlayerRate](#fn-native-menu-js-bindplayerrate), [features/playback-speed/native-menu.js › enableNativeSpeedMenu](#fn-native-menu-js-enablenativespeedmenu), [features/playback-speed/native-menu.js › enableSpeedButton](#fn-native-menu-js-enablespeedbutton), [features/playback-speed/native-menu.js › hookRateAssignments](#fn-native-menu-js-hookrateassignments), [vendor/playback-speed/mse-hook.js › installMseHook](vendor-playback-speed.md#fn-mse-hook-js-installmsehook)
- **Called by:** [at load](#mod-index-js), [stepSpeed](#fn-index-js-stepspeed)
- **Events:** listens to `yt-player-state-change`
- **Browser:** `setInterval`

<a id="fn-index-js-stepspeed"></a>
**`stepSpeed(direction)`** · function, exported · L96–107

One step up (+1) or down (-1) the speeds: the Playback Speed + and - shortcuts.

- **Calls:** [install](#fn-index-js-install), [isOn](#fn-index-js-ison), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/shortcuts/actions.js (at load)](ui-shortcuts.md#mod-actions-js)

<a id="fn-index-js-resetspeed"></a>
**`resetSpeed()`** · function, exported · L110–112

Back to 1x: the Playback Speed 1x shortcut.

<a id="mod-log-js"></a>

## features/playback-speed/log.js

> The logger of the feature's modules: their messages carry [PlaybackSpeed] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/playback-speed/controller.js](#mod-controller-js), [features/playback-speed/index.js](#mod-index-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-native-menu-js"></a>

## features/playback-speed/native-menu.js

> YouTube's own speed controls on the TV app, which it turns off for webOS: the Speed button of the player's controls (switched on in the response that carries it) and the speed options of its Settings menu (a flag YouTube reads off its config objects). A speed picked there reaches the controller through the player's setPlaybackRate, which is wrapped wherever YouTube creates it. Everything here follows `isOn()`: with the feature off, YouTube sees what it would have seen.

152 lines · imports [vendor/playback-speed/mse-hook.js](vendor-playback-speed.md#mod-mse-hook-js) · imported by [features/playback-speed/index.js](#mod-index-js)

<a id="fn-native-menu-js-enablespeedbutton"></a>
**`enableSpeedButton(response)`** · function, exported · L21–45

Switches on the Speed button of a parsed response's transport controls (top level, or under playerOverlays), giving it the command that opens YouTube's speed overlay when it has none. Returns how many buttons it switched on.

- **Called by:** [features/playback-speed/index.js › install](#fn-index-js-install)

<a id="fn-native-menu-js-enablenativespeedmenu"></a>
**`enableNativeSpeedMenu(isOn)`** · function, exported · L52–76

Makes YouTube offer its speed options while `isOn()`: `enableSpeedOptions` reads true on every object that does not set it itself (an object that assigns it keeps its own value). Returns the function that takes it away.

- **Called by:** [features/playback-speed/index.js › install](#fn-index-js-install)

<a id="fn-native-menu-js-wraprate"></a>
**`wrapRate(original, controller)`** · function · L83–100

The player's setPlaybackRate, wrapped: YouTube's own call goes through, and a supported speed other than the current one (a pick from its menu) is passed to the controller, unless it came right after a reload.

- **Called by:** [bindPlayerRate](#fn-native-menu-js-bindplayerrate), [hookRateAssignments](#fn-native-menu-js-hookrateassignments)

<a id="fn-native-menu-js-wraprate-wrapped"></a>
**`wrapRate.wrapped(rate)`** · arrow · L86–97

setPlaybackRate as YouTube calls it, with the pick passed on.

- **Calls:** [vendor/playback-speed/mse-hook.js › isSupportedSpeed](vendor-playback-speed.md#fn-mse-hook-js-issupportedspeed)

<a id="fn-native-menu-js-hookrateassignments"></a>
**`hookRateAssignments(controller)`** · function, exported · L108–136

Wraps setPlaybackRate where YouTube assigns it on a plain object (its player API is built that way): an accessor on Object.prototype catches the assignment and stores the wrapped function as the object's own property. Returns the function that takes the accessor away.

- **Calls:** [wrapRate](#fn-native-menu-js-wraprate)
- **Called by:** [features/playback-speed/index.js › install](#fn-index-js-install)

<a id="fn-native-menu-js-bindplayerrate"></a>
**`bindPlayerRate(player, controller)`** · function, exported · L143–152

Wraps the setPlaybackRate of the player element itself (once), keeping the original for the controller to set the menu's value with. Returns whether it wrapped it now.

- **Calls:** [wrapRate](#fn-native-menu-js-wraprate)
- **Called by:** [features/playback-speed/index.js › install](#fn-index-js-install)
