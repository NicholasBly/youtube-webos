# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.7.3] - 2026/02/27

## New Features
+ Added "Reload Page" shortcut -> performs a soft reload, the same as pressing the "Refresh" button at the bottom of the page. Only works on the home screen - https://github.com/NicholasBly/youtube-webos/issues/59

+ Added "Force Previews" -> On startup, ensures this setting is enabled/disabled to your preference. "Disabled", "Force On", and "Force Off" will be selectable options, "Disabled" by default. Will force the key to enabled/disabled on startup

+ Added "Emoji + Character Fix" option to config UI for WebOS 3 and 4. Enables emoji support and support for additional mathematical characters. Applies to video titles on the home screen, video titles during playback, description panel, comments, and full description. Zero-width space characters are also filtered out
- Processed strings are cached to eliminate pop-in effect
- Several optimizations and improvements to emoji replacement logic
- Twemoji updated to 16.0.1 from 15.1.0

## Bug Fixes
+ Fixed Arabic characters - https://github.com/NicholasBly/youtube-webos/issues/56
+ Fixed shorts shelf appearing in Subscriptions tab - https://github.com/NicholasBly/youtube-webos/issues/58
+ Fixed back button on home screen causing auto login to kick in, preventing app closure
+ Auto Login: Reset recurring actions to Date.now when disabling Auto Login (Removes 7 day login screen nag delay) - https://github.com/NicholasBly/youtube-webos/issues/57

## AdBlock

### Optimizations

Smoother UI Performance: Improved CPU/memory usage/garbage colection when targeting Shorts and Top live games shelves. We don't need to run .toLowerCase(), which can create dozens of new string objects, to identify the shelf title when we know exactly what it looks like in the JSON

Extracted array-looping logic for continuation items into a shared processActions() utility, removing duplicate logic blocks between schema matches and fallback scenarios

Faster filtering if using fallback filtering logic: Replaced multiple deep-search passes with a single sweep that can target multiple elements. The filter can now locate and remove multiple items in large data chunks much faster

### Fixes - Fallback logic
Note: The fallback option is a more expensive way to recursively filter, this kicks in if YouTube updates their JSON object paths as a way to keep functionality after an update
+ Fixed "Sign in for better recommendations" button removal on continuation paths
+ Fixed Shorts sponsored ads

## Spatial Navigation

Added spatial-navigation.modern.js
+ A version of spatial navigation for the modern build (webOS 22+ and ES6+)
+ Strips out the unnecessary polyfills
+ Webpack selects the correct spatial navigation file when building the .ipk per legacy/modern build
+ Lowered file size on modern build

### Optimizations

+ Several optimizations for spatial-navigation.modern.js (O(1))
+ Improved scrolling performance
+ Cached screen resolution and getComputedStyle for performance

## Watch.js
+ Cache dom elements for updateVisibility()

## Utils.js
+ updatePageState() - check mutation's old value before updating page state. Reduces unnecessary DOM evaluations and event dispatches on irrelevant body class changes

## [0.7.2] - 2026/02/18

## Summary
1. Emoji / Characters / Symbols support for legacy webOS versions
2. Auto login - bypass login screen when opening YouTube app via SSH/SSAP
3. Fast Forward / Rewind Shortcut improvements
4. Bug Fixes, optimizations, and other improvements

## Added

### Emoji / Characters / Symbols Fix for legacy webOS
+ Implemented emojis into YouTube app via twemoji for legacy webOS - https://github.com/NicholasBly/youtube-webos/issues/42
+ Implemented fix for mathematical symbols/characters
+ Text/emoji fixes only run on webOS 3 - 5 and is excluded from modern build
+ Removed font-fix.css and applied new rules injected via style ID legacy-webos-font-fix in emoji-font.ts

### General
+ Add vertical wrap-around navigation in config UI - https://github.com/NicholasBly/youtube-webos/discussions/50

## Fixes

### Launching App with Video - Auto Login
+ Handle sending URLs to TV via luna/ssap - https://github.com/NicholasBly/youtube-webos/issues/52
+ Bypasses login screen in guest mode and normal mode - checks whether you are in guest mode or logged in to properly select the right login screen element
+ Hides login screen until it is successfully bypassed, allowing clean load right into video

### SponsorBlock
+ Fixed SponsorBlock segments not appearing on progress bar for 5 seconds on video load if Return YouTube Dislike was disabled
+ Fixed segment sleep timer continuing if video was paused (timer now syncs with YouTube play/pause events to track time)

### General
+ Fix first config menu open key press sometimes not working on fresh app load
+ Changed "Upgrade Thumbnail Quality" to "Max Thumbnail Quality" text in config UI
+ Exclude Google Cast Block from running on webOS 25 simulator
+ Resolved "This document requires TrustedHTML assignment" error + crash

## Changes

### Shortcuts
+ Fast Forward / Rewind Burst: Only set video time after 200ms, so quick key presses don't trigger video seek events multiple times, causing lag

## Optimizations

### video-quality.js

CPU Hot Path Optimization (handleStateChange):
+ Config Caching: Replaced the expensive configRead call in every state change with a cached _shouldForce boolean that updates via listener
+ Static Constants: Moved WebOSVersion() check to a top-level constant IS_WEBOS_25 to avoid function call overhead on every check
+ Execution Guard: Added a kickstartInProgress guard to ensurePlaybackStarts to prevent multiple concurrent recursive loops/promises from spawning during rapid state changes

Memory & Allocation:
+ Object Reuse: Cached the localStorage qualityObj structure to reduce garbage collection pressure
+ Reduced Parsing: Optimized setLocalStorageQuality to avoid unnecessary JSON parsing if the cache is already valid

Algorithmic Improvements:
+ Fail-Fast Logic: Reordered checks in hot functions to exit immediately (e.g., checking isDestroyed or !_shouldForce before doing any work)
+ Event Loop Efficiency: Used requestAnimationFrame for DOM updates to align with the browser's refresh rate and prevent layout thrashing

Code Updates:
+ Combined variable declarations
+ Utilized short-circuit evaluation for logging (DEBUG && console.log) to prevent argument evaluation in production

### adblock.js
+ Small code optimizations and redundant code removal

### auto-login.js
+ O(1) Operations: Replaced multiple sequential if checks with a constant-time array iteration over predefined keys. This scales better and improves cache locality
+ Dead Code Removal: Removed the enable logic inside disableWhosWatching since it's never called
+ Performance: Replaced Date object instantiation and manipulation (which involves overhead) with direct integer arithmetic using Date.now()
+ Code Reduction: Reduced lines by ~50% while maintaining readability and original functionality
+ Consistency: Standardized variable naming and error handling

