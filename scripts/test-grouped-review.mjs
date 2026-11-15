import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/grouped-review.test.ts'],
  outfile: 'work/grouped-review.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
});
const r = spawnSync(
  process.execPath,
  ['--test', 'work/grouped-review.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = r.status ?? 1;
