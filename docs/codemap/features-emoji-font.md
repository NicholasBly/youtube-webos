# Code map: features/emoji-font/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [features/emoji-font/index.js](#mod-index-js), [features/emoji-font/log.js](#mod-log-js), [features/emoji-font/observer.js](#mod-observer-js), [features/emoji-font/text-nodes.js](#mod-text-nodes-js), [features/emoji-font/tokenize.js](#mod-tokenize-js)

<a id="mod-index-js"></a>

## features/emoji-font/index.js

> Legacy Emoji Fix (webOS 3 and 4): swaps the emoji the adblock text pass wrapped in sentinel characters for twemoji images. This file follows the setting and the page.

41 lines · imports [core/webos.js](core.md#mod-webos-js), [core/config.js](core.md#mod-config-js), [features/emoji-font/observer.js](#mod-observer-js) · imported by [userScript.js](app.md#mod-userscript-js)

**At load:**

- **Calls:** [core/webos.js › getWebOSVersion](core.md#fn-webos-js-getwebosversion), [linkNotoFonts](#fn-index-js-linknotofonts), [features/emoji-font/observer.js › manageObserverState](#fn-observer-js-manageobserverstate), [core/config.js › configAddChangeListener](core.md#fn-config-js-configaddchangelistener), [features/emoji-font/observer.js › flushQueue](#fn-observer-js-flushqueue)
- **Settings:** listens to `enableLegacyEmojiFix`
- **Events:** listens to `ytaf-page-update`

<a id="fn-index-js-linknotofonts"></a>
**`linkNotoFonts()`** · function · L19–24

Links Google's Noto Sans Arabic and Math stylesheet, the fonts emoji-font.css falls back to for characters webOS 3/4 cannot draw.

- **Called by:** [at load](#mod-index-js)

<a id="mod-log-js"></a>

## features/emoji-font/log.js

> The logger of the feature's modules: their messages carry [EmojiFont] (core/log.js).

4 lines · imports [core/log.js](core.md#mod-log-js) · imported by [features/emoji-font/observer.js](#mod-observer-js), [features/emoji-font/text-nodes.js](#mod-text-nodes-js)

**At load:**

- **Calls:** [core/log.js › createLogger](core.md#fn-log-js-createlogger)

<a id="mod-observer-js"></a>

## features/emoji-font/observer.js

> The MutationObserver that feeds the queue, armed and disarmed by the Legacy Emoji Fix setting.

97 lines · imports [core/config.js](core.md#mod-config-js), [features/emoji-font/tokenize.js](#mod-tokenize-js), [features/emoji-font/text-nodes.js](#mod-text-nodes-js), [features/emoji-font/log.js](#mod-log-js) · imported by [features/emoji-font/index.js](#mod-index-js)

**At load:**

- **Calls:** [features/emoji-font/text-nodes.js › dropStaleRender](#fn-text-nodes-js-dropstalerender), [features/emoji-font/text-nodes.js › queueTextNode](#fn-text-nodes-js-queuetextnode), [features/emoji-font/text-nodes.js › scanElement](#fn-text-nodes-js-scanelement), [features/emoji-font/text-nodes.js › processQueue](#fn-text-nodes-js-processqueue)
- **Browser:** `MutationObserver`, `requestAnimationFrame`

<a id="fn-observer-js-manageobserverstate"></a>
**`manageObserverState()`** · function, exported · L69–92

Starts the emoji observer (and scans the page once) while the Emoji + Characters Fix is on; stops it and clears its queues when it is turned off.

- **Calls:** [core/config.js › configRead](core.md#fn-config-js-configread), [features/emoji-font/text-nodes.js › processQueue](#fn-text-nodes-js-processqueue), [features/emoji-font/text-nodes.js › scanElement](#fn-text-nodes-js-scanelement)
- **Called by:** [features/emoji-font/index.js (at load)](#mod-index-js)
- **Settings:** reads `enableLegacyEmojiFix`
- **Browser:** `requestAnimationFrame`

<a id="fn-observer-js-flushqueue"></a>
**`flushQueue()`** · function, exported · L95–97

Drops the queued nodes on a heavy UI transition, while the observer is armed.

- **Called by:** [features/emoji-font/index.js (at load)](#mod-index-js)

<a id="mod-text-nodes-js"></a>

## features/emoji-font/text-nodes.js

> Text nodes: which ones qualify, the queue drained once per frame, and the in-place replacement of a wrapped emoji run with its rendered span.

187 lines · imports [features/emoji-font/tokenize.js](#mod-tokenize-js), [core/selectors.js](core.md#mod-selectors-js), [features/emoji-font/log.js](#mod-log-js) · imported by [features/emoji-font/observer.js](#mod-observer-js)

**At load:**

- **Selectors:** `TEXT_HOST_TAGS`

<a id="fn-text-nodes-js-dropstalerender"></a>
**`dropStaleRender(node)`** · function, exported · L24–33

A characterData record for `node`: drops a render the app has since rewritten.

- **Called by:** [features/emoji-font/observer.js (at load)](#mod-observer-js)

<a id="fn-text-nodes-js-queuetextnode"></a>
**`queueTextNode(node)`** · function, exported · L42–52

Queues a text node for rendering when it holds a wrapped emoji and sits in an element where emoji are drawn.

- **Called by:** [features/emoji-font/observer.js (at load)](#mod-observer-js), [scanElement](#fn-text-nodes-js-scanelement)

<a id="fn-text-nodes-js-processqueue"></a>
**`processQueue()`** · function, exported · L55–62

Renders every queued text node (once per animation frame).

- **Calls:** [processTextNode](#fn-text-nodes-js-processtextnode)
- **Called by:** [features/emoji-font/observer.js (at load)](#mod-observer-js), [features/emoji-font/observer.js › manageObserverState](#fn-observer-js-manageobserverstate)

<a id="fn-text-nodes-js-tokensfor"></a>
**`tokensFor(cleanEmoji)`** · function · L65–81

The tokens of one emoji run, through the parse cache.

- **Calls:** [features/emoji-font/tokenize.js › tokenizeEmoji](#fn-tokenize-js-tokenizeemoji)
- **Called by:** [processTextNode](#fn-text-nodes-js-processtextnode)

<a id="fn-text-nodes-js-hasemojiimage"></a>
**`hasEmojiImage(tokens)`** · function · L84–89

"twemoji changed something" == "at least one img token".

- **Called by:** [processTextNode](#fn-text-nodes-js-processtextnode)

<a id="fn-text-nodes-js-renderrun"></a>
**`renderRun(node, parent, tokens, cleanEmoji, created)`** · function · L95–110

Renders the run `node` holds into the span an earlier pass put after it, or into a new one (added to `created`); the node's own text is emptied.

- **Calls:** [features/emoji-font/tokenize.js › renderTokens](#fn-tokenize-js-rendertokens)
- **Called by:** [processTextNode](#fn-text-nodes-js-processtextnode)

<a id="fn-text-nodes-js-processtextnode"></a>
**`processTextNode(textNode)`** · function · L116–161

Splits a text node around each wrapped emoji and replaces the emoji with its twemoji image (and a hidden text twin).

- **Calls:** [hasEmojiImage](#fn-text-nodes-js-hasemojiimage), [renderRun](#fn-text-nodes-js-renderrun), [tokensFor](#fn-text-nodes-js-tokensfor)
- **Called by:** [processQueue](#fn-text-nodes-js-processqueue)

<a id="fn-text-nodes-js-scanelement"></a>
**`scanElement(el)`** · function, exported · L167–187

Queues every text node of an added element that holds a wrapped emoji; elements where emoji are not drawn are skipped.

- **Calls:** [queueTextNode](#fn-text-nodes-js-queuetextnode)
- **Called by:** [features/emoji-font/observer.js (at load)](#mod-observer-js), [features/emoji-font/observer.js › manageObserverState](#fn-observer-js-manageobserverstate)
- **Selectors:** `APP_ROOT`

<a id="mod-tokenize-js"></a>

## features/emoji-font/tokenize.js

> From a wrapped emoji to twemoji image tokens, and from tokens to DOM: plain data in between, so nothing that arrived in a video title can become markup.

72 lines · npm `@twemoji/api` · imported by [features/emoji-font/observer.js](#mod-observer-js), [features/emoji-font/text-nodes.js](#mod-text-nodes-js)

<a id="fn-tokenize-js-twemojioptions-callback"></a>
**`twemojiOptions.callback(icon)`** · property · L10–12

The twemoji image URL of an emoji code (the 16.0.1 set on cdnjs, which must match @twemoji/api).

<a id="fn-tokenize-js-tokenizeemoji"></a>
**`tokenizeEmoji(cleanEmoji)`** · function, exported · L22–42

@returns {Array&lt;{text?: string, src?: string, alt?: string, cls?: string}>}

- **Called by:** [features/emoji-font/text-nodes.js › tokensFor](#fn-text-nodes-js-tokensfor)

<a id="fn-tokenize-js-rendertokens"></a>
**`renderTokens(target, tokens)`** · function, exported · L48–72

Fills `target` with the tokens: text as text nodes, each emoji as an &lt;img> with a hidden text twin for search and accessibility.

- **Called by:** [features/emoji-font/text-nodes.js › renderRun](#fn-text-nodes-js-renderrun)