### SponsorBlock
+ After no segments are found on the server, run destroy() to clean up SponsorBlock so no observers are running unnecessarily
+ Tighten sleep timer thresholds (5s -> 3s before segment and 2s -> 1s buffer)
+ Prioritize nextSegmentIndex instead of handleTimeUpdate to check the predicted segment index first (O(1)) before binary search (O(log N))
+ Move additional config keys to the top of the file and map them along with existing CONFIG_MAPPING
+ checkForProgressBar() -> Cache successful selector for progress bar and try that first when called
+ Remove duplicated logic in play and seeked events which is already handled in executeChainSkip
+ handleTimeUpdate() additional early exit optimization

## [0.7.1] - 2026/02/04

## Summary

This release focuses heavily on **performance, stability, and responsiveness**. The core state management system has been rewritten to consolidate expensive DOM observers and functions into a centralized `PageManager`. This significantly reduces CPU usage and provides a smoother experience, especially on older TVs.

New features include smart shortcut chaining (skip 5s, 10s, 15s... smoothly without notification spam) and a new shortcut to jump to the start of the last SponsorBlock segment. The red, green, and blue buttons on the LG remote are now apart of shortcuts and can be assigned any shortcut.

## New Features

### Shortcuts

**Smart Skip Chaining**

+ Skip Forward/Backward now moves in **5-second increments*+ (previously fixed at 15s)
+ Pressing the key multiple times will "chain" the skip distance
+ The on-screen notification now updates dynamically (e.g., "Skipping +10s", "Skipping +15s") instead of spamming multiple notifications
+ Removed debounce delay for instant responsiveness

**Skip to Last SponsorBlock Segment**

+ Added new shortcut to jump immediately to the start of the previous SponsorBlock segment in the video
+ SponsorBlock segment will be temporarily whitelisted so you can watch it without the auto skip kicking in (if "Skip Segments Once" is disabled)

+ Added red, green, and blue buttons to shortcuts
+ + If open/close config shortcut is unbound and YouTube is force closed, a startup check will ensure it is bound to green on startup

### AdBlock
+ Added guest mode filtering of "Sign in for better recommendations" button on home screen

## Optimizations

### Core System (utils.js)

**Centralized State Management**

+ Implemented `PageManager`: A single system that tracks "Watch" vs "Shorts" state for the entire app
+ Replaced multiple CPU-intensive `MutationObservers` scattered across different files with a single, efficient observer
+ Added `isWatchPage()` and `isShortsPage()` exports for O(1) instant state access
+ **Impact:*+ significantly reduces CPU and memory usage

+ Predetermine sendKey support at launch via browser compatibility check and not every time during each sendKey call
+ Cached launch params to ensure JSON.parse only happens once per session
+ Early exit optimizations

### Configuration System (config.js)

**Pure JS Callback System**

+ Replaced the old DOM-based event messaging (DocumentFragment/CustomEvent) with a lightweight Map/Set callback system
+ Eliminates the memory and CPU overhead of creating ~50 DOM nodes just to handle settings
+ **I/O Debouncing:*+ Added "dirty checking" to write operations—prevents blocking I/O and expensive JSON serialization if values haven't actually changed
+ Optimized config reads to O(1) speed

### SponsorBlock

**Smart Sleep Logic**

+ Added logic to "sleep" segment checking for (x - 2) seconds until the next segment appears
+ Stops the loop from unnecessarily checking for segments every frame when none are nearby
+ Dynamic Listeners: Automatically disconnects time listeners when the last segment is passed and reconnects if you seek back
+ **Caching:*+ `checkForProgressBar` now caches the element and only re-queries the DOM if it disconnects

### UI & Shortcuts

**Lazy Loading & Caching**

+ Config UI is now lazy-loaded (only initializes when opened)
+ **Shortcut Caching:*+ `handleShortcutAction` no longer creates ~13 objects/functions per keypress
+ Refactored hot paths to use `switch` statements for maximum JavaScript engine efficiency
+ Reduced DOM Thrashing: Passed the video element from handleShortcutAction into helper functions (performBurstSeek, playPauseLogic) to avoid querying document.querySelector('video') multiple times per keypress

### AdBlock
+ Performance: Replaced O(N) string scanning in detectResponseType with O(1) object path lookups to reduce latency on large requests
+ Memory: Refactored filterItemsOptimized to use in-place array modification, significantly reducing Garbage Collection (GC) pressure
+ Optimization: Pre-compiled all registry paths into arrays to eliminate runtime string splitting and caching
+ Cleanup: Removed pathCache and legacy text-based detection patterns

## Fixes

### Screensaver

**Shorts Support**

+ Attempted fix for screensaver activating while watching Shorts (needs further testing)
+ Implemented a "keepalive" mechanism that sends a simulated Yellow Button press every 30 seconds only when video is playing/active

**Legacy Support**

+ webOS 3: Refactored sendKey command to improve simulated key presses

### Play / Pause Shortcut

+ Improved logic: Sends the "Back" key instead of multiple "Up" presses to dismiss player controls
+ Bug Fix: Automatically blurs the active element (like the play button) before dismissing UI to prevent accidental activation on webOS 3.x
+ Fixed bug where the shortcut would close the Description Panel if it was open

### General

+ **Guest Mode:*+ Updated schema paths to fix the "Hide Sign-in Button"
+ **OLED Keepalive:*+ Enhanced `sendKey` command logic (cancelable: false) to ensure keepalive signals reach the system

## Changes

### OLED-Care Mode

+ Shorts background is now set to **Pure Black**
+ Focus ring on Shorts is set to a dimmer white to reduce screen burn-in risk

### General
+ Notifications won't appear if the previous one was the same text and is already on screen (timer will just be extended)
+ Converted remaining pixel values to viewport units in ui.css
+ Play / Pause toggle updates the existing notification if still on screen

## [0.7.0] - 2026/01/27

## New Features

### SponsorBlock
New settings available per segment type
+ Segment Types: Option of Auto Skip, Manual Skip, Show in Seek Bar, and Disable (Mimicking official SponsorBlock desktop settings)
+ Manual Skip: Shows a notification at the start of and for the duration of the segment. Press the blue button to skip the segment
+ Highlight: New options "Show in Seek Bar", "Auto Skip to Start", "Ask when video loads", and "Disable"
+ Note: You will likely need to re-adjust skip settings to your preferences after updating

Added "Skip Segments Once"
+ Only skips each segment in the video once, so that you can skip back to watch it if you want to

### AdBlock
+ Filter out "Shop" button and QR Code overlay on videos

