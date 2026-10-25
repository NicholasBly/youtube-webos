# Dependencies

What every package in `package.json` is for, which of them end up on the TV,
how to update them without slowing the app down, and the security status.
Checked on 2026-10-24 (0.8.5).

## What runs on the TV

Only four npm packages are inside the bundles. Everything else is a build,
lint or test tool that runs on your computer, and only matters to the TV
through what it writes into the bundle.

| Package | In which build | What it does | Pinned |
| --- | --- | --- | --- |
| `whatwg-fetch` | legacy (webOS 3) | `fetch()` for Chromium 38, which has none | 3.6.20 |
| `@babel/runtime` | legacy | Babel's helpers (classes, private fields, for-of, async) | 8.0.7 |
| `@twemoji/api` | legacy (webOS 3/4) | Emoji images for the Emoji + Characters Fix | 16.0.1 |
| `tiny-sha256` | both | SponsorBlock's privacy hash of the video id | 1.0.2 |

They are pinned to exact versions on purpose: a routine `npm update` must not
change TV code without a decision. `@twemoji/api` stays on 16.0.1 because the
emoji image URLs it builds have to match the image set it loads (see 0.8.2 in
the changelog); move both together.

## Build and test tools (your computer only)

| Package | Used by |
| --- | --- |
| `webpack`, `webpack-cli` | `npm run build` |
| `babel-loader`, `@babel/core`, `@babel/preset-env`, `@babel/plugin-transform-runtime`, `@babel/plugin-transform-typescript` | Compiling `src/` for Chrome 38 (legacy) and Chrome 87 (webOS 22+), `babel.config.js` |
| `terser-webpack-plugin` | Minifying the bundles |
| `postcss`, `postcss-loader`, `autoprefixer`, `cssnano` | The stylesheets: `-webkit-` prefixes for old engines, minifying |
| `copy-webpack-plugin` | Copies `assets/` and `index.html` into `dist/` |
| `@webos-tools/cli` | `ares-package`, `ares-install`, `ares-launch`, `ares-inspect` |
| `eslint`, `@eslint/js`, `@typescript-eslint/parser`, `eslint-config-prettier`, `eslint-plugin-regexp`, `globals` | `npm run lint` |
| `prettier` | `npm run format` / `format:check` |
| `typescript` | `npm run typecheck` (6.0: the ESLint parser cannot read TypeScript 7 yet) |
| `jsdom`, `acorn` | The test suite (simulated webOS pages, bundle syntax checks) |

None of them is unused. Removed in 0.8.5 because nothing used them any more:
style-loader, css-loader, postcss-preset-env, postcss-load-config,
transform-async-modules-webpack-plugin, husky, lint-staged,
@stylistic/eslint-plugin and four `@types` packages.

## Why updating once made the app slow (0.6.2 / 0.6.3)

The 0.6.3 lockfile changed only build tools, but one of them was
`core-js-compat` 3.46 → 3.47. Builds then used `babel-plugin-polyfill-corejs3`
in `usage-pure` mode, and core-js 3.47 started treating `JSON.parse` as
missing a feature (reading the source text of a value) on every TV engine. So
Babel replaced the `JSON.parse` the ad-block hook saved as "the original" with
core-js's polyfill (`core-js-pure/modules/es.json.parse.js`).

That polyfill calls the real parser only when the engine passes core-js's
Symbol check, which deliberately fails on V8 older than 4.1. webOS 3 TVs run
Chromium 38 (V8 3.28), so there every YouTube response was parsed by core-js's
parser written in JavaScript: 13 times slower than the native one on a 656 KB
response even on a fast PC with a modern JIT, and much worse on a 2016 TV. That
is why only some users saw it. 0.6.4 reverted the lockfile.

Reproduced by building both commits from history (36e08e5, a17d392): the
0.6.3 bundle contains `es.json.parse.js` and its hook reads `origParse` from
that module; the 0.6.4 bundle reads the native `JSON.parse`.

It cannot happen this way any more: 0.8.3 removed core-js entirely, and
`babel.config.js` uses no polyfill plugin (the legacy polyfills are
hand-written in `src/polyfills/`).

## Updating safely

1. `npm run bundle:snapshot` (builds both flavours into a temp folder and
   remembers what they contain)
2. Update: `npm update`, `npm install <pkg>@latest`, `npm audit fix`, ...
3. `npm run bundle:compare`

"identical" means the update cannot change anything on the TV. "CHANGED" lists
the modules that were added, removed or resized, npm packages first: that is
where a 0.6.3-style problem shows up. Then run `npm test` and try the legacy
build on webOS 3 before releasing.

Example from 2026-10-24: `npm update` (all in range) took `@babel/runtime`
8.0.7 → 8.0.8, and the compare showed the legacy bundle changed: the array
destructuring helper lost its plain-array shortcut and now goes through
`iterableToArrayLimit`, a function with try/catch/finally that webOS 3's engine
does not optimise. Here it only touches start-up code (all six array
destructurings in `src/` are in config loading and the panel build), but it is
the kind of change to look at before a release.

## Security (npm audit, 2026-10-24)

- 0.8.4's lockfile: 49 findings. 0.8.5's: 6 (after `npm audit fix`, which
  changed fast-uri and serialize-javascript and left both bundles
  byte-identical).
- All 6 are inside `@webos-tools/cli`, which pins its own dependencies with a
  shrinkwrap file: body-parser, proxy-addr, qs (its Express server, used by
  `ares-inspect`/`ares-server`), js-yaml and brace-expansion. npm cannot
  override a shrinkwrapped package; only LG can, with a new release.
  `npm audit fix --force` would downgrade the CLI to 3.2.3, which is worse.
  They run only on your computer, during development.
- No package that ships to the TV has a known vulnerability.
- Install scripts: only `@webos-tools/cli` and two of its own dependencies
  (ssh2, cpu-features: an optional native SSH binding). CI installs with
  `npm ci --ignore-scripts`. Locally `npm ci --ignore-scripts` works the same
  for building and testing.
- `npm audit signatures` verifies the registry signatures of everything
  installed; run it on your computer after updating.
- The PHP "php2shell" vulnerabilities of October 2026 (CVE-2026-109618,
  CVE-2026-109619) affect PHP servers. Nothing in this project uses PHP.
