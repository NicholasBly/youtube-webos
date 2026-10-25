/**
 * The dislike counter against the built bundle: the factoid and its number.
 * The factoid appears at once with a placeholder, fills in when the fetch
 * lands (a cold first request can take seconds), retries after a failure
 * rather than settling on 0, and shows a real zero. Then the rest of the
 * counter's life: the count cached across two visits of the same video,
 * the teardown on a hash change, the setting toggled off and on from the
 * options panel, both panel layouts, the header shift that keeps the rows
 * below the grown factoid row in place, and (webOS 22+) the injection waiting
 * for the panel to be on screen. The panel's keyboard navigation is in
 * return-dislike-navigation-test.cjs.
 *
 * Run: node tests/behaviour/return-dislike-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour, engine } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  tick,
  descriptionPanel,
  panelCheckbox,
  intersectionStub,
  showPanel,
  clock
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

const API = 'https://returnyoutubedislikeapi.com/votes?videoId=';
const VIDEO = 'dQw4w9WgXcQ';

/**
 * A fetch answering every request with `count` (a number, or counts by video
 * id), the urls recorded.
 */
function countingFetch(count, urls) {
  return (url) => {
    urls.push(String(url));
    const id = String(url).slice(API.length);
    const dislikes = typeof count === 'number' ? count : count[id];
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ dislikes }) });
  };
}

// A watch page with the dislike counter on. The panel poll (500 ms), the
// injection debounce (200 ms), the per-video start (500 ms) and the fetch
// retries (1.2 s per attempt) all at a tenth; the focus settle (50 ms) stays.
function boot(fetchImpl, more) {
  const o = Object.assign(
    {
      page: 'watch',
      config: { enableReturnYouTubeDislike: true },
      fetch: fetchImpl,
      timers: { scale: 10, from: 100 }
    },
    more
  );
  let io = null;
  const setup = o.setup;
  o.setup = (win) => {
    if (engine !== 'webos3') io = intersectionStub(win);
    if (setup) setup(win);
  };
  const page = createPage(o);
  page.io = io;
  return page;
}

// The user opens the description panel: YouTube mounts it with the likes
// factoid, and focus lands in it, which is how the instance finds it.
const openPanel = (win) =>
  descriptionPanel(win, { factoids: [{ label: 'Likes', value: '1.2M' }], focus: 'factoid' });
const factoid = (win) => win.document.getElementById('ryd-dislike-factoid');
const factoids = (win) => win.document.querySelectorAll('#ryd-dislike-factoid').length;
const valueOf = (win) => {
  const f = factoid(win);
  if (!f) return null;
  const v = f.querySelector('.ytLrVideoDescriptionHeaderRendererValue, .axf6h');
  return v ? v.textContent : null;
};
/**
 * The compact description panel YouTube draws on some sets: its own container
 * and factoid classes, the likes factoid with `valueClass` and `labelClass` on
 * its parts; put in front of the app's content when `first`.
 */
function compactPanel(win, valueClass, labelClass, first) {
  const d = win.document;
  const panel = d.createElement('ytlr-structured-description-content-renderer');
  const container = d.createElement('div');
  container.className = 'rznqCe';
  const likes = d.createElement('div');
  likes.className = 'nOJlw';
  likes.setAttribute('idomkey', 'factoid-0');
  likes.setAttribute('aria-label', '2K Likes');
  likes.setAttribute('tabindex', '0');
  likes.innerHTML = `<span class="${valueClass}">2K</span><span class="${labelClass}">Likes</span>`;
  container.appendChild(likes);
  panel.appendChild(container);
  const app = d.querySelector('ytlr-app');
  if (first) app.insertBefore(panel, app.firstChild);
  else app.appendChild(panel);
  return { panel, container, likes };
}

// The hash change to another video, and the moment the per-video sync has acted on it.
/** Another video: the hash changes and the instance for it is up (the per-video sync waits 10 ms). */
const goTo = async (win, id) => {
  win.location.hash = '#/watch?v=' + id;
  await waitFor(() => win.returnYouTubeDislike && win.returnYouTubeDislike.videoID === id);
  await wait(20);
};

