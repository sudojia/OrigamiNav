import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** eslint-config-next native flat configs, imported directly. */
const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'drizzle/meta/**',
      'backups/**',
      'next-env.d.ts',
      // Separate npm project (WXT extension); Next-specific rules don't apply.
      'extension/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Disallows empty catch blocks.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
];

export default eslintConfig;
