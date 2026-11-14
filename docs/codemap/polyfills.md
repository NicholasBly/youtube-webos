# Code map: polyfills/

Part of the [code map](../CODEMAP.md), generated from the source by `tools/codemap.mjs`: do not edit it by hand.

Modules: [polyfills/array.js](#mod-array-js), [polyfills/define.js](#mod-define-js), [polyfills/dom.js](#mod-dom-js), [polyfills/object.js](#mod-object-js), [polyfills/polyfills.js](#mod-polyfills-js), [polyfills/string.js](#mod-string-js), [polyfills/url-search-params.js](#mod-url-search-params-js)

<a id="mod-array-js"></a>

## polyfills/array.js

> Array: from (Chrome 45), find and findIndex (45).

46 lines · imports [polyfills/define.js](#mod-define-js) · imported by [polyfills/polyfills.js](#mod-polyfills-js)

**At load:**

- **Calls:** [polyfills/define.js › def](#fn-define-js-def)

<a id="mod-define-js"></a>

## polyfills/define.js

> The one way every polyfill below is installed.

14 lines · imported by [polyfills/array.js](#mod-array-js), [polyfills/object.js](#mod-object-js), [polyfills/string.js](#mod-string-js)

<a id="fn-define-js-def"></a>
**`def(target, name, value)`** · function, exported · L6–14

Non-enumerable install, matching how the engine defines built-ins. A plain assignment on a prototype would make the method visible to for-in loops over arrays/strings and could break unrelated YouTube code.

- **Called by:** [polyfills/array.js (at load)](#mod-array-js), [polyfills/object.js (at load)](#mod-object-js), [polyfills/string.js (at load)](#mod-string-js)

<a id="mod-dom-js"></a>

## polyfills/dom.js

> DOM polyfills for Chromium 38: Element#closest, Node#isConnected, and iteration over NodeList, HTMLCollection and friends.

114 lines · imported by [polyfills/polyfills.js](#mod-polyfills-js)

**At load:**

- **Hooks:** `Element.prototype.closest`, `Node.prototype.isConnected`, `NodeList.prototype.forEach`

<a id="fn-dom-js-element-prototype-closest"></a>
**`Element.prototype.closest(s)`** · assigned · L7–14

Element.closest for engines without it (Chromium 38).

<a id="mod-object-js"></a>

## polyfills/object.js

> Object statics: assign (Chrome 45), entries and values (Chrome 54).

33 lines · imports [polyfills/define.js](#mod-define-js) · imported by [polyfills/polyfills.js](#mod-polyfills-js)

**At load:**

- **Calls:** [polyfills/define.js › def](#fn-define-js-def)

<a id="mod-polyfills-js"></a>

## polyfills/polyfills.js

> Legacy webOS (Chromium 38 / webOS 3) polyfills.
>
> This file replaces core-js. core-js's compat data considers Chromium 38 to need 386 modules (~334 KiB of source) because it re-implements any built-in with \*any\* spec deviation - Promise, Map, Set, Symbol, URL and most of Array.prototype included. None of those deviations affect this app, and `usage-pure` mode also rewrites every `arr.slice(...)` call site into `_sliceInstanceProperty(arr).call(arr, ...)`, which costs a function call and a property lookup on every invocation, forever, on every device.
>
> So we ship only what Chromium 38 genuinely does not have and this codebase genuinely calls, with one deliberate exception: iteration over DOM collections (dom.js), kept as a guard. Everything is feature-detected: on webOS 4 (Chromium 53) Object.entries, Object.values and Node#isConnected are still installed, on webOS 5 and 6 nothing is.
>
> The comment on each entry is the first Chrome version shipping it. tests/unit/polyfill-conformance-test.cjs differentially tests every one of these against the platform-native implementation.
>
> If you use a newer built-in in src/, add it to the matching group: define.js            the non-enumerable installer the groups share dom.js               Element#closest, Node#isConnected, iterable collections object.js            Object.assign, entries, values array.js             Array.from, find, findIndex string.js            startsWith url-search-params.js URLSearchParams and url.searchParams

35 lines · imports [polyfills/dom.js](#mod-dom-js), [polyfills/object.js](#mod-object-js), [polyfills/array.js](#mod-array-js), [polyfills/string.js](#mod-string-js), [polyfills/url-search-params.js](#mod-url-search-params-js) · imported by [core/launch.js](core.md#mod-launch-js), [userScript.js](app.md#mod-userscript-js)

<a id="mod-string-js"></a>

## polyfills/string.js

> String: startsWith (Chrome 41). The other ES2015+ string methods are not called anywhere in the bundle, so they are not installed.

9 lines · imports [polyfills/define.js](#mod-define-js) · imported by [polyfills/polyfills.js](#mod-polyfills-js)

**At load:**

- **Calls:** [polyfills/define.js › def](#fn-define-js-def)

<a id="mod-url-search-params-js"></a>

## polyfills/url-search-params.js

> URLSearchParams and url.searchParams (Chrome 49/51), urlencoded serialiser only.

276 lines · imported by [polyfills/polyfills.js](#mod-polyfills-js)

**At load:**

- **Calls:** [urlLacksSearchParams](#fn-url-search-params-js-urllackssearchparams), [wireURLSearchParams](#fn-url-search-params-js-wireurlsearchparams)

<a id="fn-url-search-params-js-serialise"></a>
**`serialise(value)`** · function · L27–31

Encodes a name or value as application/x-www-form-urlencoded (spaces as +).

- **Called by:** [USP.prototype.toString](#fn-url-search-params-js-usp-prototype-tostring)

<a id="fn-url-search-params-js-deserialise"></a>
**`deserialise(value)`** · function · L36–44

Decodes a name or value (+ as a space); a malformed escape keeps its raw text, as browsers do.

- **Called by:** [USP](#fn-url-search-params-js-usp)

<a id="fn-url-search-params-js-usp"></a>
**`USP(init)`** · function · L50–83

URLSearchParams for Chromium 38: from a query string, another instance, an array of pairs or an object.

- **Calls:** [deserialise](#fn-url-search-params-js-deserialise)

<a id="fn-url-search-params-js-usp-prototype-changed"></a>
**`USP.prototype._changed()`** · assigned · L86–88

Tells the URL this instance belongs to (url.searchParams) that the parameters changed.

<a id="fn-url-search-params-js-usp-prototype-append"></a>
**`USP.prototype.append(name, value)`** · assigned · L91–94

Adds a pair, after the existing ones.

<a id="fn-url-search-params-js-usp-prototype-getall"></a>
**`USP.prototype.getAll(name)`** · assigned · L97–104

Every value of `name`, in order.

<a id="fn-url-search-params-js-usp-prototype-has"></a>
**`USP.prototype.has(name)`** · assigned · L107–109

Whether `name` is present.

<a id="fn-url-search-params-js-usp-prototype-get"></a>
**`USP.prototype.get(name)`** · assigned · L112–118

The first value of `name`, or null.

<a id="fn-url-search-params-js-usp-prototype-set"></a>
**`USP.prototype.set(name, value)`** · assigned · L121–139

Spec: replace the first occurrence in place, drop the rest.

<a id="fn-url-search-params-js-usp-prototype-delete"></a>
**`USP.prototype['delete'](name)`** · assigned · L142–150

Removes every pair named `name`.

<a id="fn-url-search-params-js-usp-prototype-sort"></a>
**`USP.prototype.sort()`** · assigned · L154–166

Spec: by name in UTF-16 code units, equal names kept in their order. Chromium 38's sort is not stable, so the position breaks the ties.

<a id="fn-url-search-params-js-pairiterator"></a>
**`pairIterator(params, pick)`** · function · L171–189

An iterator over the pairs, live as the native one, giving `pick(name, value)`.

- **Called by:** [USP.prototype.entries](#fn-url-search-params-js-usp-prototype-entries), [USP.prototype.keys](#fn-url-search-params-js-usp-prototype-keys), [USP.prototype.values](#fn-url-search-params-js-usp-prototype-values)

<a id="fn-url-search-params-js-pairiterator-iterator-next"></a>
**`pairIterator.iterator.next()`** · property · L175–180

The next pair, as `pick` shapes it, or done.

<a id="fn-url-search-params-js-pairiterator-iterator-symbol-iterator"></a>
**`pairIterator.iterator[Symbol.iterator]()`** · assigned · L184–186

The iterator is its own iterable (for...of).

<a id="fn-url-search-params-js-usp-prototype-keys"></a>
**`USP.prototype.keys()`** · assigned · L192–196

An iterator of the names.

- **Calls:** [pairIterator](#fn-url-search-params-js-pairiterator)

<a id="fn-url-search-params-js-usp-prototype-values"></a>
**`USP.prototype.values()`** · assigned · L199–203

An iterator of the values.

- **Calls:** [pairIterator](#fn-url-search-params-js-pairiterator)

<a id="fn-url-search-params-js-usp-prototype-entries"></a>
**`USP.prototype.entries()`** · assigned · L206–210

An iterator of [name, value] pairs.

- **Calls:** [pairIterator](#fn-url-search-params-js-pairiterator)

<a id="fn-url-search-params-js-usp-prototype-foreach"></a>
**`USP.prototype.forEach(cb, thisArg)`** · assigned · L215–219

Calls `cb(value, name, params)` for every pair, in order.

<a id="fn-url-search-params-js-usp-prototype-tostring"></a>
**`USP.prototype.toString()`** · assigned · L222–228

The parameters as a query string, without the leading ?.

- **Calls:** [serialise](#fn-url-search-params-js-serialise)

<a id="fn-url-search-params-js-urllackssearchparams"></a>
**`urlLacksSearchParams()`** · function · L231–238

Whether `new URL()` lacks url.searchParams: Chromium 38 has URL without it (Chrome 51).

- **Called by:** [at load](#mod-url-search-params-js)

<a id="fn-url-search-params-js-wireurlsearchparams"></a>
**`wireURLSearchParams(SearchParams)`** · function · L245–272

url.searchParams over `SearchParams`, wired to url.search in both directions: a change of the params writes url.search, and url.search written since the last read (or href) gives the same object the new query.

- **Called by:** [at load](#mod-url-search-params-js)
- **Hooks:** `window.URL.prototype.searchParams`

<a id="fn-url-search-params-js-wireurlsearchparams-sp-onchange"></a>
**`wireURLSearchParams.sp._onChange(str)`** · assigned · L254–257

Writes a change of url.searchParams back into the URL's search.
