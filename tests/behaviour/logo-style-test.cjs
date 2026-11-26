/**
 * The YouTube wordmark selection (features/logo-style.js) against the built
 * bundle on both flavours. Premium and Hidden are a class on <html> that the
 * bundle's stylesheet keys !important rules on, so a header YouTube draws
 * again (after the profile picker, back from the background: issue #214)
 * takes them as well; Default leaves the header as YouTube draws it. The
 * element itself is never written to, and nothing searches for it. The header
 * markup is copied verbatim from a real webOS 25 capture.
 *
 * jsdom does not resolve the cascade, so the rules are checked as text here;
 * that they outrank YouTube's inline styles in a real engine is plain CSS
 * (an !important rule beats a normal inline declaration), and was checked in
 * Chromium.
 *
 * Run: node tests/behaviour/logo-style-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, cycleRow } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const PREMIUM_URL =
  'https://www.gstatic.com/youtube/img/branding/livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png';
const DEFAULT_URL =
  'https://www.gstatic.com/youtube/img/branding/livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png';

// Verbatim from the capture (the "Normal" variant).
const LOGO_STYLE = 'left: 66.375rem; width: 10.125rem;';
const LOGO_HTML =
  `<ytlr-logo-entity tabindex="-1" class="wnwire lJjg6 bYrvBd" style="${LOGO_STYLE}">` +
  '<ytlr-thumbnail-details tabindex="-1" class="cFXl0 XVmJGe cFrowd" ' +
  `style="background-image: url(&quot;${DEFAULT_URL}&quot;);"></ytlr-thumbnail-details></ytlr-logo-entity>`;

const HIDDEN_CLASS = 'ytaf-hide-logo';
const PREMIUM_CLASS = 'ytaf-premium-logo';
const LOGO_SELECTOR = 'ytlr-logo-entity';

/**
 * A browse page with the header markup given, or none; `lookups.n` counts the
 * bundle's searches for the header.
 */
function boot(cfg, extraHtml) {
  const lookups = { n: 0 };
  const page = createPage({
    html: `<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app>${extraHtml || ''}</ytlr-app></body></html>`,
    config: Object.assign({ logoStyle: 'default' }, cfg),
    setup(win) {
      const querySelector = win.document.querySelector;
      win.document.querySelector = function (selector) {
        if (selector === LOGO_SELECTOR) lookups.n++;
        return querySelector.call(this, selector);
      };
      const querySelectorAll = win.document.querySelectorAll;
      win.document.querySelectorAll = function (selector) {
        if (selector === LOGO_SELECTOR) lookups.n++;
        return querySelectorAll.call(this, selector);
      };
    }
  });
  return { win: page.win, lookups };
}

const has = (win, cls) => win.document.documentElement.classList.contains(cls);
/** The header's own inline styles, as YouTube drew them, or how they were changed. */
const header = (win) => {
  const logo = win.document.querySelector('ytlr-app ' + LOGO_SELECTOR);
  const image = logo && logo.querySelector('ytlr-thumbnail-details');
  return {
    logo: logo ? logo.getAttribute('style') : null,
    image: image ? image.getAttribute('style') : null
  };
};
const untouched = (h) => h.logo === LOGO_STYLE && h.image.indexOf(DEFAULT_URL) !== -1;
/** Every stylesheet the bundle put in the page, as one text with no spaces. */
const css = (win) =>
  Array.from(win.document.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n')
    .replace(/\s+/g, '');

(async () => {
  // ---- the rules the classes switch on --------------------------------------------
  {
    const { win } = boot({}, LOGO_HTML);
    // The bundle's stylesheet goes in once the bundle has run (core/styles.js).
    await wait(30);
    const text = css(win);
    t(
      'the stylesheet hides the logo under html.ytaf-hide-logo, !important',
      /ytaf-hide-logo[^{]*ytlr-logo-entity\{visibility:hidden!important\}/.test(text)
    );
    t(
      'under html.ytaf-premium-logo: the Premium left and width, !important',
      /ytaf-premium-logo[^{,]*ytlr-logo-entity\{left:65\.75rem!important;width:10\.75rem!important\}/.test(
        text
      ),
      text.slice(text.indexOf('ytaf-premium-logo') - 10, text.indexOf('ytaf-premium-logo') + 120)
    );
    t(
      'and the Premium wordmark on its image, !important',
      new RegExp(
        'ytaf-premium-logo[^{,]*ytlr-logo-entity[^{,]*ytlr-thumbnail-details\\{background-image:url\\([\'"]?' +
          PREMIUM_URL.replace(/[.?/]/g, '\\$&') +
          '[\'"]?\\)!important\\}'
      ).test(text)
    );
  }

  // ---- each style: its class, and the header left as YouTube drew it --------------
  for (const [style, premium, hidden] of [
    ['default', false, false],
    ['premium', true, false],
    ['hidden', false, true]
  ]) {
    const { win, lookups } = boot({ logoStyle: style }, LOGO_HTML);
    await wait(30);
    t(
      `[logo:${style}] premium class ${premium ? 'on' : 'off'}, hide class ${hidden ? 'on' : 'off'}`,
      has(win, PREMIUM_CLASS) === premium && has(win, HIDDEN_CLASS) === hidden
    );
    t(
      `[logo:${style}] the header's own styles are not written to`,
      untouched(header(win)),
      JSON.stringify(header(win))
    );
    t(`[logo:${style}] nothing searches for the header`, lookups.n === 0, String(lookups.n));
  }

  // ---- YouTube draws the header again: the style stays (issue #214) ----------------
  {
    const { win, lookups } = boot({ logoStyle: 'premium' }, '');
    await wait(30);
    t('[logo] no header yet: the class is on already', has(win, PREMIUM_CLASS));
    const app = win.document.querySelector('ytlr-app');
    app.innerHTML = LOGO_HTML;
    // The profile picker, or the app back from the background: a new header.
    win.document.body.className = 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR';
    app.innerHTML = '';
    await wait(30);
    win.document.body.className = 'WEB_PAGE_TYPE_BROWSE';
    app.innerHTML = LOGO_HTML;
    await wait(30);
    t(
      '[logo] a header drawn again still gets the Premium rules: the class stays on <html>',
      has(win, PREMIUM_CLASS) && !has(win, HIDDEN_CLASS)
    );
    t(
      '[logo] with no polling or page-change lookups behind it',
      lookups.n === 0,
      String(lookups.n)
    );
  }

  // ---- the setting changed at runtime -------------------------------------------
  {
    const { win } = boot({ logoStyle: 'default' }, LOGO_HTML);
    win.ytaf_showOptionsPanel(true);
    const row = cycleRow(win, 'YouTube Logo');
    t('setup: the YouTube Logo row reads Default', !!row && /Default/.test(row.textContent));

    row.click(); // Default -> Premium
    t(
      'Premium chosen at runtime: the premium class goes on at once',
      has(win, PREMIUM_CLASS) && !has(win, HIDDEN_CLASS)
    );

    row.click(); // Premium -> Hidden
    t(
      'Hidden chosen at runtime: the hide class replaces it',
      has(win, HIDDEN_CLASS) && !has(win, PREMIUM_CLASS)
    );

    row.click(); // Hidden -> Default
    t(
      'Default chosen at runtime: both classes come off',
      !has(win, HIDDEN_CLASS) && !has(win, PREMIUM_CLASS)
    );
    t('and the header was never written to', untouched(header(win)), JSON.stringify(header(win)));
  }

  report.finish();
})();
