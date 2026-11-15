import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({
  entryPoints: ['tests/authoring-studios.test.ts'],
  outfile: 'work/authoring-studios.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
});
const r = spawnSync(
  process.execPath,
  ['--test', 'work/authoring-studios.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = r.status ?? 1;
