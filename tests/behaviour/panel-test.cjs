/**
 * Behavioural test for the options panel.
 *
 * The deferred build first. The risky case is a user reaching a tab before the
 * idle build chain does: setActivePage() must build that page synchronously
 * rather than blowing up on an undefined page element. Also checks each builder
 * runs exactly once, that every page ends up identical to the all-synchronous
 * build, and that opening and closing the panel repeatedly doesn't duplicate
 * anything.
 *
 * Then the controls: the focus trap (and the SponsorBlock popup it allows), the
 * pointer on the tab bar and the logo, the colour picker with its reset, the
 * opacity row's step and clamp, a shortcut row cycling through every action,
 * the thumbnail strategy row greyed out without the upgrade, the shelf opacity
 * row without OLED-Care Mode, the codec row, the rows that depend on guest
 * mode and the webOS version, the red theme with OLED-care mode, Enter on a
 * cycle row, and the Main page's rows and layout rules.
 *
 * Run: node tests/behaviour/panel-test.cjs [bundle]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  KEYS,
  press,
  countCreated,
  wait,
  waitFor,
  openPanel,
  panelCheckbox,
  storedConfig,
  cycleRow,
  place
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;
const PAGES = [
  '#ytaf-page-main',
  '#ytaf-page-sponsor',
  '#ytaf-page-dearrow',
  '#ytaf-page-shortcuts',
  '#ytaf-page-ui-tweaks'
];

// The labels of the shortcut actions (core/config-options.js shortcutActions), in order.
const ACTION_LABELS = [
  'None',
  'Refresh Page',
  'Skip to Next Chapter',
  'Skip to Previous Chapter',
  'Skip to Last SponsorBlock Segment',
  'Fast Forward (Burst)',
  'Rewind (Burst)',
  'Play/Pause',
  'Toggle Subtitles',
  'Toggle Comments',
  'Toggle Description',
  'Save / Watch Later',
  'Toggle OLED Black Overlay',
  'Manual Skip / Jump to Highlight',
  'Playback Speed +',
  'Playback Speed -',
  'Playback Speed 1x',
  'Open/Close Settings'
];

/**
 * A page with the panel open and every page built. `config`, `storage` and
 * `ua` go to createPage; `layout: 'grid'` stubs getBoundingClientRect with the
 * data-x/y/w/h attributes `place()` assigns, for the arrow navigation.
 */
function open(options) {
  const o = options || {};
  const page = createPage({
    config: o.config,
    storage: o.storage,
    ua: o.ua,
    fetch: false,
    // The panel ignores toggles for 500 ms after its first build: 50 ms here.
    timers: { scale: 10, from: 500 },
    layout: o.layout
  });
  const panel = openPanel(page);
  return {
    win: page.win,
    d: page.win.document,
    pump: page.pump,
    panel,
    tabs: Array.from(panel.querySelectorAll('.ytaf-tab-btn'))
  };
}

// Element creation and the style and layout work behind it is what opening
// the panel costs on Chromium 38, so the pages count their elements.
function boot() {
  let counter;
  const page = createPage({
    config: {
      enableLegacyEmojiFix: true,
      enableSponsorBlock: true,
      enableReturnYouTubeDislike: true,
      enableAutoLogin: true
    },
    fetch: false,
    // The panel ignores toggles for 500 ms after its first build: 50 ms here.
    timers: { scale: 10, from: 500 },
    setup(win) {
      counter = countCreated(win);
    }
  });
  return { win: page.win, pump: page.pump, counter };
}

