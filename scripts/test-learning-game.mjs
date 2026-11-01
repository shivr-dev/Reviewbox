import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('work', { recursive: true });
await build({
  stdin: {
    contents:
      "import './tests/learning-game.test.ts'; import './tests/adventure.test.ts'; import './tests/home-companion-motion.test.ts'; import './tests/home-companion-ui.test.tsx'; import './tests/study-assistant.test.ts'; import './tests/exam-outcomes.test.ts'; import './tests/study-orchestrator.test.ts'; import './tests/learning-evidence.test.ts'; import './tests/study-policy.test.ts'; import './tests/signal-context.test.ts'; import './tests/learning-signals.test.ts'; import './tests/course-lifecycle-ui.test.tsx'; import './tests/mastery-labels.test.tsx'; import './tests/study-plan-ui.test.tsx'; import './tests/assistant-ui.test.tsx'; import './tests/learning-game-ui.test.tsx'; import './tests/private-cloud.test.ts'; import './tests/exam-schedule.test.ts'; import './tests/exam-schedule-ui.test.tsx'; import './tests/session-view.test.ts'; import './tests/session-completion-ui.test.tsx'; import './tests/combo-feedback.test.tsx'; import './tests/alpha-navigation.test.tsx'; import './tests/equipment.test.ts'; import './tests/policy-evaluation.test.ts';",
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  outfile: 'work/learning-game.test.mjs',
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
    'work/learning-game.test.mjs',
  ],
  { stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
