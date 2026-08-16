# youtube-webos — performance pass

Every change below was measured before and after on the same machine, and is
covered by a test in `bench/`. Run everything with:

```
npm install
bench/run-all.sh
```

---

## Build & size

| | before | after |
|---|---|---|
| legacy `userScript.js` | 346,294 B (117,312 gz) | **246,310 B (81,648 gz)** −29% |
| legacy `index.js` | 76,027 B | **8,735 B** −89% |
| modern `userScript.js` | 171,484 B | 170,531 B |
| modern `index.js` | 3,693 B | **1,254 B** −66% |

**core-js removed.** `babel-plugin-polyfill-corejs3` was pulling 386 modules
(~334 KiB) because core-js's compat data re-implements any built-in with *any*
spec deviation — Promise, Map, Set, Symbol, URL and most of Array.prototype
included — none of which matters here. `usage-pure` mode also rewrote every
`arr.slice(x)` into `_sliceInstanceProperty(arr).call(arr, x)`: a permanent
extra call and prototype lookup on the slowest hardware we support.

`src/polyfills.js` now hand-implements only what Chromium 38 genuinely lacks
*and* this codebase calls (~20 built-ins). All feature-detected, so on webOS 4+
it is a handful of `in` checks and nothing installs.

**`src/launch.js` split out of `utils.js`** so the launcher page no longer drags
in the page-state MutationObserver, the `<video>` cache, `COLOR_CODE_MAP` and a
`new KeyboardEvent()` probe just to build a redirect URL.

**`.browserslistrc`** no longer targets Safari 7/8 (webOS 1–2), which aren't
supported.

---

## Runtime

### JSON.parse filter chain
`for…in` instead of a per-node `Object.keys()` allocation, guards reordered
cheapest-first, forwarding closure removed, and the duplicate emoji walk of
every shelf tile eliminated.

On an 825 KB HOME_BROWSE payload (the size the webOS 3 capture actually saw),
with the same settings as that session, two passes each:

| | baseline | optimised |
|---|---|---|
| filtering overhead | +5.398 / +5.318 ms | **+2.221 / +2.475 ms** −59% |

### JSON.stringify hook
Was breadth-first searching every stringified object to depth 6 on every call —
the capture recorded 51.8 ms of overhead per 5 s with `"clones": 0`, i.e. it
found nothing every time. Now O(1) for the shape YouTube actually sends, with a
cheap `context` rejection otherwise: **3.16× → 1.00× native**.

### Emoji rewrite (`splitIntoRuns`) — correctness
The old code bailed out on text that already contained the sentinels, and the
caller's `null` branch then stripped them — so one pass was *destructive* and
only an accidental second walk made the output correct. Now idempotent: strip
first, then re-wrap from the cleaned text. Forged sentinels in a title are still
removed before anything is emitted.

### Spatial navigation
- The legacy polyfill had **no computed-style cache**; the modern shim did. The
  slow hardware was running the uncached version.
- `mapOfBoundRect` was armed only inside the polyfill's own keydown handler,
  which never runs (`ui.js` sets `keyMode = 'NONE'` and calls `navigate()`
  directly) — so every navigation that actually happened ran uncached.
- The `focusin` listener called `getBoundingClientRect()` on **every focus
  change in the whole app** — one forced layout per remote keypress — to
  maintain a fallback only read inside `navigate()`.

| one arrow press, 50-row settings panel | baseline | optimised |
|---|---|---|
| `getBoundingClientRect` | 415 | **83** −80% |
| `getComputedStyle` | 2,770 | **84** −97% |

| 30 focus moves on a YouTube shelf | baseline | optimised |
|---|---|---|
| panel closed | 30 forced layouts | **0** |
| panel open | 30 | 30 (still needed) |

Also fixed: direct callers never cleared `startingPoint`, so a `mouseup` from
before the panel opened could steer the panel's navigation from a stale screen
position.

### Thumbnail tracking (`thumbnail-quality.js`) — O(N²) forced layouts
Chromium 38 has no `IntersectionObserver`, so webOS 3/4 uses the polled
fallback in this file. Its `observe()` scheduled a **separate `setTimeout(0)`
check per element**, and every check walks the whole tracked set calling
`getBoundingClientRect()`. Mounting a browse response is one burst of hundreds
of `observe()` calls, so the checks interleave with tiles still mounting and
each one really does re-flush layout.

Also: `eachThumb()` ran `node.matches('ytlr-thumbnail-details, ytlr-surface-page,
thumbnail image')` on every element added anywhere under `<ytlr-app>`. The third
clause is a descendant combinator — matched right-to-left, then an ancestor walk
— the slowest shape the selector engine has. Two tag comparisons give the
identical answer, and `querySelectorAll` is now skipped entirely for leaf nodes.

