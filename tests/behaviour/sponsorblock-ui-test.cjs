/**
 * SponsorBlock's readouts against the built bundle: the segment list popup on
 * the options panel, the title badge and skips-removed duration the handler
 * writes through labels.js, and the segment colours from the panel and the
 * config. The overlay on the progress bar is sponsorblock-bar-test.cjs.
 *
 * Run: node tests/behaviour/sponsorblock-ui-test.cjs [bundle]
 */
const { seg, sponsorBlockPage } = require('../harness/sponsorblock.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  KEYS,
  press,
  panelCheckbox,
  cycleRow,
  showPanel
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

/** The SponsorBlock page (harness/sponsorblock.cjs) with the readouts this script checks. */
function boot(segments, cfg, currentTime, options) {
  const page = sponsorBlockPage(segments, cfg, currentTime, options);
  const d = page.win.document;
  return Object.assign(page, {
    labelsCss: () => {
      const style = d.getElementById('sb-labels');
      return style ? style.textContent : null;
    },
    popup: () => d.querySelector('.sb-segments-popup'),
    tab: (index) => d.querySelectorAll('.ytaf-tab-btn')[index].click()
  });
}

(async () => {
  // ---- the segment list popup --------------------------------------------------------------
  {
    const p = boot(
      [seg('sponsor', 20, 30), seg('selfpromo', 0, 0, 'full'), seg('poi_highlight', 200, 200)],
      { sponsorColor: '#123456' },
      40
    );
    await p.ready();
    t('no popup before the panel shows it', !p.popup());
    await showPanel(p.win);
    t('the Main tab shows no popup', !p.popup() || !p.popup().classList.contains('visible'));
    p.tab(1);
    await wait(30);
    t(
      'the SponsorBlock tab shows the popup on a watch page',
      !!p.popup() && p.popup().classList.contains('visible')
    );
    const rows = () => Array.from(p.popup().querySelectorAll('.sb-segment-row'));
    t(
      'one row per segment, the full-video label left out',
      rows().length === 2,
      String(rows().length)
    );
    const text = (row, cls) => row.querySelector(cls).textContent;
    t(
      'a row names the category and its span',
      text(rows()[0], '.sb-segment-category') === 'Sponsor' &&
        text(rows()[0], '.sb-segment-time') === '0:20 to 0:30',
      rows()[0].textContent
    );
    t(
      'a highlight row shows one timestamp',
      text(rows()[1], '.sb-segment-category') === 'Highlight' &&
        text(rows()[1], '.sb-segment-time') === '3:20',
      rows()[1].textContent
    );
    t(
      'the dot takes the colour from the settings',
      rows()[0].querySelector('.sb-segment-dot').style.backgroundColor === 'rgb(18, 52, 86)',
      rows()[0].querySelector('.sb-segment-dot').style.backgroundColor
    );
    t(
      'a category without a custom colour takes its default',
      rows()[1].querySelector('.sb-segment-dot').style.backgroundColor === 'rgb(255, 22, 132)',
      rows()[1].querySelector('.sb-segment-dot').style.backgroundColor
    );
    const firstRow = rows()[0];
    p.tab(0);
    t('back on the Main tab the popup hides', !p.popup().classList.contains('visible'));
    p.tab(1);
    t(
      'shown again without rebuilding the rows',
      p.popup().classList.contains('visible') && rows()[0] === firstRow
    );
    p.win.ytaf_showOptionsPanel(false);
    t('closing the panel hides the popup', !p.popup().classList.contains('visible'));
    await showPanel(p.win);
    t(
      'reopened on the SponsorBlock tab the popup is back',
      p.popup().classList.contains('visible')
    );
    p.win.ytaf_showOptionsPanel(false);
    p.win.location.hash = '#/';
    await waitFor(() => p.sb() === null);
    await showPanel(p.win);
    t(
      'off the watch page, with the handler gone, the popup stays hidden',
      !p.popup().classList.contains('visible') && p.sb() === null
    );
    p.win.ytaf_showOptionsPanel(false);
  }
  {
    // A Magic Remote click put the focus in the popup; the panel closes.
    const p = boot([seg('sponsor', 20, 30)], {}, 40);
    await p.ready();
    await showPanel(p.win);
    p.tab(1);
    await wait(30);
    p.popup().focus();
    t('setup: the popup has the focus', p.win.document.activeElement === p.popup());
    p.win.ytaf_showOptionsPanel(false);
    t(
      'closing the panel takes the focus out of the hidden popup too',
      p.win.document.activeElement !== p.popup(),
      String(p.win.document.activeElement && p.win.document.activeElement.className)
    );
  }
  {
    const p = boot([seg('selfpromo', 0, 0, 'full')], {}, 40);
    await p.ready();
    await showPanel(p.win);
    p.tab(1);
    await wait(30);
    t(
      'a video with only a full-video label has no list to show',
      !p.popup() || !p.popup().classList.contains('visible')
    );
  }
  {
    // The next video starts while the panel stays open on the SponsorBlock tab.
    const next = 'nextVideo01';
    const p = boot([seg('sponsor', 20, 30)], {}, 40, { alsoFor: [next] });
    await p.ready();
    await showPanel(p.win);
    p.tab(1);
    await wait(30);
    t('setup: the popup is shown', !!p.popup() && p.popup().classList.contains('visible'));
    p.win.location.hash = '#/watch?v=' + next;
    await waitFor(() => p.sb() && p.sb().videoID === next && p.sb().segments.length > 0);
    await wait(30);
    t(
      "the next video's segments show in the popup the panel still asks for",
      p.sb() && p.sb().videoID === next && p.popup().classList.contains('visible'),
      p.sb() && p.sb().videoID
    );
    p.win.ytaf_showOptionsPanel(false);
  }

  // ---- a category's mode changed on the panel while the video plays ----
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 10);
    await p.ready();
    await showPanel(p.win);
    p.tab(1);
    const row = cycleRow(p.win, 'Sponsor', '#ytaf-page-sponsor');
    row.focus();
    // Auto Skip, then Manual Skip.
    press(p.win, KEYS.RIGHT, row);
    t(
      'setup: Sponsor set to Manual Skip on the panel',
      row.querySelector('.ytaf-value').textContent === 'Manual Skip',
      row.querySelector('.ytaf-value').textContent
    );
    p.win.ytaf_showOptionsPanel(false);
    p.timeupdate(21);
    await wait(40);
    t(
      'the change takes effect at once: the segment is offered, not skipped',
      p.model.currentTime === 21 && p.toasts().some((m) => m === 'Sponsored: Press Blue to skip'),
      p.model.currentTime + ' / ' + p.toasts().join(' | ')
    );
  }

  // ---- the labels through the handler ----------------------------------------------------------
  {
    const p = boot(
      [seg('sponsor', 0, 0, 'full'), seg('sponsor', 20, 30)],
      { sbFullVideoLabel: true, sbShowTimeWithSkips: true },
      40,
      { duration: 250 }
    );
    await p.ready();
    const css = () => p.labelsCss() || '';
    t(
      'a full-video sponsor label becomes the title badge',
      css().indexOf('content:"Sponsor"') !== -1 && css().indexOf('background-color:#00d400') !== -1,
      css()
    );
    t(
      'the duration under the seek bar gets the time with the skip removed (250 - 10)',
      css().indexOf('content:"(4:00)"') !== -1,
      css()
    );
    t(
      'the full-video label is not drawn on the bar',
      !!p.overlay() && p.overlay().children.length === 1,
      p.overlay() && String(p.overlay().children.length)
    );
    p.durationchange(100);
    await wait(30);
    t(
      'durationchange recomputes the time (100 - 10)',
      css().indexOf('content:"(1:30)"') !== -1 && css().indexOf('(4:00)') === -1,
      css()
    );
    await showPanel(p.win);
    const box = panelCheckbox(p.win, 'Show time with skips removed');
    t('the time option is on the panel, checked', !!box && box.checked === true);
    box.click();
    await wait(30);
    t(
      'switching the time option off withdraws its rule and keeps the badge',
      css().indexOf('::after') === -1 && css().indexOf('content:"Sponsor"') !== -1,
      css()
    );
    p.win.ytaf_showOptionsPanel(false);
    p.win.location.hash = '#/';
    await waitFor(() => p.labelsCss() === '');
    t('leaving the video clears the labels', p.labelsCss() === '', String(p.labelsCss()));
  }
  {
    const p = boot([seg('sponsor', 0, 0, 'full'), seg('sponsor', 20, 30)], {}, 40);
    await p.ready();
    t('with both label options off nothing is written', p.labelsCss() === null);
  }

  {
    // exclusive_access is a full-video label only: a badge, nothing to skip or draw.
    const p = boot(
      [seg('exclusive_access', 0, 0, 'full'), seg('sponsor', 20, 30)],
      { sbFullVideoLabel: true },
      0
    );
    await p.ready();
    const css = p.labelsCss() || '';
    t(
      'an exclusive-access label becomes the title badge, in its own colour',
      css.indexOf('content:"Exclusive Access"') !== -1 && css.indexOf('#008a5c') !== -1,
      css
    );
    t('nothing is skipped for it at the start', p.seeks.length === 0, p.seeks.join(','));
    t(
      'only the sponsor is drawn',
      !!p.overlay() && p.overlay().children.length === 1,
      p.overlay() && String(p.overlay().children.length)
    );
  }

  // ---- a colour change through the panel redraws the overlay; the popup keeps the panel's keys ----
  {
    const p = boot([seg('sponsor', 20, 30)], {}, 0);
    await p.ready();
    const d = p.win.document;
    const mark = () => d.querySelector('#previewbar .previewbar');
    t(
      'setup: the sponsor segment is drawn in its default colour',
      !!mark() && mark().style.backgroundColor === 'rgb(0, 212, 0)',
      mark() && mark().style.cssText
    );
    await showPanel(p.win);
    p.tab(1);
    const row = cycleRow(p.win, 'Sponsor', '#ytaf-page-sponsor');
    const input = row.querySelector('input[type="color"]');
    const before = { overlay: p.overlay(), mark: mark() };
    input.value = '#123456';
    input.dispatchEvent(new p.win.Event('input', { bubbles: true }));
    await wait(50);
    t(
      'a new colour redraws the overlay mark in that colour',
      !!mark() && mark().style.backgroundColor === 'rgb(18, 52, 86)',
      mark() && mark().style.cssText
    );
    // The picker sends a change per step of a drag: the marks are recoloured, not rebuilt.
    t(
      'the colour is changed on the marks in place: same overlay, same mark',
      p.overlay() === before.overlay && mark() === before.mark
    );
    row.querySelector('.ytaf-color-reset').click();
    await wait(50);
    t(
      'the reset redraws it in the default again',
      !!mark() && mark().style.backgroundColor === 'rgb(0, 212, 0)',
      mark() && mark().style.cssText
    );

    // A Magic Remote click puts focus in the segment popup: the keys stay the panel's.
    const popupRow = d.querySelector('.sb-segments-popup .sb-segment-row');
    t('setup: the popup lists the segment', !!popupRow);
    popupRow.focus();
    const down = press(p.win, KEYS.DOWN, popupRow);
    t("Down with focus in the popup is the panel's, not YouTube's", down.defaultPrevented);
    // The panel ignores toggles for 500 ms (100 here) after its first build.
    await waitFor(() => p.win.ytaf_panelTakesToggles(), 10000);
    const back = press(p.win, KEYS.BACK, popupRow);
    t(
      'Back with focus in the popup closes the panel',
      back.defaultPrevented && d.querySelector('.ytaf-ui-container').style.display === 'none'
    );
  }

  // ---- the interaction, non-music and hook categories: their colours ----
  {
    const p = boot(
      [seg('interaction', 10, 20), seg('musicofftopic', 30, 40), seg('hook', 50, 60)],
      {},
      0
    );
    await p.ready();
    const marks = () => Array.from(p.overlay().children).map((m) => m.style.backgroundColor);
    t(
      'the three categories are drawn in their own colours',
      !!p.overlay() && marks().join('|') === 'rgb(204, 0, 255)|rgb(255, 153, 0)|rgb(57, 86, 153)',
      p.overlay() && marks().join('|')
    );
    await showPanel(p.win);
    p.tab(1);
    await wait(30);
    const dots = () =>
      Array.from(p.popup().querySelectorAll('.sb-segment-row .sb-segment-dot')).map(
        (d) => d.style.backgroundColor
      );
    t(
      'the popup lists them with dots in the same colours',
      !!p.popup() && dots().join('|') === 'rgb(204, 0, 255)|rgb(255, 153, 0)|rgb(57, 86, 153)',
      p.popup() && dots().join('|')
    );
  }

  // ---- every category's colour key in the config reaches its mark ----
  {
    // Ten categories, each set to its own colour and to a mode that draws it.
    const cats = [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'musicofftopic',
      'preview',
      'filler',
      'hook'
    ];
    const cfg = { sbMode_highlight: 'ask', poi_highlightColor: '#0a0a0a' };
    const segments = cats.map((c, i) => {
      cfg[c + 'Color'] =
        '#' +
        String(i + 1)
          .repeat(6)
          .slice(0, 6);
      cfg['sbMode_' + c] = 'seek_bar';
      return seg(c, 10 + i * 20, 20 + i * 20);
    });
    segments.push(seg('poi_highlight', 250, 250));
    const p = boot(segments, cfg, 0);
    await p.ready();
    const hex = (rgb) =>
      '#' +
      rgb
        .match(/\d+/g)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('');
    const marks = p.overlay()
      ? Array.from(p.overlay().children).map((m) => hex(m.style.backgroundColor))
      : [];
    const want = cats.map((c) => cfg[c + 'Color']).concat(['#0a0a0a']);
    t(
      'each of the ten colour keys colours its category on the bar',
      marks.join('|') === want.join('|'),
      marks.join('|') + ' / want ' + want.join('|')
    );
  }

  report.finish();
})();