### Shortcuts
+ Added "Save/Watch Later" and "Description" shortcuts

### Video Description Panel
+ Added full navigation hack to Description panel using LG up/down arrows
+ + Note: on the stock YouTube app, this functionality is and has been broken for a long time

## Fixes

### Return Dislike
+ Update observer from zylon-provider-3 to zylon-provider-6 (YouTube page element change)
+ Updated comments shortcut selector (YouTube page element change) - https://github.com/NicholasBly/youtube-webos/issues/39
+ Fixed selector logic not targeting comment button element on some detection methods
+ Apply description panel layout fix always regardless of Return YouTube Dislike setting

Fixed video description jumbled text if there is a button element inside it
+ Note: some descriptions are cut off at the bottom and can't be scrolled, while some videos have working scroll bars and navigation. Another YouTube bug.

+ Updated comments shortcut selector (YouTube page element changed) - https://github.com/NicholasBly/youtube-webos/issues/39
+ Fixed selector logic not targeting comment button element on some detection methods
+ Fixed cleanup of transient event listener from executeChainSkip()

### Shorts
+ Disable shortcuts for chapter skip
+ Fixed comments shortcut not working on Shorts

Fixed Toggle Subtitles shortcut pressing the subscribe button on Shorts
+ Note: This shortcut won't work on Shorts as there's no page element to enable subtitles. You have to press the three dots and then go to subtitles menu

### General
+ Live videos: toggle comments shortcut will now toggle live chat on/off if available

## UI Updates

### Config UI

+ Converted fixed pixel sizes to viewport units to resolve scaling issues across different screen sizes
+ Adjusted sizing rules to make it more compact to fix scaling/truncated options

### General

+ Video Shelf Opacity: When set at 50% or below, the black borders around text returns for better visibility
+ Multiline video titles: change rules from pixels to viewport units
+ Config UI: css performance/efficiency improvements
+ Added additional line of text on SponsorBlock settings page explaining blue button functionality

### OLED mode - pure black element additions
+ Description panel
+ "Includes Paid Promotion" label
+ Movies & TV tab header
+ "More" tab menu

### Assets
+ Update app icons - https://github.com/NicholasBly/youtube-webos/pull/43

webOS 22 version .ipk now available in Homebrew channel
+ Reminder: app is available via repo link: https://raw.githubusercontent.com/NicholasBly/youtube-webos/main/repo.json

## [0.6.9] - 2026/01/15

## Fixes

### Force Max Quality
Implemented black screen/infinite loading mitigation for webOS 25 TVs only
On webOS 25 TVs, the first video loaded while using Force Max Quality usually gets stuck on a black buffering loading screen

+ Fix: Detect webOS 25 TV -> force video to play
+ When it starts to play successfully, the player UI (controls) will be hidden and appear to load like a normal video
+ Subsequent videos for the remainder of the session are unaffected and will load normally

Additional improvements to redundant quality checks and race conditions

### Show Time in UI
+ Fix clock not appearing properly during video playback
+ Fix clock not appearing at all on webOS 3 - 5 (css style issue)
+ Hide clock when description panel is open on video
+ Code redundancy fixes + general optimizations

### Thumbnail Quality
+ Complete rewrite fixing memory leaks, performance issues, and race conditions - https://github.com/NicholasBly/youtube-webos/issues/36
+ webOS 3 legacy code fallback added for full functionality
+ Thumbnail Quality now stops upgrading thumbnails when the setting is disabled

### Shortcuts
+ Added 400ms cooldown on shortcuts to prevent accidental duplicate key presses / key spam

### Return Dislike
+ Fix race condition causing console log spam / multiple injection attempts when opening description panel

## Updates

### AdBlock
+ Filter sponsored videos/ads from Shorts

### Force Max Quality
+ When quality is upgraded, a notification will appear showing the updated quality
+ Optimized Lookups: Replaced array checks with a static Set (TARGET_QUALITIES) for O(1) quality level validation
+ Storage Caching: Implemented in-memory caching (cachedQualitySettings) for localStorage to reduce read/write frequency and overhead
+ Smart Quality Check: Added logic to skip processing if isQualityAlreadyMax() returns true

### Shortcuts
Play / Pause shortcut no longer shows YouTube player UI
+ When running shortcut in fullscreen, the player UI (controls) and clock UI (if enabled) is hidden temporarily and dismissed automatically
+ When running shortcut with player UI visible, the player UI will not be affected
+ Perfect functionality after pause -> controls and clock will be visible as normal

### OLED-care mode
+ "Up next" screen now has a black background
+ Black background re-applied to the video selector underneath videos at 100% opacity by default
+ + 4th page added called "UI Tweaks" to allow you to adjust the opacity to your liking
+ Black background on text removed

## Changes
+ Moved multi-line video title fix to 4th page "UI Tweaks" section as a toggleable option

## Optimizations

### AdBlock
+ Reduced code complexity and improved code reuse

### SponsorBlock
+ Cache legacy webOS version check
+ General optimizations and improvements 

### Show Time in UI
+ Code redundancy fixes

### ui.js
Performance: Replaced expensive <style> tag injections with efficient CSS class toggling for the Play/Pause shortcut
Refactor: Consolidated scattered CSS injections (Logo, Endcards, UI hacks) into a single initGlobalStyles() function

## [0.6.8] - 2026/01/07

## Optimizations

### Observer Logic Optimizations

+ SponsorBlock: Observe ytlr-progress-bar from ytlr-app
+ Screensaver Fix: Observe ytlr-player__player-container from querying document.body to find the video element
+ Force Max Quality: Observe ytlr-player__player-container from querying document.body to find .html5-video-player

### AdBlock.js
+ Added additional early exit optimization

### General
+ Added additional code safety checks
+ Code cleanup/removal of unused functions and objects

### Force Max Quality
+ Cache last time value when modifying local storage to not spam multiple times during video playback state

## Fixes

### Show Time in UI
+ Fixed overlay sometimes not hiding on video fullscreen

### General
+ OLED Care Mode: Added additional YouTube UI elements to pure black theme
+ Config UI visual adjustments/fixes

### Force Max Quality
+ Change video state to STATE_PLAYING from STATE_BUFFERING to further improve black screen issue on first video load
++ On first video load, it might take up to 15 seconds for max quality to kick in

### Upgrade Thumbnail Quality
+ Fix max thumbnail quality - webosbrew's original code
+ Waterfall detection: Picks the highest quality thumbnail available for each thumbnail (maxres → sd → hq)
+ Optimize body observer - observe ytlr-app by default, document.body as fallback
+ Many improvements for race conditions, memory leaks, error handling, object creation, type safety, mutation observer, early returns, and cleanup function
+ Overlays higher resolution thumbnail on top of existing to prevent pop-in effect for seamless visuals
+ Converted from TypeScript to JavaScript

