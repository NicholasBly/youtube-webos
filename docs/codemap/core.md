# Code map: core/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [core/bounded-search.js](#mod-bounded-search-js), [core/config-options.js](#mod-config-options-js), [core/config.js](#mod-config-js), [core/disposables.js](#mod-disposables-js), [core/dom.js](#mod-dom-js), [core/fetch-timeout.js](#mod-fetch-timeout-js), [core/guest-mode.js](#mod-guest-mode-js), [core/innertube.js](#mod-innertube-js), [core/launch.js](#mod-launch-js), [core/log.js](#mod-log-js), [core/page-state.js](#mod-page-state-js), [core/per-video.js](#mod-per-video-js), [core/player-state.js](#mod-player-state-js), [core/remote.js](#mod-remote-js), [core/selectors.js](#mod-selectors-js), [core/speed-cap.js](#mod-speed-cap-js), [core/styles.js](#mod-styles-js), [core/text.js](#mod-text-js), [core/version.js](#mod-version-js), [core/webos.js](#mod-webos-js), [core/yt-storage.js](#mod-yt-storage-js)

<a id="mod-bounded-search-js"></a>

## core/bounded-search.js

> One bounded breadth-first walk, for the lookups that fall back on searching a parsed response or a request body when a known path misses (features/adblock/search.js, features/adblock/stringify-hook.ts).

