import { configRead } from './config.js';

// Notification container is created lazily on first showNotification() call.
// Theme/OLED setters are no-ops until then; ui.js wires them on config changes.
let notificationContainer = null;

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function ensureContainer() {
  if (notificationContainer) return notificationContainer;
  notificationContainer = makeEl('div', 'ytaf-notification-container');
  if (configRead('enableOledCareMode')) notificationContainer.classList.add('oled-care');
  if (configRead('uiTheme') === 'classic-red') notificationContainer.classList.add('theme-classic-red');
  document.body.appendChild(notificationContainer);
  return notificationContainer;
}

const NOOP_HANDLE = { remove: () => {}, update: () => {} };

// Live messages, keyed by text. Replaces an
// Array.from(querySelectorAll('.message')).find(...) scan that allocated an
// array of every on-screen message on each call.
const liveMessages = new Map();

export function showNotification(text, time = 3000) {
  if (configRead('disableNotifications')) return NOOP_HANDLE;

  const container = ensureContainer();

  // Reuse an existing visible message with the same text instead of stacking
  // duplicates — just extend its timer.
  const existing = liveMessages.get(text);
  if (existing && existing.elmInner.isConnected && !existing.elmInner.classList.contains('message-hidden')) {
    if (time > 0) existing.handle.update(text, time);
    return existing.handle;
  }

  const elmInner = makeEl('div', 'message message-hidden', text);
  const elm = makeEl('div');
  elm.appendChild(elmInner);
  container.appendChild(elm);

  requestAnimationFrame(() => requestAnimationFrame(() => elmInner.classList.remove('message-hidden')));

  const remove = () => {
    if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
    elmInner._removeTimer = null;
    elmInner.classList.add('message-hidden');
    if (liveMessages.get(elmInner.textContent)?.elmInner === elmInner) {
      liveMessages.delete(elmInner.textContent);
    }
    // Always removes the same wrapper node. The old duplicate-detection path
    // removed `existing.parentElement` while this removed `elm` — two different
    // nodes for the same conceptual "dismiss this notification".
    setTimeout(() => elm.remove(), 1000);
  };

  if (time > 0) elmInner._removeTimer = setTimeout(remove, time);

  const update = (newText, newTime = 3000) => {
    if (elmInner.textContent === newText) {
      if (newTime > 0) {
        if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
        elmInner._removeTimer = setTimeout(remove, newTime);
      }
      return;
    }
    if (liveMessages.get(elmInner.textContent)?.elmInner === elmInner) {
      liveMessages.delete(elmInner.textContent);
    }
    elmInner.textContent = newText;
    elmInner.classList.remove('message-hidden');
    if (elmInner._removeTimer) clearTimeout(elmInner._removeTimer);
    if (newTime > 0) elmInner._removeTimer = setTimeout(remove, newTime);
    liveMessages.set(newText, { elmInner, handle });
  };

  const handle = { remove, update };
  liveMessages.set(text, { elmInner, handle });
  return handle;
}

export function setNotificationOled(enabled) {
  if (!notificationContainer) return;
  notificationContainer.classList.toggle('oled-care', !!enabled);
}

export function setNotificationTheme(theme) {
  if (!notificationContainer) return;
  notificationContainer.classList.toggle('theme-classic-red', theme === 'classic-red');
}
