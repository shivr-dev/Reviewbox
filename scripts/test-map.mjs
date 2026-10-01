import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents: "import './tests/map.test.ts'; import './tests/pages-ai-proxy.test.ts';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/map.test.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
});
const result = spawnSync(process.execPath, ['--test', 'work/map.test.mjs', 'tests/map-player-flow.test.mjs'], {
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
