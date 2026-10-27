// Everything the video-quality modules share: the constants, the player handle
// and the per-session flags. Scalars live on `vq` so every module reads and
// writes the same value; the Set is exported directly.
import { isWebOS25 } from '../../core/webos.js';
import { isQualityCappedBySpeed } from '../../core/speed-cap.js';

// Every label the player reports once it has negotiated a quality, from
// 'highres' down to 'tiny'. "Known" means the player has settled, not that the
// top rung is in use: API-level forcing only runs while it is still 'unknown',
// and the localStorage key is what actually asks for 4320p.
export const KNOWN_QUALITIES = new Set([
  'highres',
  'hd2160',
  'hd1440',
  'hd1080',
  'hd720',
  'large',
  'medium',
  'small',
  'tiny'
]);

export const IS_WEBOS_25 = isWebOS25();
export const QUALITY_KEY = 'yt-player-quality';
export const ONE_YEAR_MS = 31536000000; // 365 * 24 * 60 * 60 * 1000
// The app reads an expired preference as none: ours is written again, dated
// from now, once it is this close to its expiration (30 days).
export const RENEW_BEFORE_MS = 2592000000;
// The webOS 25 first-playback kick: how often it presses, and how many times.
export const KICKSTART_INTERVAL_MS = 500;
export const KICKSTART_MAX_ATTEMPTS = 10;

export const vq = {
  shouldForce: false,

  player: null,
  lastVideoId: null,
  // From init to destroy: the player listener and the poll for the player.
  bag: null,
  poll: null,
  navTimer: null,
  // Bumped by every destroy, so a kick loop from the previous attach stops.
  kickstartRun: 0,
  lastWriteTime: 0,
  videoBeingProcessed: null,
  kickstartInProgress: false,

  // webOS 25 first video fix; persists for the session, destroy leaves it alone
  hasKickstarted: false
};

export const qualitySetForVideo = new Set();

// How often the quality was forced through the player API rather than by the
// stored preference: `apiUpgrades` the setPlaybackQualityRange calls, of
// which `intercepts` paused a playing video for it. Read on the TV from the
// web inspector as window.__ytafQualityStats: whether this path ever runs
// there decides whether it stays.
export const qualityStats = { apiUpgrades: 0, intercepts: 0 };

/**
 * Whether quality is forced now: Force Max Quality is on, the player is not an inline preview, and
 * the playback speed does not hold the video at 1080p (core/speed-cap.js).
 */
export function isForceEnabled() {
  return (
    vq.shouldForce && (!vq.player?.isInline || !vq.player.isInline()) && !isQualityCappedBySpeed()
  );
}
