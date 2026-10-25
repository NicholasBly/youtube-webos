/**
 * How the suite reads a finished step (tests/run-all.mjs): its outcome is
 * `{ status, output, error, timedOut }`, as the runner collects it.
 *
 *   isOk(outcome)          the process ran and exited 0 in time
 *   testVerdict(outcome)   a test script's summary line ("N passed, M failed") and
 *                          whether it passed (at least one check, none failed)
 */
'use strict';

const isOk = (outcome) => outcome.status === 0 && !outcome.error && !outcome.timedOut;

function testVerdict(outcome) {
  const lines = outcome.output.split('\n');
  const summary = lines.filter((l) => / passed, \d+ failed/.test(l)).pop() || '';
  // Exit 0 alone is not enough: a script that ended before its report (an
  // early process.exit, a rejection nothing awaited) ran none of its checks,
  // and neither did one that reports "0 passed".
  return { summary, ok: isOk(outcome) && !!summary && !/^\s*0 passed/.test(summary) };
}

module.exports = { isOk, testVerdict };
