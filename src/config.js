const CONFIG_KEY = 'ytaf-configuration';

export const segmentTypes = {
  sponsor: {
    color: '#00d400',
    opacity: '0.7',
    name: 'sponsored'
  },
  intro: {
    color: '#00ffff',
    opacity: '0.7',
    name: 'intro'
  },
  outro: {
    color: '#0202ed',
    opacity: '0.7',
    name: 'outro'
  },
  interaction: {
    color: '#cc00ff',
    opacity: '0.7',
    name: 'interaction reminder'
  },
  selfpromo: {
    color: '#ffff00',
    opacity: '0.7',
    name: 'self-promotion'
  },
  musicofftopic: {
    color: '#ff9900',
    opacity: '0.7',
    name: 'non-music part'
  },
  preview: {
    color: '#008fd6',
    opacity: '0.7',
    name: 'recap or preview'
  },
  poi_highlight: {
    color: '#ff1684',
    opacity: '0.8',
    name: 'poi_highlight'
  },
  filler: {
    color: '#7300ff',
    opacity: '0.7',
    name: 'tangents/jokes'
  },
  hook: {
    color: '#395699',
    opacity: '0.7',
    name: 'hook/greetings'
  }
};

export const shortcutActions = {
  none: 'None',
  refresh_page: 'Refresh Page',
  chapter_skip: 'Skip to Next Chapter',
  chapter_skip_prev: 'Skip to Previous Chapter',
  sb_skip_prev: 'Skip to Last SponsorBlock Segment',
  seek_15_fwd: 'Fast Forward (Burst)',
  seek_15_back: 'Rewind (Burst)',
  play_pause: 'Play/Pause',
  toggle_subs: 'Toggle Subtitles',
  toggle_comments: 'Toggle Comments',
  toggle_description: 'Toggle Description',
  save_to_playlist: 'Save / Watch Later',
  oled_toggle: 'Toggle OLED Care Mode',
  sb_manual_skip: 'Manual Skip / Jump to Highlight',
  config_menu: 'Open/Close Settings'
};

export const sbModes = {
  auto_skip: 'Auto Skip',
  manual_skip: 'Manual Skip',
  seek_bar: 'Show in Seek Bar',
  disable: 'Disable'
};

export const sbModesHighlight = {
  auto_skip: 'Auto Skip to Start',
  ask: 'Ask when video loads',
  seek_bar: 'Show in Seek Bar',
  disable: 'Disable'
};

const configOptions = new Map([
  ['uiTheme', { default: 'blue-force-field', desc: 'UI Theme' }],
  ['enableAdBlock', { default: true, desc: 'Ad Blocking' }],
  ['enableReturnYouTubeDislike', { default: true, desc: 'Return YouTube Dislike' }],
  ['upgradeThumbnails', { default: false, desc: 'Max Thumbnail Quality' }],
  [
    'removeGlobalShorts', 
    { default: false, desc: 'Remove Shorts (Global)' }
  ],
  [
    'removeTopLiveGames', 
    { default: false, desc: 'Remove Top Live Games' }
  ],
  ['enableSponsorBlock', { default: true, desc: 'SponsorBlock' }],
  ['enableMutedSegments', { default: false, desc: 'Allow segments that mute audio' }],
  ['skipSegmentsOnce', { default: false, desc: 'Skip Segments Once' }],
  
  ['sbMode_sponsor', { default: 'auto_skip', desc: 'Sponsor' }],
  ['sbMode_intro', { default: 'auto_skip', desc: 'Intermission/Intro' }],
  ['sbMode_outro', { default: 'auto_skip', desc: 'Endcards/Credits' }],
  ['sbMode_interaction', { default: 'auto_skip', desc: 'Interaction Reminder' }],
  ['sbMode_selfpromo', { default: 'auto_skip', desc: 'Self Promotion' }],
  ['sbMode_musicofftopic', { default: 'auto_skip', desc: 'Non-Music Section' }],
  ['sbMode_preview', { default: 'seek_bar', desc: 'Preview/Recap' }],
  ['sbMode_filler', { default: 'seek_bar', desc: 'Filler/Tangents' }],
  ['sbMode_hook', { default: 'seek_bar', desc: 'Hook/Greetings' }],
  ['sbMode_highlight', { default: 'seek_bar', desc: 'Highlight' }],

  [
  'hideEndcards',
  {
    default: false,
    desc: 'Hide Endcards'
  }
  ],
  [
  'enableAutoLogin',
  {
    default: true,
    desc: 'Auto Login'
  }
  ],
  [
    'hideLogo',
    {
      default: false,
      desc: 'Hide YouTube Logo'
    }
  ],
    [
    'showWatch',
    {
      default: false,
      desc: 'Display Time in UI'
    }
  ],
  ['enableOledCareMode', { default: false, desc: 'OLED-Care Mode (True Black UI)' }],
  ['videoShelfOpacity', { default: 100, desc: 'Video shelf opacity' }],
  ['fixMultilineTitles', { default: true, desc: 'Fix Multiline Titles' }],
  ['enableLegacyEmojiFix', { default: true, desc: 'Emoji + Characters Fix' }],
  ['hideGuestSignInPrompts', { default: false, desc: 'Guest Mode: Hide Sign-in Buttons' }],
  ['forceHighResVideo', { default: false, desc: 'Force Max Quality' }],
  ['disableNotifications', { default: false, desc: 'Disable Notifications' }]
]);

