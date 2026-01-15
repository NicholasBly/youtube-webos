/* src/config.js */
const CONFIG_KEY = 'ytaf-configuration';

export const segmentTypes = {
  sponsor: {
    color: '#00d400',
    opacity: '0.7',
    name: 'sponsored segment'
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
  chapter_skip: 'Skip to Next Chapter',
  chapter_skip_prev: 'Skip to Previous Chapter',
  seek_15_fwd: 'Fast Forward 15s',
  seek_15_back: 'Rewind 15s',
  play_pause: 'Play/Pause',
  toggle_subs: 'Toggle Subtitles',
  toggle_comments: 'Toggle Comments/Desc'
};

const configOptions = new Map([
  ['uiTheme', { default: 'blue-force-field', desc: 'UI Theme' }],
  ['enableAdBlock', { default: true, desc: 'Ad Blocking' }],
  ['enableReturnYouTubeDislike', { default: true, desc: 'Return YouTube Dislike' }],
  ['upgradeThumbnails', { default: false, desc: 'Upgrade Thumbnail Quality' }],
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
  [
    'enableSponsorBlockSponsor',
    { default: true, desc: 'Skip sponsor segments' }
  ],
  ['enableSponsorBlockIntro', { default: true, desc: 'Skip intro segments' }],
  ['enableSponsorBlockOutro', { default: true, desc: 'Skip outro segments' }],
  [
    'enableSponsorBlockInteraction',
    {
      default: true,
      desc: 'Skip interaction reminder segments'
    }
  ],
  [
    'enableSponsorBlockSelfPromo',
    {
      default: true,
      desc: 'Skip self promotion segments'
    }
  ],
  [
    'enableSponsorBlockMusicOfftopic',
    {
      default: true,
      desc: 'Skip non-music segments in music videos'
    }
  ],
  [
  'hideEndcards',
  {
    default: false,
    desc: 'Hide Endcards'
  }
  ],
  [
    'enableSponsorBlockHighlight',
    {
      default: true,
      desc: 'Show highlight segments'
    }
  ],
  [
    'enableSponsorBlockFiller',
    {
      default: false,
      desc: 'Skip tangents/jokes'
    }
  ],
  [
    'enableSponsorBlockHook',
    {
      default: false,
      desc: 'Skip hook/greetings'
    }
  ],
  [
    'enableHighlightJump',
    {
      default: true,
      desc: 'Jump to highlight with blue button'
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
    'enableSponsorBlockPreview',
    {
      default: false,
      desc: 'Skip recaps and previews'
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

for (const [key, value] of Object.entries(segmentTypes)) {
  configOptions.set(`${key}Color`, {
    default: value.color,
    desc: `Color for ${value.name}`
  });
}

const defaultConfig = (() => {
  let ret = {};
  for (const [k, v] of configOptions) {
    ret[k] = v.default;
  }
  return ret;
})();

/** @type {Record<string, DocumentFragment>} as const */
const configFrags = (() => {
  let ret = {};
  for (const k of configOptions.keys()) {
    ret[k] = new DocumentFragment();
  }
  return ret;
})();

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

// Use defaultConfig as a prototype so writes to localConfig don't change it.
let localConfig = loadStoredConfig() || { ...defaultConfig };

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

  if (localConfig[key] === undefined) {
    console.warn(
      'Populating key',
      key,
      'with default value',
      defaultConfig[key]
    );

    localConfig[key] = defaultConfig[key];
  }

  return localConfig[key];
}

export function configWrite(key, value) {
  if (!configExists(key)) {
    throw new Error('tried to write unknown config key: ' + key);
  }

  const oldValue =
    localConfig[key] !== undefined ? localConfig[key] : defaultConfig[key];

  console.info('Changing key', key, 'from', oldValue, 'to', value);
  localConfig[key] = value;
  window.localStorage[CONFIG_KEY] = JSON.stringify(localConfig);

  configFrags[key].dispatchEvent(
    new CustomEvent('ytafConfigChange', {
      detail: { key, newValue: value, oldValue }
    })
  );
}

/**
 * Add a listener for changes in the value of a specified config option
 * @param {string} key Config option to monitor
 * @param {(evt: Event) => void} callback Function to be called on change
 */
export function configAddChangeListener(key, callback) {
  const frag = configFrags[key];

  frag.addEventListener('ytafConfigChange', callback);
}
export function configRemoveChangeListener(key, callback) {
  if (configFrags[key]) {
    const frag = configFrags[key];
    frag.removeEventListener('ytafConfigChange', callback);
  }
}

export function configGetDefault(key) {
  if (!configExists(key)) {
    throw new Error('tried to get default for unknown config key: ' + key);
  }
  return configOptions.get(key).default;
}