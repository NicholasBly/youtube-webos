/**
 * Keeps a bounded, expiring memory of confirmed AI labels; DOM checks learn
 * IDs on first encounter, and adblock.js uses this store to remove them later.
 */
const STORAGE_KEY = 'ytaf-ai-videos';
const MAX_ENTRIES = 2000;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 200;
const entries = new Map();
let loaded = false;
let writeTimer = null;

function persistSoon() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const values = [];
      entries.forEach((entry) => void values.push(entry));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch { /* Storage can be disabled or full; the in-memory index still works. */ }
  }, WRITE_DELAY_MS);
}

function load() {
  if (loaded) return;
  loaded = true;
  let values;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    values = JSON.parse(raw);
    if (!Array.isArray(values)) return;
  } catch { return; }

  const now = Date.now();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const entry = values[i];
    if (!entry || typeof entry.id !== 'string' || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) { changed = true; continue; }
    if (entries.has(entry.id)) entries.delete(entry.id);
    entries.set(entry.id, { id: entry.id, expiresAt: entry.expiresAt });
    if (entries.size > MAX_ENTRIES) { entries.delete(entries.keys().next().value); changed = true; }
  }
  if (changed) persistSoon();
}

export function isAiVideoStored(id) {
  load();
  const entry = entries.get(id);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(id);
    persistSoon();
    return false;
  }
  return true;
}

export function recordAiVideo(id) {
  if (typeof id !== 'string' || !id) return;
  load();
  if (entries.has(id)) entries.delete(id);
  entries.set(id, { id, expiresAt: Date.now() + TTL_MS });
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  persistSoon();
}

export function removeAiVideo(id) {
  load();
  if (entries.delete(id)) persistSoon();
}
