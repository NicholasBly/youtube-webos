/**
 * YouTube wordmark selection (Interface -> YouTube Logo).
 *
 * YouTube ships two wordmarks and picks between them by account status:
 *
 *   premium  .../livingroom/premium/wordmark_truncated/fullcolor_white_57_2x_v2.png
 *   default  .../livingroom/youtube/wordmark/fullcolor_white_57_2x_v2.png
 *
 * Default leaves the header as YouTube draws it. Premium and Hidden are a
 * class on <html> that logo-style.css keys its rules on, never writes to the
 * element: YouTube builds the header again after the profile picker and when
 * the app comes back from the background, and a new header takes the rules as
 * it is drawn, where styles written on the old element were lost with it
 * (issue #214). The rules are !important, which outranks the inline left,
 * width and background-image YouTube draws the logo with.
 */
import { configRead, configAddChangeListener } from '../core/config.js';
import './logo-style.css';

// The class on <html> for each style that changes the header; Default has none.
const STYLE_CLASSES = {
  premium: 'ytaf-premium-logo',
  hidden: 'ytaf-hide-logo'
};

/** Sets the class of the configured style on <html>, and takes the others off. */
function applyLogoStyle() {
  const style = configRead('logoStyle');
  const classes = document.documentElement.classList;
  Object.keys(STYLE_CLASSES).forEach((key) => {
    classes.toggle(STYLE_CLASSES[key], style === key);
  });
}

/** Applies the YouTube Logo setting, and follows it. */
export function initLogoStyle() {
  applyLogoStyle();
  configAddChangeListener('logoStyle', applyLogoStyle);
}
