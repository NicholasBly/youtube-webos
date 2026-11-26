/**
 * The description panel's keyboard navigation and panel tracking, against the
 * built bundle. Focus is the only reliable signal for the role="dialog"
 * description panel on webOS, so the panel must be found from a focus landing
 * anywhere inside it, the arrow keys must move between its menu items (and
 * wrap), Enter must reach the focused item as a flagged synthetic press (also
 * after YouTube changed the panel, with the items in wrappers or a list), keys
 * this mod synthesises must be ignored, and focus leaving the panel must drop
 * the highlight. Then the lifecycle around it: a panel YouTube replaced is
 * re-bound, the description shortcut arms the bounded panel poll, the instance
 * exists for the navigation even with the dislike count off, and a focus
 * change on the watch page costs the module next to no selector work.
 *
 * jsdom makes Event#isTrusted false for anything dispatchEvent() sends, so a
 * key the remote would send is fired through jsdom's own event helper, which
 * dispatches a trusted event the way the browser does.
 *
 * Run: node tests/behaviour/return-dislike-navigation-test.cjs [bundle] [legacy|modern]
 */
const { createPage, engine } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  tick,
  KEYS,
  press,
  descriptionPanel,
  instrument,
  intersectionStub,
  pressTrusted
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

/** The highlight the navigation puts on the focused menu item. */
const highlighted = (el) => el.classList.contains('zylon-focus') && el.classList.contains('bNqvrc');

// A watch page whose dislike instance is ready: the panel poll (500 ms), the
// per-video start (500 ms) and the description shortcut's delay (350 ms) at a
// tenth; the focus settle (50 ms) and the highlight clear (100 ms -> 10 ms) as noted.
async function boot(cfg, more) {
  let io = null;
  const page = createPage(
    Object.assign(
      {
        page: 'watch',
        config: Object.assign({ enableReturnYouTubeDislike: true }, cfg),
        xhr: 'error',
        layout: true,
        fetch: () =>
          Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dislikes: 3 }) }),
        timers: { scale: 10, from: 100 },
        setup(win) {
          if (engine !== 'webos3') io = intersectionStub(win);
        }
      },
      more
    )
  );
  page.io = io;
  // The instance comes some 100 ms after load, and far later on a loaded
  // machine: the deadline is only a safety net.
  await waitFor(() => page.win.returnYouTubeDislike, 10000);
  page.pump();
  await tick();
  return page;
}

const factoid = (win) => win.document.getElementById('ryd-dislike-factoid');

