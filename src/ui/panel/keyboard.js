// Keyboard navigation inside the options panel: the arrows move focus between
// the tab buttons and the controls of the open page by where they sit on
// screen, Enter clicks, Back and Escape close. The handler reads the live panel
// state through `ctx`.
//
// While the panel is open it listens on the document in the capture phase,
// behind the shortcut router, and swallows every key that reaches it: nothing
// gets to YouTube, so a stray Down cannot scroll the page behind the panel,
// and a key pressed with focus in the SponsorBlock segment popup (a Magic
// Remote click puts it there) is the panel's too. The router has already
// taken the bound shortcuts, among them the menu key that closes the panel.
// Left and Right on a focused cycle row are left alone here, so the row's own
// bubble-phase handler (panel/controls/cycle-row.js) steps the value.
import { REMOTE_KEYS, SYNTHETIC_KEY_FLAG } from '../../core/remote.js';

/**
 * Swallows the key that closed the panel until it is released: a held Back
 * repeats, and the repeats would otherwise reach YouTube (a page back) once
 * the panel's handler is gone.
 */
function swallowUntilReleased(keyCode) {
  /** Eats the held key's repeats. */
  const onDown = (evt) => {
    // One this mod sends is meant for YouTube (SYNTHETIC_KEY_FLAG).
    if (evt.keyCode !== keyCode || evt[SYNTHETIC_KEY_FLAG]) return;
    evt.preventDefault();
    evt.stopPropagation();
  };
  /** Stops swallowing: both listeners and the 2 s safety timer go. */
  const release = () => {
    document.removeEventListener('keydown', onDown, true);
    document.removeEventListener('keyup', onUp, true);
    clearTimeout(timer);
  };
  /** The key was released: stop swallowing it. */
  const onUp = (evt) => {
    if (evt.keyCode === keyCode) release();
  };
  // A keyup the TV never delivers must not hold the key for good.
  const timer = setTimeout(release, 2000);
  document.addEventListener('keydown', onDown, true);
  document.addEventListener('keyup', onUp, true);
}

const ARROW_KEY_CODE = {
  [REMOTE_KEYS.LEFT.code]: 'left',
  [REMOTE_KEYS.UP.code]: 'up',
  [REMOTE_KEYS.RIGHT.code]: 'right',
  [REMOTE_KEYS.DOWN.code]: 'down'
};

// How long after Enter is released the pointer click of the same press may
// still arrive, and how long a held Enter (with its keyup lost) keeps
// dropping pointer clicks.
const CLICK_AFTER_ENTER_MS = 400;
const ENTER_HELD_MAX_MS = 2000;

const PAGE_FOCUSABLES = 'input:not([disabled]), .ytaf-cycle-row, button:not([disabled])';

/** The controls of `page` that can take focus, in document order. */
export function pageFocusables(page) {
  const out = [];
  if (!page) return out;
  const nodes = page.querySelectorAll(PAGE_FOCUSABLES);
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].tabIndex !== -1) out.push(nodes[i]);
  }
  return out;
}

/**
 * The box a move measures: a checkbox's whole label row, not the small box at
 * its left, which would overlap nothing above or below it.
 */
function boxOf(el) {
  const label = el.tagName === 'INPUT' ? el.closest('label') : null;
  return (label || el).getBoundingClientRect();
}

/**
 * The candidate nearest to `from` in `dir`, judged by the centres of their
 * boxes (boxOf). Left and Right stay within the row: only candidates that
 * overlap `from` vertically count. Up and Down prefer a candidate that
 * overlaps `from` horizontally but take the nearest one otherwise. Among
 * those, the one closest ahead wins, then the one closest sideways. Returns
 * null when nothing lies that way.
 */
