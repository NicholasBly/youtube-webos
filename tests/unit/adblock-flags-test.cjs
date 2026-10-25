/**
 * adblock/flags.js as a unit: the switches the hooks read, recomputed from
 * the config on every change. Ad Blocking gates its dependent filters, the
 * emoji fix holds on webOS 3 and 4 only, the three summary switches follow,
 * and a flags listener runs once everything is recomputed.
 *
 * Run: node tests/unit/adblock-flags-test.cjs
 */
'use strict';

const path = require('path');
const { createReport } = require('../harness/report.cjs');
const { SRC } = require('../harness/stubs.cjs');
const { loadSources } = require('../harness/sandbox.cjs');

const report = createReport();
const t = report.check;
const eq = report.eq;

const ADBLOCK = path.join(SRC, 'features', 'adblock');

/** The module over a live config object, every switch off, on the given webOS version. */
function load(webOSVersion) {
  const cfg = {};
  const listeners = {};
  const { sandbox, get } = loadSources(
    [path.join(ADBLOCK, 'constants.js'), path.join(ADBLOCK, 'flags.js')],
    {
      // core/config hands out its live object; the module binds to it once.
      configGetAll: () => cfg,
      configAddChangeListener: (key, cb) => {
        (listeners[key] = listeners[key] || []).push(cb);
      },
      getWebOSVersion: () => webOSVersion
    }
  );
  const flags = get('cfgFlags');
  const state = get('filterState');
  return {
    sandbox,
    get,
    flags,
    state,
    noEmoji: get('cfgFlagsNoEmoji'),
    keys: get('CONFIG_KEYS'),
    listeners,
    // What core/config does on a setting change.
    set(key, value) {
      cfg[key] = value;
      for (const cb of listeners[key] || []) cb({ detail: { newValue: value } });
    }
  };
}

// ---- the switches off, and every setting watched ----
{
  const m = load(5);
  t(
    'with every setting off, every flag and summary switch is off',
    Object.keys(m.flags).every((k) => m.flags[k] === false) &&
      !m.state.anyFilterEnabled &&
      !m.state.anyContentFilter &&
      !m.state.anyContentFilterButEmoji
  );
  const unwatched = Object.keys(m.keys).filter((k) => !m.listeners[m.keys[k]]);
  t('each adblock setting has a listener', unwatched.length === 0, unwatched.join(','));
}

// ---- a flags listener sees the finished state ----
{
  const m = load(5);
  const seen = [];
  m.sandbox.onFlagsChange(() => {
    seen.push({
      adBlock: m.flags.enableAdBlock,
      any: m.state.anyFilterEnabled,
      content: m.state.anyContentFilter
    });
  });
  m.set('enableAdBlock', true);
  eq('the listener runs once per change', seen.length, 1);
  t(
    'and sees every switch recomputed, anyFilterEnabled included',
    seen[0].adBlock === true && seen[0].any === true && seen[0].content === true,
    JSON.stringify(seen[0])
  );
  m.set('enableAdBlock', false);
  t(
    'switched off, the listener sees the summary off as well',
    seen[1].adBlock === false && seen[1].any === false,
    JSON.stringify(seen[1])
  );
}

// ---- Ad Blocking gates its dependents ----
{
  const m = load(5);
  const dependents = [
    ['enableTrackingBlock', 'enableTrackingBlock'],
    ['removeGlobalShorts', 'removeGlobalShorts'],
    ['removeLiveVideos', 'removeLiveVideos'],
    ['removeTopLiveGames', 'removeTopLiveGames'],
    ['removeMostRelevant', 'removeMostRelevant'],
    ['hideGuestSignInPrompts', 'hideGuestSignInPrompts']
  ];
  for (const [setting] of dependents) m.set(setting, true);
  t(
    'without Ad Blocking its dependent filters stay off',
    dependents.every(([, flag]) => m.flags[flag] === false) && !m.state.anyFilterEnabled
  );
  m.set('enableAdBlock', true);
  t(
    'with it, they follow their own settings',
    dependents.every(([, flag]) => m.flags[flag] === true)
  );
  m.set('removeLiveVideos', false);
  eq('and one turned off is off', m.flags.removeLiveVideos, false);
}

// ---- the independent switches ----
{
  const m = load(5);
  m.set('hideEndcards', true);
  t(
    'end cards alone are a content filter',
    m.flags.hideEndcards && m.state.anyContentFilter && m.state.anyFilterEnabled
  );
  m.set('hideEndcards', false);
  m.set('upgradeThumbnails', true);
  t(
    'thumbnails alone turn the hook on without a content filter',
    m.flags.upgradeThumbnails && m.state.anyFilterEnabled && !m.state.anyContentFilter
  );
}

// ---- the emoji fix, webOS 3 and 4 only ----
{
  const m = load(5);
  m.set('enableLegacyEmojiFix', true);
  t(
    'on webOS 5 the emoji setting changes nothing',
    m.flags.enableLegacyEmojiFix === false && !m.state.anyFilterEnabled
  );
}
{
  const m = load(4);
  m.set('enableLegacyEmojiFix', true);
  t(
    'on webOS 4 it is a content filter, left out of the summary without it',
    m.flags.enableLegacyEmojiFix === true &&
      m.state.anyContentFilter &&
      !m.state.anyContentFilterButEmoji &&
      m.state.anyFilterEnabled
  );
  m.set('enableAdBlock', true);
  t(
    'cfgFlagsNoEmoji is cfgFlags with the emoji fix off',
    m.noEmoji.enableAdBlock === true &&
      m.noEmoji.enableLegacyEmojiFix === false &&
      Object.keys(m.flags).every((k) => k === 'enableLegacyEmojiFix' || m.noEmoji[k] === m.flags[k])
  );
}

report.finish();
