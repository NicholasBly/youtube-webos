/**
 * The small hooks and fixes against the built bundle, each flavour on the
 * oldest webOS it runs on, the page default (the fetch registry on its own is tests/unit/fetch-registry-test.cjs):
 * the registry cancelling telemetry for Tracking Block, the resolveCommand hook
 * carrying the language fix (PREF cookie plus reload) and passing everything
 * else through, the cast block on webOS 25 (the webOS 22+ bundle only: the
 * legacy one leaves it out; fetch called on another object still works), the
 * legacy fetch polyfill sending a URLSearchParams body urlencoded, and the
 * comments-panel fix deriving its override
 * from YouTube's own stylesheet: at startup, and through its focus backstop
 * once the startup rescan has stopped.
 *
 * Run: node tests/behaviour/hooks-and-fixes-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait, waitFor, rejectsWithTypeError } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// The fetch registry needs the fetch API types, which Chromium 38 (and jsdom)
// lack: these pages are modern ones with Node's Request standing in.
const modern = (w) => {
  w.Request = Request;
  w.Response = Response;
};

/** A fetch stub that records what reached it and answers with an empty JSON body. */
function fetchStub(calls) {
  return (url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  };
}

/**
 * A modern page for the comments fix with no collapsing rule in any
 * stylesheet, the startup rescan (every 1 s) at a hundredth, and a counter
 * of the reads of document.styleSheets: every scan of the stylesheets starts
 * with one, so the count says how often the fix looked.
 */
function commentsFixPage() {
  const reads = { n: 0 };
  const { win } = createPage({
    timers: { scale: 100, from: 1000 },
    setup(w) {
      modern(w);
      let proto = w.document;
      let desc;
      while (proto && !desc) {
        desc = Object.getOwnPropertyDescriptor(proto, 'styleSheets');
        proto = Object.getPrototypeOf(proto);
      }
      const get = desc.get;
      Object.defineProperty(w.document, 'styleSheets', {
        configurable: true,
        get() {
          reads.n++;
          return get.call(this);
        }
      });
    }
  });
  const d = win.document;
  // A side panel the way the overlay hosts it, and a control outside any panel.
  const app = d.querySelector('ytlr-app');
  const panel = d.createElement('div');
  panel.className = 'AmQJbe';
  const inPanel = d.createElement('div');
  inPanel.tabIndex = 0;
  panel.appendChild(inPanel);
  const outside = d.createElement('div');
  outside.tabIndex = 0;
  app.appendChild(panel);
  app.appendChild(outside);
  const fix = () => d.getElementById('ytaf-comments-close-fix');
  return { win, reads, inPanel, outside, fix };
}

