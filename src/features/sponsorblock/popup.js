// The SponsorBlock popup beside the options panel: the current video's
// segments, one row each with its category colour, name and time. The panel
// shows it on the SponsorBlock page of a watch page (ui/panel/panel.js).
import './popup.css';
import sponsorBlockIcon from './sponsorblock-icon.png';
import { categoryLabel } from './segments.js';
import { formatTime } from '../../core/text.js';
import { createElement } from '../../ui/dom.js';
import { categoryColor } from './constants.js';

class SponsorBlockUI {
  /** Hidden, with no segments; the popup element is built the first time it is shown. */
  constructor() {
    this.popup = null;
    this.visible = false;
    this.hasSegments = false;
    this.segments = [];
    // The rows are rebuilt from `segments` the next time the popup is shown.
    this.rowsStale = false;
  }

  /** Builds the popup (header and an empty list) and adds it to the page, once. */
  createPopup() {
    if (this.popup) return this.popup;
    // tabIndex -1: a Magic Remote click can put the focus here (ui/panel/keyboard.js).
    this.popup = createElement(
      'div',
      { class: 'sb-segments-popup', tabIndex: -1 },
      createElement(
        'div',
        { class: 'sb-popup-header' },
        createElement(
          'div',
          { class: 'sb-header-title-row' },
          createElement('img', {
            class: 'sb-header-icon',
            src: sponsorBlockIcon,
            alt: 'SponsorBlock'
          }),
          createElement('span', { class: 'sb-header-text', text: 'SponsorBlock' })
        ),
        createElement('div', {
          class: 'sb-header-subtitle',
          text: 'This video has segments in the database!'
        })
      ),
      createElement('div', { class: 'sb-list-container' })
    );
    document.body.appendChild(this.popup);
    return this.popup;
  }

  /** Remembers the list; the rows are built when the popup is shown, not per video. */
  updateSegments(segments) {
    this.segments = segments || [];
    this.hasSegments = this.segments.length > 0;
    this.rowsStale = true;
    if (!this.popup) return;
    if (this.visible && this.hasSegments) this.renderRows();
    else this.popup.classList.remove('visible');
  }

  /**
   * Rebuilds the list: one row per segment with its colour, label and time, then shows the popup.
   */
  renderRows() {
    this.rowsStale = false;
    const container = this.popup.querySelector('.sb-list-container');
    container.textContent = '';

    // Already in start-time order: the handler sorts its segments once. A
    // highlight is a point in time, the rest are ranges.
    this.segments.forEach((segment) => {
      const start = formatTime(segment.segment[0]);
      const time =
        segment.category === 'poi_highlight'
          ? start
          : `${start} to ${formatTime(segment.segment[1])}`;
      container.appendChild(
        createElement(
          'div',
          { class: 'sb-segment-row', tabIndex: -1 },
          createElement(
            'div',
            { class: 'sb-row-left' },
            createElement('div', {
              class: 'sb-segment-dot',
              style: { backgroundColor: categoryColor(segment.category, '#777') }
            }),
            createElement('span', {
              class: 'sb-segment-category',
              text: categoryLabel(segment.category)
            })
          ),
          createElement('span', { class: 'sb-segment-time', text: time })
        )
      );
    });
    this.popup.classList.add('visible');
  }

  /**
   * Shows or hides the popup (the options panel shows it beside the SponsorBlock page); shown only
   * while the video has segments.
   */
  togglePopup(visible) {
    this.visible = visible;
    if (visible && this.hasSegments) {
      if (!this.popup) this.createPopup();
      if (this.rowsStale) this.renderRows();
      else this.popup.classList.add('visible');
    } else if (this.popup) {
      this.popup.classList.remove('visible');
    }
  }
}

export default new SponsorBlockUI();
