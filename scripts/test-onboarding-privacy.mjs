import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/onboarding-privacy.test.tsx'],
  outfile: 'work/onboarding-privacy.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
  jsx: 'automatic',
});
const result = spawnSync(
  process.execPath,
  [
    '--import',
    './tests/repair-dom-preload.mjs',
    '--test',
    'work/onboarding-privacy.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
