/**
 * SponsorBlock's skipping against the built bundle, with a fake <video>, a
 * fetch stub for the API and a progress bar in the page: the request goes out
 * with the video id's hash prefix, the segments are drawn on the bar,
 * auto-skip segments are skipped and announced, manual ones wait for the blue
 * button, segments at the start are chained (waiting for the metadata
 * when the <video> has none yet), a frame loop near a segment
 * skips it between timeupdates (and stops on a pause, a seek away, a
 * destroy), the highlight is jumped to,
 * overlapping segments go in one jump, the segment seeked back into is left
 * alone until it is left, and the shortcuts as key presses. The handler's
 * life (the player state events, the duration, the API failing, the <video>
 * replaced or mounting late) is sponsorblock-lifecycle-test.cjs.
 *
 * Run: node tests/behaviour/sponsorblock-skip-test.cjs [bundle]
 */
const { createReport } = require('../harness/report.cjs');
const { seg, sponsorBlockPage, VIDEO, PREFIX } = require('../harness/sponsorblock.cjs');
const { wait, waitFor, KEYS, DIGIT } = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

(async () => {
  // ---- fetch, overlay, auto skip, seek-bar-only category --------------------
  {
    const p = sponsorBlockPage(
      [
        seg('sponsor', 20, 30),
        seg('selfpromo', 100, 110),
        seg('preview', 150, 160),
        seg('outro', 280, 300),
        seg('poi_highlight', 200, 200)
      ],
      {},
      40
    );
    await p.ready();
    t('setup: a handler exists for the watched video', !!p.sb() && p.sb().videoID === VIDEO);
    t(
      'segments are requested by the sha256 prefix of the video id',
      p.requests.some((u) => u.indexOf('/skipSegments/' + PREFIX + '?') !== -1),
      p.requests.join(' | ')
    );
    t(
      'the request names the categories and action types',
      p.requests[0] && /categories=.*actionTypes=/.test(p.requests[0]),
      p.requests[0]
    );
    const bar = p.overlay();
    t(
      'the overlay is drawn beside the progress bar',
      !!bar &&
        bar.previousElementSibling &&
        bar.previousElementSibling.tagName === 'YTLR-MULTI-MARKERS-PLAYER-BAR-RENDERER',
      bar && bar.parentElement && bar.parentElement.id
    );
    const marks = bar ? Array.from(bar.children) : [];
    t(
      'every active segment and the highlight get a mark',
      marks.length === 5,
      String(marks.length)
    );
    const sponsorMark = marks[0];
    t(
      'a mark sits at the segment start with the segment width (sponsor 20-30 of 300)',
      sponsorMark &&
        sponsorMark.style.left.indexOf('6.66') === 0 &&
        sponsorMark.style.width.indexOf('3.33') === 0,
      sponsorMark && sponsorMark.style.cssText
    );
    t(
      'the highlight mark is a thin marker',
      marks.some((m) => m.className === 'previewbar highlight' && !m.style.width)
    );

    // Playing on from 40 towards the next segment: nothing happens until it starts.
    p.timeupdate(60);
    await wait(40);
    t('playing between segments changes nothing', p.model.currentTime === 60);
    p.timeupdate(100.2);
    await wait(40);
    t(
      'entering an auto-skip segment jumps to its end',
      p.model.currentTime === 110,
      String(p.model.currentTime)
    );
    t(
      'the skip is announced',
      p.toasts().some((m) => m === 'Skipped self-promotion segment'),
      p.toasts().join(' | ')
    );
    p.seeked(); // the player lands on the new time

    p.seekTo(151);
    await wait(40);
    t(
      'a seek-bar-only category is not skipped',
      p.model.currentTime === 151,
      String(p.model.currentTime)
    );
    t(
      'and shows no toast: it is only drawn on the bar',
      !p.toasts().some((m) => /preview/i.test(m)),
      p.toasts().join(' | ')
    );

    // The user seeks back into a segment: it is skipped again (skipSegmentsOnce is off).
    p.seekTo(22);
    await wait(40);
    t(
      'a user seek into a segment skips it again by default',
      p.model.currentTime === 30,
      String(p.model.currentTime)
    );
    t(
      'the second skip is announced too',
      p.toasts().some((m) => m === 'Skipped sponsored segment'),
      p.toasts().join(' | ')
    );
    p.seeked();

    // The sb_skip_prev shortcut path: back to the previous segment, which is then left alone.
    p.model.currentTime = 50;
    const went = p.sb().skipToPreviousSegment();
    await wait(40);
    t(
      'skipToPreviousSegment seeks to the start of the previous segment',
      went === true && p.model.currentTime === 20,
      String(p.model.currentTime)
    );
    t(
      'and says so',
      p.toasts().some((m) => m === 'Seeked to Sponsored'),
      p.toasts().join(' | ')
    );
    p.seeked();
    p.timeupdate(21);
    await wait(40);
    t(
      'the segment seeked back into is whitelisted, not skipped again',
      p.model.currentTime === 21,
      String(p.model.currentTime)
    );

    // Leaving the watch page tears the handler down.
    p.win.location.hash = '#/';
    await waitFor(() => p.sb() === null);
    t(
      'leaving the video destroys the handler and removes the overlay',
      p.sb() === null && !p.overlay(),
      (p.sb() ? 'handler ' : 'no handler ') + (p.overlay() ? 'overlay' : 'no overlay')
    );
  }

  // ---- skip once ------------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], { skipSegmentsOnce: true }, 40);
    await p.ready();
    p.seekTo(21);
    await wait(30);
    t(
      'skipSegmentsOnce: the first visit is skipped',
      p.model.currentTime === 30,
      String(p.model.currentTime)
    );
    p.seeked();
    p.seekTo(22);
    await wait(40);
    t(
      'skipSegmentsOnce: the second visit is left alone',
      p.model.currentTime === 22,
      String(p.model.currentTime)
    );
  }

  // ---- manual skip and the blue button ----------------------------------------
  {
    const p = sponsorBlockPage(
      [seg('intro', 10, 20), seg('sponsor', 20.5, 25)],
      { sbMode_intro: 'manual_skip' },
      40
    );
    await p.ready();
    p.seekTo(11);
    await wait(40);
    t('a manual segment is not skipped', p.model.currentTime === 11, String(p.model.currentTime));
    t(
      'it asks for the blue button',
      p.toasts().some((m) => m === 'Intro: Press Blue to skip'),
      p.toasts().join(' | ')
    );
    // Resuming inside the segment must not blink the prompt off and on again.
    p.playing();
    await wait(40);
    t(
      'the prompt stays up when playback resumes inside the segment',
      p.toasts().filter((m) => m === 'Intro: Press Blue to skip').length === 1,
      p.toasts().join(' | ')
    );
    const handled = p.sb().manualSkipOrHighlight();
    await wait(40);
    t(
      'blue skips to the end of the manual segment',
      handled === true && p.model.currentTime === 20,
      String(p.model.currentTime)
    );
    // The landing point is aimed past at once: the segment right after is skipped.
    p.seeked();
    p.timeupdate(20.6);
    await wait(40);
    t(
      'the segment right after the manual one is skipped on the next tick',
      p.model.currentTime === 25,
      String(p.model.currentTime)
    );
    p.seeked();
    t(
      'and confirms',
      p.toasts().some((m) => m === 'Skipped Segment'),
      p.toasts().join(' | ')
    );
    const sb = p.sb();
    let threw = null;
    try {
      sb.destroy();
      sb.destroy();
    } catch (e) {
      threw = e;
    }
    t('destroying twice is harmless', threw === null && p.sb() === null, threw && threw.message);
  }

  // ---- chain skip at the very start ---------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 0, 5), seg('selfpromo', 5.1, 12)], {}, 0);
    await p.ready();
    t(
      'adjacent segments at 0 s are skipped as one chain on load',
      p.model.currentTime === 12,
      String(p.model.currentTime)
    );
    t(
      'the chain is announced with both categories, worded as any skip',
      p.toasts().some((m) => m === 'Skipped sponsored and self-promotion segment'),
      p.toasts().join(' | ')
    );
    // Without skipSegmentsOnce a seek back into the chain skips it again, in
    // one jump named after both segments. The load's toast goes first, so the
    // one checked below is the second skip's.
    p.seeked();
    // Not forEach: a legacy page's NodeList has none (harness/page.cjs).
    for (const el of Array.from(p.win.document.querySelectorAll('.ytaf-toast'))) el.remove();
    p.seekTo(2);
    await wait(40);
    t(
      'a seek back into the chained segments skips both again',
      p.model.currentTime === 12,
      String(p.model.currentTime)
    );
    t(
      'the second skip is announced too, the two categories joined with "and"',
      p.toasts().some((m) => m === 'Skipped sponsored and self-promotion segment'),
      p.toasts().join(' | ')
    );
  }

  // ---- what starts the chain: a segment of its own at the start, the playhead there ----
  {
    // A manual segment opens the video: it is offered, not taken in a chain.
    const p = sponsorBlockPage(
      [seg('interaction', 0, 20)],
      { sbMode_interaction: 'manual_skip' },
      0
    );
    await p.ready();
    t(
      'a manual segment at the very start is not chained on load',
      p.seeks.length === 0,
      p.seeks.join(',')
    );
  }
  {
    const p = sponsorBlockPage([seg('sponsor', 0, 5), seg('selfpromo', 5.1, 12)], {}, 0);
    await p.ready();
    p.seeked();
    t('setup: the chain on load', p.model.currentTime === 12, String(p.model.currentTime));
    // Paused: no timeupdate will come, only the seek's own event.
    p.model.paused = true;
    p.seekTo(3);
    await wait(40);
    t(
      'paused, a seek into the chain past its start (0.5 s) waits for playback',
      p.model.currentTime === 3,
      String(p.model.currentTime)
    );
    p.seekTo(0);
    await wait(40);
    t(
      'paused, a seek back to the very start takes the chain at once',
      p.model.currentTime === 12,
      String(p.model.currentTime)
    );
  }

  // ---- the chain waits for the metadata ----------------------------------------------
  /** Every 'loadedmetadata' listener the page adds to the <video>, and whether it went again. */
  const metadataListeners = (w) => {
    const v = w.document.querySelector('video');
    const live = new Set();
    const add = v.addEventListener.bind(v);
    const remove = v.removeEventListener.bind(v);
    v.addEventListener = (type, fn, opts) => {
      if (type === 'loadedmetadata') live.add(fn);
      return add(type, fn, opts);
    };
    v.removeEventListener = (type, fn, opts) => {
      if (type === 'loadedmetadata') live.delete(fn);
      return remove(type, fn, opts);
    };
    return live;
  };
  {
    let live;
    const p = sponsorBlockPage([seg('sponsor', 0, 5), seg('selfpromo', 5.1, 12)], {}, 0, {
      readyState: 0,
      seekedAfter: 5,
      setup: (w) => (live = metadataListeners(w))
    });
    await p.ready();
    t(
      'a <video> without its metadata: the chain waits, no jump yet',
      p.seeks.length === 0 && live.size === 1,
      p.seeks.join(',') + ' / ' + live.size + ' listener(s)'
    );
    p.loadedmetadata();
    await waitFor(() => p.seeks.length >= 1);
    p.loadedmetadata();
    await wait(60);
    t(
      'the metadata in: the chain is skipped in one jump, once, and its listener is gone',
      p.seeks.join(',') === '12' && live.size === 0,
      p.seeks.join(',') + ' / ' + live.size + ' listener(s)'
    );
  }
  {
    let live;
    const p = sponsorBlockPage([seg('sponsor', 0, 5), seg('selfpromo', 5.1, 12)], {}, 0, {
      readyState: 0,
      setup: (w) => (live = metadataListeners(w))
    });
    await p.ready();
    t('setup: the chain waits for the metadata', live.size === 1, String(live.size));
    p.sb().destroy();
    p.loadedmetadata();
    await wait(60);
    t(
      'destroyed before the metadata: no jump, and the listener is taken off',
      p.seeks.length === 0 && live.size === 0,
      p.seeks.join(',') + ' / ' + live.size + ' listener(s)'
    );
  }

  // ---- skip once and the chain ------------------------------------------------------
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 0, 5), seg('selfpromo', 5.1, 12)],
      { skipSegmentsOnce: true },
      0
    );
    await p.ready();
    t(
      'skipSegmentsOnce: the chain on load is still skipped',
      p.model.currentTime === 12,
      String(p.model.currentTime)
    );
    p.seeked();
    p.seekTo(2);
    await wait(40);
    t(
      'skipSegmentsOnce: the first chained segment counts as skipped once',
      p.model.currentTime === 2,
      String(p.model.currentTime)
    );
    p.seekTo(6);
    await wait(40);
    t(
      'skipSegmentsOnce: so does the second one',
      p.model.currentTime === 6,
      String(p.model.currentTime)
    );
    // Back to the very start, where the chain lives: skipped once already, it
    // plays through like any other skipped segment.
    p.seekTo(0);
    await wait(40);
    t(
      'skipSegmentsOnce: a seek back to the start plays the skipped chain through',
      p.model.currentTime === 0,
      String(p.model.currentTime)
    );
  }

  // ---- a manual or muted segment inside the start chain ----
  // The player reports `seeked` after every jump, as on the TV, and the chain
  // runs again on each one.
  for (const [name, segments] of [
    ['at 0 s', [seg('intro', 0, 8), seg('sponsor', 0, 60), seg('interaction', 0, 70)]],
    ['just after 0 s', [seg('intro', 0, 8), seg('sponsor', 0.1, 60), seg('interaction', 0.3, 70)]]
  ]) {
    const p = sponsorBlockPage(segments, { sbMode_interaction: 'manual_skip' }, 0, {
      seekedAfter: 5
    });
    await p.ready();
    await wait(400);
    t(
      `a manual segment ${name} inside the start chain: no endless seeking`,
      p.seeks.length <= 1,
      p.seeks.length + ' seeks: ' + p.seeks.slice(0, 5).join(',')
    );
    t(
      `a manual segment ${name}: playback stays at the start, where it is offered`,
      p.model.currentTime < 0.5,
      String(p.model.currentTime)
    );
  }
  {
    // A manual segment starting right after the chain's end, with an
    // auto-skip one close behind it: the chain stops where the manual one
    // begins rather than jumping into it.
    const p = sponsorBlockPage(
      [seg('sponsor', 0, 10), seg('interaction', 10.1, 30), seg('selfpromo', 10.15, 20)],
      { sbMode_interaction: 'manual_skip' },
      0,
      { seekedAfter: 5 }
    );
    await p.ready();
    await wait(100);
    t(
      'a manual segment just past the chain ends it: one jump, to 10 s',
      p.seeks.join(',') === '10',
      p.seeks.join(',')
    );
  }
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 0, 30), seg('sponsor', 10, 20, 'mute')],
      { enableMutedSegments: true },
      0,
      { seekedAfter: 5 }
    );
    await p.ready();
    await wait(100);
    t(
      'a muted segment inside the start chain is jumped over in the same jump',
      p.seeks.join(',') === '30',
      p.seeks.join(',')
    );
  }

  // ---- the frame loop near a segment ----------------------------------------------------
  // Within a second of the next segment the handler checks the time every
  // frame, not only on timeupdate (four a second on the TV). Its frames are
  // counted by their callback; the page's frames run on 15 ms timers.
  /** A page playing at 10 s towards a segment at 20 s, its loop's frames counted. */
  const loopPage = async () => {
    const frames = { n: 0 };
    const p = sponsorBlockPage([seg('sponsor', 20, 30)], {}, 10, {
      setup(w) {
        const real = w.requestAnimationFrame;
        w.requestAnimationFrame = (cb) => {
          if (w.sponsorblock && cb === w.sponsorblock.boundHighFreqLoop) frames.n++;
          return real(cb);
        };
      }
    });
    await p.ready();
    p.timeupdate(19.5);
    return { p, frames };
  };
  /** Whether the loop asks for no frame over the next few. */
  const loopIdle = async (frames) => {
    const before = frames.n;
    await wait(80);
    return frames.n === before;
  };
  {
    const { p, frames } = await loopPage();
    await waitFor(() => frames.n >= 2);
    t('half a second before the segment, a frame loop runs', frames.n >= 2, String(frames.n));
    // The playhead moves into the segment with no timeupdate to say so.
    p.model.currentTime = 20.1;
    await waitFor(() => p.model.currentTime === 30);
    t(
      'a frame sees the playhead in the segment and skips it, with no timeupdate',
      p.model.currentTime === 30,
      String(p.model.currentTime)
    );
    t('and the loop stops after the skip', await loopIdle(frames), String(frames.n));
  }
  {
    const { p, frames } = await loopPage();
    await waitFor(() => frames.n >= 2);
    p.model.paused = true;
    p.win.document.querySelector('video').dispatchEvent(new p.win.Event('pause'));
    t('a pause stops the loop', await loopIdle(frames), String(frames.n));
    p.model.currentTime = 20.1;
    await wait(60);
    t('and a paused playhead in the segment is not skipped', p.model.currentTime === 20.1);
  }
  {
    const { p, frames } = await loopPage();
    await waitFor(() => frames.n >= 2);
    p.sb().destroy();
    t('destroying the handler stops the loop', await loopIdle(frames), String(frames.n));
  }
  {
    const { p, frames } = await loopPage();
    await waitFor(() => frames.n >= 2);
    // A seek back, far from the segment: no frame loop is needed there.
    p.seekTo(5);
    t('a seek away from the segment stops the loop', await loopIdle(frames), String(frames.n));
  }

  // ---- overlapping segments ---------------------------------------------------------
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 40), seg('selfpromo', 30, 50), seg('intro', 50.1, 60)],
      {},
      10
    );
    await p.ready();
    t(
      'overlapping segments are all drawn',
      !!p.overlay() && p.overlay().children.length === 3,
      p.overlay() && String(p.overlay().children.length)
    );
    p.timeupdate(21);
    await wait(40);
    t(
      'a segment overlapping the next, and one starting right after, go in one jump',
      p.model.currentTime === 60,
      String(p.model.currentTime)
    );
    t(
      'three categories are listed with commas and "and"',
      p.toasts().some((m) => m === 'Skipped sponsored, self-promotion, and intro segment'),
      p.toasts().join(' | ')
    );
    p.seeked();
    // Inside the overlap only the later segment is ahead: the jump still
    // covers everything that follows.
    p.seekTo(45);
    await wait(40);
    t(
      'a seek into the overlapping part lands past the whole run',
      p.model.currentTime === 60,
      String(p.model.currentTime)
    );
  }

  // ---- a skip whose seeked never comes: the watchdog lets go ------------------------
  {
    // No seeked from the player at all: after the watchdog (1.5 s, here 300
    // ms) the next segment is skipped like any other.
    const p = sponsorBlockPage([seg('sponsor', 20, 30), seg('intro', 50, 60)], {}, 10);
    await p.ready();
    p.timeupdate(21);
    await wait(40);
    t(
      'setup: the first segment is skipped',
      p.model.currentTime === 30,
      String(p.model.currentTime)
    );
    await wait(450);
    p.timeupdate(51);
    await wait(40);
    t(
      "a skip whose 'seeked' never arrives does not hold the next one",
      p.model.currentTime === 60,
      String(p.model.currentTime)
    );
  }

  // ---- the temporary whitelist ---------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('sponsor', 20, 30), seg('intro', 50, 60)], {}, 45);
    await p.ready();
    t('skipToPreviousSegment from 45 goes to the sponsor', p.sb().skipToPreviousSegment() === true);
    p.seeked();
    p.timeupdate(25);
    await wait(40);
    t(
      'the whitelisted segment plays through',
      p.model.currentTime === 25,
      String(p.model.currentTime)
    );
    // Leaving the segment ends the whitelist: the next visit is skipped.
    p.timeupdate(31);
    await wait(40);
    p.seekTo(22);
    await wait(40);
    t('the next visit is skipped again', p.model.currentTime === 30, String(p.model.currentTime));
    p.seeked();
    // Whitelisting one segment does not spare the others: entering another
    // one skips it and drops the whitelist.
    p.model.currentTime = 45;
    p.sb().skipToPreviousSegment();
    p.seeked();
    p.seekTo(51);
    await wait(40);
    t(
      'a different segment entered meanwhile is skipped',
      p.model.currentTime === 60,
      String(p.model.currentTime)
    );
    p.seeked();
    p.model.currentTime = 21;
    t(
      'no segment starts more than 2 s before the playhead: nothing to go back to',
      p.sb().skipToPreviousSegment() === false
    );
  }

  {
    // "Skip to last" into a segment that opens the video: the chain at the
    // start leaves the whitelisted segment alone too.
    const p = sponsorBlockPage([seg('sponsor', 0, 30)], {}, 45);
    await p.ready();
    t(
      'setup: past the segment nothing is skipped on load',
      p.seeks.length === 0,
      p.seeks.join(',')
    );
    t('skipToPreviousSegment from 45 goes back to 0', p.sb().skipToPreviousSegment() === true);
    p.seeked();
    await wait(40);
    p.state(1);
    await wait(40);
    t(
      'the chain at the start does not skip the whitelisted segment, on seeked or on PLAYING',
      p.seeks.join(',') === '0' && p.model.currentTime === 0,
      p.seeks.join(',')
    );
    t(
      'and no skip is announced',
      !p.toasts().some((m) => /^Skipped/.test(m)),
      p.toasts().join(' | ')
    );
  }

  // ---- highlight --------------------------------------------------------------------
  {
    const p = sponsorBlockPage([seg('poi_highlight', 200, 200)], { sbMode_highlight: 'ask' }, 40);
    await p.ready();
    t(
      'highlight in ask mode: an offer, no jump',
      p.model.currentTime === 40 &&
        p.toasts().some((m) => m === 'Highlight available: Press Blue to jump'),
      p.toasts().join(' | ')
    );
    const handled = p.sb().manualSkipOrHighlight();
    await wait(40);
    t(
      'blue jumps to the highlight',
      handled === true && p.model.currentTime === 200,
      String(p.model.currentTime)
    );
    t(
      'the jump is announced',
      p.toasts().some((m) => m === 'Jumped to Highlight'),
      p.toasts().join(' | ')
    );
  }
  {
    const p = sponsorBlockPage(
      [seg('poi_highlight', 200, 200)],
      { sbMode_highlight: 'auto_skip' },
      40
    );
    await p.ready();
    t(
      'highlight in auto mode: jumped on load',
      p.model.currentTime === 200,
      String(p.model.currentTime)
    );
  }

  // ---- the shortcuts as key presses ---------------------------------------------------
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30), seg('intro', 50, 60), seg('poi_highlight', 200, 200)],
      {
        shortcut_key_blue: 'sb_manual_skip',
        shortcut_key_1: 'sb_skip_prev',
        sbMode_intro: 'manual_skip',
        sbMode_highlight: 'ask'
      },
      40
    );
    await p.ready();
    p.press(DIGIT(1));
    await wait(40);
    t(
      'the key bound to sb_skip_prev seeks to the previous segment',
      p.model.currentTime === 20 && p.toasts().some((m) => m === 'Seeked to Sponsored'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
    p.seeked();
    await wait(150); // past the repeated-key debounce
    p.press(DIGIT(1));
    await wait(40);
    t(
      'with nothing before the playhead the key says so',
      p.model.currentTime === 20 && p.toasts().some((m) => m === 'No previous segment found'),
      p.toasts().join(' | ')
    );
    p.seekTo(51);
    await wait(40);
    t(
      'the manual segment is offered',
      p.toasts().some((m) => m === 'Intro: Press Blue to skip'),
      p.toasts().join(' | ')
    );
    p.press(KEYS.BLUE);
    await wait(40);
    t(
      'the blue key skips the offered segment',
      p.model.currentTime === 60 && p.toasts().some((m) => m === 'Skipped Segment'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
    p.seeked();
    await wait(150);
    p.press(KEYS.BLUE);
    await wait(40);
    t(
      'with no segment offered the blue key jumps to the highlight',
      p.model.currentTime === 200 && p.toasts().some((m) => m === 'Jumped to Highlight'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
  }
  {
    const p = sponsorBlockPage(
      [seg('sponsor', 20, 30)],
      { shortcut_key_blue: 'sb_manual_skip' },
      40
    );
    await p.ready();
    p.press(KEYS.BLUE);
    await wait(40);
    t(
      'no manual segment and no highlight: the blue key has nothing to do',
      p.model.currentTime === 40 && p.toasts().some((m) => m === 'No action available'),
      p.toasts().join(' | ')
    );
  }

  // ---- the interaction, non-music and hook categories ----
  {
    const p = sponsorBlockPage(
      [seg('interaction', 10, 20), seg('musicofftopic', 30, 40), seg('hook', 50, 60)],
      {},
      0
    );
    await p.ready();
    t(
      'setup: the three categories are drawn',
      !!p.overlay() && p.overlay().children.length === 3,
      p.overlay() && String(p.overlay().children.length)
    );
    p.timeupdate(11);
    await wait(40);
    t(
      'an interaction reminder is auto-skipped by default and announced',
      p.model.currentTime === 20 &&
        p.toasts().some((m) => m === 'Skipped interaction reminder segment'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
    p.seeked();
    p.timeupdate(31);
    await wait(40);
    t(
      'a non-music part is auto-skipped by default and announced',
      p.model.currentTime === 40 && p.toasts().some((m) => m === 'Skipped non-music part segment'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
    p.seeked();
    p.timeupdate(51);
    await wait(40);
    t(
      'a hook is only drawn by default: not skipped',
      p.model.currentTime === 51,
      String(p.model.currentTime)
    );
  }
  {
    const p = sponsorBlockPage([seg('hook', 50, 60)], { sbMode_hook: 'auto_skip' }, 0);
    await p.ready();
    p.timeupdate(51);
    await wait(40);
    t(
      'a hook set to auto-skip is skipped and announced',
      p.model.currentTime === 60 && p.toasts().some((m) => m === 'Skipped hook/greetings segment'),
      String(p.model.currentTime) + ' ' + p.toasts().join(' | ')
    );
  }

  // ---- a malformed entry in the API answer ----
  {
    const p = sponsorBlockPage(
      [
        seg('sponsor', 20, 30),
        { category: 'sponsor', actionType: 'skip', segment: null, UUID: 'broken1' },
        { category: 'selfpromo', actionType: 'skip', segment: ['40', 50], UUID: 'broken2' },
        { actionType: 'skip', segment: [60, 70], UUID: 'broken3' }
      ],
      {},
      10
    );
    await p.ready();
    p.timeupdate(21);
    await wait(40);
    t(
      'malformed entries are dropped and the good segment is still skipped',
      p.model.currentTime === 30 && !!p.overlay() && p.overlay().children.length === 1,
      String(p.model.currentTime) +
        ' / ' +
        (p.overlay() ? p.overlay().children.length : 'no overlay')
    );
  }

  report.finish();
})();