(async () => {
  // ---- panel detection by focus, and the arrow keys ----
  {
    const { win } = await boot();
    const d = win.document;
    const ryd = win.returnYouTubeDislike;
    t('setup: RYD instance created', !!ryd);

    // A description panel a few levels below <ytlr-app>, as YouTube builds it,
    // with focus on a child of the second item: the panel must be discovered
    // by the ancestor walk, and the item resolved from its focused child.
    const { items } = descriptionPanel(win, { items: 4, focus: 1 });
    await tick();
    await tick();
    // Found and taken as focused: its item is highlighted, which only a
    // tracked, focused panel does.
    t(
      'the panel is found from the focus and the item resolved from its focused child',
      highlighted(items[1].it) && !highlighted(items[0].it),
      items[1].it.className
    );

    // The arrow keys move focus and the highlight between the items.
    const down = pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'ArrowDown moves focus to the next item',
      d.activeElement === items[2].it && down.defaultPrevented,
      d.activeElement && d.activeElement.outerHTML
    );
    t(
      'and the highlight follows it',
      highlighted(items[2].it) && !highlighted(items[1].it),
      items[1].it.className + ' / ' + items[2].it.className
    );
    pressTrusted(win, KEYS.UP);
    await tick();
    t('ArrowUp moves focus back', d.activeElement === items[1].it && highlighted(items[1].it));
    items[0].it.focus();
    await tick();
    pressTrusted(win, KEYS.UP);
    await tick();
    t('ArrowUp on the first item wraps to the last', d.activeElement === items[3].it);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('ArrowDown on the last item wraps to the first', d.activeElement === items[0].it);

    // A key this mod synthesised (the OLED keep-alive, the kickstart) carries
    // the marker and must be ignored.
    pressTrusted(win, KEYS.DOWN, null, true);
    await tick();
    t('a mod-synthesised ArrowDown is ignored', d.activeElement === items[0].it);
    // An untrusted key (a script's dispatchEvent) is not a remote press either.
    press(win, KEYS.DOWN);
    await tick();
    t('an untrusted ArrowDown does not move focus', d.activeElement === items[0].it);

    // Enter on the focused menu item itself: a synthetic, flagged Enter lands
    // on it, the real one is consumed, and the highlight goes after the click
    // has been seen landing.
    items[2].it.focus();
    await tick();
    const seen = [];
    items[2].it.addEventListener('keydown', (e) => {
      if (e.__ytafSynthetic) seen.push(e.keyCode);
    });
    const enter = pressTrusted(win, KEYS.ENTER);
    await tick();
    t(
      'Enter sends a flagged synthetic Enter to the menu item',
      seen.length === 1 && seen[0] === 13 && enter.defaultPrevented,
      JSON.stringify(seen) + ' prevented=' + enter.defaultPrevented
    );
    t('and leaves focus on it', d.activeElement === items[2].it);
    await waitFor(() => !highlighted(items[2].it));
    t('the highlight is cleared once the click has landed', !highlighted(items[2].it));

    // With focus on a focusable descendant the real Enter must reach YouTube.
    items[2].inner.focus();
    await tick();
    seen.length = 0;
    const innerEnter = pressTrusted(win, KEYS.ENTER);
    await tick();
    t(
      'Enter on a focusable child of the item is left to YouTube',
      seen.length === 0 && !innerEnter.defaultPrevented,
      JSON.stringify(seen) + ' prevented=' + innerEnter.defaultPrevented
    );

    // Focus leaving the panel clears the flag and, once it has settled, the highlight.
    const outside = d.createElement('div');
    outside.setAttribute('tabindex', '0');
    d.querySelector('ytlr-app').appendChild(outside);
    outside.focus();
    await tick();
    await wait(80);
    t('and the highlight once focus has settled', !highlighted(items[2].it), items[2].it.className);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('the arrow keys outside the panel are not the panel’s', d.activeElement === outside);
    items[3].inner.focus();
    await tick();
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'focus back in the panel: highlighted and navigating again',
      d.activeElement === items[0].it && highlighted(items[0].it)
    );
  }

  // ---- the highlight goes with the focus after the panel changed ----
  {
    const { win } = await boot();
    const d = win.document;
    const { panel, items } = descriptionPanel(win, { items: 3, focus: 0 });
    await tick();
    await tick();
    t('setup: the focused item is highlighted', highlighted(items[0].it));
    // YouTube adds a row to the panel while the item is focused.
    panel.appendChild(d.createElement('div'));
    await wait(30);
    const outside = d.createElement('div');
    outside.setAttribute('tabindex', '0');
    d.querySelector('ytlr-app').appendChild(outside);
    outside.focus();
    await waitFor(() => !highlighted(items[0].it));
    t(
      'after the panel changed, focus leaving it still clears the highlight',
      !highlighted(items[0].it),
      items[0].it.className
    );
  }

  // ---- Enter after the panel changed, with the items in wrappers or in a list ----
  for (const layout of ['wrappers', 'list']) {
    const { win } = await boot();
    const d = win.document;
    const { panel, items } = descriptionPanel(win, { items: 3 });
    // The focus class goes on the wrapper or the list too, ahead of the item
    // in document order.
    if (layout === 'list') {
      const list = d.createElement('yt-dynamic-virtual-list');
      panel.appendChild(list);
      items.forEach(({ it }) => {
        list.appendChild(it);
      });
    } else {
      items.forEach(({ it }) => {
        const w = d.createElement('ytlr-chapter-renderer');
        w.className = 'ytLrChapterRenderer';
        panel.insertBefore(w, it);
        w.appendChild(it);
      });
    }
    items[0].inner.focus();
    await tick();
    await tick();
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(`setup (${layout}): Down focuses the second item`, d.activeElement === items[1].it);
    const seen = [];
    items[1].it.addEventListener('keydown', (e) => {
      if (e.__ytafSynthetic) seen.push(e.keyCode);
    });
    // YouTube re-renders a row while the item is focused.
    panel.appendChild(d.createElement('div'));
    await wait(30);
    const enter = pressTrusted(win, KEYS.ENTER);
    await tick();
    t(
      `Enter after the panel changed (${layout}) still presses the focused item`,
      seen.length === 1 && seen[0] === 13 && enter.defaultPrevented,
      JSON.stringify(seen) + ' prevented=' + enter.defaultPrevented
    );
  }

  {
    // YouTube left its focus class on the second item and its wrapper; focus
    // then lands on the first: the second loses the class.
    const { win } = await boot();
    const d = win.document;
    const { panel, items } = descriptionPanel(win, { items: 3 });
    items.forEach(({ it }) => {
      const w = d.createElement('ytlr-chapter-renderer');
      w.className = 'ytLrChapterRenderer';
      panel.insertBefore(w, it);
      w.appendChild(it);
    });
    items[1].it.classList.add('zylon-focus');
    items[1].it.parentNode.classList.add('zylon-focus');
    items[0].inner.focus();
    await tick();
    await tick();
    t(
      'an item YouTube marked inside a wrapper is cleared when focus lands on another',
      highlighted(items[0].it) && !items[1].it.classList.contains('zylon-focus'),
      items[1].it.className
    );
  }

  // ---- the item wrappers and the scroll, as each engine can do them ----
  {
    const { win } = await boot();
    const d = win.document;
    const { panel, items } = descriptionPanel(win, { items: 3 });
    // The first two items sit in YouTube's chapter wrappers; the second wrapper
    // already carries zylon-ve of its own.
    const wrappers = [0, 1].map((i) => {
      const w = d.createElement('ytlr-chapter-renderer');
      w.className = 'ytLrChapterRenderer';
      panel.insertBefore(w, items[i].it);
      w.appendChild(items[i].it);
      return w;
    });
    wrappers[1].classList.add('zylon-ve');
    // The third item's wrapper has no class of its own.
    const bare = d.createElement('ytlr-chapter-renderer');
    panel.insertBefore(bare, items[2].it);
    bare.appendChild(items[2].it);
    const scrolls = [];
    win.Element.prototype.scrollIntoView = function (arg) {
      scrolls.push(['scrollIntoView', JSON.stringify(arg)]);
    };
    win.Element.prototype.scrollIntoViewIfNeeded = function (arg) {
      scrolls.push(['scrollIntoViewIfNeeded', JSON.stringify(arg)]);
    };
    items[0].inner.focus();
    await tick();
    await tick();
    t('setup: the first wrapper is marked focused', wrappers[0].classList.contains('zylon-ve'));
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'focus moving on takes zylon-ve off the wrapper it was added to',
      !wrappers[0].classList.contains('zylon-ve') && wrappers[1].classList.contains('zylon-ve'),
      wrappers[0].className + ' / ' + wrappers[1].className
    );
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'a wrapper that had zylon-ve of its own keeps it',
      wrappers[1].classList.contains('zylon-ve'),
      wrappers[1].className
    );
    t(
      'a wrapper without a class gets no focused modifier named after nothing',
      bare.className.indexOf('undefined') === -1 && bare.classList.contains('zylon-ve'),
      bare.className
    );
    // scrollIntoView takes options from webOS 5 (Chromium 61).
    const want =
      engine !== 'webos3'
        ? ['scrollIntoView', JSON.stringify({ behavior: 'auto', block: 'center' })]
        : ['scrollIntoViewIfNeeded', 'true'];
    t(
      engine !== 'webos3'
        ? 'webOS 5+: the item is scrolled to the centre with scrollIntoView options'
        : 'Chromium 38: no scrollIntoView options (an object reads as true, align to top); centred if needed instead',
      scrolls.length === 2 && scrolls.every((s) => s[0] === want[0] && s[1] === want[1]),
      JSON.stringify(scrolls)
    );
  }

  // ---- with IntersectionObserver: a panel scrolled off screen gives up the arrow keys ----
  if (engine !== 'webos3') {
    const { win, io } = await boot();
    const d = win.document;
    const { panel, items } = descriptionPanel(win, { items: 3, focus: 0 });
    await tick();
    await tick();
    const callback = io.callbacks[io.callbacks.length - 1];
    callback([{ target: panel, isIntersecting: false }]);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('off screen: ArrowDown is left to YouTube', d.activeElement === items[0].inner);
    callback([{ target: panel, isIntersecting: true }]);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('on screen again: ArrowDown moves between the items', d.activeElement === items[1].it);
    // Focus on an item's child when the panel comes on screen: that item is highlighted.
    items[2].inner.focus();
    await tick();
    items[2].it.classList.remove('zylon-focus', 'bNqvrc');
    callback([{ target: panel, isIntersecting: false }]);
    callback([{ target: panel, isIntersecting: true }]);
    t(
      'coming on screen with focus on a child of an item highlights that item',
      highlighted(items[2].it),
      items[2].it.className
    );
    // Hidden and shown again within one delivery, focus staying on the third
    // item: the last entry is the state.
    callback([
      { target: panel, isIntersecting: false },
      { target: panel, isIntersecting: true }
    ]);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'two entries in one delivery: the last one decides, the panel keeps the arrow keys',
      d.activeElement === items[0].it,
      d.activeElement && d.activeElement.outerHTML.slice(0, 80)
    );
  } else {
    report.note('legacy: Chromium 38 has no IntersectionObserver, the off-screen case is not run');
  }

  // ---- the instance exists for the navigation with the count off ----
  {
    const { win } = await boot({ enableReturnYouTubeDislike: false });
    const d = win.document;
    const ryd = win.returnYouTubeDislike;
    t('count off: the instance exists', !!ryd && ryd.enableDislikes === false);
    const { items } = descriptionPanel(win, {
      factoids: [{ label: 'Likes', value: '10' }],
      items: 2,
      focus: 0
    });
    await wait(40);
    t('count off: no factoid is injected', !factoid(win));
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('count off: the arrow keys still navigate the panel', d.activeElement === items[1].it);
  }

  // ---- a panel YouTube replaced is re-bound ----
  {
    const { win } = await boot();
    const d = win.document;
    const first = descriptionPanel(win, {
      factoids: [{ label: 'Likes', value: '10' }],
      items: 2,
      focus: 0
    });
    await waitFor(() => factoid(win));
    t(
      'stale: the first panel got the factoid',
      !!factoid(win) && first.panel.contains(factoid(win))
    );
    // YouTube unmounts the panel and mounts a new element; focus lands on one
    // of its items. (On the item itself: the injection's mutation forgets the
    // menu items, and the next key recovers the index from the focused item.)
    first.panel.parentNode.parentNode.remove();
    // Focus fell to the body with no focusout: the keys are not the panel's any more.
    const stray = pressTrusted(win, KEYS.DOWN);
    t('stale: with the panel gone the arrow keys are left to YouTube', !stray.defaultPrevented);
    const second = descriptionPanel(win, {
      factoids: [{ label: 'Likes', value: '10' }],
      items: 3
    });
    second.items[1].it.focus();
    await waitFor(() => factoid(win) && second.panel.contains(factoid(win)));
    t(
      'stale: the new panel gets its own factoid, the only one on the page',
      !!factoid(win) &&
        second.panel.contains(factoid(win)) &&
        d.querySelectorAll('#ryd-dislike-factoid').length === 1
    );
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t('stale: the arrow keys walk the new panel’s items', d.activeElement === second.items[2].it);
  }

  // ---- the description shortcut arms the panel poll ----
  {
    const { win } = await boot({ shortcut_key_1: 'toggle_description' });
    const d = win.document;
    const ryd = win.returnYouTubeDislike;
    // The Description button under the video, as core/selectors.js finds it.
    const button = d.createElement('yt-button-container');
    const label = d.createElement('yt-formatted-string');
    label.className = 'XGffTd OqGroe';
    label.textContent = 'Description';
    button.appendChild(label);
    d.querySelector('ytlr-app').appendChild(button);
    let clicks = 0;
    button.addEventListener('click', () => clicks++);
    let polls = 0;
    const pollForPanel = ryd.pollForPanel;
    ryd.pollForPanel = function () {
      polls++;
      return pollForPanel.call(this);
    };

    // A panel mounted without focus is not found on its own: the poll is not
    // running until something arms it.
    const silent = descriptionPanel(win, { factoids: [{ label: 'Likes', value: '10' }] });
    await wait(120);
    t('without the shortcut a panel mounted without focus is not found', !factoid(win));
    silent.panel.parentNode.parentNode.remove();

    press(win, 49, d.body);
    t('the shortcut clicks the Description button', clicks === 1, String(clicks));
    await waitFor(() => polls === 1);
    t('and arms the panel poll 350 ms later', polls === 1);
    // YouTube mounts the panel a moment later, focus still elsewhere.
    descriptionPanel(win, { factoids: [{ label: 'Likes', value: '10' }] });
    await waitFor(() => factoid(win));
    t('the poll finds the panel and the factoid is injected', !!factoid(win));
  }

  // ---- the poll is bounded ----
  {
    // PANEL_POLL_MS at a hundredth: the rounds go as fast as the timers do.
    const { win } = await boot({}, { timers: { scale: 100, from: 100 } });
    const ryd = win.returnYouTubeDislike;
    // Each round looks the panel up once: counted there.
    const d = win.document;
    const realQuery = d.querySelector.bind(d);
    let lookups = 0;
    d.querySelector = (sel) => {
      if (sel === 'ytlr-structured-description-content-renderer') lookups++;
      return realQuery(sel);
    };
    ryd.pollForPanel();
    t('the poll runs while there is no panel', ryd.panelPoll.active);
    await waitFor(() => !ryd.panelPoll.active, 3000);
    // One lookup before the poll starts, then PANEL_POLL_MAX (20) rounds.
    t(
      'the poll gives up after PANEL_POLL_MAX rounds',
      !ryd.panelPoll.active && lookups === 21,
      lookups + ' lookups'
    );
    d.querySelector = realQuery;
    descriptionPanel(win, { factoids: [{ label: 'Likes', value: '10' }] });
    // Several rounds' worth, had the poll gone on.
    await wait(60);
    t('a panel mounted after that is not found until something re-arms it', !factoid(win));
  }

  // ---- the navigation survives a change of video ----
  {
    const { win } = await boot();
    const d = win.document;
    const first = win.returnYouTubeDislike;
    const { items } = descriptionPanel(win, { items: 3, focus: 0 });
    await tick();
    win.location.hash = '#/watch?v=otherVideo1';
    await wait(60);
    t('a new instance took over', win.returnYouTubeDislike !== first);
    pressTrusted(win, KEYS.DOWN);
    await tick();
    t(
      'the new instance found the open panel at init and the arrow keys work on',
      d.activeElement === items[1].it && highlighted(items[1].it)
    );
  }

  // ---- focus moving between controls on a watch page, description panel closed ----
  {
    const { win } = await boot();
    // Controls sit about 15 levels deep on a real watch page.
    const app = win.document.querySelector('ytlr-app');
    let cursor = app;
    for (let depth = 0; depth < 15; depth++) {
      const n = win.document.createElement('div');
      cursor.appendChild(n);
      cursor = n;
    }
    const buttons = [];
    for (let i = 0; i < 10; i++) {
      const b = win.document.createElement('div');
      b.setAttribute('tabindex', '0');
      cursor.appendChild(b);
      buttons.push(b);
    }
    const c = instrument(win);
    const MOVES = 40;
    for (let i = 0; i < MOVES; i++) buttons[i % buttons.length].focus();
    t(
      'a focus change costs the dislike module at most one closest() and no querySelector',
      !!win.returnYouTubeDislike && c.closest <= MOVES && c.qs === 0 && c.qsa === 0,
      JSON.stringify(c)
    );
    t(
      'and at most twenty matches() for the ancestor walk',
      c.matches <= 20 * MOVES,
      String(c.matches)
    );
  }

  report.finish();
})();