(async () => {
  // ---- fetch registry in the bundle: Tracking Block cancels telemetry -------------
  {
    const calls = [];
    const { win } = createPage({
      config: { enableTrackingBlock: true },
      fetch: fetchStub(calls),
      setup: modern
    });
    const blocked = await rejectsWithTypeError(
      win.fetch('https://www.youtube.com/api/stats/qoe?ns=yt')
    );
    t('a telemetry request is cancelled as a failed fetch', blocked);
    t(
      'the cancelled request never reaches the network',
      !calls.some((u) => /api\/stats/.test(u)),
      calls.join(' | ')
    );
    const res = await win.fetch('https://www.youtube.com/youtubei/v1/browse?key=x');
    t(
      'an ordinary request passes through to the original fetch',
      res && res.ok === true && calls.some((u) => /youtubei\/v1\/browse/.test(u)),
      calls.join(' | ')
    );
    const req = new win.Request('https://www.youtube.com/youtubei/v1/log_event?alt=json');
    t('a Request object is matched on its url too', await rejectsWithTypeError(win.fetch(req)));
    // Deliberately not blocked: it registers the view for the creator.
    const watch = await win.fetch('https://www.youtube.com/api/stats/watchtime?x=1');
    t(
      'the watchtime ping is left alone',
      watch && watch.ok === true && calls.some((u) => u.indexOf('/api/stats/watchtime') !== -1),
      calls.join(' | ')
    );
  }
  {
    const calls = [];
    const { win } = createPage({
      config: { enableTrackingBlock: false },
      fetch: fetchStub(calls),
      setup: modern
    });
    const res = await win.fetch('https://www.youtube.com/api/stats/qoe?ns=yt');
    t(
      'without Tracking Block the fast path hands telemetry straight through',
      res && res.ok === true && calls.length === 1,
      calls.join(' | ')
    );
  }

  // ---- resolveCommand hook and the language fix -----------------------------------
  {
    const original = [];
    let instance;
    const { win } = createPage({
      setup(w) {
        modern(w);
        instance = {
          resolveCommand(command, extra) {
            original.push({ command, extra });
            return 'original-result';
          }
        };
        const Target = function () {};
        Target.instance = instance;
        w._yttv = { Decoy: 42, Target };
      }
    });
    // The poll for the hook target finds it on its first rounds.
    await waitFor(() => instance.resolveCommand.toString().indexOf('original-result') === -1);
    t(
      'the hook replaces resolveCommand on the found instance',
      typeof instance.resolveCommand === 'function' &&
        instance.resolveCommand.toString().indexOf('original-result') === -1
    );

    const passthrough = instance.resolveCommand({ openPopupAction: { a: 1 } }, 'extra');
    t(
      'other commands reach the original with their arguments',
      passthrough === 'original-result' &&
        original.length === 1 &&
        original[0].command.openPopupAction.a === 1 &&
        original[0].extra === 'extra'
    );

    const handled = instance.resolveCommand({
      setClientSettingEndpoint: {
        settingDatas: [
          { clientSettingEnum: { item: 'AUTOPLAY' }, boolValue: true },
          { clientSettingEnum: { item: 'I18N_LANGUAGE' }, stringValue: 'de' }
        ]
      }
    });
    t('a language change is handled by the fix', handled === true);
    t(
      'the PREF cookie carries the new language',
      /(?:^|; )PREF=[^;]*hl=de/.test(win.document.cookie),
      win.document.cookie
    );
    t(
      'the app is asked to reload instead of applying the setting',
      original.length === 2 &&
        original[1].command.signalAction &&
        original[1].command.signalAction.signal === 'RELOAD_PAGE',
      JSON.stringify(original[1] && original[1].command)
    );

    const other = instance.resolveCommand({
      setClientSettingEndpoint: { settingDatas: [{ clientSettingEnum: { item: 'AUTOPLAY' } }] }
    });
    t(
      'a settings change without a language goes to the original',
      other === 'original-result' && original.length === 3
    );

    // A language entry without a value: nothing to write, the command goes on as sent.
    const cookieBefore = win.document.cookie;
    const noValue = instance.resolveCommand({
      setClientSettingEndpoint: {
        settingDatas: [
          { clientSettingEnum: { item: 'AUTOPLAY' }, boolValue: false },
          { clientSettingEnum: { item: 'I18N_LANGUAGE' } }
        ]
      }
    });
    t(
      'a language entry without a value is passed on whole, no hl=undefined',
      noValue === 'original-result' &&
        original.length === 4 &&
        original[3].command.setClientSettingEndpoint.settingDatas.length === 2 &&
        win.document.cookie === cookieBefore &&
        win.document.cookie.indexOf('undefined') === -1,
      win.document.cookie
    );
  }

  // ---- resolveCommand hook: no target at load, one that appears later ------------
  {
    const original = [];
    // Every look at the one key there: once per round of the poll.
    let looks = 0;
    // The poll for the target backs off from 16 ms to 1 s, at a tenth here.
    const { win } = createPage({
      timers: { scale: 10, from: 100 },
      setup(w) {
        modern(w);
        w._yttv = {};
        Object.defineProperty(w._yttv, 'Decoy', {
          enumerable: true,
          get: () => {
            looks++;
            return 42;
          }
        });
      }
    });
    // The first look at load, then the rounds at 16 and 48 ms.
    await waitFor(() => looks >= 3);
    t('without a hook target the page loads and keeps polling', looks >= 3, `${looks} looks`);
    const instance = {
      resolveCommand(command, extra) {
        original.push({ command, extra });
        return 'original-result';
      }
    };
    const Target = function () {};
    Target.instance = instance;
    win._yttv.Target = Target;
    await waitFor(() => instance.resolveCommand.toString().indexOf('original-result') === -1);
    t(
      'a hook target built after load is found by the poll and hooked',
      instance.resolveCommand.toString().indexOf('original-result') === -1
    );
    const handled = instance.resolveCommand({
      setClientSettingEndpoint: {
        settingDatas: [{ clientSettingEnum: { item: 'I18N_LANGUAGE' }, stringValue: 'fr' }]
      }
    });
    t(
      'and the language fix works through it',
      handled === true && /(?:^|; )PREF=[^;]*hl=fr/.test(win.document.cookie),
      win.document.cookie
    );
  }

  // ---- webOS 25: the cast wake-up is blocked --------------------------------------
  if (flavour === 'modern') {
    const calls = [];
    const { win } = createPage({ ua: 'webos25', fetch: fetchStub(calls), setup: modern });
    t(
      'webOS 25: /wake_cast_core is cancelled',
      await rejectsWithTypeError(win.fetch('https://www.youtube.com/wake_cast_core'))
    );
    const res = await win.fetch('https://www.youtube.com/youtubei/v1/next');
    t('webOS 25: other requests pass', res && res.ok === true);
    t(
      'webOS 25: the wake-up given as a URL object is cancelled too',
      await rejectsWithTypeError(win.fetch(new win.URL('https://www.youtube.com/wake_cast_core')))
    );
  }
  if (flavour === 'modern') {
    // fetch called as a method of another object: the native one throws
    // "Illegal invocation" for any receiver but the window.
    const calls = [];
    // Called only after the page exists.
    const strictFetch = function (url) {
      if (this != null && this !== win) {
        return Promise.reject(new TypeError('Illegal invocation'));
      }
      calls.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    };
    const { win } = createPage({ ua: 'webos25', fetch: strictFetch, setup: modern });
    const holder = { fetch: win.fetch };
    const res = await holder.fetch('https://www.youtube.com/youtubei/v1/next').catch((e) => e);
    t(
      'webOS 25: fetch called on another object still reaches the native one with the window',
      !!res && res.ok === true && calls.length === 1,
      String(res && (res.message || res.ok))
    );
  }
  if (flavour === 'modern') {
    const calls = [];
    const { win } = createPage({ ua: 'webos23', fetch: fetchStub(calls), setup: modern });
    const res = await win.fetch('https://www.youtube.com/wake_cast_core');
    t('webOS 23: the cast wake-up is left alone', res && res.ok === true && calls.length === 1);
  }

  // ---- webOS 3: the bundle's fetch polyfill sends a URLSearchParams body urlencoded ----
  if (flavour === 'legacy') {
    const { win } = createPage({ fetch: false });
    const req = new win.Request('https://www.youtube.com/x', {
      method: 'POST',
      body: new win.URLSearchParams('a=1&b=two words')
    });
    const body = await req.text();
    t(
      'a URLSearchParams body is sent urlencoded, with its content type',
      body === 'a=1&b=two+words' &&
        /application\/x-www-form-urlencoded/.test(req.headers.get('content-type') || ''),
      JSON.stringify(body) + ' ' + req.headers.get('content-type')
    );
  }

  // ---- comments-panel fix: the override follows YouTube's stylesheet ----------------
  {
    const { win } = createPage({
      html: `<!doctype html><html><head><style>
          .unrelated { height: 0px; }
          ytlr-animated-overlay.frHKed .RowList { height: 0px; }
          @media (min-width: 1px) { .frHKed .Panel { display: none; } }
          .frHKed .Keep { color: red; }
        </style></head><body class="WEB_PAGE_TYPE_WATCH"><ytlr-app></ytlr-app></body></html>`
    });
    await waitFor(() => win.document.getElementById('ytaf-comments-close-fix'));
    const fix = win.document.getElementById('ytaf-comments-close-fix');
    t('an override stylesheet is added', !!fix);
    const css = fix ? fix.textContent : '';
    t(
      'every collapsing rule on the closing class is overridden, nested ones too',
      css.indexOf('ytlr-animated-overlay.frHKed .RowList {') !== -1 &&
        css.indexOf('.frHKed .Panel {') !== -1,
      css.slice(0, 160)
    );
    t(
      'the override keeps the element laid out but invisible',
      /height: auto !important/.test(css) && /visibility: hidden !important/.test(css)
    );
    t(
      'rules that do not collapse, or do not use the closing class, are left alone',
      css.indexOf('.Keep') === -1 && css.indexOf('.unrelated') === -1
    );
  }
  {
    const { win } = createPage();
    await waitFor(() => win.document.getElementById('ytaf-comments-close-fix'));
    const fix = win.document.getElementById('ytaf-comments-close-fix');
    t(
      'without a matching YouTube rule the broad fallback is used, with a block value before the revert the legacy engines cannot read',
      !!fix && /display: block !important; display: revert !important/.test(fix.textContent),
      fix && fix.textContent.slice(0, 120)
    );
  }

  // ---- comments-panel fix: the startup rescan stops, the focus backstop takes over ----
  {
    const { win, reads, inPanel, outside, fix } = commentsFixPage();
    await wait(300);
    t(
      'setup: the fallback is in place while no rule matches',
      !!fix() && /display: revert/.test(fix().textContent)
    );
    const settled = reads.n;
    await wait(200);
    t(
      'the startup rescan stops once the stylesheet set has been stable for two scans',
      reads.n === settled && settled < 60,
      `${settled} then ${reads.n} reads of document.styleSheets (30 tries would be 60)`
    );
    t('setup: it did rescan before stopping', settled > 2, String(settled));

    // A rule that appears after the rescan stopped is not found on its own.
    const style = win.document.createElement('style');
    style.textContent = 'ytlr-animated-overlay.frHKed .RowList { height: 0px; }';
    win.document.head.appendChild(style);
    await wait(100);
    t(
      'a collapsing rule that appears after the rescan stopped is not picked up by itself',
      fix().textContent.indexOf('.RowList') === -1 && reads.n === settled,
      fix().textContent.slice(0, 120)
    );

    // The backstop: focus landing inside a side panel scans once more.
    outside.focus();
    t('focus outside a side panel does not rescan', reads.n === settled, String(reads.n));
    inPanel.focus();
    t(
      'focus inside a side panel rescans the stylesheets and finds the rule',
      reads.n === settled + 1 &&
        fix().textContent.indexOf('ytlr-animated-overlay.frHKed .RowList {') !== -1,
      `${reads.n} reads; ` + fix().textContent.slice(0, 120)
    );
    const found = reads.n;
    outside.focus();
    inPanel.focus();
    t(
      'once the rule is found, a later focus inside a panel scans no more',
      reads.n === found,
      String(reads.n)
    );
  }
  {
    // No rule ever: the backstop gives up after three scans and keeps the fallback.
    const { reads, inPanel, outside, fix } = commentsFixPage();
    await wait(300);
    const settled = reads.n;
    for (let i = 0; i < 3; i++) {
      inPanel.focus();
      outside.focus();
    }
    t(
      'without a matching rule the focus backstop scans on each of three panel focuses',
      reads.n === settled + 3,
      `${reads.n - settled} scans`
    );
    inPanel.focus();
    outside.focus();
    inPanel.focus();
    t('and stops after the third', reads.n === settled + 3, `${reads.n - settled} scans`);
    t('the fallback stays in place', /display: revert/.test(fix().textContent));
  }

  report.finish();
})();
