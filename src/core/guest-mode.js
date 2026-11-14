// Whether the app is signed in as a guest, read from the leanback app's own
// localStorage entries and cached until something invalidates it. Read here
// rather than through core/yt-storage.js readRecord, which cannot tell a
// missing entry from a corrupt one: a corrupt identity entry must not fall
// through to the autoplay entry.

let cachedGuestMode = null;

/** Forgets the cached answer of isGuestMode(), for after the account changes. */
export function invalidateGuestModeCache() {
  cachedGuestMode = null;
}

/**
 * Whether YouTube is signed in as a guest, from the identity YouTube stores in localStorage (cached
 * until invalidated).
 */
export function isGuestMode() {
  if (cachedGuestMode !== null) return cachedGuestMode;

  try {
    const lastIdentity = window.localStorage.getItem('yt.leanback.default::last-identity-used');
    if (lastIdentity) {
      const parsed = JSON.parse(lastIdentity);
      if (parsed?.data?.identityType === 'UNAUTHENTICATED_IDENTITY_TYPE_GUEST') {
        return (cachedGuestMode = true);
      }
      return (cachedGuestMode = false);
    }

    const autoNav = window.localStorage.getItem('yt.leanback.default::AUTONAV_FOR_LIVING_ROOM');
    if (autoNav) {
      const parsed = JSON.parse(autoNav);
      if (parsed?.data?.guest === true) {
        return (cachedGuestMode = true);
      }
    }

    return (cachedGuestMode = false);
  } catch {
    return (cachedGuestMode = false);
  }
}
