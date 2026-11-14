# Code map: hooks/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [hooks/buffer-limit.js](#mod-buffer-limit-js), [hooks/fetch.ts](#mod-fetch-ts), [hooks/resolve-command.ts](#mod-resolve-command-ts)

<a id="mod-buffer-limit-js"></a>

## hooks/buffer-limit.js

> Caps MSE SourceBuffer memory by evicting already-played data.
>
> The YouTube TV player leaves a large read-behind window in the SourceBuffer. On webOS 3/4 hardware (Chromium 38/53, ~1GB total RAM) that window plus the read-ahead can push the web process past what LG's memory manager tolerates, which kills the app with the "restarting to free memory" toast.
>
> Chromium only garbage-collects a SourceBuffer once it hits its own internal ceiling (150MB video / 12MB audio on these builds). The trim keeps well below that.
>
> No addEventListener option bags: webOS 3 is Chromium 38, which reads an options object as `useCapture: true`. Syntax is not a concern, Babel lowers the legacy build to ES5.

219 lines · imports [core/log.js](core.md#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="fn-buffer-limit-js-currenttimefor"></a>
**`currentTimeFor(ms)`** · function · L33–47

Find the currentTime of the &lt;video> driving this MediaSource.

- **Called by:** [bufferStats](#fn-buffer-limit-js-bufferstats), [tick](#fn-buffer-limit-js-tick)
- **Browser:** `getElementsByTagName`

<a id="fn-buffer-limit-js-trimsourcebuffer"></a>
**`trimSourceBuffer(sb, now)`** · function · L53–79

Removes what lies more than RETAIN_BEHIND_SECS behind the playhead from one SourceBuffer, unless it is busy or the slice is too small to bother.

- **Called by:** [tick](#fn-buffer-limit-js-tick)

<a id="fn-buffer-limit-js-patchappend"></a>
**`patchAppend(sb)`** · function · L95–129

Patches appendBuffer on the SourceBuffer prototype (once), so an append that arrives while a trim is running waits for it instead of throwing.

- **Called by:** [installBufferLimit.MediaSource.prototype.addSourceBuffer](#fn-buffer-limit-js-installbufferlimit-mediasource-prototype-addsourcebuffer)

<a id="fn-buffer-limit-js-patchappend-proto-appendbuffer"></a>
**`patchAppend.proto.appendBuffer(data)`** · assigned · L108–126

appendBuffer that defers itself to the trim's updateend when a trim is in progress.

- **Calls:** [patchAppend.proto.appendBuffer.onDone](#fn-buffer-limit-js-patchappend-proto-appendbuffer-ondone)
- **Events:** listens to `updateend`

<a id="fn-buffer-limit-js-patchappend-proto-appendbuffer-ondone"></a>
**`patchAppend.proto.appendBuffer.onDone()`** · arrow · L112–120

Runs the deferred append once the trim has finished.

- **Called by:** [patchAppend.proto.appendBuffer](#fn-buffer-limit-js-patchappend-proto-appendbuffer)

<a id="fn-buffer-limit-js-tick"></a>
**`tick()`** · function · L134–152

Every TRIM_INTERVAL_MS: trims the buffers of every open MediaSource and forgets the closed ones.

- **Calls:** [currentTimeFor](#fn-buffer-limit-js-currenttimefor), [trimSourceBuffer](#fn-buffer-limit-js-trimsourcebuffer)
- **Called by:** [installBufferLimit](#fn-buffer-limit-js-installbufferlimit)

<a id="fn-buffer-limit-js-bufferstats"></a>
**`bufferStats()`** · function · L158–178

On-device verification, with diagnostics on (localStorage ytaf-debug=1 and a reload): run __ytafBufferStats() in the console while a video plays. `behind` should hold near RETAIN_BEHIND_SECS instead of climbing with playback position.

- **Calls:** [currentTimeFor](#fn-buffer-limit-js-currenttimefor)

<a id="fn-buffer-limit-js-installbufferlimit"></a>
**`installBufferLimit()`** · function, exported · L184–219

Installs the buffer cap: tracks MediaSources as the player creates them, remembers their blob URLs, and starts the trim timer.

- **Calls:** [core/log.js › isDebugEnabled](core.md#fn-log-js-isdebugenabled), [tick](#fn-buffer-limit-js-tick)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Browser:** `setInterval`
- **Hooks:** `MediaSource.prototype.addSourceBuffer`, `window.__ytafBufferStats`, `URL.createObjectURL`

<a id="fn-buffer-limit-js-installbufferlimit-mediasource-prototype-addsourcebuffer"></a>
**`installBufferLimit.MediaSource.prototype.addSourceBuffer(mime)`** · assigned · L193–198

addSourceBuffer that also tracks the MediaSource and patches the new buffer's appends.

- **Calls:** [patchAppend](#fn-buffer-limit-js-patchappend)

<a id="fn-buffer-limit-js-installbufferlimit-url-createobjecturl"></a>
**`installBufferLimit.URL.createObjectURL(obj)`** · assigned · L210–214

createObjectURL that remembers a MediaSource's blob URL, which is how currentTimeFor() finds its &lt;video>.

<a id="mod-fetch-ts"></a>

## hooks/fetch.ts

> The fetch hook: wraps window.fetch once and lets listeners see, and cancel, requests. Consumers get the one instance through getInstance().

134 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/adblock/tracking-block.js](features-adblock.md#mod-tracking-block-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="fn-fetch-ts-calllistener"></a>
**`callListener(listener, evt)`** · function · L31–37

Runs one listener; one that throws is logged and the rest still run, as on an event target.

- **Called by:** [FetchRegistry.#dispatch](#fn-fetch-ts-fetchregistry-dispatch)

<a id="fn-fetch-ts-fetchregistry-constructor"></a>
**`FetchRegistry.constructor()`** · method · L49–52

Wraps window.fetch; private, as there is one registry (getInstance()).

- **Called by:** [FetchRegistry.getInstance](#fn-fetch-ts-fetchregistry-getinstance)
- **Hooks:** `window.fetch`

<a id="fn-fetch-ts-fetchregistry-getinstance"></a>
**`FetchRegistry.getInstance()`** · method · L55–58

The one registry, created (and fetch wrapped) on first use.

- **Calls:** [FetchRegistry.constructor](#fn-fetch-ts-fetchregistry-constructor)
- **Called by:** [features/adblock/tracking-block.js › destroyTrackingBlock](features-adblock.md#fn-tracking-block-js-destroytrackingblock), [features/adblock/tracking-block.js › initTrackingBlock](features-adblock.md#fn-tracking-block-js-inittrackingblock)

<a id="fn-fetch-ts-fetchregistry-addeventlistener"></a>
**`FetchRegistry.addEventListener(type, callback)`** · method · L61–63

Adds a listener for `type` ('request'); it can cancel a request with preventDefault().

<a id="fn-fetch-ts-fetchregistry-removeeventlistener"></a>
**`FetchRegistry.removeEventListener(type, callback)`** · method · L66–68

Removes a listener added with addEventListener.

<a id="fn-fetch-ts-fetchregistry-dispatch"></a>
**`FetchRegistry.#dispatch(type, detail)`** · method · L71–85

Calls the listeners with a cancelable event; false when one prevented it.

- **Calls:** [callListener](#fn-fetch-ts-calllistener)
- **Called by:** [FetchRegistry.#hookedFetch](#fn-fetch-ts-fetchregistry-hookedfetch)

<a id="fn-fetch-ts-fetchregistry-customfetch"></a>
**`FetchRegistry.#customFetch(resource, init)`** · method · L92–97

Not async: on the fast path the original promise is returned as is, with no wrapper promise, no URL object and no event. The registry exists once Tracking Block was first turned on (features/adblock/tracking-block.js); turned off again it has no listener, and every request takes this path. The cast block (features/block-webos-cast) does its own check without it.

- **Calls:** [core/log.js › isDebugEnabled](core.md#fn-log-js-isdebugenabled), [FetchRegistry.#hookedFetch](#fn-fetch-ts-fetchregistry-hookedfetch)

<a id="fn-fetch-ts-fetchregistry-hookedfetch"></a>
**`FetchRegistry.#hookedFetch(resource, init)`** · method, async · L103–133

The slow path: numbers and logs the request when diagnostics are on, lets the 'request' listeners see and cancel it (a cancelled one fails like a network error), then fetches.

- **Calls:** [core/log.js › isDebugEnabled](core.md#fn-log-js-isdebugenabled), [FetchRegistry.#dispatch](#fn-fetch-ts-fetchregistry-dispatch)
- **Called by:** [FetchRegistry.#customFetch](#fn-fetch-ts-fetchregistry-customfetch)

<a id="mod-resolve-command-ts"></a>

## hooks/resolve-command.ts

> Adapted from https://github.com/reisxd/TizenTube/blob/522f83cc012d5b1c75181b651e084a3afa280323/mods/resolveCommand.js

156 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/lang-settings-fix.ts](features.md#mod-lang-settings-fix-ts)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="fn-resolve-command-ts-resolvecommandregistry-resolvecommand"></a>
**`ResolveCommandRegistry.resolveCommand(command, extra)`** · method · L31–40

YouTube's resolveCommand, as replaced: the first hook whose key the command has handles it; any other command goes to the original.

<a id="fn-resolve-command-ts-resolvecommandregistry-constructor"></a>
**`ResolveCommandRegistry.constructor(hookTargetName)`** · method · L46–60

Replaces resolveCommand on the instance found under window._yttv[hookTargetName], keeping the original bound.

- **Calls:** [ResolveCommandRegistry.checkHookTarget](#fn-resolve-command-ts-resolvecommandregistry-checkhooktarget)
- **Called by:** [ResolveCommandRegistry.getInstance](#fn-resolve-command-ts-resolvecommandregistry-getinstance)
- **Hooks:** `hookTarget.instance.resolveCommand`

<a id="fn-resolve-command-ts-resolvecommandregistry-checkhooktarget"></a>
**`ResolveCommandRegistry.checkHookTarget(targetName)`** · method · L63–73

Whether window._yttv[targetName] is the object that owns resolveCommand.

- **Called by:** [ResolveCommandRegistry.constructor](#fn-resolve-command-ts-resolvecommandregistry-constructor), [ResolveCommandRegistry.findHookTarget](#fn-resolve-command-ts-resolvecommandregistry-findhooktarget)

<a id="fn-resolve-command-ts-resolvecommandregistry-findhooktarget"></a>
**`ResolveCommandRegistry.findHookTarget()`** · method · L79–89

The key under window._yttv that owns resolveCommand (it is minified and changes between YouTube versions), or null.

- **Calls:** [ResolveCommandRegistry.checkHookTarget](#fn-resolve-command-ts-resolvecommandregistry-checkhooktarget)
- **Called by:** [ResolveCommandRegistry.getHookTarget](#fn-resolve-command-ts-resolvecommandregistry-gethooktarget), [ResolveCommandRegistry.getHookTarget.poll](#fn-resolve-command-ts-resolvecommandregistry-gethooktarget-poll)

<a id="fn-resolve-command-ts-resolvecommandregistry-gethooktarget"></a>
**`ResolveCommandRegistry.getHookTarget()`** · method, async · L97–128

That key, waiting for YouTube to create it: polled with a doubling delay until POLL_TIMEOUT_MS.

- **Calls:** [ResolveCommandRegistry.findHookTarget](#fn-resolve-command-ts-resolvecommandregistry-findhooktarget), [ResolveCommandRegistry.getHookTarget.poll](#fn-resolve-command-ts-resolvecommandregistry-gethooktarget-poll)
- **Called by:** [ResolveCommandRegistry.getInstance](#fn-resolve-command-ts-resolvecommandregistry-getinstance)
- **Browser:** `setTimeout`

<a id="fn-resolve-command-ts-resolvecommandregistry-gethooktarget-poll"></a>
**`ResolveCommandRegistry.getHookTarget.poll()`** · arrow · L110–124

One look for the key; schedules the next with a doubled delay, or rejects past the deadline.

- **Calls:** [ResolveCommandRegistry.findHookTarget](#fn-resolve-command-ts-resolvecommandregistry-findhooktarget)
- **Called by:** [ResolveCommandRegistry.getHookTarget](#fn-resolve-command-ts-resolvecommandregistry-gethooktarget)
- **Browser:** `setTimeout`

<a id="fn-resolve-command-ts-resolvecommandregistry-getinstance"></a>
**`ResolveCommandRegistry.getInstance()`** · method · L134–150

The registry, once YouTube's resolveCommand exists; concurrent callers share one wait, and a timed-out wait is retried by the next call.

- **Calls:** [ResolveCommandRegistry.constructor](#fn-resolve-command-ts-resolvecommandregistry-constructor), [ResolveCommandRegistry.getHookTarget](#fn-resolve-command-ts-resolvecommandregistry-gethooktarget)
- **Called by:** [features/lang-settings-fix.ts (at load)](features.md#mod-lang-settings-fix-ts)

<a id="fn-resolve-command-ts-resolvecommandregistry-sethook"></a>
**`ResolveCommandRegistry.setHook(command, fn)`** · method · L153–155

Adds the hook for `command`; each command is hooked once (lang-settings-fix.ts).