| mounting 240 tiles across 12 shelves | baseline | optimised |
|---|---|---|
| `getBoundingClientRect` | 35,600 | **840** −97.6% |
| `matches()` | 12 | **0** |

Only affects users who enable Max Thumbnail Quality, and only on webOS 3/4.

### Dislike panel (`return-dislike.js`) — selector engine on every focus change
`handleFocusIn` is bound to `document` in capture phase for the whole watch
page, and called `e.target.closest('ytlr-structured-description-content-renderer')`
every time. `closest()` runs the selector engine at each level of the ancestor
chain.

| 40 focus moves, description panel closed | baseline | optimised |
|---|---|---|
| `closest()` | 40 | **0** |
| `matches()` | 760 (19 per keypress) | **0** |

Both selectors are trivial — one tag name, one `role` attribute — so hand-rolled
ancestor walks give the identical answer without touching the engine.

Also fixed here: `handleNavigation` gated only on `e.isTrusted === false`, which
on Chromium 38 can be `undefined` for events built via
`document.createEvent('KeyboardEvent')`. The mod's own synthetic UP/ENTER presses
(the OLED keep-alive, video-quality's control dismiss) could therefore move focus
inside the dislike panel. Now also checks the `SYNTHETIC_KEY_FLAG` marker that
`utils.sendKey` stamps.

### Dislike counter — late, and always zero (webOS 25 hardware)
Reported on an LG G4: opening the description panel showed nothing for ~2s, then
a dislike count of 0 on every video. Fine on the webOS 25 simulator and webOS 3
emulator, which is the tell — those have a fast, warm connection to the RYD API.

Two separate faults, both timing-dependent, which is why only real hardware hit
them:

1. `checkAndInjectDislike()` opened with `if (!this.dataReady) return`, so the
   factoid was not injected at all until the network came back. The panel
   finished rendering without it, and it only appeared later when some unrelated
   mutation or focus change happened to re-run the injection — the "couple of
   seconds late" symptom.
2. On any fetch failure the catch set `dislikesCount = 0` and left it there.
   There was no retry, and nothing could tell "the API said zero" from "the
   request failed" — so a single cold-start failure rendered a permanent 0.

Fixed by decoupling the two. The factoid is injected immediately with an em-dash
placeholder, `dislikesValue` stays `null` until a fetch genuinely succeeds
(failures are never cached), `updateDislikeDisplay()` fills the number in
whenever it lands, and a failed fetch now retries three times with a
1.2s/2.4s/3.6s backoff.

`bench/dislike-timing-test.cjs` covers it against a deliberately slow API, a
deliberately failing one, a healthy one, and a video whose real dislike count is
zero. On the pre-fix code the failing-API cases render `0` and never recover;
after, they show the placeholder and then the real number.

### Options panel opening
All four tab pages were built synchronously inside the keydown handler — 275
`createElement` calls, of which **205 (77%) belong to pages that are
`display:none` at that moment**. The capture showed this as a single 170.4 ms
handler and an fps drop from 60 to 32.

Only the Main page is built synchronously now; the rest are built one per
animation frame once the panel is on screen. `setActivePage()` forces a build
synchronously if you reach a tab first, so a fast tab press is never wrong.

| | baseline | optimised |
|---|---|---|
| `createElement` in the handler | 275 | **67** −76% |
| handler wall time | 62.6 ms | **22.2 ms** −65% |
| total panel elements | 267 | 267 (identical) |

---

## Fixes

**`perf_mon.js` crashed the whole bundle** with
`ReferenceError: require is not defined`. `package.json` sets `"type": "module"`,
so webpack treats every `.js` as ESM — but `perf_mon.js` had no import/export, so
Babel's `sourceType: 'unambiguous'` classified it as a CommonJS *script* and
`@babel/plugin-transform-runtime` injected its helper as
`require("@babel/runtime/helpers/typeof")`. Fixed with `export {};`, plus
`tools/assert-no-bare-require.cjs`, a webpack plugin that fails the build if a
bare `require(` ever reaches an emitted asset again.

**perf_mon hotkey moved off YELLOW.** YouTube's own UI claims that key, and
`screensaver-fix.js` synthesises a YELLOW press every 30 s during Shorts, which
would have flapped the cluster open and closed. It is now **0 pressed three
times within 1.5 s**. The first two presses pass through untouched, so anything
bound to `0` still works; only the third is consumed.

**Synthetic key detection hardened.** `evt.isTrusted` alone was unsafe: on
Chromium 38 events built via `document.createEvent('KeyboardEvent')` can report
it as `undefined`, and `undefined === false` is false — the guard would have
failed open. `sendKey()` now stamps an explicit marker on every key this mod
dispatches.

**`stopPropagation()` never blocked anything.** `ui.js` binds its shortcut router
on `document` in capture phase — the same node and phase as perf_mon — and
`stopPropagation()` does not stop listeners on the same node. Arrow keys pressed
with the diagnostics cluster open were also moving focus around the YouTube UI
behind it. Now uses `stopImmediatePropagation()`.

**Tracking Block vs Ad Blocking.** Tracking Block rides on the same hooks as Ad
Blocking and genuinely does nothing while Ad Blocking is off. Its checkbox is
now greyed out and disabled in that state, instead of looking armed but inert.

**Emoji fix decoupled from Ad Blocking.** Turning Ad Blocking off used to unhook
`JSON.parse` entirely, silently taking the emoji fix down with it. On webOS 3/4
that fix is what stops titles rendering as tofu boxes, and it has its own
setting. The hook is now installed whenever anything needs it.

**Modern build crashed on webOS 25** with
`TypeError: Cannot add property trackFocus, object is not extensible`.
`spatial-navigation.modern.js` seals its API object with `Object.seal()`, and
`ui.js` assigned a `trackFocus` property that only the *legacy* polyfill had.
Fixed by defining `trackFocus` on the modern shim's API object before it is
sealed, and by making every `window.__spatialNavigation__` write in `ui.js`
feature-checked (`setSpatialNav()`) so a sealed, absent, or future native
implementation degrades to "lose an optimisation" instead of "kill the bundle".

The suite only ever smoke-tested the legacy bundle, which is how this shipped.
`bench/modern-smoke.cjs` now loads the modern bundle in a webOS 23+ window and
is wired into `run-all.sh`; reverting either half of the fix makes it fail with
the reported message.

---

## Findings that turned out NOT to be problems

**The emoji observer is not looping.** The webOS 3 session showed 19,027
mutation records in 547 s and a steady ~30/sec on an idle home screen with
`domNodes` flat, which looks exactly like a runaway loop. Two tests say
otherwise: an untouched page converges to zero records, and driving 40
YouTube-style in-place text updates gives **1.00× amplification** — our writes
do not feed back. Those records are YouTube's own DOM churn (you launch with
`env_forceFullAnimation=1`), witnessed by an observer subscribed to `body` with
`subtree + childList + characterData`. Total cost: **70 ms across 547 s —
0.013% of the main thread.** Left alone deliberately.

