/**
 * Arrow-key navigation inside the options panel, against the built bundle on
 * both flavours: the panel's own focus movement (ui/panel/keyboard.js) must pick the
 * neighbour a user expects on screen, wrap the tab bar, return to the open tab
 * from the page, ignore the hidden pages, leave Left and Right to the cycle
 * rows, and close on Back and Escape.
 *
 * jsdom has no layout, so getBoundingClientRect is stubbed with a deterministic
 * grid from data-x/data-y/data-w/data-h attributes that the test assigns to the
 * panel's controls: the tab buttons in one row, the two-column section in two
 * columns, every other row full width, and a checkbox a small square at the
 * left of its label row, as on the TV.
 *
 * Run: node tests/behaviour/panel-navigation-test.cjs [bundle] [legacy|modern]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, KEYS, press: pressOn, place } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const { win, pump } = createPage({
  config: { upgradeThumbnails: true },
  fetch: false,
  // The panel ignores toggles for 500 ms after its first build: 50 ms here.
  timers: { scale: 10, from: 500 },
  layout: 'grid'
});
const d = win.document;
const press = (code, target) => pressOn(win, code, target);

/**
 * Lays a page out: two-column rows side by side, everything else full width.
 * A checkbox's row is its label; the box itself is 18 px square at the row's left.
 */
function layoutPage(page) {
  const controls = page.querySelectorAll('input, .ytaf-cycle-row, button');
  let row = 0;
  let col = 0;
  const placeRow = (el, x, y, w) => {
    const label = el.tagName === 'INPUT' ? el.closest('label') : null;
    if (!label) {
      place(el, x, y, w, 80);
      return;
    }
    place(label, x, y, w, 80);
    place(el, x + 10, y + 31, 18, 18);
  };
  for (let i = 0; i < controls.length; i++) {
    const el = controls[i];
    if (el.tabIndex === -1) continue;
    if (el.closest('.ytaf-section-2col')) {
      placeRow(el, col * 400, 100 + row * 100, 380);
      if (col === 1) row++;
      col = 1 - col;
    } else {
      if (col === 1) {
        row++;
        col = 0;
      }
      placeRow(el, 0, 100 + row * 100, 780);
      row++;
    }
  }
}

/** A readable name for a focused control. */
function name(el) {
  if (!el) return 'nothing';
  if (el.classList.contains('ytaf-tab-btn')) return `tab ${el.textContent}`;
  if (el.classList.contains('ytaf-cycle-row')) {
    return `row ${el.querySelector('.ytaf-cycle-label').textContent.trim()}`;
  }
  const label = el.closest('label');
  return label ? label.textContent.trim() : el.tagName;
}

const focused = () => name(d.activeElement);

/** The check, and on a miss the expected control is focused so the next step is not a cascade. */
function expectFocus(what, expected) {
  if (t(`${what} -> ${expected}`, focused() === expected, `got ${focused()}`)) return;
  const all = d.querySelectorAll('.ytaf-tab-btn, input, .ytaf-cycle-row');
  for (let i = 0; i < all.length; i++) {
    if (name(all[i]) === expected) {
      all[i].focus();
      return;
    }
  }
}

