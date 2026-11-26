// The player response: ad placements, attestation, heartbeat params, endcards.
import { log } from './log.js';

/** Empties `obj[key]` in place when it is a non-empty array; 1 when it did, else 0. */
function clearArrayIfExists(obj, key) {
  if (obj[key]?.length) {
    obj[key].length = 0;
    return 1;
  }
  return 0;
}

/** Deletes the end screen (the cards over a video's last seconds) from a player response. */
export function removeEndcards(data) {
  let cleared = 0;
  if (data.endscreen) {
    delete data.endscreen;
    cleared++;
  }
  if (data.playerResponse && data.playerResponse.endscreen) {
    delete data.playerResponse.endscreen;
    cleared++;
  }
  if (cleared > 0) log.debug('Cleaned Player Endcards');
}

/**
 * Empties the ad placements, player ads and ad slots of a player response and drops the attestation
 * and ad-break heartbeat parameters.
 */
export function removePlayerAds(data) {
  let cleared = 0;
  cleared += clearArrayIfExists(data, 'adPlacements');
  cleared += clearArrayIfExists(data, 'playerAds');
  cleared += clearArrayIfExists(data, 'adSlots');

  // Strip attestation and telemetry mismatches
  if (data.attestation) {
    delete data.attestation;
    cleared++;
    log.debug('Cleaned Player Attestation Challenge');
  }
  if (data.adBreakHeartbeatParams) {
    delete data.adBreakHeartbeatParams;
    cleared++;
    log.debug('Cleaned Ad Break Heartbeat');
  }
  if (data.playerResponse) {
    cleared += clearArrayIfExists(data.playerResponse, 'adPlacements');
    cleared += clearArrayIfExists(data.playerResponse, 'playerAds');
    cleared += clearArrayIfExists(data.playerResponse, 'adSlots');
  }
  if (cleared > 0) log.debug('Cleaned Player Ads/Placements');
}
