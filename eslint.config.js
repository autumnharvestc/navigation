import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'public/data', 'public/search-index'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.ts', 'eslint.config.js', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
