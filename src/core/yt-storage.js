// The records the leanback app keeps in localStorage (JSON, usually
// { data, creation, expiration }), read and written in one place: a record
// that is missing, malformed or behind a storage error reads as null, and a
// write that storage refuses is reported, never thrown. What goes in a
// record, and for how long, stays with each module.

/** The parsed record under `key`, or null when there is none or it is not a JSON object. */
export function readRecord(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return record && typeof record === 'object' ? record : null;
  } catch {
    return null;
  }
}

/** Stores `record` as JSON under `key`; false when storage refused it. */
export function writeRecord(key, record) {
  try {
    window.localStorage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Removes the record under `key`, if storage allows. */
export function removeRecord(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // No storage: nothing was there to remove.
  }
}
