// What the force-codec modules share: the pinned modes and the mutable state
// on `fc`: the active mode, whether the hooks are in, the saved
// originals and the per-video fallback flag.

/** Config values that pin to one codec, as opposed to 'auto' / 'no_av1'. */
export const PINNED_MODES = ['av1', 'vp9', 'avc', 'hevc'];

export const fc = {
  mode: 'auto',

  // Hooks are installed at most once and left in place, gated internally on
  // `mode`: restoring a native would throw away whatever another module wrapped
  // on top of it. Cost when idle is one call and one string compare.
  installed: false,

  origIsTypeSupported: null,
  origCanPlayType: null,

  /**
   * Set when the current player response carries no rendition in the wanted
   * codec. While set, the capability answers go back to the truth so a player
   * that re-probes is not left with nothing to choose from.
   */
  unsatisfiable: false
};