`"processQueue x0"` in that report is an instrumentation blind spot, not
evidence — perf_mon reports `sourceSignatureFallback: true` and every
`emoji-font.js` function as `observable: false`. The `wrapped` count climbing
96 → 117 → 122 proves the queue drains.

**`watch.js keydownHandler 170.4 ms` was misattributed.** `showWatch` is
`false`, so `watch.js` registers no listeners at all; perf_mon matches by
source-signature hashing, which collides. The log ordering
(`[UI] Initializing Options Panel (Lazy Load)...` immediately before) identifies
it as the options panel build — now fixed above.

**`mousemove` (826 calls, 633 ms)** is the Magic Remote pointer
(`[WAM] fires webOSMouse event`), not this mod. The `25 ms` fast-interval warning
is attributed to YouTube's own bundle; nothing in `src/` runs an interval faster
than 200 ms.

---

## Still open

- `terser-webpack-plugin` is imported by `webpack.config.js` but missing from
  `package.json` — it currently resolves only via npm hoisting from webpack's
  own tree. One `npm install` topology change away from a broken build.
- Now removable from dependencies: `core-js-pure`, `@babel/runtime-corejs3`,
  `regenerator-runtime`, `babel-plugin-polyfill-corejs3`,
  `babel-plugin-polyfill-regenerator`. Left in place so this drop is testable
  without a lockfile change.
- `@webos-tools/cli` is 119 MB of the 268 MB `node_modules`, used only by the
  `package`/`deploy`/`launch` scripts.
- **`sponsorblock.js` deliberately untouched.** It is the most carefully
  optimised of the three already: batched layout reads, signature-gated style
  writes, anchor caching, a 500 ms throttle on the `timeupdate` sync, binary
  search over segments, bounded retries. One thing looks worth a second look —
  the *mutation-driven* `checkForProgressBar() -> _syncOverlayPosition()` path
  has no time throttle, unlike the `timeupdate` path, so a progress bar that
  churns during playback could drive four layout reads per frame. I could not
  get the overlay to draw in the jsdom harness (segments never arrive), so this
  is unverified, and changing a 1,536-line playback module on a hunch is exactly
  what the rest of this pass avoided. It needs a device capture with
  SponsorBlock enabled on a video that has segments.