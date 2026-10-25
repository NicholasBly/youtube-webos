# Code map: ui/toast/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [ui/toast/index.js](#mod-index-js)

<a id="mod-index-js"></a>

## ui/toast/index.js

> Toast notifications in the top right corner. The container is created on the first showNotification(); the theme and OLED looks come from the &lt;html> classes (ui/styles/html-classes.js); the config is read for Disable Notifications only.

119 lines · imports [core/config.js](core.md#mod-config-js), [ui/dom.js](ui.md#mod-dom-js) · imported by [features/force-codec/index.js](features-force-codec.md#mod-index-js), [features/sponsorblock/blue-key.js](features-sponsorblock.md#mod-blue-key-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/sponsorblock/skipping.js](features-sponsorblock.md#mod-skipping-js), [features/video-quality/quality.js](features-video-quality.md#mod-quality-js), [ui/index.js](ui.md#mod-index-js), [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js), [ui/shortcuts/helpers.js](ui-shortcuts.md#mod-helpers-js), [ui/shortcuts/oled.js](ui-shortcuts.md#mod-oled-js), [ui/shortcuts/panels.js](ui-shortcuts.md#mod-panels-js), [ui/shortcuts/playback.js](ui-shortcuts.md#mod-playback-js), [ui/shortcuts/seek.js](ui-shortcuts.md#mod-seek-js)

<a id="fn-index-js-ensurecontainer"></a>
**`ensureContainer()`** · function · L12–17

The toast container, created on first use.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [Toast.constructor](#fn-index-js-toast-constructor)

<a id="fn-index-js-toast-constructor"></a>
**`Toast.constructor(text, time)`** · method · L31–44

Shows a toast with `text`: added hidden and faded in two frames later, removed after `time` ms (0: stays until removed).

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [Toast.arm](#fn-index-js-toast-arm), [ensureContainer](#fn-index-js-ensurecontainer)
- **Called by:** [showNotification](#fn-index-js-shownotification)
- **Browser:** `requestAnimationFrame`

<a id="fn-index-js-toast-islive"></a>
**`Toast.isLive()`** · method · L51–53

Still on screen and not fading out. A flag rather than the hidden class: a new toast carries the class for its first two frames, and a repeat of its text in that window must extend it, not stack a twin.

<a id="fn-index-js-toast-arm"></a>
**`Toast.arm(time)`** · method · L56–59

Restarts the removal timer (`time` 0: none).

- **Calls:** [Toast.remove](#fn-index-js-toast-remove)
- **Called by:** [Toast.constructor](#fn-index-js-toast-constructor), [Toast.update](#fn-index-js-toast-update)
- **Browser:** `setTimeout`

<a id="fn-index-js-toast-unkey"></a>
**`Toast.unkey()`** · method · L62–64

Drops this toast from the by-text map, if it is still the one there.

- **Called by:** [Toast.remove](#fn-index-js-toast-remove), [Toast.update](#fn-index-js-toast-update)

<a id="fn-index-js-toast-update"></a>
**`Toast.update(text, time)`** · method · L67–80

New text, or the same text with a fresh timer; false once the toast is fading out.

- **Calls:** [Toast.arm](#fn-index-js-toast-arm), [Toast.unkey](#fn-index-js-toast-unkey)

<a id="fn-index-js-toast-remove"></a>
**`Toast.remove()`** · method · L83–91

Fades the toast out and removes it a second later; frees its slot and its text.

- **Calls:** [Toast.unkey](#fn-index-js-toast-unkey)
- **Called by:** [Toast.arm](#fn-index-js-toast-arm)
- **Browser:** `setTimeout`

<a id="fn-index-js-shownotification"></a>
**`showNotification(text, time, slot)`** · function, exported · L102–119

Shows `text` for `time` ms (0 keeps it up); returns a handle with remove(). With a `slot`, the toast that holds it takes the new text, unless it is already fading out.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [Toast.constructor](#fn-index-js-toast-constructor)
- **Called by:** [features/force-codec/index.js › applyMode](features-force-codec.md#fn-index-js-applymode), [features/sponsorblock/blue-key.js › jumpToHighlight](features-sponsorblock.md#fn-blue-key-js-jumptohighlight), [features/sponsorblock/blue-key.js › manualSkipOrHighlight](features-sponsorblock.md#fn-blue-key-js-manualskiporhighlight), [features/sponsorblock/blue-key.js › skipToPreviousSegment](features-sponsorblock.md#fn-blue-key-js-skiptoprevioussegment), [features/sponsorblock/index.js › SponsorBlockHandler.applySegments](features-sponsorblock.md#fn-index-js-sponsorblockhandler-applysegments), [features/sponsorblock/skipping.js › announceSegment](features-sponsorblock.md#fn-skipping-js-announcesegment), [features/sponsorblock/skipping.js › skipTo](features-sponsorblock.md#fn-skipping-js-skipto), [features/video-quality/quality.js › notifyIfUpgraded](features-video-quality.md#fn-quality-js-notifyifupgraded), [ui/index.js (at load)](ui.md#mod-index-js), [ui/shortcuts/actions.js › ACTIONS.refresh_page.run](ui-shortcuts.md#fn-actions-js-actions-refresh-page-run), [ui/shortcuts/actions.js › ACTIONS.sb_manual_skip.run](ui-shortcuts.md#fn-actions-js-actions-sb-manual-skip-run), [ui/shortcuts/actions.js › ACTIONS.sb_skip_prev.run](ui-shortcuts.md#fn-actions-js-actions-sb-skip-prev-run), [ui/shortcuts/actions.js › withSponsorBlock](ui-shortcuts.md#fn-actions-js-withsponsorblock), [ui/shortcuts/bindings.js › ensureMenuKey](ui-shortcuts.md#fn-bindings-js-ensuremenukey), [ui/shortcuts/helpers.js › announcePressed](ui-shortcuts.md#fn-helpers-js-announcepressed), [ui/shortcuts/oled.js › toggleOledOverlay](ui-shortcuts.md#fn-oled-js-toggleoledoverlay), [ui/shortcuts/panels.js › toggleComments](ui-shortcuts.md#fn-panels-js-togglecomments), [ui/shortcuts/panels.js › togglePanelButton](ui-shortcuts.md#fn-panels-js-togglepanelbutton), [ui/shortcuts/playback.js › notifyPlayPause](ui-shortcuts.md#fn-playback-js-notifyplaypause), [ui/shortcuts/playback.js › toggleSubtitles](ui-shortcuts.md#fn-playback-js-togglesubtitles), [ui/shortcuts/seek.js › doSkipChapter](ui-shortcuts.md#fn-seek-js-doskipchapter), [ui/shortcuts/seek.js › performBurstSeek](ui-shortcuts.md#fn-seek-js-performburstseek)
- **Settings:** reads `disableNotifications`