### webOS 3
+ Fix Force Max Quality
+ Fix additional incompatible css rules on SponsorBlock UI panel

## Removed
+ Removed search history injection for the time being due to bugs

## [0.6.7] - 2026/01/02

## Added

Added new theme to config UI: Blueprint
Added logo to config UI header
+ Click the logo to toggle between themes

Force Max Quality now sets the local storage key yt-player-quality to 4320 (max) on load/video changes

Added "Display Time in UI" from https://github.com/webosbrew/youtube-webos - https://github.com/NicholasBly/youtube-webos/issues/32
+ Improvement: Time UI background now matches background color based on OLED mode toggle

## Changes

Added code to ensure config UI is closed when activating OLED mode so the persistent keepalive has access to YouTube's controls

## Fixes

Attempted fix to black screen on first video load using Force Max Quality
+ Only sets max quality on buffering state instead of buffering and unstarted state
Fixed shortcut keys activating on the search page
Fixed shortcut keys with no action assigned toggling the player UI when pressed
Fixed config UI css rules that weren't compatible with webOS 3

### SponsorBlock.js

Clamp segments that are outside the bounds of the video duration
If segments start after the video's duration, they won't show on the progress bar
+ Sometimes SponsorBlock segments are submitted and the video creator edits something out of the video making it shorter, causing segments to start after the video ends

## YouTube UI Updates - yt-fixes.css

Video player: multiline video titles closes gap between lines, making it easier to read on new UI

## [0.6.6] - 2025/12/29

## Added
Feature request - OLED black screen keepalive to keep videos playing indefinitely - https://github.com/NicholasBly/youtube-webos/issues/30
Feature request - added css override rules for fixing YouTube's stats for nerds panel - https://github.com/NicholasBly/youtube-webos/issues/28

## SponsorBlock.js

Implemented skip chaining
+ Recognizes when multiple segments run parallel and only skips to the end of the chain, making one clean skip
+ Each segment in the chain will be listed in the notification

Implemented high precision skipping
+ When within 1 second from a segment, a high precision animationFrame waits for the exact frame to skip
+ + Fixes skipping taking too long where you might see a few frames within the segment

## AdBlock.js
### Cosmetic Filtering
Added "Top Live Games" and "Remove Shorts (Global)"
+ "Remove Shorts Global" replaces "Remove Shorts From Subscriptions" and simply removes shorts on every navigation page

### Performance

Rewrote adblock + cosmetic filtering engine
+ 15-20x faster filtering through schema path optimization
+ + Direct scan to known locations in JSON instead of blindly searching 100,000+ lines on every page reload
+ + If the direct path search fails due to YouTube server-side changes, it falls back to the original method, which ensures full functionality
+ + Saves 200-400ms per page load and reduces CPU cycles significantly

### Optimizations

+ Early Exit - added logic to instantly skip processing for irrelevant network responses (logging, metrics, etc.).
+ Optimized path access with caching - eliminates repeated .split() calls
+ Replaced includes() with indexOf() for better string comparison performance
+ Added comprehensive error handling with try-catch throughout filtering pipeline
+ Implemented fallback deep search when schema patterns don't match

### Bug Fixes

+ Fixed inefficient title checking that called getShelfTitleOptimized() 2-3x per shelf
+ Added missing parse error handling to prevent crashes on malformed JSON
+ Fixed config cache to properly update on configuration changes
+ Added fallback mechanism for unknown/new YouTube API response types

+ Added webOS 3, 4, and 6 to the existing webOS 5 SponsorBlock logic fixing skipping infinite loop/restart bug - https://github.com/NicholasBly/youtube-webos/issues/26#issuecomment-3693879890

## Webpack / Building

Added dual build capability
+ Build modern version (no polyfills, supports webOS 22 + via command: npm run build:modern)
+ Build legacy version (webOS 3.0 + with npm run build)

Shortcuts via build-local modern.cmd and build-local.cmd

+ Fixed .cmd shortcuts always performing a clean install, leading to slow build times
+ + Checks if node_modules folder exists already, if not, perform a clean install

## [0.6.5] - 2025/12/23

## Note

Starting with this build, there are two versions available:

**webOS 22+ (Optimized)**
+ Runs native ES6+ code with no transpilation (translated code) for maximum performance
+ Removes 130kb+ of polyfills and compatibility layers from the compiled script: ~100kb vs. ~230kb
+ Requires webOS 22 or newer

**Legacy (All Devices)**
+ ES5-transpiled code with polyfills for compatibility
+ Works on webOS 3.0 and newer
+ Same functionality as all previous releases
+ ~230kb file size to stay under 250kb performance target

## Code Optimizations

### SponsorBlock

Performance: Implemented additional AbortController logic to fix race conditions where segments from previous videos could persist during rapid navigation
Optimization: Added debouncing to initialization and cached muted segment value to reduce CPU usage during playback

### Return YouTube Dislike

Modern code improvements: Abort controller and intersection observer functions available on webOS 22 +
+  Instead of adding polyfills to support webOS 3, kept it simple and just added fallback functionality to keep the bundle light and efficient

Switched mutation observer from document.body to zylon-provider-3 to reduce an optimize CPU usage

Fixed pop in of dislike value when opening description panel
+  Implemented css builder for building/deploying description panel - more efficient and instantaneous when opening

Fixed panelContentObserver memory leak
Fixed race condition on cleanup
Fixed redundant panel queries
Fixed style pollution across instances

### Force Max Quality

Switched from html body MutationObserver to polling (60-80% CPU reduction)
Fixes: memory leaks, race conditions, deduplications
All resources properly cleaned up
Code reduction

### ui.js

Removed keypress and keyup eventListeners - fixes duplicate actions and unnecessary listeners
Optimized notification function - cached container reference, eliminating DOM queries after first call
Fixed redundant preventDefault calls - Cleaner logic, only prevents when needed
Fixed highlight jump race condition - Prevents default early, better error handling
Updated OLED mode - Uses cached notification container

## Fixes

Fix to Subtitles toggle / comments toggle
+  Fixed webOS 3 missing polyfill for toggle comments
+  Depending on webOS you might need to toggle the YouTube player UI once for subtitles/comments to work

Fixed outro segments on webOS 5 and 6 potentially setting video playback to a time longer than the video length, causing the video to loop - https://github.com/NicholasBly/youtube-webos/issues/26
+ For webOS 5, the last segment skip within 0.5s of video duration will temporarily mute the video to not cause an audio blip

