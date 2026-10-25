/**
 * core/dom.js as a unit in a vm sandbox: waitForChildAdd (resolve, timeout,
 * cancel), debounce and its cancel(), the cached <video> lookup, pollUntil
 * (found, give-up, cancel from outside and from its own callback).
 *
 * Run: node tests/unit/core-dom-test.cjs
 */
const { createReport } = require('../harness/report.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { wait } = require('../harness/fixtures.cjs');
const { CORE, blankDom } = require('../harness/stubs.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- core/dom.js -----------------------------------------------------------------
  {
    const win = blankDom().window;
    const d = win.document;
    const { sandbox } = loadSources([CORE('dom.js')], {
      window: win,
      document: d,
      MutationObserver: win.MutationObserver,
      setTimeout,
      clearTimeout
    });
    const settle = (p) =>
      p.then(
        (v) => ({ ok: true, value: v }),
        (e) => ({ ok: false, error: e.message })
      );

    // waitForChildAdd: a matching element added anywhere under the parent.
    const parent = d.createElement('div');
    d.body.appendChild(parent);
    const inner = d.createElement('section');
    parent.appendChild(inner);
    const isMatch = (n) => n.tagName === 'SPAN' && n.className === 'wanted';
    const w1 = sandbox.waitForChildAdd(parent, isMatch, 500);
    const resolved = settle(w1.promise);
    inner.appendChild(d.createTextNode('text node'));
    const decoy = d.createElement('span');
    inner.appendChild(decoy);
    const wanted = d.createElement('span');
    wanted.className = 'wanted';
    inner.appendChild(wanted);
    let r = await resolved;
    t(
      'waitForChildAdd resolves with the first element under the subtree that passes the predicate, skipping text nodes and non-matches',
      r.ok && r.value === wanted,
      JSON.stringify(r)
    );
    let threw = null;
    try {
      w1.cancel();
    } catch (e) {
      threw = e;
    }
    t('cancel() after the resolve is a no-op', threw === null, threw && threw.message);

    const w2 = sandbox.waitForChildAdd(parent, isMatch, 40);
    r = await settle(w2.promise);
    t(
      'waitForChildAdd rejects with "waitForChildAdd timed out" after timeoutMs',
      !r.ok && r.error === 'waitForChildAdd timed out',
      JSON.stringify(r)
    );

    const w3 = sandbox.waitForChildAdd(parent, isMatch, 500);
    const pending = settle(w3.promise);
    w3.cancel();
    r = await pending;
    t('cancel() rejects with "cancelled"', !r.ok && r.error === 'cancelled', JSON.stringify(r));
    const late = d.createElement('span');
    late.className = 'wanted';
    let calls = 0;
    const w4 = sandbox.waitForChildAdd(parent, (n) => (calls++, isMatch(n)), 500);
    const cancelled = settle(w4.promise);
    w4.cancel();
    inner.appendChild(late);
    await wait(10);
    t(
      'after cancel() the observer is disconnected: a later match is not even tested',
      calls === 0 && !(await cancelled).ok,
      String(calls)
    );

    const w5 = sandbox.waitForChildAdd(parent, isMatch, 0);
    let state = 'pending';
    w5.promise.then(
      () => (state = 'resolved'),
      () => (state = 'rejected')
    );
    await wait(60);
    t('timeoutMs 0 sets no timer: the waiter is still pending', state === 'pending', state);
    const eventual = d.createElement('span');
    eventual.className = 'wanted';
    parent.appendChild(eventual);
    await wait(10);
    t('and resolves when the element finally appears', state === 'resolved', state);

    // debounce: the last call wins, after the wait.
    const got = [];
    const fn = sandbox.debounce(function (...a) {
      got.push({ self: this, args: a });
    }, 30);
    const ctx = { name: 'ctx' };
    fn.call(ctx, 1);
    fn.call(ctx, 2);
    fn.call(ctx, 3);
    await wait(15);
    t('debounce: nothing fires before the wait', got.length === 0);
    await wait(40);
    t(
      'debounce: three quick calls fire once, with the last arguments and the caller as this',
      got.length === 1 && got[0].args.join() === '3' && got[0].self === ctx,
      JSON.stringify(got.map((g) => g.args))
    );
    fn(4);
    await wait(20);
    fn(5);
    await wait(20);
    t('debounce: a call inside the wait restarts it', got.length === 1);
    await wait(25);
    t(
      'debounce: and fires with the newest arguments once the wait passes',
      got.length === 2 && got[1].args.join() === '5'
    );
    fn(6);
    fn.cancel();
    await wait(50);
    t('debounce.cancel() drops the pending call', got.length === 2);
    fn.cancel();
    t('debounce.cancel() with nothing pending is harmless', got.length === 2);

    // getVideo caches the element until it leaves the document or the page changes.
    const v1 = d.createElement('video');
    d.body.appendChild(v1);
    t('getVideo finds the page video', sandbox.getVideo() === v1);
    const v2 = d.createElement('video');
    d.body.insertBefore(v2, v1);
    t(
      'getVideo keeps the cached video while it is connected, even with another first in the document',
      sandbox.getVideo() === v1
    );
    v1.remove();
    t('a disconnected cached video is replaced by a fresh query', sandbox.getVideo() === v2);
    const v3 = d.createElement('video');
    d.body.insertBefore(v3, v2);
    win.dispatchEvent(
      new win.CustomEvent('ytaf-page-update', { detail: { isWatch: true, isShorts: false } })
    );
    t('a page update onto a watch page keeps the cache', sandbox.getVideo() === v2);
    win.dispatchEvent(
      new win.CustomEvent('ytaf-page-update', { detail: { isWatch: false, isShorts: false } })
    );
    t('a page update away from video pages drops the cache', sandbox.getVideo() === v3);
  }

  // ---- pollUntil ----
  {
    const win = blankDom().window;
    const { sandbox } = loadSources([CORE('dom.js')], {
      window: win,
      document: win.document,
      MutationObserver: win.MutationObserver,
      setTimeout,
      clearTimeout
    });

    let calls = 0;
    const found = sandbox.pollUntil(() => ++calls === 3, 5, { maxAttempts: 10 });
    t('pollUntil: active while it polls', found.active === true, String(found.active));
    await wait(150);
    t('pollUntil: stops at the first true', calls === 3, String(calls));
    t('pollUntil: not active once found', found.active === false, String(found.active));

    let gaveUp = 0;
    calls = 0;
    const limited = sandbox.pollUntil(() => (++calls, false), 5, {
      maxAttempts: 4,
      onGiveUp: () => gaveUp++
    });
    await wait(150);
    t(
      'pollUntil: gives up after maxAttempts, once',
      calls === 4 && gaveUp === 1,
      calls + ' calls, ' + gaveUp + ' give-ups'
    );
    t('pollUntil: not active after giving up', limited.active === false);

    calls = 0;
    const outside = sandbox.pollUntil(() => (++calls, false), 5, { maxAttempts: 20 });
    await wait(30);
    outside.cancel();
    const atCancel = calls;
    await wait(60);
    t('pollUntil: cancel() stops it', calls === atCancel, atCancel + ' then ' + calls);
    t('pollUntil: not active after cancel()', outside.active === false);

    // The callback ends the poll itself (the SponsorBlock bar poll does, through
    // the observers it re-arms): no further call.
    calls = 0;
    gaveUp = 0;
    const self = sandbox.pollUntil(
      () => {
        calls++;
        self.cancel();
        return false;
      },
      5,
      { maxAttempts: 5, onGiveUp: () => gaveUp++ }
    );
    await wait(150);
    t(
      'pollUntil: cancel() from inside the callback stops it',
      calls === 1 && gaveUp === 0,
      calls + ' calls, ' + gaveUp + ' give-ups'
    );
  }

  report.finish();
})();
