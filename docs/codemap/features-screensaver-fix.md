# Code map: features/screensaver-fix/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/screensaver-fix/index.js](#mod-index-js), [features/screensaver-fix/log.js](#mod-log-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js)

<a id="mod-index-js"></a>

## features/screensaver-fix/index.js

> Keeps the screensaver off. On webOS it kicks in when the &lt;video> does not fill the screen, so this file resizes the watch-page &lt;video> to the screen whenever its inline style changes; shorts-keep-alive.js handles Shorts.

169 lines · imports [core/selectors.js](core.md#mod-selectors-js), [core/page-state.js](core.md#mod-page-state-js), [core/dom.js](core.md#mod-dom-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js), [features/screensaver-fix/log.js](#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [readScreenSize](#fn-index-js-readscreensize), [updateState](#fn-index-js-updatestate), [isPlayerHidden](#fn-index-js-isplayerhidden)
- **Events:** listens to `resize`, `ytaf-page-update`, `hashchange`, `DOMContentLoaded`
- **Browser:** `MutationObserver`, `setTimeout`, `requestAnimationFrame`

<a id="fn-index-js-isplayerhidden"></a>
**`isPlayerHidden(video)`** · function · L12–14

Whether YouTube has hidden the &lt;video> (display none, or moved off screen to a negative top).

- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-readscreensize"></a>
**`readScreenSize()`** · function · L27–30

Reads the window size, in px, for the screensaver check.

- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-holdsvideo"></a>
**`holdsVideo(node)`** · arrow · L84–85

The &lt;video> itself, or a subtree mounted with it inside.

- **Called by:** [findWatchVideo](#fn-index-js-findwatchvideo)
- **Browser:** `querySelector`

<a id="fn-index-js-classifypage"></a>
**`classifyPage()`** · function · L93–97

WATCH, SHORTS or OTHER, from the page classes.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage)
- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-unbindvideo"></a>
**`unbindVideo()`** · function · L100–103

Stops following the bound &lt;video>.

- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-findwatchvideo"></a>
**`findWatchVideo()`** · function, async · L106–124

The watch page's &lt;video>, waited for when it has not mounted yet; null when it never does.

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo), [core/dom.js › waitForChildAdd](core.md#fn-dom-js-waitforchildadd), [holdsVideo](#fn-index-js-holdsvideo)
- **Called by:** [bindWatchVideo](#fn-index-js-bindwatchvideo)
- **Selectors:** `PLAYER_CONTAINER`
- **Browser:** `querySelector`

<a id="fn-index-js-bindwatchvideo"></a>
**`bindWatchVideo()`** · function, async · L127–140

Follows the style of the watch page's &lt;video>, once it is there.

- **Calls:** [findWatchVideo](#fn-index-js-findwatchvideo)
- **Called by:** [updateState](#fn-index-js-updatestate)

<a id="fn-index-js-updatestate"></a>
**`updateState()`** · function, async · L143–161

The page changed (or the &lt;video> was remounted): the keep-alive and the video binding follow.

- **Calls:** [bindWatchVideo](#fn-index-js-bindwatchvideo), [classifyPage](#fn-index-js-classifypage), [unbindVideo](#fn-index-js-unbindvideo), [features/screensaver-fix/shorts-keep-alive.js › setShortsKeepAlive](#fn-shorts-keep-alive-js-setshortskeepalive)
- **Called by:** [at load](#mod-index-js)

<a id="mod-log-js"></a>

## features/screensaver-fix/log.js

> The logger of the feature's modules: their messages carry [ScreensaverFix] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/screensaver-fix/index.js](#mod-index-js), [features/screensaver-fix/shorts-keep-alive.js](#mod-shorts-keep-alive-js)

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
