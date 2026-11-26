# Code map: features/thumbnail-quality/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/log.js](#mod-log-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js), [features/thumbnail-quality/probe-transport.js](#mod-probe-transport-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js), [features/thumbnail-quality/state.js](#mod-state-js)

<a id="mod-cache-js"></a>

## features/thumbnail-quality/cache.js

> The persistent videoId -> verified rank cache in localStorage.

100 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/log.js](#mod-log-js) · imported by [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/probes.js](#mod-probes-js)

<a id="fn-cache-js-capset"></a>
**`capSet(map, key, value, limit)`** · function, exported · L8–16

Sets `key`, dropping the oldest entry at `limit`; returns the dropped key, or null.

- **Called by:** [features/thumbnail-quality/probes.js › onProbeDone](#fn-probes-js-onprobedone)

<a id="fn-cache-js-capmarker"></a>
**`capMarker()`** · arrow · L23–23

What CACHE_CAP_KEY holds: the ladder's rung and the cache revision, e.g. "3r2".

- **Called by:** [dropStoredCache](#fn-cache-js-dropstoredcache), [loadCache](#fn-cache-js-loadcache), [saveCache](#fn-cache-js-savecache)

<a id="fn-cache-js-dropstoredcache"></a>
**`dropStoredCache()`** · function, exported · L26–33

Forgets the stored answers and records the ladder the next ones are measured against.

- **Calls:** [capMarker](#fn-cache-js-capmarker)
- **Called by:** [loadCache](#fn-cache-js-loadcache), [features/thumbnail-quality/index.js › resetVerification](#fn-index-js-resetverification)
- **Browser:** `localStorage`

<a id="fn-cache-js-loadcache"></a>
**`loadCache()`** · function, exported · L39–66

Loads the known best thumbnail of each video from localStorage ("id:rank" pairs); a cache written for another strategy or an older revision is dropped instead.

- **Calls:** [capMarker](#fn-cache-js-capmarker), [dropStoredCache](#fn-cache-js-dropstoredcache)
- **Called by:** [features/thumbnail-quality/index.js (at load)](#mod-index-js)
- **Browser:** `localStorage`

<a id="fn-cache-js-savecache"></a>
**`saveCache()`** · function · L69–81

Writes the confirmed entries of the cache, with the strategy marker they are valid for.

- **Calls:** [capMarker](#fn-cache-js-capmarker)
- **Called by:** [flushCache](#fn-cache-js-flushcache), [scheduleSave](#fn-cache-js-schedulesave)
- **Browser:** `localStorage`

<a id="fn-cache-js-schedulesave"></a>
**`scheduleSave()`** · function, exported · L84–87

Saves the cache after CACHE_SAVE_DEBOUNCE ms, once for a burst of new answers.

- **Calls:** [saveCache](#fn-cache-js-savecache)
- **Called by:** [features/thumbnail-quality/probes.js › onProbeDone](#fn-probes-js-onprobedone)
- **Browser:** `setTimeout`

<a id="fn-cache-js-cancelsave"></a>
**`cancelSave()`** · function, exported · L90–92

Drops a pending save: for a cache that is about to be cleared anyway.

- **Calls:** [features/thumbnail-quality/state.js › clearStateTimer](#fn-state-js-clearstatetimer)
- **Called by:** [features/thumbnail-quality/index.js › cleanup](#fn-index-js-cleanup)

<a id="fn-cache-js-flushcache"></a>
**`flushCache()`** · function, exported · L95–100

Saves a pending change now (the app is going to the background).

- **Calls:** [saveCache](#fn-cache-js-savecache)
- **Called by:** [features/thumbnail-quality/index.js (at load)](#mod-index-js), [features/thumbnail-quality/index.js › cleanup](#fn-index-js-cleanup), [features/thumbnail-quality/index.js › handleVisibilityChange](#fn-index-js-handlevisibilitychange)

<a id="mod-constants-js"></a>

## features/thumbnail-quality/constants.js

> Tuning constants for Max Thumbnail Quality.

82 lines · imported by [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js), [features/thumbnail-quality/probe-transport.js](#mod-probe-transport-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js)

<a id="mod-dispatch-js"></a>

## features/thumbnail-quality/dispatch.js

> Where each InnerTube response type keeps its thumbnails: the known paths per type, the bounded scan for shapes no path matched, and the entry point the JSON.parse hook calls.

362 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [core/innertube.js](core.md#mod-innertube-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js), [features/thumbnail-quality/log.js](#mod-log-js)

<a id="fn-dispatch-js-upgradeitem"></a>
**`upgradeItem(item)`** · function · L26–53

Upgrades the thumbnails of one item of a list (a tile with its long-press menu copy, or the other renderer kinds); returns how many URLs it changed.

- **Calls:** [features/thumbnail-quality/rewrite.js › upgradeContainer](#fn-rewrite-js-upgradecontainer)
- **Called by:** [upgradeAutoplaySets](#fn-dispatch-js-upgradeautoplaysets), [upgradeItems](#fn-dispatch-js-upgradeitems), [upgradeSectionList](#fn-dispatch-js-upgradesectionlist)

<a id="fn-dispatch-js-upgradeitems"></a>
**`upgradeItems(items)`** · function · L56–62

upgradeItem over a list; returns the total changed.

- **Calls:** [upgradeItem](#fn-dispatch-js-upgradeitem)
- **Called by:** [upgradeActions](#fn-dispatch-js-upgradeactions), [upgradeContinuation](#fn-dispatch-js-upgradecontinuation), [upgradeListInto](#fn-dispatch-js-upgradelistinto)

<a id="fn-dispatch-js-upgradelistinto"></a>
**`upgradeListInto(items, tally)`** · function · L65–67

One shelf list upgraded, its changes added to `tally` (forEachItemList's argument).

- **Calls:** [upgradeItems](#fn-dispatch-js-upgradeitems)
- **Called by:** [upgradeSectionList](#fn-dispatch-js-upgradesectionlist)

<a id="fn-dispatch-js-upgradesectionlist"></a>
**`upgradeSectionList(contents)`** · function · L77–93

The shelves of a section list. The list itself does not count as found (state.listsSeen): a list whose shelves the walk does not know holds no item list it can reach, and is scanned. A section in which the walk found no thumbnail at all (an item section, a vertical list, a renderer it does not know: the search page's results) gets a bounded scan of its own, so one shelf the walk does read cannot hide the rest of the page.

- **Calls:** [core/innertube.js › forEachItemList](core.md#fn-innertube-js-foreachitemlist), [scanForThumbnails](#fn-dispatch-js-scanforthumbnails), [upgradeItem](#fn-dispatch-js-upgradeitem), [upgradeListInto](#fn-dispatch-js-upgradelistinto)
- **Called by:** [upgradeBrowseTabs](#fn-dispatch-js-upgradebrowsetabs), [upgradeByType](#fn-dispatch-js-upgradebytype), [upgradeContinuation](#fn-dispatch-js-upgradecontinuation)

<a id="fn-dispatch-js-isthumbnailfreecontinuation"></a>
**`isThumbnailFreeContinuation(contents)`** · function · L105–112

Whether every key of the continuation is one known to hold no thumbnails.

- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype)

<a id="fn-dispatch-js-upgradeautoplaysets"></a>
**`upgradeAutoplaySets(sets)`** · function · L142–152

Upgrades the next-video item of each autoplay set.

- **Calls:** [upgradeItem](#fn-dispatch-js-upgradeitem)
- **Called by:** [upgradeAutoplay](#fn-dispatch-js-upgradeautoplay)

<a id="fn-dispatch-js-upgradeautoplay"></a>
**`upgradeAutoplay(autoplay)`** · function · L158–165

Upgrades the autoplay suggestions of a watch response: the sets, the modified sets and the replay card.

- **Calls:** [upgradeAutoplaySets](#fn-dispatch-js-upgradeautoplaysets), [features/thumbnail-quality/rewrite.js › upgradeContainer](#fn-rewrite-js-upgradecontainer)
- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype)

<a id="fn-dispatch-js-upgradebrowsetabs"></a>
**`upgradeBrowseTabs(sections)`** · function · L168–184

Upgrades the sections of every tab of a browse page's secondary navigation.

- **Calls:** [upgradeSectionList](#fn-dispatch-js-upgradesectionlist)
- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype)

<a id="fn-dispatch-js-upgradeactions"></a>
**`upgradeActions(actions)`** · function · L187–197

Upgrades the items that reload or append actions (continuations) carry.

- **Calls:** [upgradeItems](#fn-dispatch-js-upgradeitems)
- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype)

<a id="fn-dispatch-js-upgradecontinuation"></a>
**`upgradeContinuation(data)`** · function · L209–216

Continuation payloads, in all four shapes.

Called for every response rather than only for responseType 'CONTINUATION', because a continuation is not always classified as one. A shelf continuation under the playing video arrives with `contents.singleColumnWatchNextResults` still attached, and detectResponseType() checks NEXT before CONTINUATION — so the response is typed NEXT while every thumbnail in it lives under `continuationContents.sectionListContinuation`.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [upgradeItems](#fn-dispatch-js-upgradeitems), [upgradeSectionList](#fn-dispatch-js-upgradesectionlist)
- **Called by:** [upgradeResponseThumbnails](#fn-dispatch-js-upgraderesponsethumbnails)

<a id="fn-dispatch-js-scanforthumbnails"></a>
**`scanForThumbnails(root)`** · function · L223–250

Last-resort bounded walk, used only when the schema paths produced nothing. Keeps the module working through an InnerTube reshuffle instead of silently doing nothing, without ever putting a full traversal on the hot path.

- **Calls:** [features/thumbnail-quality/rewrite.js › upgradeContainer](#fn-rewrite-js-upgradecontainer)
- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype), [upgradeSectionList](#fn-dispatch-js-upgradesectionlist)

<a id="fn-dispatch-js-scanroot"></a>
**`scanRoot(data, type)`** · function · L260–269

Where the thumbnail scan of a response type starts: down SCAN_FROM's path as far as it exists.

- **Called by:** [upgradeByType](#fn-dispatch-js-upgradebytype)

<a id="fn-dispatch-js-upgradebytype"></a>
**`upgradeByType(data, type, textLength)`** · function · L277–327

The thumbnails at the known paths of `type`, rewritten; the count. A type whose paths reach no item list at all gets the bounded scan, an unknown type gets it when the body is large enough to be worth one, and a type with nothing to find gets neither.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [isThumbnailFreeContinuation](#fn-dispatch-js-isthumbnailfreecontinuation), [scanForThumbnails](#fn-dispatch-js-scanforthumbnails), [scanRoot](#fn-dispatch-js-scanroot), [upgradeActions](#fn-dispatch-js-upgradeactions), [upgradeAutoplay](#fn-dispatch-js-upgradeautoplay), [upgradeBrowseTabs](#fn-dispatch-js-upgradebrowsetabs), [upgradeSectionList](#fn-dispatch-js-upgradesectionlist), [features/thumbnail-quality/rewrite.js › upgradeContainer](#fn-rewrite-js-upgradecontainer)
- **Called by:** [upgradeResponseThumbnails](#fn-dispatch-js-upgraderesponsethumbnails)

<a id="fn-dispatch-js-upgraderesponsethumbnails"></a>
**`upgradeResponseThumbnails(data, responseType, textLength)`** · function, exported · L335–362

Entry point called from the JSON.parse hook in adblock/parse-hook.js. `responseType` is the type adblock already detected, so this costs no extra detection pass; `textLength` is the length of the JSON text, which the hook already has.

- **Calls:** [upgradeByType](#fn-dispatch-js-upgradebytype), [upgradeContinuation](#fn-dispatch-js-upgradecontinuation), [features/thumbnail-quality/probes.js › deferProbes](#fn-probes-js-deferprobes), [features/thumbnail-quality/promotion.js › schedulePromotionSweep](#fn-promotion-js-schedulepromotionsweep)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)

<a id="mod-index-js"></a>

## features/thumbnail-quality/index.js

> Max Thumbnail Quality - rewrites thumbnail URLs in the parsed InnerTube response, inside the JSON.parse hook adblock already owns, so the app is only ever handed the high-quality URL and never fetches the 320x180 crop.
>
> JSON carries no failure signal the way a CSS background fallback does, and maxresdefault does not exist for every video - YouTube answers a miss with a small grey placeholder rather than a 404 (see PLACEHOLDER_MAX_BYTES). Hence the modes in state.js and the verification queue in probes.js. This file wires the switches, the cache's lifetime and the arrow-key pause.

103 lines · imports [core/config.js](core.md#mod-config-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js)

**At load:**

- **Calls:** [features/thumbnail-quality/cache.js › loadCache](#fn-cache-js-loadcache), [handleVisibilityChange](#fn-index-js-handlevisibilitychange), [features/thumbnail-quality/cache.js › flushCache](#fn-cache-js-flushcache), [features/thumbnail-quality/navigation-pause.js › onNavKey](#fn-navigation-pause-js-onnavkey), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [features/thumbnail-quality/ladder.js › usefulRankFor](#fn-ladder-js-usefulrankfor), [resetVerification](#fn-index-js-resetverification), [cleanup](#fn-index-js-cleanup)
- **Settings:** listens to `thumbnailQualityMode`, `upgradeThumbnails`
- **Events:** listens to `visibilitychange`, `pagehide`, `keydown`
- **Hooks:** `window.__ytafThumbStats`

<a id="fn-index-js-handlevisibilitychange"></a>
**`handleVisibilityChange()`** · function · L37–45

Saves the cache when the app goes to the background; back in the foreground, holds the probes off for a moment.

- **Calls:** [features/thumbnail-quality/cache.js › flushCache](#fn-cache-js-flushcache), [features/thumbnail-quality/probes.js › deferProbes](#fn-probes-js-deferprobes)
- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-cleanup"></a>
**`cleanup(keepCache)`** · function · L48–65

Stops everything in flight; `keepCache` false drops the pending save instead of writing it.

- **Calls:** [features/thumbnail-quality/cache.js › cancelSave](#fn-cache-js-cancelsave), [features/thumbnail-quality/cache.js › flushCache](#fn-cache-js-flushcache), [features/thumbnail-quality/probes.js › clearProbeTiers](#fn-probes-js-clearprobetiers), [features/thumbnail-quality/state.js › clearStateTimer](#fn-state-js-clearstatetimer)
- **Called by:** [at load](#mod-index-js), [resetVerification](#fn-index-js-resetverification)

<a id="fn-index-js-resetverification"></a>
**`resetVerification()`** · function · L74–80

Forget every verified rank. The cache is only meaningful against the ladder that produced it: 'sd' records sddefault as a video's answer, the other modes record maxres or the floor. A cached answer is never re-probed, so crossing that line would freeze every known video at the old mode's ceiling. Starting over costs one re-probe per video, spread over normal use.

- **Calls:** [features/thumbnail-quality/cache.js › dropStoredCache](#fn-cache-js-dropstoredcache), [cleanup](#fn-index-js-cleanup)
- **Called by:** [at load](#mod-index-js)

<a id="mod-ladder-js"></a>

## features/thumbnail-quality/ladder.js

> The thumbnail quality ladder: the rungs YouTube serves, which of them a mode may reach for, and how a thumbnail URL is built and recognised.

81 lines · imported by [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/probe-transport.js](#mod-probe-transport-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js), [features/thumbnail-quality/state.js](#mod-state-js)

<a id="fn-ladder-js-usefulrankfor"></a>
**`usefulRankFor(mode)`** · function, exported · L40–42

The best rung the current mode will emit or probe for. A single rung, deliberately: maxresdefault and hq720 are both 1280x720 for the overwhelming majority of uploads, so probing a second rung doubled verification traffic to distinguish two files of identical size. A miss falls straight to the guaranteed floor. In 'sd' mode the rung is sddefault instead.

- **Called by:** [features/thumbnail-quality/index.js (at load)](#mod-index-js), [features/thumbnail-quality/state.js (at load)](#mod-state-js)

<a id="fn-ladder-js-drawsunproven"></a>
**`drawsUnproven(mode)`** · function, exported · L51–53

Whether the mode draws its rung before any proof and corrects a miss afterwards ('sd' and 'eager'), or draws only what is known to exist and waits for the probe ('safe'). sddefault exists for nearly every video and maxres for most, so a miss is rare; waiting showed every new tile at the rung YouTube listed (hqdefault) and swapped it a few hundred ms later.

- **Called by:** [features/thumbnail-quality/probes.js › onProbeDone](#fn-probes-js-onprobedone), [features/thumbnail-quality/rewrite.js › upgradeVideo](#fn-rewrite-js-upgradevideo)

<a id="fn-ladder-js-rankof"></a>
**`rankOf(name)`** · function, exported · L71–76

The rank of a thumbnail basename; undefined for a name the ladder cannot map.

- **Called by:** [features/thumbnail-quality/rewrite.js › upgradeContainer](#fn-rewrite-js-upgradecontainer)

<a id="fn-ladder-js-buildurl"></a>
**`buildUrl(videoId, name)`** · function, exported · L79–81

The `/vi/` JPEG URL of one rung; hqdefault.jpg exists for every video.

- **Called by:** [features/thumbnail-quality/probe-transport.js › resolveQuality](#fn-probe-transport-js-resolvequality), [features/thumbnail-quality/probes.js › applyCorrection](#fn-probes-js-applycorrection), [features/thumbnail-quality/promotion.js › runPromotionSweep](#fn-promotion-js-runpromotionsweep), [features/thumbnail-quality/rewrite.js › upgradeVideo](#fn-rewrite-js-upgradevideo)

<a id="mod-log-js"></a>

## features/thumbnail-quality/log.js

> The logger of the feature's modules: their messages carry [ThumbQuality] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-navigation-pause-js"></a>

## features/thumbnail-quality/navigation-pause.js

> Holds probes and promotions still while the remote's arrow keys are moving.

14 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/state.js](#mod-state-js) · imported by [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js)

<a id="fn-navigation-pause-js-onnavkey"></a>
**`onNavKey(e)`** · function, exported · L6–8

Arrow keydown, capture phase: just a timestamp, nothing else runs here.

- **Called by:** [features/thumbnail-quality/index.js (at load)](#mod-index-js)

<a id="fn-navigation-pause-js-navpauseleft"></a>
**`navPauseLeft()`** · function, exported · L11–14

Milliseconds left on the navigation pause; 0 when the remote is quiet.

- **Called by:** [features/thumbnail-quality/probes.js › drainProbes](#fn-probes-js-drainprobes), [features/thumbnail-quality/probes.js › runProbeRound](#fn-probes-js-runproberound), [features/thumbnail-quality/promotion.js › runPromotionSweep](#fn-promotion-js-runpromotionsweep)

<a id="mod-probe-transport-js"></a>

## features/thumbnail-quality/probe-transport.js

> How a rung's existence is checked: a HEAD request off screen, an image load on screen, and the mode's best rung resolved against the floor.

113 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js) · imported by [features/thumbnail-quality/probes.js](#mod-probes-js)

<a id="fn-probe-transport-js-headexists"></a>
**`headExists(url)`** · function · L20–52

Whether the URL exists, by a HEAD request: true, false, UNKNOWN, or null when the answer carried no readable Content-Length (a cross-origin answer on Chromium 38 and 53), in which case the caller loads the image instead. A grey placeholder answered 200 with a tiny body counts as missing too.

- **Browser:** `XMLHttpRequest`

<a id="fn-probe-transport-js-headexists-xhr-onload"></a>
**`headExists.xhr.onload()`** · assigned · L36–40

A 2xx answer: whether the file is bigger than YouTube's grey placeholder (null when the size is not given); anything else is missing.

<a id="fn-probe-transport-js-headexists-xhr-onerror"></a>
**`headExists.xhr.onerror()`** · assigned · L42–42

A network error: unknown.

<a id="fn-probe-transport-js-headexists-xhr-ontimeout"></a>
**`headExists.xhr.ontimeout()`** · assigned · L45–45

A timeout: unknown.

<a id="fn-probe-transport-js-imageexists"></a>
**`imageExists(url)`** · function · L67–97

Whether the URL exists, by loading the image.

Used for tiles the app has already rendered. In the modes that draw unproven rungs the tile shows this very URL, so the load comes out of the browser's cache, whatever made the tile grey included (a missing rung loads as the grey placeholder, caught on its width below); in the mode that waits for proof the tile shows the floor, and the image loaded here is the one the promotion then draws, so the download is not wasted. It also needs no CORS at all, and a CSS background-image load never passes through fetch or XMLHttpRequest, so the &lt;img> is the only place this signal exists. An `error` is a load that never got an answer, not a miss.

- **Calls:** [imageExists.finish](#fn-probe-transport-js-imageexists-finish)
- **Called by:** [resolveQuality](#fn-probe-transport-js-resolvequality)
- **Browser:** `Image`, `setTimeout`

<a id="fn-probe-transport-js-imageexists-finish"></a>
**`imageExists.finish(ok)`** · arrow · L80–87

Settles the probe once, with its timer and the image's handlers cleared.

- **Called by:** [imageExists](#fn-probe-transport-js-imageexists), [imageExists.img.onerror](#fn-probe-transport-js-imageexists-img-onerror), [imageExists.img.onload](#fn-probe-transport-js-imageexists-img-onload)

<a id="fn-probe-transport-js-imageexists-img-onload"></a>
**`imageExists.img.onload()`** · assigned · L90–90

A missing derivative can also come back 200 with a grey placeholder, which loads fine and has to be caught on its dimensions instead.

- **Calls:** [imageExists.finish](#fn-probe-transport-js-imageexists-finish)

<a id="fn-probe-transport-js-imageexists-img-onerror"></a>
**`imageExists.img.onerror()`** · assigned · L93–93

The image failed to load: unknown (a 404 and a network error look the same to an &lt;img>).

- **Calls:** [imageExists.finish](#fn-probe-transport-js-imageexists-finish)

<a id="fn-probe-transport-js-resolvequality"></a>
**`resolveQuality(videoId, onScreen)`** · function, async, exported · L105–113

The mode's best rung if it exists, else the guaranteed floor. On screen the image is asked (imageExists: cached in Fast mode, the promotion's own load otherwise); off screen a HEAD, because an &lt;img> there would pull down a full image nobody is looking at.

- **Calls:** [features/thumbnail-quality/ladder.js › buildUrl](#fn-ladder-js-buildurl), [imageExists](#fn-probe-transport-js-imageexists)
- **Called by:** [features/thumbnail-quality/probes.js › startProbe](#fn-probes-js-startprobe)

<a id="mod-probes-js"></a>

## features/thumbnail-quality/probes.js

> Verification: the queue of videos whose best rung is unproven, its budgets and gates (it yields to scrolling, key navigation and whatever is on screen), and what happens when a probe lands.

317 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js), [features/thumbnail-quality/probe-transport.js](#mod-probe-transport-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js) · imported by [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js)

**At load:**

- **Browser:** `requestIdleCallback`, `setTimeout`

<a id="fn-probes-js-clearprobetiers"></a>
**`clearProbeTiers()`** · function, exported · L50–54

Forgets the latest parse and its budget; part of the module's cleanup.

- **Called by:** [features/thumbnail-quality/index.js › cleanup](#fn-index-js-cleanup)

<a id="fn-probes-js-scheduleprobe"></a>
**`scheduleProbe(videoId)`** · function, exported · L60–72

Queues a probe of `videoId`'s thumbnail sizes, unless its answer is cached, it was tried this session, or the session's probe limit is reached.

- **Called by:** [features/thumbnail-quality/rewrite.js › upgradeVideo](#fn-rewrite-js-upgradevideo)

<a id="fn-probes-js-applycorrection"></a>
**`applyCorrection(videoId, rank)`** · function · L80–90

Rewrites the entries we gambled on now that the answer is known; true when there were entries to write to. An entry already drawn at that rung stays as it is: its URL may be a signed or vi_webp form of the same file, and the /vi/ JPEG a new download.

- **Calls:** [features/thumbnail-quality/ladder.js › buildUrl](#fn-ladder-js-buildurl)
- **Called by:** [onProbeDone](#fn-probes-js-onprobedone)

<a id="fn-probes-js-settledrank"></a>
**`settledRank(videoId, resolved)`** · function · L93–97

Resolved rank clamped to what the video was already known to support.

- **Called by:** [onProbeDone](#fn-probes-js-onprobedone)

<a id="fn-probes-js-onprobedone"></a>
**`onProbeDone(videoId, rank, generation)`** · function · L103–169

A probe's answer: counts it, drops it when the strategy changed meanwhile, saves a real answer to the cache, corrects the tiles on screen, and starts the next probe.

- **Calls:** [features/thumbnail-quality/cache.js › capSet](#fn-cache-js-capset), [features/thumbnail-quality/cache.js › scheduleSave](#fn-cache-js-schedulesave), [features/thumbnail-quality/ladder.js › drawsUnproven](#fn-ladder-js-drawsunproven), [applyCorrection](#fn-probes-js-applycorrection), [drainProbes](#fn-probes-js-drainprobes), [settledRank](#fn-probes-js-settledrank), [features/thumbnail-quality/promotion.js › schedulePromotionSweep](#fn-promotion-js-schedulepromotionsweep)
- **Called by:** [startProbe](#fn-probes-js-startprobe)

<a id="fn-probes-js-deferprobes"></a>
**`deferProbes()`** · function, exported · L176–195

Called from the parse. The first videos this parse queued are the top of the response - what the user is looking at - so a small burst of them goes through immediately; everything else waits for the surface to settle.

- **Calls:** [drainProbes](#fn-probes-js-drainprobes)
- **Called by:** [features/thumbnail-quality/dispatch.js › upgradeResponseThumbnails](#fn-dispatch-js-upgraderesponsethumbnails), [features/thumbnail-quality/index.js › handleVisibilityChange](#fn-index-js-handlevisibilitychange)
- **Browser:** `setTimeout`

<a id="fn-probes-js-takefrom"></a>
**`takeFrom(set, picked, limit, inQueue)`** · function · L198–206

Appends to `picked`, up to `limit`, the ids of `set` that are queued (or all of them when `inQueue` is false).

- **Called by:** [pickProbeIds](#fn-probes-js-pickprobeids)

<a id="fn-probes-js-pickprobeids"></a>
**`pickProbeIds(rendered, limit)`** · function · L215–223

Up to `limit` queued ids: the on-screen ones first, then the latest parse's in the order it queued them, then the head of the queue. Each tier is read from its own small set against the queue, so a drain costs the size of those sets plus `limit`, not a pass over the whole queue (up to PROBE_ATTEMPT_LIMIT ids, drained three at a time).

- **Calls:** [takeFrom](#fn-probes-js-takefrom)
- **Called by:** [runProbeRound](#fn-probes-js-runproberound)

<a id="fn-probes-js-admittotier"></a>
**`admitToTier(videoId, onScreen)`** · function · L226–241

Whether a picked video may go now, spending the budget of its tier.

- **Called by:** [runProbeRound](#fn-probes-js-runproberound)

<a id="fn-probes-js-startprobe"></a>
**`startProbe(videoId, onScreen, generation)`** · function · L244–253

Starts the probe of one video, unless the cache has the answer already.

- **Calls:** [features/thumbnail-quality/probe-transport.js › resolveQuality](#fn-probe-transport-js-resolvequality), [onProbeDone](#fn-probes-js-onprobedone)
- **Called by:** [runProbeRound](#fn-probes-js-runproberound)

<a id="fn-probes-js-runproberound"></a>
**`runProbeRound()`** · function · L256–301

One round of the queue, from the idle callback: as many probes as the slots and tiers allow.

- **Calls:** [features/thumbnail-quality/navigation-pause.js › navPauseLeft](#fn-navigation-pause-js-navpauseleft), [admitToTier](#fn-probes-js-admittotier), [drainProbes](#fn-probes-js-drainprobes), [pickProbeIds](#fn-probes-js-pickprobeids), [startProbe](#fn-probes-js-startprobe), [features/thumbnail-quality/rendered.js › sampleRenderedIds](#fn-rendered-js-samplerenderedids)
- **Called by:** [drainProbes](#fn-probes-js-drainprobes)
- **Browser:** `setTimeout`

<a id="fn-probes-js-drainprobes"></a>
**`drainProbes()`** · function · L304–317

Starts the probe pump in idle time, or waits while the remote is moving through rows.

- **Calls:** [features/thumbnail-quality/navigation-pause.js › navPauseLeft](#fn-navigation-pause-js-navpauseleft), [runProbeRound](#fn-probes-js-runproberound), [features/thumbnail-quality/state.js › clearStateTimer](#fn-state-js-clearstatetimer)
- **Called by:** [deferProbes](#fn-probes-js-deferprobes), [onProbeDone](#fn-probes-js-onprobedone), [runProbeRound](#fn-probes-js-runproberound)
- **Browser:** `setTimeout`

<a id="mod-promotion-js"></a>

## features/thumbnail-quality/promotion.js

> Live promotion: patches tiles already on screen once verification found a better rung than the one they were drawn with.

71 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/log.js](#mod-log-js) · imported by [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/probes.js](#mod-probes-js)

<a id="fn-promotion-js-schedulepromotionsweep"></a>
**`schedulePromotionSweep(delay)`** · function, exported · L11–14

The one sweep timer: a sweep already pending keeps its time.

- **Calls:** [runPromotionSweep](#fn-promotion-js-runpromotionsweep)
- **Called by:** [features/thumbnail-quality/dispatch.js › upgradeResponseThumbnails](#fn-dispatch-js-upgraderesponsethumbnails), [features/thumbnail-quality/probes.js › onProbeDone](#fn-probes-js-onprobedone), [runPromotionSweep](#fn-promotion-js-runpromotionsweep)
- **Browser:** `setTimeout`

<a id="fn-promotion-js-runpromotionsweep"></a>
**`runPromotionSweep()`** · function · L19–71

Only runs when verification disagrees with what was already emitted, which after the first session is rare. Batched into one sweep so N corrections cost one querySelectorAll, not N.

- **Calls:** [features/thumbnail-quality/ladder.js › buildUrl](#fn-ladder-js-buildurl), [features/thumbnail-quality/navigation-pause.js › navPauseLeft](#fn-navigation-pause-js-navpauseleft), [schedulePromotionSweep](#fn-promotion-js-schedulepromotionsweep), [features/thumbnail-quality/rendered.js › renderedThumbnails](#fn-rendered-js-renderedthumbnails)
- **Called by:** [schedulePromotionSweep](#fn-promotion-js-schedulepromotionsweep)

<a id="mod-rendered-js"></a>

## features/thumbnail-quality/rendered.js

> The tiles the app currently has thumbnails rendered for: a free visibility signal, since the list is virtualised and "has a rendered thumbnail" already means "on or near screen". Not IntersectionObserver: webOS 3 has none, and reading .style.backgroundImage touches no layout at all.

58 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [core/selectors.js](core.md#mod-selectors-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js) · imported by [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js)

<a id="fn-rendered-js-renderedthumbnails"></a>
**`renderedThumbnails(fn)`** · function, exported · L15–24

Calls `fn(element, videoId, backgroundImage)` for every rendered tile whose background is a thumbnail. No try: the selector is a constant, and a try would keep this loop (every sample and every sweep) unoptimised on webOS 3.

- **Called by:** [features/thumbnail-quality/promotion.js › runPromotionSweep](#fn-promotion-js-runpromotionsweep), [sampleRenderedIds](#fn-rendered-js-samplerenderedids)
- **Selectors:** `THUMBNAIL_NODES`
- **Browser:** `querySelectorAll`

<a id="fn-rendered-js-samplerenderedids"></a>
**`sampleRenderedIds()`** · function, exported · L27–46

The videoIds on screen, sampled at most once per VISIBLE_SAMPLE_TTL.

- **Calls:** [renderedThumbnails](#fn-rendered-js-renderedthumbnails), [sameIds](#fn-rendered-js-sameids)
- **Called by:** [features/thumbnail-quality/probes.js › runProbeRound](#fn-probes-js-runproberound)

<a id="fn-rendered-js-sameids"></a>
**`sameIds(a, b)`** · function · L49–58

Whether two sets hold the same ids.

- **Called by:** [sampleRenderedIds](#fn-rendered-js-samplerenderedids)

<a id="mod-rewrite-js"></a>

## features/thumbnail-quality/rewrite.js

> Rewrites one thumbnail URL, and every URL in one thumbnail container, to the best rung the current mode may emit; schedules a probe when that is unproven.

169 lines · imports [features/thumbnail-quality/constants.js](#mod-constants-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js), [features/thumbnail-quality/state.js](#mod-state-js), [features/thumbnail-quality/probes.js](#mod-probes-js) · imported by [features/thumbnail-quality/dispatch.js](#mod-dispatch-js)

<a id="fn-rewrite-js-upgradevideo"></a>
**`upgradeVideo(matched, from, to, videoId, proven)`** · function · L32–86

Rewrites the matched entries `from` to `to` (triples, all of one video) to the rung the mode may emit, and returns how many URLs changed. What the video may get is decided once for all of them: a container holds one video, usually more than once (the tile header and its long-press menu).

The emitted rung is the useful one (sddefault in 'sd', else maxres). A cached probe answer clamps it; for a video not probed yet the modes that draw unproven rungs ('sd', 'eager') emit it as it is, and 'safe' clamps it to `proven`, the best rung shipped in this response, with the better one landing on a later parse. Either way a probe is scheduled when the useful rung is unproven. Entry width/height are left alone; the app sizes tiles from them.

- **Calls:** [features/thumbnail-quality/ladder.js › buildUrl](#fn-ladder-js-buildurl), [features/thumbnail-quality/ladder.js › drawsUnproven](#fn-ladder-js-drawsunproven), [features/thumbnail-quality/probes.js › scheduleProbe](#fn-probes-js-scheduleprobe), [pendingEntriesOf](#fn-rewrite-js-pendingentriesof)
- **Called by:** [upgradeContainer](#fn-rewrite-js-upgradecontainer)

<a id="fn-rewrite-js-pendingentriesof"></a>
**`pendingEntriesOf(videoId, floor)`** · function · L95–112

The entries of a video we gambled on, for the write-back (each followed by the rung it is drawn at), with what the video is already known to support recorded beside them; the list is capped so a long session cannot grow it without bound. Eviction is safe: it only costs that video the write-back, and the DOM sweep still covers it.

- **Called by:** [upgradeVideo](#fn-rewrite-js-upgradevideo)

<a id="fn-rewrite-js-upgradecontainer"></a>
**`upgradeContainer(container)`** · function, exported · L119–169

Rewrite every URL in a thumbnail container in place. Handles both `{ thumbnails: [...] }` (tileRenderer and friends) and `{ sources: [...] }` (the newer \*ViewModel schema).

- **Calls:** [features/thumbnail-quality/ladder.js › rankOf](#fn-ladder-js-rankof), [upgradeVideo](#fn-rewrite-js-upgradevideo)
- **Called by:** [features/thumbnail-quality/dispatch.js › scanForThumbnails](#fn-dispatch-js-scanforthumbnails), [features/thumbnail-quality/dispatch.js › upgradeAutoplay](#fn-dispatch-js-upgradeautoplay), [features/thumbnail-quality/dispatch.js › upgradeByType](#fn-dispatch-js-upgradebytype), [features/thumbnail-quality/dispatch.js › upgradeItem](#fn-dispatch-js-upgradeitem)

<a id="mod-state-js"></a>

## features/thumbnail-quality/state.js

> Everything the thumbnail modules share and mutate: the current mode, the verification caches and queues, timers and budgets. Scalars live on `state` so every module reads the same value; collections are exported directly.

90 lines · imports [core/config.js](core.md#mod-config-js), [features/thumbnail-quality/ladder.js](#mod-ladder-js) · imported by [features/thumbnail-quality/cache.js](#mod-cache-js), [features/thumbnail-quality/dispatch.js](#mod-dispatch-js), [features/thumbnail-quality/index.js](#mod-index-js), [features/thumbnail-quality/navigation-pause.js](#mod-navigation-pause-js), [features/thumbnail-quality/probe-transport.js](#mod-probe-transport-js), [features/thumbnail-quality/probes.js](#mod-probes-js), [features/thumbnail-quality/promotion.js](#mod-promotion-js), [features/thumbnail-quality/rendered.js](#mod-rendered-js), [features/thumbnail-quality/rewrite.js](#mod-rewrite-js)

**At load:**

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [features/thumbnail-quality/ladder.js › usefulRankFor](#fn-ladder-js-usefulrankfor)
- **Settings:** reads `thumbnailQualityMode`, `upgradeThumbnails`

<a id="fn-state-js-clearstatetimer"></a>
**`clearStateTimer(name)`** · function, exported · L56–61

Clears the timer in `state[name]`, if one is set.

- **Called by:** [features/thumbnail-quality/cache.js › cancelSave](#fn-cache-js-cancelsave), [features/thumbnail-quality/index.js › cleanup](#fn-index-js-cleanup), [features/thumbnail-quality/probes.js › drainProbes](#fn-probes-js-drainprobes)
