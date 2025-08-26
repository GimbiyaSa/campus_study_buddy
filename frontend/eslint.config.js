import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { globalIgnores } from 'eslint/config';

export default [
  globalIgnores(['dist', 'public']),
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: globals.browser,
      parser: tsParser,
    },
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {},
  },
];
