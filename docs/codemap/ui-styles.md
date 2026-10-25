# Code map: ui/styles/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [ui/styles/html-classes.js](#mod-html-classes-js)

<a id="mod-html-classes-js"></a>

## ui/styles/html-classes.js

> The state of the UI as classes on &lt;html>: the theme, OLED-care mode and the UI tweaks, each driven by a setting. The stylesheets (global.css, the panel, the toasts, the clock's watch.css, theme-red.css, theme-oled.css) select on these classes, so a change of setting is one class toggle and no element is touched.
>
> On documentElement rather than body: YouTube's leanback app rewrites body.className on tab navigation and panel dialogs and would wipe a body class.

72 lines · imports [core/config.js](core.md#mod-config-js), [core/dom.js](core.md#mod-dom-js) · imported by [ui/index.js](ui.md#mod-index-js)

**At load:**

- **Settings:** uses `fixMultilineTitles`, `fixSearchFont`, `removeBlackBorders`, `uiTheme`, `enableOledCareMode`, `videoShelfOpacity`

<a id="fn-html-classes-js-read"></a>
**`read(keys)`** · arrow · L31–35

The current values of `keys`, as an object.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [initHtmlClasses.sync](#fn-html-classes-js-inithtmlclasses-sync)

<a id="fn-html-classes-js-syncoledshelfopacity"></a>
**`syncOledShelfOpacity()`** · function · L43–53

The shelf backdrop's opacity, written as a rule of its own rather than a custom property: Chromium 38 (webOS 3) has no var(). Written only while OLED-care mode is on: the rule selects on html.ytaf-oled, so without the mode it would be a stylesheet for nothing.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread)
- **Called by:** [initHtmlClasses](#fn-html-classes-js-inithtmlclasses)
- **Settings:** reads `enableOledCareMode`, `videoShelfOpacity`

<a id="fn-html-classes-js-inithtmlclasses"></a>
**`initHtmlClasses()`** · function, exported · L59–72

Sets every class of HTML_CLASSES on &lt;html> from its settings and keeps it in step, and writes the OLED shelf opacity rule.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [core/dom.js › debounce](core.md#fn-dom-js-debounce), [initHtmlClasses.sync](#fn-html-classes-js-inithtmlclasses-sync), [syncOledShelfOpacity](#fn-html-classes-js-syncoledshelfopacity)
- **Called by:** [ui/index.js (at load)](ui.md#mod-index-js)
- **Settings:** listens to `enableOledCareMode`, `videoShelfOpacity`

<a id="fn-html-classes-js-inithtmlclasses-sync"></a>
**`initHtmlClasses.sync()`** · arrow · L63–63

Sets or removes one class from the current values of its settings.

- **Calls:** [read](#fn-html-classes-js-read)
- **Called by:** [initHtmlClasses](#fn-html-classes-js-inithtmlclasses)
