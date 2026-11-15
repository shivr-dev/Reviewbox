import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents:
      "import 'fake-indexeddb/auto'; import './tests/study-assistant.test.ts'; import './tests/study-orchestrator.test.ts'; import './tests/study-policy.test.ts';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/topic-rotation.test.mjs',
  bundle: true,
  platform: 'node',
  packages: 'external',
  format: 'esm',
  jsx: 'automatic',
});
const result = spawnSync(
  process.execPath,
  ['--test', 'work/topic-rotation.test.mjs'],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
