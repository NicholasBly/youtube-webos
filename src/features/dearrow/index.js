// DeArrow (https://dearrow.ajay.app): crowdsourced titles and thumbnails in
// place of clickbait ones, on the tiles of shelves and grids. Off by default;
// its own page in the options panel.
//
// A branding lookup takes a request per video, which the JSON.parse hook
// cannot wait for, so it works in two halves:
//   1. applyDeArrow() runs in the parse hook (adblock/parse-hook.js) and
//      writes what is already decided into every tile of the response, so
//      those render right the first time; videos not seen before are queued
//      for a lookup (lookup.js).
//   2. When a lookup lands, the tiles already on screen are patched
//      (sweep.js). Tiles are rebuilt as the user moves around, so the sweep
//      also follows every parse and key press.
// What is shown follows the extension: the top title or thumbnail unless it
// is the original or voted below zero (a locked one always wins), with the
// extension's own title formatter (src/vendor/dearrow).
import { configRead, configAddChangeListener } from '../../core/config.js';
import { CACHE_LIMIT, DEARROW_CONFIG_KEYS, SWEEP_DELAY } from './constants.js';
import { videos, nextGeneration } from './state.js';
import { forgetThumbs, thumbsFull } from './thumbs.js';
import { patchResponseTiles, unpatchResponses, applyToVideo } from './tiles.js';
import { sweepTiles } from './sweep.js';
import { queueLookups, clearQueue, setChangeHandler } from './lookup.js';
import { log } from './log.js';

export { titleFormattingSupported } from './titles.js';

let sweepTimer = null;

/** Drops the sweep waiting for its moment. */
function cancelSweep() {
  clearTimeout(sweepTimer);
  sweepTimer = null;
}

/** Sweeps the rendered tiles SWEEP_DELAY from now, once however often it is asked. */
function scheduleSweep() {
  if (sweepTimer || !configRead('enableDeArrow')) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    sweepTiles(false);
  }, SWEEP_DELAY);
}

/** Puts YouTube's own titles and thumbnails back on screen; a pending sweep would undo it. */
function restoreTiles() {
  cancelSweep();
  sweepTiles(true);
}

/**
 * Forgets everything (too many videos remembered): originals back on screen
 * and in the stored responses while they are still known, then the videos,
 * the queue and the thumbnails.
 */
function wipe() {
  log.debug('Remembering', videos.size, 'videos: starting over');
  restoreTiles();
  unpatchResponses();
  nextGeneration();
  videos.clear();
  clearQueue();
  forgetThumbs();
}

/**
 * The parse hook's step (adblock/parse-hook.js) for an InnerTube response:
 * its video tiles get what is decided, new videos are queued for a lookup,
 * and the rendered tiles are swept a moment later. Player responses carry no
 * tiles and are skipped.
 */
export function applyDeArrow(data, responseType) {
  if (!data || typeof data !== 'object' || responseType === 'PLAYER') return;
  // Before any patching: a wipe in the middle of a response would free blobs
  // this same response was just given.
  if (videos.size >= CACHE_LIMIT || thumbsFull()) wipe();
  const found = patchResponseTiles(data);
  if (found.length) queueLookups(found);
  scheduleSweep();
}

/**
 * A DeArrow setting changed: everything is decided again (answers already
 * fetched are reused), newest first, since those are the videos likely on
 * screen; turned off, YouTube's own come back everywhere.
 */
function onSettingsChange() {
  nextGeneration();
  // Stored responses get the new output as they are parsed again.
  unpatchResponses();
  clearQueue();
  if (!configRead('enableDeArrow')) {
    restoreTiles();
    return;
  }
  const ids = [];
  videos.forEach((video, videoId) => {
    ids.push(videoId);
  });
  queueLookups(ids.reverse());
}

// A video decided: the tiles of the stored responses get it now, for the next
// time YouTube draws them, and the ones on screen with the sweep.
setChangeHandler((video) => {
  applyToVideo(video);
  scheduleSweep();
});
DEARROW_CONFIG_KEYS.forEach((key) => {
  configAddChangeListener(key, onSettingsChange);
});

// Moving around is what makes the app build new tiles, so a key press is the
// cheapest sign that tiles may need patching again.
document.addEventListener(
  'keydown',
  () => {
    if (videos.size) scheduleSweep();
  },
  true
);
