import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'docs/**',
      '.deploy/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['client/**/*.{ts,tsx}', 'shared/**/*.ts'],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: [
      'server/**/*.ts',
      'scripts/**/*.{ts,mjs}',
      'shared/**/*.ts',
      'tests/**/*.ts',
      '*.config.ts',
      'eslint.config.js'
    ],
    languageOptions: {
      globals: globals.node
    }
  }
);
