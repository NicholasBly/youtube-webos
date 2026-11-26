// A checkbox row bound to a config key, and greying a row out.
import {
  configAddChangeListener,
  configRead,
  configWrite,
  configGetDesc
} from '../../../core/config.js';
import { createElement } from '../../dom.js';

/**
 * A checkbox row for boolean setting `key`, labelled with its description; it writes the setting
 * when toggled and follows changes made elsewhere.
 */
export function createConfigCheckbox(key) {
  const elInput = createElement('input', {
    type: 'checkbox',
    checked: configRead(key),
    events: { change: (evt) => configWrite(key, evt.target.checked) }
  });

  const labelContent = createElement(
    'div',
    { class: 'ytaf-label-content' },
    elInput,
    `\u00A0${configGetDesc(key)}`
  );
  const elLabel = createElement('label', {}, labelContent);

  configAddChangeListener(key, (evt) => (elInput.checked = evt.detail.newValue));

  return elLabel;
}

/**
 * Greys a row out and drops it from the focus order, or restores it: the
 * setting it carries does nothing right now (Tracking Block without Ad
 * Blocking, the thumbnail strategy without the upgrade). Greyed out and kept
 * in place rather than hidden, so the user sees why and the rows below do not
 * jump.
 */
export function setUnavailable(row, on) {
  if (!row) return;
  row.classList.toggle('ytaf-unavailable', on);
  const input = row.querySelector('input');
  if (input) input.disabled = on;
  if (row.classList.contains('ytaf-cycle-row')) row.tabIndex = on ? -1 : 0;
}
