# Code map: features/watch/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/watch/index.js](#mod-index-js)

<a id="mod-index-js"></a>

## features/watch/index.js

> The clock in the top right corner (Display Time in UI).
>
> On the watch page it comes and goes with YouTube's own player UI. YouTube switches between the video alone and the video with its controls by setting hybridnavfocusable="true" on the player shell (ytlr-watch-default) while the video holds the focus; the clock watches that attribute with a MutationObserver, so it changes in the same task YouTube does, and fades with the timing YouTube's controls fade with (read from their computed transition once per player). Focus, player-state and page events cover the rest: a side panel opening over the player, the focus resting on the player itself or nowhere, and a player that mounts after the page changes.
>
> The clock stays a child of &lt;body>: YouTube re-renders its own elements and drops nodes it did not create, and a fixed element inside a transformed ancestor would lose its place in the corner.

294 lines · imports [core/config.js](core.md#mod-config-js), [core/dom.js](core.md#mod-dom-js), [core/disposables.js](core.md#mod-disposables-js), [core/player-state.js](core.md#mod-player-state-js), [core/page-state.js](core.md#mod-page-state-js), [core/log.js](core.md#mod-log-js), [core/selectors.js](core.md#mod-selectors-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [toggleWatch](#fn-index-js-togglewatch), [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener)
- **Settings:** reads `showWatch`; listens to `showWatch`
- **Selectors:** `WATCH_PLAYER`

<a id="fn-index-js-createtimeformatter"></a>
**`createTimeFormatter()`** · function · L46–54

Hours and minutes in the TV's language. Intl is in Chrome 24+, so webOS 3 has it; a language tag Intl refuses (a POSIX suffix such as "en-US@posix") would throw and leave no clock at all, so it falls back to the default locale.

- **Called by:** [Watch.startClock](#fn-index-js-watch-startclock)

<a id="fn-index-js-listitems"></a>
**`listItems(value)`** · function · L57–59

The comma-separated items of a computed transition longhand; parentheses keep their commas.

- **Called by:** [readPlayerFade](#fn-index-js-readplayerfade)

<a id="fn-index-js-readplayerfade"></a>
**`readPlayerFade(player)`** · function · L66–88

YouTube's own fade for its player UI: the first opacity (or all) transition on the controls, the player shadow, or an ancestor of either up to the player shell. '' when none of them has one (or they are not rendered yet).

- **Calls:** [listItems](#fn-index-js-listitems)
- **Called by:** [Watch.onPlayerToggle](#fn-index-js-watch-onplayertoggle)
- **Selectors:** `CONTROLS`, `PLAYER_SHADOWS`
- **Browser:** `querySelector`, `getComputedStyle`

<a id="fn-index-js-watch-constructor"></a>
**`Watch.constructor()`** · method · L95–118

The clock: builds the element, starts the minute ticks and the listeners, and adds it to the page.

- **Calls:** [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [core/dom.js › debounce](core.md#fn-dom-js-debounce), [Watch.createClock](#fn-index-js-watch-createclock), [Watch.observePlayer](#fn-index-js-watch-observeplayer), [Watch.setupGlobalListeners](#fn-index-js-watch-setupgloballisteners), [Watch.startClock](#fn-index-js-watch-startclock), [Watch.updateVisibility](#fn-index-js-watch-updatevisibility)
- **Called by:** [toggleWatch](#fn-index-js-togglewatch)

<a id="fn-index-js-watch-createclock"></a>
**`Watch.createClock()`** · method · L121–126

The clock element; its look comes from watch.css and the theme classes on &lt;html>.

- **Called by:** [Watch.constructor](#fn-index-js-watch-constructor)

<a id="fn-index-js-watch-startclock"></a>
**`Watch.startClock()`** · method · L132–159

Shows the time now and at the start of every minute, and again when the app returns to the foreground.

- **Calls:** [Watch.startClock.setTime](#fn-index-js-watch-startclock-settime), [Watch.startClock.tick](#fn-index-js-watch-startclock-tick), [createTimeFormatter](#fn-index-js-createtimeformatter)
- **Called by:** [Watch.constructor](#fn-index-js-watch-constructor)
- **Events:** listens to `visibilitychange`

<a id="fn-index-js-watch-startclock-settime"></a>
**`Watch.startClock.setTime()`** · arrow · L137–141

Its timer and listener go with the bag, before the element: no tick runs after destroy().

- **Calls:** [Watch.updateVisibility](#fn-index-js-watch-updatevisibility)
- **Called by:** [Watch.startClock](#fn-index-js-watch-startclock), [Watch.startClock.tick](#fn-index-js-watch-startclock-tick)

<a id="fn-index-js-watch-startclock-tick"></a>
**`Watch.startClock.tick()`** · arrow · L149–152

Shows the time, then aims the next tick at the next whole minute.

- **Calls:** [Watch.startClock.setTime](#fn-index-js-watch-startclock-settime)
- **Called by:** [Watch.startClock](#fn-index-js-watch-startclock)
- **Browser:** `setTimeout`

<a id="fn-index-js-watch-observeplayer"></a>
**`Watch.observePlayer(player)`** · method · L162–175

Watches `player`'s focus attribute (null: none), reading the fade again for a new one.

- **Calls:** [Watch.onPlayerToggle](#fn-index-js-watch-onplayertoggle)
- **Called by:** [Watch.constructor](#fn-index-js-watch-constructor), [Watch.updateVisibility](#fn-index-js-watch-updatevisibility)
- **Browser:** `MutationObserver`

<a id="fn-index-js-watch-onplayertoggle"></a>
**`Watch.onPlayerToggle()`** · method · L178–194

YouTube showed or hid its player UI: follow it now, with its fade.

- **Calls:** [Watch.isOverlayOpen](#fn-index-js-watch-isoverlayopen), [Watch.setHidden](#fn-index-js-watch-sethidden), [readPlayerFade](#fn-index-js-readplayerfade)
- **Called by:** [Watch.observePlayer](#fn-index-js-watch-observeplayer)

<a id="fn-index-js-watch-isoverlayopen"></a>
**`Watch.isOverlayOpen()`** · method · L197–202

Whether a side panel (description, comments, save) is open over the player.

- **Called by:** [Watch.onPlayerToggle](#fn-index-js-watch-onplayertoggle), [Watch.updateVisibility](#fn-index-js-watch-updatevisibility)
- **Selectors:** `OVERLAY_PANEL`
- **Browser:** `querySelector`

<a id="fn-index-js-watch-sethidden"></a>
**`Watch.setHidden(hidden)`** · method · L205–209

Hides or shows the clock (a class, so the fade applies).

- **Called by:** [Watch.onPlayerToggle](#fn-index-js-watch-onplayertoggle), [Watch.updateVisibility](#fn-index-js-watch-updatevisibility)

<a id="fn-index-js-watch-updatevisibility"></a>
**`Watch.updateVisibility()`** · method · L215–233

Decides the visibility from scratch: shown off the watch page; on it, hidden while the video alone is showing, the player or nothing holds the focus, or a side panel is open.

- **Calls:** [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [Watch.isOverlayOpen](#fn-index-js-watch-isoverlayopen), [Watch.observePlayer](#fn-index-js-watch-observeplayer), [Watch.setHidden](#fn-index-js-watch-sethidden)
- **Called by:** [Watch.constructor](#fn-index-js-watch-constructor), [Watch.startClock.setTime](#fn-index-js-watch-startclock-settime)
- **Selectors:** `WATCH_PLAYER`
- **Browser:** `querySelector`

<a id="fn-index-js-watch-setupgloballisteners"></a>
**`Watch.setupGlobalListeners()`** · method · L239–264

Re-decides the visibility (debounced) on play, pause and a new video, on every focus change, and on a page change (with the cached elements dropped).

- **Called by:** [Watch.constructor](#fn-index-js-watch-constructor)
- **Events:** listens to `yt-player-state-change`, `focusin`, `ytaf-page-update`

<a id="fn-index-js-watch-destroy"></a>
**`Watch.destroy()`** · method · L267–273

Removes the clock, its timer and its listeners.

<a id="fn-index-js-togglewatch"></a>
**`toggleWatch(show)`** · function · L279–288

Creates or destroys the clock to match Display Time in UI.

- **Calls:** [Watch.constructor](#fn-index-js-watch-constructor)
- **Called by:** [at load](#mod-index-js)
