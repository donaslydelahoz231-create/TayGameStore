import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'legacy/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // Fastify usa plugins y hooks async (en vez de callbacks) aunque no esperen nada.
      '@typescript-eslint/require-await': 'off',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
  {
    files: ['src/server/db/migrate.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['*.js', 'e2e/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Entorno de prueba en el navegador (script clásico; solo en dist/preview).
    files: ['tools/preview/shim.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }], eqeqeq: ['error', 'always'] },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Frontend (módulos ES del navegador).
    files: ['src/web/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
      'no-implicit-globals': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
);
