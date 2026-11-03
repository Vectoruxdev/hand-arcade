import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    // src/hands is the vendored kit: never linted, never edited casually (see KIT_VERSION.md).
    ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'src/hands/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
];