function nearestInDirection(from, dir, candidates) {
  const a = boxOf(from);
  const ax = (a.left + a.right) / 2;
  const ay = (a.top + a.bottom) / 2;
  const vertical = dir === 'up' || dir === 'down';
  let best = null;
  let bestOverlap = false;
  let bestAhead = Infinity;
  let bestAside = Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (el === from) continue;
    const b = boxOf(el);
    if (b.width === 0 && b.height === 0) continue;
    const bx = (b.left + b.right) / 2;
    const by = (b.top + b.bottom) / 2;

    let ahead;
    if (dir === 'up') ahead = ay - by;
    else if (dir === 'down') ahead = by - ay;
    else if (dir === 'left') ahead = ax - bx;
    else ahead = bx - ax;
    if (ahead <= 0) continue;

    const aside = vertical ? Math.abs(bx - ax) : Math.abs(by - ay);
    const overlap = vertical
      ? b.right > a.left && b.left < a.right
      : b.bottom > a.top && b.top < a.bottom;
    if (!vertical && !overlap) continue;

    let better;
    if (overlap !== bestOverlap) better = overlap;
    else if (ahead !== bestAhead) better = ahead < bestAhead;
    else better = aside < bestAside;
    if (better) {
      best = el;
      bestOverlap = overlap;
      bestAhead = ahead;
      bestAside = aside;
    }
  }
  return best;
}

/**
 * @param {HTMLElement} elContainer the panel element
 * @param {object} ctx  `tabBtns` (the tab buttons), `activePage` (live index),
 *   `pages()` (the four page elements, unbuilt ones undefined), `close()`
 * @returns {{ attach(): void, detach(): void }} the key handler, to be put on
 *   the document while the panel is open
 */