(async () => {
  press(KEYS.GREEN, d.body);
  for (let i = 0; i < 20; i++) pump();
  const panel = d.querySelector('.ytaf-ui-container');
  t('the panel opens on the menu key', !!panel && panel.style.display === 'block');
  const tabs = panel.querySelectorAll('.ytaf-tab-btn');
  for (let i = 0; i < tabs.length; i++) place(tabs[i], i * 200, 0, 180, 80);
  const pages = panel.querySelectorAll('.ytaf-settings-page');
  for (let i = 0; i < pages.length; i++) layoutPage(pages[i]);
  t('setup: all five pages are laid out', pages.length === 5, String(pages.length));

  // ---- the tab bar -------------------------------------------------------------
  expectFocus('opening the panel', 'tab Main');
  press(KEYS.RIGHT);
  expectFocus('Right from Main', 'tab SponsorBlock');
  press(KEYS.RIGHT);
  expectFocus('Right from SponsorBlock', 'tab DeArrow');
  press(KEYS.RIGHT);
  press(KEYS.RIGHT);
  expectFocus('Right twice more', 'tab UI Tweaks');
  press(KEYS.RIGHT);
  expectFocus('Right from the last tab wraps', 'tab Main');
  press(KEYS.LEFT);
  expectFocus('Left from the first tab wraps', 'tab UI Tweaks');
  press(KEYS.LEFT);
  press(KEYS.LEFT);
  press(KEYS.LEFT);
  press(KEYS.LEFT);
  expectFocus('Left four times more', 'tab Main');
  t(
    'the Main page is still the open one',
    d.querySelector('#ytaf-page-main').style.display !== 'none'
  );

  // ---- into the page and around the two-column section ----------------------------
  press(KEYS.DOWN);
  expectFocus('Down from the Main tab', 'Ad Blocking');
  press(KEYS.RIGHT);
  expectFocus('Right in the first two-column row', 'Reduce Telemetry & Tracking');
  press(KEYS.LEFT);
  expectFocus('Left back again', 'Ad Blocking');
  press(KEYS.DOWN);
  expectFocus('Down in the first column', 'Remove Shorts (Global)');
  press(KEYS.RIGHT);
  press(KEYS.DOWN);
  expectFocus('Down in the second column', 'Remove "Most Relevant" Shelf');
  press(KEYS.RIGHT);
  expectFocus('Right at the end of a row stays put', 'Remove "Most Relevant" Shelf');
  press(KEYS.DOWN);
  expectFocus('Down from the second column onto a full-width row', 'Force Max Quality');
  press(KEYS.UP);
  expectFocus('Up from a full-width row prefers the nearer column', 'Remove Top Live Games');
  press(KEYS.UP);
  press(KEYS.UP);
  expectFocus('Up twice more climbs the column', 'Ad Blocking');
  press(KEYS.UP);
  expectFocus('Up from the first row lands on the open tab', 'tab Main');

  // ---- cycle rows keep Left and Right ------------------------------------------------
  const codecRow = d.querySelector('#ytaf-page-main .ytaf-cycle-row');
  codecRow.focus();
  const before = codecRow.querySelector('.ytaf-value').textContent;
  press(KEYS.RIGHT);
  t('Right on a cycle row stays on the row', d.activeElement === codecRow, focused());
  t(
    'and steps its value instead',
    codecRow.querySelector('.ytaf-value').textContent !== before,
    codecRow.querySelector('.ytaf-value').textContent
  );
  press(KEYS.LEFT);
  t(
    'Left steps it back',
    d.activeElement === codecRow && codecRow.querySelector('.ytaf-value').textContent === before
  );

  // ---- wrapping between the tab and the last control ----------------------------------
  const mainControls = d.querySelectorAll(
    '#ytaf-page-main input:not([disabled]), #ytaf-page-main .ytaf-cycle-row'
  );
  const last = mainControls[mainControls.length - 1];
  last.focus();
  press(KEYS.DOWN);
  expectFocus('Down from the last control wraps to the open tab', 'tab Main');
  press(KEYS.UP);
  t('Up from the tab wraps to the last control', d.activeElement === last, focused());

  // ---- a hidden page is not a candidate -----------------------------------------------
  tabs[1].click();
  tabs[1].focus();
  press(KEYS.DOWN);
  t(
    'Down from the SponsorBlock tab enters the SponsorBlock page, not the hidden Main page',
    !!d.activeElement.closest('#ytaf-page-sponsor'),
    focused()
  );
  expectFocus('Down from the SponsorBlock tab, onto its first row', 'SponsorBlock');
  press(KEYS.UP);
  expectFocus('Up from its first row returns to the SponsorBlock tab', 'tab SponsorBlock');

  // ---- Enter, Back and Escape ----------------------------------------------------------
  tabs[0].click();
  tabs[0].focus();
  press(KEYS.DOWN);
  const box = d.activeElement;
  const was = box.checked;
  press(KEYS.ENTER);
  t('Enter toggles the focused checkbox', box.checked === !was);
  press(KEYS.ENTER);
  t('and toggles it back', box.checked === was);

  // ---- OK with the Magic Remote pointer: Enter on press, a click on release ----
  {
    const keyup = (code) =>
      d.activeElement.dispatchEvent(
        new win.KeyboardEvent('keyup', { keyCode: code, bubbles: true, cancelable: true })
      );
    const pointerClick = (el) =>
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    const label = box.closest('label');

    // 5-way mode (the last input was an arrow key): Enter clicks; the pointer
    // click of the same press is dropped.
    const before = box.checked;
    press(KEYS.ENTER);
    keyup(KEYS.ENTER);
    pointerClick(label);
    t('Enter and its release click toggle a checkbox once', box.checked === !before);
    await wait(450);
    pointerClick(label);
    t('a pointer click later is a click of its own', box.checked === before);

    // Pointer mode (the mouse moved): Enter leaves the toggle to the click.
    d.dispatchEvent(new win.MouseEvent('mousemove', { bubbles: true }));
    press(KEYS.ENTER);
    t('with the pointer in use, Enter alone does not toggle', box.checked === before);
    keyup(KEYS.ENTER);
    pointerClick(label);
    t('the pointer click toggles it, once', box.checked === !before);
    // webOS hiding the pointer (or an arrow key) gives Enter back.
    d.dispatchEvent(new win.CustomEvent('cursorStateChange', { detail: { visibility: false } }));
    await wait(450);
    press(KEYS.ENTER);
    t('pointer hidden: Enter toggles again', box.checked === before);
    keyup(KEYS.ENTER);
    await wait(450);

    // A cycle row steps once per press as well.
    const row = d.querySelector('#ytaf-page-main .ytaf-cycle-row');
    row.focus();
    const value = () => row.querySelector('.ytaf-value').textContent;
    const v0 = value();
    press(KEYS.ENTER);
    keyup(KEYS.ENTER);
    pointerClick(row);
    const v1 = value();
    press(KEYS.ENTER);
    keyup(KEYS.ENTER);
    pointerClick(row);
    t(
      'a cycle row steps once per press',
      v1 !== v0 && value() !== v1,
      v0 + ' > ' + v1 + ' > ' + value()
    );
    await wait(450);
    box.focus();
  }
  const boxLabel = box.closest('label');
  t(
    'the focused checkbox marks its label row (the stand-in for :focus-within)',
    !!boxLabel && boxLabel.classList.contains('ytaf-focused')
  );
  tabs[0].focus();
  t('and the mark leaves with the focus', !boxLabel.classList.contains('ytaf-focused'));
  box.focus();

  // The panel ignores toggles for 500 ms after its first build (50 ms here).
  await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
  press(KEYS.BACK);
  t('Back closes the panel', panel.style.display === 'none');
  // jsdom never clears focus from a hidden element; the close has to.
  t('closing takes the focus out of the panel', !panel.contains(d.activeElement), focused());
  press(KEYS.GREEN, d.body);
  t('the menu key opens it again', panel.style.display === 'block');
  press(KEYS.ESCAPE);
  t('Escape closes it too', panel.style.display === 'none');

  // ---- a held Back: the repeats after the close are not YouTube's --------------------
  // The same shortcut key twice within 100 ms is one press: the menu key waits it out.
  await wait(120);
  press(KEYS.GREEN, d.body);
  t('setup: the menu key opens it again', panel.style.display === 'block');
  const seen = [];
  const youtube = (e) => seen.push(e.keyCode);
  // YouTube listens in the bubble phase.
  d.addEventListener('keydown', youtube);
  const held = (code) => {
    const e = new win.KeyboardEvent('keydown', {
      keyCode: code,
      repeat: true,
      bubbles: true,
      cancelable: true
    });
    d.activeElement.dispatchEvent(e);
    return e;
  };
  press(KEYS.BACK);
  t('setup: Back closes the panel', panel.style.display === 'none');
  held(KEYS.BACK);
  held(KEYS.BACK);
  t(
    'held Back: the repeats after the close never reach YouTube',
    seen.length === 0,
    seen.join(',')
  );
  // A Back this mod sends meanwhile (a webOS 25 kick dismissing the controls) is YouTube's.
  const sent = new win.KeyboardEvent('keydown', {
    keyCode: KEYS.BACK,
    bubbles: true,
    cancelable: true
  });
  sent.__ytafSynthetic = true;
  d.activeElement.dispatchEvent(sent);
  t(
    'a synthetic Back while the held one is swallowed still reaches YouTube',
    seen.length === 1 && seen[0] === KEYS.BACK && !sent.defaultPrevented,
    seen.join(',')
  );
  seen.length = 0;
  d.activeElement.dispatchEvent(
    new win.KeyboardEvent('keyup', { keyCode: KEYS.BACK, bubbles: true })
  );
  press(KEYS.BACK);
  t(
    'released and pressed again: Back reaches YouTube again',
    seen.length === 1 && seen[0] === KEYS.BACK,
    seen.join(',')
  );

  // ---- keys this mod sends (the Shorts keep-alive, the webOS 25 kick) ----
  await wait(120);
  press(KEYS.GREEN, d.body);
  t('setup: the panel is open again', panel.style.display === 'block');
  seen.length = 0;
  const synthetic = (code) => {
    const e = new win.KeyboardEvent('keydown', { keyCode: code, bubbles: true, cancelable: true });
    e.__ytafSynthetic = true;
    d.activeElement.dispatchEvent(e);
    return e;
  };
  const keepAlive = synthetic(KEYS.YELLOW);
  t(
    'a key this mod sends passes through the open panel to YouTube',
    seen.length === 1 && seen[0] === KEYS.YELLOW && !keepAlive.defaultPrevented,
    seen.join(',')
  );
  const focusBefore = d.activeElement;
  synthetic(KEYS.DOWN);
  t('and a synthetic arrow does not move the panel’s focus', d.activeElement === focusBefore);
  d.removeEventListener('keydown', youtube);

  report.finish();
})();
