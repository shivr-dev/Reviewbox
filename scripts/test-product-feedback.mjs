import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/product-feedback.test.ts'],
  outfile: 'work/product-feedback.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
});
const result = spawnSync(
  process.execPath,
  ['--test', 'work/product-feedback.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
