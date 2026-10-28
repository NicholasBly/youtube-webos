// A Set rather than an own-property check: Object.hasOwn needs Chrome 93,
// and both builds target older engines (legacy Chrome 38, modern Chrome 87).
const LOCKUP_VIDEO_TYPES = new Set([
  'LOCKUP_CONTENT_TYPE_VIDEO',
  'LOCKUP_CONTENT_TYPE_MUSIC',
  'LOCKUP_CONTENT_TYPE_SHORT'
]);
const NON_VIDEO_TILE_RE = /PLAYLIST|MIX|CHANNEL/;

function commandVideoId(command) {
  if (!command) return null;
  const watch = command.watchEndpoint && command.watchEndpoint.videoId;
  const reel = command.reelWatchEndpoint && command.reelWatchEndpoint.videoId;
  const id = watch || reel;
  return typeof id === 'string' ? id : null;
}

function idFromTile(data) {
  if (!data || (typeof data.contentType === 'string' && NON_VIDEO_TILE_RE.test(data.contentType))) return null;
  return commandVideoId(data.onSelectCommand);
}

function idFromLockup(data) {
  if (!data || !LOCKUP_VIDEO_TYPES.has(data.contentType)) return null;
  const contentId = data.contentId;
  if (typeof contentId !== 'string') return null;
  const context = data.rendererContext;
  const command = context && context.commandContext && context.commandContext.onTap &&
    context.commandContext.onTap.innertubeCommand;
  const commandId = commandVideoId(command);
  return commandId && commandId !== contentId ? null : contentId;
}

/** Accepts the inner renderer payload used by DOM cards or a JSON response item. */
export function extractAiVideoId(data) {
  if (!data) return null;
  if (data.lockupViewModel) return idFromLockup(data.lockupViewModel);
  if (data.tileRenderer) return idFromTile(data.tileRenderer);
  if (data.contentType && LOCKUP_VIDEO_TYPES.has(data.contentType)) return idFromLockup(data);
  if (data.contentType || data.onSelectCommand) return idFromTile(data);
  return null;
}
