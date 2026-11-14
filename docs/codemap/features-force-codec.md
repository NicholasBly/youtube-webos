# Code map: features/force-codec/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/force-codec/codecs.js](#mod-codecs-js), [features/force-codec/format-filter.js](#mod-format-filter-js), [features/force-codec/hooks.js](#mod-hooks-js), [features/force-codec/index.js](#mod-index-js), [features/force-codec/log.js](#mod-log-js), [features/force-codec/state.js](#mod-state-js)

<a id="mod-codecs-js"></a>

## features/force-codec/codecs.js

> Codec recognition and policy: the names as they appear in MIME strings and format entries, what the current mode allows, and whether the platform can actually drive a codec.

96 lines · imports [features/force-codec/state.js](#mod-state-js) · imported by [features/force-codec/format-filter.js](#mod-format-filter-js), [features/force-codec/hooks.js](#mod-hooks-js), [features/force-codec/index.js](#mod-index-js)

<a id="fn-codecs-js-detectcodec"></a>
**`detectCodec(str)`** · function, exported · L37–42

The video codec named in a MIME or codec string, or null if not recognised.

- **Called by:** [features/force-codec/format-filter.js › entryCodec](#fn-format-filter-js-entrycodec), [features/force-codec/hooks.js › declines](#fn-hooks-js-declines)

<a id="fn-codecs-js-isvideomime"></a>
**`isVideoMime(type)`** · function, exported · L52–54

Whether a MIME string describes video.

This is the guard that keeps audio out of everything below. An audio type names no video codec, so without this check the "does not match the wanted codec" test would decline every audio SourceBuffer and playback would run silent.

- **Called by:** [features/force-codec/format-filter.js › entryCodec](#fn-format-filter-js-entrycodec), [features/force-codec/hooks.js › declines](#fn-hooks-js-declines)

<a id="fn-codecs-js-allowscodec"></a>
**`allowsCodec(codec)`** · function, exported · L65–69

Whether the current mode permits a given codec.

Deliberately does not consult `unsatisfiable`. That flag relaxes the capability probes, which are global and cannot be answered per video; the format lists have their own per-response guard in filterFormats(), so letting the flag reach here would mean a response was skipped whenever the previous one happened to lack the codec.

- **Called by:** [features/force-codec/format-filter.js › filterFormats](#fn-format-filter-js-filterformats), [features/force-codec/hooks.js › declines](#fn-hooks-js-declines)

<a id="fn-codecs-js-narrowing"></a>
**`narrowing()`** · function, exported · L72–74

Whether the capability probes should be narrowed right now.

- **Called by:** [features/force-codec/hooks.js › declines](#fn-hooks-js-declines), [features/force-codec/index.js › forceCodecActive](#fn-index-js-forcecodecactive)

<a id="fn-codecs-js-platformsupports"></a>
**`platformSupports(codec)`** · function, exported · L77–96

Ask the platform, through the untouched probe, whether a codec is real here.

- **Called by:** [features/force-codec/index.js › applyMode](#fn-index-js-applymode)

<a id="mod-format-filter-js"></a>

## features/force-codec/format-filter.js

> The server's offer: strips disallowed video renditions from the format lists of a player response, never emptying a list and never touching audio.

81 lines · imports [features/force-codec/state.js](#mod-state-js), [features/force-codec/codecs.js](#mod-codecs-js), [features/force-codec/log.js](#mod-log-js) · imported by [features/force-codec/hooks.js](#mod-hooks-js)

<a id="fn-format-filter-js-entrycodec"></a>
**`entryCodec(entry)`** · function · L8–12

The video codec of an adaptiveFormats/formats entry; null for audio.

- **Calls:** [features/force-codec/codecs.js › detectCodec](#fn-codecs-js-detectcodec), [features/force-codec/codecs.js › isVideoMime](#fn-codecs-js-isvideomime)
- **Called by:** [filterFormats](#fn-format-filter-js-filterformats)

<a id="fn-format-filter-js-filterformats"></a>
**`filterFormats(list)`** · function · L21–47

Strip disallowed video entries from one format list, in place.

Returns the number removed, or -1 when the list holds no rendition in the wanted codec. In that case nothing is removed: emptying the list would leave the player with no video at all.

- **Calls:** [features/force-codec/codecs.js › allowsCodec](#fn-codecs-js-allowscodec), [entryCodec](#fn-format-filter-js-entrycodec)
- **Called by:** [filterStreamingData](#fn-format-filter-js-filterstreamingdata)

<a id="fn-format-filter-js-filterstreamingdata"></a>
**`filterStreamingData(streaming)`** · function, exported · L58–81

Filter both format lists on a streamingData block.

The two lists are judged separately on purpose. `formats` holds the muxed progressive streams, which are AVC in practice and have no AV1 equivalent - judging them together with `adaptiveFormats` would either strip the progressive fallback away entirely or block the adaptive filtering that the user actually asked for.

- **Calls:** [filterFormats](#fn-format-filter-js-filterformats)
- **Called by:** [features/force-codec/hooks.js › filterParsedResponse](#fn-hooks-js-filterparsedresponse)

<a id="mod-hooks-js"></a>

## features/force-codec/hooks.js

> The capability hooks, installed once and gated on the mode: MediaSource .isTypeSupported and HTMLMediaElement#canPlayType; and the offer filter the shared JSON.parse hook (features/adblock/parse-hook.js) calls.

69 lines · imports [features/force-codec/state.js](#mod-state-js), [features/force-codec/codecs.js](#mod-codecs-js), [features/force-codec/format-filter.js](#mod-format-filter-js), [features/force-codec/log.js](#mod-log-js) · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/force-codec/index.js](#mod-index-js)

<a id="fn-hooks-js-declines"></a>
**`declines(type)`** · function · L10–14

Whether a capability question about `type` is answered no by the mode.

- **Calls:** [features/force-codec/codecs.js › allowsCodec](#fn-codecs-js-allowscodec), [features/force-codec/codecs.js › detectCodec](#fn-codecs-js-detectcodec), [features/force-codec/codecs.js › isVideoMime](#fn-codecs-js-isvideomime), [features/force-codec/codecs.js › narrowing](#fn-codecs-js-narrowing)
- **Called by:** [installHooks.HTMLMediaElement.prototype.canPlayType](#fn-hooks-js-installhooks-htmlmediaelement-prototype-canplaytype), [installHooks.MediaSource.isTypeSupported](#fn-hooks-js-installhooks-mediasource-istypesupported)

<a id="fn-hooks-js-installhooks"></a>
**`installHooks()`** · function, exported · L20–52

Installs the codec hooks once: MediaSource.isTypeSupported and canPlayType answer no for a codec the Force Video Codec setting declines.

- **Called by:** [features/force-codec/index.js › applyMode](#fn-index-js-applymode)
- **Hooks:** `MediaSource.isTypeSupported`, `HTMLMediaElement.prototype.canPlayType`

<a id="fn-hooks-js-installhooks-mediasource-istypesupported"></a>
**`installHooks.MediaSource.isTypeSupported(type)`** · assigned · L33–39

isTypeSupported that declines the codecs the setting rules out and asks the platform about the rest.

- **Calls:** [declines](#fn-hooks-js-declines)

<a id="fn-hooks-js-installhooks-htmlmediaelement-prototype-canplaytype"></a>
**`installHooks.HTMLMediaElement.prototype.canPlayType(type)`** · assigned · L47–50

canPlayType that answers '' for the declined codecs and asks the platform about the rest.

- **Calls:** [declines](#fn-hooks-js-declines)

<a id="fn-hooks-js-filterparsedresponse"></a>
**`filterParsedResponse(out)`** · function, exported · L58–69

The server's offer, in a parsed response: strips the renditions the mode refuses. Called from the shared JSON.parse hook while a codec is forced.

- **Calls:** [features/force-codec/format-filter.js › filterStreamingData](#fn-format-filter-js-filterstreamingdata)
- **Called by:** [features/adblock/parse-hook.js › filterResponse](features-adblock.md#fn-parse-hook-js-filterresponse)

<a id="mod-index-js"></a>

## features/force-codec/index.js

> Force Video Codec: the setting's switch, the codec hooks and the filter of the formats a player response offers. The comment below the imports explains the feature.

122 lines · imports [core/config.js](core.md#mod-config-js), [ui/toast/index.js](ui-toast.md#mod-index-js), [features/force-codec/state.js](#mod-state-js), [features/force-codec/codecs.js](#mod-codecs-js), [features/force-codec/hooks.js](#mod-hooks-js), [features/force-codec/log.js](#mod-log-js) · imported by [userScript.js](app.md#mod-userscript-js)

<a id="fn-index-js-applymode"></a>
**`applyMode(interactive)`** · function · L68–107

Apply the stored setting.

@param {boolean} interactive true when the user just changed it, which is the only time there is a DOM to put a notification in and the only time a "reload to apply" message is worth showing.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [features/force-codec/codecs.js › platformSupports](#fn-codecs-js-platformsupports), [features/force-codec/hooks.js › installHooks](#fn-hooks-js-installhooks), [ui/toast/index.js › showNotification](ui-toast.md#fn-index-js-shownotification)
- **Called by:** [installCodecHooks](#fn-index-js-installcodechooks)
- **Settings:** reads `forceVideoCodec`

<a id="fn-index-js-installcodechooks"></a>
**`installCodecHooks()`** · function, exported · L112–117

Installs the capability hooks for the stored setting and follows its changes; idempotent.

- **Calls:** [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [applyMode](#fn-index-js-applymode)
- **Called by:** [userScript.js (at load)](app.md#mod-userscript-js)
- **Settings:** listens to `forceVideoCodec`

<a id="fn-index-js-forcecodecactive"></a>
**`forceCodecActive()`** · function, exported · L120–122

The live mode, or null when nothing is narrowed: for tests/unit/force-codec-test.cjs.

- **Calls:** [features/force-codec/codecs.js › narrowing](#fn-codecs-js-narrowing)

<a id="mod-log-js"></a>

## features/force-codec/log.js

> The logger of the feature's modules: their messages carry [ForceCodec] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/force-codec/format-filter.js](#mod-format-filter-js), [features/force-codec/hooks.js](#mod-hooks-js), [features/force-codec/index.js](#mod-index-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-state-js"></a>

## features/force-codec/state.js

> What the force-codec modules share: the pinned modes and the mutable state on `fc`: the active mode, whether the hooks are in, the saved originals and the per-video fallback flag.

25 lines · imported by [features/adblock/parse-hook.js](features-adblock.md#mod-parse-hook-js), [features/force-codec/codecs.js](#mod-codecs-js), [features/force-codec/format-filter.js](#mod-format-filter-js), [features/force-codec/hooks.js](#mod-hooks-js), [features/force-codec/index.js](#mod-index-js)
