import ts from 'typescript-eslint';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      'no-console': ['warn', { 'allow': ['error', 'warn', 'log'] }],
      'no-empty': ['error', { 'allowEmptyCatch': true }]
    }
  },
  {
    ignores: ['dist/', 'node_modules/', 'public/', 'playwright.config.ts', 'tests/', 'vitest.config.ts']
  }
];
