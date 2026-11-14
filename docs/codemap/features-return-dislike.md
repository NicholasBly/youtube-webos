# Code map: features/return-dislike/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/return-dislike/api.js](#mod-api-js), [features/return-dislike/bootstrap.js](#mod-bootstrap-js), [features/return-dislike/constants.js](#mod-constants-js), [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/index.js](#mod-index-js), [features/return-dislike/injection.js](#mod-injection-js), [features/return-dislike/navigation.js](#mod-navigation-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js)

<a id="mod-api-js"></a>

## features/return-dislike/api.js

> The Return YouTube Dislike API and its short-lived in-memory cache.

34 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [core/fetch-timeout.js](core.md#mod-fetch-timeout-js) · imported by [features/return-dislike/index.js](#mod-index-js)

<a id="fn-api-js-getcacheddislikes"></a>
**`getCachedDislikes(videoID)`** · function, exported · L8–12

The cached count for a video, or undefined when absent or stale.

- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata)

<a id="fn-api-js-setcacheddislikes"></a>
**`setCachedDislikes(videoID, dislikes)`** · function, exported · L15–18

Remembers a video's dislike count, keeping the 50 most recent videos.

- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata)

<a id="fn-api-js-fetchdislikecount"></a>
**`fetchDislikeCount(videoID)`** · function, exported · L25–34

Asks the API for the dislike count: `promise` rejects on HTTP errors, network errors and after the timeout, so the caller decides about retries; `abort()` drops the request.

- **Calls:** [core/fetch-timeout.js › fetchJsonWithTimeout](core.md#fn-fetch-timeout-js-fetchjsonwithtimeout)
- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata)

<a id="mod-bootstrap-js"></a>

## features/return-dislike/bootstrap.js

> Global start: one instance per watched video (core/per-video.js). The instance exists even with the dislike count off: the description panel's keyboard navigation is its too.

