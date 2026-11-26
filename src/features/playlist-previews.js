// Playlist pages play no tile preview. YouTube sends a preview command
// (startInlinePlaybackCommand) for each row of a playlist page too, Watch
// Later and every other VL... list, but the TV app does not put the player on
// the row there: the preview played full screen behind the page, heard and
// not seen while the row's time counted down, and opened the video by itself
// after 39 s (NicholasBly/youtube-webos#227, and #221's playlist report).
// Home, search and Subscriptions keep their previews. Seen and fixed on a
// webOS 25 TV by foxi69 (foxi69/youtube-webos 94efeb3), whose response shapes
// the tests use.
//
// Called by the JSON.parse hook on every response, whatever the settings: a
// few property reads, and a walk of the rows only on a playlist page. Should
// YouTube move the list, the previews come back and nothing else changes.
import { SCHEMA_REGISTRY, getByPath } from '../core/innertube.js';

const { rowsPath, continuationKey } = SCHEMA_REGISTRY.paths.PLAYLIST;

/**
 * Takes the preview command off every row of the playlist in `data`, and the
 * row's focus command with it when that was all it held. Returns how many rows
 * lost one.
 */
export function dropPlaylistRowPreviews(data) {
  const continuation = data.continuationContents;
  const list = continuation ? continuation[continuationKey] : getByPath(data, rowsPath);
  if (!list || !Array.isArray(list.contents)) return 0;
  let dropped = 0;
  const rows = list.contents;
  for (let i = 0; i < rows.length; i++) {
    const tile = rows[i] && rows[i].tileRenderer;
    const focus = tile && tile.onFocusCommand;
    if (!focus || !focus.startInlinePlaybackCommand) continue;
    delete focus.startInlinePlaybackCommand;
    if (Object.keys(focus).length === 0) delete tile.onFocusCommand;
    dropped++;
  }
  return dropped;
}