27 lines · imported by [features/adblock/search.js](features-adblock.md#mod-search-js), [features/adblock/stringify-hook.ts](features-adblock.md#mod-stringify-hook-ts)

<a id="fn-bounded-search-js-boundedsearch"></a>
**`boundedSearch(root, maxDepth, maxNodes, visit)`** · function, exported · L11–27

Visits every object under `root` (itself included) breadth first, down to `maxDepth` levels below it and at most `maxNodes` of them, until `visit(node)` returns true. A flat [node, depth, ...] queue keeps the garbage down, and a child past the depth bound is never queued.

- **Called by:** [features/adblock/search.js › findObjects](features-adblock.md#fn-search-js-findobjects), [features/adblock/stringify-hook.ts › findCtx](features-adblock.md#fn-stringify-hook-ts-findctx)

<a id="mod-config-options-js"></a>

## core/config-options.js

> Every setting the app knows about, with its default and the label the options panel shows, plus the value tables the cycle controls choose from. An option's `upgrade(stored)` turns a value an older build stored into this build's (core/config.js applies it when the settings load).

283 lines · imports [core/text.js](#mod-text-js) · imported by [core/config.js](#mod-config-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js)

**At load:**

- **Calls:** [core/text.js › capitalize](#fn-text-js-capitalize)

<a id="mod-config-js"></a>

## core/config.js

> Persisted settings: one localStorage entry, read into memory once, written back debounced, with change listeners per key. The option tables themselves live in config-options.js and are re-exported here so callers import one module.

168 lines · imports [core/config-options.js](#mod-config-options-js), [core/log.js](#mod-log-js) · imported by [core/per-video.js](#mod-per-video-js), [features/adblock/flags.js](features-adblock.md#mod-flags-js), [features/auto-login/index.js](features-auto-login.md#mod-index-js), [features/auto-login/previews.js](features-auto-login.md#mod-previews-js), [features/auto-login/whos-watching.js](features-auto-login.md#mod-whos-watching-js), [features/dearrow/index.js](features-dearrow.md#mod-index-js), [features/dearrow/lookup.js](features-dearrow.md#mod-lookup-js), [features/dearrow/sweep.js](features-dearrow.md#mod-sweep-js), [features/dearrow/thumbs.js](features-dearrow.md#mod-thumbs-js), [features/dearrow/tiles.js](features-dearrow.md#mod-tiles-js), [features/dearrow/titles.js](features-dearrow.md#mod-titles-js), [features/emoji-font/index.js](features-emoji-font.md#mod-index-js), [features/emoji-font/observer.js](features-emoji-font.md#mod-observer-js), [features/force-codec/index.js](features-force-codec.md#mod-index-js), [features/logo-style.js](features.md#mod-logo-style-js), [features/playback-speed/controller.js](features-playback-speed.md#mod-controller-js), [features/playback-speed/index.js](features-playback-speed.md#mod-index-js), [features/return-dislike/bootstrap.js](features-return-dislike.md#mod-bootstrap-js), [features/sponsorblock/blue-key.js](features-sponsorblock.md#mod-blue-key-js), [features/sponsorblock/bootstrap.js](features-sponsorblock.md#mod-bootstrap-js), [features/sponsorblock/constants.js](features-sponsorblock.md#mod-constants-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/sponsorblock/labels.js](features-sponsorblock.md#mod-labels-js), [features/sponsorblock/overlay.js](features-sponsorblock.md#mod-overlay-js), [features/sponsorblock/segments.js](features-sponsorblock.md#mod-segments-js), [features/sponsorblock/skipping.js](features-sponsorblock.md#mod-skipping-js), [features/thumbnail-quality/index.js](features-thumbnail-quality.md#mod-index-js), [features/thumbnail-quality/state.js](features-thumbnail-quality.md#mod-state-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/watch/index.js](features-watch.md#mod-index-js), [ui/panel/controls/checkbox.js](ui-panel.md#mod-controls-checkbox-js), [ui/panel/controls/color-picker.js](ui-panel.md#mod-controls-color-picker-js), [ui/panel/controls/cycle-row.js](ui-panel.md#mod-controls-cycle-row-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js), [ui/styles/html-classes.js](ui-styles.md#mod-html-classes-js), [ui/toast/index.js](ui-toast.md#mod-index-js)

**At load:**

- **Calls:** [core/log.js › createLogger](#fn-log-js-createlogger), [buildConfig](#fn-config-js-buildconfig), [loadStoredConfig](#fn-config-js-loadstoredconfig), [flushPendingWrite](#fn-config-js-flushpendingwrite)
- **Events:** listens to `beforeunload`, `pagehide`

<a id="fn-config-js-loadstoredconfig"></a>
**`loadStoredConfig()`** · function · L28–36

The stored settings as an object, or null when there are none or they do not parse.

- **Called by:** [at load](#mod-config-js)
- **Browser:** `localStorage`

<a id="fn-config-js-buildconfig"></a>
**`buildConfig(stored)`** · function · L44–60

Every option of this build: the stored value where there is one (through the option's `upgrade` when it has one: a value an older build stored), else the default. A key the store holds that this build does not have (a setting from an older one) is left out, so the next write drops it from storage.

- **Called by:** [at load](#mod-config-js)

<a id="fn-config-js-writenow"></a>
**`writeNow()`** · function · L72–79

Writes the whole config to localStorage now; a full or refused storage keeps it in memory only.

- **Called by:** [flushPendingWrite](#fn-config-js-flushpendingwrite), [scheduleWrite](#fn-config-js-schedulewrite)
- **Browser:** `localStorage`

<a id="fn-config-js-flushpendingwrite"></a>
**`flushPendingWrite()`** · arrow · L84–89

Writes a pending debounced change at once (on beforeunload and pagehide), so leaving the app does not lose it.

- **Calls:** [writeNow](#fn-config-js-writenow)
- **Called by:** [at load](#mod-config-js)

<a id="fn-config-js-schedulewrite"></a>
**`scheduleWrite()`** · arrow · L91–93

Starts the 200 ms debounced write unless one is already pending.

- **Calls:** [writeNow](#fn-config-js-writenow)
- **Called by:** [configWrite](#fn-config-js-configwrite)
- **Browser:** `setTimeout`

<a id="fn-config-js-configexists"></a>
**`configExists(key)`** · function · L98–100

Whether this build has a setting called `key`.

- **Called by:** [assertKey](#fn-config-js-assertkey)

<a id="fn-config-js-assertkey"></a>
**`assertKey(key, verb)`** · function · L103–105

Throws for a key no option defines: a typo, or a key a build removed.

- **Calls:** [configExists](#fn-config-js-configexists)
- **Called by:** [configAddChangeListener](#fn-config-js-configaddchangelistener), [configGetDefault](#fn-config-js-configgetdefault), [configGetDesc](#fn-config-js-configgetdesc), [configRead](#fn-config-js-configread), [configWrite](#fn-config-js-configwrite)

<a id="fn-config-js-configgetdesc"></a>
**`configGetDesc(key)`** · function, exported · L108–111

The label the options panel shows for `key`.

- **Calls:** [assertKey](#fn-config-js-assertkey)
- **Called by:** [ui/panel/controls/checkbox.js › createConfigCheckbox](ui-panel.md#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/cycle-row.js › createAlignedCycleControl](ui-panel.md#fn-controls-cycle-row-js-createalignedcyclecontrol), [ui/panel/controls/cycle-row.js › createOpacityControl](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol), [ui/panel/controls/cycle-row.js › createPreviewControl](ui-panel.md#fn-controls-cycle-row-js-createpreviewcontrol), [ui/panel/controls/cycle-row.js › createSegmentControl](ui-panel.md#fn-controls-cycle-row-js-createsegmentcontrol), [ui/panel/controls/cycle-row.js › createShortcutControl](ui-panel.md#fn-controls-cycle-row-js-createshortcutcontrol)

<a id="fn-config-js-configread"></a>
**`configRead(key)`** · function, exported · L114–117

The current value of setting `key` (from memory: no storage read). Throws for an unknown key.

- **Calls:** [assertKey](#fn-config-js-assertkey)
- **Called by:** [features/auto-login/index.js › initAutoLogin](features-auto-login.md#fn-index-js-initautologin), [features/auto-login/previews.js › initPreviews](features-auto-login.md#fn-previews-js-initpreviews), [features/auto-login/whos-watching.js › attemptActiveBypass](features-auto-login.md#fn-whos-watching-js-attemptactivebypass), [features/dearrow/index.js › onSettingsChange](features-dearrow.md#fn-index-js-onsettingschange), [features/dearrow/index.js › scheduleSweep](features-dearrow.md#fn-index-js-schedulesweep), [features/dearrow/lookup.js › pump](features-dearrow.md#fn-lookup-js-pump), [features/dearrow/lookup.js › resolve](features-dearrow.md#fn-lookup-js-resolve), [features/dearrow/lookup.js › resolveThumb](features-dearrow.md#fn-lookup-js-resolvethumb), [features/dearrow/sweep.js › sweepTiles](features-dearrow.md#fn-sweep-js-sweeptiles), [features/dearrow/thumbs.js › copyWidth](features-dearrow.md#fn-thumbs-js-copywidth), [features/dearrow/tiles.js › applyToTile](features-dearrow.md#fn-tiles-js-applytotile), [features/dearrow/titles.js › crowdsourcedTitle](features-dearrow.md#fn-titles-js-crowdsourcedtitle), [features/dearrow/titles.js › formatTitle](features-dearrow.md#fn-titles-js-formattitle), [features/emoji-font/observer.js › manageObserverState](features-emoji-font.md#fn-observer-js-manageobserverstate), [features/force-codec/index.js › applyMode](features-force-codec.md#fn-index-js-applymode), [features/logo-style.js › applyLogoStyle](features.md#fn-logo-style-js-applylogostyle), [features/playback-speed/controller.js › createSpeedController.applyReload](features-playback-speed.md#fn-controller-js-createspeedcontroller-applyreload), [features/playback-speed/index.js › isOn](features-playback-speed.md#fn-index-js-ison), [features/return-dislike/bootstrap.js › bootstrapReturnDislike](features-return-dislike.md#fn-bootstrap-js-bootstrapreturndislike), [features/sponsorblock/bootstrap.js › bootstrapSponsorBlock](features-sponsorblock.md#fn-bootstrap-js-bootstrapsponsorblock), [features/sponsorblock/labels.js › buildCss](features-sponsorblock.md#fn-labels-js-buildcss), [features/sponsorblock/labels.js › pickFullLabel](features-sponsorblock.md#fn-labels-js-pickfulllabel), [features/sponsorblock/labels.js › skippableSeconds](features-sponsorblock.md#fn-labels-js-skippableseconds), [features/thumbnail-quality/state.js (at load)](features-thumbnail-quality.md#mod-state-js), [features/video-quality/index.js › initVideoQuality](features-video-quality.md#fn-index-js-initvideoquality), [features/watch/index.js (at load)](features-watch.md#mod-index-js), [ui/panel/controls/checkbox.js › createConfigCheckbox](ui-panel.md#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/color-picker.js › createColorPicker](ui-panel.md#fn-controls-color-picker-js-createcolorpicker), [ui/panel/controls/cycle-row.js › createCycleControl.cycle](ui-panel.md#fn-controls-cycle-row-js-createcyclecontrol-cycle), [ui/panel/controls/cycle-row.js › createCycleControl.displayValue](ui-panel.md#fn-controls-cycle-row-js-createcyclecontrol-displayvalue), [ui/panel/controls/cycle-row.js › createOpacityControl](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol), [ui/panel/controls/cycle-row.js › createOpacityControl.changeValue](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol-changevalue), [ui/panel/controls/cycle-row.js › createOpacityControl.sync](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol-sync), [ui/panel/controls/cycle-row.js › createThumbnailQualityControl.sync](ui-panel.md#fn-controls-cycle-row-js-createthumbnailqualitycontrol-sync), [ui/panel/pages.js › buildDeArrowPage.sync](ui-panel.md#fn-pages-js-builddearrowpage-sync), [ui/panel/pages.js › buildMainPage.updateDependencyState](ui-panel.md#fn-pages-js-buildmainpage-updatedependencystate), [ui/panel/panel.js › createHeading.toggleTheme](ui-panel.md#fn-panel-js-createheading-toggletheme), [ui/shortcuts/bindings.js › updateShortcutCache](ui-shortcuts.md#fn-bindings-js-updateshortcutcache), [ui/styles/html-classes.js › read](ui-styles.md#fn-html-classes-js-read), [ui/styles/html-classes.js › syncOledShelfOpacity](ui-styles.md#fn-html-classes-js-syncoledshelfopacity), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="fn-config-js-configwrite"></a>
**`configWrite(key, value)`** · function, exported · L122–142

The per-write log is debug level: configWrite fires per event during colour-picker drags and opacity scrubs (the localStorage write itself is debounced).

- **Calls:** [assertKey](#fn-config-js-assertkey), [scheduleWrite](#fn-config-js-schedulewrite)
- **Called by:** [ui/panel/controls/checkbox.js › createConfigCheckbox](ui-panel.md#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/color-picker.js › createColorPicker](ui-panel.md#fn-controls-color-picker-js-createcolorpicker), [ui/panel/controls/cycle-row.js › createCycleControl.cycle](ui-panel.md#fn-controls-cycle-row-js-createcyclecontrol-cycle), [ui/panel/controls/cycle-row.js › createOpacityControl.changeValue](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol-changevalue), [ui/panel/panel.js › createHeading.toggleTheme](ui-panel.md#fn-panel-js-createheading-toggletheme), [ui/shortcuts/bindings.js › ensureMenuKey](ui-shortcuts.md#fn-bindings-js-ensuremenukey), [ui/shortcuts/bindings.js › updateShortcutCache](ui-shortcuts.md#fn-bindings-js-updateshortcutcache)

<a id="fn-config-js-configaddchangelistener"></a>
**`configAddChangeListener(key, callback)`** · function, exported · L148–152

Calls `callback({ detail: { key, newValue, oldValue } })` whenever `key` changes through configWrite.

- **Calls:** [assertKey](#fn-config-js-assertkey)
- **Called by:** [core/per-video.js › bootstrapPerVideo](#fn-per-video-js-bootstrappervideo), [features/adblock/flags.js (at load)](features-adblock.md#mod-flags-js), [features/auto-login/index.js (at load)](features-auto-login.md#mod-index-js), [features/dearrow/index.js (at load)](features-dearrow.md#mod-index-js), [features/emoji-font/index.js (at load)](features-emoji-font.md#mod-index-js), [features/force-codec/index.js › installCodecHooks](features-force-codec.md#fn-index-js-installcodechooks), [features/logo-style.js › initLogoStyle](features.md#fn-logo-style-js-initlogostyle), [features/playback-speed/index.js (at load)](features-playback-speed.md#mod-index-js), [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.listen](features-sponsorblock.md#fn-index-js-sponsorblockhandler-setupconfiglisteners-listen), [features/thumbnail-quality/index.js (at load)](features-thumbnail-quality.md#mod-index-js), [features/video-quality/index.js (at load)](features-video-quality.md#mod-index-js), [features/watch/index.js (at load)](features-watch.md#mod-index-js), [ui/panel/controls/checkbox.js › createConfigCheckbox](ui-panel.md#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/color-picker.js › createColorPicker](ui-panel.md#fn-controls-color-picker-js-createcolorpicker), [ui/panel/controls/cycle-row.js › createCycleControl](ui-panel.md#fn-controls-cycle-row-js-createcyclecontrol), [ui/panel/controls/cycle-row.js › createOpacityControl](ui-panel.md#fn-controls-cycle-row-js-createopacitycontrol), [ui/panel/controls/cycle-row.js › createThumbnailQualityControl](ui-panel.md#fn-controls-cycle-row-js-createthumbnailqualitycontrol), [ui/panel/pages.js › buildDeArrowPage](ui-panel.md#fn-pages-js-builddearrowpage), [ui/panel/pages.js › buildMainPage](ui-panel.md#fn-pages-js-buildmainpage), [ui/shortcuts/bindings.js (at load)](ui-shortcuts.md#mod-bindings-js), [ui/styles/html-classes.js › initHtmlClasses](ui-styles.md#fn-html-classes-js-inithtmlclasses)

<a id="fn-config-js-configremovechangelistener"></a>
**`configRemoveChangeListener(key, callback)`** · function, exported · L155–157

Stops calling `callback` for changes of `key`.

- **Called by:** [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.listen](features-sponsorblock.md#fn-index-js-sponsorblockhandler-setupconfiglisteners-listen)

<a id="fn-config-js-configgetdefault"></a>
**`configGetDefault(key)`** · function, exported · L160–163

The default value of setting `key`, as config-options.js declares it.

- **Calls:** [assertKey](#fn-config-js-assertkey)
- **Called by:** [ui/panel/controls/color-picker.js › createColorPicker](ui-panel.md#fn-controls-color-picker-js-createcolorpicker)

<a id="fn-config-js-configgetall"></a>
**`configGetAll()`** · function, exported · L166–168

Export the live object reference directly for zero-overhead caching

- **Called by:** [features/adblock/flags.js (at load)](features-adblock.md#mod-flags-js), [features/sponsorblock/blue-key.js › jumpToHighlight](features-sponsorblock.md#fn-blue-key-js-jumptohighlight), [features/sponsorblock/constants.js › categoryColor](features-sponsorblock.md#fn-constants-js-categorycolor), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](features-sponsorblock.md#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/index.js › SponsorBlockHandler.setupConfigListeners.rebuild](features-sponsorblock.md#fn-index-js-sponsorblockhandler-setupconfiglisteners-rebuild), [features/sponsorblock/overlay.js › drawOverlay](features-sponsorblock.md#fn-overlay-js-drawoverlay), [features/sponsorblock/segments.js › rebuildSkipSegments](features-sponsorblock.md#fn-segments-js-rebuildskipsegments), [features/sponsorblock/skipping.js › shouldSkip](features-sponsorblock.md#fn-skipping-js-shouldskip)

<a id="mod-disposables-js"></a>

## core/disposables.js

> What an instance registers and must undo on destroy, in one bag: listeners, observers, timers and any other undo. dispose() runs them in reverse order of registration.

31 lines · imported by [features/return-dislike/index.js](features-return-dislike.md#mod-index-js), [features/return-dislike/panel-observer.js](features-return-dislike.md#mod-panel-observer-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/watch/index.js](features-watch.md#mod-index-js)

<a id="fn-disposables-js-createdisposables"></a>
**`createDisposables()`** · function, exported · L4–31

What an instance registers and must undo on destroy, in one bag: listeners, observers, timers and any other undo. dispose() runs them in reverse order of registration.

- **Called by:** [features/return-dislike/index.js › ReturnYouTubeDislike.constructor](features-return-dislike.md#fn-index-js-returnyoutubedislike-constructor), [features/return-dislike/panel-observer.js › setupPanel](features-return-dislike.md#fn-panel-observer-js-setuppanel), [features/sponsorblock/index.js › SponsorBlockHandler.bindVideo](features-sponsorblock.md#fn-index-js-sponsorblockhandler-bindvideo), [features/sponsorblock/index.js › SponsorBlockHandler.constructor](features-sponsorblock.md#fn-index-js-sponsorblockhandler-constructor), [features/video-quality/index.js › initVideoQuality](features-video-quality.md#fn-index-js-initvideoquality), [features/watch/index.js › Watch.constructor](features-watch.md#fn-index-js-watch-constructor)

<a id="fn-disposables-js-createdisposables-listen"></a>
**`createDisposables.listen(target, type, handler, capture)`** · property · L8–11

Adds an event listener, and its removal to the undo list.

<a id="fn-disposables-js-createdisposables-observe"></a>
**`createDisposables.observe(observer, target, options)`** · property · L13–16

Starts `observer` on `target`, and its disconnect to the undo list.

<a id="fn-disposables-js-createdisposables-timeout"></a>
**`createDisposables.timeout(fn, ms)`** · property · L18–21

Starts a timer, and its clearTimeout to the undo list.

- **Browser:** `setTimeout`

<a id="fn-disposables-js-createdisposables-add"></a>
**`createDisposables.add(fn)`** · property · L23–25

Any other undo, such as removing a config listener.

<a id="fn-disposables-js-createdisposables-dispose"></a>
**`createDisposables.dispose()`** · property · L27–29

Undoes everything added, newest first.

<a id="mod-dom-js"></a>

## core/dom.js

> DOM helpers shared by the features: the cached &lt;video> lookup, waiting for a node to appear, and a plain debounce.

137 lines · imported by [features/logo-style.js](features.md#mod-logo-style-js), [features/return-dislike/panel-observer.js](features-return-dislike.md#mod-panel-observer-js), [features/screensaver-fix/index.js](features-screensaver-fix.md#mod-index-js), [features/sponsorblock/bar.js](features-sponsorblock.md#mod-bar-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/watch/index.js](features-watch.md#mod-index-js), [ui/shortcuts/router.js](ui-shortcuts.md#mod-router-js), [ui/shortcuts/seek.js](ui-shortcuts.md#mod-seek-js), [ui/styles/html-classes.js](ui-styles.md#mod-html-classes-js)

**At load:**

- **Events:** listens to `ytaf-page-update`

<a id="fn-dom-js-getvideo"></a>
**`getVideo()`** · function, exported · L8–12

The page's &lt;video> element, cached while it stays in the document.

- **Called by:** [features/screensaver-fix/index.js › findWatchVideo](features-screensaver-fix.md#fn-index-js-findwatchvideo), [features/sponsorblock/index.js › SponsorBlockHandler.bindOrWaitForVideo](features-sponsorblock.md#fn-index-js-sponsorblockhandler-bindorwaitforvideo), [features/sponsorblock/index.js › SponsorBlockHandler.updateLabels](features-sponsorblock.md#fn-index-js-sponsorblockhandler-updatelabels), [ui/shortcuts/router.js › onKeyDown](ui-shortcuts.md#fn-router-js-onkeydown), [ui/shortcuts/seek.js › doSkipChapter](ui-shortcuts.md#fn-seek-js-doskipchapter)
- **Browser:** `querySelector`

<a id="fn-dom-js-polluntil"></a>
**`pollUntil(fn, intervalMs, { maxAttempts = Infinity, onGiveUp })`** · function, exported · L26–61

Calls `fn` every `intervalMs` until it returns true, for at most `maxAttempts` calls (a count, not a time: the TV may set its clock meanwhile); `onGiveUp` runs when the limit is reached first. The first call is the caller's, before the poll. Returns a handle: cancel() stops it, from inside `fn` too, and `active` is true until it found, gave up or was cancelled.

- **Calls:** [pollUntil.tick](#fn-dom-js-polluntil-tick)
- **Called by:** [features/logo-style.js › initLogoStyle](features.md#fn-logo-style-js-initlogostyle), [features/return-dislike/panel-observer.js › pollForPanel](features-return-dislike.md#fn-panel-observer-js-pollforpanel), [features/sponsorblock/bar.js › scheduleBarRetry](features-sponsorblock.md#fn-bar-js-schedulebarretry), [features/video-quality/index.js › pollForPlayer](features-video-quality.md#fn-index-js-pollforplayer)
- **Browser:** `setTimeout`

<a id="fn-dom-js-polluntil-handle-cancel"></a>
**`pollUntil.handle.cancel()`** · property · L32–38

Stops the polling; `fn` is not called again and `onGiveUp` never runs.

<a id="fn-dom-js-polluntil-tick"></a>
**`pollUntil.tick()`** · arrow · L44–58

One attempt: calls `fn`, stops on a truthy result or after `maxAttempts` (then `onGiveUp`), else schedules the next attempt.

- **Called by:** [pollUntil](#fn-dom-js-polluntil)
- **Browser:** `setTimeout`

<a id="fn-dom-js-debounce"></a>
**`debounce(func, wait)`** · function, exported · L67–78

Wraps `func` so a burst of calls runs it once, `wait` ms after the last call, with that call's arguments and `this`. The wrapper has cancel().

- **Called by:** [features/watch/index.js › Watch.constructor](features-watch.md#fn-index-js-watch-constructor), [ui/styles/html-classes.js › initHtmlClasses](ui-styles.md#fn-html-classes-js-inithtmlclasses)

<a id="fn-dom-js-debounce-debounced"></a>
**`debounce.debounced(args)`** · arrow · L70–74

Restarts the wait; the call that ends the burst is the one that runs.

- **Browser:** `setTimeout`

<a id="fn-dom-js-debounce-debounced-cancel"></a>
**`debounce.debounced.cancel()`** · assigned · L76–76

Drops the pending call, if any.

<a id="fn-dom-js-waitforchildadd"></a>
**`waitForChildAdd(parent, predicate, timeoutMs)`** · function, exported · L88–137

Waits for the first element added under `parent` (subtree) that passes `predicate`. Only the root of each added subtree is tested: a predicate that wants a node inside one looks for it itself. Returns `{ promise, cancel }`: the promise resolves with the element and rejects after `timeoutMs` or on cancel() (Chromium 38 has no AbortController, so the waiter carries its own cancel).

- **Calls:** [waitForChildAdd.cleanup](#fn-dom-js-waitforchildadd-cleanup)
- **Called by:** [features/screensaver-fix/index.js › findWatchVideo](features-screensaver-fix.md#fn-index-js-findwatchvideo), [features/sponsorblock/index.js › SponsorBlockHandler.bindOrWaitForVideo](features-sponsorblock.md#fn-index-js-sponsorblockhandler-bindorwaitforvideo)
- **Browser:** `MutationObserver`, `setTimeout`

<a id="fn-dom-js-waitforchildadd-cleanup"></a>
**`waitForChildAdd.cleanup()`** · arrow · L110–114

Disconnects the observer and clears the timeout: the promise is settled or abandoned.

- **Called by:** [waitForChildAdd](#fn-dom-js-waitforchildadd)

<a id="fn-dom-js-waitforchildadd-cancel"></a>
**`waitForChildAdd.cancel()`** · property · L133–135

Rejects the promise with 'cancelled' and stops watching, if it is still waiting.

<a id="mod-fetch-timeout-js"></a>

## core/fetch-timeout.js

> fetch() of a JSON answer with a deadline that covers the body as well as the headers: the request is dropped when it passes (through an AbortController where the engine has one), and the timer is cleared on any outcome, so a request that won the race leaves nothing to fire later.

58 lines · imports [core/webos.js](#mod-webos-js) · imported by [features/dearrow/lookup.js](features-dearrow.md#mod-lookup-js), [features/return-dislike/api.js](features-return-dislike.md#mod-api-js), [features/sponsorblock/api.js](features-sponsorblock.md#mod-api-js)

<a id="fn-fetch-timeout-js-fetchjsonwithtimeout"></a>
**`fetchJsonWithTimeout(url, timeoutMs, readStatuses)`** · function, exported · L16–58

Starts the request; `promise` resolves with `{ ok, status, data }` (the parsed body of a 2xx answer, or of an answer whose status is in `readStatuses`; null otherwise, its body unread) or rejects like fetch(), with Error('timeout') once the deadline passes, headers or body, and `abort()` drops it early (an AbortError then). Without an AbortController (webOS 3 and 4) the request itself runs on, but its answer is never handed out after a timeout or an abort.

- **Called by:** [features/dearrow/lookup.js › fetchBranding](features-dearrow.md#fn-lookup-js-fetchbranding), [features/return-dislike/api.js › fetchDislikeCount](features-return-dislike.md#fn-api-js-fetchdislikecount), [features/sponsorblock/api.js › fetchSegments.tryFetch](features-sponsorblock.md#fn-api-js-fetchsegments-tryfetch)
- **Browser:** `setTimeout`, `fetch`

<a id="fn-fetch-timeout-js-fetchjsonwithtimeout-abort"></a>
**`fetchJsonWithTimeout.abort()`** · property · L51–56

Settles the request as an AbortError and aborts the network request where AbortController exists.

<a id="mod-guest-mode-js"></a>

## core/guest-mode.js

> Whether the app is signed in as a guest, read from the leanback app's own localStorage entries and cached until something invalidates it. Read here rather than through core/yt-storage.js readRecord, which cannot tell a missing entry from a corrupt one: a corrupt identity entry must not fall through to the autoplay entry.

43 lines · imported by [features/auto-login/whos-watching.js](features-auto-login.md#mod-whos-watching-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js)

<a id="fn-guest-mode-js-invalidateguestmodecache"></a>
**`invalidateGuestModeCache()`** · function, exported · L10–12

Forgets the cached answer of isGuestMode(), for after the account changes.

- **Called by:** [features/auto-login/whos-watching.js › resetActiveBypass](features-auto-login.md#fn-whos-watching-js-resetactivebypass)

<a id="fn-guest-mode-js-isguestmode"></a>
**`isGuestMode()`** · function, exported · L18–43

Whether YouTube is signed in as a guest, from the identity YouTube stores in localStorage (cached until invalidated).

- **Called by:** [features/auto-login/whos-watching.js › attemptActiveBypass](features-auto-login.md#fn-whos-watching-js-attemptactivebypass), [ui/panel/pages.js › buildMainPage](ui-panel.md#fn-pages-js-buildmainpage)
- **Browser:** `localStorage`

<a id="mod-innertube-js"></a>

## core/innertube.js

> The InnerTube response shapes the TV app uses: how to tell the kinds of response apart, where each keeps its content, and the item lists a section can hold. Shared by the adblock filters and the thumbnail rewrite, which must agree on where a response keeps its content.

145 lines · imported by [features/adblock/item-filters.js](features-adblock.md#mod-item-filters-js), [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/adblock/response-filters.js](features-adblock.md#mod-response-filters-js), [features/adblock/search.js](features-adblock.md#mod-search-js), [features/rows-ahead.js](features.md#mod-rows-ahead-js), [features/thumbnail-quality/dispatch.js](features-thumbnail-quality.md#mod-dispatch-js)

<a id="fn-innertube-js-getbypath"></a>
**`getByPath(obj, parts)`** · function, exported · L87–94

The value at `parts` under `obj`, or undefined when any step is missing.

- **Called by:** [detectResponseType](#fn-innertube-js-detectresponsetype), [features/adblock/response-filters.js › filterBrowseTabs](features-adblock.md#fn-response-filters-js-filterbrowsetabs), [features/adblock/response-filters.js › filterContinuation](features-adblock.md#fn-response-filters-js-filtercontinuation), [features/adblock/response-filters.js › filterShortsSequence](features-adblock.md#fn-response-filters-js-filtershortssequence), [features/adblock/response-filters.js › filterWatchResponse](features-adblock.md#fn-response-filters-js-filterwatchresponse), [features/adblock/response-filters.js › removeTimelyActions](features-adblock.md#fn-response-filters-js-removetimelyactions), [features/adblock/search.js › atPathOrSearch](features-adblock.md#fn-search-js-atpathorsearch), [features/rows-ahead.js › raiseRowsAhead](features.md#fn-rows-ahead-js-raiserowsahead), [features/thumbnail-quality/dispatch.js › upgradeByType](features-thumbnail-quality.md#fn-dispatch-js-upgradebytype), [features/thumbnail-quality/dispatch.js › upgradeContinuation](features-thumbnail-quality.md#fn-dispatch-js-upgradecontinuation)

<a id="fn-innertube-js-detectresponsetype"></a>
**`detectResponseType(data)`** · function, exported · L97–108

The kind of response, by the first signature it matches; null for none.

- **Calls:** [getByPath](#fn-innertube-js-getbypath)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)

<a id="fn-innertube-js-foreachitemlist"></a>
**`forEachItemList(section, fn, arg)`** · function, exported · L118–145

The item lists a section can hold, in the shapes the TV app uses: a shelf (a horizontal list, a grid or expanded contents), or a bare grid or horizontal list. Calls `fn(items, arg)` for each list found and returns how many there were; zero for a section that is itself an item (search interleaves tiles among the shelves) or a shelf with no content. `arg` lets a caller on a hot path pass its state to a function declared once.

- **Called by:** [features/adblock/item-filters.js › filterSectionList](features-adblock.md#fn-item-filters-js-filtersectionlist), [features/adblock/item-filters.js › shelfSurvives](features-adblock.md#fn-item-filters-js-shelfsurvives), [features/thumbnail-quality/dispatch.js › upgradeSectionList](features-thumbnail-quality.md#fn-dispatch-js-upgradesectionlist)

<a id="mod-launch-js"></a>

## core/launch.js

> Launch-URL handling, kept apart from the rest of core/.
>
> index.js is the tiny bootstrap page that only redirects to youtube.com/tv, so these two functions live here rather than in core/dom.js or remote.js - importing those would drag their module-level side effects onto a page with no YouTube in it.

120 lines · imports [polyfills/polyfills.js](polyfills.md#mod-polyfills-js), [core/log.js](#mod-log-js) · imported by [index.js](app.md#mod-index-js), [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](#fn-log-js-createlogger)

<a id="fn-launch-js-extractlaunchparams"></a>
**`extractLaunchParams()`** · function, exported · L22–34

The launch parameters webOS passed to the app (window.launchParams), parsed once; {} when there are none.

- **Called by:** [index.js › main](app.md#fn-index-js-main), [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-launch-js-haslaunchtarget"></a>
**`hasLaunchTarget(params)`** · function, exported · L42–45

Whether launch parameters ask for something to open: a deep link, a cast (DIAL), a search or a voice intent, all of which come as `target` or `contentTarget`. A plain relaunch (back from another app, or the app icon pressed again) carries neither.

- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-launch-js-getyturl"></a>
**`getYTURL()`** · function · L50–56

The YouTube TV start URL, with the flags the app always sets (full animation, web speech, voice).

- **Called by:** [handleLaunch](#fn-launch-js-handlelaunch)

<a id="fn-launch-js-concatsearchparams"></a>
**`concatSearchParams(a, b)`** · function · L59–64

Appends every parameter of `b` to `a`, keeping repeated keys, and returns `a`.

- **Called by:** [handleLaunch](#fn-launch-js-handlelaunch)

<a id="fn-launch-js-sameoriginurl"></a>
**`sameOriginURL(candidate, expectedOrigin)`** · function · L67–75

`candidate` as a URL when it parses and has `expectedOrigin`, else null.

- **Called by:** [handleLaunch](#fn-launch-js-handlelaunch)

<a id="fn-launch-js-handlelaunch"></a>
**`handleLaunch(params)`** · function, exported · L81–120

Opens YouTube for a launch or relaunch: a deep link (video, search, voice intent from the remote or the system) becomes the URL the leanback app starts on.

- **Calls:** [concatSearchParams](#fn-launch-js-concatsearchparams), [getYTURL](#fn-launch-js-getyturl), [sameOriginURL](#fn-launch-js-sameoriginurl)
- **Called by:** [index.js › main](app.md#fn-index-js-main), [userScript.js (at load)](app.md#mod-userscript-js)

<a id="mod-log-js"></a>

## core/log.js

> One logger for every module. `debug` and `info` reach the console only while diagnostics are on; `warn` and `error` always do.
>
> Diagnostics are on when localStorage holds `ytaf-debug` = '1' (set it from the TV's web inspector; it survives restarts and needs no rebuild), or while `window.__ytaf_debug__` is true (set from the devtools console; the tests use it too). The stored flag is read once at load: a reload is how it takes effect.

55 lines · imported by [core/config.js](#mod-config-js), [core/launch.js](#mod-launch-js), [core/remote.js](#mod-remote-js), [core/webos.js](#mod-webos-js), [features/adblock/log.js](features-adblock.md#mod-log-js), [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/auto-login/log.js](features-auto-login.md#mod-log-js), [features/block-webos-cast.ts](features.md#mod-block-webos-cast-ts), [features/comments-fix.js](features.md#mod-comments-fix-js), [features/dearrow/log.js](features-dearrow.md#mod-log-js), [features/emoji-font/log.js](features-emoji-font.md#mod-log-js), [features/force-codec/log.js](features-force-codec.md#mod-log-js), [features/lang-settings-fix.ts](features.md#mod-lang-settings-fix-ts), [features/playback-speed/log.js](features-playback-speed.md#mod-log-js), [features/return-dislike/index.js](features-return-dislike.md#mod-index-js), [features/screensaver-fix/log.js](features-screensaver-fix.md#mod-log-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/sponsorblock/labels.js](features-sponsorblock.md#mod-labels-js), [features/thumbnail-quality/log.js](features-thumbnail-quality.md#mod-log-js), [features/video-quality/log.js](features-video-quality.md#mod-log-js), [features/watch/index.js](features-watch.md#mod-index-js), [hooks/buffer-limit.js](hooks.md#mod-buffer-limit-js), [hooks/fetch.ts](hooks.md#mod-fetch-ts), [hooks/resolve-command.ts](hooks.md#mod-resolve-command-ts), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/log.js](ui-shortcuts.md#mod-log-js), [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Browser:** `localStorage`

<a id="fn-log-js-isdebugenabled"></a>
**`isDebugEnabled()`** · function, exported · L21–23

Whether diagnostics are on: `ytaf-debug` = '1' in localStorage (read at load), or `window.__ytaf_debug__ = true` set from the devtools console.

- **Called by:** [createLogger.debug](#fn-log-js-createlogger-debug), [createLogger.info](#fn-log-js-createlogger-info), [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse), [hooks/buffer-limit.js › installBufferLimit](hooks.md#fn-buffer-limit-js-installbufferlimit), [hooks/fetch.ts › FetchRegistry.#customFetch](hooks.md#fn-fetch-ts-fetchregistry-customfetch), [hooks/fetch.ts › FetchRegistry.#hookedFetch](hooks.md#fn-fetch-ts-fetchregistry-hookedfetch)

<a id="fn-log-js-createlogger"></a>
**`createLogger(tag)`** · function, exported · L30–55

`tag` is what every line from the module is prefixed with, in brackets.

- **Called by:** [core/config.js (at load)](#mod-config-js), [core/launch.js (at load)](#mod-launch-js), [core/remote.js (at load)](#mod-remote-js), [core/webos.js (at load)](#mod-webos-js), [features/adblock/log.js (at load)](features-adblock.md#mod-log-js), [features/auto-login/log.js (at load)](features-auto-login.md#mod-log-js), [features/block-webos-cast.ts (at load)](features.md#mod-block-webos-cast-ts), [features/comments-fix.js (at load)](features.md#mod-comments-fix-js), [features/dearrow/log.js (at load)](features-dearrow.md#mod-log-js), [features/emoji-font/log.js (at load)](features-emoji-font.md#mod-log-js), [features/force-codec/log.js (at load)](features-force-codec.md#mod-log-js), [features/lang-settings-fix.ts (at load)](features.md#mod-lang-settings-fix-ts), [features/playback-speed/log.js (at load)](features-playback-speed.md#mod-log-js), [features/return-dislike/index.js › ReturnYouTubeDislike.constructor](features-return-dislike.md#fn-index-js-returnyoutubedislike-constructor), [features/screensaver-fix/log.js (at load)](features-screensaver-fix.md#mod-log-js), [features/sponsorblock/index.js › SponsorBlockHandler.constructor](features-sponsorblock.md#fn-index-js-sponsorblockhandler-constructor), [features/sponsorblock/labels.js (at load)](features-sponsorblock.md#mod-labels-js), [features/thumbnail-quality/log.js (at load)](features-thumbnail-quality.md#mod-log-js), [features/video-quality/log.js (at load)](features-video-quality.md#mod-log-js), [features/watch/index.js (at load)](features-watch.md#mod-index-js), [hooks/buffer-limit.js (at load)](hooks.md#mod-buffer-limit-js), [hooks/fetch.ts (at load)](hooks.md#mod-fetch-ts), [hooks/resolve-command.ts (at load)](hooks.md#mod-resolve-command-ts), [ui/panel/panel.js (at load)](ui-panel.md#mod-panel-js), [ui/shortcuts/log.js (at load)](ui-shortcuts.md#mod-log-js), [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-log-js-createlogger-debug"></a>
**`createLogger.debug()`** · arrow · L36–38

@type {LogMethod}

- **Calls:** [isDebugEnabled](#fn-log-js-isdebugenabled)

<a id="fn-log-js-createlogger-info"></a>
**`createLogger.info()`** · arrow · L40–42

@type {LogMethod}

- **Calls:** [isDebugEnabled](#fn-log-js-isdebugenabled)

<a id="fn-log-js-createlogger-warn"></a>
**`createLogger.warn(args)`** · property · L47–49

console.warn with the module prefix; always printed.

<a id="fn-log-js-createlogger-error"></a>
**`createLogger.error(args)`** · property · L51–53

console.error with the module prefix; always printed.

<a id="mod-page-state-js"></a>

## core/page-state.js

> Which kind of page the leanback app is showing, derived from the body class and published as the `ytaf-page-update` window event.

73 lines · imports [core/selectors.js](#mod-selectors-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/screensaver-fix/index.js](features-screensaver-fix.md#mod-index-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/watch/index.js](features-watch.md#mod-index-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js), [ui/shortcuts/playback.js](ui-shortcuts.md#mod-playback-js), [ui/shortcuts/router.js](ui-shortcuts.md#mod-router-js), [ui/shortcuts/seek.js](ui-shortcuts.md#mod-seek-js)

**At load:**

- **Calls:** [initObserver](#fn-page-state-js-initobserver)
- **Events:** listens to `DOMContentLoaded`

<a id="fn-page-state-js-updatepagestate"></a>
**`updatePageState()`** · function · L18–48

Reads the page kinds off the body's classes and publishes them when one changed. Body classes flip constantly for focus and animation state: four classList lookups per batch, and no event unless the page changed.

- **Called by:** [initObserver](#fn-page-state-js-initobserver)
- **Events:** creates `ytaf-page-update`
- **Selectors:** `WATCH_PAGE_CLASS`, `SHORTS_PAGE_CLASS`, `ACCOUNT_SELECTOR`, `SEARCH_PAGE_CLASS`

<a id="fn-page-state-js-initobserver"></a>
**`initObserver()`** · arrow · L54–59

Watches the body's class attribute and reads the initial page state; runs once the body exists.

- **Calls:** [updatePageState](#fn-page-state-js-updatepagestate)
- **Called by:** [at load](#mod-page-state-js)
- **Browser:** `MutationObserver`

<a id="fn-page-state-js-iswatchpage"></a>
**`isWatchPage()`** · arrow, exported · L69–69

Whether the watch (video player) page is showing.

- **Called by:** [features/screensaver-fix/index.js › classifyPage](features-screensaver-fix.md#fn-index-js-classifypage), [features/video-quality/index.js › handleNavigation](features-video-quality.md#fn-index-js-handlenavigation), [features/watch/index.js › Watch.updateVisibility](features-watch.md#fn-index-js-watch-updatevisibility), [ui/panel/panel.js › createOptionsPanel.syncPopup](ui-panel.md#fn-panel-js-createoptionspanel-syncpopup), [ui/shortcuts/actions.js › ACTIONS.refresh_page.run](ui-shortcuts.md#fn-actions-js-actions-refresh-page-run), [ui/shortcuts/router.js › inScope](ui-shortcuts.md#fn-router-js-inscope)

<a id="fn-page-state-js-isshortspage"></a>
**`isShortsPage()`** · arrow, exported · L71–71

Whether the Shorts player is showing.

- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse), [features/screensaver-fix/index.js › classifyPage](features-screensaver-fix.md#fn-index-js-classifypage), [ui/shortcuts/actions.js › ACTIONS.refresh_page.run](ui-shortcuts.md#fn-actions-js-actions-refresh-page-run), [ui/shortcuts/playback.js › hideControlsAfterPause](ui-shortcuts.md#fn-playback-js-hidecontrolsafterpause), [ui/shortcuts/router.js › inScope](ui-shortcuts.md#fn-router-js-inscope), [ui/shortcuts/seek.js › skipChapter](ui-shortcuts.md#fn-seek-js-skipchapter)

<a id="fn-page-state-js-issearchpage"></a>
**`isSearchPage()`** · arrow, exported · L73–73

Whether the search page is showing.

- **Called by:** [ui/shortcuts/router.js › keyNameOf](ui-shortcuts.md#fn-router-js-keynameof)

<a id="mod-per-video-js"></a>

## core/per-video.js

> One instance per watched video, shared by SponsorBlock and the dislike counter: created when the watch page shows a video, kept across hash changes within the same video, torn down when the video changes, off the watch page, when its setting changes (and then recreated) and on unload.

73 lines · imports [core/config.js](#mod-config-js) · imported by [features/return-dislike/bootstrap.js](features-return-dislike.md#mod-bootstrap-js), [features/sponsorblock/bootstrap.js](features-sponsorblock.md#mod-bootstrap-js)

<a id="fn-per-video-js-watchvideoidfromhash"></a>
**`watchVideoIdFromHash()`** · function · L8–13

The id of the video being watched, or null off the watch page.

- **Called by:** [bootstrapPerVideo.sync](#fn-per-video-js-bootstrappervideo-sync)

<a id="fn-per-video-js-bootstrappervideo"></a>
**`bootstrapPerVideo({ create, restartOn, windowName })`** · function, exported · L22–73

`create(videoID)` returns the instance (with init(), destroy(), `videoID` and `isDestroyed`) or null while the feature is off; a change of the `restartOn` setting recreates it; `windowName` exposes the live instance on window, for the tests and for diagnostics on the TV. Returns the getter of the live instance: the current one, or null once it has torn itself down.

- **Calls:** [core/config.js › configAddChangeListener](#fn-config-js-configaddchangelistener), [bootstrapPerVideo.start](#fn-per-video-js-bootstrappervideo-start), [bootstrapPerVideo.sync](#fn-per-video-js-bootstrappervideo-sync), [bootstrapPerVideo.teardown](#fn-per-video-js-bootstrappervideo-teardown)
- **Called by:** [features/return-dislike/bootstrap.js › bootstrapReturnDislike](features-return-dislike.md#fn-bootstrap-js-bootstrapreturndislike), [features/sponsorblock/bootstrap.js › bootstrapSponsorBlock](features-sponsorblock.md#fn-bootstrap-js-bootstrapsponsorblock)
- **Events:** listens to `hashchange`, `beforeunload`, `DOMContentLoaded`

<a id="fn-per-video-js-bootstrappervideo-live"></a>
**`bootstrapPerVideo.live()`** · arrow · L26–26

The current instance while it is alive, else null (also the getter published on window).

<a id="fn-per-video-js-bootstrappervideo-set"></a>
**`bootstrapPerVideo.set(instance)`** · arrow · L30–32

Replaces the current instance (null: none).

- **Called by:** [bootstrapPerVideo.sync](#fn-per-video-js-bootstrappervideo-sync), [bootstrapPerVideo.teardown](#fn-per-video-js-bootstrappervideo-teardown)

<a id="fn-per-video-js-bootstrappervideo-teardown"></a>
**`bootstrapPerVideo.teardown()`** · arrow · L34–38

Destroys the current instance, if any, and forgets it.

- **Calls:** [bootstrapPerVideo.set](#fn-per-video-js-bootstrappervideo-set)
- **Called by:** [bootstrapPerVideo](#fn-per-video-js-bootstrappervideo), [bootstrapPerVideo.sync](#fn-per-video-js-bootstrappervideo-sync)

<a id="fn-per-video-js-bootstrappervideo-sync"></a>
**`bootstrapPerVideo.sync(settingChanged)`** · arrow · L43–61

Deferred a moment, so a burst of hash changes settles into one decision.

- **Calls:** [bootstrapPerVideo.set](#fn-per-video-js-bootstrappervideo-set), [bootstrapPerVideo.teardown](#fn-per-video-js-bootstrappervideo-teardown), [watchVideoIdFromHash](#fn-per-video-js-watchvideoidfromhash)
- **Called by:** [bootstrapPerVideo](#fn-per-video-js-bootstrappervideo), [bootstrapPerVideo.start](#fn-per-video-js-bootstrappervideo-start)
- **Browser:** `setTimeout`

<a id="fn-per-video-js-bootstrappervideo-start"></a>
**`bootstrapPerVideo.start()`** · arrow · L68–68

The body class and the hash are settled half a second after the document is.

- **Calls:** [bootstrapPerVideo.sync](#fn-per-video-js-bootstrappervideo-sync)
- **Called by:** [bootstrapPerVideo](#fn-per-video-js-bootstrappervideo)
- **Browser:** `setTimeout`

<a id="mod-player-state-js"></a>

## core/player-state.js

> The YouTube player API's playback states, as getPlayerState() reports them and as the `yt-player-state-change` event (features/video-quality) carries them.

10 lines · imported by [features/playback-speed/controller.js](features-playback-speed.md#mod-controller-js), [features/playback-speed/index.js](features-playback-speed.md#mod-index-js), [features/screensaver-fix/shorts-keep-alive.js](features-screensaver-fix.md#mod-shorts-keep-alive-js), [features/sponsorblock/video-events.js](features-sponsorblock.md#mod-video-events-js), [features/video-quality/kickstart.js](features-video-quality.md#mod-kickstart-js), [features/video-quality/player-state.js](features-video-quality.md#mod-player-state-js), [features/video-quality/quality.js](features-video-quality.md#mod-quality-js), [features/watch/index.js](features-watch.md#mod-index-js)

<a id="mod-remote-js"></a>

## core/remote.js

> The remote control: key codes, the colour-key lookup, and synthetic key presses dispatched on the app's behalf.

114 lines · imports [core/log.js](#mod-log-js) · imported by [features/auto-login/whos-watching.js](features-auto-login.md#mod-whos-watching-js), [features/return-dislike/navigation.js](features-return-dislike.md#mod-navigation-js), [features/return-dislike/panel-dom.js](features-return-dislike.md#mod-panel-dom-js), [features/screensaver-fix/shorts-keep-alive.js](features-screensaver-fix.md#mod-shorts-keep-alive-js), [features/video-quality/kickstart.js](features-video-quality.md#mod-kickstart-js), [ui/panel/controls/cycle-row.js](ui-panel.md#mod-controls-cycle-row-js), [ui/panel/keyboard.js](ui-panel.md#mod-keyboard-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js), [ui/shortcuts/helpers.js](ui-shortcuts.md#mod-helpers-js), [ui/shortcuts/oled.js](ui-shortcuts.md#mod-oled-js), [ui/shortcuts/playback.js](ui-shortcuts.md#mod-playback-js), [ui/shortcuts/router.js](ui-shortcuts.md#mod-router-js), [ui/shortcuts/seek.js](ui-shortcuts.md#mod-seek-js)

**At load:**

- **Calls:** [core/log.js › createLogger](#fn-log-js-createlogger)
- **Events:** creates `keydown`

<a id="fn-remote-js-keycodeof"></a>
**`keyCodeOf(evt)`** · arrow, exported · L44–44

The code of a key press. webOS 3 reports the alternate colour-key codes (REMOTE_KEYS.\*.alt) in charCode with keyCode 0, so charCode wins when set.

- **Called by:** [ui/shortcuts/router.js › keyNameOf](ui-shortcuts.md#fn-router-js-keynameof)

<a id="fn-remote-js-createdescriptor"></a>
**`createDescriptor(val)`** · arrow · L48–48

Getters for keyCode, which and charCode on every synthetic event: neither the constructor nor initKeyboardEvent sets them, and YouTube reads them.

- **Called by:** [sendKey](#fn-remote-js-sendkey)

<a id="fn-remote-js-sendkey"></a>
**`sendKey(keyDef, target)`** · function, exported · L81–114

Dispatches a synthetic keydown and keyup for a remote key (REMOTE_KEYS entry) on `target`, with keyCode/which forced the way Chromium 38 needs; marked so real-press-only listeners ignore it.

- **Calls:** [createDescriptor](#fn-remote-js-createdescriptor)
- **Called by:** [features/auto-login/whos-watching.js › attemptActiveBypass](features-auto-login.md#fn-whos-watching-js-attemptactivebypass), [features/return-dislike/panel-dom.js › triggerEnter](features-return-dislike.md#fn-panel-dom-js-triggerenter), [features/screensaver-fix/shorts-keep-alive.js › setShortsKeepAlive](features-screensaver-fix.md#fn-shorts-keep-alive-js-setshortskeepalive), [features/video-quality/kickstart.js › dismissRaisedControls](features-video-quality.md#fn-kickstart-js-dismissraisedcontrols), [ui/shortcuts/helpers.js › simulateBack](ui-shortcuts.md#fn-helpers-js-simulateback), [ui/shortcuts/oled.js › toggleOledOverlay](ui-shortcuts.md#fn-oled-js-toggleoledoverlay), [ui/shortcuts/playback.js › hideControlsAfterPause](ui-shortcuts.md#fn-playback-js-hidecontrolsafterpause), [ui/shortcuts/seek.js › doSkipChapter](ui-shortcuts.md#fn-seek-js-doskipchapter)

<a id="mod-selectors-js"></a>

## core/selectors.js

> Class names, ids and tag names YouTube's leanback app puts on the page. Everything that has to recognise a page, the player or a control goes through this one table, so a YouTube markup change is fixed here and nowhere else. Six-letter tokens are YouTube's obfuscated class names and change the most; the comment says what each was observed to be. The app's own ids and classes (ytaf-\*, ryd-\*) stay with the feature that creates them, and Return YouTube Dislike keeps its panel-internal selectors in its own table.
>
> Read an entry as SELECTORS.NAME, pass it on, iterate it or put it in a template string, but do not call a method on it directly (SELECTORS.NAME.map(...), SELECTORS.NAME.toUpperCase()): the minifier then keeps the whole table in the bundle instead of inlining the entries used.

99 lines · imported by [core/page-state.js](#mod-page-state-js), [features/auto-login/whos-watching.js](features-auto-login.md#mod-whos-watching-js), [features/comments-fix.js](features.md#mod-comments-fix-js), [features/dearrow/sweep.js](features-dearrow.md#mod-sweep-js), [features/emoji-font/text-nodes.js](features-emoji-font.md#mod-text-nodes-js), [features/logo-style.js](features.md#mod-logo-style-js), [features/playback-speed/index.js](features-playback-speed.md#mod-index-js), [features/return-dislike/constants.js](features-return-dislike.md#mod-constants-js), [features/return-dislike/injection.js](features-return-dislike.md#mod-injection-js), [features/screensaver-fix/index.js](features-screensaver-fix.md#mod-index-js), [features/screensaver-fix/shorts-keep-alive.js](features-screensaver-fix.md#mod-shorts-keep-alive-js), [features/sponsorblock/bar.js](features-sponsorblock.md#mod-bar-js), [features/sponsorblock/labels.js](features-sponsorblock.md#mod-labels-js), [features/sponsorblock/overlay.js](features-sponsorblock.md#mod-overlay-js), [features/thumbnail-quality/rendered.js](features-thumbnail-quality.md#mod-rendered-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/video-quality/kickstart.js](features-video-quality.md#mod-kickstart-js), [features/watch/index.js](features-watch.md#mod-index-js), [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js), [ui/shortcuts/helpers.js](ui-shortcuts.md#mod-helpers-js), [ui/shortcuts/page.js](ui-shortcuts.md#mod-page-js), [ui/shortcuts/panels.js](ui-shortcuts.md#mod-panels-js), [ui/shortcuts/playback.js](ui-shortcuts.md#mod-playback-js), [ui/shortcuts/seek.js](ui-shortcuts.md#mod-seek-js), [userScript.js](app.md#mod-userscript-js)

<a id="mod-speed-cap-js"></a>

## core/speed-cap.js

> Whether the playback speed feature holds the video at 1080p: above 1.25x a TV cannot decode 2160p fast enough, so it caps the quality, and Force Max Quality (features/video-quality) waits meanwhile. Kept here rather than in either feature: the speed feature is in the webOS 22+ build only.

14 lines · imported by [features/playback-speed/controller.js](features-playback-speed.md#mod-controller-js), [features/video-quality/state.js](features-video-quality.md#mod-state-js)

<a id="fn-speed-cap-js-isqualitycappedbyspeed"></a>
**`isQualityCappedBySpeed()`** · arrow, exported · L9–9

Whether the speed feature caps the quality now.

- **Called by:** [features/video-quality/state.js › isForceEnabled](features-video-quality.md#fn-state-js-isforceenabled)

<a id="fn-speed-cap-js-setqualitycappedbyspeed"></a>
**`setQualityCappedBySpeed(on)`** · function, exported · L12–14

Set by the speed feature when its speed goes above or back under the cap.

- **Called by:** [features/playback-speed/controller.js › createSpeedController.setCurrent](features-playback-speed.md#fn-controller-js-createspeedcontroller-setcurrent)

<a id="mod-styles-js"></a>

## core/styles.js

> Every stylesheet of the bundle in one &lt;style> element, put in the page once. Each CSS import hands its text here while its module is evaluated (tools/css-collect-loader.cjs), in import order, and the element goes in once the bundle has run: one sheet, parsed once. A text node per stylesheet had the engine parse the growing sheet again for each of the sixteen.

20 lines

<a id="fn-styles-js-insertpending"></a>
**`insertPending()`** · function · L9–14

Puts every queued stylesheet into the page as one &lt;style> element.

- **Called by:** [addStyle](#fn-styles-js-addstyle)

<a id="fn-styles-js-addstyle"></a>
**`addStyle(css)`** · function, exported · L17–20

Queues a stylesheet's text; the first one schedules the insertion, after the bundle's run.

- **Calls:** [insertPending](#fn-styles-js-insertpending)

<a id="mod-text-js"></a>

## core/text.js

> Small string helpers shared across modules.

17 lines · imported by [core/config-options.js](#mod-config-options-js), [features/sponsorblock/blue-key.js](features-sponsorblock.md#mod-blue-key-js), [features/sponsorblock/labels.js](features-sponsorblock.md#mod-labels-js), [features/sponsorblock/popup.js](features-sponsorblock.md#mod-popup-js), [features/sponsorblock/segments.js](features-sponsorblock.md#mod-segments-js), [features/sponsorblock/skipping.js](features-sponsorblock.md#mod-skipping-js)

<a id="fn-text-js-capitalize"></a>
**`capitalize(text)`** · function, exported · L4–6

"sponsor" to "Sponsor"; an empty string stays empty.

- **Called by:** [core/config-options.js (at load)](#mod-config-options-js), [features/sponsorblock/blue-key.js › skipToPreviousSegment](features-sponsorblock.md#fn-blue-key-js-skiptoprevioussegment), [features/sponsorblock/segments.js › categoryLabel](features-sponsorblock.md#fn-segments-js-categorylabel), [features/sponsorblock/skipping.js › announceSegment](features-sponsorblock.md#fn-skipping-js-announcesegment)

<a id="fn-text-js-formattime"></a>
**`formatTime(seconds)`** · function, exported · L9–17

mm:ss, or h:mm:ss past an hour.

- **Calls:** [formatTime.pad](#fn-text-js-formattime-pad)
- **Called by:** [features/sponsorblock/labels.js › buildCss](features-sponsorblock.md#fn-labels-js-buildcss), [features/sponsorblock/popup.js › SponsorBlockUI.renderRows](features-sponsorblock.md#fn-popup-js-sponsorblockui-renderrows)

<a id="fn-text-js-formattime-pad"></a>
**`formatTime.pad(n)`** · arrow · L15–15

Two digits: 5 is "05".

- **Called by:** [formatTime](#fn-text-js-formattime)

<a id="mod-version-js"></a>

## core/version.js

> The version the options panel shows in its heading: "0.8.5" for a release, "0.8.5 b2" for test build 2. webpack's DefinePlugin writes the label at build time (webpack.config.js: package.json's version, the build number from `--env build=N` or YTAF_BUILD); a source loaded without webpack (the unit tests) shows "dev".

8 lines · imported by [ui/panel/panel.js](ui-panel.md#mod-panel-js)

<a id="mod-webos-js"></a>

## core/webos.js

> The platform: which webOS version this is (from the user agent, cached), whether it is the simulator, and the engine features the modules branch on. Read by the features that differ between webOS 3 and 4, webOS 5 and 6, and webOS 22 onward.

95 lines · imports [core/log.js](#mod-log-js) · imported by [core/fetch-timeout.js](#mod-fetch-timeout-js), [features/adblock/flags.js](features-adblock.md#mod-flags-js), [features/emoji-font/index.js](features-emoji-font.md#mod-index-js), [features/return-dislike/constants.js](features-return-dislike.md#mod-constants-js), [features/return-dislike/navigation.js](features-return-dislike.md#mod-navigation-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/video-quality/state.js](features-video-quality.md#mod-state-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js), [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](#fn-log-js-createlogger)

<a id="fn-webos-js-getwebosversion"></a>
**`getWebOSVersion()`** · function, exported · L31–85

The TV's webOS version from the user agent: the platform year, else the firmware (webOS 25), else the Chromium version (the simulators); 6 when nothing matches. Cached.

- **Called by:** [isLegacyWebOS](#fn-webos-js-islegacywebos), [isWebOS25](#fn-webos-js-iswebos25), [features/adblock/flags.js › recomputeFilterFlags](features-adblock.md#fn-flags-js-recomputefilterflags), [features/emoji-font/index.js (at load)](features-emoji-font.md#mod-index-js), [features/return-dislike/navigation.js (at load)](features-return-dislike.md#mod-navigation-js), [ui/panel/pages.js › buildUITweaksPage](ui-panel.md#fn-pages-js-builduitweakspage), [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-webos-js-iswebos25"></a>
**`isWebOS25()`** · function, exported · L88–90

Whether the TV runs webOS 25 or later.

- **Calls:** [getWebOSVersion](#fn-webos-js-getwebosversion)
- **Called by:** [features/video-quality/state.js (at load)](features-video-quality.md#mod-state-js), [userScript.js (at load)](app.md#mod-userscript-js)

<a id="fn-webos-js-islegacywebos"></a>
**`isLegacyWebOS()`** · function, exported · L93–95

Whether the TV runs webOS 6 or older (the legacy build's platforms).

- **Calls:** [getWebOSVersion](#fn-webos-js-getwebosversion)
- **Called by:** [features/return-dislike/constants.js (at load)](features-return-dislike.md#mod-constants-js), [features/sponsorblock/index.js › SponsorBlockHandler.constructor](features-sponsorblock.md#fn-index-js-sponsorblockhandler-constructor)

<a id="mod-yt-storage-js"></a>

## core/yt-storage.js

> The records the leanback app keeps in localStorage (JSON, usually { data, creation, expiration }), read and written in one place: a record that is missing, malformed or behind a storage error reads as null, and a write that storage refuses is reported, never thrown. What goes in a record, and for how long, stays with each module.

36 lines · imported by [features/auto-login/previews.js](features-auto-login.md#mod-previews-js), [features/auto-login/promo-upsell.js](features-auto-login.md#mod-promo-upsell-js), [features/auto-login/whos-watching.js](features-auto-login.md#mod-whos-watching-js), [features/video-quality/quality.js](features-video-quality.md#mod-quality-js)

<a id="fn-yt-storage-js-readrecord"></a>
**`readRecord(key)`** · function, exported · L8–17

The parsed record under `key`, or null when there is none or it is not a JSON object.

- **Called by:** [features/auto-login/promo-upsell.js › setPromoUpsellSuppressed](features-auto-login.md#fn-promo-upsell-js-setpromoupsellsuppressed), [features/auto-login/whos-watching.js › setWhosWatchingSuppressed](features-auto-login.md#fn-whos-watching-js-setwhoswatchingsuppressed), [features/video-quality/quality.js › clearLocalStorageQuality](features-video-quality.md#fn-quality-js-clearlocalstoragequality), [features/video-quality/quality.js › setLocalStorageQuality](features-video-quality.md#fn-quality-js-setlocalstoragequality)
- **Browser:** `localStorage`

<a id="fn-yt-storage-js-writerecord"></a>
**`writeRecord(key, record)`** · function, exported · L20–27

Stores `record` as JSON under `key`; false when storage refused it.

- **Called by:** [features/auto-login/previews.js › setInlinePlayback](features-auto-login.md#fn-previews-js-setinlineplayback), [features/auto-login/promo-upsell.js › setPromoUpsellSuppressed](features-auto-login.md#fn-promo-upsell-js-setpromoupsellsuppressed), [features/auto-login/whos-watching.js › setWhosWatchingSuppressed](features-auto-login.md#fn-whos-watching-js-setwhoswatchingsuppressed), [features/video-quality/quality.js › setLocalStorageQuality](features-video-quality.md#fn-quality-js-setlocalstoragequality)
- **Browser:** `localStorage`

<a id="fn-yt-storage-js-removerecord"></a>
**`removeRecord(key)`** · function, exported · L30–36

Removes the record under `key`, if storage allows.

- **Called by:** [features/video-quality/quality.js › clearLocalStorageQuality](features-video-quality.md#fn-quality-js-clearlocalstoragequality)
- **Browser:** `localStorage`
