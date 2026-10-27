# Code map: features/dearrow/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/dearrow/constants.js](#mod-constants-js), [features/dearrow/formatter-absent.js](#mod-formatter-absent-js), [features/dearrow/formatter.js](#mod-formatter-js), [features/dearrow/index.js](#mod-index-js), [features/dearrow/log.js](#mod-log-js), [features/dearrow/lookup.js](#mod-lookup-js), [features/dearrow/state.js](#mod-state-js), [features/dearrow/sweep.js](#mod-sweep-js), [features/dearrow/thumbs.js](#mod-thumbs-js), [features/dearrow/tiles.js](#mod-tiles-js), [features/dearrow/titles.js](#mod-titles-js)

<a id="mod-constants-js"></a>

## features/dearrow/constants.js

> DeArrow's servers, limits and timings (features/dearrow).

70 lines · imported by [features/dearrow/index.js](#mod-index-js), [features/dearrow/lookup.js](#mod-lookup-js), [features/dearrow/sweep.js](#mod-sweep-js), [features/dearrow/thumbs.js](#mod-thumbs-js), [features/dearrow/tiles.js](#mod-tiles-js)

**At load:**

- **Settings:** uses `enableDeArrow`, `dearrowCrowdTitles`, `dearrowTitleFormatting`, `dearrowCleanEmojis`, `dearrowCrowdThumbnails`, `dearrowThumbnailFallback`, `dearrowShowBadge`, `upgradeThumbnails`, `thumbnailQualityMode`

<a id="mod-formatter-absent-js"></a>

## features/dearrow/formatter-absent.js

> What the legacy build (webOS 3 to 6) has in place of formatter.js (webpack.config.js): no title formatting, so the panel shows no formatting rows and titles keep the case they were written in. The one thing the formatter does to every title is kept: a submitter's ">" before a word (which tells the formatter to leave that word alone) is taken out.

19 lines

<a id="fn-formatter-absent-js-formattitleinternal"></a>
**`formatTitleInternal(title)`** · function, exported · L17–19

The title with the ">" markers taken out and the ends trimmed, as the formatter's own unformatted path leaves it (cleanUnformattedTitle).

<a id="mod-formatter-js"></a>

## features/dearrow/formatter.js

> DeArrow's title formatter (src/vendor/dearrow, GPL-3.0), as the feature uses it. The legacy build has formatter-absent.js in its place (webpack.config.js): the formatter is 48 KiB there, and of the TVs that build runs on only webOS 5 and 6 could use it.

13 lines · imports [vendor/dearrow/shim.js](vendor-dearrow.md#mod-shim-js) · imported by [features/dearrow/titles.js](#mod-titles-js)

<a id="mod-index-js"></a>

## features/dearrow/index.js

> DeArrow (https://dearrow.ajay.app): crowdsourced titles and thumbnails in place of clickbait ones, on the tiles of shelves and grids. Off by default; its own page in the options panel.
>
> A branding lookup takes a request per video, which the JSON.parse hook cannot wait for, so it works in two halves: 1. applyDeArrow() runs in the parse hook (adblock/parse-hook.js) and writes what is already decided into every tile of the response, so those render right the first time; videos not seen before are queued for a lookup (lookup.js). 2. When a lookup lands, the tiles already on screen are patched (sweep.js). Tiles are rebuilt as the user moves around, so the sweep also follows every parse and key press. What is shown follows the extension: the top title or thumbnail unless it is the original or voted below zero (a locked one always wins), with the extension's own title formatter (src/vendor/dearrow).

121 lines · imports [core/config.js](core.md#mod-config-js), [features/dearrow/constants.js](#mod-constants-js), [features/dearrow/state.js](#mod-state-js), [features/dearrow/thumbs.js](#mod-thumbs-js), [features/dearrow/tiles.js](#mod-tiles-js), [features/dearrow/sweep.js](#mod-sweep-js), [features/dearrow/lookup.js](#mod-lookup-js), [features/dearrow/log.js](#mod-log-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js)

**At load:**

- **Calls:** [features/dearrow/lookup.js › setChangeHandler](#fn-lookup-js-setchangehandler), [features/dearrow/tiles.js › applyToVideo](#fn-tiles-js-applytovideo), [scheduleSweep](#fn-index-js-schedulesweep), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [onSettingsChange](#fn-index-js-onsettingschange)
- **Events:** listens to `keydown`

<a id="fn-index-js-cancelsweep"></a>
**`cancelSweep()`** · function · L31–34

Drops the sweep waiting for its moment.

- **Called by:** [restoreTiles](#fn-index-js-restoretiles)

<a id="fn-index-js-schedulesweep"></a>
**`scheduleSweep()`** · function · L37–43

Sweeps the rendered tiles SWEEP_DELAY from now, once however often it is asked.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [features/dearrow/sweep.js › sweepTiles](#fn-sweep-js-sweeptiles)
- **Called by:** [at load](#mod-index-js), [applyDeArrow](#fn-index-js-applydearrow)
- **Settings:** reads `enableDeArrow`
- **Browser:** `setTimeout`

<a id="fn-index-js-restoretiles"></a>
**`restoreTiles()`** · function · L46–49

Puts YouTube's own titles and thumbnails back on screen; a pending sweep would undo it.

- **Calls:** [cancelSweep](#fn-index-js-cancelsweep), [features/dearrow/sweep.js › sweepTiles](#fn-sweep-js-sweeptiles)
- **Called by:** [onSettingsChange](#fn-index-js-onsettingschange), [wipe](#fn-index-js-wipe)

<a id="fn-index-js-wipe"></a>
**`wipe()`** · function · L56–64

Forgets everything (too many videos remembered): originals back on screen and in the stored responses while they are still known, then the videos, the queue and the thumbnails.

- **Calls:** [restoreTiles](#fn-index-js-restoretiles), [features/dearrow/lookup.js › clearQueue](#fn-lookup-js-clearqueue), [features/dearrow/state.js › nextGeneration](#fn-state-js-nextgeneration), [features/dearrow/thumbs.js › forgetThumbs](#fn-thumbs-js-forgetthumbs), [features/dearrow/tiles.js › unpatchResponses](#fn-tiles-js-unpatchresponses)
- **Called by:** [applyDeArrow](#fn-index-js-applydearrow)

<a id="fn-index-js-applydearrow"></a>
**`applyDeArrow(data, responseType)`** · function, exported · L72–80

The parse hook's step (adblock/parse-hook.js) for an InnerTube response: its video tiles get what is decided, new videos are queued for a lookup, and the rendered tiles are swept a moment later. Player responses carry no tiles and are skipped.

- **Calls:** [scheduleSweep](#fn-index-js-schedulesweep), [wipe](#fn-index-js-wipe), [features/dearrow/lookup.js › queueLookups](#fn-lookup-js-queuelookups), [features/dearrow/thumbs.js › thumbsFull](#fn-thumbs-js-thumbsfull), [features/dearrow/tiles.js › patchResponseTiles](#fn-tiles-js-patchresponsetiles)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)

<a id="fn-index-js-onsettingschange"></a>
**`onSettingsChange()`** · function · L87–101

A DeArrow setting changed: everything is decided again (answers already fetched are reused), newest first, since those are the videos likely on screen; turned off, YouTube's own come back everywhere.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [restoreTiles](#fn-index-js-restoretiles), [features/dearrow/lookup.js › clearQueue](#fn-lookup-js-clearqueue), [features/dearrow/lookup.js › queueLookups](#fn-lookup-js-queuelookups), [features/dearrow/state.js › nextGeneration](#fn-state-js-nextgeneration), [features/dearrow/tiles.js › unpatchResponses](#fn-tiles-js-unpatchresponses)
- **Called by:** [at load](#mod-index-js)
- **Settings:** reads `enableDeArrow`

<a id="mod-log-js"></a>

## features/dearrow/log.js

> The logger of the feature's modules: their messages carry [DeArrow] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/dearrow/index.js](#mod-index-js), [features/dearrow/lookup.js](#mod-lookup-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-lookup-js"></a>

## features/dearrow/lookup.js

> Asking DeArrow about videos and deciding what their tiles show: a queue of lookups (four at a time, in screen order), the branding answer per video, then the title and the thumbnail, with each improvement handed to the sweep. A random frame can take the thumbnail server tens of seconds to render, so YouTube's auto-generated start frame stands in until it does, as in the extension.

195 lines · imports [core/config.js](core.md#mod-config-js), [core/fetch-timeout.js](core.md#mod-fetch-timeout-js), [features/dearrow/constants.js](#mod-constants-js), [features/dearrow/state.js](#mod-state-js), [features/dearrow/thumbs.js](#mod-thumbs-js), [features/dearrow/titles.js](#mod-titles-js), [features/dearrow/log.js](#mod-log-js) · imported by [features/dearrow/index.js](#mod-index-js)

<a id="fn-lookup-js-onchange"></a>
**`onChange()`** · arrow · L26–26

Called with the video when what its tiles should show changed (index.js).

- **Called by:** [resolve](#fn-lookup-js-resolve)

<a id="fn-lookup-js-setchangehandler"></a>
**`setChangeHandler(fn)`** · function, exported · L29–31

Sets what runs (with the video) when a video's title or thumbnail changed.

- **Called by:** [features/dearrow/index.js (at load)](#mod-index-js)

<a id="fn-lookup-js-thumbnailurl"></a>
**`thumbnailUrl(videoId, time)`** · arrow · L34–34

The thumbnail server's URL for the frame of `videoId` at `time` seconds.

- **Called by:** [resolveThumb](#fn-lookup-js-resolvethumb)

<a id="fn-lookup-js-randomframetime"></a>
**`randomFrameTime(video)`** · function · L42–47

The random frame's time in seconds, from the server's random position and the video's length (sent even for videos nobody submitted anything for), so the frame is the one other DeArrow users already had rendered; null without an answer (offline), and the auto-generated frame stays.

- **Called by:** [resolveThumb](#fn-lookup-js-resolvethumb)

<a id="fn-lookup-js-resolvethumb"></a>
**`resolveThumb(videoId, video, gen, show)`** · function, async · L55–110

Decides the thumbnail, calling show(thumb, crowdsourced) with each improvement: a trusted crowdsourced frame, or the fallback the settings pick (YouTube's own, a blank, one of YouTube's auto-generated frames, or a random frame with the start frame standing in until the server has rendered it).

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [randomFrameTime](#fn-lookup-js-randomframetime), [resolveThumb.retry](#fn-lookup-js-resolvethumb-retry), [thumbnailUrl](#fn-lookup-js-thumbnailurl), [features/dearrow/thumbs.js › loadThumb](#fn-thumbs-js-loadthumb), [features/dearrow/titles.js › isTrusted](#fn-titles-js-istrusted)
- **Called by:** [resolve](#fn-lookup-js-resolve)
- **Settings:** reads `dearrowCrowdThumbnails`, `dearrowThumbnailFallback`

<a id="fn-lookup-js-resolvethumb-retry"></a>
**`resolveThumb.retry(delays)`** · arrow · L100–108

Asks for the random frame again after the next delay, until it comes or the delays run out.

- **Calls:** [features/dearrow/state.js › currentGeneration](#fn-state-js-currentgeneration), [features/dearrow/thumbs.js › loadThumb](#fn-thumbs-js-loadthumb)
- **Called by:** [resolveThumb](#fn-lookup-js-resolvethumb)
- **Browser:** `setTimeout`

<a id="fn-lookup-js-resolve"></a>
**`resolve(videoId, video)`** · function, async · L113–132

Decides `video`'s title, then its thumbnail; output from an older generation is dropped.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [onChange](#fn-lookup-js-onchange), [resolveThumb](#fn-lookup-js-resolvethumb), [features/dearrow/state.js › currentGeneration](#fn-state-js-currentgeneration), [features/dearrow/titles.js › crowdsourcedTitle](#fn-titles-js-crowdsourcedtitle), [features/dearrow/titles.js › resolveTitle](#fn-titles-js-resolvetitle)
- **Called by:** [lookup](#fn-lookup-js-lookup)
- **Settings:** reads `enableDeArrow`

<a id="fn-lookup-js-fetchbranding"></a>
**`fetchBranding(videoId, video)`** · function · L139–155

The branding answer of one video, asked for once however often it is looked up: a 404 (nobody submitted anything) still carries the random frame time and the length. Resolves with the answer, or null (offline, blocked, slow).

- **Calls:** [core/fetch-timeout.js › fetchJsonWithTimeout](core.md#fn-fetch-timeout-js-fetchjsonwithtimeout)
- **Called by:** [lookup](#fn-lookup-js-lookup)

<a id="fn-lookup-js-lookup"></a>
**`lookup(videoId)`** · function, async · L158–170

Asks about one video (once), then decides what its tiles show.

- **Calls:** [fetchBranding](#fn-lookup-js-fetchbranding), [resolve](#fn-lookup-js-resolve)
- **Called by:** [pump](#fn-lookup-js-pump)

<a id="fn-lookup-js-pump"></a>
**`pump()`** · function · L173–184

Starts queued lookups until MAX_CONCURRENT run.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [lookup](#fn-lookup-js-lookup), [pump.next](#fn-lookup-js-pump-next)
- **Called by:** [pump.next](#fn-lookup-js-pump-next), [queueLookups](#fn-lookup-js-queuelookups)
- **Settings:** reads `enableDeArrow`

<a id="fn-lookup-js-pump-next"></a>
**`pump.next()`** · arrow · L178–181

One lookup done: start the next.

- **Calls:** [pump](#fn-lookup-js-pump)
- **Called by:** [pump](#fn-lookup-js-pump)

<a id="fn-lookup-js-queuelookups"></a>
**`queueLookups(ids)`** · function, exported · L187–190

Queues `ids` for a lookup, in order, and starts what can start.

- **Calls:** [pump](#fn-lookup-js-pump)
- **Called by:** [features/dearrow/index.js › applyDeArrow](#fn-index-js-applydearrow), [features/dearrow/index.js › onSettingsChange](#fn-index-js-onsettingschange)

<a id="fn-lookup-js-clearqueue"></a>
**`clearQueue()`** · function, exported · L193–195

Empties the queue (lookups already running finish, their output dropped by generation).

- **Called by:** [features/dearrow/index.js › onSettingsChange](#fn-index-js-onsettingschange), [features/dearrow/index.js › wipe](#fn-index-js-wipe)

<a id="mod-state-js"></a>

## features/dearrow/state.js

> What DeArrow knows, shared by its modules: the videos seen, and the generation that a settings change or a wipe bumps so that work started before it does not write stale output.

29 lines · imported by [features/dearrow/index.js](#mod-index-js), [features/dearrow/lookup.js](#mod-lookup-js), [features/dearrow/sweep.js](#mod-sweep-js), [features/dearrow/tiles.js](#mod-tiles-js)

<a id="fn-state-js-currentgeneration"></a>
**`currentGeneration()`** · arrow, exported · L24–24

The current generation.

- **Called by:** [features/dearrow/lookup.js › resolve](#fn-lookup-js-resolve), [features/dearrow/lookup.js › resolveThumb.retry](#fn-lookup-js-resolvethumb-retry)

<a id="fn-state-js-nextgeneration"></a>
**`nextGeneration()`** · function, exported · L27–29

Starts a new generation: work begun before it drops its output.

- **Called by:** [features/dearrow/index.js › onSettingsChange](#fn-index-js-onsettingschange), [features/dearrow/index.js › wipe](#fn-index-js-wipe)

<a id="mod-sweep-js"></a>

## features/dearrow/sweep.js

> DeArrow on screen: the rendered tiles brought in line with what is decided for their videos, or put back to YouTube's own. A tile is matched to its video by the thumbnail it shows (YouTube's URL carries the id, DeArrow's small copies are looked up), and only text or images this feature wrote are ever put back. The DeArrow badge YouTube draws from the responses (tiles.js) gets the logo here, or is hidden while the badge is off.

114 lines · imports [core/config.js](core.md#mod-config-js), [core/selectors.js](core.md#mod-selectors-js), [features/dearrow/constants.js](#mod-constants-js), [features/dearrow/state.js](#mod-state-js), [features/dearrow/thumbs.js](#mod-thumbs-js) · imported by [features/dearrow/index.js](#mod-index-js)

<a id="fn-sweep-js-settext"></a>
**`setText(el, text)`** · function · L22–26

Replaces an element's text, editing its one text node where it has one: the renderer keeps a handle on that node and reuses the tile for other videos.

- **Called by:** [sweepTitle](#fn-sweep-js-sweeptitle)

<a id="fn-sweep-js-tilevideo"></a>
**`tileVideo(thumbEl)`** · function · L29–36

The video a rendered tile shows, from its thumbnail, or undefined.

- **Calls:** [features/dearrow/thumbs.js › thumbOwner](#fn-thumbs-js-thumbowner)
- **Called by:** [sweepTiles](#fn-sweep-js-sweeptiles)

<a id="fn-sweep-js-sweepthumb"></a>
**`sweepThumb(thumbEl, video, want)`** · function · L39–54

One tile's thumbnail: DeArrow's on top (`want`), or YouTube's back when DeArrow put one there.

- **Called by:** [sweepTiles](#fn-sweep-js-sweeptiles)

<a id="fn-sweep-js-sweeptitle"></a>
**`sweepTitle(titleEl, video, want)`** · function · L57–64

One tile's title: DeArrow's (`want`), or YouTube's back when the text is still DeArrow's.

- **Calls:** [setText](#fn-sweep-js-settext)
- **Called by:** [sweepTiles](#fn-sweep-js-sweeptiles)

<a id="fn-sweep-js-sweepbadges"></a>
**`sweepBadges(tile, hide)`** · function · L73–95

The DeArrow badges YouTube drew in a tile (the text BADGE_MARK): the logo drawn over the mark, or with `hide` the whole badge hidden (DeArrow or its badge switched off, until YouTube draws the tile again without it).

- **Called by:** [sweepTiles](#fn-sweep-js-sweeptiles)
- **Selectors:** `TILE_METADATA`
- **Browser:** `querySelector`, `getElementsByTagName`

<a id="fn-sweep-js-sweeptiles"></a>
**`sweepTiles(restoreAll)`** · function, exported · L101–114

Brings every rendered tile in line with what is decided for its video; with `restoreAll`, puts back every original this feature replaced (DeArrow off).

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [sweepBadges](#fn-sweep-js-sweepbadges), [sweepThumb](#fn-sweep-js-sweepthumb), [sweepTitle](#fn-sweep-js-sweeptitle), [tileVideo](#fn-sweep-js-tilevideo)
- **Called by:** [features/dearrow/index.js › restoreTiles](#fn-index-js-restoretiles), [features/dearrow/index.js › scheduleSweep](#fn-index-js-schedulesweep)
- **Settings:** reads `dearrowShowBadge`
- **Selectors:** `TILE`, `THUMBNAIL_TILE`, `TILE_TITLE`
- **Browser:** `querySelectorAll`, `querySelector`

<a id="mod-thumbs-js"></a>

## features/dearrow/thumbs.js

> DeArrow's thumbnails, downloaded once and drawn as a 16:9 copy as wide as Max Thumbnail Quality makes the tiles around them (COPY_WIDTHS), as a blob URL (a data URL on webOS 3 and 4, where canvas has no toBlob), remembered with the video it belongs to.

132 lines · imports [core/config.js](core.md#mod-config-js), [features/dearrow/constants.js](#mod-constants-js) · imported by [features/dearrow/index.js](#mod-index-js), [features/dearrow/lookup.js](#mod-lookup-js), [features/dearrow/sweep.js](#mod-sweep-js)

<a id="fn-thumbs-js-canblob"></a>
**`canBlob()`** · arrow · L25–26

Whether canvas can make blobs here (Chrome 50+); webOS 3 and 4 make data URLs.

- **Called by:** [copyWidth](#fn-thumbs-js-copywidth), [thumbsFull](#fn-thumbs-js-thumbsfull)

<a id="fn-thumbs-js-thumbowner"></a>
**`thumbOwner(url)`** · arrow, exported · L29–29

The video a copy shows, or undefined for any other URL.

- **Called by:** [features/dearrow/sweep.js › tileVideo](#fn-sweep-js-tilevideo)

<a id="fn-thumbs-js-thumbsfull"></a>
**`thumbsFull()`** · arrow, exported · L35–36

Whether the kept copies are at their limit: CACHE_LIMIT of them, or their weight at BLOB_BUDGET (DATA_URL_BUDGET for data URLs, on webOS 3 and 4).

- **Calls:** [canBlob](#fn-thumbs-js-canblob)
- **Called by:** [features/dearrow/index.js › applyDeArrow](#fn-index-js-applydearrow)

<a id="fn-thumbs-js-copywidth"></a>
**`copyWidth()`** · function, exported · L42–46

How wide copies are drawn now: as wide as Max Thumbnail Quality's strategy makes YouTube's tiles (COPY_WIDTHS), DATA_URL_WIDTH for data URLs.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [canBlob](#fn-thumbs-js-canblob)
- **Called by:** [loadThumb](#fn-thumbs-js-loadthumb)
- **Settings:** reads `upgradeThumbnails`, `thumbnailQualityMode`

<a id="fn-thumbs-js-drawcopy"></a>
**`drawCopy(url, videoId, width, key)`** · function · L54–107

Downloads `url` and resolves with a copy `width` wide (never wider than the source), cropped to 16:9 (which also trims the letterbox of YouTube's 4:3 hq1 to hq3 frames); null when the image does not load (the thumbnail server answers 204 for a frame it has not rendered yet) or cannot be drawn.

- **Called by:** [loadThumb](#fn-thumbs-js-loadthumb)
- **Browser:** `Image`

<a id="fn-thumbs-js-drawcopy-img-onerror"></a>
**`drawCopy.img.onerror()`** · assigned · L59–59

Not loaded (204 for a frame not rendered yet, a network error): no copy.

<a id="fn-thumbs-js-drawcopy-img-onload"></a>
**`drawCopy.img.onload()`** · assigned · L61–104

Loaded: draws the copy.

- **Calls:** [drawCopy.img.onload.finish](#fn-thumbs-js-drawcopy-img-onload-finish)

<a id="fn-thumbs-js-drawcopy-img-onload-finish"></a>
**`drawCopy.img.onload.finish(copy, weight)`** · arrow · L69–76

Remembers the copy and its weight, if there is one, and resolves with it.

- **Called by:** [drawCopy.img.onload](#fn-thumbs-js-drawcopy-img-onload)

<a id="fn-thumbs-js-loadthumb"></a>
**`loadThumb(url, videoId)`** · function, exported · L110–122

The copy of `url` for `videoId` at the current width: the one kept, the download in flight, or a new one.

- **Calls:** [copyWidth](#fn-thumbs-js-copywidth), [drawCopy](#fn-thumbs-js-drawcopy)
- **Called by:** [features/dearrow/lookup.js › resolveThumb](#fn-lookup-js-resolvethumb), [features/dearrow/lookup.js › resolveThumb.retry](#fn-lookup-js-resolvethumb-retry)

<a id="fn-thumbs-js-forgetthumbs"></a>
**`forgetThumbs()`** · function, exported · L125–132

Drops every copy, freeing the blobs.

- **Called by:** [features/dearrow/index.js › wipe](#fn-index-js-wipe)

<a id="mod-tiles-js"></a>

## features/dearrow/tiles.js

> DeArrow in the responses: every video tile of an InnerTube response, found by a bounded walk, is remembered with its video and gets what is decided for it: the title, the thumbnail, and the DeArrow badge in its metadata line. A tile seen before its video's answer is written to again when the answer lands (applyToVideo), so YouTube draws it right whenever it draws it from that response (scrolling, coming back to a page). YouTube keeps parsed responses and renders cached pages from them, so what each tile had is recorded once and can be put back.

287 lines · imports [core/config.js](core.md#mod-config-js), [features/dearrow/constants.js](#mod-constants-js), [features/dearrow/state.js](#mod-state-js) · imported by [features/dearrow/index.js](#mod-index-js)

<a id="fn-tiles-js-parseduration"></a>
**`parseDuration(text)`** · function · L37–40

"1:02:03" -> 3723 seconds; null for anything else.

- **Called by:** [readTile](#fn-tiles-js-readtile)

<a id="fn-tiles-js-readtile"></a>
**`readTile(tile)`** · function · L43–63

What YouTube sent for a tile: its title, its thumbnail URL and its length in seconds.

- **Calls:** [parseDuration](#fn-tiles-js-parseduration)
- **Called by:** [patchResponseTiles](#fn-tiles-js-patchresponsetiles)

<a id="fn-tiles-js-lineitemlists"></a>
**`lineItemLists(tile)`** · function · L66–75

The item lists of a tile's metadata lines (each line's lineRenderer.items).

- **Called by:** [applyToTile](#fn-tiles-js-applytotile), [patchResponseTiles](#fn-tiles-js-patchresponsetiles)

<a id="fn-tiles-js-isbadge"></a>
**`isBadge(item)`** · arrow · L78–78

Whether a metadata line item is a badge ("4K", "HD", "CC"), not text.

- **Called by:** [badgeSlot](#fn-tiles-js-badgeslot), [learnBadge](#fn-tiles-js-learnbadge)

<a id="fn-tiles-js-learnbadge"></a>
**`learnBadge(lists)`** · function · L81–90

Remembers the first real badge seen, without its label, as the shape of the DeArrow badge.

- **Calls:** [isBadge](#fn-tiles-js-isbadge)
- **Called by:** [patchResponseTiles](#fn-tiles-js-patchresponsetiles)

<a id="fn-tiles-js-makebadge"></a>
**`makeBadge()`** · function · L96–105

A DeArrow badge for a metadata line: the learned badge with BADGE_MARK as its label, which the sweep (sweep.js) draws as the DeArrow logo.

- **Called by:** [applyToTile](#fn-tiles-js-applytotile)

<a id="fn-tiles-js-badgeslot"></a>
**`badgeSlot(lists)`** · function · L112–119

Where the DeArrow badge goes: after the last badge of the line that has one (next to "4K"), else at the start of the last line (the one with the views and the age). Returns [items, index], or null for a tile without lines.

- **Calls:** [isBadge](#fn-tiles-js-isbadge)
- **Called by:** [applyToTile](#fn-tiles-js-applytotile)

<a id="fn-tiles-js-originalof"></a>
**`originalOf(tile)`** · function · L122–138

The record of what YouTube had in `tile`, made the first time DeArrow writes to it.

- **Called by:** [applyToTile](#fn-tiles-js-applytotile)

<a id="fn-tiles-js-restoretitle"></a>
**`restoreTitle(rec)`** · function · L141–146

Puts YouTube's own title back into a tile.

- **Called by:** [applyToTile](#fn-tiles-js-applytotile), [unpatchResponses](#fn-tiles-js-unpatchresponses)

<a id="fn-tiles-js-removebadge"></a>
**`removeBadge(rec)`** · function · L149–155

Takes the DeArrow badge back out of its metadata line.

- **Called by:** [applyToTile](#fn-tiles-js-applytotile), [unpatchResponses](#fn-tiles-js-unpatchresponses)

<a id="fn-tiles-js-applytotile"></a>
**`applyToTile(tile, video)`** · function · L162–196

Writes what is decided for `video` into a tile of a response: its title and thumbnail (YouTube's own where nothing is), and the badge while either is a crowdsourced one and the badge setting is on.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [badgeSlot](#fn-tiles-js-badgeslot), [lineItemLists](#fn-tiles-js-lineitemlists), [makeBadge](#fn-tiles-js-makebadge), [originalOf](#fn-tiles-js-originalof), [removeBadge](#fn-tiles-js-removebadge), [restoreTitle](#fn-tiles-js-restoretitle)
- **Called by:** [applyToVideo](#fn-tiles-js-applytovideo), [patchResponseTiles](#fn-tiles-js-patchresponsetiles)
- **Settings:** reads `dearrowShowBadge`

<a id="fn-tiles-js-applytovideo"></a>
**`applyToVideo(video)`** · function, exported · L199–202

Writes what is now decided for `video` into every tile of it remembered from the responses.

- **Calls:** [applyToTile](#fn-tiles-js-applytotile)
- **Called by:** [features/dearrow/index.js (at load)](#mod-index-js)

<a id="fn-tiles-js-unpatchresponses"></a>
**`unpatchResponses()`** · function, exported · L205–218

Puts YouTube's own titles, thumbnails and lines back into every stored response edited.

- **Calls:** [removeBadge](#fn-tiles-js-removebadge), [restoreTitle](#fn-tiles-js-restoretitle)
- **Called by:** [features/dearrow/index.js › onSettingsChange](#fn-index-js-onsettingschange), [features/dearrow/index.js › wipe](#fn-index-js-wipe)

<a id="fn-tiles-js-remember"></a>
**`remember(video, tile)`** · function · L221–228

Remembers `tile` as one of `video`'s (the last TILES_PER_VIDEO of them).

- **Called by:** [patchResponseTiles](#fn-tiles-js-patchresponsetiles)

<a id="fn-tiles-js-patchresponsetiles"></a>
**`patchResponseTiles(data)`** · function, exported · L236–287

Walks a parsed response breadth first (so videos come in screen order), bounded by SCAN_MAX_NODES and SCAN_MAX_DEPTH: each video tile is remembered, and written to when its video is decided. Returns the ids of the videos seen for the first time, now waiting for a lookup.

- **Calls:** [applyToTile](#fn-tiles-js-applytotile), [learnBadge](#fn-tiles-js-learnbadge), [lineItemLists](#fn-tiles-js-lineitemlists), [readTile](#fn-tiles-js-readtile), [remember](#fn-tiles-js-remember)
- **Called by:** [features/dearrow/index.js › applyDeArrow](#fn-index-js-applydearrow)

<a id="mod-titles-js"></a>

## features/dearrow/titles.js

> DeArrow's titles: the crowdsourced one when it is trusted, else YouTube's own, either formatted as Title formatting says by the extension's own formatter (formatter.js; the legacy build has none, and keeps titles as written).

63 lines · imports [core/config.js](core.md#mod-config-js), [features/dearrow/formatter.js](#mod-formatter-js) · imported by [features/dearrow/lookup.js](#mod-lookup-js)

<a id="fn-titles-js-istrusted"></a>
**`isTrusted(entry)`** · function, exported · L24–26

A submission DeArrow would show: not the original, and locked or voted zero or above.

- **Called by:** [features/dearrow/lookup.js › resolveThumb](#fn-lookup-js-resolvethumb), [crowdsourcedTitle](#fn-titles-js-crowdsourcedtitle)

<a id="fn-titles-js-formattitle"></a>
**`formatTitle(title, isCustom)`** · function · L33–42

`title` formatted as Title formatting says, the same for a crowdsourced one (`isCustom`, whose ">" markers keep a word as written) as for YouTube's; resolves with the text.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [vendor/dearrow/titleFormatter.js › formatTitleInternal](vendor-dearrow.md#fn-titleformatter-js-formattitleinternal)
- **Called by:** [resolveTitle](#fn-titles-js-resolvetitle)
- **Settings:** reads `dearrowTitleFormatting`, `dearrowCleanEmojis`

<a id="fn-titles-js-crowdsourcedtitle"></a>
**`crowdsourcedTitle(video)`** · function, exported · L45–49

The crowdsourced title the settings let a video show: the top one when it is trusted, else null.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [isTrusted](#fn-titles-js-istrusted)
- **Called by:** [features/dearrow/lookup.js › resolve](#fn-lookup-js-resolve), [resolveTitle](#fn-titles-js-resolvetitle)
- **Settings:** reads `dearrowCrowdTitles`

<a id="fn-titles-js-resolvetitle"></a>
**`resolveTitle(video)`** · function, async, exported · L56–63

The title a video's tiles should show, or null for YouTube's own: the top crowdsourced one when it is trusted, else the original when formatting changes it.

- **Calls:** [crowdsourcedTitle](#fn-titles-js-crowdsourcedtitle), [formatTitle](#fn-titles-js-formattitle)
- **Called by:** [features/dearrow/lookup.js › resolve](#fn-lookup-js-resolve)