export function createPanelKeyboard(elContainer, ctx) {
  // Chrome 38 to 59 have no :focus-within, so the label row of the focused
  // control carries a class instead (panel.css).
  const markLabel = (evt, on) => {
    const label = evt.target.closest ? evt.target.closest('label') : null;
    if (label) label.classList.toggle('ytaf-focused', on);
  };
  elContainer.addEventListener('focusin', (evt) => markLabel(evt, true));
  elContainer.addEventListener('focusout', (evt) => markLabel(evt, false));

  // The tab buttons and the controls of the open page, in document order.
  const focusables = () => ctx.tabBtns.concat(pageFocusables(ctx.pages()[ctx.activePage]));

  /** Moves the focus to the nearest focusable control in direction `dir`. */
  const moveFocus = (dir) => {
    const target = nearestInDirection(document.activeElement, dir, focusables());
    if (target) target.focus();
  };

  /** Left and Right: within the row, and around the ends of the tab bar. */
  const moveHorizontal = (dir, preFocus) => {
    moveFocus(dir);
    // The tab bar wraps around.
    if (preFocus === document.activeElement && preFocus.classList.contains('ytaf-tab-btn')) {
      const idx = ctx.tabBtns.indexOf(preFocus);
      if (dir === 'right' && idx === ctx.tabBtns.length - 1) ctx.tabBtns[0].focus();
      else if (dir === 'left' && idx === 0) ctx.tabBtns[ctx.tabBtns.length - 1].focus();
    }
  };

  /** Up and Down: between the open tab and its page, wrapping at both ends. */
  const moveVertical = (dir, preFocus) => {
    moveFocus(dir);
    const postFocus = document.activeElement;

    // Up out of a page lands on the open tab, not on whichever tab button
    // happens to be nearest.
    if (
      dir === 'up' &&
      preFocus !== postFocus &&
      preFocus.closest('.ytaf-settings-page') &&
      postFocus.classList.contains('ytaf-tab-btn')
    ) {
      ctx.tabBtns[ctx.activePage].focus();
    }

    // Nothing further that way: wrap from the last control to the open tab
    // and from the tab to the last control.
    if (preFocus === postFocus) {
      const activeTabBtn = ctx.tabBtns[ctx.activePage];
      const list = [activeTabBtn].concat(pageFocusables(ctx.pages()[ctx.activePage]));
      if (dir === 'up') list[list.length - 1].focus();
      else list[0].focus();
    }
  };

  let attached = false;

  // OK on a Magic Remote whose pointer is showing (and a left click in the
  // webOS simulator) sends Enter when pressed and a pointer click when
  // released. Clicking the focused control on the Enter as well toggled a
  // checkbox, or stepped a row, twice per press. So while the pointer is in
  // use Enter leaves the click to the pointer, which also lands on what the
  // pointer is over; with the 5-way keys Enter clicks the focused control,
  // and a pointer click that still follows that press is dropped.
  // The pointer counts as in use from a mouse move until webOS hides it
  // (cursorStateChange) or an arrow key is pressed, which hides it too.
  let pointerActive = false;
  /** The pointer moved: OK presses are the pointer's from now on. */
  const onPointerMove = () => {
    pointerActive = true;
  };
  /** webOS showed or hid the pointer (it hides it after a while, or on an arrow key). */
  const onCursorState = (evt) => {
    pointerActive = !!(evt.detail && evt.detail.visibility);
  };
  let ownClick = false;
  let enterHeldSince = 0;
  let dropClicksUntil = 0;
  /** Drops a pointer click that comes with the Enter press that already clicked. */
  const onClick = (evt) => {
    if (ownClick) return;
    const now = Date.now();
    const held = enterHeldSince > 0 && now - enterHeldSince < ENTER_HELD_MAX_MS;
    if (!held && now >= dropClicksUntil) return;
    evt.preventDefault();
    evt.stopPropagation();
  };
  /** Enter released: a click it brings can still follow, briefly. */
  const onKeyUp = (evt) => {
    if (evt.keyCode !== REMOTE_KEYS.ENTER.code || !enterHeldSince) return;
    enterHeldSince = 0;
    dropClicksUntil = Date.now() + CLICK_AFTER_ENTER_MS;
  };
  /** Clicks the focused control, as the Enter key; the click this sends is let through. */
  const clickFocused = () => {
    enterHeldSince = Date.now();
    ownClick = true;
    document.activeElement.click();
    ownClick = false;
  };

  /**
   * The panel's keys while it is open: arrows move the focus (Left/Right on a cycle row are the
   * row's), Enter clicks, Back or Escape closes. Every key is kept from YouTube.
   */
  const onKeyDown = (evt) => {
    // A key this mod sends (the Shorts keep-alive, the webOS 25 kick) is meant
    // for YouTube, not for the panel.
    if (evt[SYNTHETIC_KEY_FLAG]) return;
    if (evt.keyCode in ARROW_KEY_CODE) {
      pointerActive = false;
      const dir = ARROW_KEY_CODE[evt.keyCode];
      const preFocus = document.activeElement;
      if (dir === 'left' || dir === 'right') {
        // A cycle row uses Left and Right for its value.
        if (preFocus.classList.contains('ytaf-cycle-row')) return;
        moveHorizontal(dir, preFocus);
      } else {
        moveVertical(dir, preFocus);
      }
    } else if (evt.keyCode === REMOTE_KEYS.ENTER.code) {
      // A held key's repeats click nothing more; with the pointer in use the
      // pointer's own click follows.
      if (!evt.repeat && !pointerActive) clickFocused();
    } else if (evt.keyCode === REMOTE_KEYS.BACK.code || evt.keyCode === 27) {
      // Back on the remote, Escape on a keyboard.
      ctx.close();
    }
    evt.preventDefault();
    evt.stopPropagation();
    // Back or Escape closed the panel: the key is kept from YouTube until released.
    if (!attached) swallowUntilReleased(evt.keyCode);
  };

  return {
    /** Starts handling keys (the panel opened). */
    attach() {
      attached = true;
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('mousemove', onPointerMove, true);
      document.addEventListener('cursorStateChange', onCursorState, true);
    },
    /** Stops handling keys (the panel closed). */
    detach() {
      attached = false;
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('mousemove', onPointerMove, true);
      document.removeEventListener('cursorStateChange', onCursorState, true);
      enterHeldSince = 0;
      dropClicksUntil = 0;
    }
  };
}
