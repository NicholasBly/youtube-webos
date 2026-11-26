// The platform: which webOS version this is (from the user agent, cached),
// whether it is the simulator, and the engine features the modules branch on.
// Read by the features that differ between webOS 3 and 4, webOS 5 and 6, and
// webOS 22 onward.
import { createLogger } from './log.js';

const log = createLogger('WebOS');

// AbortController is Chrome 66: webOS 3 and 4 (Chromium 38 and 53) have none, and
// fetch-timeout.js races the request against its deadline instead.
export const HAS_ABORT_CONTROLLER = typeof AbortController !== 'undefined';

export let simulatorMode = false;
let cachedWebOSVersion = undefined;

// From 2022 the version is the two-digit year; before that the platform
// years map to the versions below.
const WEBOS_YEAR_MAP = {
  2016: 3,
  2017: 3,
  2018: 4,
  2019: 4,
  2020: 5,
  2021: 6
};

/**
 * The TV's webOS version from the user agent: the platform year, else the firmware (webOS 25), else
 * the Chromium version (the simulators); 6 when nothing matches. Cached.
 */
export function getWebOSVersion() {
  if (cachedWebOSVersion !== undefined) {
    return cachedWebOSVersion;
  }

  const ua = window.navigator.userAgent;

  // 1. Check Platform Year
  const platformMatch = ua.match(/webOS\.TV-(\d{4})/);
  if (platformMatch) {
    const year = parseInt(platformMatch[1], 10);
    const version = year >= 2022 ? year - 2000 : WEBOS_YEAR_MAP[year];
    if (version) {
      cachedWebOSVersion = version;
      log.info(`Detected webOS ${cachedWebOSVersion} via platform year: ${year}`);
      return cachedWebOSVersion;
    }
  }

  // 2. Check Firmware Version (Fallback for webOS 25+)
  const firmwareMatch = ua.match(/_TV_O18\/(\d+\.\d+\.\d+)/);
  if (firmwareMatch) {
    const majorVersion = parseInt(firmwareMatch[1].split('.')[0], 10);
    if (majorVersion >= 33) {
      cachedWebOSVersion = 25;
      log.info(`Detected webOS 25 via firmware version: ${firmwareMatch[1]}`);
      return cachedWebOSVersion;
    }
  }

  // 3. Fallback: Chrome version detection (for simulator environments)
  const chromeMatch = ua.match(/Chrome\/(\d+)/);
  if (chromeMatch) {
    const chromeVersion = parseInt(chromeMatch[1], 10);
    log.info(`Detected Chrome version: ${chromeVersion} (simulator mode)`);
    simulatorMode = true;

    if (chromeVersion >= 120) {
      cachedWebOSVersion = 25;
    } else if (chromeVersion >= 87) {
      // webOS 22 to 24 (Chrome 87, 94, 108): every check here asks for <= 4,
      // <= 6 or >= 25, which 22 answers right for all three.
      cachedWebOSVersion = 22;
    } else if (chromeVersion <= 53) {
      // webOS 4
      cachedWebOSVersion = 4;
    } else {
      cachedWebOSVersion = 6;
    }
    return cachedWebOSVersion;
  }

  log.warn('Could not detect webOS version from user agent. Defaulting to 6.');
  return (cachedWebOSVersion = 6);
}

/** Whether the TV runs webOS 25 or later. */
export function isWebOS25() {
  return getWebOSVersion() >= 25;
}

/** Whether the TV runs webOS 6 or older (the legacy build's platforms). */
export function isLegacyWebOS() {
  return getWebOSVersion() <= 6;
}
