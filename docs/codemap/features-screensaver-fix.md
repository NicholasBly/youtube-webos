# Code map: features/screensaver-fix/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/screensaver-fix/decoder-stall.js](#mod-decoder-stall-js), [features/screensaver-fix/index.js](#mod-index-js), [features/screensaver-fix/log.js](#mod-log-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js)

<a id="mod-decoder-stall-js"></a>

## features/screensaver-fix/decoder-stall.js

> Frozen video after a video screensaver. When a video sits paused long enough for the TV's screensaver to start, a video screensaver (Aerial, the gallery) can take the hardware decoder from the paused &lt;video> without the page hearing of it. Pressing play then fires 'playing' with data ready, but no frame decodes and the clock stands still, until YouTube's own stall watchdog rebuilds the player some 20 s later. A seek to where the video already is makes the stale pipeline fail at once, and YouTube rebuilds it within a few seconds.
>
> Only a resume after a long pause is checked, once: first plays, short pauses, rebuffering and seeking are left alone, and the nudge's own 'playing' (after the seek) is not checked again, so it cannot loop. A pause or another 'playing' in the meantime cancels a pending check.

75 lines · imports [features/screensaver-fix/log.js](#mod-log-js) · imported by [features/screensaver-fix/index.js](#mod-index-js)

**At load:**

- **Calls:** [onPause](#fn-decoder-stall-js-onpause), [onPlaying](#fn-decoder-stall-js-onplaying)
- **Events:** listens to `pause`, `playing`

<a id="fn-decoder-stall-js-cancelpending"></a>
**`cancelPending()`** · function · L28–32

Drops the check waiting for its moment, if any.

- **Called by:** [onPause](#fn-decoder-stall-js-onpause), [onPlaying](#fn-decoder-stall-js-onplaying)

<a id="fn-decoder-stall-js-onpause"></a>
**`onPause(evt)`** · function · L35–40

A &lt;video> paused: remember when, and drop a check of an earlier resume.

- **Calls:** [cancelPending](#fn-decoder-stall-js-cancelpending)
- **Called by:** [at load](#mod-decoder-stall-js)

<a id="fn-decoder-stall-js-checkfrozen"></a>
**`checkFrozen(video, startTime)`** · function · L46–52

Seeks a resumed video in place when it is still standing still with data ready CHECK_AFTER_MS later.

- **Called by:** [onPlaying](#fn-decoder-stall-js-onplaying)

<a id="fn-decoder-stall-js-onplaying"></a>
**`onPlaying(evt)`** · function · L55–71

A &lt;video> started playing: after a long pause, check that its clock moves.

- **Calls:** [cancelPending](#fn-decoder-stall-js-cancelpending), [checkFrozen](#fn-decoder-stall-js-checkfrozen)
- **Called by:** [at load](#mod-decoder-stall-js)
- **Browser:** `setTimeout`

<a id="mod-index-js"></a>

## features/screensaver-fix/index.js

> Keeps the screensaver off. On webOS it kicks in when the &lt;video> does not fill the screen, so this file resizes the watch-page &lt;video> to the screen whenever its inline style changes; shorts-keep-alive.js handles Shorts, and decoder-stall.js the frozen picture after a video screensaver did run.

177 lines · imports [features/screensaver-fix/decoder-stall.js](#mod-decoder-stall-js), [core/selectors.js](core.md#mod-selectors-js), [core/page-state.js](core.md#mod-page-state-js), [core/dom.js](core.md#mod-dom-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js), [features/screensaver-fix/log.js](#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [readScreenSize](#fn-index-js-readscreensize), [updateState](#fn-index-js-updatestate), [isPlayerHidden](#fn-index-js-isplayerhidden)
- **Events:** listens to `resize`, `ytaf-page-update`, `hashchange`, `DOMContentLoaded`
- **Browser:** `MutationObserver`, `setTimeout`, `requestAnimationFrame`

<a id="fn-index-js-isplayerhidden"></a>
**`isPlayerHidden(video)`** · function · L14–16

Whether YouTube has hidden the &lt;video> (display none, or moved off screen to a negative top).

- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-readscreensize"></a>
**`readScreenSize()`** · function · L29–32

Reads the window size, in px, for the screensaver check.

- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-holdsvideo"></a>
**`holdsVideo(node)`** · arrow · L92–93

The &lt;video> itself, or a subtree mounted with it inside.

- **Called by:** [findWatchVideo](#fn-index-js-findwatchvideo)
- **Browser:** `querySelector`

<a id="fn-index-js-classifypage"></a>
**`classifyPage()`** · function · L101–105

WATCH, SHORTS or OTHER, from the page classes.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage)
- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-unbindvideo"></a>
**`unbindVideo()`** · function · L108–111

Stops following the bound &lt;video>.

- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-findwatchvideo"></a>
**`findWatchVideo()`** · function, async · L114–132

The watch page's &lt;video>, waited for when it has not mounted yet; null when it never does.

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo), [core/dom.js › waitForChildAdd](core.md#fn-dom-js-waitforchildadd), [holdsVideo](#fn-index-js-holdsvideo)
- **Called by:** [bindWatchVideo](#fn-index-js-bindwatchvideo)
- **Selectors:** `PLAYER_CONTAINER`
- **Browser:** `querySelector`

<a id="fn-index-js-bindwatchvideo"></a>
**`bindWatchVideo()`** · function, async · L135–148

Follows the style of the watch page's &lt;video>, once it is there.

- **Calls:** [findWatchVideo](#fn-index-js-findwatchvideo)
- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-updatestate"></a>
**`updateState()`** · function, async · L151–169

The page changed (or the &lt;video> was remounted): the keep-alive and the video binding follow.

- **Calls:** [bindWatchVideo](#fn-index-js-bindwatchvideo), [classifyPage](#fn-index-js-classifypage), [unbindVideo](#fn-index-js-unbindvideo), [features/screensaver-fix/shorts-keep-alive.js › setShortsKeepAlive](#fn-shorts-keep-alive-js-setshortskeepalive)
- **Called by:** [at load](#mod-index-js)

<a id="mod-log-js"></a>

## features/screensaver-fix/log.js

> The logger of the feature's modules: their messages carry [ScreensaverFix] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/screensaver-fix/decoder-stall.js](#mod-decoder-stall-js), [features/screensaver-fix/index.js](#mod-index-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-shorts-keep-alive-js"></a>

## features/screensaver-fix/shorts-keep-alive.js

> On Shorts the player never fills the screen, so a synthetic YELLOW press every 30 s keeps the screensaver away while a video is actually playing.

56 lines · imports [core/selectors.js](core.md#mod-selectors-js), [core/remote.js](core.md#mod-remote-js), [features/screensaver-fix/log.js](#mod-log-js), [core/player-state.js](core.md#mod-player-state-js) · imported by [features/screensaver-fix/index.js](#mod-index-js)

<a id="fn-shorts-keep-alive-js-setshortskeepalive"></a>
**`setShortsKeepAlive(enable)`** · function, exported · L15–56

Starts (or stops) the Shorts keep-alive: every 30 s while a Short plays, a yellow key press keeps the TV's screensaver away.

- **Calls:** [core/remote.js › sendKey](core.md#fn-remote-js-sendkey)
- **Called by:** [features/screensaver-fix/index.js › updateState](#fn-index-js-updatestate)
- **Selectors:** `PLAYER_ID`
- **Browser:** `setInterval`, `setTimeout`
