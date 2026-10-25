// A titled group of rows. `variant` is an extra class on the section, used to
// opt a section into the two-column layout; sizing and spacing live in
// pages.css so the whole panel can be retuned in one place.
import { createElement } from '../../dom.js';

/**
 * A titled group of rows; `variant` adds a class (ytaf-section-2col lays the rows out in two
 * columns).
 */
export function createSection(title, elements, variant) {
  const heading = createElement('div', { text: title, class: 'ytaf-section-title' });
  return createElement(
    'div',
    { class: 'ytaf-settings-section' + (variant ? ' ' + variant : '') },
    heading,
    ...elements
  );
}
