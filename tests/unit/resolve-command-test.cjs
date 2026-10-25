/**
 * hooks/resolve-command.ts as a unit, its TypeScript source loaded into a vm
 * sandbox with the timers and the clock in the test's hands: the poll for the
 * hook target backs off from 16 ms to 1 s, every caller shares it, it gives up
 * after 30 s on the monotonic clock (a wall clock set back does not stretch
 * it), and the next getInstance() polls again. The hook in the bundle
 * is tests/behaviour/hooks-and-fixes-test.cjs.
 *
 * Run: node tests/unit/resolve-command-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');
const { flush } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

(async () => {
  const timers = [];
  // `now` is the monotonic clock; the wall clock is `now + wall`.
  const clock = { now: 0, wall: 0 };
  const win = { _yttv: { Decoy: 42 } };
  const { get } = loadSources(
    [path.join(SRC, 'hooks', 'resolve-command.ts')],
    {
      createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
      window: win,
      setTimeout: (fn, ms) => timers.push({ fn, ms }),
      Date: { now: () => clock.now + clock.wall },
      performance: { now: () => clock.now }
    },
    { ts: true }
  );
  const Registry = get('ResolveCommandRegistry');
  /** Runs the next timer, the clock moved on by its delay; its delay. */
  const step = () => {
    const next = timers.shift();
    clock.now += next.ms;
    next.fn();
    return next.ms;
  };

  // ---- no target yet: the poll ----
  const first = Registry.getInstance();
  let outcome = null;
  first.then(
    (r) => (outcome = { r }),
    (e) => (outcome = { e })
  );
  t('two callers during the poll share it', Registry.getInstance() === first);
  const delays = [];
  for (let i = 0; i < 8; i++) delays.push(step());
  // The TV sets its clock an hour back during the poll.
  clock.wall = -3600000;
  t(
    'the poll backs off from 16 ms, doubling, to a second',
    delays.join(',') === '16,32,64,128,256,512,1000,1000',
    delays.join(',')
  );
  while (timers.length && clock.now < 31000) step();
  await flush();
  t(
    'past 30 s with no target it gives up with an error, and stops, the wall clock set back notwithstanding',
    !!outcome &&
      !!outcome.e &&
      /No resolveCommand hook target/.test(outcome.e.message) &&
      timers.length === 0,
    outcome && (outcome.e ? outcome.e.message : 'resolved')
  );

  // ---- a target that appears later ----
  const calls = [];
  const instance = {
    resolveCommand(command) {
      calls.push(command);
      return 'original';
    }
  };
  const Target = function () {};
  Target.instance = instance;
  win._yttv.Target = Target;
  const again = Registry.getInstance();
  t('the next getInstance() polls again rather than keep the failure', again !== first);
  const registry = await again;
  t(
    'and finds the target that appeared since: its resolveCommand is hooked',
    !!registry && instance.resolveCommand({ other: 1 }) === 'original' && calls.length === 1,
    String(calls.length)
  );
  t('every later call gets the same registry', (await Registry.getInstance()) === registry);

  report.finish();
})();
