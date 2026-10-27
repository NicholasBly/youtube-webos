import eslintJs from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import type { Linter } from 'eslint';
import prettierConfig from 'eslint-config-prettier';
import * as regexpPlugin from 'eslint-plugin-regexp';
import globals from 'globals';

const configs = [
  eslintJs.configs.recommended,
  prettierConfig,
  regexpPlugin.configs['flat/recommended'],

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },

    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          impliedStrict: true
        }
      }
    },

    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      // `== null` is the one loose comparison worth keeping: null or undefined in one test.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'default-case': 'error',
      'no-nested-ternary': 'error',
      'no-await-in-loop': 'error',
      'no-unused-vars': ['error', { vars: 'local', argsIgnorePattern: '^_' }],
      'no-useless-rename': ['error'],
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-return': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'no-lonely-if': 'error',
      // Off: the webOS 22+ bundle targets Chrome 87, which has no Object.hasOwn.
      'prefer-object-has-own': 'off',
      'prefer-exponentiation-operator': 'error',
      'prefer-regex-literals': ['error', { disallowRedundantWrapping: true }],
      'array-callback-return': ['error', { checkForEach: true, allowVoid: true }],
      'no-constructor-return': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-useless-assignment': 'error',

      /* eslint-plugin-regexp */
      'regexp/prefer-character-class': ['error', { minAlternatives: 2 }],
      'regexp/no-empty-alternative': 'error', // Set to warn in recommended config
      'regexp/no-lazy-ends': 'error', // Set to warn in recommended config
      'regexp/no-potentially-useless-backreference': 'error', // Set to warn in recommended config
      'regexp/confusing-quantifier': 'error', // Set to warn in recommended config
      'regexp/no-useless-flag': 'error', // Set to warn in recommended config
      'regexp/optimal-lookaround-quantifier': 'error' // Set to warn in recommended config
    }
  },

  {
    files: ['src/**/*'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // A build constant, written by webpack's DefinePlugin (webpack.config.js).
        __YTAF_VERSION__: 'readonly'
      }
    },
    rules: {
      // Everything logs through core/log.js, which has the runtime switch.
      'no-console': 'error',
      // A relative import names its file, as an ES module import does in the
      // browser: webpack adds no extension and no index.js to them either.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.{1,2}(?:/[^/]+)*/[^/.]+$|^\\.{1,2}/?$',
              message: 'Name the file: its extension, or /index.js for a folder.'
            }
          ]
        }
      ],
      // Warnings, not errors: a function above these is a candidate for splitting, not a build break.
      complexity: ['warn', 30],
      'max-lines-per-function': ['warn', { max: 120, skipBlankLines: true, skipComments: true }]
    }
  },

  {
    // The logger itself, and the dev-only diagnostics tool with its own console UI.
    files: ['src/core/log.js', 'src/dev/perf-mon.js'],
    rules: {
      'no-console': 'off'
    }
  },

  {
    // Ports of specifications and the dev tool are not split along these lines.
    files: ['src/polyfills/**/*', 'src/dev/perf-mon.js'],
    rules: {
      complexity: 'off',
      'max-lines-per-function': 'off'
    }
  },

  {
    // The TypeScript sources and this file, through the TypeScript parser with
    // the rules the JavaScript has.
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser
    }
  },

  {
    // Two rules are tsc's (tsconfig.json, which checks src/) rather than
    // ESLint's, whose core rules read no types: no-undef (the DOM's type-only
    // names, declarations) and no-unused-vars (the parameter names in a
    // function type, an interface merged into Window), which noUnusedLocals
    // and noUnusedParameters check instead. This file keeps both.
    files: ['src/**/*.ts'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off'
    }
  },

  {
    // Node's own globals where Node runs the code: the configurations in the
    // root, tools/ and tests/. src/ is the TV's, with the browser's only.
    files: ['*.{js,ts,mjs,cjs}', 'tools/**/*', 'tests/**/*'],
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin
      }
    }
  },

  {
    // ESLint takes the module kind from the extension: .cjs is CommonJS, the rest ES modules.
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  {
    // Test scripts step through sequential scenarios on purpose.
    files: ['tests/**/*'],
    rules: {
      'no-await-in-loop': 'off'
    }
  },

  {
    // A block with nothing but `ignores` is a global ignore list, wherever it sits.
    // Dot-directories hold local tools' files (worktrees, scratch files).
    ignores: ['dist/**/*', '.*/**', 'src/vendor/**/*']
  }
] as const satisfies Linter.Config[];

export default configs;
