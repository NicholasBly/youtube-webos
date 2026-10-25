// The webOS 22+ build's emoji-wrap.js (webpack.config.js): the legacy emoji
// fix is off on every engine that runs this build, so nothing here is reached
// with work to do.

/** Nothing to wrap. */
export function wrapEmojiInTree() {}

/** No emoji work on this build. */
export function mayNeedEmojiWork() {
  return false;
}
