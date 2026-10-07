import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents:
      "import './tests/intelligence.test.ts'; import './tests/intelligence-ui.test.tsx';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/intelligence.test.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
});
const result = spawnSync(
  process.execPath,
  ['--test', 'work/intelligence.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
