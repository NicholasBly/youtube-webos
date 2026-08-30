/**
 * Babel config for the legacy (webOS 3+) build.
 *
 * Deliberately does NOT use babel-plugin-polyfill-corejs3. See the header of
 * src/polyfills.js for the reasoning: core-js considers Chromium 38 to need
 * 386 modules (~334 KiB) because it re-implements every built-in with any spec
 * deviation, and `usage-pure` mode additionally rewrites every `arr.slice(x)`
 * call site into `_sliceInstanceProperty(arr).call(arr, x)` — permanent runtime
 * overhead on the slowest devices we support.
 *
 * src/polyfills.js hand-implements the ~20 built-ins Chromium 38 actually
 * lacks and this codebase actually uses. It is imported at the top of utils.js,
 * which every feature module imports, so ordering is guaranteed.
 *
 * regenerator: async/await is lowered to generators by preset-env and then to
 * a state machine by @babel/runtime's regenerator helper (a single shared
 * module), rather than by the pure-mode plugin which duplicates the import in
 * every file that awaits.
 */

/** @type {import('@babel/core').ConfigFunction} */
function makeConfig(api) {
  api.cache.forever();

  return {
    // Fixes "TypeError: __webpack_require__(...) is not a function"
    // https://github.com/webpack/webpack/issues/9379#issuecomment-509628205
    sourceType: 'unambiguous',
    // https://babel.dev/docs/assumptions
    assumptions: {
      noNewArrows: true
    },
    plugins: [
      ['@babel/plugin-transform-typescript', { strictMode: true }],
      // Dedupe Babel's helper functions into a shared runtime instead of
      // re-emitting them per module.
      ['@babel/plugin-transform-runtime', {}]
    ],
    presets: [
      [
        '@babel/preset-env',
        {
          bugfixes: true,
          modules: false,
          useBuiltIns: false
        }
      ]
    ]
  };
}

export default makeConfig;
