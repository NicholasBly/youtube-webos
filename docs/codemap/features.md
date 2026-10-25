# Code map: features/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/block-webos-cast-absent.js](#mod-block-webos-cast-absent-js), [features/block-webos-cast.ts](#mod-block-webos-cast-ts), [features/comments-fix.js](#mod-comments-fix-js), [features/lang-settings-fix.ts](#mod-lang-settings-fix-ts), [features/logo-style.js](#mod-logo-style-js), [features/rows-ahead.js](#mod-rows-ahead-js)

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

> YouTube wordmark selection.
>
> YouTube ships two wordmarks and picks between them by account status:
>
> premium  .../livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png default  .../livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png
>
> They are different widths, and the header positions the element with an absolute `left` that is calculated from that width, so swapping the image alone leaves it misaligned. Both values are set together.
>
> Applied once: the element is rendered by the app shell rather than per page, so navigating or watching a video does not revert it. A short bounded wait, then the page changes, cover a shell that has not painted yet; nothing is left listening once it is applied.

99 lines · imports [core/config.js](core.md#mod-config-js), [core/dom.js](core.md#mod-dom-js), [core/selectors.js](core.md#mod-selectors-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Selectors:** `LOGO`, `THUMBNAIL_TILE`

<a id="fn-logo-style-js-applytoelement"></a>
**`applyToElement(logo, style)`** · function · L49–61

Applies a logo style to one header logo (image, position, width), writing only what differs; false when the logo has no image yet.

- **Called by:** [applyLogoStyle](#fn-logo-style-js-applylogostyle)
- **Selectors:** `THUMBNAIL_TILE`
- **Browser:** `querySelector`

<a id="fn-logo-style-js-applylogostyle"></a>
**`applyLogoStyle()`** · function · L64–72

Apply the configured style now, if the header exists yet.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [applyToElement](#fn-logo-style-js-applytoelement)
- **Called by:** [initLogoStyle](#fn-logo-style-js-initlogostyle), [initLogoStyle.onPageUpdate](#fn-logo-style-js-initlogostyle-onpageupdate)
- **Settings:** reads `logoStyle`
- **Selectors:** `LOGO`
- **Browser:** `querySelector`

<a id="fn-logo-style-js-initlogostyle"></a>
**`initLogoStyle()`** · function, exported · L78–99

Applies the YouTube Logo setting now or, while the header is not painted yet, by a short poll and then on every page change until it takes; follows the setting.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/dom.js › pollUntil](core.md#fn-dom-js-polluntil), [applyLogoStyle](#fn-logo-style-js-applylogostyle), [initLogoStyle.onPageUpdate](#fn-logo-style-js-initlogostyle-onpageupdate)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Settings:** listens to `logoStyle`
- **Events:** listens to `ytaf-page-update`

<a id="fn-logo-style-js-initlogostyle-onpageupdate"></a>
**`initLogoStyle.onPageUpdate()`** · arrow · L86–88

The app shell may not have painted yet: a short poll, and past it every page change tries again (an account picked late, a slow cold start) until one applies, rather than a MutationObserver on the document for the life of the session.

- **Calls:** [applyLogoStyle](#fn-logo-style-js-applylogostyle)
- **Called by:** [initLogoStyle](#fn-logo-style-js-initlogostyle)

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
