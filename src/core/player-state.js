// The YouTube player API's playback states, as getPlayerState() reports them
// and as the `yt-player-state-change` event (features/video-quality) carries them.
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5
};
