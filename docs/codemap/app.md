# Code map: the entry point

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [index.js](#mod-index-js), [userScript.js](#mod-userscript-js)

<a id="mod-index-js"></a>

## index.js

> The app's start page script (index.html): sends the app to YouTube's TV site with the parameters webOS launched it with. Everything else runs in userScript.js, which webOS injects into that site.

11 lines · imports [core/launch.js](core.md#mod-launch-js)

**At load:**

- **Calls:** [main](#fn-index-js-main)

<a id="fn-index-js-main"></a>
**`main()`** · function · L7–9

Opens YouTube with the launch parameters webOS started the app with.

- **Calls:** [core/launch.js › extractLaunchParams](core.md#fn-launch-js-extractlaunchparams), [core/launch.js › handleLaunch](core.md#fn-launch-js-handlelaunch)
- **Called by:** [at load](#mod-index-js)

<a id="mod-userscript-js"></a>

## userScript.js

> The script webOS runs inside YouTube's TV site (built as webOSUserScripts/userScript.js). It loads every feature, installs the global hooks and handles launches and relaunches; the order of the imports below is the order things start in (docs/ARCHITECTURE.md).

86 lines · imports [polyfills/polyfills.js](polyfills.md#mod-polyfills-js), [dev/perf-mon.js](dev.md#mod-perf-mon-js), [features/adblock/index.js](features-adblock.md#mod-index-js), [features/force-codec/index.js](features-force-codec.md#mod-index-js), [hooks/buffer-limit.js](hooks.md#mod-buffer-limit-js), [core/selectors.js](core.md#mod-selectors-js), [core/launch.js](core.md#mod-launch-js), [features/auto-login/index.js](features-auto-login.md#mod-index-js), [core/webos.js](core.md#mod-webos-js), [features/block-webos-cast.ts](features.md#mod-block-webos-cast-ts), [features/return-dislike/index.js](features-return-dislike.md#mod-index-js), [features/video-quality/index.js](features-video-quality.md#mod-index-js), [features/logo-style.js](features.md#mod-logo-style-js), [ui/index.js](ui.md#mod-index-js), [features/sponsorblock/index.js](features-sponsorblock.md#mod-index-js), [features/emoji-font/index.js](features-emoji-font.md#mod-index-js), [features/screensaver-fix/index.js](features-screensaver-fix.md#mod-index-js), [features/comments-fix.js](features.md#mod-comments-fix-js), [features/watch/index.js](features-watch.md#mod-index-js), [features/lang-settings-fix.ts](features.md#mod-lang-settings-fix-ts), [core/log.js](core.md#mod-log-js) · npm `whatwg-fetch`

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger), [features/adblock/parse-hook.js › installParseHook](features-adblock.md#fn-parse-hook-js-installparsehook), [features/adblock/stringify-hook.ts › installStringifyHook](features-adblock.md#fn-stringify-hook-ts-installstringifyhook), [features/force-codec/index.js › installCodecHooks](features-force-codec.md#fn-index-js-installcodechooks), [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion), [hooks/buffer-limit.js › installBufferLimit](hooks.md#fn-buffer-limit-js-installbufferlimit), [features/logo-style.js › initLogoStyle](features.md#fn-logo-style-js-initlogostyle), [features/adblock/tracking-block.js › startTrackingBlock](features-adblock.md#fn-tracking-block-js-starttrackingblock), [core/launch.js › extractLaunchParams](core.md#fn-launch-js-extractlaunchparams), [features/auto-login/whos-watching.js › attemptActiveBypass](features-auto-login.md#fn-whos-watching-js-attemptactivebypass), [features/auto-login/whos-watching.js › resetActiveBypass](features-auto-login.md#fn-whos-watching-js-resetactivebypass), [core/launch.js › handleLaunch](core.md#fn-launch-js-handlelaunch), [core/webos.js › isWebOS25](core.md#fn-webos-js-iswebos25), [features/block-webos-cast.ts › initBlockWebOSCast](features.md#fn-block-webos-cast-ts-initblockweboscast)
- **Events:** listens to `webOSRelaunch`
- **Selectors:** `ACCOUNT_SELECTOR`
