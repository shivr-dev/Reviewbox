import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  legacyStudyAgenda,
  legacyDailyStudyPlan,
  legacyComputeMastery,
} from './baselines/study-policy-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage =
  'Usage: node scripts/evaluate-study-policy.mjs (--fixture | --input backup.json) --output report.json [--now ISO_DATE] [--every-events 5] [--max-checkpoints 40] [--policy POLICY_ID]';
let temporary;
try {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'boolean' },
      input: { type: 'string' },
      output: { type: 'string' },
      now: { type: 'string' },
      'every-events': { type: 'string' },
      'max-checkpoints': { type: 'string' },
      policy: { type: 'string', multiple: true },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  if (Boolean(values.fixture) === Boolean(values.input) || !values.output)
    throw new Error(usage);
  if (
    values.input &&
    resolve(values.input).toLowerCase() === resolve(values.output).toLowerCase()
  )
    throw new Error('Output must be different from the input backup');
  const raw = values.input
    ? JSON.parse(await readFile(resolve(values.input), 'utf8'))
    : undefined;
  const asOf =
    values.now ??
    (values.fixture ? '2026-10-13T12:00:00.000Z' : raw?.exportedAt);
  const now = asOf === undefined ? Date.now() : Date.parse(asOf);
  if (!Number.isFinite(now))
    throw new Error('Invalid --now or backup exportedAt');
  const numeric = (key) => {
    if (values[key] === undefined) return undefined;
    const n = Number(values[key]);
    if (!Number.isInteger(n) || n < 1)
      throw new Error('--' + key + ' must be a positive integer');
    return n;
  };
  await mkdir(resolve(root, 'work'), { recursive: true });
  temporary = await mkdtemp(resolve(root, 'work', 'policy-replay-'));
  const modulePath = resolve(temporary, 'evaluation.mjs');
  await build({
    stdin: {
      contents: `export { evaluatePolicyHistory, evaluationInput } from './lib/policy-evaluation';
      ${
        values.fixture
          ? `import { fixture, attempt, schoolExam } from './tests/study-plan-fixtures';
      export function makeFixture(now) {
        const data = fixture(), day = 86400000;
        data.events = Array.from({length: 10}, (_, i) => attempt(data, i % 8, now - (12-i)*day, {score: i%4 === 0 ? 0 : 1, outcome: i%4 === 0 ? 'wrong' : 'correct'}));
        data.exams = [schoolExam(data, now, 4)];
        return data;
      }`
          : ''
      }`,
      resolveDir: root,
      loader: 'ts',
    },
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  const { evaluatePolicyHistory, evaluationInput, makeFixture } = await import(
    pathToFileURL(modulePath).href
  );
  const input = values.fixture ? makeFixture(now) : evaluationInput(raw);
  // The evaluator only calls pure policy functions. Abort any accidental network use.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network access is disabled during policy replay');
  };
  let report;
  try {
    report = evaluatePolicyHistory(input, {
      legacyAgenda: legacyStudyAgenda,
      legacyDailyPlan: legacyDailyStudyPlan,
      legacyComputeMastery,
      now,
      everyEvents: numeric('every-events'),
      maxCheckpoints: numeric('max-checkpoints'),
      policyIds: values.policy,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  report.dataset = {
    kind: values.fixture ? 'synthetic-fixture' : 'provided-history',
    baseline: 'study-policy-v1',
    timestampSource: values.now
      ? 'argument'
      : values.fixture
        ? 'fixture'
        : raw?.exportedAt
          ? 'backup-exportedAt'
          : 'current-time',
  };
  const output = resolve(values.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(
    `${report.dataset.kind}: ${report.eventCount} valid unique events; observed exam GPA ${report.observedExamOutcomes.gpa ?? 'unavailable'} (${report.observedExamOutcomes.rows.length} results).`,
  );
  const percent = (v) => (v === null ? 'n/a' : (v * 100).toFixed(1) + '%');
  for (const { policyId, summary: s } of report.variants)
    console.log(
      `${policyId}: ${s.checkpoints} checkpoints; primary agreement ${percent(s.primaryAgreement)}; rank displacement ${percent(s.meanRankDisplacement)}; churn ${percent(s.recommendationChurn)} (legacy ${percent(s.legacyRecommendationChurn)}); latent difference ${s.meanLatentDifference?.toFixed(4) ?? 'n/a'}.`,
    );
  console.log(
    'Descriptive replay only; causal learning gain and counterfactual exam benefit are unavailable.',
  );
  console.log('Report: ' + output);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (
    temporary &&
    dirname(temporary) === resolve(root, 'work') &&
    basename(temporary).startsWith('policy-replay-')
  )
    await rm(temporary, { recursive: true, force: true });
}
