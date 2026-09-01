// ESLint flat config (P1.3 in docs/reviews/2026-08-30-maintainability-review.md —
// the old `lint` script referenced an eslint that was never installed).
//
// Scope: correctness rules tsc can't cover — above all react-hooks/rules-of-hooks
// in this hook-heavy codebase. Style/formatting is deliberately out of scope.
// exhaustive-deps stays a WARNING: several effects intentionally run on a subset
// of deps (poll loops, one-shot mounts) and a blind autofix there changes
// behavior — CI gates on errors only (plain `eslint .`, no --max-warnings).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/', 'test-results/', 'qa-artifacts/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hook rules only. react-hooks v6 also ships opinionated
      // compiler-era rules (refs / set-state-in-effect / purity) that flag ~17
      // existing, working patterns — adopting those is a deliberate refactor
      // pass, not a lint switch-on. Revisit when taking the React Compiler.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // tsc (noUnusedLocals/noUnusedParameters) already gates unused vars in
      // CI's build step; the lint copy only duplicates those failures with a
      // second rule name. Keep the check single-sourced in tsc.
      '@typescript-eslint/no-unused-vars': 'off',
      // try { localStorage... } catch {} is this codebase's storage idiom.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // qa-kit CDP drivers + config files are plain Node scripts; some evaluate
    // snippets in the page, so both runtimes' globals apply.
    files: ['**/*.{js,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly', require: 'readonly', module: 'writable',
        __dirname: 'readonly', console: 'readonly', Buffer: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        URL: 'readonly', fetch: 'readonly', WebSocket: 'readonly',
        document: 'readonly', window: 'readonly', localStorage: 'readonly',
        getComputedStyle: 'readonly', performance: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
