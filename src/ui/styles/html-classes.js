// The state of the UI as classes on <html>: the theme, OLED-care mode and the
// UI tweaks, each driven by a setting. The stylesheets (global.css, the panel,
// the toasts, the clock's watch.css, theme-red.css, theme-oled.css) select on
// these classes, so a change of setting is one class toggle and no element is
// touched.
//
// On documentElement rather than body: YouTube's leanback app rewrites
// body.className on tab navigation and panel dialogs and would wipe a body
// class.
import { configRead, configAddChangeListener } from '../../core/config.js';
import { debounce } from '../../core/dom.js';
import './global.css';
import './theme-red.css';
import './theme-oled.css';

// The class, the settings it follows, and whether it is on.
const HTML_CLASSES = [
  { cls: 'ytaf-fix-titles', keys: ['fixMultilineTitles'], on: (c) => !!c.fixMultilineTitles },
  { cls: 'ytaf-fix-search-font', keys: ['fixSearchFont'], on: (c) => !!c.fixSearchFont },
  { cls: 'ytaf-remove-borders', keys: ['removeBlackBorders'], on: (c) => !!c.removeBlackBorders },
  { cls: 'ytaf-theme-red', keys: ['uiTheme'], on: (c) => c.uiTheme === 'classic-red' },
  { cls: 'ytaf-oled', keys: ['enableOledCareMode'], on: (c) => !!c.enableOledCareMode },
  {
    cls: 'ytaf-oled-transparent-shelf',
    keys: ['enableOledCareMode', 'videoShelfOpacity'],
    on: (c) => !!c.enableOledCareMode && c.videoShelfOpacity > 50
  }
];

/** The current values of `keys`, as an object. */
const read = (keys) => {
  const values = {};
  for (const key of keys) values[key] = configRead(key);
  return values;
};

/**
 * The shelf backdrop's opacity, written as a rule of its own rather than a
 * custom property: Chromium 38 (webOS 3) has no var(). Written only while
 * OLED-care mode is on: the rule selects on html.ytaf-oled, so without the
 * mode it would be a stylesheet for nothing.
 */
function syncOledShelfOpacity() {
  if (!configRead('enableOledCareMode')) return;
  let style = document.getElementById('ytaf-oled-opacity');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ytaf-oled-opacity';
    document.head.appendChild(style);
  }
  const opacity = configRead('videoShelfOpacity') / 100;
  style.textContent = `html.ytaf-oled .Jx9xPc { background-color: rgba(0, 0, 0, ${opacity}) !important; }`;
}

/**
 * Sets every class of HTML_CLASSES on <html> from its settings and keeps it in step, and writes the
 * OLED shelf opacity rule.
 */
export function initHtmlClasses() {
  const root = document.documentElement;
  for (const { cls, keys, on } of HTML_CLASSES) {
    /** Sets or removes one class from the current values of its settings. */
    const sync = () => root.classList.toggle(cls, on(read(keys)));
    sync();
    for (const key of keys) configAddChangeListener(key, sync);
  }
  syncOledShelfOpacity();
  configAddChangeListener('enableOledCareMode', syncOledShelfOpacity);
  // The opacity row steps in 5 % increments: a held key is one rewrite of the
  // rule (a style recalc), not one per step.
  configAddChangeListener('videoShelfOpacity', debounce(syncOledShelfOpacity, 150));
}
