/**
 * The YouTube wordmark selection (features/logo-style.js) against the built
 * bundle on both flavours: the default and Premium wordmarks with the left offset and
 * width each one needs, the hidden class, the bounded poll for a header that
 * has not painted yet (it stops once applied and after its 30 rounds, 15 s,
 * which a clock set ahead does not shorten), and
 * the setting changed at runtime through the options panel. The header markup
 * is copied verbatim from a real webOS 25 capture.
 *
 * Run: node tests/behaviour/logo-style-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, cycleRow, clock: shiftClock } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const PREMIUM_URL =
  'https://www.gstatic.com/youtube/img/branding/livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png';
const DEFAULT_URL =
  'https://www.gstatic.com/youtube/img/branding/livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png';

// Verbatim from the capture (the "Normal" variant).
const LOGO_HTML =
  '<ytlr-logo-entity tabindex="-1" class="wnwire lJjg6 bYrvBd" style="left: 66.375rem; width: 10.125rem;">' +
  '<ytlr-thumbnail-details tabindex="-1" class="cFXl0 XVmJGe cFrowd" ' +
  `style="background-image: url(&quot;${DEFAULT_URL}&quot;);"></ytlr-thumbnail-details></ytlr-logo-entity>`;

const HIDDEN_CLASS = 'ytaf-hide-logo';
const LOGO_SELECTOR = 'ytlr-logo-entity';

/**
 * A browse page with the header markup given, or none. The logo poll (500 ms)
 * runs at a tenth, or at `scale`. `clock.offset` ms are added to the page's
 * clocks (fixtures.cjs clock()), to show the poll does not follow them;
 * `lookups.n` counts the bundle's searches for the header, one per round of
 * the poll.
 */
function boot(cfg, extraHtml, scale) {
  let clock;
  const lookups = { n: 0 };
  const page = createPage({
    html: `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>${extraHtml || ''}</ytlr-app></body></html>`,
    config: Object.assign({ logoStyle: 'default' }, cfg),
    timers: { scale: scale || 10, from: 500 },
    setup(win) {
      clock = shiftClock(win);
      const querySelector = win.document.querySelector;
      win.document.querySelector = function (selector) {
        if (selector === LOGO_SELECTOR) lookups.n++;
        return querySelector.call(this, selector);
      };
    }
  });
  return { win: page.win, pump: page.pump, clock, lookups };
}

const logoOf = (win) => win.document.querySelector(LOGO_SELECTOR);
const imageUrl = (win) => {
  const img = win.document.querySelector('ytlr-thumbnail-details');
  return img ? img.style.backgroundImage : '';
};
const hidden = (win) => win.document.documentElement.classList.contains(HIDDEN_CLASS);

