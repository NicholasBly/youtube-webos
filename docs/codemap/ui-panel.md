# Code map: ui/panel/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [ui/panel/controls/checkbox.js](#mod-controls-checkbox-js), [ui/panel/controls/color-picker.js](#mod-controls-color-picker-js), [ui/panel/controls/cycle-row.js](#mod-controls-cycle-row-js), [ui/panel/controls/index.js](#mod-controls-index-js), [ui/panel/controls/section.js](#mod-controls-section-js), [ui/panel/focus-trap.js](#mod-focus-trap-js), [ui/panel/keyboard.js](#mod-keyboard-js), [ui/panel/pages.js](#mod-pages-js), [ui/panel/panel.js](#mod-panel-js)

<a id="mod-controls-checkbox-js"></a>

## ui/panel/controls/checkbox.js

> A checkbox row bound to a config key, and greying a row out.

47 lines · imports [core/config.js](core.md#mod-config-js), [ui/dom.js](ui.md#mod-dom-js) · imported by [ui/panel/controls/cycle-row.js](#mod-controls-cycle-row-js)

<a id="fn-controls-checkbox-js-createconfigcheckbox"></a>
**`createConfigCheckbox(key)`** · function, exported · L14–32

A checkbox row for boolean setting `key`, labelled with its description; it writes the setting when toggled and follows changes made elsewhere.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [ui/panel/pages.js › buildMainPage](#fn-pages-js-buildmainpage), [ui/panel/pages.js › buildSponsorPage](#fn-pages-js-buildsponsorpage), [ui/panel/pages.js › buildUITweaksPage](#fn-pages-js-builduitweakspage)

<a id="fn-controls-checkbox-js-setunavailable"></a>
**`setUnavailable(row, on)`** · function, exported · L41–47

Greys a row out and drops it from the focus order, or restores it: the setting it carries does nothing right now (Tracking Block without Ad Blocking, the thumbnail strategy without the upgrade). Greyed out and kept in place rather than hidden, so the user sees why and the rows below do not jump.

- **Called by:** [ui/panel/controls/cycle-row.js › createOpacityControl.sync](#fn-controls-cycle-row-js-createopacitycontrol-sync), [ui/panel/controls/cycle-row.js › createThumbnailQualityControl.sync](#fn-controls-cycle-row-js-createthumbnailqualitycontrol-sync), [ui/panel/pages.js › buildMainPage.updateDependencyState](#fn-pages-js-buildmainpage-updatedependencystate)
- **Browser:** `querySelector`

<a id="mod-controls-color-picker-js"></a>

## ui/panel/controls/color-picker.js

> The colour picker beside a SponsorBlock category row: a reset button and the native colour input, bound to the category's colour key.

45 lines · imports [core/config.js](core.md#mod-config-js), [ui/dom.js](ui.md#mod-dom-js) · imported by [ui/panel/controls/cycle-row.js](#mod-controls-cycle-row-js)

<a id="fn-controls-color-picker-js-createcolorpicker"></a>
**`createColorPicker(colorKey)`** · function, exported · L15–45

A colour input and an R (reset to default) button for colour setting `colorKey`; it follows changes made elsewhere.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/config.js › configGetDefault](core.md#fn-config-js-configgetdefault), [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [ui/panel/controls/cycle-row.js › createSegmentControl](#fn-controls-cycle-row-js-createsegmentcontrol)

<a id="mod-controls-cycle-row-js"></a>

## ui/panel/controls/cycle-row.js

> The left/right cycle rows, each bound to a config key, and the rows built from them for particular settings. Every control registers its config listeners once and never removes them: the panel is built once and lives for the session.

231 lines · imports [core/config.js](core.md#mod-config-js), [core/remote.js](core.md#mod-remote-js), [ui/dom.js](ui.md#mod-dom-js), [ui/panel/controls/color-picker.js](#mod-controls-color-picker-js), [ui/panel/controls/checkbox.js](#mod-controls-checkbox-js)

<a id="fn-controls-cycle-row-js-createcontrolrow"></a>
**`createControlRow(labelText, displayValueGetter, stepLeft, stepRight, extraElements)`** · function · L31–109

A focusable row: the label on the left, `< value >` on the right. Left and Right (and a click on the row) step the value; the arrows are clickable too. Enter is the panel's: its keyboard handler clicks the focused row. Returns the row and the function that refreshes its value.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [createControlRow.arrow](#fn-controls-cycle-row-js-createcontrolrow-arrow), [createControlRow.onLeft](#fn-controls-cycle-row-js-createcontrolrow-onleft), [createControlRow.onRight](#fn-controls-cycle-row-js-createcontrolrow-onright)
- **Called by:** [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol), [createOpacityControl](#fn-controls-cycle-row-js-createopacitycontrol)

<a id="fn-controls-cycle-row-js-createcontrolrow-updatedisplay"></a>
**`createControlRow.updateDisplay()`** · arrow · L41–41

Shows the current value.

<a id="fn-controls-cycle-row-js-createcontrolrow-unavailable"></a>
**`createControlRow.unavailable()`** · arrow · L51–51

Whether the row is greyed out (setUnavailable): a greyed-out row steps nothing, by key or by pointer.

- **Called by:** [createControlRow.onLeft](#fn-controls-cycle-row-js-createcontrolrow-onleft), [createControlRow.onRight](#fn-controls-cycle-row-js-createcontrolrow-onright)

<a id="fn-controls-cycle-row-js-createcontrolrow-onleft"></a>
**`createControlRow.onLeft()`** · arrow · L54–56

Steps the value back, unless the row is greyed out.

- **Calls:** [createControlRow.unavailable](#fn-controls-cycle-row-js-createcontrolrow-unavailable)
- **Called by:** [createControlRow](#fn-controls-cycle-row-js-createcontrolrow)

<a id="fn-controls-cycle-row-js-createcontrolrow-onright"></a>
**`createControlRow.onRight()`** · arrow · L58–60

Steps the value forward, unless the row is greyed out.

- **Calls:** [createControlRow.unavailable](#fn-controls-cycle-row-js-createcontrolrow-unavailable)
- **Called by:** [createControlRow](#fn-controls-cycle-row-js-createcontrolrow)

<a id="fn-controls-cycle-row-js-createcontrolrow-arrow"></a>
**`createControlRow.arrow(text, onPress)`** · arrow · L63–73

A clickable &lt; or > arrow for the pointer (Magic Remote).

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [createControlRow](#fn-controls-cycle-row-js-createcontrolrow)

<a id="fn-controls-cycle-row-js-createcyclecontrol"></a>
**`createCycleControl(configKey, labelText, modes, displayMap, extraElements)`** · function · L112–135

A row that cycles `configKey` through `modes`; `displayMap` turns a mode into its label.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [createControlRow](#fn-controls-cycle-row-js-createcontrolrow), [createCycleControl.cycle](#fn-controls-cycle-row-js-createcyclecontrol-cycle), [createCycleControl.displayValue](#fn-controls-cycle-row-js-createcyclecontrol-displayvalue)
- **Called by:** [createAlignedCycleControl](#fn-controls-cycle-row-js-createalignedcyclecontrol), [createPreviewControl](#fn-controls-cycle-row-js-createpreviewcontrol), [createSegmentControl](#fn-controls-cycle-row-js-createsegmentcontrol), [createShortcutControl](#fn-controls-cycle-row-js-createshortcutcontrol)

<a id="fn-controls-cycle-row-js-createcyclecontrol-displayvalue"></a>
**`createCycleControl.displayValue()`** · arrow · L114–117

The label of the setting's current value (the value itself when the map has none).

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)

<a id="fn-controls-cycle-row-js-createcyclecontrol-cycle"></a>
**`createCycleControl.cycle(step)`** · arrow · L119–122

Writes the next (step 1) or previous (-1) value in `modes`, wrapping around.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite)
- **Called by:** [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)

<a id="fn-controls-cycle-row-js-createalignedcyclecontrol"></a>
**`createAlignedCycleControl(configKey, displayMap)`** · function · L142–151

A cycle row that sits among checkbox rows. Its label is indented by one checkbox (the ytaf-aligned rule in controls.css) and starts with the same no-break space the checkbox labels use, so the text lines up with them.

- **Calls:** [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)
- **Called by:** [createLogoControl](#fn-controls-cycle-row-js-createlogocontrol), [createThemeControl](#fn-controls-cycle-row-js-createthemecontrol), [createThumbnailQualityControl](#fn-controls-cycle-row-js-createthumbnailqualitycontrol), [createVideoCodecControl](#fn-controls-cycle-row-js-createvideocodeccontrol)

<a id="fn-controls-cycle-row-js-createlogocontrol"></a>
**`createLogoControl()`** · arrow, exported · L154–154

The YouTube Logo row (Default, Premium, Hidden).

- **Calls:** [createAlignedCycleControl](#fn-controls-cycle-row-js-createalignedcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildMainPage](#fn-pages-js-buildmainpage)
- **Settings:** uses `logoStyle`

<a id="fn-controls-cycle-row-js-createvideocodeccontrol"></a>
**`createVideoCodecControl()`** · arrow, exported · L157–158

The Force Video Codec row.

- **Calls:** [createAlignedCycleControl](#fn-controls-cycle-row-js-createalignedcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildMainPage](#fn-pages-js-buildmainpage)
- **Settings:** uses `forceVideoCodec`

<a id="fn-controls-cycle-row-js-createthemecontrol"></a>
**`createThemeControl()`** · arrow, exported · L161–161

The UI Theme row.

- **Calls:** [createAlignedCycleControl](#fn-controls-cycle-row-js-createalignedcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildUITweaksPage](#fn-pages-js-builduitweakspage)
- **Settings:** uses `uiTheme`

<a id="fn-controls-cycle-row-js-createthumbnailqualitycontrol"></a>
**`createThumbnailQualityControl()`** · function, exported · L164–171

The Thumbnail Strategy row, greyed out while Max Thumbnail Quality is off.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [createAlignedCycleControl](#fn-controls-cycle-row-js-createalignedcyclecontrol), [createThumbnailQualityControl.sync](#fn-controls-cycle-row-js-createthumbnailqualitycontrol-sync)
- **Called by:** [ui/panel/pages.js › buildMainPage](#fn-pages-js-buildmainpage)
- **Settings:** listens to `upgradeThumbnails`; uses `thumbnailQualityMode`

<a id="fn-controls-cycle-row-js-createthumbnailqualitycontrol-sync"></a>
**`createThumbnailQualityControl.sync()`** · arrow · L167–167

The strategy only means anything while the feature it tunes is on.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [ui/panel/controls/checkbox.js › setUnavailable](#fn-controls-checkbox-js-setunavailable)
- **Called by:** [createThumbnailQualityControl](#fn-controls-cycle-row-js-createthumbnailqualitycontrol)
- **Settings:** reads `upgradeThumbnails`

<a id="fn-controls-cycle-row-js-createsegmentcontrol"></a>
**`createSegmentControl(key)`** · function, exported · L177–183

The row of one SponsorBlock category (`sbMode_<category>`): its modes, with the category's colour picker.

- **Calls:** [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [ui/panel/controls/color-picker.js › createColorPicker](#fn-controls-color-picker-js-createcolorpicker), [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildSponsorPage](#fn-pages-js-buildsponsorpage)
- **Settings:** uses `sbMode_highlight`, `*Color`

<a id="fn-controls-cycle-row-js-createshortcutcontrol"></a>
**`createShortcutControl(keyIdentifier)`** · function, exported · L186–190

The row of one shortcut key (0-9, red, green, blue): the action it runs.

- **Calls:** [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildShortcutsPage](#fn-pages-js-buildshortcutspage)
- **Settings:** uses `shortcut_key_*`

<a id="fn-controls-cycle-row-js-createpreviewcontrol"></a>
**`createPreviewControl(key)`** · function, exported · L193–200

The Force Previews row (Disabled, Force On, Force Off).

- **Calls:** [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [createCycleControl](#fn-controls-cycle-row-js-createcyclecontrol)
- **Called by:** [ui/panel/pages.js › buildUITweaksPage](#fn-pages-js-builduitweakspage)

<a id="fn-controls-cycle-row-js-createopacitycontrol"></a>
**`createOpacityControl(key)`** · function, exported · L206–231

A 0-100 % row in steps of 5 for setting `key` (the video shelf opacity), greyed out while OLED-Care Mode is off.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/config.js › configGetDesc](core.md#fn-config-js-configgetdesc), [core/config.js › configRead](core.md#fn-config-js-configread), [createControlRow](#fn-controls-cycle-row-js-createcontrolrow), [createOpacityControl.changeValue](#fn-controls-cycle-row-js-createopacitycontrol-changevalue), [createOpacityControl.sync](#fn-controls-cycle-row-js-createopacitycontrol-sync)
- **Called by:** [ui/panel/pages.js › buildUITweaksPage](#fn-pages-js-builduitweakspage)
- **Settings:** listens to `enableOledCareMode`

<a id="fn-controls-cycle-row-js-createopacitycontrol-changevalue"></a>
**`createOpacityControl.changeValue(delta)`** · arrow · L212–215

Adds `delta` to the stored value, kept within 0-100.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite)
- **Called by:** [createOpacityControl](#fn-controls-cycle-row-js-createopacitycontrol)

<a id="fn-controls-cycle-row-js-createopacitycontrol-sync"></a>
**`createOpacityControl.sync()`** · arrow · L227–227

The shelf opacity applies under OLED-Care Mode only (ui/styles/html-classes.js).

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [ui/panel/controls/checkbox.js › setUnavailable](#fn-controls-checkbox-js-setunavailable)
- **Called by:** [createOpacityControl](#fn-controls-cycle-row-js-createopacitycontrol)
- **Settings:** reads `enableOledCareMode`

<a id="mod-controls-index-js"></a>

## ui/panel/controls/index.js

> The building blocks of the options panel: checkboxes, sections, the left/right cycle rows and the colour picker, each bound to a config key.

16 lines · imported by [ui/panel/pages.js](#mod-pages-js)

<a id="mod-controls-section-js"></a>

## ui/panel/controls/section.js

> A titled group of rows. `variant` is an extra class on the section, used to opt a section into the two-column layout; sizing and spacing live in pages.css so the whole panel can be retuned in one place.

18 lines · imports [ui/dom.js](ui.md#mod-dom-js)

<a id="fn-controls-section-js-createsection"></a>
**`createSection(title, elements, variant)`** · function, exported · L10–18

A titled group of rows; `variant` adds a class (ytaf-section-2col lays the rows out in two columns).

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [ui/panel/pages.js › buildMainPage](#fn-pages-js-buildmainpage), [ui/panel/pages.js › buildUITweaksPage](#fn-pages-js-builduitweakspage)

<a id="mod-focus-trap-js"></a>

## ui/panel/focus-trap.js

> Keeps focus inside the options panel while it is open: a focus that lands outside it (the app's own focus traffic) is sent back to the last place it was inside, or to the tab of the open page.

40 lines · imported by [ui/panel/panel.js](#mod-panel-js)

<a id="fn-focus-trap-js-createfocustrap"></a>
**`createFocusTrap({ container, allowed, firstControl })`** · function, exported · L10–40

`container` is the panel element, `allowed(target)` says whether a focus outside the container is fine anyway (the SponsorBlock popup), `firstControl()` is where focus goes when the last safe place is gone.

- **Called by:** [ui/panel/panel.js › createOptionsPanel](#fn-panel-js-createoptionspanel)

<a id="fn-focus-trap-js-createfocustrap-onfocus"></a>
**`createFocusTrap.onFocus(e)`** · arrow · L17–26

Capture-phase focus listener: a focus outside the panel (and outside the allowed popup) is sent back to the last place inside.

- **Called by:** [createFocusTrap.attach](#fn-focus-trap-js-createfocustrap-attach), [createFocusTrap.detach](#fn-focus-trap-js-createfocustrap-detach)

<a id="fn-focus-trap-js-createfocustrap-attach"></a>
**`createFocusTrap.attach(initial)`** · property · L30–33

Starts trapping, with `initial` as the place focus is sent back to.

- **Calls:** [createFocusTrap.onFocus](#fn-focus-trap-js-createfocustrap-onfocus)
- **Events:** listens to `focus`

<a id="fn-focus-trap-js-createfocustrap-detach"></a>
**`createFocusTrap.detach()`** · property · L35–38

Stops trapping.

- **Calls:** [createFocusTrap.onFocus](#fn-focus-trap-js-createfocustrap-onfocus)

<a id="mod-keyboard-js"></a>

## ui/panel/keyboard.js

> Keyboard navigation inside the options panel: the arrows move focus between the tab buttons and the controls of the open page by where they sit on screen, Enter clicks, Back and Escape close. The handler reads the live panel state through `ctx`.
>
> While the panel is open it listens on the document in the capture phase, behind the shortcut router, and swallows every key that reaches it: nothing gets to YouTube, so a stray Down cannot scroll the page behind the panel, and a key pressed with focus in the SponsorBlock segment popup (a Magic Remote click puts it there) is the panel's too. The router has already taken the bound shortcuts, among them the menu key that closes the panel. Left and Right on a focused cycle row are left alone here, so the row's own bubble-phase handler (panel/controls/cycle-row.js) steps the value.

297 lines · imports [core/remote.js](core.md#mod-remote-js) · imported by [ui/panel/panel.js](#mod-panel-js)

<a id="fn-keyboard-js-swallowuntilreleased"></a>
**`swallowUntilReleased(keyCode)`** · function · L21–43

Swallows the key that closed the panel until it is released: a held Back repeats, and the repeats would otherwise reach YouTube (a page back) once the panel's handler is gone.

- **Calls:** [swallowUntilReleased.onDown](#fn-keyboard-js-swallowuntilreleased-ondown), [swallowUntilReleased.onUp](#fn-keyboard-js-swallowuntilreleased-onup), [swallowUntilReleased.release](#fn-keyboard-js-swallowuntilreleased-release)
- **Called by:** [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown)
- **Events:** listens to `keydown`, `keyup`
- **Browser:** `setTimeout`

<a id="fn-keyboard-js-swallowuntilreleased-ondown"></a>
**`swallowUntilReleased.onDown(evt)`** · arrow · L23–28

Eats the held key's repeats.

- **Called by:** [swallowUntilReleased](#fn-keyboard-js-swallowuntilreleased), [swallowUntilReleased.release](#fn-keyboard-js-swallowuntilreleased-release)

<a id="fn-keyboard-js-swallowuntilreleased-release"></a>
**`swallowUntilReleased.release()`** · arrow · L30–34

Stops swallowing: both listeners and the 2 s safety timer go.

- **Calls:** [swallowUntilReleased.onDown](#fn-keyboard-js-swallowuntilreleased-ondown), [swallowUntilReleased.onUp](#fn-keyboard-js-swallowuntilreleased-onup)
- **Called by:** [swallowUntilReleased](#fn-keyboard-js-swallowuntilreleased), [swallowUntilReleased.onUp](#fn-keyboard-js-swallowuntilreleased-onup)

<a id="fn-keyboard-js-swallowuntilreleased-onup"></a>
**`swallowUntilReleased.onUp(evt)`** · arrow · L36–38

The key was released: stop swallowing it.

- **Calls:** [swallowUntilReleased.release](#fn-keyboard-js-swallowuntilreleased-release)
- **Called by:** [swallowUntilReleased](#fn-keyboard-js-swallowuntilreleased), [swallowUntilReleased.release](#fn-keyboard-js-swallowuntilreleased-release)

<a id="fn-keyboard-js-pagefocusables"></a>
**`pageFocusables(page)`** · function, exported · L61–69

The controls of `page` that can take focus, in document order.

- **Called by:** [createPanelKeyboard.focusables](#fn-keyboard-js-createpanelkeyboard-focusables), [createPanelKeyboard.moveVertical](#fn-keyboard-js-createpanelkeyboard-movevertical), [ui/panel/panel.js › createOptionsPanel.setActivePage](#fn-panel-js-createoptionspanel-setactivepage)
- **Browser:** `querySelectorAll`

<a id="fn-keyboard-js-boxof"></a>
**`boxOf(el)`** · function · L75–78

The box a move measures: a checkbox's whole label row, not the small box at its left, which would overlap nothing above or below it.

- **Called by:** [nearestInDirection](#fn-keyboard-js-nearestindirection)
- **Browser:** `getBoundingClientRect`

<a id="fn-keyboard-js-nearestindirection"></a>
**`nearestInDirection(from, dir, candidates)`** · function · L88–131

The candidate nearest to `from` in `dir`, judged by the centres of their boxes (boxOf). Left and Right stay within the row: only candidates that overlap `from` vertically count. Up and Down prefer a candidate that overlaps `from` horizontally but take the nearest one otherwise. Among those, the one closest ahead wins, then the one closest sideways. Returns null when nothing lies that way.

- **Calls:** [boxOf](#fn-keyboard-js-boxof)
- **Called by:** [createPanelKeyboard.moveFocus](#fn-keyboard-js-createpanelkeyboard-movefocus)

<a id="fn-keyboard-js-createpanelkeyboard"></a>
**`createPanelKeyboard(elContainer, ctx)`** · function, exported · L140–297

@param {HTMLElement} elContainer the panel element @param {object} ctx  `tabBtns` (the tab buttons), `activePage` (live index), `pages()` (the four page elements, unbuilt ones undefined), `close()` @returns {{ attach(): void, detach(): void }} the key handler, to be put on the document while the panel is open

- **Calls:** [createPanelKeyboard.markLabel](#fn-keyboard-js-createpanelkeyboard-marklabel)
- **Called by:** [ui/panel/panel.js › createOptionsPanel](#fn-panel-js-createoptionspanel)
- **Events:** listens to `focusin`, `focusout`

<a id="fn-keyboard-js-createpanelkeyboard-marklabel"></a>
**`createPanelKeyboard.markLabel(evt, on)`** · arrow · L143–146

Chrome 38 to 59 have no :focus-within, so the label row of the focused control carries a class instead (panel.css).

- **Called by:** [createPanelKeyboard](#fn-keyboard-js-createpanelkeyboard)

<a id="fn-keyboard-js-createpanelkeyboard-focusables"></a>
**`createPanelKeyboard.focusables()`** · arrow · L151–151

The tab buttons and the controls of the open page, in document order.

- **Calls:** [pageFocusables](#fn-keyboard-js-pagefocusables)
- **Called by:** [createPanelKeyboard.moveFocus](#fn-keyboard-js-createpanelkeyboard-movefocus)

<a id="fn-keyboard-js-createpanelkeyboard-movefocus"></a>
**`createPanelKeyboard.moveFocus(dir)`** · arrow · L154–157

Moves the focus to the nearest focusable control in direction `dir`.

- **Calls:** [createPanelKeyboard.focusables](#fn-keyboard-js-createpanelkeyboard-focusables), [nearestInDirection](#fn-keyboard-js-nearestindirection)
- **Called by:** [createPanelKeyboard.moveHorizontal](#fn-keyboard-js-createpanelkeyboard-movehorizontal), [createPanelKeyboard.moveVertical](#fn-keyboard-js-createpanelkeyboard-movevertical)

<a id="fn-keyboard-js-createpanelkeyboard-movehorizontal"></a>
**`createPanelKeyboard.moveHorizontal(dir, preFocus)`** · arrow · L160–168

Left and Right: within the row, and around the ends of the tab bar.

- **Calls:** [createPanelKeyboard.moveFocus](#fn-keyboard-js-createpanelkeyboard-movefocus)
- **Called by:** [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown)

<a id="fn-keyboard-js-createpanelkeyboard-movevertical"></a>
**`createPanelKeyboard.moveVertical(dir, preFocus)`** · arrow · L171–194

Up and Down: between the open tab and its page, wrapping at both ends.

- **Calls:** [createPanelKeyboard.moveFocus](#fn-keyboard-js-createpanelkeyboard-movefocus), [pageFocusables](#fn-keyboard-js-pagefocusables)
- **Called by:** [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown)

<a id="fn-keyboard-js-createpanelkeyboard-onpointermove"></a>
**`createPanelKeyboard.onPointerMove()`** · arrow · L209–211

The pointer moved: OK presses are the pointer's from now on.

- **Called by:** [createPanelKeyboard.attach](#fn-keyboard-js-createpanelkeyboard-attach), [createPanelKeyboard.detach](#fn-keyboard-js-createpanelkeyboard-detach)

<a id="fn-keyboard-js-createpanelkeyboard-oncursorstate"></a>
**`createPanelKeyboard.onCursorState(evt)`** · arrow · L213–215

webOS showed or hid the pointer (it hides it after a while, or on an arrow key).

- **Called by:** [createPanelKeyboard.attach](#fn-keyboard-js-createpanelkeyboard-attach), [createPanelKeyboard.detach](#fn-keyboard-js-createpanelkeyboard-detach)

<a id="fn-keyboard-js-createpanelkeyboard-onclick"></a>
**`createPanelKeyboard.onClick(evt)`** · arrow · L220–227

Drops a pointer click that comes with the Enter press that already clicked.

- **Called by:** [createPanelKeyboard.attach](#fn-keyboard-js-createpanelkeyboard-attach), [createPanelKeyboard.detach](#fn-keyboard-js-createpanelkeyboard-detach)

<a id="fn-keyboard-js-createpanelkeyboard-onkeyup"></a>
**`createPanelKeyboard.onKeyUp(evt)`** · arrow · L229–233

Enter released: a click it brings can still follow, briefly.

- **Called by:** [createPanelKeyboard.attach](#fn-keyboard-js-createpanelkeyboard-attach), [createPanelKeyboard.detach](#fn-keyboard-js-createpanelkeyboard-detach)

<a id="fn-keyboard-js-createpanelkeyboard-clickfocused"></a>
**`createPanelKeyboard.clickFocused()`** · arrow · L235–240

Clicks the focused control, as the Enter key; the click this sends is let through.

- **Called by:** [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown)

<a id="fn-keyboard-js-createpanelkeyboard-onkeydown"></a>
**`createPanelKeyboard.onKeyDown(evt)`** · arrow · L246–273

The panel's keys while it is open: arrows move the focus (Left/Right on a cycle row are the row's), Enter clicks, Back or Escape closes. Every key is kept from YouTube.

- **Calls:** [createPanelKeyboard.clickFocused](#fn-keyboard-js-createpanelkeyboard-clickfocused), [createPanelKeyboard.moveHorizontal](#fn-keyboard-js-createpanelkeyboard-movehorizontal), [createPanelKeyboard.moveVertical](#fn-keyboard-js-createpanelkeyboard-movevertical), [swallowUntilReleased](#fn-keyboard-js-swallowuntilreleased)
- **Called by:** [createPanelKeyboard.attach](#fn-keyboard-js-createpanelkeyboard-attach), [createPanelKeyboard.detach](#fn-keyboard-js-createpanelkeyboard-detach)

<a id="fn-keyboard-js-createpanelkeyboard-attach"></a>
**`createPanelKeyboard.attach()`** · property · L277–284

Starts handling keys (the panel opened).

- **Calls:** [createPanelKeyboard.onClick](#fn-keyboard-js-createpanelkeyboard-onclick), [createPanelKeyboard.onCursorState](#fn-keyboard-js-createpanelkeyboard-oncursorstate), [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown), [createPanelKeyboard.onKeyUp](#fn-keyboard-js-createpanelkeyboard-onkeyup), [createPanelKeyboard.onPointerMove](#fn-keyboard-js-createpanelkeyboard-onpointermove)
- **Events:** listens to `keydown`, `keyup`, `click`, `mousemove`, `cursorStateChange`

<a id="fn-keyboard-js-createpanelkeyboard-detach"></a>
**`createPanelKeyboard.detach()`** · property · L286–295

Stops handling keys (the panel closed).

- **Calls:** [createPanelKeyboard.onClick](#fn-keyboard-js-createpanelkeyboard-onclick), [createPanelKeyboard.onCursorState](#fn-keyboard-js-createpanelkeyboard-oncursorstate), [createPanelKeyboard.onKeyDown](#fn-keyboard-js-createpanelkeyboard-onkeydown), [createPanelKeyboard.onKeyUp](#fn-keyboard-js-createpanelkeyboard-onkeyup), [createPanelKeyboard.onPointerMove](#fn-keyboard-js-createpanelkeyboard-onpointermove)

<a id="mod-pages-js"></a>

## ui/panel/pages.js

> The four pages of the options panel. Each builder returns its page element; the panel appends it and decides when it is built (Main up front, the rest one per frame once the panel is on screen).

180 lines · imports [core/config.js](core.md#mod-config-js), [core/guest-mode.js](core.md#mod-guest-mode-js), [core/webos.js](core.md#mod-webos-js), [ui/dom.js](ui.md#mod-dom-js), [core/config-options.js](core.md#mod-config-options-js), [ui/panel/controls/index.js](#mod-controls-index-js) · imported by [ui/panel/panel.js](#mod-panel-js)

<a id="fn-pages-js-helpline"></a>
**`helpLine(text)`** · arrow · L25–25

A line of small help text under a row.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [buildUITweaksPage](#fn-pages-js-builduitweakspage)

<a id="fn-pages-js-buildmainpage"></a>
**`buildMainPage()`** · function, exported · L32–88

The Main page: Cosmetic Filtering (Ad Blocking and the filters that depend on it, greyed out while it is off), then the other features.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/guest-mode.js › isGuestMode](core.md#fn-guest-mode-js-isguestmode), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/panel/controls/checkbox.js › createConfigCheckbox](#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/cycle-row.js › createLogoControl](#fn-controls-cycle-row-js-createlogocontrol), [ui/panel/controls/cycle-row.js › createThumbnailQualityControl](#fn-controls-cycle-row-js-createthumbnailqualitycontrol), [ui/panel/controls/cycle-row.js › createVideoCodecControl](#fn-controls-cycle-row-js-createvideocodeccontrol), [ui/panel/controls/section.js › createSection](#fn-controls-section-js-createsection), [buildMainPage.updateDependencyState](#fn-pages-js-buildmainpage-updatedependencystate)
- **Settings:** listens to `enableAdBlock`; uses `enableTrackingBlock`, `removeGlobalShorts`, `removeLiveVideos`, `removeTopLiveGames`, `removeMostRelevant`, `hideGuestSignInPrompts`, `forceHighResVideo`, `hideEndcards`, `enableReturnYouTubeDislike`, `enableAutoLogin`, `upgradeThumbnails`, `showWatch`, `enableOledCareMode`, `disableNotifications`

<a id="fn-pages-js-buildmainpage-updatedependencystate"></a>
**`buildMainPage.updateDependencyState()`** · arrow · L58–63

Greys out the rows that depend on Ad Blocking while it is off.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [ui/panel/controls/checkbox.js › setUnavailable](#fn-controls-checkbox-js-setunavailable)
- **Called by:** [buildMainPage](#fn-pages-js-buildmainpage)
- **Settings:** reads `enableAdBlock`

<a id="fn-pages-js-buildsponsorpage"></a>
**`buildSponsorPage()`** · function, exported · L92–129

The SponsorBlock page: the switch, one row per category, and the SponsorBlock options.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/panel/controls/checkbox.js › createConfigCheckbox](#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/cycle-row.js › createSegmentControl](#fn-controls-cycle-row-js-createsegmentcontrol)
- **Settings:** uses `enableSponsorBlock`, `sbMode_sponsor`, `sbMode_intro`, `sbMode_outro`, `sbMode_interaction`, `sbMode_selfpromo`, `sbMode_musicofftopic`, `sbMode_filler`, `sbMode_hook`, `sbMode_preview`, `sbMode_highlight`, `enableMutedSegments`, `skipSegmentsOnce`, `sbFullVideoLabel`, `sbShowTimeWithSkips`

<a id="fn-pages-js-buildshortcutspage"></a>
**`buildShortcutsPage()`** · function, exported · L133–143

The Shortcuts page: one row per configurable key.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/panel/controls/cycle-row.js › createShortcutControl](#fn-controls-cycle-row-js-createshortcutcontrol)

<a id="fn-pages-js-builduitweakspage"></a>
**`buildUITweaksPage()`** · function, exported · L150–180

The UI Tweaks page: shelf opacity, previews, titles, rows ahead, Liquid Glass, the theme, and the emoji fix on webOS 3/4.

- **Calls:** [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/panel/controls/checkbox.js › createConfigCheckbox](#fn-controls-checkbox-js-createconfigcheckbox), [ui/panel/controls/cycle-row.js › createOpacityControl](#fn-controls-cycle-row-js-createopacitycontrol), [ui/panel/controls/cycle-row.js › createPreviewControl](#fn-controls-cycle-row-js-createpreviewcontrol), [ui/panel/controls/cycle-row.js › createThemeControl](#fn-controls-cycle-row-js-createthemecontrol), [ui/panel/controls/section.js › createSection](#fn-controls-section-js-createsection), [helpLine](#fn-pages-js-helpline)
- **Settings:** uses `videoShelfOpacity`, `forcePreviews`, `fixMultilineTitles`, `fixSearchFont`, `enableRowsAhead`, `removeBlackBorders`, `enableLegacyEmojiFix`

<a id="mod-panel-js"></a>

## ui/panel/panel.js

> The options panel: the container and its tab menu, showing and hiding it and keeping focus inside it.

285 lines · imports [core/config.js](core.md#mod-config-js), [core/page-state.js](core.md#mod-page-state-js), [features/sponsorblock/popup.js](features-sponsorblock.md#mod-popup-js), [ui/dom.js](ui.md#mod-dom-js), [ui/panel/pages.js](#mod-pages-js), [ui/panel/keyboard.js](#mod-keyboard-js), [ui/panel/focus-trap.js](#mod-focus-trap-js), [core/log.js](core.md#mod-log-js), [ui/shortcuts/bindings.js](ui-shortcuts.md#mod-bindings-js) · imported by [ui/shortcuts/actions.js](ui-shortcuts.md#mod-actions-js), [ui/shortcuts/router.js](ui-shortcuts.md#mod-router-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="fn-panel-js-createdeferredbuilder"></a>
**`createDeferredBuilder(pages, container)`** · function · L34–63

The pages, built lazily into `container`: `elements[i]` is page i once built, `ensure(i)` builds it now, `startDeferred()` builds the rest one per animation frame. A builder never runs twice.

- **Called by:** [createOptionsPanel](#fn-panel-js-createoptionspanel)

<a id="fn-panel-js-createdeferredbuilder-ensure"></a>
**`createDeferredBuilder.ensure(index)`** · arrow · L39–45

Builds page `index` now, if it is not built yet, and adds it to the panel.

- **Called by:** [createDeferredBuilder.startDeferred.step](#fn-panel-js-createdeferredbuilder-startdeferred-step)

<a id="fn-panel-js-createdeferredbuilder-startdeferred"></a>
**`createDeferredBuilder.startDeferred()`** · arrow · L50–61

Builds the pages not built yet, one per animation frame, so opening the panel does not wait for all of them.

- **Calls:** [createDeferredBuilder.startDeferred.step](#fn-panel-js-createdeferredbuilder-startdeferred-step)
- **Browser:** `requestAnimationFrame`

<a id="fn-panel-js-createdeferredbuilder-startdeferred-step"></a>
**`createDeferredBuilder.startDeferred.step()`** · arrow · L54–59

Builds the next unbuilt page and asks for another frame.

- **Calls:** [createDeferredBuilder.ensure](#fn-panel-js-createdeferredbuilder-ensure)
- **Called by:** [createDeferredBuilder.startDeferred](#fn-panel-js-createdeferredbuilder-startdeferred)
- **Browser:** `requestAnimationFrame`

<a id="fn-panel-js-createtabmenu"></a>
**`createTabMenu(pages, onPick, activeIndex)`** · function · L70–95

The tab bar: a button per page, the first one active; `onPick(index)` on a click, and the pointer leaving the bar puts focus back on the open tab (`activeIndex()`). Returns the bar and its buttons.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [createOptionsPanel](#fn-panel-js-createoptionspanel)

<a id="fn-panel-js-isoptionspanelvisible"></a>
**`isOptionsPanelVisible()`** · function, exported · L104–106

Whether the options panel is currently shown.

- **Called by:** [ui/shortcuts/actions.js › ACTIONS.config_menu.run](ui-shortcuts.md#fn-actions-js-actions-config-menu-run), [ui/shortcuts/router.js › onKeyDown](ui-shortcuts.md#fn-router-js-onkeydown)

<a id="fn-panel-js-createheading"></a>
**`createHeading(afterToggle)`** · function · L114–142

The heading with the logo. A logo click (a Magic Remote pointer affordance; the logo is not in the focus order) flips the theme and hands focus back through `afterToggle`; the UI Theme row on the UI Tweaks page is the key path. There is one drawn logo per look (blue, red, dark): the &lt;html> theme classes pick the one shown (panel.css, theme-red.css, theme-oled.css). A CSS filter on the blue image came out orange for red and too bright for OLED.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [createHeading.logo](#fn-panel-js-createheading-logo)
- **Called by:** [createOptionsPanel](#fn-panel-js-createoptionspanel)

<a id="fn-panel-js-createheading-toggletheme"></a>
**`createHeading.toggleTheme()`** · arrow · L116–121

Switches to the next UI theme (a click on the logo).

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite)
- **Settings:** reads `uiTheme`; writes `uiTheme`

<a id="fn-panel-js-createheading-logo"></a>
**`createHeading.logo(src, variant)`** · arrow · L126–133

One of the heading's logos (one per theme; CSS shows the current one); a click switches the theme.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement)
- **Called by:** [createHeading](#fn-panel-js-createheading)

<a id="fn-panel-js-createoptionspanel"></a>
**`createOptionsPanel()`** · function · L148–226

Builds the options panel: heading, tab bar, the Main page (the others are built later), the keyboard handler and the focus trap. Returns the element and its controls.

- **Calls:** [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/panel/focus-trap.js › createFocusTrap](#fn-focus-trap-js-createfocustrap), [ui/panel/keyboard.js › createPanelKeyboard](#fn-keyboard-js-createpanelkeyboard), [createDeferredBuilder](#fn-panel-js-createdeferredbuilder), [createHeading](#fn-panel-js-createheading), [createOptionsPanel.setActivePage](#fn-panel-js-createoptionspanel-setactivepage), [createTabMenu](#fn-panel-js-createtabmenu), [showOptionsPanel](#fn-panel-js-showoptionspanel)
- **Called by:** [showOptionsPanel](#fn-panel-js-showoptionspanel)

<a id="fn-panel-js-createoptionspanel-syncpopup"></a>
**`createOptionsPanel.syncPopup()`** · arrow · L161–161

Shows the SponsorBlock segment popup beside the panel while its page is open on a watch page.

- **Calls:** [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage)
- **Called by:** [createOptionsPanel.setActivePage](#fn-panel-js-createoptionspanel-setactivepage)

<a id="fn-panel-js-createoptionspanel-setactivepage"></a>
**`createOptionsPanel.setActivePage(pageIndex)`** · arrow · L167–185

Shows page `pageIndex` (building it first if needed), marks its tab, and moves the focus into it unless the user is on the tab bar.

- **Calls:** [ui/panel/keyboard.js › pageFocusables](#fn-keyboard-js-pagefocusables), [createOptionsPanel.syncPopup](#fn-panel-js-createoptionspanel-syncpopup)
- **Called by:** [createOptionsPanel](#fn-panel-js-createoptionspanel)

<a id="fn-panel-js-createoptionspanel-activetab"></a>
**`createOptionsPanel.activeTab()`** · property · L220–220

The tab button of the open page.

<a id="fn-panel-js-showoptionspanel"></a>
**`showOptionsPanel(visible)`** · function, exported · L232–278

Opens (building it the first time) or closes the options panel, with its keyboard handler, focus trap and popup. Toggles are ignored for 500 ms after the first build.

- **Calls:** [createOptionsPanel](#fn-panel-js-createoptionspanel), [ui/shortcuts/bindings.js › ensureMenuKey](ui-shortcuts.md#fn-bindings-js-ensuremenukey)
- **Called by:** [createOptionsPanel](#fn-panel-js-createoptionspanel), [ui/shortcuts/actions.js › ACTIONS.config_menu.run](ui-shortcuts.md#fn-actions-js-actions-config-menu-run)
- **Browser:** `setTimeout`

<a id="fn-panel-js-window-ytaf-paneltakestoggles"></a>
**`window.ytaf_panelTakesToggles()`** · assigned · L285–285

Test hook: whether the panel takes toggles again (the first build's 500 ms block is over).
