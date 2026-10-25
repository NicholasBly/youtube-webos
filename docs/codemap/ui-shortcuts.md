# Code map: ui/shortcuts/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [ui/shortcuts/actions.js](#mod-actions-js), [ui/shortcuts/bindings.js](#mod-bindings-js), [ui/shortcuts/helpers.js](#mod-helpers-js), [ui/shortcuts/log.js](#mod-log-js), [ui/shortcuts/oled.js](#mod-oled-js), [ui/shortcuts/page.js](#mod-page-js), [ui/shortcuts/panels.js](#mod-panels-js), [ui/shortcuts/playback.js](#mod-playback-js), [ui/shortcuts/router.js](#mod-router-js), [ui/shortcuts/seek.js](#mod-seek-js)

<a id="mod-actions-js"></a>

## ui/shortcuts/actions.js

> What each shortcut does. A `global` action runs anywhere, with nothing passed; the others run on a watch or Shorts page with a &lt;video>, which `run` receives. `burst` marks the seeks, which batch rapid presses instead of being debounced.

76 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [core/selectors.js](core.md#mod-selectors-js), [core/page-state.js](core.md#mod-page-state-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/seek.js](#mod-seek-js), [ui/shortcuts/playback.js](#mod-playback-js), [ui/shortcuts/panels.js](#mod-panels-js), [ui/shortcuts/page.js](#mod-page-js), [ui/shortcuts/oled.js](#mod-oled-js), [features/sponsorblock/bootstrap.js](features-sponsorblock.md#mod-bootstrap-js) · imported by [ui/shortcuts/router.js](#mod-router-js)

**At load:**

- **Calls:** [ui/shortcuts/seek.js › skipChapter](#fn-seek-js-skipchapter), [ui/shortcuts/seek.js › performBurstSeek](#fn-seek-js-performburstseek), [ui/shortcuts/playback.js › playPause](#fn-playback-js-playpause)

<a id="fn-actions-js-withsponsorblock"></a>
**`withSponsorBlock(fn)`** · function · L17–21

Runs `fn` with the live SponsorBlock handler, or says there is none.

- **Calls:** [features/sponsorblock/bootstrap.js › getSponsorBlock](features-sponsorblock.md#fn-bootstrap-js-getsponsorblock), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ACTIONS.sb_manual_skip.run](#fn-actions-js-actions-sb-manual-skip-run), [ACTIONS.sb_skip_prev.run](#fn-actions-js-actions-sb-skip-prev-run)

<a id="fn-actions-js-actions-config-menu-run"></a>
**`ACTIONS.config_menu.run()`** · property · L29–33

Opens or closes the options panel, ending the OLED overlay first (it would cover the panel).

- **Calls:** [ui/panel/panel.js › isOptionsPanelVisible](ui-panel.md#fn-panel-js-isoptionspanelvisible), [ui/panel/panel.js › showOptionsPanel](ui-panel.md#fn-panel-js-showoptionspanel), [ui/shortcuts/oled.js › isOledOverlayActive](#fn-oled-js-isoledoverlayactive), [ui/shortcuts/oled.js › toggleOledOverlay](#fn-oled-js-toggleoledoverlay)

<a id="fn-actions-js-actions-refresh-page-run"></a>
**`ACTIONS.refresh_page.run()`** · property · L40–43

Soft-reloads the page, except on a player page, where it only says it cannot.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage), [ui/shortcuts/page.js › refreshPage](#fn-page-js-refreshpage), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="fn-actions-js-actions-toggle-subs-run"></a>
**`ACTIONS.toggle_subs.run()`** · property · L53–57

The player lookup is here rather than in the router: only this action needs it, and the fallback is a full-document class-selector walk.

- **Calls:** [ui/shortcuts/playback.js › toggleSubtitles](#fn-playback-js-togglesubtitles)
- **Selectors:** `PLAYER_ID`, `HTML5_PLAYER_FALLBACK`
- **Browser:** `querySelector`

<a id="fn-actions-js-actions-sb-skip-prev-run"></a>
**`ACTIONS.sb_skip_prev.run()`** · property · L64–67

Jumps back to the start of the last SponsorBlock segment passed.

- **Calls:** [withSponsorBlock](#fn-actions-js-withsponsorblock), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="fn-actions-js-actions-sb-manual-skip-run"></a>
**`ACTIONS.sb_manual_skip.run()`** · property · L71–74

Skips the segment SponsorBlock is offering, or jumps to the highlight.

- **Calls:** [withSponsorBlock](#fn-actions-js-withsponsorblock), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)

<a id="mod-bindings-js"></a>

## ui/shortcuts/bindings.js

> Which remote key runs which shortcut: the configurable bindings, the colour-key lookup and the debounce state shared with the actions.

67 lines · imports [core/config.js](core.md#mod-config-js), [core/remote.js](core.md#mod-remote-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [core/config-options.js](core.md#mod-config-options-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/index.js](ui.md#mod-index-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/playback.js](#mod-playback-js), [ui/shortcuts/router.js](#mod-router-js)

**At load:**

- **Calls:** [updateShortcutCache](#fn-bindings-js-updateshortcutcache), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener)
- **Settings:** listens to `shortcut_key_*`

<a id="fn-bindings-js-updateshortcutcache"></a>
**`updateShortcutCache(key)`** · function · L22–32

Reads one binding. An action this build does not have (a binding stored by an older one) becomes None, in the cache and in the config, so the key is the app's again and the panel shows a value it knows; warned once, here.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [core/config.js › configWrite](core.md#fn-config-js-configwrite)
- **Called by:** [at load](#mod-bindings-js)
- **Settings:** uses `shortcut_key_*`

<a id="fn-bindings-js-ensuremenukey"></a>
**`ensureMenuKey(announce)`** · function, exported · L45–52

The settings must stay reachable: with no key bound to the menu, Green is bound to it again, said with `announce`. The key that opens the menu, and whether Green was just bound to it. Run at the start and whenever the panel closes (a binding changed on it may have unbound the menu).

- **Calls:** [core/config.js › configWrite](core.md#fn-config-js-configwrite), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/index.js (at load)](ui.md#mod-index-js), [ui/panel/panel.js › showOptionsPanel](ui-panel.md#fn-panel-js-showoptionspanel)
- **Settings:** writes `shortcut_key_green`

<a id="fn-bindings-js-getkeycolor"></a>
**`getKeyColor(code)`** · arrow, exported · L55–55

Colour-key code to name, alternates included, from REMOTE_KEYS in core/remote.js.

- **Called by:** [ui/shortcuts/router.js › keyNameOf](#fn-router-js-keynameof)

<a id="mod-helpers-js"></a>

## ui/shortcuts/helpers.js

> Shared by the shortcut actions: the Back press, the robust click on a YouTube button, and whether an engagement panel (comments, description) is up.

52 lines · imports [core/remote.js](core.md#mod-remote-js), [core/selectors.js](core.md#mod-selectors-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/shortcuts/panels.js](#mod-panels-js), [ui/shortcuts/playback.js](#mod-playback-js), [ui/shortcuts/seek.js](#mod-seek-js)

<a id="fn-helpers-js-simulateback"></a>
**`simulateBack()`** · arrow, exported · L9–9

Sends the remote's Back key to YouTube.

- **Calls:** [core/remote.js › sendKey](core.md#fn-remote-js-sendkey)
- **Called by:** [ui/shortcuts/panels.js › togglePanelButton](#fn-panels-js-togglepanelbutton), [ui/shortcuts/seek.js › dismissForcedUI](#fn-seek-js-dismissforcedui)

<a id="fn-helpers-js-getengagementpanel"></a>
**`getEngagementPanel()`** · arrow · L12–12

Engagement panel detection: whichever of the two shells exists.

- **Called by:** [isEngagementPanelVisible](#fn-helpers-js-isengagementpanelvisible)
- **Selectors:** `ENGAGEMENT_PANELS`
- **Browser:** `querySelector`

<a id="fn-helpers-js-isengagementpanelvisible"></a>
**`isEngagementPanelVisible()`** · arrow, exported · L15–18

Whether YouTube's engagement panel (comments, description) is on screen.

- **Calls:** [getEngagementPanel](#fn-helpers-js-getengagementpanel)
- **Called by:** [ui/shortcuts/playback.js › hideControlsAfterPause](#fn-playback-js-hidecontrolsafterpause)
- **Browser:** `getComputedStyle`

<a id="fn-helpers-js-announcepressed"></a>
**`announcePressed(button, label)`** · function, exported · L21–25

"&lt;label>: ON" or "OFF" from the button's aria-pressed, once a click on it has taken effect (250 ms).

- **Calls:** [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/shortcuts/panels.js › toggleComments](#fn-panels-js-togglecomments), [ui/shortcuts/playback.js › toggleSubtitles](#fn-playback-js-togglesubtitles)
- **Browser:** `setTimeout`

<a id="fn-helpers-js-triggerinternal"></a>
**`triggerInternal(element, name)`** · function, exported · L28–52

Clicks a YouTube button, and calls its component's onSelect() when it has one.

- **Called by:** [ui/shortcuts/panels.js › toggleComments](#fn-panels-js-togglecomments), [ui/shortcuts/panels.js › togglePanelButton](#fn-panels-js-togglepanelbutton), [ui/shortcuts/playback.js › toggleSubtitles](#fn-playback-js-togglesubtitles)

<a id="mod-log-js"></a>

## ui/shortcuts/log.js

> The logger of the shortcut modules: their messages carry [Shortcut] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [ui/shortcuts/bindings.js](#mod-bindings-js), [ui/shortcuts/helpers.js](#mod-helpers-js), [ui/shortcuts/page.js](#mod-page-js), [ui/shortcuts/panels.js](#mod-panels-js), [ui/shortcuts/playback.js](#mod-playback-js), [ui/shortcuts/seek.js](#mod-seek-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-oled-js"></a>

## ui/shortcuts/oled.js

> The OLED black overlay, with a keep-alive so the TV does not sleep under it.

37 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [core/remote.js](core.md#mod-remote-js), [ui/dom.js](ui.md#mod-dom-js) · imported by [ui/shortcuts/actions.js](#mod-actions-js)

<a id="fn-oled-js-isoledoverlayactive"></a>
**`isOledOverlayActive()`** · function, exported · L13–15

Whether the black OLED overlay is showing.

- **Called by:** [ui/shortcuts/actions.js › ACTIONS.config_menu.run](#fn-actions-js-actions-config-menu-run)

<a id="fn-oled-js-toggleoledoverlay"></a>
**`toggleOledOverlay()`** · function, exported · L18–37

The OLED black overlay with its keep-alive, toggled by the oled_toggle shortcut.

- **Calls:** [core/remote.js › sendKey](core.md#fn-remote-js-sendkey), [ui/dom.js › createElement](ui.md#fn-dom-js-createelement), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/shortcuts/actions.js › ACTIONS.config_menu.run](#fn-actions-js-actions-config-menu-run)
- **Browser:** `setInterval`, `setTimeout`

<a id="mod-page-js"></a>

## ui/shortcuts/page.js

> The page itself: a soft reload through the app's own command bus.

41 lines · imports [core/selectors.js](core.md#mod-selectors-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/shortcuts/actions.js](#mod-actions-js)

<a id="fn-page-js-refreshpage"></a>
**`refreshPage()`** · function, exported · L9–41

Asks YouTube to soft-reload the current page, with the same innertube command its own UI sends.

- **Called by:** [ui/shortcuts/actions.js › ACTIONS.refresh_page.run](#fn-actions-js-actions-refresh-page-run)
- **Events:** creates `innertube-command`
- **Selectors:** `APP_ROOT`
- **Browser:** `querySelector`

<a id="mod-panels-js"></a>

## ui/shortcuts/panels.js

> The watch-page side panels: comments (or live chat), description and the save dialog, each toggled like the remote would: Back when it is open, its button when it is not.

114 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [ui/shortcuts/helpers.js](#mod-helpers-js), [features/return-dislike/bootstrap.js](features-return-dislike.md#mod-bootstrap-js), [core/selectors.js](core.md#mod-selectors-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/shortcuts/actions.js](#mod-actions-js)

<a id="fn-panels-js-firstmatch"></a>
**`firstMatch(selectors)`** · function · L16–22

The first element a candidate selector finds, in the order given (a key press, a few lookups).

- **Called by:** [saveToPlaylist](#fn-panels-js-savetoplaylist), [toggleComments](#fn-panels-js-togglecomments)
- **Browser:** `querySelector`

<a id="fn-panels-js-ispressed"></a>
**`isPressed(button)`** · arrow · L25–28

Whether a toggle button shows as on (aria-pressed or aria-selected).

- **Called by:** [togglePanelButton](#fn-panels-js-togglepanelbutton)

<a id="fn-panels-js-togglepanelbutton"></a>
**`togglePanelButton({ button, name, isOpen = isEngagementPanelVisible, onOpened })`** · function · L35–45

Toggles a panel: Back when `isOpen()` says it is up (or its button reads pressed), else a click on `button` with `onOpened` afterwards; a toast when there is no button to click.

- **Calls:** [ui/shortcuts/helpers.js › simulateBack](#fn-helpers-js-simulateback), [ui/shortcuts/helpers.js › triggerInternal](#fn-helpers-js-triggerinternal), [isPressed](#fn-panels-js-ispressed), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [saveToPlaylist](#fn-panels-js-savetoplaylist), [toggleComments](#fn-panels-js-togglecomments), [toggleDescription](#fn-panels-js-toggledescription)

<a id="fn-panels-js-togglecomments"></a>
**`toggleComments()`** · function, exported · L51–69

Opens or closes the comments, or the live chat on a live stream; says so when neither is available.

- **Calls:** [ui/shortcuts/helpers.js › announcePressed](#fn-helpers-js-announcepressed), [ui/shortcuts/helpers.js › triggerInternal](#fn-helpers-js-triggerinternal), [firstMatch](#fn-panels-js-firstmatch), [togglePanelButton](#fn-panels-js-togglepanelbutton), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Selectors:** `COMMENTS_BUTTONS`, `BUTTON_SHELLS`, `LIVE_CHAT_BUTTON`
- **Browser:** `querySelector`

<a id="fn-panels-js-finddescriptionbutton"></a>
**`findDescriptionButton()`** · function · L72–81

The description button, by its label text, else the generic text button.

- **Called by:** [toggleDescription](#fn-panels-js-toggledescription)
- **Selectors:** `DESCRIPTION_LABEL`, `BUTTON_CONTAINER`, `DESCRIPTION_BUTTON_FALLBACK`
- **Browser:** `querySelectorAll`, `querySelector`

<a id="fn-panels-js-toggledescription"></a>
**`toggleDescription()`** · function, exported · L87–102

Opens or closes the description panel; once it is open, the dislike counter is asked to look for it.

- **Calls:** [features/return-dislike/bootstrap.js › getReturnDislike](features-return-dislike.md#fn-bootstrap-js-getreturndislike), [findDescriptionButton](#fn-panels-js-finddescriptionbutton), [togglePanelButton](#fn-panels-js-togglepanelbutton)
- **Browser:** `setTimeout`

<a id="fn-panels-js-savetoplaylist"></a>
**`saveToPlaylist()`** · function, exported · L105–114

Opens or closes the Save (Watch Later, playlists) dialog.

- **Calls:** [firstMatch](#fn-panels-js-firstmatch), [togglePanelButton](#fn-panels-js-togglepanelbutton)
- **Selectors:** `SAVE_BUTTONS`, `BUTTON_CONTAINER`, `OVERLAY_PANEL`
- **Browser:** `querySelector`

<a id="mod-playback-js"></a>

## ui/shortcuts/playback.js

> Playback: play/pause with the controls bar kept out of the way, and the subtitles toggle through the player API with a UI fallback.

100 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [core/remote.js](core.md#mod-remote-js), [core/page-state.js](core.md#mod-page-state-js), [ui/shortcuts/bindings.js](#mod-bindings-js), [ui/shortcuts/helpers.js](#mod-helpers-js), [core/selectors.js](core.md#mod-selectors-js), [ui/hide-controls.js](ui.md#mod-hide-controls-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/shortcuts/actions.js](#mod-actions-js)

<a id="fn-playback-js-togglesubtitles"></a>
**`toggleSubtitles(player)`** · function, exported · L16–60

Turns the captions on (the first track) or off through the player's API, or by pressing the captions button when the API has no answer; a toast says the result.

- **Calls:** [ui/shortcuts/helpers.js › announcePressed](#fn-helpers-js-announcepressed), [ui/shortcuts/helpers.js › triggerInternal](#fn-helpers-js-triggerinternal), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/shortcuts/actions.js › ACTIONS.toggle_subs.run](#fn-actions-js-actions-toggle-subs-run)
- **Selectors:** `CAPTIONS_BUTTON`, `CAPTIONS_BUTTON_LEGACY`
- **Browser:** `querySelector`

<a id="fn-playback-js-notifyplaypause"></a>
**`notifyPlayPause(msg)`** · function · L63–65

The play/pause toast, one at a time: a live one takes the new text.

- **Calls:** [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [playPause](#fn-playback-js-playpause)

<a id="fn-playback-js-controlsfocused"></a>
**`controlsFocused()`** · function · L68–71

Whether YouTube's controls bar holds the focus.

- **Called by:** [hideControlsAfterPause](#fn-playback-js-hidecontrolsafterpause)
- **Selectors:** `CONTROLS`, `FOCUS_CLASS`
- **Browser:** `querySelector`

<a id="fn-playback-js-hidecontrolsafterpause"></a>
**`hideControlsAfterPause()`** · function · L79–88

A pause brings the controls bar up. Unless it was up already, it is kept hidden for 750 ms with the shadows and the clock (ui/hide-controls.js) and, on the watch page with no side panel open, dismissed with a Back once it has taken the focus.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/remote.js › sendKey](core.md#fn-remote-js-sendkey), [ui/hide-controls.js › hideControlsFor](ui.md#fn-hide-controls-js-hidecontrolsfor), [ui/shortcuts/helpers.js › isEngagementPanelVisible](#fn-helpers-js-isengagementpanelvisible), [controlsFocused](#fn-playback-js-controlsfocused)
- **Called by:** [playPause](#fn-playback-js-playpause)
- **Browser:** `setTimeout`

<a id="fn-playback-js-playpause"></a>
**`playPause(video)`** · function, exported · L91–100

Plays or pauses `video`, with a toast; after a pause the player controls are hidden again.

- **Calls:** [hideControlsAfterPause](#fn-playback-js-hidecontrolsafterpause), [notifyPlayPause](#fn-playback-js-notifyplaypause)
- **Called by:** [ui/shortcuts/actions.js (at load)](#mod-actions-js)

<a id="mod-router-js"></a>

## ui/shortcuts/router.js

> The global keydown router: the remote key, the shortcut bound to it, the page it may run on (any, for a global one), the debounce, the call.

83 lines · imports [core/remote.js](core.md#mod-remote-js), [core/page-state.js](core.md#mod-page-state-js), [core/dom.js](core.md#mod-dom-js), [ui/shortcuts/bindings.js](#mod-bindings-js), [ui/panel/panel.js](ui-panel.md#mod-panel-js), [ui/shortcuts/actions.js](#mod-actions-js) · imported by [ui/index.js](ui.md#mod-index-js)

**At load:**

- **Calls:** [onKeyDown](#fn-router-js-onkeydown)
- **Events:** listens to `keydown`

<a id="fn-router-js-istextbox"></a>
**`isTextBox(el)`** · function · L11–14

Whether `el` takes typed text: a textarea, or an input other than a checkbox or a colour.

- **Called by:** [keyNameOf](#fn-router-js-keynameof)

<a id="fn-router-js-keynameof"></a>
**`keyNameOf(evt)`** · function · L17–27

The shortcut key a keydown stands for ('red', '3', ...), or null.

- **Calls:** [core/page-state.js › isSearchPage](core.md#fn-page-state-js-issearchpage), [core/remote.js › keyCodeOf](core.md#fn-remote-js-keycodeof), [ui/shortcuts/bindings.js › getKeyColor](#fn-bindings-js-getkeycolor), [isTextBox](#fn-router-js-istextbox)
- **Called by:** [onKeyDown](#fn-router-js-onkeydown)

<a id="fn-router-js-inscope"></a>
**`inScope(action)`** · function · L30–32

Whether the action may run on the current page.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [core/page-state.js › isWatchPage](core.md#fn-page-state-js-iswatchpage)
- **Called by:** [onKeyDown](#fn-router-js-onkeydown)

<a id="fn-router-js-onkeydown"></a>
**`onKeyDown(evt)`** · function · L39–81

The shortcut router (capture phase, before YouTube): runs the action bound to the key, drops a repeat of the same press, and leaves the keys to the options panel while it is open (apart from the key that closes it).

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo), [ui/panel/panel.js › isOptionsPanelVisible](ui-panel.md#fn-panel-js-isoptionspanelvisible), [inScope](#fn-router-js-inscope), [keyNameOf](#fn-router-js-keynameof)
- **Called by:** [at load](#mod-router-js)

<a id="mod-seek-js"></a>

## ui/shortcuts/seek.js

> Seeking: chapter skips read off the progress bar, and burst seeking that batches rapid presses into one jump.

178 lines · imports [ui/toast/index.js](ui-toast.md#mod-index-js), [core/remote.js](core.md#mod-remote-js), [core/page-state.js](core.md#mod-page-state-js), [core/dom.js](core.md#mod-dom-js), [ui/shortcuts/helpers.js](#mod-helpers-js), [core/selectors.js](core.md#mod-selectors-js), [ui/shortcuts/log.js](#mod-log-js) · imported by [ui/shortcuts/actions.js](#mod-actions-js)

<a id="fn-seek-js-getchapterels"></a>
**`getChapterEls()`** · function · L27–37

The chapter markers on the progress bar, empty until the player UI has drawn them; the track's other children (the playhead, the buffer) are left out.

- **Called by:** [doSkipChapter](#fn-seek-js-doskipchapter)
- **Selectors:** `PROGRESS_BAR_TRACK`, `CHAPTER_MARKER_PREFIX`
- **Browser:** `querySelector`

<a id="fn-seek-js-dismissforcedui"></a>
**`dismissForcedUI()`** · arrow · L40–40

The player UI was forced open for the markers; close it again once the seek is in.

- **Calls:** [ui/shortcuts/helpers.js › simulateBack](#fn-helpers-js-simulateback)
- **Called by:** [doSkipChapter](#fn-seek-js-doskipchapter)
- **Browser:** `setTimeout`

<a id="fn-seek-js-skipchapter"></a>
**`skipChapter(direction)`** · function, async, exported · L48–56

Skips to the next or previous chapter; one skip at a time, never on Shorts.

- **Calls:** [core/page-state.js › isShortsPage](core.md#fn-page-state-js-isshortspage), [doSkipChapter](#fn-seek-js-doskipchapter)
- **Called by:** [ui/shortcuts/actions.js (at load)](#mod-actions-js)

<a id="fn-seek-js-readchapters"></a>
**`readChapters(chapterEls)`** · function · L59–68

The chapter widths off the bar's markers, and their sum (0 when none has a width).

- **Called by:** [doSkipChapter](#fn-seek-js-doskipchapter)

<a id="fn-seek-js-pickchaptertarget"></a>
**`pickChapterTarget(chapters, duration, currentTime, direction)`** · function · L75–95

Where the skip lands, or -1: forward, the first chapter starting more than a second past the playhead; back, the start of the current chapter, or of the one before it within the first three seconds of the current one.

- **Called by:** [doSkipChapter](#fn-seek-js-doskipchapter)

<a id="fn-seek-js-doskipchapter"></a>
**`doSkipChapter(direction)`** · function, async · L101–143

Reads the chapters from the progress bar (showing the player UI first when they are not rendered), then seeks to the next or previous one.

- **Calls:** [core/dom.js › getVideo](core.md#fn-dom-js-getvideo), [core/remote.js › sendKey](core.md#fn-remote-js-sendkey), [dismissForcedUI](#fn-seek-js-dismissforcedui), [getChapterEls](#fn-seek-js-getchapterels), [pickChapterTarget](#fn-seek-js-pickchaptertarget), [readChapters](#fn-seek-js-readchapters), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [skipChapter](#fn-seek-js-skipchapter)
- **Browser:** `setTimeout`

<a id="fn-seek-js-performburstseek"></a>
**`performBurstSeek(seconds, video)`** · function, exported · L153–178

One press of a burst: the toast shows the running total at once, the video is moved by the pending part once the presses pause for 200 ms (a seek per press froze the UI), and a change of direction starts the toast's total over; the part not applied yet still counts. The reset 1.2 s later ends only the toast's total: the part not applied yet is the seek timer's, and a stalled event loop may run the two in either order.

- **Calls:** [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [ui/shortcuts/actions.js (at load)](#mod-actions-js)
- **Browser:** `setTimeout`
