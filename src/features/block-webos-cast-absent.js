// The legacy build's block-webos-cast.ts (webpack.config.js): webOS 25 runs
// the webOS 22+ build, so the legacy one never has a cast wake-up to block.

/** Nothing to install on webOS 3 to 6. */
export function initBlockWebOSCast() {}
