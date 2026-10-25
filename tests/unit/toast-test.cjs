/**
 * ui/toast/index.js as a unit in a vm sandbox over a blank document, with the
 * timers divided by twenty: show(), the fade, update() and remove() on a
 * handle, the dedupe of a live text, and Disable Notifications. The toasts
 * of the bundle's shortcuts are tests/behaviour/toast-test.cjs.
 *
 * Run: node tests/unit/toast-test.cjs
 */
'use strict';

const path = require('path');
const { loadSources } = require('../harness/sandbox.cjs');
const { SRC, blankDom } = require('../harness/stubs.cjs');
const { createReport } = require('../harness/report.cjs');
const { wait } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- ui/toast/index.js as a unit ------------------------------------------------------
  {
    // The default 3000 ms and the 1000 ms fade are divided by 20: 150 and 50 ms here.
    const SCALE = 20;
    const DEFAULT = 3000 / SCALE;
    const FADE = 1000 / SCALE;
    const loadToast = (config) => {
      const win = blankDom().window;
      let frames = [];
      // Two frames reveal a toast; show() pumps them so the toast counts as live.
      const pump = () => {
        for (let i = 0; i < 2; i++) {
          const q = frames;
          frames = [];
          for (const cb of q) cb();
        }
      };
      // The element factory the toast builds with, loaded into the same scope.
      const { sandbox } = loadSources(
        [path.join(SRC, 'ui', 'dom.js'), path.join(SRC, 'ui', 'toast', 'index.js')],
        {
          document: win.document,
          requestAnimationFrame: (cb) => frames.push(cb),
          setTimeout: (cb, ms) => setTimeout(cb, ms / SCALE),
          clearTimeout,
          configRead: (key) =>
            key === 'disableNotifications' ? !!(config && config.disabled) : undefined
        }
      );
      const els = () => Array.from(win.document.querySelectorAll('.ytaf-toasts .ytaf-toast'));
      const texts = () => els().map((e) => e.textContent);
      const hidden = () =>
        els()
          .map((e) => e.classList.contains('ytaf-toast-hidden'))
          .join(',');
      const show = (text, time) => {
        const handle = sandbox.showNotification(text, time);
        pump();
        return handle;
      };
      return { d: win.document, raw: sandbox.showNotification, show, pump, els, texts, hidden };
    };

    {
      const { d, raw, show, pump, els, texts, hidden } = loadToast();
      t('setup: no container before the first toast', !d.querySelector('.ytaf-toasts'));
      const a = raw('Hello');
      t(
        'a repeat of the text before its first two frames extends the toast, not a twin',
        raw('Hello') === a && d.querySelectorAll('.ytaf-toast').length === 1,
        String(d.querySelectorAll('.ytaf-toast').length)
      );
      const containers = d.querySelectorAll('body > .ytaf-toasts');
      t(
        'the first toast creates the container in the body with one .ytaf-toast, hidden until two frames pass',
        containers.length === 1 &&
          els().length === 1 &&
          texts()[0] === 'Hello' &&
          hidden() === 'true',
        texts().join(' | ')
      );
      pump();
      t('two frames later the hidden class is gone', hidden() === 'false');
      const again = show('Hello');
      t(
        'the same text while the toast is live returns the same handle and adds no element',
        again === a && els().length === 1,
        String(els().length)
      );
      show('Other');
      t(
        'a different text stacks a second toast',
        texts().join(',') === 'Hello,Other',
        texts().join(',')
      );

      a.update('Hello again');
      t(
        'update(text) changes the text of the same element',
        texts().join(',') === 'Hello again,Other' && els().length === 2,
        texts().join(',')
      );
      const third = show('Hello');
      t(
        'after update() the old text is free: showing it makes a new toast',
        third !== a && els().length === 3,
        String(els().length)
      );
      const fourth = show('Hello again');
      t('and the new text maps to the updated toast', fourth === a && els().length === 3);

      a.remove();
      t('update() on a toast that is fading out returns false', a.update('Still') === false);
      t(
        'remove() hides the toast at once and leaves the element for the fade',
        els().length === 3 && hidden() === 'true,false,false',
        hidden()
      );
      const afterRemove = show('Hello again');
      t(
        'a hidden (fading) toast is not reused: the same text makes a new element',
        afterRemove !== a && els().length === 4
      );
      await wait(FADE + 20);
      t(
        'after the fade the removed element is gone from the container',
        els().length === 3 && texts().join(',') === 'Other,Hello,Hello again',
        texts().join(',')
      );
    }
    {
      const { show, els, hidden } = loadToast();
      const h = show('Short', 3000);
      await wait(DEFAULT * 0.6);
      show('Short', 3000);
      await wait(DEFAULT * 0.6);
      t(
        'a repeated text re-arms the timer: the toast outlives its first 3000 ms',
        els().length === 1 && hidden() === 'false',
        hidden()
      );
      await wait(DEFAULT * 0.6);
      t(
        'and hides once the extended time passes',
        // Hidden, or already removed after its fade on a slow run.
        els().length === 0 || hidden() === 'true',
        hidden()
      );
      await wait(FADE + 20);
      t('the element is removed a second after the hide', els().length === 0, String(els().length));
      let threw = null;
      try {
        h.remove();
      } catch (e) {
        threw = e;
      }
      t(
        'remove() on an already removed toast does not throw',
        threw === null,
        threw && threw.message
      );
    }
    {
      const { show, els, hidden } = loadToast();
      const sticky = show('Stay', 0);
      await wait(DEFAULT + 30);
      t(
        'time = 0 keeps the toast up past the default time',
        els().length === 1 && hidden() === 'false'
      );
      show('Stay', 0);
      await wait(DEFAULT + 30);
      t(
        'showing a sticky text again with 0 does not arm a timer',
        els().length === 1 && hidden() === 'false'
      );
      t('setup: the sticky handle is the one still up', show('Stay', 0) === sticky);
      show('Stay');
      await wait(DEFAULT + 30);
      t('showing it again with the default time arms one', hidden() === 'true', hidden());
    }
    {
      const { d, raw } = loadToast({ disabled: true });
      const h1 = raw('Nope');
      const h2 = raw('Nope', 0);
      t(
        'disableNotifications: a handle with remove() comes back and nothing is created',
        typeof h1.remove === 'function' && !d.querySelector('.ytaf-toasts')
      );
      h1.remove();
      t(
        'disableNotifications: the same no-op handle every time, and its methods do nothing',
        h1 === h2 && !d.querySelector('.ytaf-toasts')
      );
    }

    // ---- a slot: one toast for a message that changes in place ----
    {
      const { raw, pump, texts } = loadToast();
      const first = raw('Skipped +5s', 3000, 'seek');
      pump();
      const second = raw('Skipped +10s', 3000, 'seek');
      t(
        'a slot keeps one toast: the next message takes its place',
        second === first && texts().join('|') === 'Skipped +10s',
        texts().join('|')
      );
      raw('Paused', 3000, 'play-pause');
      t('another slot is a toast of its own', texts().length === 2, texts().join('|'));
      first.remove();
      const third = raw('Skipped +15s', 3000, 'seek');
      pump();
      t(
        'a slot whose toast is fading gets a new one',
        third !== first && texts().indexOf('Skipped +15s') !== -1,
        texts().join('|')
      );
    }
  }

  report.finish();
})();
