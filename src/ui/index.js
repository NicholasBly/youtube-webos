// The settings UI and remote shortcuts: the panel (panel/), the shortcut
// router (shortcuts/), the <html> classes behind the themes (styles/), the
// toasts (toast/). This file keeps the settings reachable and greets the user;
// the features themselves start in userScript.js.
import { showNotification } from './toast/index.js';
import { ensureMenuKey } from './shortcuts/bindings.js';
import './shortcuts/router.js';
import { initHtmlClasses } from './styles/html-classes.js';
import './styles/yt-fixes.css';

// The settings must stay reachable: with no key bound to the menu, Green is.
// The welcome toast below names the key either way.
const menuKey = ensureMenuKey(false).key;

initHtmlClasses();

setTimeout(() => showNotification(`Press [${menuKey.toUpperCase()}] to open the settings`), 2000);
