# Code map: features/sponsorblock/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/sponsorblock/api.js](#mod-api-js), [features/sponsorblock/bar.js](#mod-bar-js), [features/sponsorblock/blue-key.js](#mod-blue-key-js), [features/sponsorblock/bootstrap.js](#mod-bootstrap-js), [features/sponsorblock/chain.js](#mod-chain-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/labels.js](#mod-labels-js), [features/sponsorblock/mute.js](#mod-mute-js), [features/sponsorblock/overlay.js](#mod-overlay-js), [features/sponsorblock/popup.js](#mod-popup-js), [features/sponsorblock/segments.js](#mod-segments-js), [features/sponsorblock/skipping.js](#mod-skipping-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

<a id="mod-api-js"></a>

## features/sponsorblock/api.js

> Fetching a video's segments from the SponsorBlock API, primary server then fallback, and picking that video's own out of the hash-prefix answer.

100 lines · imports [features/sponsorblock/constants.js](#mod-constants-js), [core/fetch-timeout.js](core.md#mod-fetch-timeout-js) · npm `tiny-sha256` · imported by [features/sponsorblock/index.js](#mod-index-js)

<a id="fn-api-js-iswellformedsegment"></a>
**`isWellFormedSegment(entry)`** · function · L8–16

Whether an API entry has the shape the handler relies on.

- **Called by:** [fetchVideoSegments](#fn-api-js-fetchvideosegments)

<a id="fn-api-js-fetchsegments"></a>
**`fetchSegments(sb, hashPrefix)`** · function, async · L19–59

The list for `hashPrefix`, `[]` when the API has none, or null when both servers failed.

- **Calls:** [fetchSegments.tryFetch](#fn-api-js-fetchsegments-tryfetch)
- **Called by:** [fetchVideoSegments](#fn-api-js-fetchvideosegments)

<a id="fn-api-js-fetchsegments-tryfetch"></a>
**`fetchSegments.tryFetch(url)`** · arrow, async · L27–54

Asks one SponsorBlock server for the segments of every video sharing the hash prefix: the list, [] when the server has none (404), null on any failure (so the next server is tried). Abortable through sb.abortFetch.

- **Calls:** [core/fetch-timeout.js › fetchJsonWithTimeout](core.md#fn-fetch-timeout-js-fetchjsonwithtimeout)
- **Called by:** [fetchSegments](#fn-api-js-fetchsegments)

<a id="fn-api-js-fetchvideosegments"></a>
**`fetchVideoSegments(sb, videoID)`** · function, async, exported · L66–88

The well-formed segments of `videoID`, `[]` when the API has none for it, or null when no list came back (both servers failed, or answered with something else) or the handler was destroyed meanwhile. Never throws.

- **Calls:** [fetchSegments](#fn-api-js-fetchsegments), [isWellFormedSegment](#fn-api-js-iswellformedsegment)
- **Called by:** [fetchSegmentsRetrying](#fn-api-js-fetchsegmentsretrying)

<a id="fn-api-js-fetchsegmentsretrying"></a>
**`fetchSegmentsRetrying(sb, videoID, attempt)`** · function, async, exported · L95–100

fetchVideoSegments(), asked again after each of API.retryMs while no list comes back (both servers down, say; an empty list is an answer). The wait is in the handler's bag, so destroy() drops it.

- **Calls:** [fetchVideoSegments](#fn-api-js-fetchvideosegments)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.init](#fn-index-js-sponsorblockhandler-init)

<a id="mod-bar-js"></a>

## features/sponsorblock/bar.js

> The progress bar: finding it, watching the player chrome for it being built, torn down and rebuilt, and the bounded poll while it is missing. A bar check also notices a replaced &lt;video> and hands it to the handler.

356 lines · imports [core/selectors.js](core.md#mod-selectors-js), [core/dom.js](core.md#mod-dom-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/overlay.js](#mod-overlay-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

**At load:**

- **Selectors:** `PROGRESS_BAR_RENDERER`, `PROGRESS_BAR_SEGMENT`, `PROGRESS_BAR_TRACK`, `PROGRESS_BAR`, `PROGRESS_BAR_SLIDER`, `PROGRESS_BAR_SLIDER_BASE`, `PROGRESS_BAR_LEGACY_SLIDER`

<a id="fn-bar-js-redrawoverlay"></a>
**`redrawOverlay(sb)`** · function, exported · L27–29

Draws the overlay, and polls for the bar when there is none to draw beside.

- **Calls:** [scheduleBarRetry](#fn-bar-js-schedulebarretry), [features/sponsorblock/overlay.js › drawOverlay](#fn-overlay-js-drawoverlay)
- **Called by:** [adoptBar](#fn-bar-js-adoptbar), [narrowProgressBar](#fn-bar-js-narrowprogressbar), [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo), [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.rebuild](#fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)

<a id="fn-bar-js-observebarattributes"></a>
**`observeBarAttributes(sb, bar)`** · function · L36–43

The attribute observer watches the bar's class, style and hidden state, and the anchor's as well when that is another element: YouTube hides the renderer, the overlay's sibling, not the track inside it.

- **Calls:** [features/sponsorblock/overlay.js › getProgressBarAnchor](#fn-overlay-js-getprogressbaranchor)
- **Called by:** [trackBar](#fn-bar-js-trackbar), [watchProgressBar.attachBarObservers](#fn-bar-js-watchprogressbar-attachbarobservers)

<a id="fn-bar-js-observebarchildlists"></a>
**`observeBarChildLists(sb, bar)`** · function · L57–69

The childList observer watches the bar's ancestors up to the node the overlay sits in (the anchor's parent), each for its own children only: the bar being replaced, the renderer around it being replaced, and every level between. That node is the watched root. Not one subtree observer over the player chrome, which woke on every chapter marker and tooltip YouTube redraws. A bar matched above the track is watched inside as well, for the track to appear (narrowProgressBar).

- **Calls:** [features/sponsorblock/overlay.js › anchorOf](#fn-overlay-js-anchorof)
- **Called by:** [trackBar](#fn-bar-js-trackbar), [watchProgressBar.attachBarObservers](#fn-bar-js-watchprogressbar-attachbarobservers)

<a id="fn-bar-js-onlyoverlaynodes"></a>
**`onlyOverlayNodes(nodes)`** · function · L72–77

Whether every node in `nodes` is the overlay.

- **Called by:** [createBarObservers](#fn-bar-js-createbarobservers)

<a id="fn-bar-js-createbarobservers"></a>
**`createBarObservers(sb)`** · function · L84–94

The bar's pair of observers. The childList one sees the overlay's own insertion in the watched root too; records with nothing else in them ask for no check.

- **Calls:** [onlyOverlayNodes](#fn-bar-js-onlyoverlaynodes), [scheduleCheck](#fn-bar-js-schedulecheck)
- **Called by:** [trackBar](#fn-bar-js-trackbar), [watchProgressBar.attachBarObservers](#fn-bar-js-watchprogressbar-attachbarobservers)
- **Browser:** `MutationObserver`

<a id="fn-bar-js-schedulecheck"></a>
**`scheduleCheck(sb)`** · function · L108–120

A check of the bar on the next frame, one at a time. `barChecks` counts the observer callbacks that asked for one, for measuring on the TV: read window.sponsorblock.barChecks, play a video for ten seconds with the controls hidden, read it again. A few checks are expected (the controls show and hide); hundreds mean a bar selector (the first is `[idomkey="segment"]`) matches an element YouTube changes every frame.

- **Calls:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)
- **Called by:** [createBarObservers](#fn-bar-js-createbarobservers)

<a id="fn-bar-js-trackbar"></a>
**`trackBar(sb, target)`** · function · L127–144

Tracks `target` as the bar: the anchor, the observers and the inline style it needs. A bar found before the finder fires (the first search, the poll) gets its observers here, and the finder goes.

- **Calls:** [createBarObservers](#fn-bar-js-createbarobservers), [observeBarAttributes](#fn-bar-js-observebarattributes), [observeBarChildLists](#fn-bar-js-observebarchildlists), [features/sponsorblock/overlay.js › forgetAnchor](#fn-overlay-js-forgetanchor)
- **Called by:** [adoptBar](#fn-bar-js-adoptbar), [narrowProgressBar](#fn-bar-js-narrowprogressbar)
- **Browser:** `getComputedStyle`

<a id="fn-bar-js-narrowprogressbar"></a>
**`narrowProgressBar(sb)`** · function · L151–165

A bar matched at the renderer level (the chrome is rebuilt renderer first, track a tick later) is re-targeted at the track once that exists, so the overlay measures the track's box; true when it did.

- **Calls:** [redrawOverlay](#fn-bar-js-redrawoverlay), [trackBar](#fn-bar-js-trackbar), [features/sponsorblock/overlay.js › resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Called by:** [resyncTrackedBar](#fn-bar-js-resynctrackedbar)
- **Selectors:** `PROGRESS_BAR_SEGMENT`, `PROGRESS_BAR_TRACK`
- **Browser:** `querySelector`

<a id="fn-bar-js-rebindifvideoreplaced"></a>
**`rebindIfVideoReplaced(sb)`** · function · L168–172

The &lt;video> was replaced: the new one is bound, the bar stays as tracked.

- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)

<a id="fn-bar-js-findbar"></a>
**`findBar(sb)`** · function · L175–184

The bar in the DOM, most specific selector first (its index noted), or null.

- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)
- **Browser:** `querySelector`

<a id="fn-bar-js-resynctrackedbar"></a>
**`resyncTrackedBar(sb)`** · function · L187–190

A tracked bar: narrowed to its track once that exists, else the overlay re-synced.

- **Calls:** [narrowProgressBar](#fn-bar-js-narrowprogressbar), [features/sponsorblock/overlay.js › resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)

<a id="fn-bar-js-adoptbar"></a>
**`adoptBar(sb, target)`** · function · L193–201

A bar found by the search: tracked, the overlay drawn beside it, the poll ended.

- **Calls:** [redrawOverlay](#fn-bar-js-redrawoverlay), [stopBarRetry](#fn-bar-js-stopbarretry), [trackBar](#fn-bar-js-trackbar), [features/sponsorblock/overlay.js › resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)

<a id="fn-bar-js-acquireprogressbar"></a>
**`acquireProgressBar(sb)`** · function, exported · L207–237

Where every bar check lands: re-syncs a tracked bar, and otherwise looks for the bar and adopts it, or keeps looking.

- **Calls:** [adoptBar](#fn-bar-js-adoptbar), [ensureObserverAlive](#fn-bar-js-ensureobserveralive), [findBar](#fn-bar-js-findbar), [rebindIfVideoReplaced](#fn-bar-js-rebindifvideoreplaced), [resyncTrackedBar](#fn-bar-js-resynctrackedbar), [scheduleBarRetry](#fn-bar-js-schedulebarretry), [features/sponsorblock/overlay.js › forgetAnchor](#fn-overlay-js-forgetanchor)
- **Called by:** [scheduleBarRetry](#fn-bar-js-schedulebarretry), [scheduleCheck](#fn-bar-js-schedulecheck), [watchProgressBar.attachBarObservers](#fn-bar-js-watchprogressbar-attachbarobservers), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-bar-js-watchprogressbar"></a>
**`watchProgressBar(sb)`** · function, exported · L248–297

Watches the player chrome: a childList observer on the bar's ancestors for the bar being destroyed and recreated (observeBarChildLists), and an attribute observer on the bar itself (re-targeted by acquireProgressBar) for it being shown and hidden. Two narrow observers rather than one attributes+subtree observer, which woke a callback every animation frame on YouTube's playhead style writes. While there is no bar, one finder waits for it on the app root.

- **Calls:** [disconnectObservers](#fn-bar-js-disconnectobservers), [stopBarRetry](#fn-bar-js-stopbarretry), [watchProgressBar.attachBarObservers](#fn-bar-js-watchprogressbar-attachbarobservers)
- **Called by:** [ensureObserverAlive](#fn-bar-js-ensureobserveralive), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments)
- **Selectors:** `PROGRESS_BAR`, `APP_ROOT`
- **Browser:** `querySelector`, `MutationObserver`

<a id="fn-bar-js-watchprogressbar-attachbarobservers"></a>
**`watchProgressBar.attachBarObservers(bar)`** · arrow · L255–273

Watches the bar's parent for the bar being replaced (and the bar itself, if it is already tracked), dropping any observers from before, then looks for the bar.

- **Calls:** [acquireProgressBar](#fn-bar-js-acquireprogressbar), [createBarObservers](#fn-bar-js-createbarobservers), [observeBarAttributes](#fn-bar-js-observebarattributes), [observeBarChildLists](#fn-bar-js-observebarchildlists)
- **Called by:** [watchProgressBar](#fn-bar-js-watchprogressbar)

<a id="fn-bar-js-disconnectobservers"></a>
**`disconnectObservers(sb)`** · function, exported · L300–308

Disconnects the bar observers; destroy() and a re-watch call it.

- **Called by:** [watchProgressBar](#fn-bar-js-watchprogressbar), [features/sponsorblock/index.js › SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy)

<a id="fn-bar-js-ensureobserveralive"></a>
**`ensureObserverAlive(sb)`** · function · L317–328

domObserver watches a container captured at setup time. When a video ends, the TV UI tears down the whole player chrome, that container included, and rebuilds it when playback restarts; the observer would then watch a detached node and never see the new progress bar. A different video goes through hashchange and a full re-init, a replay does not, so this re-arms the observers when the watched root is gone, or when the tracked bar is gone from under a root that stayed (the renderer replaced or removed).

- **Calls:** [watchProgressBar](#fn-bar-js-watchprogressbar), [features/sponsorblock/overlay.js › forgetAnchor](#fn-overlay-js-forgetanchor)
- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar)

<a id="fn-bar-js-schedulebarretry"></a>
**`scheduleBarRetry(sb)`** · function · L333–348

Bounded poll for a bar gone from under observers that still watch a connected root. A root that went is re-watched instead (ensureObserverAlive), and a finder waiting on the app root makes the poll unnecessary.

- **Calls:** [core/dom.js › pollUntil](core.md#fn-dom-js-polluntil), [acquireProgressBar](#fn-bar-js-acquireprogressbar), [scheduleBarRetry.overlayUp](#fn-bar-js-schedulebarretry-overlayup)
- **Called by:** [acquireProgressBar](#fn-bar-js-acquireprogressbar), [redrawOverlay](#fn-bar-js-redrawoverlay)

<a id="fn-bar-js-schedulebarretry-overlayup"></a>
**`scheduleBarRetry.overlayUp()`** · arrow · L338–338

Whether the overlay is on the page.

- **Called by:** [scheduleBarRetry](#fn-bar-js-schedulebarretry)

<a id="fn-bar-js-stopbarretry"></a>
**`stopBarRetry(sb)`** · function, exported · L351–356

Stops the bounded poll for the progress bar, if one runs.

- **Called by:** [adoptBar](#fn-bar-js-adoptbar), [watchProgressBar](#fn-bar-js-watchprogressbar), [features/sponsorblock/index.js › SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy)

<a id="mod-blue-key-js"></a>

## features/sponsorblock/blue-key.js

> The blue key: the manual skip of an offered segment, the jump to the highlight, and the seek back to the previous segment.

62 lines · imports [core/config.js](core.md#mod-config-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [core/text.js](core.md#mod-text-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/skipping.js](#mod-skipping-js) · imported by [features/sponsorblock/index.js](#mod-index-js)

<a id="fn-blue-key-js-jumptohighlight"></a>
**`jumpToHighlight(sb)`** · function, exported · L13–22

Seeks to the video's highlight unless Highlight is set to Disable; false when there is no highlight (or no &lt;video>).

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [manualSkipOrHighlight](#fn-blue-key-js-manualskiporhighlight), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo)
- **Settings:** uses `(all)`

<a id="fn-blue-key-js-skiptoprevioussegment"></a>
**`skipToPreviousSegment(sb)`** · function, exported · L25–44

Seeks to the start of the previous segment and leaves it alone; false when there is none.

- **Calls:** [core/text.js › capitalize](core.md#fn-text-js-capitalize), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="fn-blue-key-js-manualskiporhighlight"></a>
**`manualSkipOrHighlight(sb)`** · function, exported · L47–62

The blue key: skips the offered manual segment, else jumps to the highlight; false when neither applies.

- **Calls:** [jumpToHighlight](#fn-blue-key-js-jumptohighlight), [features/sponsorblock/skipping.js › aimPast](#fn-skipping-js-aimpast), [features/sponsorblock/skipping.js › armSkipWatchdog](#fn-skipping-js-armskipwatchdog), [features/sponsorblock/skipping.js › clearManualNotification](#fn-skipping-js-clearmanualnotification), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="mod-bootstrap-js"></a>

## features/sponsorblock/bootstrap.js

> Global start: one handler per watched video (core/per-video.js), created only while the setting is on.

24 lines · imports [core/config.js](core.md#mod-config-js), [core/per-video.js](core.md#mod-per-video-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js)

<a id="fn-bootstrap-js-live"></a>
**`live()`** · arrow · L7–7

The live instance (core/per-video.js), once bootstrapped.

- **Called by:** [getSponsorBlock](#fn-bootstrap-js-getsponsorblock)

<a id="fn-bootstrap-js-getsponsorblock"></a>
**`getSponsorBlock()`** · function, exported · L10–12

The SponsorBlockHandler for the video being watched, or null.

- **Calls:** [live](#fn-bootstrap-js-live)
- **Called by:** [ui/shortcuts/actions.js › withSponsorBlock](ui-shortcuts.md#fn-actions-js-withsponsorblock)

<a id="fn-bootstrap-js-bootstrapsponsorblock"></a>
**`bootstrapSponsorBlock(SponsorBlockHandler)`** · function, exported · L15–24

Takes the handler class rather than importing it, so the two files do not import each other.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/per-video.js › bootstrapPerVideo](core.md#fn-per-video-js-bootstrappervideo)
- **Called by:** [features/sponsorblock/index.js (at load)](#mod-index-js)
- **Settings:** reads `enableSponsorBlock`

<a id="mod-chain-js"></a>

## features/sponsorblock/chain.js

> The chain at the start of the video: when playback begins there (or a seek lands there) and the video opens with an auto-skip segment, it and the segments close behind it go in one jump, by the same rule as any skip (skipping.js skipAutoSegment).

47 lines · imports [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/skipping.js](#mod-skipping-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

<a id="fn-chain-js-cancelchainretry"></a>
**`cancelChainRetry(sb)`** · function, exported · L9–14

Drops the wait for metadata, if one is pending; a rebind and destroy() call it.

- **Called by:** [retryOnMetadata](#fn-chain-js-retryonmetadata), [retryOnMetadata.handler](#fn-chain-js-retryonmetadata-handler), [features/sponsorblock/index.js › SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo)

<a id="fn-chain-js-retryonmetadata"></a>
**`retryOnMetadata(sb, video)`** · function · L17–27

Runs the chain skip once `video` has its metadata; one wait at a time.

- **Calls:** [cancelChainRetry](#fn-chain-js-cancelchainretry), [retryOnMetadata.handler](#fn-chain-js-retryonmetadata-handler)
- **Called by:** [executeChainSkip](#fn-chain-js-executechainskip)
- **Events:** listens to `loadedmetadata`

<a id="fn-chain-js-retryonmetadata-handler"></a>
**`retryOnMetadata.handler()`** · arrow · L21–24

The metadata arrived: drop the wait and run the chain skip.

- **Calls:** [cancelChainRetry](#fn-chain-js-cancelchainretry), [executeChainSkip](#fn-chain-js-executechainskip)
- **Called by:** [retryOnMetadata](#fn-chain-js-retryonmetadata)

<a id="fn-chain-js-executechainskip"></a>
**`executeChainSkip(sb, video)`** · function, exported · L35–47

Skips the segments at the very start of the video in one jump: the first segment, when it starts within CHAIN_START of 0 and is skipped automatically, with the playhead there too. A &lt;video> without its metadata cannot say where it is yet, and is waited for.

- **Calls:** [retryOnMetadata](#fn-chain-js-retryonmetadata), [features/sponsorblock/skipping.js › skipAutoSegment](#fn-skipping-js-skipautosegment)
- **Called by:** [retryOnMetadata.handler](#fn-chain-js-retryonmetadata-handler), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="mod-constants-js"></a>

## features/sponsorblock/constants.js

> Endpoints, timing, the config key mapping, the fetch parameters and the colour a category is drawn in.

100 lines · imports [core/config.js](core.md#mod-config-js) · imported by [features/sponsorblock/api.js](#mod-api-js), [features/sponsorblock/bar.js](#mod-bar-js), [features/sponsorblock/blue-key.js](#mod-blue-key-js), [features/sponsorblock/chain.js](#mod-chain-js), [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/labels.js](#mod-labels-js), [features/sponsorblock/overlay.js](#mod-overlay-js), [features/sponsorblock/popup.js](#mod-popup-js), [features/sponsorblock/segments.js](#mod-segments-js), [features/sponsorblock/skipping.js](#mod-skipping-js)

**At load:**

- **Settings:** uses `sbMode_sponsor`, `sbMode_intro`, `sbMode_outro`, `sbMode_interaction`, `sbMode_selfpromo`, `sbMode_musicofftopic`, `sbMode_preview`, `sbMode_filler`, `sbMode_hook`, `sbMode_highlight`, `enableMutedSegments`, `*Color`, `sbFullVideoLabel`, `sbShowTimeWithSkips`

<a id="fn-constants-js-categorycolor"></a>
**`categoryColor(category, fallback)`** · function, exported · L95–100

The colour a category is drawn in: the user's setting when it is a hex colour (it lands in CSS, so nothing else is accepted), else the category's default, else `fallback` for a category the table does not know.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall)
- **Called by:** [features/sponsorblock/labels.js › badgeColor](#fn-labels-js-badgecolor), [features/sponsorblock/overlay.js › drawOverlay](#fn-overlay-js-drawoverlay), [features/sponsorblock/overlay.js › recolourOverlay](#fn-overlay-js-recolouroverlay), [features/sponsorblock/popup.js › SponsorBlockUI.renderRows](#fn-popup-js-sponsorblockui-renderrows)
- **Settings:** uses `(all)`, `*Color`

<a id="mod-index-js"></a>

## features/sponsorblock/index.js

> SponsorBlock: skips sponsored segments and draws them on the progress bar. This class owns the fields, the lifecycle and the public surface; the sibling modules take the handler as `sb`.

364 lines · imports [core/config.js](core.md#mod-config-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [core/disposables.js](core.md#mod-disposables-js), [core/webos.js](core.md#mod-webos-js), [core/dom.js](core.md#mod-dom-js), [core/log.js](core.md#mod-log-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/api.js](#mod-api-js), [features/sponsorblock/segments.js](#mod-segments-js), [features/sponsorblock/skipping.js](#mod-skipping-js), [features/sponsorblock/chain.js](#mod-chain-js), [features/sponsorblock/blue-key.js](#mod-blue-key-js), [features/sponsorblock/mute.js](#mod-mute-js), [features/sponsorblock/bar.js](#mod-bar-js), [features/sponsorblock/video-events.js](#mod-video-events-js), [features/sponsorblock/overlay.js](#mod-overlay-js), [features/sponsorblock/popup.js](#mod-popup-js), [features/sponsorblock/labels.js](#mod-labels-js), [features/sponsorblock/bootstrap.js](#mod-bootstrap-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [features/sponsorblock/bootstrap.js › bootstrapSponsorBlock](#fn-bootstrap-js-bootstrapsponsorblock), [SponsorBlockHandler.constructor](#fn-index-js-sponsorblockhandler-constructor)

<a id="fn-index-js-sponsorblockhandler-constructor"></a>
**`SponsorBlockHandler.constructor(videoID)`** · method · L48–125

A handler for one video: empty state (segments, the bound &lt;video>, the bar, the overlay, the skip state) and the config listeners. init() fetches the segments.

- **Calls:** [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [core/log.js › createLogger](core.md#fn-log-js-createlogger), [core/webos.js › isLegacyWebOS](core.md#fn-webos-js-islegacywebos), [SponsorBlockHandler.setupConfigListeners](#fn-index-js-sponsorblockhandler-setupconfiglisteners)
- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-sponsorblockhandler-boundtimeupdate"></a>
**`SponsorBlockHandler.boundTimeUpdate()`** · assigned · L113–113

The &lt;video>'s timeupdate listener, bound to this handler.

- **Calls:** [features/sponsorblock/skipping.js › handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-index-js-sponsorblockhandler-boundhighfreqloop"></a>
**`SponsorBlockHandler.boundHighFreqLoop()`** · assigned · L117–117

The frame loop's callback, bound to this handler.

- **Calls:** [features/sponsorblock/skipping.js › highFreqLoop](#fn-skipping-js-highfreqloop)

<a id="fn-index-js-sponsorblockhandler-requestaf"></a>
**`SponsorBlockHandler.requestAF(callback)`** · method · L131–138

requestAnimationFrame that destroy() cancels, and that never calls back into a destroyed handler.

- **Browser:** `requestAnimationFrame`

<a id="fn-index-js-sponsorblockhandler-setupconfiglisteners"></a>
**`SponsorBlockHandler.setupConfigListeners()`** · method · L144–172

Follows the SponsorBlock settings: a mode change rebuilds the skip list, the overlay and the labels; a colour repaints the marks; a label option relabels. Builds the lot once now.

- **Calls:** [SponsorBlockHandler.setupConfigListeners.listen](#fn-index-js-sponsorblockhandler-setupconfiglisteners-listen), [SponsorBlockHandler.setupConfigListeners.rebuild](#fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild), [SponsorBlockHandler.setupConfigListeners.recolour](#fn-index-js-sponsorblockhandler-setupconfiglisteners-recolour), [SponsorBlockHandler.setupConfigListeners.relabel](#fn-index-js-sponsorblockhandler-setupconfiglisteners-relabel)
- **Called by:** [SponsorBlockHandler.constructor](#fn-index-js-sponsorblockhandler-constructor)

<a id="fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild"></a>
**`SponsorBlockHandler.setupConfigListeners.rebuild()`** · arrow · L147–153

A colour repaints the marks, a label option relabels, a mode rebuilds the lot; skipSegmentsOnce is read at skip time and needs no listener.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [features/sponsorblock/bar.js › redrawOverlay](#fn-bar-js-redrawoverlay), [SponsorBlockHandler.updateLabels](#fn-index-js-sponsorblockhandler-updatelabels), [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments)
- **Called by:** [SponsorBlockHandler.setupConfigListeners](#fn-index-js-sponsorblockhandler-setupconfiglisteners)
- **Settings:** uses `(all)`

<a id="fn-index-js-sponsorblockhandler-setupconfiglisteners-recolour"></a>
**`SponsorBlockHandler.setupConfigListeners.recolour()`** · arrow · L155–158

A colour changed: repaints the overlay's marks in place and the labels.

- **Calls:** [SponsorBlockHandler.updateLabels](#fn-index-js-sponsorblockhandler-updatelabels), [features/sponsorblock/overlay.js › recolourOverlay](#fn-overlay-js-recolouroverlay)
- **Called by:** [SponsorBlockHandler.setupConfigListeners](#fn-index-js-sponsorblockhandler-setupconfiglisteners)

<a id="fn-index-js-sponsorblockhandler-setupconfiglisteners-relabel"></a>
**`SponsorBlockHandler.setupConfigListeners.relabel()`** · arrow · L160–160

A label option changed: rewrites the labels.

- **Calls:** [SponsorBlockHandler.updateLabels](#fn-index-js-sponsorblockhandler-updatelabels)
- **Called by:** [SponsorBlockHandler.setupConfigListeners](#fn-index-js-sponsorblockhandler-setupconfiglisteners)

<a id="fn-index-js-sponsorblockhandler-setupconfiglisteners-listen"></a>
**`SponsorBlockHandler.setupConfigListeners.listen(key, callback)`** · arrow · L163–166

Adds a config listener that destroy() removes.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/config.js › configRemoveChangeListener](core.md#fn-config-js-configremovechangelistener)
- **Called by:** [SponsorBlockHandler.setupConfigListeners](#fn-index-js-sponsorblockhandler-setupconfiglisteners)

<a id="fn-index-js-sponsorblockhandler-init"></a>
**`SponsorBlockHandler.init()`** · method, async · L175–187

Fetches the video's segments and applies them, or destroys the handler when there are none.

- **Calls:** [features/sponsorblock/api.js › fetchSegmentsRetrying](#fn-api-js-fetchsegmentsretrying), [SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy)

<a id="fn-index-js-sponsorblockhandler-applysegments"></a>
**`SponsorBlockHandler.applySegments(segments)`** · method · L194–223

The segments arrived: the popup and the labels, then the player events, the &lt;video> and the bar (nothing needs them before this, and most videos have no segments), the skip list, the chain, the overlay, the highlight.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [features/sponsorblock/bar.js › acquireProgressBar](#fn-bar-js-acquireprogressbar), [features/sponsorblock/bar.js › watchProgressBar](#fn-bar-js-watchprogressbar), [features/sponsorblock/blue-key.js › jumpToHighlight](#fn-blue-key-js-jumptohighlight), [features/sponsorblock/chain.js › executeChainSkip](#fn-chain-js-executechainskip), [SponsorBlockHandler.bindOrWaitForVideo](#fn-index-js-sponsorblockhandler-bindorwaitforvideo), [SponsorBlockHandler.updateLabels](#fn-index-js-sponsorblockhandler-updatelabels), [features/sponsorblock/labels.js › isFullVideoSegment](#fn-labels-js-isfullvideosegment), [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [SponsorBlockHandler.init](#fn-index-js-sponsorblockhandler-init)
- **Settings:** uses `(all)`

<a id="fn-index-js-sponsorblockhandler-bindorwaitforvideo"></a>
**`SponsorBlockHandler.bindOrWaitForVideo()`** · method · L226–251

Binds the &lt;video> when it is there, or waits for it to mount, one wait at a time.

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo), [core/dom.js › waitForChildAdd](core.md#fn-dom-js-waitforchildadd), [SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo)
- **Called by:** [SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [SponsorBlockHandler.rebindVideo](#fn-index-js-sponsorblockhandler-rebindvideo)
- **Browser:** `querySelector`

<a id="fn-index-js-sponsorblockhandler-unbindvideo"></a>
**`SponsorBlockHandler.unbindVideo()`** · method · L254–262

Lets go of the bound &lt;video>: its listeners, the loop, the mute and the metadata wait.

- **Calls:** [features/sponsorblock/chain.js › cancelChainRetry](#fn-chain-js-cancelchainretry), [features/sponsorblock/mute.js › leaveMutedSegment](#fn-mute-js-leavemutedsegment), [features/sponsorblock/skipping.js › detachTimeListener](#fn-skipping-js-detachtimelistener), [features/sponsorblock/skipping.js › stopHighFreqLoop](#fn-skipping-js-stophighfreqloop)
- **Called by:** [SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo), [SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy), [SponsorBlockHandler.rebindVideo](#fn-index-js-sponsorblockhandler-rebindvideo)

<a id="fn-index-js-sponsorblockhandler-rebindvideo"></a>
**`SponsorBlockHandler.rebindVideo()`** · method · L265–268

The &lt;video> was replaced: binds the new one, or waits for it to mount.

- **Calls:** [SponsorBlockHandler.bindOrWaitForVideo](#fn-index-js-sponsorblockhandler-bindorwaitforvideo), [SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo)

<a id="fn-index-js-sponsorblockhandler-bindvideo"></a>
**`SponsorBlockHandler.bindVideo(video)`** · method · L274–288

Starts working with `video`: its listeners, segments clamped to its duration, the skip list, the overlay, and a highlight jump that was waiting for it.

- **Calls:** [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [features/sponsorblock/bar.js › redrawOverlay](#fn-bar-js-redrawoverlay), [features/sponsorblock/blue-key.js › jumpToHighlight](#fn-blue-key-js-jumptohighlight), [SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo), [features/sponsorblock/segments.js › clampSegments](#fn-segments-js-clampsegments), [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)
- **Called by:** [SponsorBlockHandler.bindOrWaitForVideo](#fn-index-js-sponsorblockhandler-bindorwaitforvideo)

<a id="fn-index-js-sponsorblockhandler-updatelabels"></a>
**`SponsorBlockHandler.updateLabels()`** · method · L295–300

Refresh the title badge and the skips-removed duration. Cheap and idempotent, so it is called from anywhere the inputs can move: after the fetch, on durationchange, and whenever a SponsorBlock setting changes.

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo)
- **Called by:** [SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [SponsorBlockHandler.setupConfigListeners.rebuild](#fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild), [SponsorBlockHandler.setupConfigListeners.recolour](#fn-index-js-sponsorblockhandler-setupconfiglisteners-recolour), [SponsorBlockHandler.setupConfigListeners.relabel](#fn-index-js-sponsorblockhandler-setupconfiglisteners-relabel)

<a id="fn-index-js-sponsorblockhandler-destroy"></a>
**`SponsorBlockHandler.destroy()`** · method · L306–346

Undoes everything: the &lt;video>'s listeners and mute, frames, the fetch, timers, observers, the popup rows, the labels and the overlay. Safe to call twice.

- **Calls:** [features/sponsorblock/bar.js › disconnectObservers](#fn-bar-js-disconnectobservers), [features/sponsorblock/bar.js › stopBarRetry](#fn-bar-js-stopbarretry), [SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo), [features/sponsorblock/skipping.js › clearManualNotification](#fn-skipping-js-clearmanualnotification), [features/sponsorblock/skipping.js › clearSkipWatchdog](#fn-skipping-js-clearskipwatchdog)
- **Called by:** [SponsorBlockHandler.init](#fn-index-js-sponsorblockhandler-init)

<a id="fn-index-js-sponsorblockhandler-skiptoprevioussegment"></a>
**`SponsorBlockHandler.skipToPreviousSegment()`** · method · L351–353

The 'Skip to Last SponsorBlock Segment' shortcut (skipping.js); false when there is none.

<a id="fn-index-js-sponsorblockhandler-manualskiporhighlight"></a>
**`SponsorBlockHandler.manualSkipOrHighlight()`** · method · L359–361

The blue key: skips the segment being offered, else jumps to the highlight (skipping.js); false when neither applies.

<a id="mod-labels-js"></a>

## features/sponsorblock/labels.js

> Two small SponsorBlock readouts rendered into YouTube's own DOM:
>
> 1. Full Video Label badge - a coloured pill before the video title when SponsorBlock says the whole video is a sponsorship / self-promo, the same thing the desktop extension shows. 2. Time with skips removed - the duration minus everything that will be skipped, in brackets after the duration under the seek bar.
>
> One stylesheet: the module adds a single &lt;style> and rewrites its text; it never touches a video node or attribute:
>
> &lt;title selector>::before { content: "Sponsor"; ... } &lt;duration selector>::after { content: "(27:07)"; }
>
> labels.css styles the two pseudo-elements and leaves `content` to this module (see the note there). A rule applies the moment a matching element exists, however often YouTube rebuilds it: no node to insert and lose to incremental-dom, no observer, no retry. One textContent write per change, about once per video. The badge colour is written into the rule rather than a custom property, which Chromium 38 (webOS 3) has not got.

257 lines · imports [core/config.js](core.md#mod-config-js), [core/log.js](core.md#mod-log-js), [core/text.js](core.md#mod-text-js), [core/selectors.js](core.md#mod-selectors-js), [features/sponsorblock/constants.js](#mod-constants-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/overlay.js](#mod-overlay-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [SponsorBlockLabels.constructor](#fn-labels-js-sponsorblocklabels-constructor)
- **Selectors:** `TITLE_TEXT`, `TITLE_TEXT_TRAY`, `DURATION_LABEL`

<a id="fn-labels-js-cssstring"></a>
**`cssString(value)`** · function · L62–67

A quoted CSS string. Everything here is generated, but it lands in a stylesheet.

- **Called by:** [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-contrastcolor"></a>
**`contrastColor(hex)`** · function · L76–85

Readable foreground for an arbitrary user-chosen background.

Segment colours are configurable and several defaults are light - selfpromo is pure yellow. White-on-yellow is unreadable, so the text colour follows the background's luminance rather than being fixed.

- **Called by:** [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-badgecolor"></a>
**`badgeColor(category)`** · function · L88–90

The badge colour: the category's (constants.js); exclusive_access has its own.

- **Calls:** [features/sponsorblock/constants.js › categoryColor](#fn-constants-js-categorycolor)
- **Called by:** [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-isfullvideosegment"></a>
**`isFullVideoSegment(segment)`** · function, exported · L93–95

A segment the API returned as a whole-video label.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [pickFullLabel](#fn-labels-js-pickfulllabel), [features/sponsorblock/overlay.js › drawOverlay](#fn-overlay-js-drawoverlay)

<a id="fn-labels-js-skippableseconds"></a>
**`skippableSeconds(segments, duration)`** · function · L110–152

Total seconds removed by skipping, with overlaps counted once.

What counts: every category the user has not switched off. Auto Skip and Manual Skip segments come off because they will be skipped past; Show in Seek Bar segments come off too, which is what was asked for. Disable means the segment plays in full, so it stays in the running time.

Why the merge: SponsorBlock regularly returns overlapping segments for the same stretch of video - a sponsor read that is also tagged self-promo, for instance - and summing the raw durations would subtract that stretch twice and report a video shorter than it can possibly be.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-pickfulllabel"></a>
**`pickFullLabel(segments)`** · function · L167–186

The category to show for a video that is entirely one category (sponsor first, by FULL_PRIORITY), leaving out categories set to Disable; null when there is none.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [isFullVideoSegment](#fn-labels-js-isfullvideosegment)
- **Called by:** [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-buildcss"></a>
**`buildCss(segments, duration)`** · function · L189–215

Build the rules for the current state. Empty string means "show nothing".

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/text.js › formatTime](core.md#fn-text-js-formattime), [badgeColor](#fn-labels-js-badgecolor), [contrastColor](#fn-labels-js-contrastcolor), [cssString](#fn-labels-js-cssstring), [pickFullLabel](#fn-labels-js-pickfulllabel), [skippableSeconds](#fn-labels-js-skippableseconds)
- **Called by:** [SponsorBlockLabels.update](#fn-labels-js-sponsorblocklabels-update)
- **Settings:** reads `sbFullVideoLabel`, `sbShowTimeWithSkips`

<a id="fn-labels-js-sponsorblocklabels-constructor"></a>
**`SponsorBlockLabels.constructor()`** · method · L219–222

No &lt;style> element until there is something to write.

- **Called by:** [at load](#mod-labels-js)

<a id="fn-labels-js-sponsorblocklabels-write"></a>
**`SponsorBlockLabels.write(css)`** · method · L228–244

Puts `css` in the labels' &lt;style> element (creating it when needed); unchanged CSS is not written again.

- **Called by:** [SponsorBlockLabels.clear](#fn-labels-js-sponsorblocklabels-clear), [SponsorBlockLabels.update](#fn-labels-js-sponsorblocklabels-update)

<a id="fn-labels-js-sponsorblocklabels-update"></a>
**`SponsorBlockLabels.update(segments, duration)`** · method · L247–249

Recomputes both readouts (the handler's updateLabels says when).

- **Calls:** [SponsorBlockLabels.write](#fn-labels-js-sponsorblocklabels-write), [buildCss](#fn-labels-js-buildcss)

<a id="fn-labels-js-sponsorblocklabels-clear"></a>
**`SponsorBlockLabels.clear()`** · method · L252–254

Removes every label.

- **Calls:** [SponsorBlockLabels.write](#fn-labels-js-sponsorblocklabels-write)

<a id="mod-mute-js"></a>

## features/sponsorblock/mute.js

> Muted segments: the audio is off while the playhead is inside a segment the API marked `mute` (and the setting allows it), and the viewer's own mute state comes back on the way out, on a seek away and on destroy.

23 lines · imported by [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/skipping.js](#mod-skipping-js)

<a id="fn-mute-js-entermutedsegment"></a>
**`enterMutedSegment(sb, seg)`** · function, exported · L6–11

Mutes for `seg`, remembering the state to restore; a no-op while already muted for it.

- **Called by:** [features/sponsorblock/skipping.js › handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-mute-js-leavemutedsegment"></a>
**`leaveMutedSegment(sb, time)`** · function, exported · L17–23

Restores the mute state unless `time` is still inside the muted segment; without a time (or with NaN) it always restores.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo), [features/sponsorblock/skipping.js › handleTimeUpdate](#fn-skipping-js-handletimeupdate), [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/skipping.js › resetSegmentTracking](#fn-skipping-js-resetsegmenttracking), [features/sponsorblock/skipping.js › skipTo](#fn-skipping-js-skipto)

<a id="mod-overlay-js"></a>

## features/sponsorblock/overlay.js

> The coloured segment overlay beside the progress bar: the anchor it sits by, keeping its geometry in sync, and drawing the segments. Finding the bar is bar.js's job.

234 lines · imports [core/config.js](core.md#mod-config-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/labels.js](#mod-labels-js), [core/selectors.js](core.md#mod-selectors-js) · imported by [features/sponsorblock/bar.js](#mod-bar-js), [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/skipping.js](#mod-skipping-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

<a id="fn-overlay-js-anchorof"></a>
**`anchorOf(bar)`** · function, exported · L16–22

The element the overlay sits beside for `bar`: YouTube's progress-bar renderer around it, else ytlr-progress-bar, else the bar itself.

- **Called by:** [features/sponsorblock/bar.js › observeBarChildLists](#fn-bar-js-observebarchildlists), [getProgressBarAnchor](#fn-overlay-js-getprogressbaranchor)
- **Selectors:** `PROGRESS_BAR_RENDERER`, `PROGRESS_BAR`

<a id="fn-overlay-js-getprogressbaranchor"></a>
**`getProgressBarAnchor(sb)`** · function, exported · L29–53

The anchor of the tracked bar (anchorOf). The overlay is always a sibling of it, because YouTube's renderer destroys foreign children. Null while there is no bar, or the bar has no parent to be a sibling in.

- **Calls:** [anchorOf](#fn-overlay-js-anchorof)
- **Called by:** [features/sponsorblock/bar.js › observeBarAttributes](#fn-bar-js-observebarattributes), [drawOverlay](#fn-overlay-js-drawoverlay), [resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Browser:** `getComputedStyle`

<a id="fn-overlay-js-forgetanchor"></a>
**`forgetAnchor(sb)`** · function, exported · L56–58

Forgets the cached anchor; the next getProgressBarAnchor() recomputes it.

- **Called by:** [features/sponsorblock/bar.js › acquireProgressBar](#fn-bar-js-acquireprogressbar), [features/sponsorblock/bar.js › ensureObserverAlive](#fn-bar-js-ensureobserveralive), [features/sponsorblock/bar.js › trackBar](#fn-bar-js-trackbar), [drawOverlay](#fn-overlay-js-drawoverlay), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-overlay-js-offsetrelativeto"></a>
**`offsetRelativeTo(el, ancestor)`** · function · L62–69

The offset of `el` within `ancestor`, so the sibling overlay can be placed over exactly the same box.

- **Called by:** [syncOverlayPosition](#fn-overlay-js-syncoverlayposition)
- **Browser:** `getBoundingClientRect`

<a id="fn-overlay-js-syncoverlayposition"></a>
**`syncOverlayPosition(sb, anchor)`** · function · L72–108

Puts the overlay over the tracked bar's box, at its visibility.

- **Calls:** [offsetRelativeTo](#fn-overlay-js-offsetrelativeto)
- **Called by:** [drawOverlay](#fn-overlay-js-drawoverlay), [resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Selectors:** `HIDDEN_CLASS`
- **Browser:** `offsetWidth`, `offsetHeight`

<a id="fn-overlay-js-resyncoverlay"></a>
**`resyncOverlay(sb)`** · function, exported · L111–115

Re-syncs the overlay with the tracked bar now; nothing to do without either.

- **Calls:** [getProgressBarAnchor](#fn-overlay-js-getprogressbaranchor), [syncOverlayPosition](#fn-overlay-js-syncoverlayposition)
- **Called by:** [features/sponsorblock/bar.js › adoptBar](#fn-bar-js-adoptbar), [features/sponsorblock/bar.js › narrowProgressBar](#fn-bar-js-narrowprogressbar), [features/sponsorblock/bar.js › resyncTrackedBar](#fn-bar-js-resynctrackedbar), [resyncOverlayThrottled](#fn-overlay-js-resyncoverlaythrottled), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-overlay-js-resyncoverlaythrottled"></a>
**`resyncOverlayThrottled(sb)`** · function, exported · L121–128

resyncOverlay at most every OVERLAY_SYNC_MS: the timeupdate path, which fires at about 4 Hz while the viewport rarely changes.

- **Calls:** [resyncOverlay](#fn-overlay-js-resyncoverlay)
- **Called by:** [features/sponsorblock/skipping.js › handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-overlay-js-drawoverlay"></a>
**`drawOverlay(sb)`** · function, exported · L136–217

Draws (or keeps) the overlay for the current segments and settings beside the tracked bar. False when the bar is gone from the document: the caller then looks for it again. True otherwise, including when nothing needs drawing.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [features/sponsorblock/constants.js › categoryColor](#fn-constants-js-categorycolor), [features/sponsorblock/labels.js › isFullVideoSegment](#fn-labels-js-isfullvideosegment), [forgetAnchor](#fn-overlay-js-forgetanchor), [getProgressBarAnchor](#fn-overlay-js-getprogressbaranchor), [syncOverlayPosition](#fn-overlay-js-syncoverlayposition)
- **Called by:** [features/sponsorblock/bar.js › redrawOverlay](#fn-bar-js-redrawoverlay)
- **Settings:** uses `(all)`

<a id="fn-overlay-js-recolouroverlay"></a>
**`recolourOverlay(sb)`** · function, exported · L224–234

Gives every mark its category's colour as the settings have it now: a colour picked in the panel (one change per step of a drag) repaints the marks rather than rebuilding the overlay.

- **Calls:** [features/sponsorblock/constants.js › categoryColor](#fn-constants-js-categorycolor)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.recolour](#fn-index-js-sponsorblockhandler-setupconfiglisteners-recolour)

<a id="mod-popup-js"></a>

## features/sponsorblock/popup.js

> The SponsorBlock popup beside the options panel: the current video's segments, one row each with its category colour, name and time. The panel shows it on the SponsorBlock page of a watch page (ui/panel/panel.js).

118 lines · imports [features/sponsorblock/segments.js](#mod-segments-js), [core/text.js](core.md#mod-text-js), [ui/dom.js](ui.md#mod-dom-js), [features/sponsorblock/constants.js](#mod-constants-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js)

**At load:**

- **Calls:** [SponsorBlockUI.constructor](#fn-popup-js-sponsorblockui-constructor)

<a id="fn-popup-js-sponsorblockui-constructor"></a>
**`SponsorBlockUI.constructor()`** · method · L13–20

Hidden, with no segments; the popup element is built the first time it is shown.

- **Called by:** [at load](#mod-popup-js)

<a id="fn-popup-js-sponsorblockui-createpopup"></a>
**`SponsorBlockUI.createPopup()`** · method · L23–51

Builds the popup (header and an empty list) and adds it to the page, once.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [SponsorBlockUI.togglePopup](#fn-popup-js-sponsorblockui-togglepopup)

<a id="fn-popup-js-sponsorblockui-updatesegments"></a>
**`SponsorBlockUI.updateSegments(segments)`** · method · L54–61

Remembers the list; the rows are built when the popup is shown, not per video.

- **Calls:** [SponsorBlockUI.renderRows](#fn-popup-js-sponsorblockui-renderrows)

<a id="fn-popup-js-sponsorblockui-renderrows"></a>
**`SponsorBlockUI.renderRows()`** · method · L66–100

Rebuilds the list: one row per segment with its colour, label and time, then shows the popup.

- **Calls:** [core/text.js › formatTime](core.md#fn-text-js-formattime), [features/sponsorblock/constants.js › categoryColor](#fn-constants-js-categorycolor), [features/sponsorblock/segments.js › categoryLabel](#fn-segments-js-categorylabel), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [SponsorBlockUI.togglePopup](#fn-popup-js-sponsorblockui-togglepopup), [SponsorBlockUI.updateSegments](#fn-popup-js-sponsorblockui-updatesegments)
- **Browser:** `querySelector`

<a id="fn-popup-js-sponsorblockui-togglepopup"></a>
**`SponsorBlockUI.togglePopup(visible)`** · method · L106–115

Shows or hides the popup (the options panel shows it beside the SponsorBlock page); shown only while the video has segments.

- **Calls:** [SponsorBlockUI.createPopup](#fn-popup-js-sponsorblockui-createpopup), [SponsorBlockUI.renderRows](#fn-popup-js-sponsorblockui-renderrows)

<a id="mod-segments-js"></a>

## features/sponsorblock/segments.js

> Segment math, touching nothing but the handler's segment fields: which segments are skippable under the current settings, where the playhead is relative to them, and the end clamp. The chain at the start is chain.js.

139 lines · imports [core/config.js](core.md#mod-config-js), [core/text.js](core.md#mod-text-js), [features/sponsorblock/constants.js](#mod-constants-js) · imported by [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/popup.js](#mod-popup-js), [features/sponsorblock/skipping.js](#mod-skipping-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

<a id="fn-segments-js-categoryname"></a>
**`categoryName(category)`** · function, exported · L13–15

The category's name inside a sentence.

- **Called by:** [rebuildSkipSegments](#fn-segments-js-rebuildskipsegments)

<a id="fn-segments-js-skipmessage"></a>
**`skipMessage(names)`** · function, exported · L22–32

The toast after a skip, for the names of the categories skipped (repeats dropped): "Skipped sponsored segment", "Skipped intro and sponsored segment", "Skipped a, b, and c segment".

- **Called by:** [features/sponsorblock/skipping.js › skipTo](#fn-skipping-js-skipto)

<a id="fn-segments-js-categorylabel"></a>
**`categoryLabel(category)`** · function, exported · L35–37

The category's label in a list.

- **Calls:** [core/text.js › capitalize](core.md#fn-text-js-capitalize)
- **Called by:** [features/sponsorblock/popup.js › SponsorBlockUI.renderRows](#fn-popup-js-sponsorblockui-renderrows)

<a id="fn-segments-js-rebuildskipsegments"></a>
**`rebuildSkipSegments(sb)`** · function, exported · L44–75

Rebuilds `sb.skipSegments` from the API's segments and the settings: the segments to act on, in start order, each with its mode (auto_skip, manual_skip or mute) and its index in `sb.segments`.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall), [categoryName](#fn-segments-js-categoryname)
- **Called by:** [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments)
- **Settings:** uses `(all)`

<a id="fn-segments-js-findsegmentattime"></a>
**`findSegmentAtTime(sb, time)`** · function, exported · L84–96

Index of the segment `time` is in, or -1. Segments overlap (a self-promo inside a sponsor, say), so this is a scan rather than a binary search, and when several contain the time a manual one wins over an auto-skip one, which wins over a muted one: a skip must stop at a manual segment, and a skip takes a muted part with it.

- **Called by:** [features/sponsorblock/skipping.js › aimAt](#fn-skipping-js-aimat), [features/sponsorblock/skipping.js › findCurrentSegment](#fn-skipping-js-findcurrentsegment)

<a id="fn-segments-js-findnextsegmentindex"></a>
**`findNextSegmentIndex(sb, time)`** · function, exported · L99–114

Index of the first segment starting at or after `time` (binary search on the sorted starts).

- **Called by:** [features/sponsorblock/skipping.js › aimAt](#fn-skipping-js-aimat)

<a id="fn-segments-js-clampsegments"></a>
**`clampSegments(sb, duration)`** · function, exported · L123–139

Clamps the segments to the video's duration, and short of it on the legacy engines; true when anything moved, so the caller rebuilds the skip list. The end always comes from the one the API gave (`apiEnd`, kept on the first clamp), so a short duration reported first and the real one later give the segment back its end.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)

<a id="mod-skipping-js"></a>

## features/sponsorblock/skipping.js

> Playback-time behaviour: aiming at the next segment, the timeupdate listener, the per-frame loop near a segment and the skip itself, which the chain at the start (chain.js) takes too. The blue key is blue-key.js.

316 lines · imports [core/config.js](core.md#mod-config-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [core/text.js](core.md#mod-text-js), [features/sponsorblock/constants.js](#mod-constants-js), [features/sponsorblock/segments.js](#mod-segments-js), [features/sponsorblock/overlay.js](#mod-overlay-js), [features/sponsorblock/mute.js](#mod-mute-js) · imported by [features/sponsorblock/blue-key.js](#mod-blue-key-js), [features/sponsorblock/chain.js](#mod-chain-js), [features/sponsorblock/index.js](#mod-index-js), [features/sponsorblock/video-events.js](#mod-video-events-js)

<a id="fn-skipping-js-attachtimelistener"></a>
**`attachTimeListener(sb)`** · function · L20–24

Starts listening to timeupdate on a playing video (once).

- **Called by:** [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking)
- **Events:** listens to `timeupdate`

<a id="fn-skipping-js-detachtimelistener"></a>
**`detachTimeListener(sb)`** · function, exported · L27–31

Stops listening to timeupdate.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo), [aimPast](#fn-skipping-js-aimpast), [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-skipping-js-starthighfreqloop"></a>
**`startHighFreqLoop(sb)`** · function · L37–41

Starts the per-frame check when a segment is coming up, so the skip lands on time rather than up to a timeupdate (about 250 ms) late.

- **Called by:** [handleTimeUpdate](#fn-skipping-js-handletimeupdate)
- **Browser:** `requestAnimationFrame`

<a id="fn-skipping-js-stophighfreqloop"></a>
**`stopHighFreqLoop(sb)`** · function, exported · L44–49

Stops the per-frame check.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.unbindVideo](#fn-index-js-sponsorblockhandler-unbindvideo), [highFreqLoop](#fn-skipping-js-highfreqloop), [refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-skipping-js-highfreqloop"></a>
**`highFreqLoop(sb)`** · function, exported · L55–66

One frame of the check: hands over to handleTimeUpdate once the playhead reaches the next segment, else asks for the next frame. Stops on pause, a skip or destroy.

- **Calls:** [handleTimeUpdate](#fn-skipping-js-handletimeupdate), [stopHighFreqLoop](#fn-skipping-js-stophighfreqloop)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.boundHighFreqLoop](#fn-index-js-sponsorblockhandler-boundhighfreqloop)
- **Browser:** `requestAnimationFrame`

<a id="fn-skipping-js-aimat"></a>
**`aimAt(sb, time)`** · function · L71–78

Aims at the segment containing `time`, else the first one after it.

- **Calls:** [features/sponsorblock/segments.js › findNextSegmentIndex](#fn-segments-js-findnextsegmentindex), [features/sponsorblock/segments.js › findSegmentAtTime](#fn-segments-js-findsegmentattime)
- **Called by:** [aimPast](#fn-skipping-js-aimpast), [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking)

<a id="fn-skipping-js-aimpast"></a>
**`aimPast(sb, time)`** · function, exported · L81–84

Aims past `time`, and stops listening when nothing is left.

- **Calls:** [aimAt](#fn-skipping-js-aimat), [detachTimeListener](#fn-skipping-js-detachtimelistener)
- **Called by:** [features/sponsorblock/blue-key.js › manualSkipOrHighlight](#fn-blue-key-js-manualskiporhighlight), [handleTimeUpdate](#fn-skipping-js-handletimeupdate), [skipTo](#fn-skipping-js-skipto)

<a id="fn-skipping-js-resetsegmenttracking"></a>
**`resetSegmentTracking(sb)`** · function, exported · L92–108

Re-aims from the playhead and re-arms the listener: after a seek, when playback resumes and after the skip list changed. The manual-skip prompt stays up while the playhead is still inside its segment, so resuming there does not blink it off and on.

- **Calls:** [features/sponsorblock/mute.js › leaveMutedSegment](#fn-mute-js-leavemutedsegment), [aimAt](#fn-skipping-js-aimat), [attachTimeListener](#fn-skipping-js-attachtimelistener), [clearManualNotification](#fn-skipping-js-clearmanualnotification), [detachTimeListener](#fn-skipping-js-detachtimelistener)
- **Called by:** [armSkipWatchdog](#fn-skipping-js-armskipwatchdog), [refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents), [features/sponsorblock/video-events.js › bindWindowEvents](#fn-video-events-js-bindwindowevents)

<a id="fn-skipping-js-refreshskipsegments"></a>
**`refreshSkipSegments(sb)`** · function, exported · L111–117

Rebuilds the skip list for the current settings and re-aims.

- **Calls:** [features/sponsorblock/mute.js › leaveMutedSegment](#fn-mute-js-leavemutedsegment), [features/sponsorblock/segments.js › rebuildSkipSegments](#fn-segments-js-rebuildskipsegments), [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking), [stopHighFreqLoop](#fn-skipping-js-stophighfreqloop)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo), [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.rebuild](#fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)

<a id="fn-skipping-js-clearmanualnotification"></a>
**`clearManualNotification(sb)`** · function, exported · L122–128

Removes the manual-skip prompt and forgets the segment it offered.

- **Called by:** [features/sponsorblock/blue-key.js › manualSkipOrHighlight](#fn-blue-key-js-manualskiporhighlight), [features/sponsorblock/index.js › SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy), [handleTimeUpdate](#fn-skipping-js-handletimeupdate), [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking)

<a id="fn-skipping-js-armskipwatchdog"></a>
**`armSkipWatchdog(sb)`** · function, exported · L133–143

Safety net: if the media pipeline swallows the 'seeked' event for a programmatic skip (buffer stalls / near-EOS quirks on webOS), clear the isSkipping latch so the timeupdate pipeline keeps working.

- **Calls:** [resetSegmentTracking](#fn-skipping-js-resetsegmenttracking)
- **Called by:** [features/sponsorblock/blue-key.js › manualSkipOrHighlight](#fn-blue-key-js-manualskiporhighlight), [skipTo](#fn-skipping-js-skipto)
- **Browser:** `setTimeout`

<a id="fn-skipping-js-clearskipwatchdog"></a>
**`clearSkipWatchdog(sb)`** · function, exported · L146–151

Stops the timer that catches a skip whose seek never completed.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.destroy](#fn-index-js-sponsorblockhandler-destroy), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)

<a id="fn-skipping-js-findcurrentsegment"></a>
**`findCurrentSegment(sb, currentTime)`** · function · L160–165

Index of the segment `currentTime` is in. The predicted one is trusted when it is a manual segment; otherwise the scan decides, since a manual segment nested in the predicted one takes precedence (see findSegmentAtTime).

- **Calls:** [features/sponsorblock/segments.js › findSegmentAtTime](#fn-segments-js-findsegmentattime)
- **Called by:** [handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-skipping-js-announcesegment"></a>
**`announceSegment(sb, seg)`** · function · L168–174

The manual-skip prompt for a segment that is not auto-skipped.

- **Calls:** [core/text.js › capitalize](core.md#fn-text-js-capitalize), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-skipping-js-shouldskip"></a>
**`shouldSkip(sb, seg, segmentIdx, currentTime)`** · function · L177–196

Whether an auto-skip segment is skipped now, or left alone.

- **Calls:** [core/config.js › configGetAll](core.md#fn-config-js-configgetall)
- **Called by:** [skipAutoSegment](#fn-skipping-js-skipautosegment)
- **Settings:** uses `(all)`

<a id="fn-skipping-js-findjumptarget"></a>
**`findJumpTarget(sb, segmentIdx, currentTime)`** · function · L204–230

Where the skip lands: past this segment and the auto-skip segments that follow it closely, but never past the start of a manual one ahead of the playhead. A manual segment already behind the playhead has had its turn, and a muted segment is skipped over like any other part of the video.

- **Called by:** [skipAutoSegment](#fn-skipping-js-skipautosegment)

<a id="fn-skipping-js-skipto"></a>
**`skipTo(sb, segmentIdx, currentTime, { jumpTarget, categories, indices })`** · function · L233–260

Performs the skip, then aims at whatever follows the landing point.

- **Calls:** [features/sponsorblock/mute.js › leaveMutedSegment](#fn-mute-js-leavemutedsegment), [features/sponsorblock/segments.js › skipMessage](#fn-segments-js-skipmessage), [aimPast](#fn-skipping-js-aimpast), [armSkipWatchdog](#fn-skipping-js-armskipwatchdog), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [skipAutoSegment](#fn-skipping-js-skipautosegment)

<a id="fn-skipping-js-skipautosegment"></a>
**`skipAutoSegment(sb, segmentIdx, currentTime)`** · function, exported · L267–270

The auto-skip segment at `segmentIdx`, with the ones close behind it, in one jump; unless shouldSkip leaves it alone. The timeupdate path and the chain at the start (chain.js) both come here.

- **Calls:** [findJumpTarget](#fn-skipping-js-findjumptarget), [shouldSkip](#fn-skipping-js-shouldskip), [skipTo](#fn-skipping-js-skipto)
- **Called by:** [features/sponsorblock/chain.js › executeChainSkip](#fn-chain-js-executechainskip), [handleTimeUpdate](#fn-skipping-js-handletimeupdate)

<a id="fn-skipping-js-handletimeupdate"></a>
**`handleTimeUpdate(sb)`** · function, exported · L276–316

The skip decision at the playhead: leaves a muted segment, polls faster before the next segment, and inside one auto-skips, mutes, or offers the manual skip according to its category's mode.

- **Calls:** [features/sponsorblock/mute.js › enterMutedSegment](#fn-mute-js-entermutedsegment), [features/sponsorblock/mute.js › leaveMutedSegment](#fn-mute-js-leavemutedsegment), [features/sponsorblock/overlay.js › resyncOverlayThrottled](#fn-overlay-js-resyncoverlaythrottled), [aimPast](#fn-skipping-js-aimpast), [announceSegment](#fn-skipping-js-announcesegment), [clearManualNotification](#fn-skipping-js-clearmanualnotification), [findCurrentSegment](#fn-skipping-js-findcurrentsegment), [skipAutoSegment](#fn-skipping-js-skipautosegment), [startHighFreqLoop](#fn-skipping-js-starthighfreqloop)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.boundTimeUpdate](#fn-index-js-sponsorblockhandler-boundtimeupdate), [highFreqLoop](#fn-skipping-js-highfreqloop), [features/sponsorblock/video-events.js › bindVideoEvents](#fn-video-events-js-bindvideoevents)

<a id="mod-video-events-js"></a>

## features/sponsorblock/video-events.js

> The listeners a handler binds: the player state event the quality module publishes and resize, once per handler; and the &lt;video> events that reset or re-arm segment tracking, once per &lt;video> element.

90 lines · imports [core/player-state.js](core.md#mod-player-state-js), [features/sponsorblock/bar.js](#mod-bar-js), [features/sponsorblock/overlay.js](#mod-overlay-js), [features/sponsorblock/segments.js](#mod-segments-js), [features/sponsorblock/skipping.js](#mod-skipping-js), [features/sponsorblock/chain.js](#mod-chain-js) · imported by [features/sponsorblock/index.js](#mod-index-js)

<a id="fn-video-events-js-bindwindowevents"></a>
**`bindWindowEvents(sb)`** · function, exported · L19–48

Called once, when the segments arrive; undone by the handler's bag.

- **Calls:** [features/sponsorblock/bar.js › acquireProgressBar](#fn-bar-js-acquireprogressbar), [features/sponsorblock/chain.js › executeChainSkip](#fn-chain-js-executechainskip), [features/sponsorblock/overlay.js › forgetAnchor](#fn-overlay-js-forgetanchor), [features/sponsorblock/overlay.js › resyncOverlay](#fn-overlay-js-resyncoverlay), [features/sponsorblock/skipping.js › detachTimeListener](#fn-skipping-js-detachtimelistener), [features/sponsorblock/skipping.js › resetSegmentTracking](#fn-skipping-js-resetsegmenttracking), [features/sponsorblock/skipping.js › stopHighFreqLoop](#fn-skipping-js-stophighfreqloop)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](#fn-index-js-sponsorblockhandler-applysegments)
- **Events:** listens to `yt-player-state-change`, `resize`

<a id="fn-video-events-js-bindvideoevents"></a>
**`bindVideoEvents(sb)`** · function, exported · L51–90

Called from bindVideo(); undone by the per-video bag.

- **Calls:** [features/sponsorblock/bar.js › redrawOverlay](#fn-bar-js-redrawoverlay), [features/sponsorblock/chain.js › executeChainSkip](#fn-chain-js-executechainskip), [features/sponsorblock/segments.js › clampSegments](#fn-segments-js-clampsegments), [features/sponsorblock/skipping.js › clearSkipWatchdog](#fn-skipping-js-clearskipwatchdog), [features/sponsorblock/skipping.js › detachTimeListener](#fn-skipping-js-detachtimelistener), [features/sponsorblock/skipping.js › handleTimeUpdate](#fn-skipping-js-handletimeupdate), [features/sponsorblock/skipping.js › refreshSkipSegments](#fn-skipping-js-refreshskipsegments), [features/sponsorblock/skipping.js › resetSegmentTracking](#fn-skipping-js-resetsegmenttracking), [features/sponsorblock/skipping.js › stopHighFreqLoop](#fn-skipping-js-stophighfreqloop), [bindVideoEvents.listen](#fn-video-events-js-bindvideoevents-listen)
- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](#fn-index-js-sponsorblockhandler-bindvideo)

<a id="fn-video-events-js-bindvideoevents-listen"></a>
**`bindVideoEvents.listen(type, handler)`** · arrow · L55–55

A listener on the bound &lt;video> that goes with the per-video bag.

- **Called by:** [bindVideoEvents](#fn-video-events-js-bindvideoevents)
