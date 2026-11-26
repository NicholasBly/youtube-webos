// Keeps YouTube's controls bar, the player shadows and the clock out of sight
// for a moment: a pause (ui/shortcuts/playback.js) and the webOS 25 kick
// (features/video-quality/kickstart.js) both raise the bar.
//
// The bar, the named shadows and the clock go through a class on <body> whose
// rules end in a class (global.css, watch.css): a toggle restyles only the
// elements with those classes, and an element YouTube builds during the
// window is covered too. The shadow drawn as a bare [idomkey='shadow'] goes
// through an inline style instead: a rule ending in that attribute made each
// toggle restyle every element carrying an idomkey, most of the app. Any
// element with that idomkey, as 0.8.4 matched, not only a div.
const HIDE_CLASS = 'ytaf-hide-controls';
const BARE_SHADOW = "[idomkey='shadow']";

// While hidden: each bare shadow with the opacity it had inline, as triples.
let saved = null;
let timer = null;

/** Lifts the hiding now; a no-op when nothing is hidden. */
export function showControls() {
  if (!saved) return;
  clearTimeout(timer);
  timer = null;
  document.body.classList.remove(HIDE_CLASS);
  for (let i = 0; i < saved.length; i += 3) {
    const style = saved[i].style;
    if (saved[i + 1]) style.setProperty('opacity', saved[i + 1], saved[i + 2]);
    else style.removeProperty('opacity');
  }
  saved = null;
}

/** Hides them for `ms` (a second call extends the window); returns showControls. */
export function hideControlsFor(ms) {
  if (!saved) {
    saved = [];
    document.body.classList.add(HIDE_CLASS);
    const shadows = document.querySelectorAll(BARE_SHADOW);
    for (let i = 0; i < shadows.length; i++) {
      const style = shadows[i].style;
      saved.push(
        shadows[i],
        style.getPropertyValue('opacity'),
        style.getPropertyPriority('opacity')
      );
      style.setProperty('opacity', '0', 'important');
    }
  }
  clearTimeout(timer);
  timer = setTimeout(showControls, ms);
  return showControls;
}