Fixed config UI sometimes losing focus if YouTube is loading something in the background

Fixed config UI fighting for focus if opened on top of a playing video with the progress bar visible, causing inability to scroll options temporarily

Fixed notifications duplicating on key presses

## Removed

Removed debug menu for main release

Removed notifications for shortcut toggling comments in video

## [0.6.4] - 2025/12/17

## Added

### Debug Menu
- Triggered by pressing the 0 key 5 times in a row while config UI menu is open
-- Added "qrious" dependency to generate QR codes

#### Features:
- Generate QR code of last 50 lines of console logs
-- Must enable checkbox "Enable console log collection" before console log data can be captured for collection

- Generate QR code of localStorage saved configuration

## Performance Optimizations

### AdBlock.js

Note: Should result in noticeably faster load times between page switching and video loading

Cached config values for AdBlock, remove shorts, hide guest prompts
-- 40-50% reduction in config read during JSON parsing

Early Exit Optimizations
-- reduce CPU usage and skip JSON filtering when unnecessary

Cap maximum depth limit to findFirstObject
-- Safety feature to prevent stack overflow

Updated var -> const/let for modern syntax

Previously implemented destroyAdblock() function is now called whenever AdBlock checkbox is disabled
-- This will also disable "Remove Shorts From Subscriptions" and "Hide Guest Prompts" as these rely on the AdBlock JSON filtering engine (same behavior, but more transparent now)

## Visual Changes

Added sections to main config UI page

Cosmetic Filtering -> Ad Blocking, Remove Shorts From Subscriptions, Guest Mode: Hide Sign-in Buttons (if applicable)
Video Player -> Force Max Quality, Hide Endcards, Return YouTube Dislike
Interface -> Auto Login, Upgrade Thumbnail Quality, Hide YouTube Logo, OLED-Care Mode, Disable Notifications

## Fixes

Fixed Return YouTube Dislike not displaying description panel correctly when language was not English

Reverted dependency update to fix performance degradation for some users (from 0.6.4 build 2)

## [0.6.3] - 2025/12/16

## Performance Optimizations

### SponsorBlock

Observe ytlr-app instead of the entire document.body for DOM changes, providing a significant performance and efficiency uplift

## Bug Fixes

### AdBlock.js

Fix Block Shorts in Subscriptions - small typo from 0.6.2 update

## Updates

Bump Dependencies

## [0.6.2] - 2025/12/15

### Note

Thank you for supporting my YouTube webOS extension. To those providing bug reports, feature requests, and feedback, I greatly appreciate it!

New builds will be more thoroughly tested than before thanks to your feedback. If you'd like to test the latest updated builds before release, check the test branch. I will be uploading new builds there frequently. So far this 0.6.2 build has produced 8 test builds published there. 

## Added

Added third page to config UI - "Shortcuts"
- Allows programming custom shortcuts to the 0-9 keys on the LG remote during video playback

Options:
-- Play/Pause Toggle
-- Skip Forward 15 seconds
-- Skip Backward 15 seconds
-- Toggle Closed Captions/Subtitles
-- Toggle Comments Menu
-- Skip to start of next chapter
-- Skip to start of previous chapter

Added "Disable Notifications"

## Performance Optimizations

config.js: Added configRemoveChangeListener API
- Previously there was no way to stop listening to setting changes, causing memory leaks when components were destroyed

### AdBlock

Refactored to support safe initialization and destruction

Added protection against "double-hooking" JSON.parse (preventing stack overflows on script reloads)

Implemented a smarter JSON parsing system:
- Instead of intercepting and processing every single JSON, it will only parse JSON when necessary

- Player Ads: Only search for playerAds if playerResponse or videoDetails exists
- Home/Guest Prompts: Only search for tvBrowseRenderer or sectionListRenderer
- Shorts: Only search gridRenderer if we are in a browse response and only when the Subscriptions tab is loaded

Removed "Remove Shorts From Subscriptions" toggle if the user is in guest mode. This disables useless JSON parsing to improve performance

### SponsorBlock

Fixed multiple memory leaks in the SponsorBlockHandler
- Now correctly tracks and removes configuration change listeners in destroy()
- Cleaned up injected CSS styles (<style id="sb-css">) when the instance is destroyed
- Centralized listener management to ensure no old event handlers remain active after video navigation

- Cache highlight timestamp for faster playback
- Prioritize video playback on segment skip for faster segment skipping
- Optimization: sort segment data immediately on video load
- Optimization: observePlayerUI() now only observes the video container instead of the entire html body
- Optimization: Track and auto cleanup all pending animation frame requests and cancel them when destroy() is called.
- Fixed display of segment overlays on videos with chapters (previously did not align properly when segment bar changed sizes)

## General Fixes

Fixed Chapter Skip when YouTube player UI was not loaded
-- The YouTube player UI (progress bar) must be opened at least once in order to get data on chapters for the chapter skip feature to work
-- The fix will automatically detect when the chapter bar is present but the chapter data is missing
-- It will then toggle on the player UI quickly to grab that data and skip properly. This only occurs once per video load

Fixed config UI spacing on older webOS versions

## [0.6.1] - 2025/12/08

## Added

### SponsorBlock

Added a segment list overlay on the right side of the screen when viewing SponsorBlock settings during video playback.

<img width="1280" height="720" alt="webOS_TV_23_Simulator_fiQJN1gMbf" src="https://github.com/user-attachments/assets/021722c6-11c7-4d3a-8e5a-d282b0a2a114" />

### Video Playback

Added "Chapter Skip" 

- Press the 5 key on LG remote during video playback to automatically skip to the start of the next chapter. Only available on videos with chapters.

Note: Since the 0-9 keys aren't utilized for anything during video playback, let me know what other features you'd like added as quick shortcuts.

### Guest Mode

Hide giant "Make YouTube your own" banner that appears on the home page

## Fixes

Search History Fix: Added 500ms wait for YouTube to naturally populate the search history before trying to inject results, fixing UI overlap in some cases

## Changes

Code cleanup of unused functions

Removed userscript map file to decrease .ipk file size (~100kb from ~420kb)

## [0.6.0] - 2025/12/05

### Added

Homebrew channel support (beta)
Add the following URL to the repo list: https://raw.githubusercontent.com/NicholasBly/youtube-webos/main/repo.json

### Fixes

- Fixed "Remove Shorts From Subscriptions" https://github.com/NicholasBly/youtube-webos/issues/14
- Fixed SponsorBlock initialization compatibility issue with older webOS versions - https://github.com/NicholasBly/youtube-webos/issues/15

## [0.5.9] - 2025/12/05

