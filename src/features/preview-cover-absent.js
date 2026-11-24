// The legacy build's preview-cover.js (webpack.config.js): the fix is for
// webOS 22 and newer, where the black tile previews were reported, so webOS 3
// to 6 have neither the listeners nor the switch.

/** Whether the TV offers Fix Black Tile Previews: never in this build. */
export const previewCoverAvailable = false;
