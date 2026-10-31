import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/import-quality.test.tsx'],
  outfile: 'work/import-quality.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
  jsx: 'automatic',
});
const result = spawnSync(
  process.execPath,
  ['--test', 'work/import-quality.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
