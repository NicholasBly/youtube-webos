# Code map: features/adblock/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/adblock/constants.js](#mod-constants-js), [features/adblock/emoji-wrap-absent.js](#mod-emoji-wrap-absent-js), [features/adblock/emoji-wrap.js](#mod-emoji-wrap-js), [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/flags.js](#mod-flags-js), [features/adblock/index.js](#mod-index-js), [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/log.js](#mod-log-js), [features/adblock/nav-filters.js](#mod-nav-filters-js), [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/player-filters.js](#mod-player-filters-js), [features/adblock/response-filters.js](#mod-response-filters-js), [features/adblock/search.js](#mod-search-js), [features/adblock/stringify-hook.ts](#mod-stringify-hook-ts), [features/adblock/text-fixes.js](#mod-text-fixes-js), [features/adblock/tracking-block.js](#mod-tracking-block-js)

<a id="mod-constants-js"></a>

## features/adblock/constants.js

> String tables shared by the adblock modules.

53 lines · imported by [features/adblock/flags.js](#mod-flags-js), [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/nav-filters.js](#mod-nav-filters-js), [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/tracking-block.js](#mod-tracking-block-js)

**At load:**

- **Settings:** uses `enableAdBlock`, `enableTrackingBlock`, `removeGlobalShorts`, `removeLiveVideos`, `removeTopLiveGames`, `removeMostRelevant`, `hideGuestSignInPrompts`, `enableLegacyEmojiFix`, `hideEndcards`, `upgradeThumbnails`, `enableRowsAhead`

<a id="mod-emoji-wrap-absent-js"></a>

## features/adblock/emoji-wrap-absent.js

> The webOS 22+ build's emoji-wrap.js (webpack.config.js): the legacy emoji fix is off on every engine that runs this build, so nothing here is reached with work to do.

11 lines

<a id="fn-emoji-wrap-absent-js-wrapemojiintree"></a>
**`wrapEmojiInTree()`** · function, exported · L6–6

Nothing to wrap.

<a id="fn-emoji-wrap-absent-js-mayneedemojiwork"></a>
**`mayNeedEmojiWork()`** · function, exported · L9–11

No emoji work on this build.

<a id="mod-emoji-wrap-js"></a>

## features/adblock/emoji-wrap.js

> The legacy emoji fix's half in the response: every emoji in the parsed tree wrapped in sentinel characters, so features/emoji-font can swap it for an image on webOS 3 and 4. The webOS 22+ build carries emoji-wrap-absent.js in its place (webpack.config.js): the fix is never on there.

250 lines · imports [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/response-filters.js](#mod-response-filters-js)

**At load:**

- **Calls:** [classBody](#fn-emoji-wrap-js-classbody)

<a id="fn-emoji-wrap-js-classbody"></a>
**`classBody(re)`** · arrow · L30–30

The body of the first character class in `re`: what is between its [ and ].

- **Called by:** [at load](#mod-emoji-wrap-js)

<a id="fn-emoji-wrap-js-mayneedemojiwork"></a>
**`mayNeedEmojiWork(text)`** · function, exported · L58–60

Whether the JSON text can hold anything the emoji walk would change: one native scan of the text, so the walk over every item of a response (the most expensive pass on webOS 3 and 4) is skipped for the ones without.

- **Called by:** [features/adblock/parse-hook.js › parseAndFilter](#fn-parse-hook-js-parseandfilter)

<a id="fn-emoji-wrap-js-processemojistring"></a>
**`processEmojiString(str)`** · function · L67–75

A text with each emoji wrapped in sentinels (U+200B before, U+200C after) for features/emoji-font to draw as an image on webOS 3/4. Sentinels already in the text are removed first, so it is safe to run twice; plain text comes back as it is.

- **Called by:** [processTextFieldsInPlace](#fn-emoji-wrap-js-processtextfieldsinplace)

<a id="fn-emoji-wrap-js-splitintoruns"></a>
**`splitIntoRuns(text, originalRun)`** · function · L78–94

Called only for text that passed NEEDS_TEXT_WORK_RE in the caller.

- **Called by:** [processTextFieldsInPlace](#fn-emoji-wrap-js-processtextfieldsinplace)

<a id="fn-emoji-wrap-js-hasoffsetruns"></a>
**`hasOffsetRuns(obj)`** · function · L97–102

Whether `obj` has offset runs (commandRuns, styleRuns...) over its `content`.

- **Called by:** [processTextFieldsInPlace](#fn-emoji-wrap-js-processtextfieldsinplace)

<a id="fn-emoji-wrap-js-wrapattributedcontent"></a>
**`wrapAttributedContent(obj)`** · function · L111–161

An attributed string's `content` wrapped, and the offsets of its runs (UTF-16 units of `content`) moved with the characters they name: a run starting at an emoji starts at its opening sentinel, one ending with it ends after the closing one. Without this a mention, link or timestamp after an emoji pointed two characters early per emoji.

- **Calls:** [wrapAttributedContent.moved](#fn-emoji-wrap-js-wrapattributedcontent-moved)
- **Called by:** [processTextFieldsInPlace](#fn-emoji-wrap-js-processtextfieldsinplace)

<a id="fn-emoji-wrap-js-wrapattributedcontent-moved"></a>
**`wrapAttributedContent.moved(p)`** · arrow · L135–147

Where offset `p` of `src` lands in `out`.

- **Called by:** [wrapAttributedContent](#fn-emoji-wrap-js-wrapattributedcontent)

<a id="fn-emoji-wrap-js-processtextfieldsinplace"></a>
**`processTextFieldsInPlace(obj)`** · function · L165–216

Non-recursive: the emoji/text fields of a single node, in place. walkAndProcess guarantees obj is a non-null object.

- **Calls:** [hasOffsetRuns](#fn-emoji-wrap-js-hasoffsetruns), [processEmojiString](#fn-emoji-wrap-js-processemojistring), [splitIntoRuns](#fn-emoji-wrap-js-splitintoruns), [wrapAttributedContent](#fn-emoji-wrap-js-wrapattributedcontent)
- **Called by:** [walkEmoji](#fn-emoji-wrap-js-walkemoji)

<a id="fn-emoji-wrap-js-wrapemojiintree"></a>
**`wrapEmojiInTree(obj)`** · function, exported · L223–225

Wraps the emoji in the text fields of `obj` and every node below it.

- **Calls:** [walkEmoji](#fn-emoji-wrap-js-walkemoji)
- **Called by:** [features/adblock/item-filters.js › filterItems](#fn-item-filters-js-filteritems), [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [features/adblock/parse-hook.js › wrapEmojiInFrameworkUpdates](#fn-parse-hook-js-wrapemojiinframeworkupdates), [features/adblock/response-filters.js › filterActions](#fn-response-filters-js-filteractions), [features/adblock/response-filters.js › filterContinuation](#fn-response-filters-js-filtercontinuation), [features/adblock/response-filters.js › filterWatchResponse](#fn-response-filters-js-filterwatchresponse)

<a id="fn-emoji-wrap-js-walkemoji"></a>
**`walkEmoji(obj, depth)`** · function · L229–250

The depth is a plain argument: a default value would cost an `arguments` read per node in the legacy build.

- **Calls:** [processTextFieldsInPlace](#fn-emoji-wrap-js-processtextfieldsinplace)
- **Called by:** [wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree)

<a id="mod-fallback-js"></a>

## features/adblock/fallback.js

> The fallback for a response no schema path matched, and the guide filter for the small guide response: one bounded search over the body serves both.

82 lines · imports [features/adblock/log.js](#mod-log-js), [features/adblock/search.js](#mod-search-js), [features/adblock/nav-filters.js](#mod-nav-filters-js), [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/player-filters.js](#mod-player-filters-js), [features/adblock/response-filters.js](#mod-response-filters-js) · imported by [features/adblock/parse-hook.js](#mod-parse-hook-js)

<a id="fn-fallback-js-filternavfound"></a>
**`filterNavFound(found, removeGlobalShorts, removeLiveVideos)`** · function · L30–44

The guide lists in a findObjects() result, filtered.

- **Calls:** [features/adblock/nav-filters.js › filterNavLists](#fn-nav-filters-js-filternavlists)
- **Called by:** [applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [removeBlockedNavEntries](#fn-fallback-js-removeblockednaventries)

<a id="fn-fallback-js-removeblockednaventries"></a>
**`removeBlockedNavEntries(data, removeGlobalShorts, removeLiveVideos)`** · function, exported · L51–54

The guide arrives in its own small response that matches no content schema: searched for the guide and tab renderers (bounded) and filtered. The known shape, BROWSE_TABS, goes through removeBlockedNavTabs instead.

- **Calls:** [filterNavFound](#fn-fallback-js-filternavfound), [features/adblock/search.js › findObjects](#fn-search-js-findobjects)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](#fn-parse-hook-js-filterresponse)

<a id="fn-fallback-js-applyfallbackfilters"></a>
**`applyFallbackFilters(data, config)`** · function, exported · L57–82

A large body no schema path matched: the content and guide filters over whatever the search finds.

- **Calls:** [filterNavFound](#fn-fallback-js-filternavfound), [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [features/adblock/player-filters.js › removeEndcards](#fn-player-filters-js-removeendcards), [features/adblock/player-filters.js › removePlayerAds](#fn-player-filters-js-removeplayerads), [features/adblock/response-filters.js › filterList](#fn-response-filters-js-filterlist), [features/adblock/response-filters.js › processActions](#fn-response-filters-js-processactions), [features/adblock/search.js › findObjects](#fn-search-js-findobjects)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](#fn-parse-hook-js-filterresponse)

<a id="mod-flags-js"></a>

## features/adblock/flags.js

> The filter switches as one mutable snapshot, refreshed when a setting changes rather than re-read on every JSON.parse.

93 lines · imports [core/config.js](core.md#mod-config-js), [core/webos.js](core.md#mod-webos-js), [features/adblock/constants.js](#mod-constants-js) · imported by [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/stringify-hook.ts](#mod-stringify-hook-ts), [features/adblock/tracking-block.js](#mod-tracking-block-js)

**At load:**

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [recomputeFilterFlags](#fn-flags-js-recomputefilterflags), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener)
- **Settings:** uses `(all)`

<a id="fn-flags-js-onflagschange"></a>
**`onFlagsChange(fn)`** · function, exported · L45–47

Calls `fn` whenever the flags were recomputed (a setting changed).

- **Called by:** [features/adblock/tracking-block.js › startTrackingBlock](#fn-tracking-block-js-starttrackingblock)

<a id="fn-flags-js-recomputefilterflags"></a>
**`recomputeFilterFlags()`** · function · L53–88

Recomputes cfgFlags, cfgFlagsNoEmoji and filterState from the settings, then calls the onFlagsChange listeners. Runs at load and on every change of a key in CONFIG_KEYS.

- **Calls:** [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion)
- **Called by:** [at load](#mod-flags-js)
- **Settings:** uses `enableAdBlock`, `enableTrackingBlock`, `removeGlobalShorts`, `removeLiveVideos`, `removeTopLiveGames`, `removeMostRelevant`, `hideGuestSignInPrompts`, `enableLegacyEmojiFix`, `hideEndcards`, `upgradeThumbnails`, `enableRowsAhead`

<a id="mod-index-js"></a>

## features/adblock/index.js

> Ad blocking: the JSON.parse and JSON.stringify hooks (parse-hook.js, stringify-hook.ts) that userScript.js installs for the life of the page, and the telemetry blockers (tracking-block.js); all of them follow the adblock flags (flags.js).

7 lines · imported by [userScript.js](app.md#mod-userscript-js)

<a id="mod-item-filters-js"></a>

## features/adblock/item-filters.js

> Shelves and the items in them: ads, Shorts, live streams and guest prompts, removed in place; a shelf that ends up empty goes with its items.

248 lines · imports [features/adblock/constants.js](#mod-constants-js), [features/adblock/emoji-wrap.js](#mod-emoji-wrap-js), [core/innertube.js](core.md#mod-innertube-js), [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/response-filters.js](#mod-response-filters-js)

<a id="fn-item-filters-js-getshelftitle"></a>
**`getShelfTitle(shelf)`** · function · L9–17

A shelf's title text, from its own title or its header's avatar lockup; '' when it has none.

- **Called by:** [shelfSurvives](#fn-item-filters-js-shelfsurvives), [shouldDropShelf](#fn-item-filters-js-shoulddropshelf)

<a id="fn-item-filters-js-isliveitem"></a>
**`isLiveItem(item)`** · function · L35–69

Is this item a live stream?

The badge lives at, from an item in a shelf's item list: lockupViewModel.contentImage.thumbnailViewModel .overlays[].thumbnailBottomOverlayViewModel .badges[].thumbnailBadgeViewModel.badgeStyle

Both arrays are searched rather than indexed at [0]: a thumbnail carries several overlays (duration, progress, badges) and their order is not guaranteed, so hardcoding the first entry would miss the badge whenever anything else is attached to the thumbnail.

The older tileRenderer shape is kept as a fallback so this keeps working if the viewModel schema is swapped out again.

- **Called by:** [shouldDropItem](#fn-item-filters-js-shoulddropitem)

<a id="fn-item-filters-js-isreelad"></a>
**`isReelAd(item)`** · function · L74–81

Whether a Shorts item is an ad (flagged in its reelWatchEndpoint, or of the reel-ad video type).

- **Called by:** [shouldDropItem](#fn-item-filters-js-shoulddropitem)

<a id="fn-item-filters-js-hasadrenderer"></a>
**`hasAdRenderer(item)`** · function · L84–86

Whether an item is an ad slot or the home page masthead ad.

- **Called by:** [shouldDropItem](#fn-item-filters-js-shoulddropitem)

<a id="fn-item-filters-js-isguestprompt"></a>
**`isGuestPrompt(item)`** · function · L89–95

Whether an item is one of the sign-in nudges shown to guests.

- **Called by:** [shouldDropItem](#fn-item-filters-js-shoulddropitem)

<a id="fn-item-filters-js-isshortsitem"></a>
**`isShortsItem(item)`** · function · L100–115

Whether an item is a Short: a Shorts tile, a reel item, or anything that opens the Shorts player.

- **Called by:** [shouldDropItem](#fn-item-filters-js-shoulddropitem)

<a id="fn-item-filters-js-shoulddropitem"></a>
**`shouldDropItem(item, flags)`** · function · L122–127

Whether an item (a tile, a lockup, a nudge) goes under the flags: the one rule for items in a shelf, in a grid or continuation, and bare in a section list.

- **Calls:** [hasAdRenderer](#fn-item-filters-js-hasadrenderer), [isGuestPrompt](#fn-item-filters-js-isguestprompt), [isLiveItem](#fn-item-filters-js-isliveitem), [isReelAd](#fn-item-filters-js-isreelad), [isShortsItem](#fn-item-filters-js-isshortsitem)
- **Called by:** [filterItems](#fn-item-filters-js-filteritems), [filterSectionList](#fn-item-filters-js-filtersectionlist)

<a id="fn-item-filters-js-anycontentcheck"></a>
**`anyContentCheck(flags)`** · function · L133–135

Whether any check applies to a shelf or to an item under the flags: every one of them counts only with Ad Blocking on (flags.js).

- **Called by:** [filterItems](#fn-item-filters-js-filteritems), [filterSectionList](#fn-item-filters-js-filtersectionlist)

<a id="fn-item-filters-js-shoulddropshelf"></a>
**`shouldDropShelf(shelf, flags)`** · function · L138–150

Whether a whole shelf goes under the flags: the Shorts shelf by type or title, the titled shelves.

- **Calls:** [getShelfTitle](#fn-item-filters-js-getshelftitle)
- **Called by:** [shelfSurvives](#fn-item-filters-js-shelfsurvives)

<a id="fn-item-filters-js-filternestedlist"></a>
**`filterNestedList(list, pass)`** · function · L159–163

One nested list filtered, counting the items it had in `pass.had` and the items left in `pass.left`. Declared once, with the pass's state as its argument, rather than as a closure for every shelf of every response. skipEmoji: the caller's wrapEmojiInTree(item) walks the whole section, nested items included.

- **Calls:** [filterItems](#fn-item-filters-js-filteritems)
- **Called by:** [filterSectionList](#fn-item-filters-js-filtersectionlist), [shelfSurvives](#fn-item-filters-js-shelfsurvives)

<a id="fn-item-filters-js-shelfsurvives"></a>
**`shelfSurvives(item, config, contextName, pass)`** · function · L175–188

Filters a shelf's lists in place and says whether the shelf stays: not when its type or title is blocked, and not when the filtering emptied it. A shelf we emptied has to go with its items: left in place it still has a title and a content box, so the app renders the header plus a &lt;ytlr-ghost-surface> of skeleton tiles and waits forever for content that was already removed (the "Live now" row of grey boxes). Only a shelf the filter emptied: one whose content uses some other renderer was never filtered here, and one that arrived with an empty list was not emptied here.

- **Calls:** [core/innertube.js › forEachItemList](core.md#fn-innertube-js-foreachitemlist), [filterNestedList](#fn-item-filters-js-filternestedlist), [getShelfTitle](#fn-item-filters-js-getshelftitle), [shouldDropShelf](#fn-item-filters-js-shoulddropshelf)
- **Called by:** [filterSectionList](#fn-item-filters-js-filtersectionlist)

<a id="fn-item-filters-js-filtersectionlist"></a>
**`filterSectionList(contents, config, contextName, skipEmoji)`** · function, exported · L191–226

skipEmoji: see filterItems below.

- **Calls:** [core/innertube.js › forEachItemList](core.md#fn-innertube-js-foreachitemlist), [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree), [anyContentCheck](#fn-item-filters-js-anycontentcheck), [filterNestedList](#fn-item-filters-js-filternestedlist), [shelfSurvives](#fn-item-filters-js-shelfsurvives), [shouldDropItem](#fn-item-filters-js-shoulddropitem)
- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [features/adblock/response-filters.js › filterBrowseTabs](#fn-response-filters-js-filterbrowsetabs), [features/adblock/response-filters.js › filterContinuation](#fn-response-filters-js-filtercontinuation), [features/adblock/response-filters.js › filterMainContent](#fn-response-filters-js-filtermaincontent), [features/adblock/response-filters.js › filterPivot](#fn-response-filters-js-filterpivot)

<a id="fn-item-filters-js-filteritems"></a>
**`filterItems(items, config, skipEmoji)`** · function, exported · L230–248

skipEmoji: set when the caller runs its own wrapEmojiInTree over an ancestor of these items, so each tile is walked once.

- **Calls:** [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree), [anyContentCheck](#fn-item-filters-js-anycontentcheck), [shouldDropItem](#fn-item-filters-js-shoulddropitem)
- **Called by:** [filterNestedList](#fn-item-filters-js-filternestedlist), [features/adblock/response-filters.js › filterList](#fn-response-filters-js-filterlist), [features/adblock/response-filters.js › processActions](#fn-response-filters-js-processactions)

<a id="mod-log-js"></a>

## features/adblock/log.js

> The logger of the feature's modules: their messages carry [AdBlock] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/adblock/emoji-wrap.js](#mod-emoji-wrap-js), [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/nav-filters.js](#mod-nav-filters-js), [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/player-filters.js](#mod-player-filters-js), [features/adblock/response-filters.js](#mod-response-filters-js), [features/adblock/search.js](#mod-search-js), [features/adblock/stringify-hook.ts](#mod-stringify-hook-ts), [features/adblock/tracking-block.js](#mod-tracking-block-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-nav-filters-js"></a>

## features/adblock/nav-filters.js

> The left-hand guide and the tab bar: drops the Shorts and Live entries when those are hidden. fallback.js finds the guide in a response; BROWSE_TABS has it at a known path.

66 lines · imports [features/adblock/constants.js](#mod-constants-js), [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/response-filters.js](#mod-response-filters-js)

<a id="fn-nav-filters-js-isnaventryblocked"></a>
**`isNavEntryBlocked(entry, removeGlobalShorts, removeLiveVideos)`** · function · L12–35

Whether a guide or tab entry is one being hidden: by its endpoint first (a reelWatchEndpoint or browseId FEshorts for Shorts, FEtopics_live for Live), then, for Shorts only, by its title.

- **Called by:** [dropBlocked](#fn-nav-filters-js-dropblocked)

<a id="fn-nav-filters-js-removeblockednavtabs"></a>
**`removeBlockedNavTabs(nav, removeGlobalShorts, removeLiveVideos)`** · function, exported · L38–41

The tab bar of a BROWSE_TABS response, at its known location: no search.

- **Calls:** [filterNavLists](#fn-nav-filters-js-filternavlists)
- **Called by:** [features/adblock/response-filters.js › filterBrowseTabs](#fn-response-filters-js-filterbrowsetabs)

<a id="fn-nav-filters-js-dropblocked"></a>
**`dropBlocked(list, removeGlobalShorts, removeLiveVideos)`** · function · L44–52

Drops the blocked entries of one list in place.

- **Calls:** [isNavEntryBlocked](#fn-nav-filters-js-isnaventryblocked)
- **Called by:** [filterNavLists](#fn-nav-filters-js-filternavlists)

<a id="fn-nav-filters-js-filternavlists"></a>
**`filterNavLists(lists, removeGlobalShorts, removeLiveVideos)`** · function, exported · L55–66

Drops blocked entries from each list, and from each section's own tabs or items.

- **Calls:** [dropBlocked](#fn-nav-filters-js-dropblocked)
- **Called by:** [features/adblock/fallback.js › filterNavFound](#fn-fallback-js-filternavfound), [removeBlockedNavTabs](#fn-nav-filters-js-removeblockednavtabs)

<a id="mod-parse-hook-js"></a>

## features/adblock/parse-hook.js

> The JSON.parse hook: classifies each InnerTube response and runs the filters, the thumbnail rewrite and the text fixes over it before the app sees it.

169 lines · imports [core/page-state.js](core.md#mod-page-state-js), [core/log.js](core.md#mod-log-js), [features/thumbnail-quality/index.js](features-thumbnail-quality.md#mod-index-js), [features/rows-ahead.js](features.md#mod-rows-ahead-js), [features/adblock/constants.js](#mod-constants-js), [core/innertube.js](core.md#mod-innertube-js), [features/adblock/search.js](#mod-search-js), [features/adblock/text-fixes.js](#mod-text-fixes-js), [features/adblock/emoji-wrap.js](#mod-emoji-wrap-js), [features/adblock/response-filters.js](#mod-response-filters-js), [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/flags.js](#mod-flags-js), [features/force-codec/hooks.js](features-force-codec.md#mod-hooks-js), [features/force-codec/state.js](features-force-codec.md#mod-state-js), [features/adblock/log.js](#mod-log-js)

<a id="fn-parse-hook-js-logschemamiss"></a>
**`logSchemaMiss(data, textLength)`** · function · L22–26

Debug log for a large response no schema recognised (the fallback filters ran instead).

- **Called by:** [filterResponse](#fn-parse-hook-js-filterresponse)

<a id="fn-parse-hook-js-wrapemojiinframeworkupdates"></a>
**`wrapEmojiInFrameworkUpdates(data, flags)`** · function · L32–36

The legacy emoji rewrite over frameworkUpdates, the one part of a response the content filters never reach.

- **Calls:** [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree)
- **Called by:** [filterResponse](#fn-parse-hook-js-filterresponse)

<a id="fn-parse-hook-js-hookedparse"></a>
**`hookedParse(text, reviver)`** · function · L48–57

The JSON.parse replacement. Texts under 500 characters (YouTube's many small blobs) go straight to the native parse; the rest through parseAndFilter.

- **Calls:** [parseAndFilter](#fn-parse-hook-js-parseandfilter)

<a id="fn-parse-hook-js-parseandfilter"></a>
**`parseAndFilter(text, reviver)`** · function · L63–88

Parses a large text (with tracking parameters blanked first when Tracking Block is on) and, when it is an InnerTube response, runs the filters on it in place.

- **Calls:** [features/adblock/emoji-wrap.js › mayNeedEmojiWork](#fn-emoji-wrap-js-mayneedemojiwork), [filterSafely](#fn-parse-hook-js-filtersafely), [features/adblock/text-fixes.js › stripTrackingParams](#fn-text-fixes-js-striptrackingparams)
- **Called by:** [hookedParse](#fn-parse-hook-js-hookedparse)

<a id="fn-parse-hook-js-filtersafely"></a>
**`filterSafely(data, textLength, flags)`** · function · L94–100

filterResponse, with an error logged instead of thrown: a filter bug must never break YouTube's parse.

- **Calls:** [filterResponse](#fn-parse-hook-js-filterresponse)
- **Called by:** [parseAndFilter](#fn-parse-hook-js-parseandfilter)

<a id="fn-parse-hook-js-filterresponse"></a>
**`filterResponse(data, textLength, flags)`** · function · L107–147

Everything done to a parsed response, in order: the codec filter, Load Rows Ahead, the content filters (by schema, the fallback search, or the guide's nav entries), then the thumbnail upgrade and the emoji wrap.

- **Calls:** [core/innertube.js › detectResponseType](core.md#fn-innertube-js-detectresponsetype), [core/log.js › isDebugEnabled](core.md#fn-log-js-isdebugenabled), [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [features/adblock/fallback.js › removeBlockedNavEntries](#fn-fallback-js-removeblockednaventries), [logSchemaMiss](#fn-parse-hook-js-logschemamiss), [wrapEmojiInFrameworkUpdates](#fn-parse-hook-js-wrapemojiinframeworkupdates), [features/adblock/response-filters.js › applySchemaFilters](#fn-response-filters-js-applyschemafilters), [features/force-codec/hooks.js › filterParsedResponse](features-force-codec.md#fn-hooks-js-filterparsedresponse), [features/rows-ahead.js › raiseRowsAhead](features.md#fn-rows-ahead-js-raiserowsahead), [features/thumbnail-quality/dispatch.js › upgradeResponseThumbnails](features-thumbnail-quality.md#fn-dispatch-js-upgraderesponsethumbnails)
- **Called by:** [filterSafely](#fn-parse-hook-js-filtersafely)

<a id="fn-parse-hook-js-installparsehook"></a>
**`installParseHook()`** · function, exported · L157–169

Installs the hook, once, for the life of the page.

Every switch that lives on it (ads, Shorts, guest prompts, endcards, trackingParams, the legacy emoji rewrite, the thumbnail upgrade) is a flag in flags.js, and filterResponse stops after the rows-ahead pass (its own switch, Load Rows Ahead) while none of them is on; force-codec's offer filter runs inside it as well.

- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Hooks:** `JSON.parse`, `window.__ytafAdblockStats`

<a id="mod-player-filters-js"></a>

## features/adblock/player-filters.js

> The player response: ad placements, attestation, heartbeat params, endcards.

54 lines · imports [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/response-filters.js](#mod-response-filters-js)

<a id="fn-player-filters-js-cleararrayifexists"></a>
**`clearArrayIfExists(obj, key)`** · function · L5–11

Empties `obj[key]` in place when it is a non-empty array; 1 when it did, else 0.

- **Called by:** [removePlayerAds](#fn-player-filters-js-removeplayerads)

<a id="fn-player-filters-js-removeendcards"></a>
**`removeEndcards(data)`** · function, exported · L14–25

Deletes the end screen (the cards over a video's last seconds) from a player response.

- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [features/adblock/response-filters.js › filterWatchResponse](#fn-response-filters-js-filterwatchresponse)

<a id="fn-player-filters-js-removeplayerads"></a>
**`removePlayerAds(data)`** · function, exported · L31–54

Empties the ad placements, player ads and ad slots of a player response and drops the attestation and ad-break heartbeat parameters.

- **Calls:** [clearArrayIfExists](#fn-player-filters-js-cleararrayifexists)
- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [features/adblock/response-filters.js › filterWatchResponse](#fn-response-filters-js-filterwatchresponse)

<a id="mod-response-filters-js"></a>

## features/adblock/response-filters.js

> What gets removed from each response type, along the known schema paths; fallback.js handles the responses no path matched.

194 lines · imports [core/innertube.js](core.md#mod-innertube-js), [features/adblock/search.js](#mod-search-js), [features/adblock/emoji-wrap.js](#mod-emoji-wrap-js), [features/adblock/nav-filters.js](#mod-nav-filters-js), [features/adblock/item-filters.js](#mod-item-filters-js), [features/adblock/player-filters.js](#mod-player-filters-js), [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/parse-hook.js](#mod-parse-hook-js)

**At load:**

- **Calls:** [filterActions](#fn-response-filters-js-filteractions)

<a id="fn-response-filters-js-filterlist"></a>
**`filterList(items, config, label, skipEmoji)`** · function, exported · L16–21

Filters a list of items in place and logs how many went.

- **Calls:** [features/adblock/item-filters.js › filterItems](#fn-item-filters-js-filteritems)
- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [filterContinuation](#fn-response-filters-js-filtercontinuation), [filterShortsSequence](#fn-response-filters-js-filtershortssequence)

<a id="fn-response-filters-js-sectionlistat"></a>
**`sectionListAt(data, path, responseType)`** · function · L24–26

The section list at `path`, or the first sectionListRenderer in the response when the path misses.

- **Calls:** [features/adblock/search.js › atPathOrSearch](#fn-search-js-atpathorsearch)
- **Called by:** [filterMainContent](#fn-response-filters-js-filtermaincontent)

<a id="fn-response-filters-js-filtermaincontent"></a>
**`filterMainContent(data, schema, config, responseType)`** · function · L29–32

Filters the section list a schema names as a response's main content.

- **Calls:** [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [sectionListAt](#fn-response-filters-js-sectionlistat)

<a id="fn-response-filters-js-filtershortssequence"></a>
**`filterShortsSequence(data, schema, config)`** · function · L35–39

Filters the ads out of the Shorts player's sequence of upcoming Shorts.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [filterList](#fn-response-filters-js-filterlist)

<a id="fn-response-filters-js-filterbrowsetabs"></a>
**`filterBrowseTabs(data, schema, config)`** · function · L45–61

Removes the Shorts and Live tabs from a browse response's tab bar, then filters every tab's sections.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [features/adblock/nav-filters.js › removeBlockedNavTabs](#fn-nav-filters-js-removeblockednavtabs)

<a id="fn-response-filters-js-filtercontinuation"></a>
**`filterContinuation(data, schema, config)`** · function · L67–82

Filters every list shape a continuation (the next rows or items of a page) can arrive in, and wraps its emoji once at the end when the emoji fix is on.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree), [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [filterList](#fn-response-filters-js-filterlist)
- **Called by:** [applySchemaFilters](#fn-response-filters-js-applyschemafilters)

<a id="fn-response-filters-js-filteractions"></a>
**`filterActions(data, config)`** · function · L85–93

The received actions and endpoints: a body can carry both.

- **Calls:** [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree), [processActions](#fn-response-filters-js-processactions)
- **Called by:** [at load](#mod-response-filters-js), [applySchemaFilters](#fn-response-filters-js-applyschemafilters)

<a id="fn-response-filters-js-removetimelyactions"></a>
**`removeTimelyActions(data, schema, responseType)`** · function · L101–110

The QR-code prompt in the player overlay, found along the path, or on NEXT by search when the path misses. A player response is parsed at every video start and keeps its overlay at the path; a search over it would be a walk of the whole streaming data for nothing.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [features/adblock/search.js › atPathOrSearch](#fn-search-js-atpathorsearch)
- **Called by:** [filterWatchResponse](#fn-response-filters-js-filterwatchresponse)

<a id="fn-response-filters-js-filterpivot"></a>
**`filterPivot(data, schema, config, responseType, skipEmoji)`** · function · L113–123

The pivot (guest prompts) section list, found along the path or by search.

- **Calls:** [features/adblock/item-filters.js › filterSectionList](#fn-item-filters-js-filtersectionlist), [features/adblock/search.js › atPathOrSearch](#fn-search-js-atpathorsearch)
- **Called by:** [filterWatchResponse](#fn-response-filters-js-filterwatchresponse)

<a id="fn-response-filters-js-filterwatchresponse"></a>
**`filterWatchResponse(data, schema, config, responseType)`** · function · L126–145

PLAYER and NEXT: player ads, the QR-code prompt, endcards, guest prompts and the legacy emoji fix.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [features/adblock/emoji-wrap.js › wrapEmojiInTree](#fn-emoji-wrap-js-wrapemojiintree), [features/adblock/player-filters.js › removeEndcards](#fn-player-filters-js-removeendcards), [features/adblock/player-filters.js › removePlayerAds](#fn-player-filters-js-removeplayerads), [filterPivot](#fn-response-filters-js-filterpivot), [removeTimelyActions](#fn-response-filters-js-removetimelyactions)

<a id="fn-response-filters-js-applyschemafilters"></a>
**`applySchemaFilters(data, responseType, config)`** · function, exported · L166–180

Runs the filter registered for `responseType`, plus the continuation and received-actions filters when the response carries those beside its main content.

- **Calls:** [filterActions](#fn-response-filters-js-filteractions), [filterContinuation](#fn-response-filters-js-filtercontinuation)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](#fn-parse-hook-js-filterresponse)

<a id="fn-response-filters-js-processactions"></a>
**`processActions(actions, config, skipEmoji)`** · function, exported · L183–194

The continuation items carried by received actions or endpoints, filtered.

- **Calls:** [features/adblock/item-filters.js › filterItems](#fn-item-filters-js-filteritems)
- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [filterActions](#fn-response-filters-js-filteractions)

<a id="mod-search-js"></a>

## features/adblock/search.js

> The bounded tree lookups the filters use when a schema path misses. The shapes themselves (the paths, the type signatures) are in core/innertube.js.

49 lines · imports [core/innertube.js](core.md#mod-innertube-js), [core/bounded-search.js](core.md#mod-bounded-search-js), [features/adblock/log.js](#mod-log-js) · imported by [features/adblock/fallback.js](#mod-fallback-js), [features/adblock/parse-hook.js](#mod-parse-hook-js), [features/adblock/response-filters.js](#mod-response-filters-js)

<a id="fn-search-js-atpathorsearch"></a>
**`atPathOrSearch(data, path, needle, depth, label, fromFound)`** · function, exported · L17–24

The object at `path`, or when the path misses the first `needle` found by a bounded search (through `fromFound` when the needle is not the object wanted). A miss is logged: it means the schema moved.

- **Calls:** [core/innertube.js › getByPath](core.md#fn-innertube-js-getbypath), [findObjects](#fn-search-js-findobjects)
- **Called by:** [features/adblock/response-filters.js › filterPivot](#fn-response-filters-js-filterpivot), [features/adblock/response-filters.js › removeTimelyActions](#fn-response-filters-js-removetimelyactions), [features/adblock/response-filters.js › sectionListAt](#fn-response-filters-js-sectionlistat)

<a id="fn-search-js-findobjects"></a>
**`findObjects(haystack, needlesArray, maxDepth)`** · function, exported · L30–49

The first value found for each key in `needlesArray`, searching `haystack` breadth-first down to `maxDepth`; stops once all are found.

- **Calls:** [core/bounded-search.js › boundedSearch](core.md#fn-bounded-search-js-boundedsearch)
- **Called by:** [features/adblock/fallback.js › applyFallbackFilters](#fn-fallback-js-applyfallbackfilters), [features/adblock/fallback.js › removeBlockedNavEntries](#fn-fallback-js-removeblockednaventries), [atPathOrSearch](#fn-search-js-atpathorsearch)

<a id="mod-stringify-hook-ts"></a>

## features/adblock/stringify-hook.ts

> Forces `isInlinePlaybackNoAd` on outgoing InnerTube player requests while Ad Blocking is on: the request side of adblock, beside the response side in parse-hook.js, and switched by the same flags (flags.js).
>
> JSON.stringify is a global hook, so YouTube calls it constantly: every localStorage write, every request body, every internal log. Two guards keep the hook cheap: 1. An O(1) direct hit for the shape YouTube actually sends, where playbackContext sits at the root of the request body. 2. A cheap rejection for everything else: a player request carries a `videoId` and a `context` at the root. Anything without both is skipped before any walking.
>
> A bounded breadth-first search covers a player request whose playbackContext has moved, so an InnerTube schema change degrades to "slower" rather than "silently stops working".

139 lines · imports [core/bounded-search.js](core.md#mod-bounded-search-js), [features/adblock/flags.js](#mod-flags-js), [features/adblock/log.js](#mod-log-js)

<a id="fn-stringify-hook-ts-findctx"></a>
**`findCtx(root)`** · function · L38–49

The contentPlaybackContext of a player request whose playbackContext is not at the root (bounded breadth-first search), or null.

- **Calls:** [core/bounded-search.js › boundedSearch](core.md#fn-bounded-search-js-boundedsearch)
- **Called by:** [unflaggedContext](#fn-stringify-hook-ts-unflaggedcontext)

<a id="fn-stringify-hook-ts-unflaggedcontext"></a>
**`unflaggedContext(body)`** · function · L52–63

The contentPlaybackContext of a player request still without the flag, or null.

- **Calls:** [findCtx](#fn-stringify-hook-ts-findctx)
- **Called by:** [flagPlayerRequest](#fn-stringify-hook-ts-flagplayerrequest)

<a id="fn-stringify-hook-ts-flagplayerrequest"></a>
**`flagPlayerRequest(body)`** · function · L70–85

Sets the flag on a player request and returns how to put the body back, or null when there is nothing to set. Never throws: our logic must not break YouTube's serialisation (a frozen body, a getter that throws).

- **Calls:** [unflaggedContext](#fn-stringify-hook-ts-unflaggedcontext)
- **Called by:** [stringify](#fn-stringify-hook-ts-stringify)

<a id="fn-stringify-hook-ts-maybeplayerrequest"></a>
**`mayBePlayerRequest(value)`** · function · L92–94

Whether `value` has a key a player request has at its root. The `in` operator calls no getter, so this needs no try: almost every stringify (localStorage writes, logs, other request bodies) stops here.

- **Called by:** [stringify](#fn-stringify-hook-ts-stringify)

<a id="fn-stringify-hook-ts-stringify"></a>
**`stringify(value, replacer, space)`** · function · L102–114

The hook itself holds no try: the engine of webOS 3 (V8 3.28) does not optimise a function that contains one, and this runs on every stringify. The two that need one are only reached for a body shaped like a player request while Ad Blocking is on (flagPlayerRequest, which reads its properties and may meet a getter that throws) and for a flagged request (stringifyThenRestore).

- **Calls:** [flagPlayerRequest](#fn-stringify-hook-ts-flagplayerrequest), [mayBePlayerRequest](#fn-stringify-hook-ts-maybeplayerrequest), [stringifyThenRestore](#fn-stringify-hook-ts-stringifythenrestore)

<a id="fn-stringify-hook-ts-stringifythenrestore"></a>
**`stringifyThenRestore(value, replacer, space, restore)`** · function · L121–132

Stringifies a flagged player request, then puts the request back as it was, even when the stringify throws. Kept apart so the hook itself holds no try (webOS 3's engine does not optimise a function with one).

- **Called by:** [stringify](#fn-stringify-hook-ts-stringify)

<a id="fn-stringify-hook-ts-installstringifyhook"></a>
**`installStringifyHook()`** · function, exported · L135–139

Installs the hook once, for the life of the page.

- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Hooks:** `JSON.stringify`

<a id="mod-text-fixes-js"></a>

## features/adblock/text-fixes.js

> Text work on a response: trackingParams blanked in the JSON text before the parse. The legacy emoji fix's rewrite is emoji-wrap.js.

21 lines · imported by [features/adblock/parse-hook.js](#mod-parse-hook-js)

<a id="fn-text-fixes-js-striptrackingparams"></a>
**`stripTrackingParams(text)`** · function, exported · L18–21

The JSON text with every string trackingParams blanked, at any depth: one native pass over the text, where a walk of the parsed tree cost more than the parse itself on a browse response and stopped at a depth limit. The same string comes back when the key does not occur.

- **Called by:** [features/adblock/parse-hook.js › parseAndFilter](#fn-parse-hook-js-parseandfilter)

<a id="mod-tracking-block-js"></a>

## features/adblock/tracking-block.js

> Blocks YouTube's telemetry requests at the fetch and XMLHttpRequest level.

103 lines · imports [hooks/fetch.ts](hooks.md#mod-fetch-ts), [features/adblock/constants.js](#mod-constants-js), [features/adblock/flags.js](#mod-flags-js), [features/adblock/log.js](#mod-log-js)

<a id="fn-tracking-block-js-telemetryfetchhandler"></a>
**`telemetryFetchHandler(evt)`** · arrow · L15–23

Cancels a fetch to a telemetry path (the 'request' listener of the fetch hook).

- **Called by:** [destroyTrackingBlock](#fn-tracking-block-js-destroytrackingblock), [initTrackingBlock](#fn-tracking-block-js-inittrackingblock)

<a id="fn-tracking-block-js-installxhrwrappers"></a>
**`installXHRWrappers()`** · function · L29–71

Wraps XMLHttpRequest open and send once; the wrappers block telemetry only while Tracking Block is active.

- **Called by:** [initTrackingBlock](#fn-tracking-block-js-inittrackingblock)
- **Hooks:** `window.XMLHttpRequest.prototype.open`, `window.XMLHttpRequest.prototype.send`

<a id="fn-tracking-block-js-installxhrwrappers-window-xmlhttprequest-prototype-open"></a>
**`installXHRWrappers.window.XMLHttpRequest.prototype.open(method, url)`** · assigned · L37–62

Marks a request to a telemetry path and points it at an empty data: URL, so it completes without reaching YouTube.

<a id="fn-tracking-block-js-installxhrwrappers-window-xmlhttprequest-prototype-send"></a>
**`installXHRWrappers.window.XMLHttpRequest.prototype.send(_body)`** · assigned · L65–69

Sends a marked telemetry request without its body.

<a id="fn-tracking-block-js-inittrackingblock"></a>
**`initTrackingBlock()`** · function · L74–80

Turns Tracking Block on: the fetch listener, and the XHR wrappers the first time.

- **Calls:** [installXHRWrappers](#fn-tracking-block-js-installxhrwrappers), [telemetryFetchHandler](#fn-tracking-block-js-telemetryfetchhandler), [hooks/fetch.ts › FetchRegistry.getInstance](hooks.md#fn-fetch-ts-fetchregistry-getinstance)
- **Called by:** [startTrackingBlock.sync](#fn-tracking-block-js-starttrackingblock-sync)
- **Events:** listens to `request`

<a id="fn-tracking-block-js-destroytrackingblock"></a>
**`destroyTrackingBlock()`** · function · L86–91

Turns Tracking Block off: the fetch listener goes, the XHR wrappers stay and pass everything through.

- **Calls:** [telemetryFetchHandler](#fn-tracking-block-js-telemetryfetchhandler), [hooks/fetch.ts › FetchRegistry.getInstance](hooks.md#fn-fetch-ts-fetchregistry-getinstance)
- **Called by:** [startTrackingBlock.sync](#fn-tracking-block-js-starttrackingblock-sync)

<a id="fn-tracking-block-js-starttrackingblock"></a>
**`startTrackingBlock()`** · function, exported · L98–103

Puts the network hooks in line with the flags, now and on every change. Whether Tracking Block is on is decided in one place, flags.js (it rides on Ad Blocking); this only follows that flag.

- **Calls:** [features/adblock/flags.js › onFlagsChange](#fn-flags-js-onflagschange), [startTrackingBlock.sync](#fn-tracking-block-js-starttrackingblock-sync)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-tracking-block-js-starttrackingblock-sync"></a>
**`startTrackingBlock.sync()`** · arrow · L100–100

Turns Tracking Block on or off to match cfgFlags.enableTrackingBlock.

- **Calls:** [destroyTrackingBlock](#fn-tracking-block-js-destroytrackingblock), [initTrackingBlock](#fn-tracking-block-js-inittrackingblock)
- **Called by:** [startTrackingBlock](#fn-tracking-block-js-starttrackingblock)
