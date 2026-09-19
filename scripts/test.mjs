import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents:
      "import './tests/core.test.ts'; import './tests/upgrade.test.tsx'; import './tests/exam-import.test.ts'; import './tests/exam-runtime.test.ts'; import './tests/manual-import.test.ts';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/core.test.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  jsx: 'automatic',
});
const result = spawnSync(process.execPath, ['--test', 'work/core.test.mjs'], {
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