### Config UI panel

Note: When adding new features the config panel ran out of space. So I decided to make a two page UI to have the main settings first and then the SponsorBlock settings second. Press left/right on your LG remote to switch pages.

- Fixed non-music segments not showing a color picker option
- Fixed old janky navigation behavior with left/right arrow buttons

### SponsorBlock

- Added Filler Tangents/Jokes segment type (default: disabled)
- Added Hook/Greetings segment type (default: disabled)
- Added mute segment type (default: disabled)

Bump (update) dependencies

## [0.5.8] - 2025/12/02

### Performance Enhancements

SponsorBlock: Implemented category config caching to eliminate expensive storage reads during video playback (approx. 90% CPU reduction in time-check loop).

SponsorBlock: Throttled UI mutation observer to reduce idle CPU usage when player controls are visible.

AdBlock: Added fail-safe error handling to JSON.parse hook to prevent application crashes on unexpected data structures.

Core: Added safety timeouts to waitForChildAdd utility to prevent memory leaks from zombie observers.

YT-Fixes: Optimized sign-in prompt detection to reduce DOM scanning frequency.

General: Added AbortController support to network requests to prevent hanging threads on slow connections.

### Changes

Removed "Enable" word in green UI panel labels as the checkbox is self explanatory

Capitalized checkbox labels for main settings

## [0.5.7] - 2025/11/28

### Added

Added "Force Max Quality" option to green button UI

## [0.5.6] - 2025/11/28

### Green Button UI

Moved panel offset to the left to better view other page elements

### Added

Added a restore recent search history feature to yt-fixes.js

-- Sometimes, the recent search history can be blank

-- Fix detects when the search history is empty, and looks for the recent search data in local storage and injects it back in

-- Fix only runs once on startup the first time you visit the search page, and caches it for the rest of the session

-- Might not work if the actual local storage key was deleted / doesn't exist (I don't know why that can happen but it does, another YouTube bug)

### Bug Fixes

Fixed SponsorBlock segments not appearing on ytlr-multi-markers-player-bar-renderer on the old UI (was only looking for [idomkey="slider"] (new UI selector) instead of [idomkey="progress-bar"]) (old UI selector)

Jump to highlight now works at any point in the video

## Return YouTube Dislike

### Performance & Efficiency

Debounced Observers: Switched from checking every single added node to a throttled approach that waits for DOM activity to settle, significantly reducing CPU load.

Batch Styling: Replaced individual style property updates with batch CSS application to reduce browser reflows and layout thrashing.

Optimized Loops: Replaced slower iterators with standard loops for faster execution on embedded processors.

### Stability & Fixes

Race Condition Prevention: Added active state checks to asynchronous callbacks, preventing errors if the user navigates away while data is loading.

Robust Navigation: Replaced fragile manual string parsing with the standard URL API to reliably handle hash changes and parameters.

Memory Safety: Improved cleanup logic to ensure observers and timers are strictly destroyed to prevent memory leaks.

### Code Quality

Centralized Selectors: Moved hardcoded class names into a single configuration object for easier maintenance and updates.

Memory Optimization: Implemented method binding in the constructor to reuse function references rather than creating new instances on every execution.

## adblock.js

### Performance & Efficiency

Unified JSON Interceptor: Merged shorts.js logic into adblock.js to eliminate double-wrapping of JSON.parse, reducing interception overhead by 50%.

Removed Recursive Scanning: Replaced the expensive O(N) recursive search (findFirstObject) with O(1) direct path lookups for Shorts removal.

Fail-Fast Logic: Implemented early exit checks to skip processing on non-relevant API responses, significantly reducing CPU usage on the main thread.

Memory Efficiency: Switched to in-place array mutation for filtering content, reducing garbage collection pressure and memory spikes.

## [0.5.5] - 2025/11/26

### Removed

- Removed webOS version from green button UI header except for webOS 25
-- Since webOS version ≠ YouTube UI, we only need to detect webOS 25 to apply the chromecast fix. Everything else will be detected via queryselectors to determine which YouTube UI is running.

### Added

- Updated webOS detection via firmware version
-- If webOS 25 is detected, the chromecast fix is applied to fix the freezing issue

### Fixes

- Unchecking/checking a SponsorBlock segment from the green button UI while watching a video will update the skipping status accordingly

### Performance

- Cached several more elements:

1. UI layout detection
2. simulator only: chrome version detection
3. config mapping for sponsorblock segments

## [0.5.4] - 2025/11/24

SponsorBlock Rewrite | SponsorBlock received a much needed overhaul!

### Summary
1. 99% reduction in CPU usage: setInterval polls 4-10 times a second, MutationObserver only fires when there is an update event.
2. ~80% more efficient: segments were drawn one by one, forcing a layout recalculation for every single segment. Now, DocumentFragment batches everything into 1 single layout calculation.
3. Removed layout thrashing: The old code read properties like .offsetWidth or .contains inside loops, forcing the browser to pause and calculate styles synchronously. The new code uses requestAnimationFrame, allowing the browser to check these values only when it is ready to paint the next frame.

### Massive Performance Overhaul
1. Removed Polling Loops: Replaced setInterval checks with MutationObserver
2. Frame-Perfect Updates: All DOM checks are now throttled using requestAnimationFrame to prevent dropping frames during UI updates
-- This draws segments the instant the progress bar is visible, eliminating slight delays
3. Batch Rendering: Segments are now built in memory using DocumentFragment and appended in a single operation, rather than injecting elements one by one
4. Memory Management: Implemented a better destroy() method that cleanly disconnects all observers and event listeners to prevent memory leaks

### Fixes

- Readded css rules for SponsorBlock on older webOS versions that aren't using the new UI yet (should make compatibility the same as 0.5.2 and before)
- Fixed Guest Mode button not being hidden on new UI

### Other Improvements

- Cached some new elements from 0.5.0+ for better performance
- New SponsorBlock rewrite reduces file size of userScript.js from 213kb to 194kb

## [0.5.3] - 2025/11/22

### Notes
YouTube has started rolling out a new UI on most webOS versions.
From my testing, all webOS versions from 6 through 25 are all being served the new UI.
If you're still on the old UI and have no bugs, please feel free to stay on 0.5.2 - I cannot test the old UIs anymore

