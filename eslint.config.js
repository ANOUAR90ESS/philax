// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Architectural guard: AI providers and prompts must never be imported by the frontend.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@philax/ai', '@philax/ai/*'], message: 'AI logic is server-side only.' },
            {
              group: ['@philax/prompts', '@philax/prompts/*'],
              message: 'Prompts are server-side only.',
            },
            {
              group: ['@philax/config', '@philax/config/*'],
              message: 'Server config is server-side only.',
            },
          ],
        },
      ],
    },
  },
  {
    // Business modules must go through the LLM gateway, never vendor SDKs or vendor endpoints.
    files: ['modules/**/*.ts', 'apps/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['openai', '@anthropic-ai/*', '@google/*'],
              message: 'Use the LLM gateway in @philax/ai.',
            },
            {
              group: ['@philax/ai/src/providers/*'],
              message: 'Use the LLM gateway, not a concrete provider.',
            },
          ],
        },
      ],
    },
  },
);
