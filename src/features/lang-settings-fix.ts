// Adapted from https://github.com/reisxd/TizenTube/blob/522f83cc012d5b1c75181b651e084a3afa280323/mods/resolveCommand.js

import { ResolveCommandRegistry, type ResolveCommandHook } from '../hooks/resolve-command.ts';
import { createLogger } from '../core/log.js';

const log = createLogger('LangSettingsFix');

/** YouTube's PREF cookie as URLSearchParams (empty when there is none). */
function getPrefsCookie() {
  const PREFIX = 'PREF=';

  let str = document.cookie.split('; ').find((x) => x.startsWith(PREFIX));
  if (!str) return new URLSearchParams();

  str = str.slice(PREFIX.length);
  return new URLSearchParams(str);
}

// Called only for a command that has the key (hooks/resolve-command.ts).
const hook: ResolveCommandHook = function (resolveCommand, payload, extra) {
  const setClientSettingEndpoint = payload.setClientSettingEndpoint as Record<string, unknown>;
  if (!setClientSettingEndpoint || !Array.isArray(setClientSettingEndpoint.settingDatas)) {
    return resolveCommand(payload, extra);
  }

  const idx = setClientSettingEndpoint.settingDatas.findIndex(
    (setting) => setting.clientSettingEnum?.item === 'I18N_LANGUAGE'
  );

  if (idx === -1) return resolveCommand(payload, extra);

  const setting = setClientSettingEndpoint.settingDatas[idx];

  const lang = setting.stringValue;
  // No value to write: the command goes on as sent, with its other settings.
  if (typeof lang !== 'string' || !lang) return resolveCommand(payload, extra);
  const date = new Date();
  date.setFullYear(date.getFullYear() + 10);

  const prefs = getPrefsCookie();
  prefs.set('hl', lang);
  document.cookie = `PREF=${prefs.toString()}; Domain=.youtube.com; expires=${date.toUTCString()};`;

  resolveCommand({
    signalAction: {
      signal: 'RELOAD_PAGE'
    }
  });

  return true;
};

ResolveCommandRegistry.getInstance()
  .then((registry) => registry.setHook('setClientSettingEndpoint', hook))
  .catch((e) => {
    log.warn('hook not installed:', e);
  });
