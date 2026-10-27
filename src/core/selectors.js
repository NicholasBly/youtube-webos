// Class names, ids and tag names YouTube's leanback app puts on the page.
// Everything that has to recognise a page, the player or a control goes through
// this one table, so a YouTube markup change is fixed here and nowhere else.
// Six-letter tokens are YouTube's obfuscated class names and change the most;
// the comment says what each was observed to be. The app's own ids and classes
// (ytaf-*, ryd-*) stay with the feature that creates them,
// and Return YouTube Dislike keeps its panel-internal selectors in its own table.
//
// Read an entry as SELECTORS.NAME, pass it on, iterate it or put it in a
// template string, but do not call a method on it directly
// (SELECTORS.NAME.map(...), SELECTORS.NAME.toUpperCase()): the minifier then
// keeps the whole table in the bundle instead of inlining the entries used.
export const SELECTORS = {
  // Pages, as body classes
  WATCH_PAGE_CLASS: 'WEB_PAGE_TYPE_WATCH',
  SHORTS_PAGE_CLASS: 'WEB_PAGE_TYPE_SHORTS',
  SEARCH_PAGE_CLASS: 'WEB_PAGE_TYPE_SEARCH',
  ACCOUNT_SELECTOR: 'WEB_PAGE_TYPE_ACCOUNT_SELECTOR',

  // The app and the player
  APP_ROOT: 'ytlr-app',
  PLAYER_ID: 'ytlr-player__player-container-player',
  PLAYER_CONTAINER: 'ytlr-player__player-container',
  // The watch page's player shell; the clock hides while it holds focus.
  WATCH_PLAYER: 'ytlr-watch-default',
  // Older player root, tried when PLAYER_ID is not on the page.
  HTML5_PLAYER_FALLBACK: '.html5-video-player',
  LOGO: 'ytlr-logo-entity',
  THUMBNAIL_TILE: 'ytlr-thumbnail-details',
  // A tile of a shelf or grid, and the title text inside one (DeArrow).
  TILE: 'ytlr-tile-renderer',
  TILE_METADATA: 'ytlr-tile-metadata-renderer',
  TILE_TITLE: 'ytlr-tile-metadata-renderer yt-formatted-string',
  // Everything that can carry a thumbnail image; thumbnail-quality rescans these.
  THUMBNAIL_NODES: 'ytlr-thumbnail-details, ytlr-surface-page, thumbnail image',
  // The elements whose text can hold emoji, as localName values (emoji-font).
  TEXT_HOST_TAGS: ['yt-formatted-string', 'yt-core-attributed-string'],

  // Transport controls and the progress bar
  CONTROLS: 'yt-focus-container[idomkey="controls"]',
  // On whichever element holds focus.
  FOCUS_CLASS: 'zylon-focus',
  // On elements the app hides without unmounting them (the progress bar during playback).
  HIDDEN_CLASS: 'zylon-hidden',
  // The controls holding the focus, as seen on the webOS 25 first-play path only.
  CONTROLS_FOCUSED_CLASS_WEBOS25: 'MFDzfe--focused',
  PROGRESS_BAR_RENDERER: 'ytlr-multi-markers-player-bar-renderer',
  PROGRESS_BAR: 'ytlr-progress-bar',
  // The track inside the renderer; chapter markers are its children.
  PROGRESS_BAR_TRACK: 'ytlr-multi-markers-player-bar-renderer [idomkey="progress-bar"]',
  // The chapter markers inside the track carry idomkey="chapter-<n>".
  CHAPTER_MARKER_PREFIX: 'chapter-',
  // The pieces of the bar SponsorBlock can anchor its overlay to, and two
  // older slider shells tried last.
  PROGRESS_BAR_SEGMENT: '[idomkey="segment"]',
  PROGRESS_BAR_SLIDER: '[idomkey="slider"]',
  PROGRESS_BAR_SLIDER_BASE: '.ytLrProgressBarSliderBase',
  PROGRESS_BAR_LEGACY_SLIDER: '.afTAdb',
  // The video title in the watch metadata and in the title tray, and the
  // duration span under the seek bar; the SponsorBlock labels hang off them.
  TITLE_TEXT: 'ytlr-watch-metadata [idomkey="title-text"]',
  TITLE_TEXT_TRAY: 'ytlr-video-title-tray [idomkey="title-text"]',
  DURATION_LABEL: '[idomkey="time-label"] [idomkey="duration"]',
  CAPTIONS_BUTTON: 'ytlr-captions-button yt-button-container',
  CAPTIONS_BUTTON_LEGACY: 'ytlr-captions-button ytlr-button',

  // Panels beside the player
  // The animated overlay the side panels slide in on, and the classes YouTube
  // puts on it while a panel closes (comments-fix overrides their CSS).
  ANIMATED_OVERLAY: 'ytlr-animated-overlay',
  PANEL_CLOSING_CLASSES: ['frHKed', 'xmQAdc'],
  // The side overlay that hosts the description, comments and save dialogs
  // (also a literal in ui/styles/global.css).
  OVERLAY_PANEL: '.AmQJbe',
  // The two shells an engagement panel comes in (comments/description vs title-header).
  ENGAGEMENT_PANEL_LIST: 'ytlr-engagement-panel-section-list-renderer',
  ENGAGEMENT_PANELS:
    'ytlr-engagement-panel-section-list-renderer, ytlr-engagement-panel-title-header-renderer',
  VIRTUAL_LIST: 'yt-virtual-list',

  // Buttons under the video, candidates in the order they are tried
  BUTTON_CONTAINER: 'yt-button-container',
  BUTTON_SHELLS: 'yt-button-container, ytlr-button',
  COMMENTS_BUTTONS: [
    'yt-button-container[aria-label="Comments"]',
    'yt-icon.qHxFAf.ieYpu.nGYLgf',
    'yt-icon.qHxFAf.ieYpu.wFZPnb',
    'ytlr-button-renderer[idomkey="item-1"] ytlr-button',
    '[idomkey="TRANSPORT_CONTROLS_BUTTON_TYPE_COMMENTS"] ytlr-button',
    'ytlr-redux-connect-ytlr-like-button-renderer + ytlr-button-renderer ytlr-button',
    'ytlr-button-renderer[idomkey="1"] yt-button-container'
  ],
  SAVE_BUTTONS: ['yt-button-container[aria-label="Save"]', 'yt-icon.p9sZp'],
  // The text element of the "Description" button, and the button through it.
  DESCRIPTION_LABEL: 'yt-formatted-string.XGffTd.OqGroe',
  DESCRIPTION_BUTTON_FALLBACK: 'ytlr-button-renderer yt-formatted-string.XGffTd.OqGroe',
  LIVE_CHAT_BUTTON:
    'ytlr-live-chat-toggle-button yt-button-container, yt-button-container[aria-label="Live chat"]'
};
