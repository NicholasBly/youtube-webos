# Code map: features/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/app-quality-fix.js](#mod-app-quality-fix-js), [features/block-webos-cast-absent.js](#mod-block-webos-cast-absent-js), [features/block-webos-cast.ts](#mod-block-webos-cast-ts), [features/comments-fix.js](#mod-comments-fix-js), [features/lang-settings-fix.ts](#mod-lang-settings-fix-ts), [features/logo-style.js](#mod-logo-style-js), [features/playback-speed-absent.js](#mod-playback-speed-absent-js), [features/playlist-previews.js](#mod-playlist-previews-js), [features/preview-cover-absent.js](#mod-preview-cover-absent-js), [features/preview-cover.js](#mod-preview-cover-js), [features/rows-ahead.js](#mod-rows-ahead-js)

<a id="mod-app-quality-fix-js"></a>

## features/app-quality-fix.js

> Black boxes behind text. When YouTube's server sends the TV force_memory_saving_mode, YouTube puts `app-quality-root` on &lt;body>, and its own stylesheet then swaps the soft text shadows for solid black boxes behind the player's title, channel line and timestamps. The flag is pushed from the server, so it can appear months after install and survives a reinstall.
>
> Taking the class off &lt;body> brings back the normal styling. Only the CSS changes: the rest of YouTube's memory saving is decided in its own code and stays as it is. YouTube rewrites body.className on navigation, so an observer on &lt;body>'s class attribute takes it off again each time.

