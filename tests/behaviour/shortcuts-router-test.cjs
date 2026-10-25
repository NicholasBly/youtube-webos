/**
 * The shortcut router against the built legacy bundle, every action through a
 * real key press on the body: the subtitles toggle through the player API or,
 * without an answer from it, the captions button; the comments, description
 * and save buttons (a click when the panel is closed, Back when it is up, the
 * YouTube component's own onSelect() called as well, its failure reported),
 * the description button by its fallback selector, the live chat, the soft
 * reload on a browse page, the SponsorBlock
 * shortcuts without a handler, an unknown action name in the config, repeated
 * key events, digits in a text box (a panel checkbox is none) and on the
 * search page, the colour keys with their alternate codes, the keys the open
 * panel keeps, the debounce and the forced Green binding when nothing opens
 * the settings, at the start and when the panel closes.
 *
 * Run: node tests/behaviour/shortcuts-router-test.cjs [bundle]
 */
const { createPage } = require('../harness/page.cjs');
const { createReport } = require('../harness/report.cjs');
const {
  wait,
  waitFor,
  KEYS,
  press: pressOn,
  toasts: toastsOf,
  openPanel,
  videoModel,
  DIGIT,
  ALT,
  storedConfig,
  clock
} = require('../harness/fixtures.cjs');

const report = createReport();
const t = report.check;

// The bindings every watch-page boot starts from; a case overrides what it needs.
const BINDINGS = {
  shortcut_key_1: 'toggle_subs',
  shortcut_key_2: 'none',
  shortcut_key_3: 'play_pause',
  shortcut_key_4: 'toggle_comments',
  shortcut_key_5: 'none',
  shortcut_key_6: 'toggle_description',
  shortcut_key_7: 'save_to_playlist',
  shortcut_key_8: 'refresh_page',
  shortcut_key_9: 'sb_skip_prev'
};

/**
 * A page with the player, the buttons the panel actions look for (the
 * selectors of core/selectors.js), a hidden engagement panel, a text box and
 * a focusable element outside the player. `bodyClass` picks the page kind.
 * The console warnings and the key presses that reach the document are recorded.
 */
function boot(cfg, bodyClass, options) {
  const o = options || {};
  const warns = [];
  let model;
  const page = createPage({
    html: `<!doctype html><html><body class="${bodyClass || 'WEB_PAGE_TYPE_WATCH'}"><ytlr-app>
       <div id="ytlr-player__player-container"><video></video></div>
       <div id="ytlr-player__player-container-player"></div>
       <ytlr-engagement-panel-section-list-renderer id="engagement" style="display: none">
       </ytlr-engagement-panel-section-list-renderer>
       <yt-button-container aria-label="Comments" id="comments"></yt-button-container>
       <yt-button-container id="description">
         <yt-formatted-string class="XGffTd OqGroe">Description</yt-formatted-string>
       </yt-button-container>
       <yt-button-container aria-label="Save" id="save"></yt-button-container>
       <input id="textbox"><textarea id="textarea"></textarea>
       <div id="other" tabindex="0"></div>
     </ytlr-app></body></html>`,
    url: 'https://www.youtube.com/tv#/watch?v=vid00000001',
    config: Object.assign({ enableSponsorBlock: false }, BINDINGS, cfg),
    captureKeys: true,
    // The panel ignores toggles for 500 ms after its first build: 50 ms here,
    // unless the case brings its own scale.
    timers: o.timers || { scale: 10, from: 500 },
    setup(win) {
      win.console.warn = (...args) => warns.push(args.join(' '));
      model = videoModel(win, { currentTime: 10, duration: 100, paused: true });
    }
  });
  const win = page.win;
  const d = win.document;
  // Clicks on the three buttons, by id.
  const clicks = { comments: 0, description: 0, save: 0 };
  Object.keys(clicks).forEach((id) => {
    d.getElementById(id).addEventListener('click', () => {
      clicks[id]++;
    });
  });
  return {
    page,
    win,
    d,
    model,
    warns,
    clicks,
    keys: page.keys,
    press: (code, target) => pressOn(win, code, target || d.body),
    toasts: () => toastsOf(win),
    panel: () => d.querySelector('.ytaf-ui-container'),
    /** The Back presses the shortcuts sent so far. */
    backs: () => page.keys.filter((k) => k === KEYS.BACK).length
  };
}

