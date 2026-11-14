/**
 * Playback speed (features/playback-speed) against the built bundle on both
 * flavours. The webOS 22+ build, on a page that has WebCodecs (stubbed, with
 * MediaSource and Web Audio): nothing is installed while the setting is off
 * (MediaSource and URL untouched, YouTube's speed flag not offered), the panel
 * has the row, turning it on installs the engine's hook and the menu flag, a
 * shortcut with the setting off says where to turn it on. Without WebCodecs
 * (webOS 22), and in the legacy build, which has no engine at all: no row,
 * and the shortcut says webOS 23 is needed.
 *
 * Run: node tests/behaviour/playback-speed-test.cjs [bundle] [legacy|modern]
 */
const { createPage, flavour } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  KEYS,
  DIGIT,
  press,
  toasts,
  panelCheckbox,
  showPanel
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;
const modern = flavour === 'modern';

/** A watch page; with `codecs`, the WebCodecs, Web Audio and MSE stubs the engine looks for. */
function boot(config, codecs) {
  const stubs = {};
  const page = createPage({
    page: 'watch',
    config: Object.assign({ shortcut_key_1: 'speed_up' }, config),
    setup(win) {
      if (!codecs) return;
      win.AudioDecoder = class {};
      win.AudioContext = class {};
      win.MediaSource = class {
        addSourceBuffer() {}
      };
      stubs.addSourceBuffer = win.MediaSource.prototype.addSourceBuffer;
      stubs.createObjectURL = win.URL.createObjectURL;
    }
  });
  return Object.assign(page, { stubs });
}

/** The 'enableSpeedOptions' flag as YouTube reads it off a fresh config object. */
const speedFlag = (win) => win.eval('({}).enableSpeedOptions');

(async () => {
  if (modern) {
    // ---- off (the default): nothing installed -----------------------------------------
    {
      const page = boot({}, true);
      const { win, stubs } = page;
      await wait(50);
      t(
        'off: MediaSource and URL are untouched',
        win.MediaSource.prototype.addSourceBuffer === stubs.addSourceBuffer &&
          win.URL.createObjectURL === stubs.createObjectURL
      );
      t(
        'off: YouTube is not offered its speed menu',
        speedFlag(win) === undefined,
        String(speedFlag(win))
      );
      press(win, DIGIT(1));
      await waitFor(() => toasts(win).some((x) => /Turn on Playback Speed/.test(x)), 1000);
      t(
        'off: the shortcut says where to turn it on',
        toasts(win).some((x) => /Turn on Playback Speed/.test(x)),
        toasts(win).join(' | ')
      );

      // ---- turned on in the panel: installed ---------------------------------------
      await showPanel(page);
      const box = panelCheckbox(win, 'Playback Speed (experimental)');
      t(
        'the UI Tweaks page has the row',
        !!box && !!box.closest('#ytaf-page-ui-tweaks') && !box.checked
      );
      box.click();
      t(
        'on: the engine hooks MediaSource and URL',
        win.MediaSource.prototype.addSourceBuffer !== stubs.addSourceBuffer &&
          win.URL.createObjectURL !== stubs.createObjectURL
      );
      t('on: YouTube is offered its speed menu', speedFlag(win) === true, String(speedFlag(win)));
      t(
        'on: the controller is there for diagnostics',
        !!win.ytafSpeed && win.ytafSpeed.getSpeed() === 1
      );
      box.click();
      t(
        'off again: the menu flag stands aside',
        speedFlag(win) === undefined,
        String(speedFlag(win))
      );
    }
    // ---- on from the start ----------------------------------------------------------
    {
      const { win, stubs } = boot({ enablePlaybackSpeed: true }, true);
      await wait(50);
      t(
        'on at start: installed before YouTube creates a MediaSource',
        win.MediaSource.prototype.addSourceBuffer !== stubs.addSourceBuffer
      );
    }
  }

  // ---- no WebCodecs (webOS 22), or the legacy build: no row, the shortcut says why ------
  {
    const page = boot({ enablePlaybackSpeed: true }, false);
    const { win } = page;
    await wait(50);
    await showPanel(page);
    t(
      'without WebCodecs: no Playback Speed row',
      panelCheckbox(win, 'Playback Speed (experimental)') === null
    );
    press(win, KEYS.BACK);
    await wait(50);
    press(win, DIGIT(1));
    await waitFor(() => toasts(win).length > 0, 1000);
    t(
      modern
        ? 'webOS 22: the shortcut says webOS 23 is needed'
        : 'legacy build: the shortcut says webOS 23 is needed',
      toasts(win).some((x) => x === 'Playback speed needs webOS 23 or newer'),
      toasts(win).join(' | ')
    );
  }

  report.finish();
})();
