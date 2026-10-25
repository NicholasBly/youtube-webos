/**
 * Measures the cost of opening the options panel: the wall time of the keydown
 * handler that builds and shows it, and the elements created in that handler
 * against those created in the frames after it, where the other three pages
 * are built. On a webOS 3 capture the synchronous build of all four pages was
 * one 170 ms call and an fps drop from 60 to 32; element creation and the
 * style and layout work behind it is what costs on Chromium 38. A measurement,
 * not a check: tests/behaviour/panel-test.cjs holds the budget.
 *
 * Run after `npm run build`: node tests/bench/panel-bench.cjs [bundle]
 */
const { createPage } = require('../harness/page.cjs');
const { countCreated, press, KEYS } = require('../harness/fixtures.cjs');

let counter;
const { win, pump } = createPage({
  config: {
    enableLegacyEmojiFix: true,
    enableSponsorBlock: true,
    enableReturnYouTubeDislike: true,
    enableAutoLogin: true
  },
  setup(win) {
    counter = countCreated(win);
  }
});

setTimeout(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const before = counter.created;
  const t0 = process.hrtime.bigint();
  press(win, KEYS.GREEN, win.document.body);
  const openMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const inHandler = counter.created - before;

  const panel = win.document.querySelector('.ytaf-ui-container');
  console.log('=== opening the options panel ===');
  console.log(`panel visible after the keypress : ${!!panel && panel.style.display === 'block'}`);
  console.log(`createElement calls IN the handler: ${inHandler}`);
  console.log(`handler wall time                 : ${openMs.toFixed(2)} ms`);

  const beforeDeferred = counter.created;
  for (let f = 0; f < 30; f++) {
    pump();
    await tick();
  }
  console.log(`createElement calls deferred to later frames: ${counter.created - beforeDeferred}`);

  console.log('\nelements per page (after everything settles):');
  const count = (sel) => {
    const p = panel && panel.querySelector(sel);
    return p ? p.getElementsByTagName('*').length : 0;
  };
  for (const [name, sel] of [
    ['Main', '#ytaf-page-main'],
    ['SponsorBlock', '#ytaf-page-sponsor'],
    ['Shortcuts', '#ytaf-page-shortcuts'],
    ['UI Tweaks', '#ytaf-page-ui-tweaks']
  ]) {
    console.log(`  ${name.padEnd(13)} ${String(count(sel)).padStart(4)}`);
  }
  console.log(
    `  ${'TOTAL panel'.padEnd(13)} ${String(panel ? panel.getElementsByTagName('*').length : 0).padStart(4)}`
  );
  process.exit(0);
}, 500);
