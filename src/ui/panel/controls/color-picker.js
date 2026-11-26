// The colour picker beside a SponsorBlock category row: a reset button and
// the native colour input, bound to the category's colour key.
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDefault
} from '../../../core/config.js';
import { createElement } from '../../dom.js';

/**
 * A colour input and an R (reset to default) button for colour setting `colorKey`; it follows
 * changes made elsewhere.
 */
export function createColorPicker(colorKey) {
  const resetButton = createElement('button', {
    text: 'R',
    class: 'ytaf-color-reset',
    tabIndex: -1,
    events: {
      click: (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        configWrite(colorKey, configGetDefault(colorKey));
      }
    }
  });
  const colorInput = createElement('input', {
    type: 'color',
    value: configRead(colorKey),
    tabIndex: -1,
    events: {
      click: (evt) => {
        evt.stopPropagation();
      },
      input: (evt) => configWrite(colorKey, evt.target.value)
    }
  });

  // The SponsorBlock handler listens to the colour keys itself and redraws.
  configAddChangeListener(colorKey, (evt) => {
    colorInput.value = evt.detail.newValue;
  });
  return createElement('div', { class: 'ytaf-color-picker' }, resetButton, colorInput);
}
