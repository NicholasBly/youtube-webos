/**
 * Webpack plugin: fail the build if a bare `require(` survives into an emitted
 * bundle.
 *
 * package.json sets "type": "module", so webpack treats every .js in src/ as
 * an ES module. Babel's sourceType:'unambiguous' classifies any file with no
 * import/export as a *script*, and @babel/plugin-transform-runtime then
 * injects its helpers as `require("@babel/runtime/helpers/...")`. That is a
 * free variable inside an ESM module, so the bundle dies at load with
 * "ReferenceError: require is not defined" - and nothing in the build reports
 * it, because webpack considers a free variable perfectly legal.
 *
 * This bit perf_mon.js (no imports, so it looked like a script). Any future
 * file without an import/export would hit it too. Adding `export {};` to such
 * a file is the fix.
 */
class AssertNoBareRequirePlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('AssertNoBareRequire', (compilation) => {
      // `__webpack_require__`, `n.require`, `.require(` etc. are fine; only a
      // bare identifier `require(` is a problem.
      const BARE_REQUIRE = /(?:^|[^.\w$])require\s*\(/;
      for (const [name, asset] of Object.entries(compilation.assets)) {
        if (!name.endsWith('.js')) continue;
        const source = asset.source();
        if (typeof source !== 'string') continue;
        const m = BARE_REQUIRE.exec(source);
        if (!m) continue;
        const at = m.index;
        compilation.errors.push(
          new Error(
            `[assert-no-bare-require] ${name} contains a bare require() at offset ${at}, ` +
              'which throws "require is not defined" at runtime.\n' +
              `  ...${source.slice(Math.max(0, at - 90), at + 90)}...\n` +
              '  Cause: a src/ file with no import/export is treated as a CommonJS script ' +
              "by Babel's sourceType:'unambiguous'. Add `export {};` to that file."
          )
        );
      }
    });
  }
}

module.exports = { AssertNoBareRequirePlugin };
