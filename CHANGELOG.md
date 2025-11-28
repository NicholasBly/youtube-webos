# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
