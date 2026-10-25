// The left/right cycle rows, each bound to a config key, and the rows built
// from them for particular settings. Every control registers its config
// listeners once and never removes them: the panel is built once and lives
// for the session.
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc,
  segmentTypes,
  shortcutActions,
  sbModes,
  sbModesHighlight,
  forcePreviewModes,
  logoStyles,
  thumbnailQualityModes,
  videoCodecModes,
  uiThemes
} from '../../../core/config.js';
import { REMOTE_KEYS } from '../../../core/remote.js';
import { createElement } from '../../dom.js';
import { createColorPicker } from './color-picker.js';
import { setUnavailable } from './checkbox.js';

/**
 * A focusable row: the label on the left, `< value >` on the right. Left and
 * Right (and a click on the row) step the value; the arrows are clickable
 * too. Enter is the panel's: its keyboard handler clicks the focused row.
 * Returns the row and the function that refreshes its value.
 */
function createControlRow(
  labelText,
  displayValueGetter,
  stepLeft,
  stepRight,
  extraElements = null
) {
  const valueText = createElement('span', { class: 'ytaf-value' });

  /** Shows the current value. */
  const updateDisplay = () => (valueText.textContent = displayValueGetter());

  // A row greyed out by setUnavailable() (controls/checkbox.js) steps nothing,
  // whether by key or by a pointer click.
  let container = null;

  /**
   * Whether the row is greyed out (setUnavailable): a greyed-out row steps nothing, by key or by
   * pointer.
   */
  const unavailable = () => !!container && container.classList.contains('ytaf-unavailable');

  /** Steps the value back, unless the row is greyed out. */
  const onLeft = () => {
    if (!unavailable()) stepLeft();
  };
  /** Steps the value forward, unless the row is greyed out. */
  const onRight = () => {
    if (!unavailable()) stepRight();
  };

  /** A clickable < or > arrow for the pointer (Magic Remote). */
  const arrow = (text, onPress) =>
    createElement('span', {
      text,
      class: 'ytaf-arrow',
      events: {
        click: (e) => {
          e.stopPropagation();
          onPress();
        }
      }
    });
  const valueContainer = createElement(
    'div',
    { class: 'ytaf-cycle-value' },
    arrow('<', onLeft),
    valueText,
    arrow('>', onRight)
  );
  if (extraElements) valueContainer.appendChild(extraElements);

  container = createElement(
    'div',
    {
      class: 'ytaf-cycle-row',
      tabIndex: 0,
      events: {
        keydown: (e) => {
          const code = e.keyCode;
          if (code === REMOTE_KEYS.LEFT.code) {
            onLeft();
          } else if (code === REMOTE_KEYS.RIGHT.code) {
            onRight();
          } else {
            return;
          }
          e.stopPropagation();
          e.preventDefault();
        },
        click: () => onRight()
      }
    },
    createElement('span', { text: labelText, class: 'ytaf-cycle-label' }),
    valueContainer
  );

  return { container, updateDisplay };
}

/** A row that cycles `configKey` through `modes`; `displayMap` turns a mode into its label. */
function createCycleControl(configKey, labelText, modes, displayMap = null, extraElements = null) {
  /** The label of the setting's current value (the value itself when the map has none). */
  const displayValue = () => {
    const value = configRead(configKey);
    return (displayMap && displayMap[value]) || value;
  };
  /** Writes the next (step 1) or previous (-1) value in `modes`, wrapping around. */
  const cycle = (step) => {
    const idx = Math.max(0, modes.indexOf(configRead(configKey)));
    configWrite(configKey, modes[(idx + step + modes.length) % modes.length]);
  };

  const { container, updateDisplay } = createControlRow(
    labelText,
    displayValue,
    () => cycle(-1),
    () => cycle(1),
    extraElements
  );

  configAddChangeListener(configKey, updateDisplay);
  updateDisplay();
  return container;
}

/**
 * A cycle row that sits among checkbox rows. Its label is indented by one
 * checkbox (the ytaf-aligned rule in controls.css) and starts with the same
 * no-break space the checkbox labels use, so the text lines up with them.
 */
function createAlignedCycleControl(configKey, displayMap) {
  const control = createCycleControl(
    configKey,
    `\u00A0${configGetDesc(configKey)}`,
    Object.keys(displayMap),
    displayMap
  );
  control.classList.add('ytaf-aligned');
  return control;
}

/** The YouTube Logo row (Default, Premium, Hidden). */
export const createLogoControl = () => createAlignedCycleControl('logoStyle', logoStyles);

/** The Force Video Codec row. */
export const createVideoCodecControl = () =>
  createAlignedCycleControl('forceVideoCodec', videoCodecModes);

/** The UI Theme row. */
export const createThemeControl = () => createAlignedCycleControl('uiTheme', uiThemes);

/** The Thumbnail Strategy row, greyed out while Max Thumbnail Quality is off. */
export function createThumbnailQualityControl() {
  const control = createAlignedCycleControl('thumbnailQualityMode', thumbnailQualityModes);
  // The strategy only means anything while the feature it tunes is on.
  const sync = () => setUnavailable(control, !configRead('upgradeThumbnails'));
  configAddChangeListener('upgradeThumbnails', sync);
  sync();
  return control;
}

/**
 * The row of one SponsorBlock category (`sbMode_<category>`): its modes, with the category's colour
 * picker.
 */
export function createSegmentControl(key) {
  const isHighlight = key === 'sbMode_highlight';
  const modesMap = isHighlight ? sbModesHighlight : sbModes;
  const category = isHighlight ? 'poi_highlight' : key.replace('sbMode_', '');
  const picker = segmentTypes[category] ? createColorPicker(`${category}Color`) : null;
  return createCycleControl(key, configGetDesc(key), Object.keys(modesMap), modesMap, picker);
}

/** The row of one shortcut key (0-9, red, green, blue): the action it runs. */
export function createShortcutControl(keyIdentifier) {
  const configKey = `shortcut_key_${keyIdentifier}`;
  const actions = Object.keys(shortcutActions);
  return createCycleControl(configKey, configGetDesc(configKey), actions, shortcutActions);
}

/** The Force Previews row (Disabled, Force On, Force Off). */
export function createPreviewControl(key) {
  return createCycleControl(
    key,
    configGetDesc(key),
    Object.keys(forcePreviewModes),
    forcePreviewModes
  );
}

/**
 * A 0-100 % row in steps of 5 for setting `key` (the video shelf opacity), greyed out while
 * OLED-Care Mode is off.
 */
export function createOpacityControl(key) {
  const step = 5;
  const min = 0;
  const max = 100;

  /** Adds `delta` to the stored value, kept within 0-100. */
  const changeValue = (delta) => {
    // Number(): a value stored as a string by an older build must not concatenate.
    configWrite(key, Math.min(max, Math.max(min, Number(configRead(key)) + delta)));
  };

  const { container, updateDisplay } = createControlRow(
    configGetDesc(key),
    () => `${configRead(key)}%`,
    () => changeValue(-step),
    () => changeValue(step)
  );

  configAddChangeListener(key, updateDisplay);
  updateDisplay();
  // The shelf opacity applies under OLED-Care Mode only (ui/styles/html-classes.js).
  const sync = () => setUnavailable(container, !configRead('enableOledCareMode'));
  configAddChangeListener('enableOledCareMode', sync);
  sync();
  return container;
}
