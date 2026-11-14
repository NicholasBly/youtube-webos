/**
 * The state machines of the per-video handlers as checks: what must hold
 * between their fields whenever the page is at rest (after an event has been
 * handled, never in the middle of one). docs/STATE-MACHINES.md describes the
 * machines; this file is the part of that description a test can run.
 *
 *   sponsorBlockViolations(sb) -> string[]
 *     the rules a SponsorBlockHandler breaks right now (empty: none). `sb` may
 *     be a handler that was destroyed: the rules for one are checked then.
 *   watchSponsorBlock(win) -> { check(after), violations }
 *     keeps hold of every handler the page creates (window.sponsorblock only
 *     hands out the live one) and collects what any of them breaks, each
 *     once, with the event `after` which it was seen. harness/sponsorblock.cjs
 *     calls check() after every event a test sends, so every SponsorBlock
 *     behaviour test checks the rules at every step.
 *
 * A rule goes here when it is true by design and cheap to read: a field that
 * can only be set together with another, a handle that must be gone once its
 * owner is. A rule about timing or about what the viewer sees is a test's.
 */
'use strict';

/** Whether the frame loop, the time listener or the bar poll of `sb` is running. */
const running = (sb) => ({
  frameLoop: sb.pollingRafId !== null && sb.pollingRafId !== undefined,
  timeListener: sb.timeListenerActive === true,
  barPoll: !!(sb.barRetry && sb.barRetry.active)
});

function sponsorBlockViolations(sb) {
  const broken = [];
  /** Records `name` unless `ok`. */
  const rule = (name, ok) => {
    if (!ok) broken.push(name);
  };
  const run = running(sb);
  const skip = sb.skipSegments;

  if (sb.isDestroyed) {
    // destroy() leaves nothing behind that could call back or hold the page.
    rule('destroyed: no <video> bound', sb.video === null && sb.videoBag === null);
    rule('destroyed: no time listener, frame loop or bar poll', !run.frameLoop && !run.barPoll);
    rule('destroyed: no frame of its own pending', sb.rafIds.size === 0);
    rule(
      'destroyed: no observer left',
      sb.domObserver === null && sb.attrObserver === null && sb.finderObserver === null
    );
    rule('destroyed: no wait for a <video> or its metadata', !sb.videoWait && !sb.chainRetry);
    rule('destroyed: no skip watchdog', sb.skipWatchdogTimer === null);
    rule('destroyed: no prompt, no mute held', !sb.activeManualNotification && !sb.mutedSegment);
    rule('destroyed: no overlay', sb.overlay === null);
    rule('destroyed: no segments kept', sb.segments.length === 0 && skip.length === 0);
    return broken;
  }

  // --- The <video> binding ---
  rule('a <video> is bound together with its listeners', (sb.video === null) === !sb.videoBag);
  rule(
    'the time listener, the frame loop, a mute and the metadata wait need a bound <video>',
    sb.video !== null || (!run.timeListener && !run.frameLoop && !sb.mutedSegment && !sb.chainRetry)
  );
  rule('one wait for a <video> at most, and none while one is bound', !(sb.video && sb.videoWait));

  // --- Aiming: where the playhead is relative to the skip list ---
  rule(
    'nextSegmentIndex points into the skip list or just past it',
    sb.nextSegmentIndex >= 0 && sb.nextSegmentIndex <= skip.length
  );
  rule(
    'nextSegmentStart is the start of the segment aimed at, or Infinity past the last',
    sb.nextSegmentStart ===
      (sb.nextSegmentIndex < skip.length ? skip[sb.nextSegmentIndex].start : Infinity)
  );
  rule(
    'the time listener runs only while a segment is ahead',
    !run.timeListener || sb.nextSegmentStart !== Infinity
  );
  rule(
    'the frame loop runs only while a segment is ahead',
    !run.frameLoop || sb.nextSegmentStart !== Infinity
  );

  // --- A skip in flight ---
  rule('a skip in flight has its watchdog armed', !sb.isSkipping || sb.skipWatchdogTimer !== null);

  // --- The manual-skip prompt ---
  rule(
    'a prompt on screen offers a segment',
    !sb.activeManualNotification || !!sb.currentManualSegment
  );
  rule(
    'the segment offered is a manual one of the current skip list',
    !sb.currentManualSegment ||
      (skip.indexOf(sb.currentManualSegment) !== -1 &&
        sb.currentManualSegment.mode === 'manual_skip')
  );

  // --- The muted segment ---
  rule(
    'the muted segment is a mute one of the current skip list',
    !sb.mutedSegment || (skip.indexOf(sb.mutedSegment) !== -1 && sb.mutedSegment.mode === 'mute')
  );

  // --- The blue key's whitelist ---
  rule(
    'tempWhitelistIndex names a segment or nothing',
    sb.tempWhitelistIndex >= -1 && sb.tempWhitelistIndex < sb.segments.length
  );

  // --- The progress bar ---
  rule(
    'the finder waits only while no bar is tracked or watched',
    !sb.finderObserver || (sb.domObserver === null && sb.attrObserver === null && !sb.progressBar)
  );
  rule(
    'the bar observers come as a pair',
    (sb.domObserver === null) === (sb.attrObserver === null)
  );
  rule('the bar poll never runs beside the finder', !(run.barPoll && sb.finderObserver));
  rule(
    'an anchor is cached for the tracked bar only',
    !sb.anchor || sb.anchor.bar === sb.progressBar
  );
  rule(
    'the overlay has one mark for each one drawn',
    !sb.overlay || sb.overlay.children.length === sb.overlayMarks.length
  );
  return broken;
}

function watchSponsorBlock(win) {
  const seen = [];
  const violations = [];
  const reported = new Set();
  /** Checks every handler seen so far; `after` names the event just handled. */
  const check = (after) => {
    const live = win.sponsorblock;
    if (live && seen.indexOf(live) === -1) seen.push(live);
    for (let i = 0; i < seen.length; i++) {
      const broken = sponsorBlockViolations(seen[i]);
      for (let j = 0; j < broken.length; j++) {
        if (reported.has(broken[j])) continue;
        reported.add(broken[j]);
        violations.push(broken[j] + ' (after ' + after + ')');
      }
    }
  };
  return { check, violations };
}

module.exports = { sponsorBlockViolations, watchSponsorBlock };
