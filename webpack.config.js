import CopyPlugin from 'copy-webpack-plugin';
import { TransformAsyncModulesPlugin } from 'transform-async-modules-webpack-plugin';
import pkgJson from './package.json' with { type: 'json' };
import TerserPlugin from 'terser-webpack-plugin';

/** @type {(env: Record<string, string>) => (import('webpack').Configuration)[]} */
const makeConfig = () => [
  {
    /**
     * NOTE: Builds with devtool = 'eval' contain very big eval chunks which seem
     * to cause segfaults (at least) on nodeJS v0.12.2 used on webOS 3.x.
     * Set to false for smallest bundle size, or 'source-map' for debugging
     */
    devtool: false, // Change to 'source-map' if you need debugging

    entry: {
      index: './src/index.js',
      userScript: {
        import: './src/userScript.js',
        filename: 'webOSUserScripts/[name].js'
      }
    },

    resolve: {
      extensions: ['.mjs', '.cjs', '.js', '.json', '.ts']
    },

    module: {
      rules: [
        {
          test: /\.[mc]?[jt]s$/i,

          loader: 'babel-loader',
          exclude: [
            // Some module should not be transpiled by Babel
            // See https://github.com/zloirock/core-js/issues/743#issuecomment-572074215
            // \\ for Windows, / for macOS and Linux
            /node_modules[\\/]core-js/,
            /node_modules[\\/]webpack[\\/]buildin/
          ],
          options: {
            cacheDirectory: true
          },
          resolve: {
            // File extension DON'T MATTER in a bundler.
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
                    ['cssnano', {
                      preset: ['default', {
                        discardComments: {
                          removeAll: true
                        },
                        normalizeWhitespace: true,
                        colormin: true,
                        minifySelectors: true,
                        minifyFontValues: true,
                      }]
                    }]
                  ]
                }
              }
            }
          ]
        }
      ]
    },

    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false, // Remove all comments
              ascii_only: true, // Escape unicode characters
            },
            compress: {
              drop_console: false, // Keep console.log (set true to remove)
              drop_debugger: true, // Remove debugger statements
              pure_funcs: ['console.debug', 'console.trace'], // Remove specific console methods
              passes: 4, // Run compression multiple times for better results
              unsafe: false, // Keep safe (set true for more aggressive compression)
              unsafe_comps: false,
              unsafe_math: false,
              unsafe_proto: false,
            },
            mangle: {
              safari10: true, // Ensure compatibility
            },
          },
          extractComments: false,
        }),
      ],
    },

    performance: {
      hints: false, // Disable performance warnings for large bundles
    },

    plugins: [
      new CopyPlugin({
        patterns: [
          { context: 'assets', from: '**/*' },
          { context: 'src', from: 'index.html' }
        ]
	}),
      // babel doesn't transform top-level await.
      // webpack transforms it to async modules.
      // This plugin calls babel again to transform remove the `async` keyword usage after the fact.
      new TransformAsyncModulesPlugin({
        // @ts-expect-error Bad types
        runtime: {
          version: pkgJson.devDependencies['@babel/plugin-transform-runtime']
        }
      })
    ]
  }
];

export default makeConfig;