### YouTube's New UI Fixes
- Fixed Return YouTube Dislike UI on description page (YouTube's new UI is broken, so if they fix it, expect it to break again :/)
--No longer rely on specifically webOS version, apply if the new UI is detected
- Implemented new SponsorBlock rules to detect YouTube UI instead of relying on webOS version only
- Fixed SponsorBlock segments not appearing on progress bar if the loaded video lacks a multi-markers-player-bar-renderer

### Added
- Enhanced webOS version detection

### Other Fixes
- Fixed casting from android/iOS

### Other / File Size Reductions
- Added cssnano to remove comments from userScript.js build
- Disable source maps for production
- Bump dependencies
- Implement some older bug fixes from webosbrew

### Known Issues / Fixed in next version
Guest Mode button not being hidden
SponsorBlock segments appear slightly off-center when progress bar is not focused

## [0.5.2] - 2025/11/17

## Features & Improvements

Guest Mode: hide sign-in button
-- When in guest mode, a new option appears in the UI panel to hide the "sign in to subscribe" button underneath videos.
-- yt-fixes.js added for applying this tweak

UI panel visual enhancements
-- Added webOS version to header
-- Increased font size, reduced spacing

Attempt to fix Android casting issue

## [0.5.1] - 2025/11/12

## Features & Improvements

### Return YouTube Dislike
* **Native UI Integration:** Moved the dislike count from button tooltips to the main video description panel. It now appears natively alongside Likes and Views.
* **Dynamic Layout Engine:** Implemented a smart layout shifter that automatically adjusts content spacing to prevent button overlaps, regardless of the video description length.
* **Multi-Version Support:** Added specific CSS selectors and spacing rules to ensure perfect rendering across **webOS 23, 24, and 25**.
* **Visual Tweaks:** Fixed the alignment of the "Date" element to ensure it centers correctly on its own line when the Dislike count is present.

### SponsorBlock
* **webOS 25 Support:** Optimized segment rendering for the newer OS.
* **Dynamic Visibility:** Segments now correctly disappear when the player progress bar is hidden.
* **Focus Scaling:** Segments now correctly resize and fit the progress bar during focus/unfocus states.

### Core / Internal
* **webOS 25 Support:** Added general compatibility for webOS 25.
* **Version Detection:** Added `webos-utils.js` to accurately map User Agent Chrome versions to webOS versions (based on [LGE Specifications](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)). This ensures visuals and features load with the correct version-specific rules.
* **Major Version Improvements:** Sponsorblock and Return YouTube Dislike now have individual rules for each webOS version for better functionality.

## [0.5.0] - 2025/11/11

### Added

- Red Button: Toggle OLED black screen
- yt-fixes.css - add transparency to black box underneath video player (60%)
- Bump dependencies

### Removed

- Red Button: 2x speed playback (wasn't working for most, might come back)

## [0.4.9] - 2025/11/03

### Added

- Return YouTube Dislike + UI Toggle
  - ++ Hover over the Like/Dislike button on a video to see each value
- Added pure black UI containers (pull request from tomikaka22)

### Fixed

- Fixed black screen when viewing controls / skipping forward or backward
- Fixed sponsored segments not showing on progress bar
- Fixed sponsored segments attaching to the wrong object initially / flickering
- Setup mutation observer to keep segments perfectly attached without delay

### Removed

- Removed auto login button press, mutationobserver, and handling app resume (no longer needed)

## [0.4.8] - 2025/07/24

### Changed

- Auto Login: Will now detect when the app is resumed from the background/sleep state and bypass the nag screen.
- Auto Login: Opening this app with Auto Login enabled will modify local storage time values to prevent the nag screen from appearing for 7 days. Will stack every time you open the app. Credit to reisxd for this solution on Tizen OS https://github.com/reisxd/TizenTube/

## [0.4.7] - 2025/07/23

### Fixed

- Auto Login: Fixed compatibility issue with webOS 23

### Added

- Auto Login: Added MutationObserver to look for body class changes for identifying the nag screen to bypass instead of only looking at the first 15 seconds of YouTube app load
- Auto Login: Added secondary check for nag screen if it was not bypassed by key code 13 as some webOS versions / remotes have a different key code

## [0.4.6] - 2025/07/11

### Changed

SponsorBlock Optimizations:
- Network - API fallback added, timeout handling
- Memory - centralized management system to prevent memory leaks
- Performance - caching for DOM elements
- Efficiency - reduced repeated queries
- Error handling/logging improvements
- Resource Cleanup

### Added

- Red button on LG remote now changes playback speed between 1x and 2x

## [0.4.5] - 2025/07/09

### Fixed

- AdBlock bug causing empty search suggestions (present in webosbrew version)

### Changed

- Slight UI change

## [0.4.4] - 2025/07/07

### Added

- "Hide end cards" toggle
- Auto login now actively and efficiently looks for the login screen instead of only at startup. Only watches for class attribute changes on the body element.

### Fixed

- UI element order

### Changed

- Update dependencies

## [0.4.3] - 2025/07/04

### Added

- "Auto Login", enabled by default. Whenever YouTube triggers the login screen, Auto Login will automatically log you in to bypass it
- UI optimizations

## [0.4.1] - 2025/06/09

### Added

- OLED-care mode (changes UI elements of options panel to black and gray)
- Manual color selection of SponsorBlock segments

### Fixed

- Manual segment selection and crashing issue

## [0.4.0] - 2025/06/09

### Added

- Redesigned menu UI
- "Show highlight segments"
- Highlight segment is now shown on the progress bar
- "Jump to highlight with blue button"

### Fixed

- Colored button mappings for blue and red buttons

## [0.3.9] - 2025/06/09

### Added

- Changed App Icon to mimic official YouTube App

### Fixed

- Sponsored segments not showing on preview bar

## [0.3.8] - 2025/05/10

### Fixed

- [#290](https://github.com/webosbrew/youtube-webos/pull/290): Fix "Remove Shorts from subscriptions" feature for new page format (@JaCzekanski)

## [0.3.7] - 2025/04/05

### Added

- [#273](https://github.com/webosbrew/youtube-webos/pull/273): Integrate recap/preview skipping for SponsorBlock (@LeviSnoot)

### Fixed

- [#278](https://github.com/webosbrew/youtube-webos/pull/278): Fix default shadow class name (@gartnera)
- [#280](https://github.com/webosbrew/youtube-webos/pull/280): Fix CSS patches for new YT class naming (@fire332)

## [0.3.6] - 2025/01/05

### Fixed

- [#235](https://github.com/webosbrew/youtube-webos/pull/235): Fix shorts (@fire332)

## [0.3.5] - 2024/12/27

### Added

- [#201](https://github.com/webosbrew/youtube-webos/pull/201): Blocked shorts in subscriptions tab (@JaCzekanski)
- [#236](https://github.com/webosbrew/youtube-webos/pull/236): Add option to upgrade thumbnail quality (@fire332)

### Fixed

- [#104](https://github.com/webosbrew/youtube-webos/pull/104): Disabled SponsorBlock on previews (@alyyousuf7)
- [#204](https://github.com/webosbrew/youtube-webos/pull/204): Fixed transparency under UI (@atomjack; thanks to @reisxd)
- [#239](https://github.com/webosbrew/youtube-webos/pull/239): Fix missing math font (@fire332)
- [#240](https://github.com/webosbrew/youtube-webos/pull/240): Fix missing voice search (@fire332)
- [#242](https://github.com/webosbrew/youtube-webos/pull/242): Fix checkbox click in the YTAF config UI (@fire332)

### Changed

- [#179](https://github.com/webosbrew/youtube-webos/pull/179), [#183](https://github.com/webosbrew/youtube-webos/pull/183): Updated CLI instructions (@throwaway96, @ShalokShalom)
- [#206](https://github.com/webosbrew/youtube-webos/pull/206): Added old WebKit to targeted browsers (@throwaway96)
- [#208](https://github.com/webosbrew/youtube-webos/pull/208): Changed description of enableSponsorBlockMusicOfftopic setting (@throwaway96)
- [#234](https://github.com/webosbrew/youtube-webos/pull/234): Update dependencies (@fire332)
- [#238](https://github.com/webosbrew/youtube-webos/pull/238): Misc dev changes (@fire332)

## [0.3.4] - 2024/04/23

### Added

- [#164](https://github.com/webosbrew/youtube-webos/pull/164): Added an issue template for bugs (@throwaway96)

### Changed

- [#146](https://github.com/webosbrew/youtube-webos/pull/146): Updated a bunch of dev stuff (@fire332)
- [#150](https://github.com/webosbrew/youtube-webos/pull/150): Added myself to FUNDING.yml (@throwaway96)

## [0.3.3] - 2024/03/31

### Added

- [#142](https://github.com/webosbrew/youtube-webos/pull/141): Blocked some additional ads (@throwaway96)
- [#144](https://github.com/webosbrew/youtube-webos/pull/144): Added support for config change listeners (@throwaway96)
- [#149](https://github.com/webosbrew/youtube-webos/pull/149): Added ability to hide YouTube logo (@throwaway96; thanks to @fire332 and @tomikaka22)

### Fixed

- [#103](https://github.com/webosbrew/youtube-webos/pull/103): Fixed SponsorBlock on videos with chapters (@alyyousuf7)
- [#131](https://github.com/webosbrew/youtube-webos/pull/131): Fixed minor README issue (@ANewDawn)
- [#141](https://github.com/webosbrew/youtube-webos/pull/141): Fixed black background behind video menu (@throwaway96; thanks to @reisxd)
- [#143](https://github.com/webosbrew/youtube-webos/pull/143): Fixed duplicate click bug (@throwaway96)

### Changed

- [#128](https://github.com/webosbrew/youtube-webos/pull/128): Updated workflows and dependencies (@throwaway96)
- [#133](https://github.com/webosbrew/youtube-webos/pull/133): Changed various dev stuff (@throwaway96)
- [#134](https://github.com/webosbrew/youtube-webos/pull/134): Refactored config/UI code (@throwaway96)
- [#138](https://github.com/webosbrew/youtube-webos/pull/138): Changed webpack to production mode by default (@throwaway96)
- [#145](https://github.com/webosbrew/youtube-webos/pull/145): Made observing attributes optional in waitForChildAdd() (@throwaway96)

## [0.3.2] - 2024/03/07

### Added

- [#100](https://github.com/webosbrew/youtube-webos/pull/100): Blocked "Sponsored" tiles (@alyyousuf7)

### Fixed

- [#95](https://github.com/webosbrew/youtube-webos/pull/95): Fixed the appearance of YouTube in the app (@0xBADEAFFE)
- [#96](https://github.com/webosbrew/youtube-webos/pull/96): Fixed launch functionality broken by #95 (@fire332)
- [#102](https://github.com/webosbrew/youtube-webos/pull/102): Fixed minor dev-related stuff (@alyyousuf7)
- [#106](https://github.com/webosbrew/youtube-webos/pull/106), [#120](https://github.com/webosbrew/youtube-webos/pull/120): Updated outdated documentation (@throwaway96)

## [0.3.1] - 2022/01/27

### Fixed

- [#24](https://github.com/webosbrew/youtube-webos/pull/24): Fixed playback time
  tracking again

## [0.3.0] - 2022/01/15

### Fixed

- [#14](https://github.com/webosbrew/youtube-webos/pull/14): Fixed voice search
  on certain TV models
- [#21](https://github.com/webosbrew/youtube-webos/pull/21): Fixed screensaver
  kicking in during non-16:9 videos playback

### Changed

- [#19](https://github.com/webosbrew/youtube-webos/pull/19): Updated internal
  dependencies, cleaned up build setup

## [0.2.1] - 2021/12/26

## Fixed

- Fixed rendering on 720p TVs
- Disabled update prompt on startup

## [0.2.0] - 2021/12/23

### Added

- Added support for autostart (requires manual setup, see
  [README](README.md#autostart))

### Fixed

- Fixed deeplinking from voice search results
- Fixed in-app voice search button on webOS 5.x
- Fixed screensaver kicking in on sponsor segment skips
- Fixed playback time tracking

## [0.1.1] - 2021/11/21

### Fixed

- Use alternative SponsorBlock API URL to work around untrusted Let's Encrypt
  certificates
- Increase initial notification delay

## [0.1.0] - 2021/11/14

### Added

- [#10](https://github.com/FriedChickenButt/youtube-webos/issues/1): Added SponsorBlock integration
- Added configuration UI activated by pressing green button

## [0.0.2]

### Added

- [#2](https://github.com/FriedChickenButt/youtube-webos/issues/2): Added DIAL startup support.
- [#3](https://github.com/FriedChickenButt/youtube-webos/issues/3): Added webOS 3.x support.
- Enabled quick start.
- Disabled default splash screen

### Fixed

- Disabled back button behaviour to open the Home deck.

## [0.0.1]

### Added

- Created basic web app which launches YouTube TV.

[Unreleased]: https://github.com/webosbrew/youtube-webos/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/webosbrew/youtube-webos/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/webosbrew/youtube-webos/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/webosbrew/youtube-webos/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/webosbrew/youtube-webos/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/webosbrew/youtube-webos/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/webosbrew/youtube-webos/compare/0.0.2...v0.1.0
[0.0.2]: https://github.com/webosbrew/youtube-webos/compare/0.0.1...0.0.2
[0.0.1]: https://github.com/webosbrew/youtube-webos/releases/tag/0.0.1
