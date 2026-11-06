// Black boxes behind text. When YouTube's server sends the TV
// force_memory_saving_mode, YouTube puts `app-quality-root` on <body>, and its
// own stylesheet then swaps the soft text shadows for solid black boxes behind
// the player's title, channel line and timestamps. The flag is pushed from the
// server, so it can appear months after install and survives a reinstall.
//
// Taking the class off <body> brings back the normal styling. Only the CSS
// changes: the rest of YouTube's memory saving is decided in its own code and
// stays as it is. YouTube rewrites body.className on navigation, so an
// observer on <body>'s class attribute takes it off again each time.
import { configRead, configAddChangeListener } from '../core/config.js';
import { pollUntil } from '../core/dom.js';
import { createLogger } from '../core/log.js';

const log = createLogger('AppQuality');

const QUALITY_CLASS = 'app-quality-root';
const CONFIG_KEY = 'removeLowMemoryStyle';

let observer = null;
// Whether YouTube had the class when this took it off, so turning the setting
// off can put it back.
let stripped = false;

/** Takes the class off <body> if YouTube has put it there. */
function strip() {
  const body = document.body;
  if (!body || !body.classList.contains(QUALITY_CLASS)) return;
  body.classList.remove(QUALITY_CLASS);
  if (!stripped) log.info('Removed', QUALITY_CLASS, 'from <body>');
  stripped = true;
}

/** Starts stripping the class and watching <body> for it; false while there is no <body> yet. */
function start() {
  if (!document.body) return false;
  if (observer) return true;
  strip();
  observer = new MutationObserver(strip);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return true;
}

/** Stops watching and gives YouTube its class back if it had it. */
function stop() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (stripped && document.body) document.body.classList.add(QUALITY_CLASS);
  stripped = false;
}

/** Follows the setting: on starts the watch (waiting for <body> if needed), off stops it. */
function sync() {
  if (!configRead(CONFIG_KEY)) {
    stop();
    return;
  }
  if (!start()) pollUntil(() => !configRead(CONFIG_KEY) || start(), 100, { maxAttempts: 300 });
}

sync();
configAddChangeListener(CONFIG_KEY, sync);