64 lines · imports [core/config.js](core.md#mod-config-js), [core/dom.js](core.md#mod-dom-js), [core/log.js](core.md#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [sync](#fn-app-quality-fix-js-sync), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener)
- **Settings:** listens to `removeLowMemoryStyle`

<a id="fn-app-quality-fix-js-strip"></a>
**`strip()`** · function · L26–32

Takes the class off &lt;body> if YouTube has put it there.

- **Called by:** [start](#fn-app-quality-fix-js-start)

<a id="fn-app-quality-fix-js-start"></a>
**`start()`** · function · L35–42

Starts stripping the class and watching &lt;body> for it; false while there is no &lt;body> yet.

- **Calls:** [strip](#fn-app-quality-fix-js-strip)
- **Called by:** [sync](#fn-app-quality-fix-js-sync)
- **Browser:** `MutationObserver`

<a id="fn-app-quality-fix-js-stop"></a>
**`stop()`** · function · L45–52

Stops watching and gives YouTube its class back if it had it.

- **Called by:** [sync](#fn-app-quality-fix-js-sync)

<a id="fn-app-quality-fix-js-sync"></a>
**`sync()`** · function · L55–61

Follows the setting: on starts the watch (waiting for &lt;body> if needed), off stops it.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/dom.js › pollUntil](core.md#fn-dom-js-polluntil), [start](#fn-app-quality-fix-js-start), [stop](#fn-app-quality-fix-js-stop)
- **Called by:** [at load](#mod-app-quality-fix-js)
- **Settings:** reads `removeLowMemoryStyle`

<a id="mod-block-webos-cast-absent-js"></a>

## features/block-webos-cast-absent.js

> The legacy build's block-webos-cast.ts (webpack.config.js): webOS 25 runs the webOS 22+ build, so the legacy one never has a cast wake-up to block.

5 lines

<a id="fn-block-webos-cast-absent-js-initblockweboscast"></a>
**`initBlockWebOSCast()`** · function, exported · L5–5

Nothing to install on webOS 3 to 6.

<a id="mod-block-webos-cast-ts"></a>

## features/block-webos-cast.ts

> Fixes webosbrew/youtube-webos/issues/343
>
> Wraps window.fetch itself rather than listening on the FetchRegistry: a registry listener takes every request of the app through the hooked path (a URL object and an event per call), while this is one string check.

45 lines · imports [core/log.js](core.md#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="fn-block-webos-cast-ts-iscastwakeup"></a>
**`isCastWakeUp(url)`** · function · L16–21

Whether `url` ends its path with the cast wake-up (followed by nothing, a query or a hash).

- **Called by:** [initBlockWebOSCast](#fn-block-webos-cast-ts-initblockweboscast)

<a id="fn-block-webos-cast-ts-initblockweboscast"></a>
**`initBlockWebOSCast()`** · function, exported · L27–45

Wraps window.fetch so the request that wakes webOS's cast receiver fails like a network error; every other request passes through.

- **Calls:** [isCastWakeUp](#fn-block-webos-cast-ts-iscastwakeup)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Hooks:** `window.fetch`

<a id="mod-comments-fix-js"></a>

## features/comments-fix.js

> Comments panel fix - https://github.com/NicholasBly/youtube-webos/issues/188
>
> Bug (YouTube-side, also happens on the stock app, started late Sept 2026): pressing Back on the comments panel adds a "closing" class to &lt;ytlr-animated-overlay> (currently `frHKed`). YouTube's CSS for that class collapses the panel contents to 0x0 immediately, but the comment list stays mounted for ~350ms while the close animation runs. The list watches its rows with a ResizeObserver, so it records every row as 0 tall and saves that into the per-video list state. Reopening restores that state: all rows stack at the top with height 0 and arrow-key navigation gets stuck.
>
> The same thing happens to the Description panel, which uses the same overlay.
>
> Fix: for every YouTube CSS rule tied to the closing classes that hides or zero-sizes something, add an override that keeps the element laid out but invisible. The panel looks the same while it closes, the ResizeObserver never sees 0, and the saved state keeps the real heights.
>
> The closing class is ALSO briefly present while a panel opens, and the Description panel's rows are built and measured during that moment - so the override has to be in place before the first panel ever opens. The rules are found by scanning the stylesheets at startup (every second while the set of stylesheets still changes, for at most STARTUP_MAX_TRIES), with a scan on panel focus as a backstop. A broad fallback is used until the real rule is found.
>
> The closing classes, the overlay and the panel are in core/selectors.js (PANEL_CLOSING_CLASSES, ANIMATED_OVERLAY, OVERLAY_PANEL).

194 lines · imports [core/log.js](core.md#mod-log-js), [core/selectors.js](core.md#mod-selectors-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [onFocusIn](#fn-comments-fix-js-onfocusin), [startupScan](#fn-comments-fix-js-startupscan)
- **Events:** listens to `focusin`
- **Selectors:** `PANEL_CLOSING_CLASSES`, `ANIMATED_OVERLAY`, `OVERLAY_PANEL`, `ENGAGEMENT_PANEL_LIST`

<a id="fn-comments-fix-js-iszero"></a>
**`isZero(v)`** · function · L51–53

Whether a CSS length is zero ('0', '0px' or '0rem').

- **Called by:** [collapses](#fn-comments-fix-js-collapses)

<a id="fn-comments-fix-js-collapses"></a>
**`collapses(rule)`** · function · L56–68

Whether a style rule's selector names a closing class and its style collapses the element.

- **Calls:** [isZero](#fn-comments-fix-js-iszero)
- **Called by:** [findCollapsingSelectors.walk](#fn-comments-fix-js-findcollapsingselectors-walk)
- **Selectors:** `PANEL_CLOSING_CLASSES`

<a id="fn-comments-fix-js-findcollapsingselectors"></a>
**`findCollapsingSelectors()`** · function · L71–108

The selectors of every collapsing rule in every stylesheet, tested as they are met.

- **Calls:** [findCollapsingSelectors.walk](#fn-comments-fix-js-findcollapsingselectors-walk)
- **Called by:** [applyFix](#fn-comments-fix-js-applyfix)

<a id="fn-comments-fix-js-findcollapsingselectors-walk"></a>
**`findCollapsingSelectors.walk(list)`** · arrow · L78–88

Collects the selectors of the rules that collapse a closing panel, descending into @media and @supports blocks.

- **Calls:** [collapses](#fn-comments-fix-js-collapses)
- **Called by:** [findCollapsingSelectors](#fn-comments-fix-js-findcollapsingselectors)

<a id="fn-comments-fix-js-applyfix"></a>
**`applyFix(fromStartup)`** · function · L115–148

Writes the override that keeps a closing comments or description panel laid out but invisible, for the rules the scan found (a broad fallback rule while none are); a scan triggered by focus counts toward MAX_SCANS.

- **Calls:** [findCollapsingSelectors](#fn-comments-fix-js-findcollapsingselectors)
- **Called by:** [onFocusIn](#fn-comments-fix-js-onfocusin), [startupScan](#fn-comments-fix-js-startupscan)

<a id="fn-comments-fix-js-onfocusin"></a>
**`onFocusIn(e)`** · function · L159–167

Runs the scan when the focus enters the comments panel; removes itself once the rules are found or the scans are used up.

- **Calls:** [applyFix](#fn-comments-fix-js-applyfix)
- **Called by:** [at load](#mod-comments-fix-js)

<a id="fn-comments-fix-js-startupscan"></a>
**`startupScan()`** · function · L182–191

Scans at start-up and again every STARTUP_RETRY_MS until the rules are found or the stylesheets stop changing.

- **Calls:** [applyFix](#fn-comments-fix-js-applyfix)
- **Called by:** [at load](#mod-comments-fix-js)
- **Browser:** `setTimeout`

<a id="mod-lang-settings-fix-ts"></a>

## features/lang-settings-fix.ts

> Adapted from https://github.com/reisxd/TizenTube/blob/522f83cc012d5b1c75181b651e084a3afa280323/mods/resolveCommand.js

57 lines · imports [hooks/resolve-command.ts](hooks.md#mod-resolve-command-ts), [core/log.js](core.md#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [hooks/resolve-command.ts › ResolveCommandRegistry.getInstance](hooks.md#fn-resolve-command-ts-resolvecommandregistry-getinstance), [hook](#fn-lang-settings-fix-ts-hook)

<a id="fn-lang-settings-fix-ts-getprefscookie"></a>
**`getPrefsCookie()`** · function · L9–17

YouTube's PREF cookie as URLSearchParams (empty when there is none).

- **Called by:** [hook](#fn-lang-settings-fix-ts-hook)

<a id="fn-lang-settings-fix-ts-hook"></a>
**`hook(resolveCommand, payload, extra)`** · arrow · L20–51

Called only for a command that has the key (hooks/resolve-command.ts).

- **Calls:** [getPrefsCookie](#fn-lang-settings-fix-ts-getprefscookie)
- **Called by:** [at load](#mod-lang-settings-fix-ts)

<a id="mod-logo-style-js"></a>

## features/logo-style.js

> YouTube wordmark selection (Interface -> YouTube Logo).
>
> YouTube ships two wordmarks and picks between them by account status:
>
> premium  .../livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png default  .../livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png
>
> Default leaves the header as YouTube draws it. Premium and Hidden are a class on &lt;html> that logo-style.css keys its rules on, never writes to the element: YouTube builds the header again after the profile picker and when the app comes back from the background, and a new header takes the rules as it is drawn, where styles written on the old element were lost with it (issue #214). The rules are !important, which outranks the inline left, width and background-image YouTube draws the logo with.

39 lines · imports [core/config.js](core.md#mod-config-js) · imported by [userScript.js](app.md#mod-userscript-js)

<a id="fn-logo-style-js-applylogostyle"></a>
**`applyLogoStyle()`** · function · L27–33

Sets the class of the configured style on &lt;html>, and takes the others off.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [initLogoStyle](#fn-logo-style-js-initlogostyle)
- **Settings:** reads `logoStyle`

<a id="fn-logo-style-js-initlogostyle"></a>
**`initLogoStyle()`** · function, exported · L36–39

Applies the YouTube Logo setting, and follows it.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [applyLogoStyle](#fn-logo-style-js-applylogostyle)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Settings:** listens to `logoStyle`

<a id="mod-playback-speed-absent-js"></a>

## features/playback-speed-absent.js

> What the legacy build (webOS 3 to 6) has in place of features/playback-speed (webpack.config.js): the speed engine needs WebCodecs, which none of those TVs have, so the shortcuts only say so and the panel shows no row.

15 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js)

<a id="fn-playback-speed-absent-js-stepspeed"></a>
**`stepSpeed()`** · function, exported · L10–12

The Playback Speed + and - shortcuts: says the TV cannot.

- **Calls:** [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="fn-playback-speed-absent-js-resetspeed"></a>
**`resetSpeed()`** · function, exported · L15–15

The Playback Speed 1x shortcut: nothing to reset.

<a id="mod-playlist-previews-js"></a>

## features/playlist-previews.js

> Playlist pages play no tile preview. YouTube sends a preview command (startInlinePlaybackCommand) for each row of a playlist page too, Watch Later and every other VL... list, but the TV app does not put the player on the row there: the preview played full screen behind the page, heard and not seen while the row's time counted down, and opened the video by itself after 39 s (NicholasBly/youtube-webos#227, and #221's playlist report). Home, search and Subscriptions keep their previews. Seen and fixed on a webOS 25 TV by foxi69 (foxi69/youtube-webos 94efeb3), whose response shapes the tests use.
>
> Called by the JSON.parse hook on every response, whatever the settings: a few property reads, and a walk of the rows only on a playlist page. Should YouTube move the list, the previews come back and nothing else changes.

38 lines · imports [core/innertube.js](core.md#mod-innertube-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js)

<a id="fn-playlist-previews-js-dropplaylistrowpreviews"></a>
**`dropPlaylistRowPreviews(data)`** · function, exported · L23–38

Takes the preview command off every row of the playlist in `data`, and the row's focus command with it when that was all it held. Returns how many rows lost one.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)

<a id="mod-preview-cover-absent-js"></a>

## features/preview-cover-absent.js

> The legacy build's preview-cover.js (webpack.config.js): the fix is for webOS 22 and newer, where the black tile previews were reported, so webOS 3 to 6 have neither the listeners nor the switch.

6 lines

<a id="mod-preview-cover-js"></a>

## features/preview-cover.js

> Fix Black Tile Previews (webOS 22 and newer; the legacy build has preview-cover-absent.js). A tile preview does not play inside the tile: YouTube's one shared player is scaled down onto it, \*behind\* the browse page. webOS puts decoded video on a hardware plane under the page, so anything the page paints over that spot covers the picture while the sound plays: on some TVs (an LG C2, C4 and CS among them) a preview was sound over a black tile (NicholasBly/youtube-webos#221).
>
> While a preview plays, the elements stacked over the middle of its video that paint a background or are an image lose that paint (a class, see preview-cover.css), and get it back when it stops, the page changes or the setting goes off. Layout and the focus ring's shadow are untouched. The stack is looked up when the preview starts, when the focus moves, a transition around the video ends or the window resizes (once per frame however many events), and every RESCAN_MS while it plays, for layers YouTube recycles. A TV whose previews already show finds nothing to clear.
>
> From foxi69/youtube-webos#156 (diagnosed on a TV in foxi69/youtube-webos#67), ported in NicholasBly/youtube-webos#229 by valentinBoch, who confirmed the picture on an affected TV. GPL-3.0, as this project.

153 lines · imports [core/config.js](core.md#mod-config-js), [core/page-state.js](core.md#mod-page-state-js), [core/webos.js](core.md#mod-webos-js) · imported by [ui/panel/pages.js](ui-panel.md#mod-pages-js), [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion), [queueRefresh](#fn-preview-cover-js-queuerefresh), [follow](#fn-preview-cover-js-follow), [stop](#fn-preview-cover-js-stop), [sync](#fn-preview-cover-js-sync), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener)
- **Settings:** listens to `clearPreviewCover`
- **Events:** listens to `focusin`, `resize`, `transitionend`, `playing`, `ytaf-page-update`

<a id="fn-preview-cover-js-updatecover"></a>
**`updateCover(next)`** · function · L34–38

Restore the elements that are no longer above the current preview.

- **Called by:** [refresh](#fn-preview-cover-js-refresh), [stop](#fn-preview-cover-js-stop)

<a id="fn-preview-cover-js-stop"></a>
**`stop()`** · function · L41–48

Stop sampling when playback stops, the element is removed, or the page changes.

- **Calls:** [updateCover](#fn-preview-cover-js-updatecover)
- **Called by:** [at load](#mod-preview-cover-js), [refresh](#fn-preview-cover-js-refresh), [sync](#fn-preview-cover-js-sync)

<a id="fn-preview-cover-js-paints"></a>
**`paints(el)`** · function · L51–59

Can this element's own paint cover a hardware video plane?

- **Called by:** [refresh](#fn-preview-cover-js-refresh)
- **Browser:** `getComputedStyle`

<a id="fn-preview-cover-js-previewstack"></a>
**`previewStack(x, y)`** · function · L62–71

Hit-test decoration too, without changing the pointer target of any user event.

- **Called by:** [refresh](#fn-preview-cover-js-refresh)

<a id="fn-preview-cover-js-refresh"></a>
**`refresh()`** · function · L74–91

Follow tile recycling, clearing only layers in front of the playing video.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [paints](#fn-preview-cover-js-paints), [previewStack](#fn-preview-cover-js-previewstack), [stop](#fn-preview-cover-js-stop), [updateCover](#fn-preview-cover-js-updatecover)
- **Called by:** [follow](#fn-preview-cover-js-follow), [queueRefresh](#fn-preview-cover-js-queuerefresh)
- **Browser:** `getBoundingClientRect`

<a id="fn-preview-cover-js-queuerefresh"></a>
**`queueRefresh()`** · function · L94–100

Coalesce navigation events into one hit-test after the layout settles.

- **Calls:** [refresh](#fn-preview-cover-js-refresh)
- **Called by:** [at load](#mod-preview-cover-js), [follow](#fn-preview-cover-js-follow)
- **Browser:** `requestAnimationFrame`

<a id="fn-preview-cover-js-follow"></a>
**`follow(video)`** · function · L103–109

Start following an already-playing inline video or the one that just started.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [queueRefresh](#fn-preview-cover-js-queuerefresh), [refresh](#fn-preview-cover-js-refresh)
- **Called by:** [at load](#mod-preview-cover-js), [sync](#fn-preview-cover-js-sync)
- **Settings:** reads `clearPreviewCover`
- **Browser:** `setInterval`

<a id="fn-preview-cover-js-sync"></a>
**`sync()`** · function · L112–121

Handle changes of page or setting without requiring a new playing event.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [follow](#fn-preview-cover-js-follow), [stop](#fn-preview-cover-js-stop)
- **Called by:** [at load](#mod-preview-cover-js)
- **Settings:** reads `clearPreviewCover`
- **Browser:** `querySelectorAll`

<a id="mod-rows-ahead-js"></a>

## features/rows-ahead.js

> Rows loaded ahead. The app asks for the next rows of a vertical list (the home feed, a browse tab, search results) once fewer rows than a threshold are left below the focused one: the response's own nextContinuationData.autoloadThresholdItemsFromEnd when above 0, else the section_list_continuation_threshold flag, else 3. YouTube sends the flag as 1, so the next rows are asked for only on the last row, and a quick run down the home screen reaches rows that have not arrived. The response's value outranks the flag, so the parse hook raises it on every section list a response carries. Load Rows Ahead in the settings (on by default) switches the pass, in adblock/parse-hook.js. A list filled on visibility (autoloadEnabled with autoloadOnVisible) does not read the threshold; the counters below say whether the TV is ever sent one.

91 lines · imports [core/innertube.js](core.md#mod-innertube-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js)

**At load:**

- **Calls:** [listAt](#fn-rows-ahead-js-listat)
- **Hooks:** `window.__ytafContinuationStats`

<a id="fn-rows-ahead-js-listat"></a>
**`listAt(contentsPath)`** · arrow · L32–32

The section list itself: the content paths of core/innertube.js end at its contents.

- **Called by:** [at load](#mod-rows-ahead-js)

<a id="fn-rows-ahead-js-raiselist"></a>
**`raiseList(list)`** · function · L44–62

Raises each continuation of a list to load ROWS_AHEAD items before the end (never lowers it), recording what YouTube sent.

- **Called by:** [raiseRowsAhead](#fn-rows-ahead-js-raiserowsahead), [raiseTabs](#fn-rows-ahead-js-raisetabs)

<a id="fn-rows-ahead-js-raisetabs"></a>
**`raiseTabs(sections)`** · function · L65–77

Each tab of every section of a browse-tabs response, in either content shape.

- **Calls:** [raiseList](#fn-rows-ahead-js-raiselist)
- **Called by:** [raiseRowsAhead](#fn-rows-ahead-js-raiserowsahead)

<a id="fn-rows-ahead-js-raiserowsahead"></a>
**`raiseRowsAhead(data, type)`** · function, exported · L80–91

Raises the threshold on every section list of a response of `type` (core/innertube.js).

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [raiseList](#fn-rows-ahead-js-raiselist), [raiseTabs](#fn-rows-ahead-js-raisetabs)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)