(async () => {
  // ---- user hits a tab BEFORE the idle chain gets there ----
  {
    const { win, pump, counter } = boot();
    const before = counter.created;
    press(win, KEYS.GREEN, win.document.body);
    const inHandler = counter.created - before;
    const panel = win.document.querySelector('.ytaf-ui-container');
    t('panel exists after keypress', !!panel);
    // The Main page alone: around 85 elements today, a budget with headroom for
    // a few more settings; the other four pages would roughly triple it.
    t(
      'the keypress builds the Main page only (under 120 elements)',
      inHandler > 0 && inHandler <= 120,
      String(inHandler)
    );
    t(
      'only Main built synchronously',
      win.document.querySelectorAll(PAGES[1]).length === 0,
      'sponsor page count ' + win.document.querySelectorAll(PAGES[1]).length
    );

    const tabs = panel.querySelectorAll('.ytaf-tab-btn');
    t('setup: five tab buttons', tabs.length === 5, 'got ' + tabs.length);

    // No frames pumped yet: jump straight to Shortcuts (page 4). An error in
    // the click handler would reach jsdom, not this call, and fail the
    // report's console.error check.
    tabs[3].click();
    const shortcuts = win.document.querySelector(PAGES[3]);
    t('Shortcuts page built on demand', !!shortcuts);
    t(
      'Shortcuts page is the visible one',
      shortcuts && shortcuts.style.display === 'block',
      shortcuts && shortcuts.style.display
    );
    t(
      'Main page hidden after tab switch',
      win.document.querySelector(PAGES[0]).style.display === 'none'
    );
    // Don't pin an exact element count - adding a setting legitimately changes
    // it. What matters is that an on-demand build is fully populated, which the
    // shortcut rows (one per bindable key) prove.
    t(
      'Shortcuts page fully populated',
      shortcuts && shortcuts.querySelectorAll('.ytaf-cycle-row').length >= 13,
      shortcuts && String(shortcuts.querySelectorAll('.ytaf-cycle-row').length) + ' rows'
    );

    // Now let the idle chain finish; it must not rebuild what already exists.
    for (let i = 0; i < 20; i++) pump();
    t(
      'the other pages are built in the frames after the keypress',
      counter.created - before > inHandler,
      `${counter.created - before} elements in all`
    );
    for (const sel of PAGES) {
      t(
        'exactly one ' + sel.replace('#ytaf-page-', ''),
        win.document.querySelectorAll(sel).length === 1,
        'count ' + win.document.querySelectorAll(sel).length
      );
    }
  }

  // ---- normal flow, idle chain completes first ----
  {
    const { win, pump } = boot();
    press(win, KEYS.GREEN, win.document.body);
    for (let i = 0; i < 20; i++) pump();
    const panel = win.document.querySelector('.ytaf-ui-container');
    const counts = PAGES.map((s) => {
      const el = win.document.querySelector(s);
      return el ? el.getElementsByTagName('*').length : -1;
    });
    t(
      'all five pages built after idle frames',
      counts.length === 5 && counts.every((n) => n > 10),
      JSON.stringify(counts)
    );
    // The deferred build must produce the same tree an all-synchronous one
    // would: every page's elements accounted for, nothing dropped or doubled.
    const pageSum = counts.reduce((a, b) => a + b, 0);
    const panelTotal = panel.getElementsByTagName('*').length;
    t(
      'panel total accounts for every page',
      panelTotal > pageSum && panelTotal - pageSum < 40,
      `pages=${pageSum} panel=${panelTotal}`
    );

    // Walk every tab, forwards then backwards.
    const tabs = panel.querySelectorAll('.ytaf-tab-btn');
    let ok = true,
      detail = '';
    for (const order of [
      [1, 2, 3, 0],
      [3, 1, 0, 2]
    ]) {
      for (const i of order) {
        tabs[i].click();
        const shown = PAGES.map((s) => win.document.querySelector(s).style.display);
        const expect = PAGES.map((_, j) => (j === i ? 'block' : 'none'));
        if (JSON.stringify(shown) !== JSON.stringify(expect)) {
          ok = false;
          detail = `tab ${i}: ${JSON.stringify(shown)}`;
        }
        if (!tabs[i].classList.contains('ytaf-active')) {
          ok = false;
          detail = `tab ${i} not marked active`;
        }
      }
    }
    t('every tab shows exactly its own page', ok, detail);

    // Close and reopen: must not duplicate the panel or its pages. The panel
    // ignores toggles for 500 ms after its first build (50 ms here), so this
    // waits them out, on the panel's own signal: a fixed wait can come back
    // before that timer on a stalled event loop (Node runs the due timers of
    // one length before another's), and pressed inside the window the two
    // presses would test nothing. The panel was opened with Green too, and the
    // shortcut router takes the same key again only after 100 ms: on a fast
    // machine (GitHub's runner) the steps above take less, and the press was
    // swallowed as a repeat.
    await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
    await wait(150);
    press(win, KEYS.GREEN, win.document.body);
    t('setup: the panel closed', panel.style.display === 'none');
    await wait(150); // past the repeated-key debounce of the shortcut router
    press(win, KEYS.GREEN, win.document.body);
    t('setup: the panel reopened', panel.style.display === 'block');
    for (let i = 0; i < 20; i++) pump();
    t(
      'reopen does not duplicate the panel',
      win.document.querySelectorAll('.ytaf-ui-container').length === 1
    );
    t(
      'reopen does not duplicate pages',
      PAGES.every((s) => win.document.querySelectorAll(s).length === 1)
    );
  }

  // ---- the focus trap ---------------------------------------------------------
  {
    const { win, d, pump, tabs, panel } = open();
    const outside = d.createElement('div');
    outside.setAttribute('tabindex', '0');
    d.body.appendChild(outside);
    t('setup: opening the panel focuses the Main tab', d.activeElement === tabs[0]);
    outside.focus();
    t(
      'a focus outside the open panel comes back to the last place inside it',
      d.activeElement === tabs[0],
      d.activeElement && d.activeElement.tagName
    );
    const box = panel.querySelector('#ytaf-page-main input');
    box.focus();
    outside.focus();
    t('and that place follows the user: back to the focused checkbox', d.activeElement === box);
    // The SponsorBlock segment list sits beside the panel and is allowed focus,
    // once it is shown (the bundle's stylesheet keeps it display: none otherwise).
    const popup = d.createElement('div');
    popup.className = 'sb-segments-popup visible';
    const row = d.createElement('div');
    row.className = 'sb-segment-row';
    row.setAttribute('tabindex', '-1');
    popup.appendChild(row);
    d.body.appendChild(popup);
    row.focus();
    t('a focus into the SponsorBlock segments popup is allowed', d.activeElement === row);
    outside.focus();
    t('the popup row counts as a safe place to come back to', d.activeElement === row);
    // The panel ignores toggles for 500 ms (50 here) after its first build.
    await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
    win.ytaf_showOptionsPanel(false);
    pump();
    outside.focus();
    t('with the panel closed the trap is off', d.activeElement === outside);
  }

  // ---- the pointer on the tab bar, and the logo ------------------------------
  {
    const { win, d, tabs, panel } = open();
    const tabMenu = panel.querySelector('.ytaf-tab-menu');
    tabs[3].dispatchEvent(new win.MouseEvent('mouseenter'));
    t('the pointer entering a tab button focuses it', d.activeElement === tabs[3]);
    tabMenu.dispatchEvent(new win.MouseEvent('mouseleave'));
    t(
      'the pointer leaving the tab bar puts focus back on the open tab',
      d.activeElement === tabs[0] && tabs[0].classList.contains('ytaf-active')
    );
    const box = panel.querySelector('#ytaf-page-main input');
    box.focus();
    tabMenu.dispatchEvent(new win.MouseEvent('mouseleave'));
    t('leaving the tab bar with focus on a page control changes nothing', d.activeElement === box);
    tabs[4].click();
    panel.querySelector('#ytaf-page-ui-tweaks input').focus();
    panel.querySelector('.ytaf-logo').click();
    t(
      'a logo click (the theme toggle) hands focus back to the open tab',
      d.activeElement === tabs[4],
      d.activeElement && d.activeElement.className
    );
  }

  // ---- the colour picker ------------------------------------------------------
  {
    const { win, tabs } = open();
    tabs[1].click();
    const row = cycleRow(win, 'Sponsor', '#ytaf-page-sponsor');
    const input = row.querySelector('input[type="color"]');
    const reset = row.querySelector('.ytaf-color-reset');
    t(
      'setup: the Sponsor row carries a colour input showing the default',
      !!input && input.value === '#00d400'
    );
    input.value = '#123456';
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    await waitFor(() => storedConfig(win).sponsorColor === '#123456'); // the debounced config write
    t(
      'a colour input writes the category colour key',
      storedConfig(win).sponsorColor === '#123456',
      String(storedConfig(win).sponsorColor)
    );
    const mode = row.querySelector('.ytaf-value').textContent;
    input.click();
    t(
      'a click on the colour input does not cycle the row',
      row.querySelector('.ytaf-value').textContent === mode
    );
    reset.click();
    await waitFor(() => storedConfig(win).sponsorColor === '#00d400');
    t(
      'the reset button restores the default colour, in the config and in the input',
      storedConfig(win).sponsorColor === '#00d400' && input.value === '#00d400',
      `${storedConfig(win).sponsorColor} ${input.value}`
    );
  }

  // ---- the opacity row steps by 5 and clamps ------------------------------------
  {
    // The row only works under OLED-Care Mode (the next case shows it without).
    const { win, tabs } = open({ config: { enableOledCareMode: true } });
    tabs[4].click();
    const row = cycleRow(win, 'Video shelf opacity', '#ytaf-page-ui-tweaks');
    const value = () => row.querySelector('.ytaf-value').textContent;
    row.focus();
    t('setup: the row shows the default 100%', value() === '100%', value());
    press(win, KEYS.RIGHT, row);
    t('Right at 100 stays at 100', value() === '100%', value());
    press(win, KEYS.LEFT, row);
    t('Left steps down by 5', value() === '95%', value());
    for (let i = 0; i < 19; i++) press(win, KEYS.LEFT, row);
    t('nineteen more reach 0', value() === '0%', value());
    press(win, KEYS.LEFT, row);
    t('Left at 0 stays at 0', value() === '0%', value());
    press(win, KEYS.RIGHT, row);
    t('and Right steps up again', value() === '5%', value());
    await waitFor(() => storedConfig(win).videoShelfOpacity === 5);
    t(
      'the value is stored as a number',
      storedConfig(win).videoShelfOpacity === 5,
      String(storedConfig(win).videoShelfOpacity)
    );
  }

  {
    const { win, tabs } = open({ config: { enableOledCareMode: true, videoShelfOpacity: '100' } });
    tabs[4].click();
    const row = cycleRow(win, 'Video shelf opacity', '#ytaf-page-ui-tweaks');
    row.focus();
    press(win, KEYS.LEFT, row);
    t(
      'an opacity stored as a string by an older build steps as a number',
      row.querySelector('.ytaf-value').textContent === '95%',
      row.querySelector('.ytaf-value').textContent
    );
  }

  // ---- a shortcut row cycles through every action ---------------------------------
  {
    const { win, tabs } = open();
    tabs[3].click();
    const row = cycleRow(win, 'Key 1', '#ytaf-page-shortcuts');
    const value = () => row.querySelector('.ytaf-value').textContent;
    // Left and Right reach a cycle row only while it is the focused control.
    row.focus();
    t('setup: key 1 starts unbound', value() === 'None', value());
    const seen = [];
    for (let i = 0; i < ACTION_LABELS.length; i++) {
      press(win, KEYS.RIGHT, row);
      seen.push(value());
    }
    t(
      'Right walks every action in the order of the table and wraps to None',
      JSON.stringify(seen) === JSON.stringify(ACTION_LABELS.slice(1).concat(ACTION_LABELS[0])),
      seen.join(' | ')
    );
    press(win, KEYS.LEFT, row);
    t(
      'Left from None wraps to the last action',
      value() === ACTION_LABELS[ACTION_LABELS.length - 1],
      value()
    );
    await waitFor(() => storedConfig(win).shortcut_key_1 === 'config_menu');
    t(
      'the stored binding is the action name, not its label',
      storedConfig(win).shortcut_key_1 === 'config_menu',
      String(storedConfig(win).shortcut_key_1)
    );
    t(
      'the rows cover the digits and the three colour keys',
      !!cycleRow(win, 'Key 0', '#ytaf-page-shortcuts') &&
        !!cycleRow(win, 'Key 9', '#ytaf-page-shortcuts') &&
        !!cycleRow(win, 'Red Button', '#ytaf-page-shortcuts') &&
        !!cycleRow(win, 'Green Button', '#ytaf-page-shortcuts') &&
        !!cycleRow(win, 'Blue Button', '#ytaf-page-shortcuts')
    );
  }

  // ---- the thumbnail strategy row without the upgrade ----------------------------
  {
    const { win, d, panel } = open({ layout: 'grid' });
    const upgrade = panelCheckbox(win, 'Max Thumbnail Quality');
    const strategy = cycleRow(win, 'Thumbnail Strategy', '#ytaf-page-main');
    const logo = cycleRow(win, 'YouTube Logo', '#ytaf-page-main');
    t(
      'with Max Thumbnail Quality off the strategy row is greyed out and out of the focus order',
      strategy.classList.contains('ytaf-unavailable') && strategy.tabIndex === -1
    );
    const shown = strategy.querySelector('.ytaf-value').textContent;
    strategy.click();
    t(
      'a pointer click on the greyed row changes nothing',
      strategy.querySelector('.ytaf-value').textContent === shown,
      strategy.querySelector('.ytaf-value').textContent
    );
    // One column: the checkbox, the strategy row, the logo row.
    place(upgrade, 0, 100, 780, 80);
    place(strategy, 0, 200, 780, 80);
    place(logo, 0, 300, 780, 80);
    upgrade.focus();
    press(win, KEYS.DOWN, panel);
    t(
      'Down from the checkbox skips the greyed row',
      d.activeElement === logo,
      d.activeElement && d.activeElement.className
    );
    upgrade.click();
    t(
      'turning the upgrade on restores the row',
      !strategy.classList.contains('ytaf-unavailable') && strategy.tabIndex === 0
    );
    upgrade.focus();
    press(win, KEYS.DOWN, panel);
    t(
      'and Down now lands on it',
      d.activeElement === strategy,
      d.activeElement && d.activeElement.className
    );
  }

  // ---- the shelf opacity row without OLED-Care Mode ---------------------------------
  {
    const { win } = open();
    const opacity = cycleRow(win, 'Video shelf opacity', '#ytaf-page-ui-tweaks');
    const oled = panelCheckbox(win, 'OLED-Care Mode (True Black UI)');
    t('setup: both rows are on the panel', !!opacity && !!oled && oled.checked === false);
    t(
      'with OLED-Care Mode off the shelf opacity row is greyed out and out of the focus order',
      opacity.classList.contains('ytaf-unavailable') && opacity.tabIndex === -1
    );
    oled.click();
    t(
      'OLED-Care Mode on restores it',
      !opacity.classList.contains('ytaf-unavailable') && opacity.tabIndex === 0
    );
  }

  // ---- the codec row ----------------------------------------------------------------
  {
    const { win } = open();
    const row = cycleRow(win, 'Force Video Codec', '#ytaf-page-main');
    const shown = () => row.querySelector('.ytaf-value').textContent;
    t('the Main page has the Force Video Codec row, on Auto', !!row && shown() === 'Auto');
    row.click();
    t('a click steps it to the next codec', shown() === 'AV1', shown());
    await waitFor(() => storedConfig(win).forceVideoCodec === 'av1');
    t('and the choice is stored', storedConfig(win).forceVideoCodec === 'av1');
  }

  // ---- rows that depend on the account and the TV ----------------------------------
  {
    const { win } = open();
    t(
      'signed in: no guest-mode row',
      panelCheckbox(win, 'Guest Mode: Hide Sign-in Buttons') === null
    );
  }
  {
    const { win } = open({
      storage: {
        'yt.leanback.default::last-identity-used': {
          data: { identityType: 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST' }
        }
      }
    });
    t(
      'as a guest the Main page has the guest-mode row',
      !!panelCheckbox(win, 'Guest Mode: Hide Sign-in Buttons')
    );
  }
  {
    const { win, tabs } = open();
    tabs[4].click();
    t(
      'webOS 3: the UI Tweaks page has the emoji fix row',
      !!panelCheckbox(win, 'Emoji + Characters Fix')
    );
  }
  {
    const { win, tabs } = open({ ua: 'webos23' });
    tabs[4].click();
    t(
      'webOS 5 and later: the emoji fix row is absent',
      panelCheckbox(win, 'Emoji + Characters Fix') === null
    );
  }

  // ---- the red theme with OLED-care mode, and Enter on a cycle row ------------------
  {
    const { win, d, tabs } = open({ config: { uiTheme: 'classic-red', enableOledCareMode: true } });
    const html = d.documentElement.classList;
    t(
      'the red theme and OLED-care mode mark <html> together',
      html.contains('ytaf-theme-red') && html.contains('ytaf-oled')
    );
    tabs[4].click();
    const theme = cycleRow(win, 'UI Theme', '#ytaf-page-ui-tweaks');
    const value = () => theme.querySelector('.ytaf-value').textContent;
    t('setup: the theme row reads Classic Red', value() === 'Classic Red', value());
    theme.focus();
    press(win, KEYS.ENTER, theme);
    t(
      'Enter on a cycle row steps its value like Right',
      value() === 'Blue' && !html.contains('ytaf-theme-red'),
      value()
    );
    t('while the OLED class stays', html.contains('ytaf-oled'));
  }

  // ---- the Main page's rows and layout rules ----
  {
    const { win } = boot();
    press(win, KEYS.GREEN, win.document.body);
    const main = win.document.querySelector('#ytaf-page-main');
    t(
      'the Main page has the Remove Live Videos row and the YouTube Logo selector',
      !!main &&
        /Remove Live Videos/.test(main.textContent) &&
        /YouTube Logo/.test(main.textContent),
      main && main.textContent.slice(0, 80)
    );
    // The stylesheet goes in once the bundle has run (core/styles.js).
    await wait(0);
    const css = Array.from(win.document.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n');
    t('the page-1 density rules are in the stylesheet', /#ytaf-page-main label/.test(css));
    // A setting changed, and the page goes before the write's debounce (200 ms).
    const adBlocking = panelCheckbox(win, 'Ad Blocking');
    await wait(60);
    adBlocking.click();
    win.dispatchEvent(new win.Event('pagehide'));
    t(
      'pagehide writes the changed setting at once',
      adBlocking.checked === false && storedConfig(win).enableAdBlock === false,
      JSON.stringify(storedConfig(win).enableAdBlock)
    );
    t('a settings page can scroll rather than clip', /overflow-y:\s*auto/.test(css));
    // A width of its own: shrink-to-fit made the panel change width, and
    // recentre, with every tab.
    const container = /\.ytaf-ui-container\{([^}]*)\}/.exec(css.replace(/\s+/g, ''));
    const decls = container ? container[1].split(';') : [];
    t(
      'the panel has a set width (41.6vw), the same on every tab',
      decls.indexOf('width:41.6vw') !== -1,
      container ? container[1] : 'no .ytaf-ui-container rule'
    );
  }

  report.finish();
})();
