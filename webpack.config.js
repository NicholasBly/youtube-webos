import CopyPlugin from 'copy-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const requireCjs = createRequire(import.meta.url);
const { AssertNoBareRequirePlugin } = requireCjs('./tools/assert-no-bare-require.cjs');

/** @type {(env: Record<string, string>) => (import('webpack').Configuration)[]} */
const makeConfig = (env) => {
  const isModern = env && env.modern;
  // Dev-only instrumentation; see src/dev/perf-mon.js. Off unless `--env perf`.
  const withPerfMon = !!(env && env.perf);
  // The engine each build is for, as a browserslist query. Every tool that
  // asks browserslist (autoprefixer, cssnano, Babel's preset-env) reads it from
  // the environment, so the CSS and the JS aim at the same browser; one build
  // runs per process.
  const browsers = isModern ? 'chrome 87' : 'chrome 38';
  process.env.BROWSERSLIST = browsers;

  return [
    {
      target: isModern ? `browserslist:${browsers}` : ['web', 'es5'],
      // No eval-wrapped modules in build:dev either: the TV runs the bundle as is.
      devtool: false,
      // A fresh dist/ per build so nothing stale reaches the package, except
      // the packaged .ipk files: the release builds are kept in dist/ and the
      // webOS 22+ build script runs after the legacy one has packaged its own.
      output: { clean: { keep: /\.ipk$/ } },
      entry: {
        index: './src/index.js',
        userScript: {
          import: './src/userScript.js',
          filename: 'webOSUserScripts/[name].js'
        }
      },
      resolve: {
        // Each build without the other's modules: the legacy-only ones away
        // from the webOS 22+ bundle, the webOS 25 ones (which run that bundle)
        // away from the legacy one. A module imported by name gets a stand-in
        // with the same exports (*-absent.js); one imported for its side
        // effects maps to nothing.
        alias: Object.assign(
          withPerfMon ? {} : { [path.resolve(__dirname, 'src/dev/perf-mon.js')]: false },
          isModern
            ? {
                // Chrome 87 has fetch.
                'whatwg-fetch': false,

                // Chrome 87 has every built-in polyfills.js installs, so the whole
                // file is dead weight (and a pile of no-op feature checks) here.
                [path.resolve(__dirname, 'src/polyfills/polyfills.js')]: false,
                // Its stylesheet goes with it: index.js is its only importer.
                [path.resolve(__dirname, 'src/features/emoji-font/index.js')]: false,
                [path.resolve(__dirname, 'src/hooks/buffer-limit.js')]: false,
                [path.resolve(__dirname, 'src/features/adblock/emoji-wrap.js')]: path.resolve(
                  __dirname,
                  'src/features/adblock/emoji-wrap-absent.js'
                )
              }
            : {
                [path.resolve(__dirname, 'src/features/block-webos-cast.ts')]: path.resolve(
                  __dirname,
                  'src/features/block-webos-cast-absent.js'
                ),
                [path.resolve(__dirname, 'src/features/video-quality/kickstart.js')]: path.resolve(
                  __dirname,
                  'src/features/video-quality/kickstart-absent.js'
                )
              }
        )
      },
      module: {
        rules: [
          {
            test: /\.[jt]s$/i,
            loader: 'babel-loader',
            // Everything bundled from node_modules is ES5 already (twemoji,
            // whatwg-fetch, the Babel runtime helpers), so none of it goes
            // through Babel; bundle-check parses the legacy bundle as ES5 and
            // would catch a dependency that is not.
            exclude: /node_modules/,
            options: {
              cacheDirectory: true,
              // Both branches live in babel.config.js; this picks one.
              envName: isModern ? 'modern' : 'legacy'
            }
          },
          {
            test: /\.png$/i,
            type: 'asset/inline'
          },
          {
            test: /\.css$/i,
            use: [
              // Every stylesheet handed to src/core/styles.js, which puts them
              // in the page as one <style>, written once.
              path.resolve(__dirname, 'tools/css-collect-loader.cjs'),
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    plugins: [
                      // The engine's prefixes (-webkit-user-select, -webkit-appearance,
                      // -webkit-filter on Chromium 38), so the sources carry none.
                      'autoprefixer',
                      [
                        'cssnano',
                        {
                          preset: [
                            'default',
                            {
                              discardComments: { removeAll: true }
                            }
                          ]
                        }
                      ]
                    ]
                  }
                }
              }
            ]
          }
        ]
      },
      optimization: {
        // Everything else Terser does here is its production default.
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              // The perf build keeps function names, so perf-mon's registry
              // can name what runs; the release builds are unaffected.
              keep_fnames: withPerfMon,
              keep_classnames: withPerfMon,
              format: {
                comments: false,
                ascii_only: true
              },
              compress: {
                // Passes past two shrink the bundles by some 50 bytes and
                // lengthen the build.
                passes: 2,
                // A helper with one caller stays a declared function: inlined,
                // it became a function expression created on every call of
                // its caller, a closure per item on the filter and walk paths,
                // which Chromium 38's compiler does not optimise away.
                reduce_funcs: false,
                ecma: isModern ? 2020 : 5
              }
            },
            extractComments: false
          })
        ]
      },
      // Not the default: production mode warns past 244 KiB, advice for pages
      // loaded over a network. The app is installed on the TV and read from
      // its storage; tests/smoke/bundle-check.cjs holds each bundle to a budget.
      performance: {
        hints: false
      },
      plugins: [
        // Catches the "ReferenceError: require is not defined" failure mode at
        // build time instead of on the TV. See the plugin for the full story.
        new AssertNoBareRequirePlugin(),
        new CopyPlugin({
          patterns: [
            // icon.svg is the source the PNG icons are drawn from; the TV
            // reads only the PNGs appinfo.json names, so it stays out of the package.
            { context: 'assets', from: '**/*', globOptions: { ignore: ['**/icon.svg'] } },
            { context: 'src', from: 'index.html' }
          ]
        })
      ]
    }
  ];
};

export default makeConfig;
