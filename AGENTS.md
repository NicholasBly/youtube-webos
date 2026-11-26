# AGENTS.md

The entry point for an AI agent (or a new contributor) working on this
repository. Short on purpose: it says what to run, what not to break and
where the real documentation is.

## What this is

YouTube AdFree for LG webOS TVs: a user script injected into YouTube's TV
site (`https://www.youtube.com/tv`) that blocks ads, skips sponsored
segments, shows dislikes and tweaks the UI. It runs on TVs from 2016 on:
webOS 3 is Chromium 38 (ES5, V8 3.28, about 1 GB of RAM). **Performance on
that hardware is a feature**, and most rules below exist because of it.

## Read first

| For | Read |
| --- | --- |
| How it is put together: the two builds, boot order, the hooks, the rules for old TVs | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Every module and function, what calls what, which settings, events, selectors and hooks each touches | [docs/CODEMAP.md](docs/CODEMAP.md), one page per folder in `docs/codemap/`, the same as JSON in `docs/codemap.json` (generated) |
| Which combinations of fields are legal in the handlers, timers and observers | [docs/STATE-MACHINES.md](docs/STATE-MACHINES.md) |
| What the hot paths cost, how to prove a change is faster, what was already tried | [docs/PERFORMANCE.md](docs/PERFORMANCE.md) |
| Dependencies and how to update them | [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) |

## Commands

```sh
npm ci                                   # Node 22.22+ or 24.15+
npm test                                 # everything: format, lint, types, code map, both builds, every test (about 2 min)
npm run test:quick                       # the unit tests, then the webOS 22+ build and its tests
node tests/run-all.mjs --only=sponsor    # the test scripts whose name contains "sponsor", with the build they need
node tests/unit/core-config-test.cjs     # one unit test (needs no build)
node tests/behaviour/dearrow-test.cjs dist/webOSUserScripts/userScript.js legacy   # one behaviour test on a built bundle
npm run build                            # the legacy bundle (webOS 3 to 6) into dist/
npm run build:modern                     # the webOS 22+ bundle into dist/ (the builds share dist/)
npm run codemap                          # regenerate docs/CODEMAP.md, docs/codemap/, docs/codemap.json
npm run format                           # prettier --write
npm run bench                            # the hook, response and panel benchmarks
```

A change is done when `npm test` ends with `all steps passed`.

## Rules that are easy to break

1. **Two builds from one source.** `webpack.config.js` `resolve.alias` swaps
   modules per build (`*-absent.js` stand-ins). Check the alias table in
   ARCHITECTURE.md before assuming a module is in a bundle. A change to
   shared code is tested on both flavours.
2. **The legacy build is ES5 on Chromium 38.** No options object for
   `addEventListener` (it reads as `useCapture: true`), no `{ once: true }`.
   `for...of`, spread, rest parameters and destructuring become helper
   calls: indexed loops and `arguments` on hot paths. What Chromium 38 lacks
   and the code uses is hand-written in `src/polyfills/` (no core-js): a new
   built-in needs a polyfill there and a case in
   `tests/unit/polyfill-conformance-test.cjs`.
3. **No `try` in a hot function** (V8 3.28 never optimises it): put it in a
   helper only the rare case reaches.
4. **Hot paths return early**, before any allocation or DOM query. The hot
   paths are the `JSON.parse` and `JSON.stringify` hooks, focus and key
   listeners, SponsorBlock's time listener and frame loop, and observer
   callbacks.
5. **Ask the text before walking the tree.** A pass over a parsed response
   first checks with a native scan of the JSON text that there is anything
   for it to find (the table in ARCHITECTURE.md).
6. **YouTube's markup lives in one table**, `src/core/selectors.js`. Read an
   entry, never call a method on one directly (the minifier then keeps the
   whole table).
7. **Every function has a comment right above it** saying what it does: that
   comment is its entry in the code map, and `npm test` fails on a function
   without one or on a map that is out of date (`npm run codemap`).
8. **Everything an instance registers goes in its disposables bag**
   (`src/core/disposables.js`) and `destroy()` undoes it.
9. **Settings** are declared in `src/core/config-options.js`; `configRead`
   throws on an unknown key. A hot path reads a snapshot (`flags.js`), not
   `configRead`.
10. **Imports name the file** (`./x.js`, `./dir/index.js`); lint rejects the
    rest. `console` is not used in `src/`: `createLogger` (`src/core/log.js`).

## State lives in plain fields

There is no state-machine library here on purpose. Before adding or changing
a field, a timer or an observer of a handler, read its machine in
docs/STATE-MACHINES.md and keep its rules. SponsorBlock's rules run in the
tests: `tests/harness/invariants.cjs` is checked after every event of every
SponsorBlock behaviour test, and a new field that can disagree with an old
one gets a rule there.

## Tests

- `tests/unit/` load source files directly into a `vm` context with the ESM
  syntax stripped (`tests/harness/sandbox.cjs`): an import becomes a global
  the test supplies, so a new import in a unit-tested module means a new
  global in its test.
- `tests/behaviour/` run a built bundle in jsdom (`tests/harness/page.cjs`),
  with a Chromium 38 profile for the legacy flavour. The bundle is the first
  argument, the flavour (`legacy`, `modern`, `webos6`) the second.
- Every script ends with `report.finish()`, which prints `N passed, M
  failed`; the runner fails a script that exits without that line.
- Write the test first and watch it fail. For a behaviour test, "before" is
  a bundle built before the change: run the new test against it (it must
  fail for the reason you expect), then against the new build.
- A change that should make something faster is shown with numbers from
  before and after (docs/PERFORMANCE.md, "Measuring a change"), and a change
  that should not alter behaviour with an equivalence check (the emoji
  prefilter is checked against the exact class on all 65536 code units).
- The tests cannot see wasted work. A counter on `window`
  (`__ytafAdblockStats`, `__ytafDeArrowStats`, `__ytafThumbStats`,
  `window.sponsorblock.barChecks`) is how a test, and the maintainer on the
  TV, can.

## Traps

- **jsdom is not a TV.** A CPU profile taken in the harness overstates
  global lookups and DOM access; Node's V8 is not V8 3.28. Trust removed
  work over faster work.
- **`dist/` is shared** by the two builds and emptied by each; `npm test`
  leaves the webOS 22+ bundle there.
- **The code map misses indirect calls** (`ACTIONS[name].run(video)`,
  `sb.skipToPreviousSegment()`): search for the name as well.
- **`src/vendor/`** is third-party code kept as written: not linted, not
  formatted, not to be restyled.
- **Markdown is not formatted by Prettier** (`.prettierignore`), and
  `docs/CODEMAP.md`, `docs/codemap/` and `docs/codemap.json` are generated:
  edit the source comments, not those files.
- **Non-ASCII in source** is written as `\uXXXX` escapes (the emoji classes,
  the sentinels), never as literal characters: several are invisible.
- **Commit titles on the `test` branch** like "0.8.5 build 2" trigger a test
  build and a pre-release (`.github/workflows/auto-discussion.yml`).