(async () => {
  // ---- each style applied to a header already on the page --------------------------
  for (const [style, expectUrl, expectLeft, expectWidth] of [
    ['default', DEFAULT_URL, '66.375rem', '10.125rem'],
    ['premium', PREMIUM_URL, '65.75rem', '10.75rem']
  ]) {
    // Applied while the bundle runs: the header is there at load.
    const { win } = boot({ logoStyle: style }, LOGO_HTML);
    const logo = logoOf(win);
    t(`[logo:${style}] correct wordmark`, imageUrl(win).indexOf(expectUrl) !== -1, imageUrl(win));
    t(`[logo:${style}] left repositioned`, logo.style.left === expectLeft, logo.style.left);
    t(
      `[logo:${style}] width matches the asset`,
      logo.style.width === expectWidth,
      logo.style.width
    );
    t(`[logo:${style}] not hidden`, !hidden(win));
  }
  {
    const { win } = boot({ logoStyle: 'hidden' }, LOGO_HTML);
    t('[logo:hidden] hide class applied', hidden(win));
    t(
      '[logo:hidden] the wordmark the app drew is left as it is',
      imageUrl(win).indexOf(DEFAULT_URL) !== -1 && logoOf(win).style.left === '66.375rem',
      imageUrl(win)
    );
  }

  // ---- a header that paints later: the poll applies it, then stops ----------------
  {
    const { win } = boot({ logoStyle: 'premium' }, '');
    await wait(50);
    t('[logo] nothing to apply to yet: no hide class, no error', !hidden(win));
    const app = win.document.querySelector('ytlr-app');
    app.innerHTML = LOGO_HTML;
    // The next round of the poll (50 ms here) applies it.
    await waitFor(() => imageUrl(win).indexOf(PREMIUM_URL) !== -1);
    t(
      '[logo] applied to a header that appears late',
      imageUrl(win).indexOf(PREMIUM_URL) !== -1,
      imageUrl(win)
    );
    // Once applied the poll is gone: a header change afterwards is not re-applied.
    const logo = logoOf(win);
    logo.style.left = '';
    // Two rounds of the poll, were it still running.
    await wait(100);
    t(
      '[logo] the poll stops once applied: a later change to the header is not re-applied',
      logo.style.left === '',
      logo.style.left
    );
  }

  // ---- the clock jumps ahead at the start: the poll still runs ----------------------
  {
    const { win, clock } = boot({ logoStyle: 'premium' }, '');
    // The TV sets its clock a minute ahead before the poll's first round.
    clock.offset = 60000;
    await wait(100);
    win.document.querySelector('ytlr-app').innerHTML = LOGO_HTML;
    await waitFor(() => imageUrl(win).indexOf(PREMIUM_URL) !== -1);
    t(
      '[logo] a clock set ahead at the start does not end the poll: the late header is styled',
      imageUrl(win).indexOf(PREMIUM_URL) !== -1,
      imageUrl(win)
    );
  }

  // ---- no header within the poll's 30 rounds: it gives up -------------------------
  {
    // At a 50th a round is a 10 ms timer, which the parallel suite stretches:
    // the rounds are waited for by count, the search at start and one per
    // round, then given room for one more.
    const { win, lookups } = boot({ logoStyle: 'premium' }, '', 50);
    t(
      '[logo] the poll searches for the header 30 times after the first try',
      await waitFor(() => lookups.n >= 31, 10000),
      String(lookups.n)
    );
    const searched = lookups.n;
    await wait(100);
    t('[logo] and then stops searching', lookups.n === searched, searched + ' then ' + lookups.n);
    const app = win.document.querySelector('ytlr-app');
    app.innerHTML = LOGO_HTML;
    await wait(250);
    t(
      '[logo] after its 30 rounds the poll has stopped: a header appearing later is left alone',
      imageUrl(win).indexOf(DEFAULT_URL) !== -1,
      imageUrl(win)
    );
    // An account picked late, a slow cold start: the next page change applies it.
    win.document.body.className = 'WEB_PAGE_TYPE_WATCH';
    await wait(50);
    t(
      '[logo] a page change after the poll applies the wordmark to the late header',
      imageUrl(win).indexOf(PREMIUM_URL) !== -1,
      imageUrl(win)
    );
    const logo = logoOf(win);
    logo.style.left = '';
    win.document.body.className = 'WEB_PAGE_TYPE_BROWSE';
    await wait(50);
    t('[logo] and only once: the next page change leaves it alone', logo.style.left === '');
  }

  // ---- the setting changed at runtime -------------------------------------------
  {
    const { win } = boot({ logoStyle: 'default' }, LOGO_HTML);
    win.ytaf_showOptionsPanel(true);
    const row = cycleRow(win, 'YouTube Logo');
    t('setup: the YouTube Logo row reads Default', !!row && /Default/.test(row.textContent));

    row.click(); // Default -> Premium
    const logo = logoOf(win);
    t(
      'Premium chosen at runtime: the wordmark is swapped at once',
      imageUrl(win).indexOf(PREMIUM_URL) !== -1,
      imageUrl(win)
    );
    t(
      'Premium chosen at runtime: left and width follow the asset',
      logo.style.left === '65.75rem' && logo.style.width === '10.75rem',
      logo.style.cssText
    );

    row.click(); // Premium -> Hidden
    t('Hidden chosen at runtime: the hide class goes on', hidden(win));

    row.click(); // Hidden -> Default
    t('Default chosen at runtime: the hide class comes off', !hidden(win));
    t(
      'Default chosen at runtime: the default wordmark, left and width are back',
      imageUrl(win).indexOf(DEFAULT_URL) !== -1 &&
        logo.style.left === '66.375rem' &&
        logo.style.width === '10.125rem',
      logo.style.cssText
    );
  }

  report.finish();
})();
