import CopyPlugin from 'copy-webpack-plugin';
import { TransformAsyncModulesPlugin } from 'transform-async-modules-webpack-plugin';
import pkgJson from './package.json' with { type: 'json' };
import babelRuntimePkgJson from '@babel/runtime-corejs3/package.json' with { type: 'json' };
import TerserPlugin from 'terser-webpack-plugin';
import path from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import { basename } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param input {Buffer}
 * @returns {string}
 */
function transformAppInfo(input) {
  const appInfo = JSON.parse(input.toString());
  appInfo.version = pkgJson.version;
  return JSON.stringify(appInfo, null, 2);
}

/** @type {(env: Record<string, string>, argv: { mode?: string }) => (import('webpack').Configuration)[]} */
const makeConfig = (env, argv) => {
  const isModern = !!(env && env.modern);
  const isProd = argv.mode === 'production';

  return [
    {
      target: isModern ? 'browserslist:chrome 87' : ['web', 'es5'],
      devtool: argv.mode === 'development' ? 'inline-source-map' : false,
      entry: {
        index: './src/index.js',
        userScript: {
          import: './src/userScript',
          filename: 'webOSUserScripts/[name].js'
        }
      },
      resolve: {
        extensions: ['.mjs', '.cjs', '.js', '.json', '.ts'],
        alias: isModern
          ? {
              // Strip global polyfills for modern build
              'core-js-pure': false,
              '@babel/runtime-corejs3': false,
              'regenerator-runtime': false,
              'regenerator-runtime/runtime': false,
              'whatwg-fetch': false,

              // Strip local polyfills
              [path.resolve(__dirname, 'src/spatial-navigation-polyfill.js')]:
                path.resolve(__dirname, 'src/spatial-navigation.modern.js'),
              [path.resolve(__dirname, 'src/domrect-polyfill.js')]: false,
              [path.resolve(__dirname, 'src/emoji-font.js')]: false,
              [path.resolve(__dirname, 'src/emoji-font.css')]: false
            }
          : {}
      },
      module: {
        rules: [
          {
            test: /\.[mc]?[jt]s$/i,
            loader: 'babel-loader',
            // Restore original exclude for legacy to maintain compatibility
            // Modern build excludes all node_modules for speed
            exclude: isModern
              ? /node_modules/
              : [
                  /node_modules[\\/]core-js/,
                  /node_modules[\\/]webpack[\\/]buildin/
                ],
            options: isModern
              ? {
                  // modern config
                  cacheDirectory: true,
                  babelrc: false,
                  configFile: false,
                  presets: [
                    [
                      '@babel/preset-env',
                      {
                        targets: 'chrome 87',
                        bugfixes: true,
                        modules: false,
                        useBuiltIns: false
                      }
                    ]
                  ],
                  plugins: [
                    ['@babel/plugin-transform-typescript', { strictMode: true }]
                  ]
                }
              : {
                  // LEGACY CONFIGURATION (Uses babel.config.js)
                  cacheDirectory: true
                },
            resolve: {
              fullySpecified: false
            }
          },
          {
            test: /\.css$/i,
            use: [
              { loader: 'style-loader' },
              {
                loader: 'css-loader',
                options: {
                  esModule: false,
                  importLoaders: 1,
                  modules: false
                }
              },
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    plugins: [
                      [
                        'cssnano',
                        {
                          preset: [
                            'default',
                            {
                              discardComments: { removeAll: true },
                              normalizeWhitespace: true,
                              colormin: true,
                              minifySelectors: true,
                              minifyFontValues: true
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
        minimize: isProd,
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              format: {
                comments: false,
                ascii_only: true
              },
              compress: {
                drop_console: false,
                drop_debugger: true,
                passes: 4,
                arrows: isModern,
                ecma: isModern ? 2020 : 5
              },
              mangle: isModern ? true : { safari10: true }
            },
            extractComments: false
          })
        ]
      },
      performance: {
        hints: false
      },
      plugins: [
        new CopyPlugin({
          patterns: [
            {
              context: 'assets',
              from: '**/*',
              transform: {
                transformer(input, absolutePath) {
                  if (basename(absolutePath) === 'appinfo.json') {
                    return transformAppInfo(input);
                  }
                  return input;
                }
              }
            },
            { context: 'src', from: 'index.html' }
          ]
        }),
        // Only add Async Module support for Legacy builds
        ...(isModern
          ? []
          : [
              new TransformAsyncModulesPlugin({
                runtime: {
                  version: babelRuntimePkgJson.version,
                  absoluteRuntime: './node_modules/@babel/runtime-corejs3'
                }
              })
            ]),
        new webpack.DefinePlugin({
          __YTAF_VERSION__: JSON.stringify(pkgJson.version)
        })
      ]
    }
  ];
};

export default makeConfig;
