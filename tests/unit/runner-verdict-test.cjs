/**
 * The suite's reading of a finished test script (harness/verdict.cjs, used by
 * tests/run-all.mjs): a pass needs exit 0 and the report's summary line, so a
 * script that ends early with 0 is not counted as one.
 *
 * Run: node tests/unit/runner-verdict-test.cjs
 */
'use strict';

const { createReport } = require('../harness/report.cjs');
const { isOk, testVerdict } = require('../harness/verdict.cjs');

const report = createReport();
const t = report.check;

const outcome = (status, output, more) =>
  Object.assign({ status, output, error: null, timedOut: false }, more);

{
  const v = testVerdict(outcome(0, 'PASS a\nPASS b\n\n2 passed, 0 failed\n'));
  t('exit 0 with its summary line is a pass', v.ok && v.summary === '2 passed, 0 failed');
}
{
  const v = testVerdict(outcome(0, '\n0 passed, 0 failed\n'));
  t('a script that ran no check is not a pass', !v.ok, JSON.stringify(v));
}
{
  const v = testVerdict(outcome(0, 'PASS a\n'));
  t(
    'exit 0 without a summary line is not a pass: the script ended before its report',
    !v.ok && v.summary === '',
    JSON.stringify(v)
  );
}
{
  const v = testVerdict(outcome(0, ''));
  t('exit 0 with no output at all is not a pass', !v.ok);
}
{
  const v = testVerdict(outcome(1, 'FAIL a\n\n1 passed, 1 failed\n'));
  t(
    'a failed check (exit 1) is not a pass, and its summary is kept',
    !v.ok && v.summary === '1 passed, 1 failed'
  );
}
{
  const v = testVerdict(outcome(null, '3 passed, 0 failed\n', { timedOut: true }));
  t('a script killed by the timeout is not a pass, whatever it printed', !v.ok);
}
{
  const v = testVerdict(outcome(null, '', { error: new Error('spawn ENOENT') }));
  t('a script that never started is not a pass', !v.ok);
}
{
  const v = testVerdict(outcome(0, '1 passed, 0 failed\nlater\n2 passed, 0 failed\n'));
  t('the last summary line is the one read', v.ok && v.summary === '2 passed, 0 failed');
}
t('isOk: exit 0 in time', isOk(outcome(0, '')) && !isOk(outcome(2, '')));

report.finish();
