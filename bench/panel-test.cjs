/**
 * Behavioural test for the deferred options-panel build.
 *
 * The risky case is a user reaching a tab before the idle build chain does:
 * setActivePage() must build that page synchronously rather than blowing up on
 * an undefined page element. Also checks each builder runs exactly once, that
 * every page ends up identical to the all-synchronous build, and that opening
 * and closing the panel repeatedly doesn't duplicate anything.
 */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { applyChrome38Downgrade, UA, setUserAgent } = require('./chrome38-env.cjs');

const bundlePath = process.argv[2] || 'dist/webOSUserScripts/userScript.js';
const GREEN = 404;

function boot() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM('<!doctype html><html><body class="WEB_PAGE_TYPE_BROWSE"><ytlr-app></ytlr-app></body></html>',
    { runScripts: 'outside-only', url: 'https://www.youtube.com/tv', virtualConsole: vc, pretendToBeVisual: true });
  const win = dom.window;
  setUserAgent(win, UA.webos3);
  win.launchParams = '{}';
  win.XMLHttpRequest = class { open(){} send(){} setRequestHeader(){} getResponseHeader(){return null;} addEventListener(){} };
  let rafQ = [];
  win.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
  win.cancelAnimationFrame = () => {};
  win.localStorage.setItem('ytaf-configuration', win.JSON.stringify({
    enableAdBlock: true, enableLegacyEmojiFix: true, enableSponsorBlock: true,
    enableReturnYouTubeDislike: true, upgradeThumbnails: false, enableAutoLogin: true
  }));
  applyChrome38Downgrade(win);
  win.eval(fs.readFileSync(bundlePath, 'utf8'));
  return { win, errors, pump: () => { const q = rafQ; rafQ = []; for (const cb of q) cb(Date.now()); } };
}

function key(win, code) {
  const e = new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code, configurable: true });
  win.document.body.dispatchEvent(e);
}

let pass = 0, fail = 0;
const t = (name, ok, extra) => {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? '\n     ' + extra : '')); }
};
const PAGES = ['#ytaf-page-main', '#ytaf-page-sponsor', '#ytaf-page-shortcuts', '#ytaf-page-ui-tweaks'];

setTimeout(() => {
  // ---- Case 1: user hits a tab BEFORE the idle chain gets there ----
  {
    const { win, errors, pump } = boot();
    key(win, GREEN);
    const panel = win.document.querySelector('.ytaf-ui-container');
    t('panel exists after keypress', !!panel);
    t('only Main built synchronously',
      win.document.querySelectorAll(PAGES[1]).length === 0,
      'sponsor page count ' + win.document.querySelectorAll(PAGES[1]).length);

    const tabs = panel.querySelectorAll('.ytaf-tab-btn');
    t('four tab buttons', tabs.length === 4, 'got ' + tabs.length);

    // No frames pumped yet: jump straight to Shortcuts (page 3).
    let threw = null;
    try { tabs[2].click(); } catch (e) { threw = e; }
    t('tab press before idle build does not throw', !threw, threw && threw.message);
    const shortcuts = win.document.querySelector(PAGES[2]);
    t('Shortcuts page built on demand', !!shortcuts);
    t('Shortcuts page is the visible one', shortcuts && shortcuts.style.display === 'block',
      shortcuts && shortcuts.style.display);
    t('Main page hidden after tab switch',
      win.document.querySelector(PAGES[0]).style.display === 'none');
    t('Shortcuts page fully populated',
      shortcuts && shortcuts.getElementsByTagName('*').length === 78,
      shortcuts && String(shortcuts.getElementsByTagName('*').length));

    // Now let the idle chain finish; it must not rebuild what already exists.
    for (let i = 0; i < 20; i++) pump();
    for (const sel of PAGES) {
      t('exactly one ' + sel.replace('#ytaf-page-', ''),
        win.document.querySelectorAll(sel).length === 1,
        'count ' + win.document.querySelectorAll(sel).length);
    }
    t('no jsdomError in this flow', errors.length === 0, errors[0]);
  }

  // ---- Case 2: normal flow, idle chain completes first ----
  {
    const { win, errors, pump } = boot();
    key(win, GREEN);
    for (let i = 0; i < 20; i++) pump();
    const panel = win.document.querySelector('.ytaf-ui-container');
    const counts = PAGES.map((s) => {
      const el = win.document.querySelector(s);
      return el ? el.getElementsByTagName('*').length : -1;
    });
    t('all four pages built after idle frames',
      JSON.stringify(counts) === JSON.stringify([48, 102, 78, 25]), JSON.stringify(counts));
    t('total panel size matches all-synchronous build',
      panel.getElementsByTagName('*').length === 267,
      String(panel.getElementsByTagName('*').length));

    // Walk every tab, forwards then backwards.
    const tabs = panel.querySelectorAll('.ytaf-tab-btn');
    let ok = true, detail = '';
    for (const order of [[1, 2, 3, 0], [3, 1, 0, 2]]) {
      for (const i of order) {
        tabs[i].click();
        const shown = PAGES.map((s) => win.document.querySelector(s).style.display);
        const expect = PAGES.map((_, j) => (j === i ? 'block' : 'none'));
        if (JSON.stringify(shown) !== JSON.stringify(expect)) {
          ok = false; detail = `tab ${i}: ${JSON.stringify(shown)}`;
        }
        if (!tabs[i].classList.contains('active')) { ok = false; detail = `tab ${i} not marked active`; }
      }
    }
    t('every tab shows exactly its own page', ok, detail);

    // Close and reopen: must not duplicate the panel or its pages.
    key(win, GREEN);
    key(win, GREEN);
    for (let i = 0; i < 20; i++) pump();
    t('reopen does not duplicate the panel',
      win.document.querySelectorAll('.ytaf-ui-container').length === 1);
    t('reopen does not duplicate pages',
      PAGES.every((s) => win.document.querySelectorAll(s).length === 1));
    t('no jsdomError across open/close/reopen', errors.length === 0, errors[0]);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}, 500);
