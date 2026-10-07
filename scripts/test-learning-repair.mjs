import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents:
      "import './tests/learning-repair.test.ts'; import './tests/learning-repair-ui.test.tsx';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/learning-repair.test.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
});
const result = spawnSync(
  process.execPath,
  [
    '--import',
    './tests/repair-dom-preload.mjs',
    '--test',
    'work/learning-repair.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