// Register shortcut keys 0-9
for (let i = 0; i < 10; i++) {
  configOptions.set(`shortcut_key_${i}`, {
    default: i === 5 ? 'chapter_skip' : 'none',
    desc: `Key ${i} Action`
  });
}

// Register shortcut keys Red, Green, Blue
['red', 'green', 'blue'].forEach(color => {
    let def = 'none';
    if (color === 'red') def = 'oled_toggle';
    if (color === 'green') def = 'config_menu';
    if (color === 'blue') def = 'sb_manual_skip';

    configOptions.set(`shortcut_key_${color}`, {
        default: def,
        desc: `${color.charAt(0).toUpperCase() + color.slice(1)} Button Action`
    });
});

for (const [key, value] of Object.entries(segmentTypes)) {
  configOptions.set(`${key}Color`, {
    default: value.color,
    desc: `Color for ${value.name}`
  });
}

// Build defaultConfig once.
const defaultConfig = {};
for (const [k, v] of configOptions) {
  defaultConfig[k] = v.default;
}

// Use a pure JS Map for listeners instead of DOM Fragments.
// Key -> Set<Callback>
const changeListeners = new Map();

function loadStoredConfig() {
  const storage = window.localStorage.getItem(CONFIG_KEY);

  if (storage === null) {
    console.info('Config not set; using defaults.');
    return null;
  }

  try {
    return JSON.parse(storage);
  } catch (err) {
    console.warn('Error parsing stored config:', err);
    return null;
  }
}

// Merge defaults with storage immediately.
// This ensures localConfig is always complete, removing need for checks in configRead.
let localConfig = Object.assign({}, defaultConfig, loadStoredConfig() || {});

function configExists(key) {
  return configOptions.has(key);
}

export function configGetDesc(key) {
  if (!configExists(key)) {
    throw new Error('tried to get desc for unknown config key: ' + key);
  }

  return configOptions.get(key).desc;
}

export function configRead(key) {
  if (!configExists(key)) {
    throw new Error('tried to read unknown config key: ' + key);
  }
  
  return localConfig[key];
}

export function configWrite(key, value) {
  if (!configExists(key)) {
    throw new Error('tried to write unknown config key: ' + key);
  }

  const oldValue = localConfig[key];

  if (oldValue === value) {
    return; 
  }

  console.info('Changing key', key, 'from', oldValue, 'to', value);
  localConfig[key] = value;
  
  window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);

  const listeners = changeListeners.get(key);
  if (listeners) {
    const syntheticEvent = {
        detail: { key, newValue: value, oldValue }
    };
    for (const callback of listeners) {
        callback(syntheticEvent);
    }
  }
}

/**
 * Add a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Object) => void} callback Function to be called on change
 */
export function configAddChangeListener(key, callback) {
  if (!configExists(key)) return;

  if (!changeListeners.has(key)) {
      changeListeners.set(key, new Set());
  }
  changeListeners.get(key).add(callback);
}

export function configRemoveChangeListener(key, callback) {
  if (changeListeners.has(key)) {
    changeListeners.get(key).delete(callback);
  }
}

export function configGetDefault(key) {
  if (!configExists(key)) {
    throw new Error('tried to get default for unknown config key: ' + key);
  }
  return configOptions.get(key).default;
}