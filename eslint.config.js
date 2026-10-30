import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['electron/local-service.mjs', 'dist', 'node_modules', '*.tsbuildinfo', 'release', 'notes-repository', 'repository-work', 'deliverables', 'public/vditor'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  { files: ['electron/**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['eslint.config.js', 'electron/**/*.cjs', 'scripts/**/*.mjs', 'server/**/*.mjs'], languageOptions: { globals: globals.node } },
);