/** A fake player with the captions API: `track` is what setOption last stored. */
function fakePlayer(d) {
  const player = d.getElementById('ytlr-player__player-container-player');
  const state = { track: {}, calls: [] };
  player.loadModule = (name) => state.calls.push('loadModule:' + name);
  player.getOption = (module, key) => {
    state.calls.push(`getOption:${module}:${key}`);
    if (key === 'track') return state.track;
    if (key === 'tracklist') return [{ languageCode: 'en', languageName: 'English' }];
    return null;
  };
  player.setOption = (module, key, value) => {
    state.calls.push(`setOption:${module}:${key}`);
    if (key === 'track') state.track = value;
  };
  return state;
}

(async () => {
  // ---- toggle_subs through the player API ----------------------------------------
  {
    const { d, press, toasts } = boot();
    const player = fakePlayer(d);
    press(DIGIT(1));
    t(
      'toggle_subs loads the captions module and sets the first track of the list',
      player.calls.indexOf('loadModule:captions') !== -1 &&
        player.calls.indexOf('setOption:captions:track') !== -1 &&
        player.track.languageCode === 'en',
      player.calls.join(' | ')
    );
    t(
      'and the toast names the language',
      toasts().some((m) => m === 'Subtitles: ON (English)'),
      toasts().join(' | ')
    );
    await wait(150); // past the repeated-key debounce
    press(DIGIT(1));
    t(
      'a second press clears the track and says so',
      !player.track.languageCode && toasts().some((m) => m === 'Subtitles: OFF'),
      toasts().join(' | ')
    );
  }

  // ---- toggle_subs on a video without captions ----------------------------------------
  {
    const { d, press, toasts } = boot();
    fakePlayer(d);
    const el = d.getElementById('ytlr-player__player-container-player');
    // No track on and none to turn on.
    el.getOption = (module, key) => (key === 'tracklist' ? [] : {});
    el.getVideoData = () => ({ captionTracks: [] });
    press(DIGIT(1));
    t(
      'no caption track and no captions button: the toast says subtitles are unavailable',
      toasts().some((m) => m === 'Subtitles unavailable'),
      toasts().join(' | ')
    );
  }

  // ---- toggle_subs through the captions button, the player API giving no answer ----------
  {
    const { d, press, toasts } = boot();
    const el = d.getElementById('ytlr-player__player-container-player');
    // The API is there but has no track list and no caption tracks.
    el.getOption = (module, key) => (key === 'tracklist' ? [] : {});
    el.setOption = () => {};
    el.getVideoData = () => ({ captionTracks: [] });
    const host = d.createElement('ytlr-captions-button');
    const button = d.createElement('yt-button-container');
    button.addEventListener('click', () => button.setAttribute('aria-pressed', 'true'));
    host.appendChild(button);
    d.querySelector('ytlr-app').appendChild(host);
    press(DIGIT(1));
    await waitFor(() => toasts().some((m) => m === 'Subtitles: ON'));
    t(
      'no answer from the player API: the captions button is pressed and its state is the toast',
      button.getAttribute('aria-pressed') === 'true' && toasts().some((m) => m === 'Subtitles: ON'),
      toasts().join(' | ')
    );
  }

  // ---- toggle_comments ------------------------------------------------------------
  {
    const { d, press, clicks, backs } = boot();
    press(DIGIT(4));
    t(
      'toggle_comments with no panel open clicks the comments button',
      clicks.comments === 1 && backs() === 0,
      `clicks ${clicks.comments}, backs ${backs()}`
    );
    await wait(150);
    d.getElementById('engagement').style.display = 'block';
    press(DIGIT(4));
    t(
      'with the engagement panel visible it sends Back instead of clicking',
      clicks.comments === 1 && backs() === 1,
      `clicks ${clicks.comments}, backs ${backs()}`
    );
    d.getElementById('engagement').style.display = 'none';
    await wait(150);
    d.getElementById('comments').setAttribute('aria-pressed', 'true');
    press(DIGIT(4));
    t(
      'a button that reads pressed is closed with Back too',
      clicks.comments === 1 && backs() === 2,
      `clicks ${clicks.comments}, backs ${backs()}`
    );
  }
  {
    const { d, press, toasts } = boot();
    d.getElementById('comments').remove();
    press(DIGIT(4));
    t(
      'no comments button and no live chat: the toast says comments are unavailable',
      toasts().some((m) => m === 'Comments Unavailable'),
      toasts().join(' | ')
    );
  }

  // ---- the YouTube component behind a button: its onSelect() too ------------------------
  {
    const { d, press, clicks, toasts } = boot();
    const button = d.getElementById('comments');
    const selects = [];
    button.__instance = { onSelect: (evt) => selects.push(evt) };
    press(DIGIT(4));
    t(
      "the button's component gets onSelect() with a click of its own besides the DOM click",
      clicks.comments === 1 &&
        selects.length === 1 &&
        selects[0].type === 'click' &&
        selects[0].target === button &&
        typeof selects[0].preventDefault === 'function',
      `clicks ${clicks.comments}, onSelect ${selects.length}`
    );
    t('and no toast says it failed', !toasts().some((m) => /Unavailable/.test(m)));
  }
  {
    const { d, press, toasts } = boot();
    d.getElementById('comments').__instance = {
      onSelect: () => {
        throw new Error('component gone');
      }
    };
    press(DIGIT(4));
    t(
      'an onSelect() that throws: the toast says the panel is unavailable',
      toasts().some((m) => m === 'Comments Unavailable'),
      toasts().join(' | ')
    );
  }

  // ---- toggle_description ---------------------------------------------------------
  {
    const { d, press, clicks, backs } = boot();
    press(DIGIT(6));
    t(
      'toggle_description clicks the button behind the "Description" label',
      clicks.description === 1 && backs() === 0,
      `clicks ${clicks.description}, backs ${backs()}`
    );
    await wait(150);
    d.getElementById('engagement').style.display = 'block';
    press(DIGIT(6));
    t(
      'with the engagement panel visible the description is closed with Back',
      clicks.description === 1 && backs() === 1,
      `clicks ${clicks.description}, backs ${backs()}`
    );
  }

  {
    // A label in another language: the generic text button inside a button
    // renderer is the one found.
    const { d, press, clicks } = boot();
    const button = d.getElementById('description');
    button.textContent = '';
    const renderer = d.createElement('ytlr-button-renderer');
    const label = d.createElement('yt-formatted-string');
    label.className = 'XGffTd OqGroe';
    label.textContent = 'Opis';
    renderer.appendChild(label);
    button.appendChild(renderer);
    press(DIGIT(6));
    t(
      'a label that does not read "Description": the fallback selector finds the button',
      clicks.description === 1,
      `clicks ${clicks.description}`
    );
  }

  // ---- save_to_playlist -----------------------------------------------------------
  {
    const { d, press, clicks, backs } = boot();
    press(DIGIT(7));
    t(
      'save_to_playlist clicks the save button',
      clicks.save === 1 && backs() === 0,
      `clicks ${clicks.save}, backs ${backs()}`
    );
    await wait(150);
    const overlay = d.createElement('div');
    overlay.className = 'AmQJbe';
    d.body.appendChild(overlay);
    press(DIGIT(7));
    t(
      'with the overlay panel up the save dialog is closed with Back',
      clicks.save === 1 && backs() === 1,
      `clicks ${clicks.save}, backs ${backs()}`
    );
  }

  // ---- toggle_comments on a live stream: the chat button instead ----------------------
  {
    const { d, press, toasts } = boot();
    d.getElementById('comments').remove();
    const chat = d.createElement('yt-button-container');
    chat.setAttribute('aria-label', 'Live chat');
    chat.addEventListener('click', () => {
      chat.setAttribute(
        'aria-pressed',
        chat.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'
      );
    });
    d.querySelector('ytlr-app').appendChild(chat);
    press(DIGIT(4));
    await waitFor(() => toasts().some((m) => m === 'Live Chat: ON'));
    t(
      'toggle_comments with no comments button turns the live chat on and says so',
      chat.getAttribute('aria-pressed') === 'true' && toasts().some((m) => m === 'Live Chat: ON'),
      toasts().join(' | ')
    );
  }

  {
    const { d, press, toasts } = boot();
    d.getElementById('comments').remove();
    const chat = d.createElement('yt-button-container');
    chat.setAttribute('aria-label', 'Live chat');
    chat.__instance = {
      onSelect: () => {
        throw new Error('chat gone');
      }
    };
    d.querySelector('ytlr-app').appendChild(chat);
    press(DIGIT(4));
    t(
      'a live chat button whose component fails: the toast says the chat is unavailable',
      toasts().some((m) => m === 'Live Chat Unavailable'),
      toasts().join(' | ')
    );
  }

  // ---- refresh_page ---------------------------------------------------------------
  {
    const { d, press } = boot({}, 'WEB_PAGE_TYPE_BROWSE');
    let command = null;
    d.querySelector('ytlr-app').addEventListener('innertube-command', (e) => {
      command = e.detail;
    });
    press(DIGIT(8));
    const signal =
      command &&
      command.signalServiceEndpoint &&
      command.signalServiceEndpoint.actions[0].signalAction.signal;
    t(
      'refresh_page on a browse page sends SOFT_RELOAD_PAGE through innertube-command on the app root',
      signal === 'SOFT_RELOAD_PAGE',
      JSON.stringify(command)
    );
  }
  {
    const { d, press, toasts } = boot();
    let commands = 0;
    d.querySelector('ytlr-app').addEventListener('innertube-command', () => {
      commands++;
    });
    press(DIGIT(8));
    await wait(50);
    t(
      'refresh_page on a watch page sends no soft reload and says why',
      commands === 0 && toasts().some((m) => m === 'Cannot refresh on player pages'),
      toasts().join(' | ')
    );
  }
  {
    const { d, press, toasts } = boot({}, 'WEB_PAGE_TYPE_SHORTS');
    let commands = 0;
    d.querySelector('ytlr-app').addEventListener('innertube-command', () => {
      commands++;
    });
    press(DIGIT(8));
    await wait(50);
    t(
      'refresh_page on Shorts sends no soft reload either',
      commands === 0 && toasts().some((m) => m === 'Cannot refresh on player pages'),
      toasts().join(' | ')
    );
  }

  // ---- the SponsorBlock shortcuts without a handler --------------------------------
  {
    const { press, toasts } = boot();
    press(KEYS.BLUE); // the default blue binding: sb_manual_skip
    t(
      'sb_manual_skip with no SponsorBlock handler says it is not loaded',
      toasts().some((m) => m === 'SponsorBlock not loaded'),
      toasts().join(' | ')
    );
  }
  {
    const { press, toasts } = boot();
    press(DIGIT(9));
    t(
      'sb_skip_prev with no SponsorBlock handler says it is not loaded',
      toasts().some((m) => m === 'SponsorBlock not loaded'),
      toasts().join(' | ')
    );
  }

  // ---- an unknown action name in the config (a binding from an older build) ----------
  {
    const { win, press, warns, model } = boot({ shortcut_key_2: 'bogus_action' });
    t(
      'it is logged once at start, naming the action and the key',
      warns.filter((w) => w.indexOf('bogus_action') !== -1).length === 1 &&
        warns.some((w) => w === '[Shortcut] Unknown action "bogus_action" on key 2: set to None'),
      warns.join(' | ')
    );
    // An error in the router would reach jsdom, not this call, and fail the
    // report's console.error check.
    const evt = press(DIGIT(2));
    press(DIGIT(2));
    t(
      'the presses add no warning',
      warns.filter((w) => w.indexOf('bogus_action') !== -1).length === 1,
      warns.join(' | ')
    );
    await waitFor(() => {
      const stored = storedConfig(win);
      return stored.shortcut_key_2 === 'none';
    });
    t(
      'the binding is stored as None, which the panel can show',
      storedConfig(win).shortcut_key_2 === 'none'
    );
    t(
      'and the key is left to the app',
      !!evt && !evt.defaultPrevented && model.plays === 0,
      evt && String(evt.defaultPrevented)
    );
  }

  // ---- key events the router ignores -------------------------------------------------
  {
    const { win, d, press, model } = boot();
    const repeat = new win.KeyboardEvent('keydown', {
      keyCode: DIGIT(3),
      repeat: true,
      bubbles: true,
      cancelable: true
    });
    d.body.dispatchEvent(repeat);
    t(
      'a repeated keydown of a bound key (key held) runs nothing and does not reach YouTube',
      model.plays === 0 && repeat.defaultPrevented,
      `plays ${model.plays}, prevented ${repeat.defaultPrevented}`
    );
    const inInput = press(DIGIT(3), d.getElementById('textbox'));
    const inTextarea = press(DIGIT(3), d.getElementById('textarea'));
    t(
      "a digit typed in a text box or a textarea is YouTube's, not a shortcut",
      model.plays === 0 && !inInput.defaultPrevented && !inTextarea.defaultPrevented,
      `plays ${model.plays}`
    );
    const yellow = press(KEYS.YELLOW);
    const yellowAlt = press(ALT.YELLOW);
    t(
      'yellow is not a configurable key: both its codes pass through untouched',
      !yellow.defaultPrevented && !yellowAlt.defaultPrevented && model.plays === 0
    );
  }
  {
    const { press, panel } = boot({ shortcut_key_3: 'config_menu' }, 'WEB_PAGE_TYPE_SEARCH');
    const evt = press(DIGIT(3));
    t(
      'on the search page a digit is left to the search box, even bound to a global action',
      !panel() && !evt.defaultPrevented
    );
    press(KEYS.GREEN);
    t('while a colour key on the search page still runs its action', !!panel());
  }

  // ---- the colour keys and their alternate codes -------------------------------------
  {
    const { win, d, press, toasts, panel } = boot();
    press(ALT.BLUE[0]);
    t(
      'the first alternate blue code runs the blue binding',
      toasts().some((m) => m === 'SponsorBlock not loaded'),
      toasts().join(' | ')
    );
    const second = press(ALT.BLUE[1]);
    t('the second alternate blue code runs it too', second.defaultPrevented);
    press(ALT.RED);
    t(
      'the alternate red code runs the red binding (the OLED overlay)',
      !!d.getElementById('ytaf-oled-overlay')
    );
    await wait(150);
    press(KEYS.RED);
    t('and the standard red code takes it down again', !d.getElementById('ytaf-oled-overlay'));
    await wait(150);
    press(ALT.GREEN);
    t(
      'the alternate green code opens the settings',
      !!panel() && panel().style.display === 'block'
    );
    // The panel ignores toggles for 500 ms (50 here) after its first build,
    // and the router takes Green again only past its 100 ms debounce.
    await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
    await wait(150);
    // webOS 3 reports the alternate codes in charCode with keyCode 0.
    const charCodeGreen = new win.KeyboardEvent('keydown', {
      keyCode: 0,
      charCode: ALT.GREEN,
      bubbles: true,
      cancelable: true
    });
    d.body.dispatchEvent(charCodeGreen);
    t(
      'an alternate code reported in charCode with keyCode 0 is read as the colour key',
      panel().style.display === 'none' && charCodeGreen.defaultPrevented,
      panel().style.display
    );
  }

  // ---- the open panel keeps the keys, apart from the menu key -------------------------
  {
    const { page, press, model, panel, d } = boot({ shortcut_key_red: 'none' });
    openPanel(page);
    t('setup: the panel is open', !!panel() && panel().style.display === 'block');
    const digit = press(DIGIT(3));
    const blue = press(KEYS.BLUE);
    const red = press(KEYS.RED);
    t(
      'an unbound colour key is swallowed by the open panel too',
      red.defaultPrevented && panel().style.display === 'block'
    );
    t(
      'with the panel open a digit shortcut is swallowed, not run',
      model.plays === 0 && digit.defaultPrevented,
      `plays ${model.plays}`
    );
    t(
      'and so is a colour key bound to another action',
      blue.defaultPrevented && d.querySelectorAll('.ytaf-toast').length === 0
    );
    // Past the toggle block after the first build (500 ms, 50 here), with room
    // for a late timer on a loaded machine.
    await wait(200);
    press(KEYS.GREEN);
    t('the menu key still closes the panel', panel().style.display === 'none');
  }

  // ---- the debounce -----------------------------------------------------------------
  {
    const { d, press, model, toasts } = boot();
    fakePlayer(d);
    press(DIGIT(3));
    const again = press(DIGIT(3));
    t(
      'the same key within 100 ms is one press: the second is swallowed',
      model.plays === 1 && model.pauses === 0 && again.defaultPrevented,
      JSON.stringify(model)
    );
    press(DIGIT(1));
    t(
      'a different key right after is not debounced',
      toasts().some((m) => m === 'Subtitles: ON (English)'),
      toasts().join(' | ')
    );
    await wait(150);
    press(DIGIT(3));
    t('the same key after the debounce runs again', model.pauses === 1, JSON.stringify(model));
  }
  {
    // A held key on a remote that sends no repeat flag: presses every 60 ms,
    // on the page's clock (a real 60 ms wait could pass the 100 ms debounce on
    // a loaded machine).
    const { win, d, press, model } = boot();
    fakePlayer(d);
    const c = clock(win);
    for (let i = 0; i < 4; i++) {
      press(DIGIT(3));
      c.offset += 60;
    }
    t(
      'a held key without the repeat flag runs once: each swallowed press extends the debounce',
      model.plays === 1 && model.pauses === 0,
      JSON.stringify(model)
    );
  }

  // ---- the forced Green binding when nothing opens the settings -------------------------
  {
    // Every key defaults to something other than config_menu except Green,
    // which this unbinds. The welcome toast (2 s) is shortened by the timer scale.
    const { win, press, warns, panel, toasts } = boot(
      { shortcut_key_green: 'none' },
      'WEB_PAGE_TYPE_BROWSE',
      { timers: { scale: 10, from: 1000 } }
    );
    t(
      'no key bound to config_menu: a warning says Green is forced',
      warns.some((w) => w.indexOf('No menu keybind found') !== -1),
      warns.join(' | ')
    );
    // The debounced config write (200 ms).
    await waitFor(() => storedConfig(win).shortcut_key_green === 'config_menu');
    const stored = storedConfig(win);
    t(
      'the bundle writes config_menu back to shortcut_key_green',
      stored.shortcut_key_green === 'config_menu',
      String(stored.shortcut_key_green)
    );
    // The welcome toast comes 2 s after the start (200 ms here), on its own timer.
    await waitFor(() => toasts().some((m) => m === 'Press [GREEN] to open the settings'));
    t(
      'the welcome toast names Green as the menu key',
      toasts().some((m) => m === 'Press [GREEN] to open the settings'),
      toasts().join(' | ')
    );
    press(KEYS.GREEN);
    t('and Green opens the settings', !!panel() && panel().style.display === 'block');
  }
  {
    const { win, press, warns, panel, toasts } = boot(
      { shortcut_key_green: 'none', shortcut_key_7: 'config_menu' },
      'WEB_PAGE_TYPE_BROWSE',
      { timers: { scale: 10, from: 1000 } }
    );
    await wait(250);
    const stored = storedConfig(win);
    t(
      'with another key bound to config_menu Green is left unbound',
      !warns.some((w) => w.indexOf('No menu keybind found') !== -1) &&
        stored.shortcut_key_green === 'none',
      String(stored.shortcut_key_green)
    );
    await waitFor(() => toasts().some((m) => m === 'Press [7] to open the settings'));
    t(
      'the welcome toast names that key',
      toasts().some((m) => m === 'Press [7] to open the settings'),
      toasts().join(' | ')
    );
    const green = press(KEYS.GREEN);
    t('an unbound Green does nothing', !panel() && !green.defaultPrevented);
    press(DIGIT(7));
    t('and the bound digit opens the settings', !!panel() && panel().style.display === 'block');

    // A checkbox of the panel is no text box: the menu digit closes the panel from it.
    const box = panel().querySelector('#ytaf-page-main input[type="checkbox"]');
    box.focus();
    // The panel ignores toggles for 500 ms after its first build, unscaled here.
    await waitFor(() => win.ytaf_panelTakesToggles(), 10000);
    press(DIGIT(7), box);
    t(
      'the menu digit closes the panel with the focus on a checkbox',
      panel().style.display === 'none'
    );

    // The digit unbound from the panel: closing it gives the menu back to Green.
    await wait(120);
    press(DIGIT(7));
    t('setup: open again', panel().style.display === 'block');
    win.document.querySelectorAll('.ytaf-tab-btn')[2].click();
    const row = Array.from(win.document.querySelectorAll('.ytaf-cycle-row')).find(
      (r) => r.querySelector('.ytaf-cycle-label').textContent.trim() === 'Key 7'
    );
    row.focus();
    for (let i = 0; i < 40 && row.querySelector('.ytaf-value').textContent !== 'None'; i++) {
      press(KEYS.RIGHT, row);
    }
    t('setup: Key 7 set to None', row.querySelector('.ytaf-value').textContent === 'None');
    const before = toasts().length;
    press(KEYS.BACK);
    t('setup: Back closes the panel', panel().style.display === 'none');
    await wait(20);
    t(
      'no key opens the settings any more: closing the panel binds Green again, and says so',
      toasts()
        .slice(before)
        .some((m) => m === 'Press [GREEN] to open the settings'),
      toasts().join(' | ')
    );
    await wait(120);
    press(KEYS.GREEN);
    t('and Green opens the settings', panel().style.display === 'block');
  }

  report.finish();
})();
