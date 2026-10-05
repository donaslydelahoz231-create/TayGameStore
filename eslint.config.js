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
      // Fase 0: el frontend sigue siendo el HTML original con scripts inline.
      // Se incorpora al lint cuando se modularice (Fase 1).
      'src/web/',
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
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
);
