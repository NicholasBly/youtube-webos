// Toast notifications in the top right corner. The container is created on
// the first showNotification(); the theme and OLED looks come from the <html>
// classes (ui/styles/html-classes.js); the config is read for Disable
// Notifications only.
import './toast.css';
import { configRead } from '../../core/config.js';
import { createElement } from '../dom.js';

let container = null;

/** The toast container, created on first use. */
function ensureContainer() {
  if (container) return container;
  container = createElement('div', { class: 'ytaf-toasts' });
  document.body.appendChild(container);
  return container;
}

// Live toasts by text, so a repeated message extends its toast instead of
// stacking a duplicate.
const liveToasts = new Map();
// The toast holding each slot: a message that changes in place (the play/pause
// state, the running seek total) keeps one toast rather than a trail of them.
const slotToasts = new Map();

class Toast {
  /**
   * Shows a toast with `text`: added hidden and faded in two frames later, removed after `time` ms
   * (0: stays until removed).
   */
  constructor(text, time) {
    this.text = text;
    // The slot it holds (showNotification), if any.
    this.slot = null;
    this.timer = null;
    this.fading = false;
    this.inner = createElement('div', { class: 'ytaf-toast ytaf-toast-hidden', text });
    ensureContainer().appendChild(this.inner);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this.inner.classList.remove('ytaf-toast-hidden'))
    );
    this.arm(time);
    liveToasts.set(text, this);
  }

  /**
   * Still on screen and not fading out. A flag rather than the hidden class:
   * a new toast carries the class for its first two frames, and a repeat of
   * its text in that window must extend it, not stack a twin.
   */
  isLive() {
    return this.inner.isConnected && !this.fading;
  }

  /** Restarts the removal timer (`time` 0: none). */
  arm(time) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = time > 0 ? setTimeout(() => this.remove(), time) : null;
  }

  /** Drops this toast from the by-text map, if it is still the one there. */
  unkey() {
    if (liveToasts.get(this.text) === this) liveToasts.delete(this.text);
  }

  /** New text, or the same text with a fresh timer; false once the toast is fading out. */
  update(text, time = 3000) {
    if (this.fading) return false;
    if (this.text === text) {
      if (time > 0) this.arm(time);
      return true;
    }
    this.unkey();
    this.text = text;
    this.inner.textContent = text;
    this.inner.classList.remove('ytaf-toast-hidden');
    liveToasts.set(text, this);
    this.arm(time);
    return true;
  }

  /** Fades the toast out and removes it a second later; frees its slot and its text. */
  remove() {
    if (this.slot && slotToasts.get(this.slot) === this) slotToasts.delete(this.slot);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.fading = true;
    this.inner.classList.add('ytaf-toast-hidden');
    this.unkey();
    setTimeout(() => this.inner.remove(), 1000);
  }
}

// What a caller gets with the toasts switched off: they only ever remove one.
const NOOP_HANDLE = { remove: () => {} };

/**
 * Shows `text` for `time` ms (0 keeps it up); returns a handle with
 * remove(). With a `slot`, the toast that holds it takes the new text,
 * unless it is already fading out.
 */
export function showNotification(text, time = 3000, slot) {
  if (configRead('disableNotifications')) return NOOP_HANDLE;
  if (slot) {
    const holder = slotToasts.get(slot);
    if (holder && holder.isLive() && holder.update(text, time)) return holder;
  }
  let toast = liveToasts.get(text);
  if (toast && toast.isLive()) {
    if (time > 0) toast.update(text, time);
  } else {
    toast = new Toast(text, time);
  }
  if (slot) {
    toast.slot = slot;
    slotToasts.set(slot, toast);
  }
  return toast;
}