23 lines · imports [core/config.js](core.md#mod-config-js), [core/per-video.js](core.md#mod-per-video-js) · imported by [features/return-dislike/index.js](#mod-index-js), [ui/shortcuts/panels.js](ui-shortcuts.md#mod-panels-js)

<a id="fn-bootstrap-js-live"></a>
**`live()`** · arrow · L8–8

The live instance (core/per-video.js), once bootstrapped.

- **Called by:** [getReturnDislike](#fn-bootstrap-js-getreturndislike)

<a id="fn-bootstrap-js-getreturndislike"></a>
**`getReturnDislike()`** · function, exported · L11–13

The ReturnYouTubeDislike instance for the video being watched, or null.

- **Calls:** [live](#fn-bootstrap-js-live)
- **Called by:** [ui/shortcuts/panels.js › toggleDescription](ui-shortcuts.md#fn-panels-js-toggledescription)

<a id="fn-bootstrap-js-bootstrapreturndislike"></a>
**`bootstrapReturnDislike(ReturnYouTubeDislike)`** · function, exported · L16–23

Takes the class rather than importing it, so the two files do not import each other.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/per-video.js › bootstrapPerVideo](core.md#fn-per-video-js-bootstrappervideo)
- **Called by:** [features/return-dislike/index.js (at load)](#mod-index-js)
- **Settings:** reads `enableReturnYouTubeDislike`

<a id="mod-constants-js"></a>

## features/return-dislike/constants.js

> Timing, the API, feature detection and the description panel's selectors.

49 lines · imports [core/selectors.js](core.md#mod-selectors-js), [core/webos.js](core.md#mod-webos-js) · imported by [features/return-dislike/api.js](#mod-api-js), [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/index.js](#mod-index-js), [features/return-dislike/injection.js](#mod-injection-js), [features/return-dislike/navigation.js](#mod-navigation-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js)

**At load:**

- **Calls:** [core/webos.js › isLegacyWebOS](core.md#fn-webos-js-islegacywebos)
- **Selectors:** `FOCUS_CLASS`

<a id="mod-focus-tracking-js"></a>

## features/return-dislike/focus-tracking.js

> Focus is the only reliable signal for the role="dialog" description panel on webOS: these capture-phase listeners detect the panel, track whether focus is inside it and keep the highlight in step. `ryd` is the instance.

66 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js), [features/return-dislike/navigation.js](#mod-navigation-js) · imported by [features/return-dislike/index.js](#mod-index-js)

<a id="fn-focus-tracking-js-attachlisteners"></a>
**`attachListeners(ryd)`** · function, exported · L10–14

The window and document listeners, undone by the instance's bag.

- **Calls:** [handleFocusIn](#fn-focus-tracking-js-handlefocusin), [handleFocusOut](#fn-focus-tracking-js-handlefocusout), [features/return-dislike/navigation.js › handleNavigation](#fn-navigation-js-handlenavigation)
- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.init](#fn-index-js-returnyoutubedislike-init)
- **Events:** listens to `keydown`, `focusin`, `focusout`

<a id="fn-focus-tracking-js-handlefocusin"></a>
**`handleFocusIn(ryd, e)`** · function · L20–47

A focus change on the watch page: finds the description panel when the focus enters it (the main way it is detected), and highlights the menu item that got the focus.

- **Calls:** [features/return-dislike/navigation.js › updateVisualState](#fn-navigation-js-updatevisualstate), [features/return-dislike/panel-dom.js › closestMenuItem](#fn-panel-dom-js-closestmenuitem), [features/return-dislike/panel-dom.js › closestPanel](#fn-panel-dom-js-closestpanel), [features/return-dislike/panel-observer.js › pollForPanel](#fn-panel-observer-js-pollforpanel), [features/return-dislike/panel-observer.js › releasePanel](#fn-panel-observer-js-releasepanel), [features/return-dislike/panel-observer.js › setupPanel](#fn-panel-observer-js-setuppanel)
- **Called by:** [attachListeners](#fn-focus-tracking-js-attachlisteners)

<a id="fn-focus-tracking-js-handlefocusout"></a>
**`handleFocusOut(ryd)`** · function · L50–66

Focus left something: once it settles, clears the highlights if it left the panel.

- **Calls:** [features/return-dislike/navigation.js › clearAllHighlights](#fn-navigation-js-clearallhighlights)
- **Called by:** [attachListeners](#fn-focus-tracking-js-attachlisteners)

<a id="mod-index-js"></a>

## features/return-dislike/index.js

> Return YouTube Dislike: shows the dislike count in the description panel and keeps keyboard navigation working inside it. This class owns the fields, the lifecycle and the data fetch; the sibling modules take the instance as `ryd`.

158 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [core/disposables.js](core.md#mod-disposables-js), [core/log.js](core.md#mod-log-js), [features/return-dislike/api.js](#mod-api-js), [features/return-dislike/injection.js](#mod-injection-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js), [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/bootstrap.js](#mod-bootstrap-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [features/return-dislike/bootstrap.js › bootstrapReturnDislike](#fn-bootstrap-js-bootstrapreturndislike), [ReturnYouTubeDislike.constructor](#fn-index-js-returnyoutubedislike-constructor)

<a id="fn-index-js-returnyoutubedislike-constructor"></a>
**`ReturnYouTubeDislike.constructor(videoID, enableDislikes)`** · method · L19–61

A dislike counter for one video: empty state (the count, the panel, its observers, the focus tracking, named timers). init() starts it.

- **Calls:** [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [core/log.js › createLogger](core.md#fn-log-js-createlogger)
- **Called by:** [at load](#mod-index-js)

<a id="fn-index-js-returnyoutubedislike-schedule"></a>
**`ReturnYouTubeDislike.schedule(callback, delay, name)`** · method · L64–71

A named timer: scheduling again replaces the pending one, destroy clears them all.

- **Called by:** [ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata)
- **Browser:** `setTimeout`

<a id="fn-index-js-returnyoutubedislike-init"></a>
**`ReturnYouTubeDislike.init()`** · method, async · L76–93

Starts the listeners, looks for an open description panel once, and fetches the dislike count.

- **Calls:** [features/return-dislike/focus-tracking.js › attachListeners](#fn-focus-tracking-js-attachlisteners), [ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata), [features/return-dislike/panel-observer.js › findPanelNow](#fn-panel-observer-js-findpanelnow)

<a id="fn-index-js-returnyoutubedislike-fetchvideodata"></a>
**`ReturnYouTubeDislike.fetchVideoData()`** · method, async · L99–132

Gets the dislike count (cached, else from the API) and shows it; a failed request is retried a few times with a growing delay.

- **Calls:** [features/return-dislike/api.js › fetchDislikeCount](#fn-api-js-fetchdislikecount), [features/return-dislike/api.js › getCachedDislikes](#fn-api-js-getcacheddislikes), [features/return-dislike/api.js › setCachedDislikes](#fn-api-js-setcacheddislikes), [ReturnYouTubeDislike.schedule](#fn-index-js-returnyoutubedislike-schedule), [features/return-dislike/injection.js › updateDislikeDisplay](#fn-injection-js-updatedislikedisplay)
- **Called by:** [ReturnYouTubeDislike.init](#fn-index-js-returnyoutubedislike-init)

<a id="fn-index-js-returnyoutubedislike-pollforpanel"></a>
**`ReturnYouTubeDislike.pollForPanel()`** · method · L135–137

The description shortcut and a stale panel arm the bounded poll (panel-observer.js).

<a id="fn-index-js-returnyoutubedislike-destroy"></a>
**`ReturnYouTubeDislike.destroy()`** · method · L143–155

Undoes everything: the fetch, timers, the panel poll, listeners, the panel's observers and the header shift. Safe to call twice.

- **Calls:** [features/return-dislike/injection.js › clearHeaderShift](#fn-injection-js-clearheadershift), [features/return-dislike/panel-observer.js › releasePanel](#fn-panel-observer-js-releasepanel), [features/return-dislike/panel-observer.js › stopPanelPoll](#fn-panel-observer-js-stoppanelpoll)

<a id="mod-injection-js"></a>

## features/return-dislike/injection.js

> Puts the dislike factoid into the description panel and keeps the rows below it where YouTube expects them.

257 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js), [core/selectors.js](core.md#mod-selectors-js) · imported by [features/return-dislike/index.js](#mod-index-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js)

<a id="fn-injection-js-disliketext"></a>
**`dislikeText(ryd)`** · function · L27–29

The count as the factoid shows it: the placeholder until the fetch lands.

- **Calls:** [features/return-dislike/panel-dom.js › formatNumber](#fn-panel-dom-js-formatnumber)
- **Called by:** [insertDislikeFactoid](#fn-injection-js-insertdislikefactoid), [updateDislikeDisplay](#fn-injection-js-updatedislikedisplay)

<a id="fn-injection-js-updatedislikedisplay"></a>
**`updateDislikeDisplay(ryd)`** · function, exported · L36–46

Rewrites the already-injected factoid in place. Injection does not wait for the network, so this turns the placeholder into the real number whenever the fetch lands, first try or third.

- **Calls:** [compensateHeaderGrowth](#fn-injection-js-compensateheadergrowth), [dislikeText](#fn-injection-js-disliketext)
- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.fetchVideoData](#fn-index-js-returnyoutubedislike-fetchvideodata)

<a id="fn-injection-js-markheaderrow"></a>
**`markHeaderRow(rows, header)`** · function · L49–58

Marks `header` among `rows` and no other, touching only the rows whose mark is wrong.

- **Called by:** [applyShift](#fn-injection-js-applyshift)

<a id="fn-injection-js-rootfontsize"></a>
**`rootFontSize()`** · function · L64–69

The page's root font size in px, read once (the panel's rem sizes depend on it).

- **Called by:** [measureGrowth](#fn-injection-js-measuregrowth)
- **Browser:** `getComputedStyle`

<a id="fn-injection-js-findheaderrow"></a>
**`findHeaderRow(container)`** · function · L72–80

The row of YouTube's virtual list that holds `container`, with the list and its box, or null.

- **Called by:** [compensateHeaderGrowth](#fn-injection-js-compensateheadergrowth)
- **Selectors:** `VIRTUAL_LIST`

<a id="fn-injection-js-measuregrowth"></a>
**`measureGrowth(ryd, row)`** · function · L90–109

How far the row's content outgrew the height YouTube measured it at, in px, and whether that is the last pass's answer for the same row; null for a row YouTube never measured (0 or no inline height: its zero-height state), where shifting against a bogus height would make things worse. Measured (a forced layout) only when the row, its inline height or its content box changed since the last pass; a re-render that keeps them keeps the delta.

- **Calls:** [rootFontSize](#fn-injection-js-rootfontsize)
- **Called by:** [compensateHeaderGrowth](#fn-injection-js-compensateheadergrowth)
- **Browser:** `getBoundingClientRect`

<a id="fn-injection-js-applyshift"></a>
**`applyShift(ryd, found, delta)`** · function · L112–133

Marks the list and its header row, and moves the rows below by `delta` px.

- **Calls:** [clearHeaderShift](#fn-injection-js-clearheadershift), [markHeaderRow](#fn-injection-js-markheaderrow)
- **Called by:** [compensateHeaderGrowth](#fn-injection-js-compensateheadergrowth)
- **Selectors:** `VIRTUAL_LIST`

<a id="fn-injection-js-compensateheadergrowth"></a>
**`compensateHeaderGrowth(ryd, container)`** · function · L144–157

YouTube measures each description row once, in the same task that renders it, and positions the rows below from that measurement. The header row then grows under the .ryd-ready styles, but YouTube keeps positioning every row below it with the old height, so they cover the Views/Date line. Push those rows down by the difference.

Rows are absolutely positioned, so margin-top moves them without touching YouTube's inline height/transform. The value lives in a stylesheet of its own, keyed on attributes, so a YouTube re-render cannot wipe it.

- **Calls:** [applyShift](#fn-injection-js-applyshift), [findHeaderRow](#fn-injection-js-findheaderrow), [measureGrowth](#fn-injection-js-measuregrowth)
- **Called by:** [checkAndInjectDislike](#fn-injection-js-checkandinjectdislike), [updateDislikeDisplay](#fn-injection-js-updatedislikedisplay)

<a id="fn-injection-js-clearheadershift"></a>
**`clearHeaderShift(ryd)`** · function, exported · L160–171

Undoes the header shift: the attributes on the panel's list and the shift stylesheet.

- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.destroy](#fn-index-js-returnyoutubedislike-destroy), [applyShift](#fn-injection-js-applyshift)
- **Browser:** `querySelector`

<a id="fn-injection-js-detectlayout"></a>
**`detectLayout(ryd, panelElement)`** · function · L178–193

The panel's layout and its factoid container: the layout is detected once and kept on `ryd`, the container found on the way being the one used; null when the panel has neither layout's container.

- **Called by:** [checkAndInjectDislike](#fn-injection-js-checkandinjectdislike)
- **Browser:** `querySelector`

<a id="fn-injection-js-insertdislikefactoid"></a>
**`insertDislikeFactoid(ryd, mode, container)`** · function · L202–226

Clones the likes factoid in `container` into the dislike one, fills it in, puts it right after the likes and keeps its elements on `ryd` for updateDislikeDisplay(). False when there is no likes factoid, or no value and label in it: the clone would be a second likes factoid that never fills in.

- **Calls:** [dislikeText](#fn-injection-js-disliketext)
- **Called by:** [checkAndInjectDislike](#fn-injection-js-checkandinjectdislike)
- **Browser:** `querySelector`

<a id="fn-injection-js-checkandinjectdislike"></a>
**`checkAndInjectDislike(ryd, panelElement)`** · function, exported · L232–257

Puts the dislike factoid into the description panel (with a placeholder until the count arrives), or keeps the header shift in step when it is already there.

- **Calls:** [compensateHeaderGrowth](#fn-injection-js-compensateheadergrowth), [detectLayout](#fn-injection-js-detectlayout), [insertDislikeFactoid](#fn-injection-js-insertdislikefactoid)
- **Called by:** [features/return-dislike/panel-observer.js › handlePanelMutation](#fn-panel-observer-js-handlepanelmutation), [features/return-dislike/panel-observer.js › setupPanel](#fn-panel-observer-js-setuppanel), [features/return-dislike/panel-observer.js › watchPanelVisibility](#fn-panel-observer-js-watchpanelvisibility)

<a id="mod-navigation-js"></a>

## features/return-dislike/navigation.js

> Keyboard navigation inside the description panel: which menu item is highlighted, moving between items, and forwarding Enter.

217 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js), [core/remote.js](core.md#mod-remote-js), [core/webos.js](core.md#mod-webos-js) · imported by [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js)

**At load:**

- **Calls:** [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion)

<a id="fn-navigation-js-scrollitemintoview"></a>
**`scrollItemIntoView(item)`** · function · L13–17

Brings an item into view, centred where the engine can.

- **Called by:** [moveFocus](#fn-navigation-js-movefocus)

<a id="fn-navigation-js-refreshmenucache"></a>
**`refreshMenuCache(ryd)`** · function · L23–44

Lists the panel's menu items (innermost only) with their indexes, and finds the one currently highlighted.

- **Called by:** [handleNavigation](#fn-navigation-js-handlenavigation), [updateVisualState](#fn-navigation-js-updatevisualstate)
- **Browser:** `querySelectorAll`, `querySelector`

<a id="fn-navigation-js-dynamiclist"></a>
**`dynamicList(ryd)`** · function · L47–52

The list container, looked up once per panel (forgotten with the menu cache).

- **Called by:** [clearAllHighlights](#fn-navigation-js-clearallhighlights), [updateVisualState](#fn-navigation-js-updatevisualstate)
- **Browser:** `querySelector`

<a id="fn-navigation-js-updatevisualstate"></a>
**`updateVisualState(ryd, targetItem)`** · function, exported · L58–82

Moves the highlight to `targetItem`, as YouTube draws its own focus (the item's classes and its wrapper's).

- **Calls:** [dynamicList](#fn-navigation-js-dynamiclist), [refreshMenuCache](#fn-navigation-js-refreshmenucache), [toggleParentFocus](#fn-navigation-js-toggleparentfocus)
- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin), [moveFocus](#fn-navigation-js-movefocus), [features/return-dislike/panel-observer.js › watchPanelVisibility](#fn-panel-observer-js-watchpanelvisibility)

<a id="fn-navigation-js-toggleparentfocus"></a>
**`toggleParentFocus(ryd, element, shouldFocus)`** · function · L95–123

Adds or removes the focused look of an item's wrapper (its class lookups cached per element).

- **Called by:** [clearAllHighlights](#fn-navigation-js-clearallhighlights), [updateVisualState](#fn-navigation-js-updatevisualstate)

<a id="fn-navigation-js-clearallhighlights"></a>
**`clearAllHighlights(ryd)`** · function, exported · L126–139

Removes the highlight from the last item and the list (focus left the panel).

- **Calls:** [dynamicList](#fn-navigation-js-dynamiclist), [toggleParentFocus](#fn-navigation-js-toggleparentfocus)
- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusOut](#fn-focus-tracking-js-handlefocusout), [pressEnter](#fn-navigation-js-pressenter), [features/return-dislike/panel-observer.js › releasePanel](#fn-panel-observer-js-releasepanel)

<a id="fn-navigation-js-pressenter"></a>
**`pressEnter(ryd, e)`** · function · L147–154

Enter on the highlighted menu item: intercepted only when the item itself is the active element. With focus on a focusable descendant the real Enter must reach YouTube: a synthetic keydown on the parent would target the wrong node.

- **Calls:** [clearAllHighlights](#fn-navigation-js-clearallhighlights), [features/return-dislike/panel-dom.js › triggerEnter](#fn-panel-dom-js-triggerenter)
- **Called by:** [handleNavigation](#fn-navigation-js-handlenavigation)

<a id="fn-navigation-js-resolvefocusedindex"></a>
**`resolveFocusedIndex(ryd)`** · function · L157–170

The index of the focused item, resynced when it drifted from the element; 0 when none is known.

- **Calls:** [features/return-dislike/panel-dom.js › closestMenuItem](#fn-panel-dom-js-closestmenuitem)
- **Called by:** [moveFocus](#fn-navigation-js-movefocus)

<a id="fn-navigation-js-movefocus"></a>
**`moveFocus(ryd, down)`** · function · L173–183

Moves focus and the highlight one item down or up, wrapping at the ends.

- **Calls:** [resolveFocusedIndex](#fn-navigation-js-resolvefocusedindex), [scrollItemIntoView](#fn-navigation-js-scrollitemintoview), [updateVisualState](#fn-navigation-js-updatevisualstate)
- **Called by:** [handleNavigation](#fn-navigation-js-handlenavigation)

<a id="fn-navigation-js-handlenavigation"></a>
**`handleNavigation(ryd, e)`** · function, exported · L186–217

A key on the description panel: Up and Down move between its items, Enter presses one.

- **Calls:** [moveFocus](#fn-navigation-js-movefocus), [pressEnter](#fn-navigation-js-pressenter), [refreshMenuCache](#fn-navigation-js-refreshmenucache)
- **Called by:** [features/return-dislike/focus-tracking.js › attachListeners](#fn-focus-tracking-js-attachlisteners)

<a id="mod-panel-dom-js"></a>

## features/return-dislike/panel-dom.js

> DOM helpers with no instance state: ancestor walks, number formatting and the synthetic Enter press.

36 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [core/remote.js](core.md#mod-remote-js) · imported by [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/injection.js](#mod-injection-js), [features/return-dislike/navigation.js](#mod-navigation-js), [features/return-dislike/panel-observer.js](#mod-panel-observer-js)

<a id="fn-panel-dom-js-closestpanel"></a>
**`closestPanel(el)`** · function, exported · L10–15

closest() runs the selector engine at every level of the ancestor chain, and handleFocusIn runs on every focus change in the app while a watch page is open. Both selectors here are trivial (a tag name, an attribute), so a hand-rolled walk gives the same answer without the engine.

- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin)

<a id="fn-panel-dom-js-closestmenuitem"></a>
**`closestMenuItem(el)`** · function, exported · L18–23

The closest ancestor of `el` (or `el` itself) with role=menuitem, or null.

- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin), [features/return-dislike/navigation.js › resolveFocusedIndex](#fn-navigation-js-resolvefocusedindex), [features/return-dislike/panel-observer.js › watchPanelVisibility](#fn-panel-observer-js-watchpanelvisibility)

<a id="fn-panel-dom-js-formatnumber"></a>
**`formatNumber(num)`** · function, exported · L26–31

A count as YouTube writes it: 950, 1.2k, 3.4m.

- **Called by:** [features/return-dislike/injection.js › dislikeText](#fn-injection-js-disliketext)

<a id="fn-panel-dom-js-triggerenter"></a>
**`triggerEnter(element)`** · function, exported · L34–36

A synthetic Enter on the element; sendKey() flags it, so handleNavigation ignores it.

- **Calls:** [core/remote.js › sendKey](core.md#fn-remote-js-sendkey)
- **Called by:** [features/return-dislike/navigation.js › pressEnter](#fn-navigation-js-pressenter)

<a id="mod-panel-observer-js"></a>

## features/return-dislike/panel-observer.js

> Finding the description panel and watching it: one look, a bounded poll as the safety net, a MutationObserver for its content and an IntersectionObserver for when it is actually on screen. `ryd` is the instance.

187 lines · imports [features/return-dislike/constants.js](#mod-constants-js), [core/disposables.js](core.md#mod-disposables-js), [core/dom.js](core.md#mod-dom-js), [features/return-dislike/injection.js](#mod-injection-js), [features/return-dislike/navigation.js](#mod-navigation-js), [features/return-dislike/panel-dom.js](#mod-panel-dom-js) · imported by [features/return-dislike/focus-tracking.js](#mod-focus-tracking-js), [features/return-dislike/index.js](#mod-index-js)

<a id="fn-panel-observer-js-resetmenucache"></a>
**`resetMenuCache(ryd)`** · function · L15–20

Forgets the menu items of the current panel; they are re-read on the next focus. The highlighted item is kept: it is still the one to clear.

- **Called by:** [handlePanelMutation](#fn-panel-observer-js-handlepanelmutation), [releasePanel](#fn-panel-observer-js-releasepanel)

<a id="fn-panel-observer-js-releasepanel"></a>
**`releasePanel(ryd)`** · function, exported · L27–43

Lets go of the tracked panel: the highlight, its observers, the factoid, the class on YouTube's factoid row and every field that points into it. Binding another panel, a panel gone stale and destroy() all come here.

- **Calls:** [features/return-dislike/navigation.js › clearAllHighlights](#fn-navigation-js-clearallhighlights), [disconnectPanelObservers](#fn-panel-observer-js-disconnectpanelobservers), [resetMenuCache](#fn-panel-observer-js-resetmenucache)
- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin), [features/return-dislike/index.js › ReturnYouTubeDislike.destroy](#fn-index-js-returnyoutubedislike-destroy), [pollForPanel.round](#fn-panel-observer-js-pollforpanel-round), [setupPanel](#fn-panel-observer-js-setuppanel)

<a id="fn-panel-observer-js-stoppanelpoll"></a>
**`stopPanelPoll(ryd)`** · function, exported · L46–51

Stops the bounded poll for the description panel, if one runs.

- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.destroy](#fn-index-js-returnyoutubedislike-destroy), [pollForPanel](#fn-panel-observer-js-pollforpanel)

<a id="fn-panel-observer-js-findpanelnow"></a>
**`findPanelNow(ryd)`** · function, exported · L54–60

Binds the panel if it is in the DOM now; true when it was.

- **Calls:** [setupPanel](#fn-panel-observer-js-setuppanel)
- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.init](#fn-index-js-returnyoutubedislike-init), [pollForPanel](#fn-panel-observer-js-pollforpanel)
- **Browser:** `querySelector`

<a id="fn-panel-observer-js-pollforpanel"></a>
**`pollForPanel(ryd)`** · function, exported · L67–88

A bounded poll, and only a safety net: the panel is also detected by handleFocusIn (focus is the only reliable signal for the role="dialog" description panel). Armed by ui/shortcuts/panels.js after the description shortcut fires and by focus-tracking.js when the tracked panel went stale, for PANEL_POLL_MAX rounds, then idle until something re-arms it.

- **Calls:** [core/dom.js › pollUntil](core.md#fn-dom-js-polluntil), [findPanelNow](#fn-panel-observer-js-findpanelnow), [pollForPanel.round](#fn-panel-observer-js-pollforpanel-round), [stopPanelPoll](#fn-panel-observer-js-stoppanelpoll)
- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin)

<a id="fn-panel-observer-js-pollforpanel-round"></a>
**`pollForPanel.round()`** · arrow · L74–85

One round; true when there is nothing left to look for.

- **Calls:** [releasePanel](#fn-panel-observer-js-releasepanel), [setupPanel](#fn-panel-observer-js-setuppanel)
- **Called by:** [pollForPanel](#fn-panel-observer-js-pollforpanel)
- **Browser:** `querySelector`

<a id="fn-panel-observer-js-setuppanel"></a>
**`setupPanel(ryd, panel)`** · function, exported · L94–110

Starts working with a description panel: watches its content and visibility, and injects the factoid once it is visible.

- **Calls:** [core/disposables.js › createDisposables](core.md#fn-disposables-js-createdisposables), [features/return-dislike/injection.js › checkAndInjectDislike](#fn-injection-js-checkandinjectdislike), [releasePanel](#fn-panel-observer-js-releasepanel), [watchPanelContent](#fn-panel-observer-js-watchpanelcontent), [watchPanelVisibility](#fn-panel-observer-js-watchpanelvisibility)
- **Called by:** [features/return-dislike/focus-tracking.js › handleFocusIn](#fn-focus-tracking-js-handlefocusin), [findPanelNow](#fn-panel-observer-js-findpanelnow), [pollForPanel.round](#fn-panel-observer-js-pollforpanel-round)

<a id="fn-panel-observer-js-watchpanelcontent"></a>
**`watchPanelContent(ryd, panelElement)`** · function · L113–122

The panel's content, for rows being re-rendered under the factoid.

- **Calls:** [handlePanelMutation](#fn-panel-observer-js-handlepanelmutation)
- **Called by:** [setupPanel](#fn-panel-observer-js-setuppanel)
- **Browser:** `MutationObserver`

<a id="fn-panel-observer-js-watchpanelvisibility"></a>
**`watchPanelVisibility(ryd, panelElement)`** · function · L125–146

The panel coming on screen: inject then, and pick up a focus already inside.

- **Calls:** [features/return-dislike/injection.js › checkAndInjectDislike](#fn-injection-js-checkandinjectdislike), [features/return-dislike/navigation.js › updateVisualState](#fn-navigation-js-updatevisualstate), [features/return-dislike/panel-dom.js › closestMenuItem](#fn-panel-dom-js-closestmenuitem)
- **Called by:** [setupPanel](#fn-panel-observer-js-setuppanel)
- **Browser:** `IntersectionObserver`

<a id="fn-panel-observer-js-disconnectpanelobservers"></a>
**`disconnectPanelObservers(ryd)`** · function · L149–153

The panel's observers, disconnected when the panel is let go of.

- **Called by:** [releasePanel](#fn-panel-observer-js-releasepanel)

<a id="fn-panel-observer-js-ownmutations"></a>
**`ownMutations(ryd, mutations)`** · function · L160–171

Whether every record is one of the instance's own writes: the factoid going in, or its text being replaced. Those would otherwise schedule an injection pass that finds the factoid in place and does nothing.

- **Called by:** [handlePanelMutation](#fn-panel-observer-js-handlepanelmutation)

<a id="fn-panel-observer-js-handlepanelmutation"></a>
**`handlePanelMutation(ryd, mutations)`** · function · L177–187

The panel's content changed (not by this code): drops the menu cache and re-checks the factoid, debounced.

- **Calls:** [features/return-dislike/injection.js › checkAndInjectDislike](#fn-injection-js-checkandinjectdislike), [ownMutations](#fn-panel-observer-js-ownmutations), [resetMenuCache](#fn-panel-observer-js-resetmenucache)
- **Called by:** [watchPanelContent](#fn-panel-observer-js-watchpanelcontent)