(async () => {
  // ---- 1. Slow API: panel must still get a factoid immediately ----
  {
    const answers = [];
    const { win } = boot(
      () =>
        new Promise((res) => {
          answers.push(res);
        }),
      // The 8 s API timeout keeps its length: run into on a loaded machine, it
      // would drop the request this case answers.
      { timers: { scale: 10, from: 100, to: 8000 } }
    );
    await waitFor(() => win.returnYouTubeDislike);
    openPanel(win);
    await waitFor(() => factoid(win));

    t(
      'slow API: factoid injected before the fetch returns',
      !!factoid(win),
      'instance=' +
        !!win.returnYouTubeDislike +
        ' panel=' +
        (win.returnYouTubeDislike && !!win.returnYouTubeDislike.panelElement)
    );
    t('slow API: shows a placeholder, not a fake 0', valueOf(win) === '—', valueOf(win));

    t('setup: one request so far', answers.length === 1, String(answers.length));
    for (const answer of answers) {
      answer({ ok: true, status: 200, json: () => Promise.resolve({ dislikes: 4321 }) });
    }
    await waitFor(() => valueOf(win) === '4.3k');
    t('slow API: value filled in when the fetch lands', valueOf(win) === '4.3k', valueOf(win));
    t(
      'slow API: aria-label updated too',
      factoid(win) && factoid(win).getAttribute('aria-label') === '4.3k Dislikes',
      factoid(win) && factoid(win).getAttribute('aria-label')
    );
  }

  // ---- 2. Failing API: must retry, and must not render a permanent 0 ----
  {
    let calls = 0;
    const { win } = boot(() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('network down'));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ dislikes: 987 })
      });
    });
    await waitFor(() => win.returnYouTubeDislike);
    openPanel(win);
    // Injected within a frame or two of the panel opening, later under load.
    await waitFor(() => !!factoid(win));
    t('failing API: factoid still injected', !!factoid(win));
    t('failing API: does NOT claim zero dislikes', valueOf(win) !== '0', valueOf(win));

    // Retries are 1.2 s and 2.4 s apart, 120 ms and 240 ms with the timer scale.
    await waitFor(() => valueOf(win) === '987', 3000);
    t(
      'failing API: retried and recovered',
      valueOf(win) === '987',
      valueOf(win) + ' after ' + calls + ' calls'
    );
  }

  {
    // The API down for good: three retries after the first try, then none.
    let calls = 0;
    const { win } = boot(() => {
      calls++;
      return Promise.reject(new Error('network down'));
    });
    await waitFor(() => win.returnYouTubeDislike);
    // Retries 1.2, 2.4 and 3.6 s apart, at a tenth.
    await waitFor(() => calls >= 4, 3000);
    await wait(500);
    t('failing API: three retries, then no more', calls === 4, calls + ' calls');
  }

  // ---- 3. Healthy API: unchanged behaviour ----
  {
    const { win } = boot(countingFetch(12, []));
    await waitFor(() => win.returnYouTubeDislike);
    // Every timer the instance schedules from here, by name.
    const ryd = win.returnYouTubeDislike;
    const scheduled = [];
    const realSchedule = ryd.schedule.bind(ryd);
    ryd.schedule = (cb, ms, name) => {
      scheduled.push(name);
      return realSchedule(cb, ms, name);
    };
    const injectPasses = () => scheduled.filter((n) => n === 'inject').length;
    openPanel(win);
    await waitFor(() => valueOf(win) === '12');
    t('healthy API: correct count on first paint', valueOf(win) === '12', valueOf(win));
    t('healthy API: exactly one factoid injected', factoids(win) === 1, String(factoids(win)));
    const likes = win.document.querySelector('div[idomkey="factoid-0"]');
    t(
      'the factoid is cloned from the likes factoid and put right after it',
      likes.nextElementSibling === factoid(win) &&
        factoid(win).className === likes.className &&
        factoid(win).getAttribute('idomkey') === 'factoid-ryd',
      factoid(win).outerHTML
    );
    t(
      'the factoid container is marked ready, which is what the wrap styles key on',
      likes.parentElement.classList.contains('ryd-ready')
    );
    // The factoid going in is a mutation of the panel too: it must not schedule
    // an injection pass of its own, while YouTube's rows re-rendering still do.
    t(
      'the instance’s own writes schedule no injection pass',
      injectPasses() === 0,
      String(injectPasses())
    );
    likes.parentElement.appendChild(win.document.createElement('div'));
    await wait(0);
    t(
      'a row YouTube adds to the panel schedules one',
      injectPasses() === 1,
      String(injectPasses())
    );
    t(
      'a mutation burst in the panel does not inject a second factoid',
      await (async () => {
        likes.parentElement.appendChild(win.document.createElement('div'));
        likes.parentElement.appendChild(win.document.createElement('div'));
        await wait(40);
        return factoids(win) === 1;
      })(),
      String(factoids(win))
    );
  }

  // ---- 4. A genuine zero must still read as 0 ----
  {
    const { win } = boot(countingFetch(0, []));
    await waitFor(() => win.returnYouTubeDislike);
    openPanel(win);
    await waitFor(() => valueOf(win) === '0');
    t('a real zero still renders as 0', valueOf(win) === '0', valueOf(win));
  }

  // ---- 5. The cache across two visits, and the teardown in between ----
  {
    const urls = [];
    const { win } = boot(countingFetch({ [VIDEO]: 55, otherVideo1: 9 }, urls));
    await waitFor(() => win.returnYouTubeDislike);
    const first = win.returnYouTubeDislike;
    openPanel(win);
    await waitFor(() => valueOf(win) === '55');
    t('first visit: the count is fetched once', urls.length === 1 && urls[0] === API + VIDEO);
    t('first visit: the count is on the panel', valueOf(win) === '55', valueOf(win));
    const firstFactoid = factoid(win);

    // Another video: the panel element stays on the page, so the teardown has
    // to take its factoid out itself, and the next instance finds the panel
    // at init and puts its own in.
    await goTo(win, 'otherVideo1');
    t(
      'another video: a fresh instance for the new id',
      win.returnYouTubeDislike !== first && win.returnYouTubeDislike.videoID === 'otherVideo1',
      win.returnYouTubeDislike && win.returnYouTubeDislike.videoID
    );
    t(
      'another video: the old factoid is taken out of the panel',
      !win.document.contains(firstFactoid)
    );
    t(
      'another video: its own count is fetched',
      urls.length === 2 && urls[1] === API + 'otherVideo1',
      urls.join(' ')
    );
    await waitFor(() => factoids(win) === 1 && valueOf(win) === '9');
    t(
      'another video: the new instance finds the open panel and shows its count',
      factoids(win) === 1 && factoid(win) !== firstFactoid && valueOf(win) === '9',
      factoids(win) + ' factoid(s), ' + valueOf(win)
    );

    // Back to the first video within CACHE_MS: no fetch, the count from memory.
    await goTo(win, VIDEO);
    t(
      'second visit within CACHE_MS: no fetch for the same video',
      urls.length === 2,
      urls.join(' ')
    );
    await waitFor(() => valueOf(win) === '55');
    t('second visit: the cached count is shown', valueOf(win) === '55', valueOf(win));

    // Off the watch page there is no instance at all.
    win.location.hash = '#/browse';
    await waitFor(() => win.returnYouTubeDislike === null);
    t('leaving the watch page tears the instance down', win.returnYouTubeDislike === null);
    t('and takes the factoid with it', !factoid(win));
  }

  {
    // The cache holds a count for five minutes, on the page's clock.
    const urls = [];
    let c;
    const { win } = boot(countingFetch({ [VIDEO]: 55, otherVideo1: 9 }, urls), {
      setup: (w) => {
        c = clock(w);
      }
    });
    await waitFor(() => urls.length === 1);
    await goTo(win, 'otherVideo1');
    await goTo(win, VIDEO);
    t('setup: back within five minutes, no fetch', urls.length === 2, urls.join(' '));
    await goTo(win, 'otherVideo1');
    c.offset += 300001;
    await goTo(win, VIDEO);
    await waitFor(() => urls.length === 3);
    t(
      'back after five minutes: the count is fetched again',
      urls.length === 3 && urls[2] === API + VIDEO,
      urls.join(' ')
    );
  }
  if (engine !== 'webos3') {
    // Leaving the video while its count is on the way drops the request.
    const signals = [];
    const { win } = boot((url, opts) => {
      signals.push(opts && opts.signal);
      return new Promise(() => {});
    });
    await waitFor(() => signals.length === 1);
    win.location.hash = '#/browse';
    await waitFor(() => win.returnYouTubeDislike === null);
    t(
      'with AbortController: leaving the video aborts the request for its count',
      !!signals[0] && signals[0].aborted === true
    );
  }

  // ---- 6. The setting toggled at runtime through the options panel ----
  {
    const urls = [];
    const { win, pump } = boot(countingFetch(7, urls));
    await waitFor(() => win.returnYouTubeDislike);
    const { panel } = openPanel(win);
    await waitFor(() => valueOf(win) === '7');
    t('toggle: the count is on the panel first', valueOf(win) === '7', valueOf(win));

    await showPanel(win, pump);
    const box = panelCheckbox(win, 'Return YouTube Dislike');
    t('the Return YouTube Dislike checkbox is on the options panel', !!box && box.checked === true);
    box.click();
    await waitFor(() => {
      const r = win.returnYouTubeDislike;
      return r && !factoid(win);
    });
    const off = win.returnYouTubeDislike;
    t('off: the instance stays (the panel navigation is its too)', !!off);
    t('off: the factoid is removed', !factoid(win));
    win.ytaf_showOptionsPanel(false);
    await wait(20);
    panel.querySelector('div[idomkey="factoid-0"]').focus();
    await wait(60);
    t('off: focus in the description panel injects nothing', !factoid(win));

    await showPanel(win, pump);
    panelCheckbox(win, 'Return YouTube Dislike').click();
    await waitFor(() => {
      const r = win.returnYouTubeDislike;
      return r && r !== off && valueOf(win) === '7';
    });
    const on = win.returnYouTubeDislike;
    t('on again: a new instance', !!on && on !== off);
    // The panel stayed tracked while the count was off: the factoid comes
    // back with no focus and no fetch.
    t(
      'on again: the panel already on the page gets the factoid back without a fetch',
      valueOf(win) === '7' && urls.length === 1,
      valueOf(win) + ' after ' + urls.length + ' fetches'
    );
  }

  // ---- 7. The compact panel layout ----
  {
    const { win } = boot(countingFetch(300, []));
    await waitFor(() => win.returnYouTubeDislike);
    const { container, likes } = compactPanel(win, 'axf6h', 'Ph2lNb');
    likes.focus();
    await waitFor(() => valueOf(win) === '300');
    const f = factoid(win);
    t('compact layout: the factoid is injected after the likes', likes.nextElementSibling === f);
    t(
      'compact layout: cloned with the compact classes, value and label',
      !!f &&
        f.className === 'nOJlw' &&
        f.querySelector('.axf6h').textContent === '300' &&
        f.querySelector('.Ph2lNb').textContent === 'Dislikes' &&
        f.getAttribute('aria-label') === '300 Dislikes',
      f && f.outerHTML
    );
    t(
      'compact layout: the compact container is marked ready',
      container.classList.contains('ryd-ready')
    );
  }

  // ---- 8. The header shift under the grown factoid row ----
  {
    const { win } = boot(countingFetch(1500, []), { layout: true });
    await waitFor(() => win.returnYouTubeDislike);
    const d = win.document;
    // YouTube's virtual list: a box of absolutely positioned rows, each
    // measured once into an inline height. The header row holds the factoid
    // container; the rows below are positioned from the header's old height.
    const build = (headerHeight) => {
      const { panel, factoids: rows } = descriptionPanel(win, {
        factoids: [{ label: 'Likes', value: '1.2M' }]
      });
      const container = rows[0].parentElement;
      const list = d.createElement('yt-virtual-list');
      const box = d.createElement('div');
      const mkRow = (height) => {
        const row = d.createElement('div');
        if (height) row.style.height = height;
        row.appendChild(d.createElement('div'));
        box.appendChild(row);
        return row;
      };
      const header = mkRow(headerHeight);
      header.firstElementChild.appendChild(container);
      const below = [mkRow('3rem'), mkRow('3rem')];
      list.appendChild(box);
      panel.appendChild(list);
      return { panel, list, header, below, likes: rows[0] };
    };
    const styleText = () => {
      const s = d.getElementById('ryd-shift-style');
      return s ? s.textContent : null;
    };

    // The content box measures 100 px (the layout stub); YouTube measured the
    // row at 5rem = 80 px: the rows below move down by the 20 px difference.
    const a = build('5rem');
    a.likes.focus();
    // The shift is worked out in the pass that injects the factoid.
    await waitFor(() => !!factoid(win));
    t('header shift: the factoid is in the header row', !!factoid(win));
    t(
      'header shift: the rows below the header are pushed down by the growth',
      styleText() ===
        'yt-virtual-list[data-ryd-shift] > div > div:not([data-ryd-header]) { margin-top: 20px !important; }',
      styleText()
    );
    t(
      'header shift: the list and the header row are marked, the rows below are not',
      a.list.hasAttribute('data-ryd-shift') &&
        a.header.hasAttribute('data-ryd-header') &&
        a.below.every((r) => !r.hasAttribute('data-ryd-header'))
    );
    // A row re-rendering under the header runs the pass again: the same list,
    // row and measurement write nothing.
    const writes = { n: 0 };
    const P = win.Element.prototype;
    for (const name of ['setAttribute', 'removeAttribute']) {
      const real = P[name];
      P[name] = function (...args) {
        writes.n++;
        return real.apply(this, args);
      };
    }
    a.below[1].firstElementChild.appendChild(d.createElement('span'));
    await wait(60);
    t(
      'header shift: a re-render that changes nothing writes no attribute and keeps the rule',
      writes.n === 0 && a.header.hasAttribute('data-ryd-header'),
      `${writes.n} writes; ` + styleText()
    );
    // YouTube measures the header row anew (4rem = 64 px): the next pass
    // measures again and moves the rows below by the new difference.
    a.header.style.height = '4rem';
    a.below[1].firstElementChild.appendChild(d.createElement('span'));
    await waitFor(() => (styleText() || '').indexOf('margin-top: 36px') !== -1);
    t(
      'header shift: a header row measured anew is measured again',
      (styleText() || '').indexOf('margin-top: 36px') !== -1,
      styleText()
    );
    // The list is rebuilt around the same factoid container: the marks move
    // to the new list and its header row, and leave the old ones.
    const list2 = d.createElement('yt-virtual-list');
    const box2 = d.createElement('div');
    const header2 = d.createElement('div');
    header2.style.height = '5rem';
    header2.appendChild(d.createElement('div'));
    box2.appendChild(header2);
    list2.appendChild(box2);
    header2.firstElementChild.appendChild(a.likes.parentElement);
    a.panel.appendChild(list2);
    await waitFor(() => list2.hasAttribute('data-ryd-shift'));
    t(
      'header shift: a rebuilt list takes the marks, the old list drops them',
      list2.hasAttribute('data-ryd-shift') &&
        header2.hasAttribute('data-ryd-header') &&
        !a.list.hasAttribute('data-ryd-shift') &&
        !a.header.hasAttribute('data-ryd-header') &&
        (styleText() || '').indexOf('margin-top: 20px') !== -1,
      styleText()
    );
    // The same list, the container now in another of its rows: the mark
    // moves with it and leaves the row it was on.
    const row3 = d.createElement('div');
    row3.style.height = '5rem';
    row3.appendChild(d.createElement('div'));
    box2.appendChild(row3);
    row3.firstElementChild.appendChild(a.likes.parentElement);
    await waitFor(() => row3.hasAttribute('data-ryd-header'));
    t(
      'header shift: the container moved to another row of the list takes the mark with it',
      row3.hasAttribute('data-ryd-header') && !header2.hasAttribute('data-ryd-header')
    );
    // The panel closes, then the video changes: the teardown clears the shift.
    const first = win.returnYouTubeDislike;
    a.panel.parentNode.parentNode.remove();
    await goTo(win, 'otherVideo2');
    t(
      'header shift: cleared on teardown, the marks and the rule gone',
      win.returnYouTubeDislike !== first &&
        !a.list.hasAttribute('data-ryd-shift') &&
        !a.header.hasAttribute('data-ryd-header') &&
        styleText() === '',
      styleText()
    );

    // A row YouTube measured at the box's own height: nothing to shift.
    const b = build('100px');
    b.likes.focus();
    await waitFor(() => !!factoid(win));
    t('header shift: a row that did not grow gets no rule', !!factoid(win) && styleText() === '');
    t('header shift: but the list is still tracked', b.list.hasAttribute('data-ryd-shift'));
    b.panel.parentNode.parentNode.remove();
    await goTo(win, 'otherVideo3');

    // A row YouTube never measured (no inline height): shifting against a
    // bogus height would make things worse, so nothing is marked.
    const c = build('');
    c.likes.focus();
    await waitFor(() => !!factoid(win));
    t(
      'header shift: an unmeasured header row is left alone',
      !!factoid(win) && !c.list.hasAttribute('data-ryd-shift') && styleText() === ''
    );
  }

  // ---- 9. With IntersectionObserver: the injection waits for the panel to be on screen ----
  if (engine !== 'webos3') {
    const { win, io } = boot(countingFetch(42, []));
    await waitFor(() => win.returnYouTubeDislike);
    const { panel, factoids: rows } = openPanel(win);
    // Focus bound the panel just now; the stub reports it on screen on the next tick.
    t('on screen: the panel is observed once it is bound', io.observed === 1, String(io.observed));
    t('on screen: nothing is injected before the observer reports', !factoid(win));
    await tick();
    await tick();
    t(
      'on screen: the factoid is injected once the panel intersects',
      valueOf(win) === '42',
      valueOf(win)
    );
    // Off screen and on again is return-dislike-navigation-test's (the arrow
    // keys); a second report must not inject twice.
    const callback = io.callbacks[io.callbacks.length - 1];
    callback([{ target: panel, isIntersecting: true }]);
    t('rows are not injected twice by the second report', factoids(win) === 1);

    await goTo(win, 'otherVideo4');
    t('teardown disconnects the observer', io.disconnected >= 1, String(io.disconnected));
    rows[0].focus();
    await tick();
    await tick();
    t(
      'the next instance observes the panel afresh',
      io.observed === 2 && factoids(win) === 1,
      io.observed + ' observed, ' + factoids(win) + ' factoid(s)'
    );
  } else {
    report.note('legacy: Chromium 38 has no IntersectionObserver, the on-screen branch is not run');
    const { win } = boot(countingFetch(42, []));
    await waitFor(() => win.returnYouTubeDislike);
    openPanel(win);
    t(
      'legacy: the factoid is injected the moment focus binds the panel',
      valueOf(win) === '42',
      valueOf(win)
    );
  }

  // ---- 10. The setting and the hash change within the same 10 ms ----
  {
    const { win, pump } = boot(countingFetch(5, []));
    await waitFor(() => win.returnYouTubeDislike);
    const first = win.returnYouTubeDislike;
    await showPanel(win, pump);
    panelCheckbox(win, 'Return YouTube Dislike').click();
    // The same video under a new hash, right after the toggle.
    win.location.hash = '#/watch?v=' + first.videoID + '&t=5s';
    await waitFor(() => win.returnYouTubeDislike && win.returnYouTubeDislike !== first);
    const now = win.returnYouTubeDislike;
    t(
      'a hash change right after the toggle does not swallow the restart',
      !!now && now !== first && now.enableDislikes === false,
      now ? 'enableDislikes ' + now.enableDislikes : 'no instance'
    );
    win.ytaf_showOptionsPanel(false);
  }

  // ---- 11. Letting go of a panel ----
  {
    const { win } = boot(countingFetch(5, []));
    await waitFor(() => win.returnYouTubeDislike);
    const { panel } = openPanel(win);
    await waitFor(() => valueOf(win) === '5');
    const row = panel.querySelector('.ytLrVideoDescriptionHeaderRendererFactoidContainer');
    t('setup: the factoid row is rearranged', row.classList.contains('ryd-ready'));
    // Flex gap is Chrome 84: the legacy engines space the factoids with margins.
    t(
      flavour === 'legacy'
        ? 'legacy: the row is marked for margins instead of the flex gap Chromium 38 to 79 lack'
        : 'webOS 22+: the row keeps the flex gap, no margin class',
      row.classList.contains('ryd-no-flex-gap') === (flavour === 'legacy'),
      row.className
    );
    win.returnYouTubeDislike.destroy();
    t(
      "destroy gives YouTube's factoid row its layout back",
      !factoid(win) &&
        !row.classList.contains('ryd-ready') &&
        !row.classList.contains('ryd-no-flex-gap'),
      row.className
    );
  }
  {
    // The compact layout with class names YouTube has since renamed: the clone
    // would carry the likes, not a dislike count.
    const { win } = boot(countingFetch(5, []));
    await waitFor(() => win.returnYouTubeDislike);
    const { container, likes } = compactPanel(win, 'renamedA', 'renamedB');
    likes.focus();
    await wait(100);
    t(
      'a factoid without the value and label elements is not inserted as a second likes factoid',
      !factoid(win) && container.children.length === 1,
      String(container.children.length)
    );
  }
  {
    // A second panel comes first in the page and the poll binds it while the
    // first is still there: the second gets its own layout and the factoid.
    const { win } = boot(countingFetch(5, []));
    await waitFor(() => win.returnYouTubeDislike);
    openPanel(win);
    await waitFor(() => valueOf(win) === '5');
    const { panel: compact } = compactPanel(win, 'axf6h', 'Ph2lNb', true);
    win.returnYouTubeDislike.pollForPanel();
    await waitFor(() => factoid(win) && compact.contains(factoid(win)));
    t(
      'a second panel bound by the poll gets its own layout and the factoid',
      !!factoid(win) && compact.contains(factoid(win)) && factoids(win) === 1,
      factoids(win) + ' factoid(s)'
    );
  }
  if (flavour === 'modern') {
    // The tracked panel goes stale; the same node comes back on screen before
    // anything binds it again.
    const { win, io } = boot(countingFetch(5, []));
    await waitFor(() => win.returnYouTubeDislike);
    const { panel } = openPanel(win);
    await waitFor(() => valueOf(win) === '5');
    const callback = io.callbacks[io.callbacks.length - 1];
    const before = io.disconnected;
    const wrap = panel.parentNode.parentNode;
    wrap.remove();
    const d = win.document;
    const button = d.createElement('button');
    d.querySelector('ytlr-app').appendChild(button);
    button.focus();
    await waitFor(() => io.disconnected > before);
    t(
      'a stale panel is let go of: its observers are disconnected',
      io.disconnected > before,
      before + ' -> ' + io.disconnected
    );
    d.querySelector('ytlr-app').appendChild(wrap);
    let error = null;
    try {
      callback([{ target: panel, isIntersecting: true }]);
    } catch (e) {
      error = e.message;
    }
    t('a late report for the released panel does nothing', error === null, error);
  }

  report.finish();
})();
