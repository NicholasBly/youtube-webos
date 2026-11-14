# Code map: ui/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [ui/dom.js](#mod-dom-js), [ui/hide-controls.js](#mod-hide-controls-js), [ui/index.js](#mod-index-js)

<a id="mod-dom-js"></a>

## ui/dom.js

> The element factory the UI builds with: the options panel and its pages, the toasts, the OLED overlay and the SponsorBlock popup.

36 lines · imported by [features/sponsorblock/popup.js](features-sponsorblock.md#mod-popup-js), [ui/panel/controls/checkbox.js](ui-panel.md#mod-controls-checkbox-js), [ui/panel/controls/color-picker.js](ui-panel.md#mod-controls-color-picker-js), [ui/panel/controls/cycle-row.js](ui-panel.md#mod-controls-cycle-row-js), [ui/panel/controls/section.js](ui-panel.md#mod-controls-section-js), [ui/panel/pages.js](ui-panel.md#mod-pages-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/oled.js](ui-shortcuts.md#mod-oled-js), [ui/toast/index.js](ui-toast.md#mod-index-js)

<a id="fn-dom-js-createelement"></a>
**`createElement(tag, props, children)`** · arrow, exported · L9–36

Builds an element: `props` sets attributes and properties, with `class`, `text`, `style` (an object) and `events` (type to listener) handled specially; strings among `children` become text nodes.

- **Called by:** [features/sponsorblock/popup.js › SponsorBlockUI.createPopup](features-sponsorblock.md#fn-popup-js-sponsorblockui-createpopup), [features/sponsorblock/popup.js › SponsorBlockUI.renderRows](features-sponsorblock.md#fn-popup-js-sponsorblockui-renderrows), [ui/panel/controls/checkbox.js › createConfigCheckbox](ui-panel.md#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/color-picker.js › createColorPicker](ui-panel.md#fn-controls-color-picker-js-createcolorpicker), [ui/panel/controls/cycle-row.js › createControlRow](ui-panel.md#fn-controls-cycle-row-js-createcontrolrow), [ui/panel/controls/cycle-row.js › createControlRow.arrow](ui-panel.md#fn-controls-cycle-row-js-createcontrolrow-arrow), [ui/panel/controls/section.js › createSection](ui-panel.md#fn-controls-section-js-createsection), [ui/panel/pages.js › buildDeArrowPage](ui-panel.md#fn-pages-js-builddearrowpage), [ui/panel/pages.js › buildMainPage](ui-panel.md#fn-pages-js-buildmainpage), [ui/panel/pages.js › buildShortcutsPage](ui-panel.md#fn-pages-js-buildshortcutspage), [ui/panel/pages.js › buildSponsorPage](ui-panel.md#fn-pages-js-buildsponsorpage), [ui/panel/pages.js › buildUITweaksPage](ui-panel.md#fn-pages-js-builduitweakspage), [ui/panel/pages.js › footNote](ui-panel.md#fn-pages-js-footnote), [ui/panel/pages.js › helpLine](ui-panel.md#fn-pages-js-helpline), [ui/panel/panel.js › createHeading](ui-panel.md#fn-panel-js-createheading), [ui/panel/panel.js › createHeading.logo](ui-panel.md#fn-panel-js-createheading-logo), [ui/panel/panel.js › createOptionsPanel](ui-panel.md#fn-panel-js-createoptionspanel), [ui/panel/panel.js › createTabMenu](ui-panel.md#fn-panel-js-createtabmenu), [ui/shortcuts/oled.js › toggleOledOverlay](ui-shortcuts.md#fn-oled-js-toggleoledoverlay), [ui/toast/index.js › Toast.constructor](ui-toast.md#fn-index-js-toast-constructor), [ui/toast/index.js › ensureContainer](ui-toast.md#fn-index-js-ensurecontainer)

<a id="mod-hide-controls-js"></a>

## ui/hide-controls.js

> Keeps YouTube's controls bar, the player shadows and the clock out of sight for a moment: a pause (ui/shortcuts/playback.js) and the webOS 25 kick (features/video-quality/kickstart.js) both raise the bar.
>
> The bar, the named shadows and the clock go through a class on &lt;body> whose rules end in a class (global.css, watch.css): a toggle restyles only the elements with those classes, and an element YouTube builds during the window is covered too. The shadow drawn as a bare [idomkey='shadow'] goes through an inline style instead: a rule ending in that attribute made each toggle restyle every element carrying an idomkey, most of the app. Any element with that idomkey, as 0.8.4 matched, not only a div.

52 lines · imported by [features/video-quality/kickstart.js](features-video-quality.md#mod-kickstart-js), [ui/shortcuts/playback.js](ui-shortcuts.md#mod-playback-js)

<a id="fn-hide-controls-js-showcontrols"></a>
**`showControls()`** · function, exported · L20–31

Lifts the hiding now; a no-op when nothing is hidden.

- **Called by:** [hideControlsFor](#fn-hide-controls-js-hidecontrolsfor)

<a id="fn-hide-controls-js-hidecontrolsfor"></a>
**`hideControlsFor(ms)`** · function, exported · L34–52

Hides them for `ms` (a second call extends the window); returns showControls.

- **Calls:** [showControls](#fn-hide-controls-js-showcontrols)
- **Called by:** [features/video-quality/kickstart.js › dismissRaisedControls](features-video-quality.md#fn-kickstart-js-dismissraisedcontrols), [ui/shortcuts/playback.js › hideControlsAfterPause](ui-shortcuts.md#fn-playback-js-hidecontrolsafterpause)
- **Browser:** `querySelectorAll`, `setTimeout`

<a id="mod-index-js"></a>

## ui/index.js

> The settings UI and remote shortcuts: the panel (panel/), the shortcut router (shortcuts/), the &lt;html> classes behind the themes (styles/), the toasts (toast/). This file keeps the settings reachable and greets the user; the features themselves start in userScript.js.

17 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js), [ui/shortcuts/router.js](ui-shortcuts.md#mod-router-js), [ui/styles/html-classes.js](ui-styles.md#mod-html-classes-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [ui/shortcuts/bindings.js › ensureMenuKey](ui-shortcuts.md#fn-bindings-js-ensuremenukey), [ui/styles/html-classes.js › initHtmlClasses](ui-styles.md#fn-html-classes-js-inithtmlclasses), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Browser:** `setTimeout`
