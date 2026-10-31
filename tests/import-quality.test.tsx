import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFile, mkdir } from 'node:fs/promises';
import {
  validatePack,
  packZip,
  extractFile,
  questionSchema,
} from '../lib/importer';
import {
  normalizeGeneratedQuestion,
  GenerationFormatError,
  generationFormatFailure,
  VARIANT_FAILURE,
} from '../lib/generation-format';
import { assertQuestionFormat } from '../lib/question-tools';
import { installAIEnvironment } from '../lib/ai-environment';
import {
  generate,
  solve,
  judge,
  grade,
  createGradingRule,
} from '../lib/ai-server';
import { generateVerified } from '../lib/ai-client';
import {
  switchAccount,
  installPack,
  previewInstallPack,
  commitPackUpdate,
  undoPackUpdate,
  put,
  loadData,
  allRecords,
} from '../lib/store';
import { inspectPackContent } from '../lib/import-review';
import { gradingRuleSchema, finalizeGrade } from '../lib/grading-rules';
import { semanticDiagramSchema, diagramSchema } from '../lib/diagram-spec';
import SubjectDiagram from '../components/subject-diagram';
import {
  qualityNode,
  qualityQuestion,
  qualityRule,
  qualityPack,
  importFixtures,
  subjectExample,
  fiftyDiagrams,
  evaporation,
} from './fixtures/import-quality';
import type { Question } from '../lib/model';
import {
  QUALITY_IMPORT_EXAMPLES,
  PROFESSIONAL_DIAGRAM_EXAMPLES,
} from '../lib/learning-quality-examples';
import { IMPORT_SKILL } from '../lib/import-skill';

test('the copied external AI Skill includes valid new full packs, SOLO and semantic diagrams while keeping legacy examples', () => {
  for (const raw of QUALITY_IMPORT_EXAMPLES) {
    const pack = validatePack(raw);
    assert.equal(inspectPackContent(pack).blocked.length, 0);
    assert.ok(pack.questions[0].gradingRule);
  }
  for (const diagram of Object.values(PROFESSIONAL_DIAGRAM_EXAMPLES))
    assert.equal(semanticDiagramSchema.safeParse(diagram).success, true);
  for (const text of [
    'Skill 2.0',
    'gradingRule',
    'scoringPolicy',
    'fullCreditLevel',
    'evaporating_dish',
    'carryForward',
    'media',
    'matching',
    'pinyin',
  ])
    assert.ok(IMPORT_SKILL.includes(text), text);
});

test('five external pack forms preserve rules, stage missing rules, retain raster assets, and safely upgrade/rollback', async () => {
  const f = importFixtures();
  for (const [name, raw] of Object.entries(f)) {
    await switchAccount('quality-fixture-' + name);
    const p = validatePack(raw);
    assert.equal(p.questions.length, 1);
    if (name === 'missingRule') {
      assert.equal(inspectPackContent(p).blocked.length, 1);
      await assert.rejects(() => installPack(p), /需要确认/);
      p.questions[0] = {
        ...p.questions[0],
        gradingRule: qualityRule,
        rubric: qualityRule.criteria,
      };
    }
    if (name === 'image') {
      const bytes = packZip(p),
        file = new File([bytes as BlobPart], 'external.zip', {
          type: 'application/zip',
        }),
        roundtrip = (await extractFile(file)).pack!;
      assert.equal(
        roundtrip.questions[0].media![0].src,
        p.questions[0].media![0].src,
      );
    }
    await installPack(p);
    await put('question', { ...p.questions[0], verified: true });
    await put('event', {
      id: 'history:' + name,
      questionId: p.questions[0].id,
      score: 0.7,
      grade: { score: 3, maxScore: 5, ruleVersion: '1' },
    });
    await put('exam', { id: 'grade:' + name, score: 91 });
    await installPack(p);
    assert.equal((await loadData()).questions[0].verified, true);
    if (name === 'withRule') {
      const local = {
        ...(await loadData()).questions[0],
        gradingRule: {
          ...qualityRule,
          version: 'personal',
          criteria: qualityRule.criteria.map((c) => ({
            ...c,
            fullCredit: '我人工确认的条件：' + c.description,
          })),
        },
      };
      local.rubric = local.gradingRule.criteria;
      await put('question', local);
      const preview = await previewInstallPack(validatePack(f.update));
      assert.ok(preview.changes.some((c) => c.conflict));
      await assert.rejects(() => commitPackUpdate(preview), /冲突/);
      const before = await allRecords();
      await commitPackUpdate(preview, { [local.id]: 'keep' });
      assert.equal(
        (await loadData()).questions[0].gradingRule!.version,
        'personal',
      );
      const updatePreview = await previewInstallPack(validatePack(f.update));
      await commitPackUpdate(updatePreview, { [local.id]: 'replace' });
      assert.equal((await loadData()).questions[0].verified, false);
      const rows = await allRecords(),
        installed = rows.find((r) => r.kind === 'pack' && !r.deleted)!;
      await undoPackUpdate(installed.payload.installationId);
      assert.equal(
        (await loadData()).questions[0].gradingRule!.version,
        'personal',
      );
      assert.deepEqual(
        (await allRecords()).find((r) => r.id === 'history:withRule'),
        before.find((r) => r.id === 'history:withRule'),
      );
      assert.ok(
        (await allRecords()).some(
          (r) => r.id === 'grade:withRule' && !r.deleted,
        ),
      );
    }
  }
});

test('content checks reject missing mappings, invalid totals, duplicate criteria, unsafe diagrams and missing ZIP assets', async () => {
  const p = importFixtures().withRule;
  assert.throws(
    () =>
      validatePack({
        ...p,
        questions: [{ ...p.questions[0], skillId: 'missing' }],
      }),
    /不存在/,
  );
  assert.throws(
    () =>
      validatePack({
        ...p,
        questions: [
          { ...p.questions[0], gradingRule: { ...qualityRule, maxScore: 99 } },
        ],
      }),
    /评分规则/,
  );
  assert.throws(
    () =>
      validatePack({
        ...p,
        questions: [
          {
            ...p.questions[0],
            rubric: undefined,
            gradingRule: {
              ...qualityRule,
              criteria: [qualityRule.criteria[0], qualityRule.criteria[0]],
              maxScore: 6,
            },
          },
        ],
      }),
    /评分规则/,
  );
  assert.throws(
    () =>
      validatePack({
        ...p,
        questions: [
          {
            ...p.questions[0],
            diagram: { type: 'raw-svg', svg: '<script>bad()</script>' },
          },
        ],
      }),
    /图形结构/,
  );
  assert.throws(
    () =>
      validatePack({
        ...p,
        questions: [
          {
            ...p.questions[0],
            media: [{ id: 'x', src: 'javascript:alert(1)', alt: '' }],
          },
        ],
      }),
    /插图资源/,
  );
  const invalid = {
    ...p,
    questions: [
      {
        ...p.questions[0],
        media: [{ id: 'x', src: 'assets/missing.png', alt: '' }],
      },
    ],
  };
  assert.equal(inspectPackContent(validatePack(invalid)).blocked.length, 1);
  const explicit = {
    ...p,
    questions: [
      {
        ...p.questions[0],
        media: [
          {
            id: 'original',
            src: importFixtures().image.questions[0].media![0].src,
            alt: '原图',
          },
        ],
        diagram: evaporation,
      },
    ],
  };
  assert.equal(inspectPackContent(validatePack(explicit)).blocked.length, 1);
  assert.equal(
    inspectPackContent(
      validatePack({
        ...explicit,
        questions: explicit.questions.map((q) => ({
          ...q,
          diagramChoice: 'original',
        })),
      }),
    ).blocked.length,
    0,
  );
});

test('graded evidence is bounded, quoted, stable and stores the immutable rule including SOLO full credit at L4', () => {
  for (const subject of [
    'chinese',
    'math',
    'physics',
    'chemistry',
    'history',
  ] as const) {
    const e = subjectExample(subject),
      g = finalizeGrade(e.raw, e.question, e.student, 'test-qwen');
    assert.equal(g.score, 5);
    assert.equal(g.ruleVersion, '1.0.0');
    assert.deepEqual(g.ruleSnapshot, e.rule);
    assert.deepEqual(
      g,
      finalizeGrade(e.raw, e.question, e.student, 'test-qwen'),
    );
    if (subject === 'chinese') {
      assert.equal(g.solo!.level, 'L4');
      assert.equal(g.ruleSnapshot!.solo!.fullCreditLevel, 'L4');
    }
    assert.throws(
      () =>
        finalizeGrade(
          {
            ...e.raw,
            criteria: [
              ...e.raw.criteria,
              {
                id: 'invented',
                score: 10,
                evidence: e.student,
                missing: '',
                suggestion: '',
              },
            ],
          },
          e.question,
          e.student,
          'test',
        ),
      /评分点/,
    );
    assert.throws(
      () =>
        finalizeGrade(
          {
            ...e.raw,
            criteria: e.raw.criteria.map((c) => ({
              ...c,
              evidence: '根本没有写过的内容',
            })),
          },
          e.question,
          e.student,
          'test',
        ),
      /真实证据/,
    );
    assert.throws(
      () =>
        finalizeGrade(
          {
            ...e.raw,
            criteria: e.raw.criteria.map((c) => ({ ...c, score: 100 })),
          },
          e.question,
          e.student,
          'test',
        ),
      /超出/,
    );
    e.question.gradingRule!.criteria[0].description = '更新后的条件';
    assert.notEqual(g.ruleSnapshot!.criteria[0].description, '更新后的条件');
  }
});

test('safe normalization keeps all solution text and exact matching meaning, rejecting ambiguous repairs', () => {
  const steps = Array.from({ length: 25 }, (_, i) => '步骤 ' + (i + 1)),
    r = normalizeGeneratedQuestion({
      ...qualityQuestion,
      matching: { left: 'bad', right: 'bad' },
      solution: steps,
    });
  assert.equal(r.value.matching, undefined);
  assert.ok(r.value.solution.length <= 12);
  assert.deepEqual(r.value.solution.join('\n').split('\n'), steps);
  const pair = normalizeGeneratedQuestion({
    ...qualityQuestion,
    type: 'matching',
    matching: { left: { L1: '甲', L2: '乙' }, right: { R1: '一', R2: '二' } },
    answer: { L1: 'R2', L2: 'R1' },
  }).value;
  assertQuestionFormat(questionSchema.parse(pair) as Question);
  assert.equal(JSON.parse(pair.answer).L1, 'R2');
  const ambiguous = normalizeGeneratedQuestion({
    ...qualityQuestion,
    type: 'matching',
    matching: { left: '甲乙', right: '一二' },
  }).value;
  assert.equal(questionSchema.safeParse(ambiguous).success, false);
  const duplicate = { ...pair, answer: JSON.stringify({ L1: 'R1', L2: 'R1' }) };
  assert.throws(() => assertQuestionFormat(duplicate as Question));
});

test('fifty semantic diagrams validate and render finite monochrome SVG; impossible physical claims are rejected', async () => {
  const diagrams = fiftyDiagrams();
  assert.equal(diagrams.length, 50);
  for (const d of diagrams) {
    const p = semanticDiagramSchema.safeParse(d);
    assert.ok(p.success, JSON.stringify(p.error?.issues));
    const svg = renderToStaticMarkup(<SubjectDiagram spec={d} />);
    assert.ok(svg.includes('<svg'));
    assert.ok(!/NaN|Infinity|<script|foreignObject/.test(svg));
  }
  assert.equal(
    semanticDiagramSchema.safeParse({
      type: 'semantic',
      kind: 'geometry',
      points: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 1, y: 1 },
        { id: 'C', x: 0, y: 2 },
      ],
      segments: [['A', 'B']],
      marks: [{ kind: 'right', points: ['B', 'A', 'C'] }],
    }).success,
    false,
  );
  const f = fiftyDiagrams().find((d) => d.kind === 'forces')!;
  assert.equal(
    semanticDiagramSchema.safeParse({
      ...f,
      forces: [
        { id: 'g', kind: 'gravity', origin: 'top', angle: 90, label: 'G' },
      ],
    }).success,
    false,
  );
  assert.equal(
    semanticDiagramSchema.safeParse({
      type: 'semantic',
      kind: 'lever',
      pivot: 0,
      equilibrium: true,
      loads: [{ position: 2, force: 10, label: 'F' }],
    }).success,
    false,
  );
  assert.equal(
    diagramSchema.safeParse({
      type: 'geometry',
      points: [{ id: 'A', x: 0, y: 0 }],
      segments: [['A', 'missing']],
    }).success,
    false,
  );
  assert.equal(
    semanticDiagramSchema.safeParse({
      ...evaporation,
      apparatus: [
        {
          id: 'd',
          kind: 'evaporating_dish',
          label: '答案：防止局部过热引起飞溅',
        },
      ],
    }).success,
    false,
  );
  await mkdir('outputs/import-quality', { recursive: true });
  await writeFile(
    'outputs/import-quality/diagram-fixtures.json',
    JSON.stringify(diagrams, null, 2),
  );
});

test('100 variant pipeline runs exercise actual client/server normalization, bounded retries, independent checks and persistence', async () => {
  await switchAccount('quality-variants');
  installAIEnvironment((name) =>
    name === 'CF_ACCOUNT_ID'
      ? 'a'.repeat(32)
      : name === 'CF_AI_TOKENS'
        ? '["test-token"]'
        : '',
  );
  const previousFetch = globalThis.fetch,
    metrics = {
      mode: 'offline deterministic transport; not live Qwen',
      runs: 100,
      firstPass: 0,
      safeRepair: 0,
      retrySuccess: 0,
      failed: 0,
      byType: {} as Record<string, number>,
    };
  let index = 0,
    attempt = 0,
    raw: any,
    node = qualityNode,
    type = 'recall';
  const original = { ...qualityQuestion, id: 'untouched-original' };
  await put('question', original);
  globalThis.fetch = async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    if (String(url) === '/api/ai') {
      try {
        if (body.action === 'generate')
          return Response.json({ question: await generate(body) });
        if (body.action === 'solve')
          return Response.json({
            solver: await solve(body.question, body.slot),
          });
        return Response.json(await judge(body.question, body.solvers));
      } catch (e) {
        return Response.json(
          {
            error: (e as Error).message,
            code: (e as any).code,
            retryFeedback: (e as any).retryFeedback,
          },
          { status: 422 },
        );
      }
    }
    const system = body.messages[0].content;
    if (system.includes('creating ONE')) {
      attempt++;
      const value = structuredClone(raw);
      if (attempt === 1 && index % 7 === 0) {
        if (type === 'matching') value.matching.left = 'ambiguous';
        else
          value.solution = Array.from(
            { length: 49 },
            (_, i) => '不可省略步骤 ' + i,
          );
      }
      return Response.json({ result: { response: JSON.stringify(value) } });
    }
    if (system.startsWith('Independently'))
      return Response.json({
        result: {
          response: JSON.stringify({
            answer: raw.answer,
            steps: ['由已知推导并检查答案。'],
            wellPosed: true,
            unique: true,
            ambiguities: [],
            ...(type === 'choice'
              ? {
                  optionChecks: raw.options.map((o: string, i: number) => ({
                    optionIndex: i + 1,
                    correct: o === raw.answer,
                    reason: '代入检查',
                  })),
                }
              : {}),
          }),
        },
      });
    return Response.json({
      result: {
        response: JSON.stringify({ pass: true, reason: '格式和测试答案一致' }),
      },
    });
  };
  try {
    for (index = 0; index < 100; index++) {
      const group = Math.floor(index / 20);
      type = ['choice', 'matching', 'recall', 'recall', 'subjective'][group];
      node = {
        ...qualityNode,
        subject: group === 3 ? 'physics' : group === 4 ? 'history' : 'math',
      };
      attempt = 0;
      raw = {
        ...qualityQuestion,
        subject: node.subject,
        type,
        ...(type === 'choice' ? { options: ['1', '2', '3', '4'] } : {}),
        ...(type === 'matching'
          ? {
              prompt: '将两项概念与定义配对。',
              matching: {
                left: [
                  { id: 'L1', text: '甲' },
                  { id: 'L2', text: '乙' },
                ],
                right: [
                  { id: 'R2', text: '二' },
                  { id: 'R1', text: '一' },
                ],
              },
              answer: JSON.stringify({ L1: 'R1', L2: 'R2' }),
            }
          : { matching: { left: null, right: null } }),
        ...(group === 3 ? { diagram: fiftyDiagrams()[2] } : {}),
        ...(type === 'subjective' ? { rubric: qualityRule.criteria } : {}),
        ...(index % 4 === 0
          ? {
              solution: Array.from(
                { length: 16 },
                (_, i) => '完整解法片段 ' + i,
              ),
            }
          : {}),
      };
      const repaired = normalizeGeneratedQuestion(raw).repairs.length > 0;
      const q = await generateVerified(
        node,
        node.skills[0],
        2,
        '变式验收',
        [],
        () => {},
        { questionType: type },
      );
      assert.equal(q.verified, true);
      assertQuestionFormat(q);
      assert.ok(attempt <= 2);
      if (attempt === 2) metrics.retrySuccess++;
      else if (repaired) metrics.safeRepair++;
      else metrics.firstPass++;
      const key = ['choice', 'matching', 'math', 'physics', 'subjective'][
        group
      ];
      metrics.byType[key] = (metrics.byType[key] ?? 0) + 1;
    }
    assert.equal(metrics.retrySuccess, 15);
    assert.deepEqual(metrics.byType, {
      choice: 20,
      matching: 20,
      math: 20,
      physics: 20,
      subjective: 20,
    });
    assert.deepEqual(
      (await allRecords()).find((r) => r.id === original.id)!.payload,
      original,
    );
    globalThis.fetch = async (url: any, init: any) =>
      String(url) === '/api/ai'
        ? Response.json(
            {
              error: '配对题的选项格式需要调整，正在重新生成。',
              code: 'generation-format',
              retryFeedback: 'matching arrays required',
            },
            { status: 422 },
          )
        : previousFetch(url, init);
    await assert.rejects(
      () =>
        generateVerified(node, node.skills[0], 2, '变式验收', [], () => {}, {
          questionType: 'matching',
        }),
      (e) => (e as Error).message === VARIANT_FAILURE,
    );
    const failed = (await allRecords()).filter(
      (r) => r.kind === 'job' && r.payload.status === 'failed',
    );
    assert.equal(failed.at(-1)!.payload.attempt, 2);
    assert.equal(failed.at(-1)!.payload.question, undefined);
    await writeFile(
      'outputs/import-quality/variant-regression.json',
      JSON.stringify(metrics, null, 2),
    );
  } finally {
    globalThis.fetch = previousFetch;
    installAIEnvironment(() => '');
  }
});

test('server Qwen grading request uses fixed snapshot and deterministic sampling, proposal cannot overwrite imported rule', async () => {
  installAIEnvironment((name) =>
    name === 'CF_ACCOUNT_ID'
      ? 'a'.repeat(32)
      : name === 'CF_AI_TOKENS'
        ? '["test-token"]'
        : '',
  );
  const previous = globalThis.fetch;
  try {
    for (const subject of [
      'chinese',
      'math',
      'physics',
      'chemistry',
      'history',
    ] as const) {
      const e = subjectExample(subject);
      let sent: any;
      globalThis.fetch = async (_url: any, init: any) => {
        sent = JSON.parse(init.body);
        return Response.json({ result: { response: JSON.stringify(e.raw) } });
      };
      const g = await grade(e.question, e.student);
      assert.equal(g.score, 5);
      assert.equal(sent.temperature, 0);
      assert.equal(sent.seed, 42);
      assert.deepEqual(
        JSON.parse(sent.messages[1].content).ruleSnapshot,
        e.rule,
      );
      assert.ok(sent.messages[0].content.includes('untrusted'));
    }
    const before = structuredClone(qualityRule),
      q = {
        ...qualityQuestion,
        type: 'subjective',
        rubric: qualityRule.criteria,
        gradingRule: qualityRule,
      };
    globalThis.fetch = async () =>
      Response.json({
        result: {
          response: JSON.stringify({
            ...qualityRule,
            criteria: qualityRule.criteria.map((c) => ({
              ...c,
              fullCredit: c.description,
              partialCredit: '部分推理正确得部分分。',
            })),
          }),
        },
      });
    const proposal = await createGradingRule({
      question: q,
      policy: { mode: 'steps', preferences: '保留过程分' },
    });
    assert.ok(gradingRuleSchema.safeParse(proposal).success);
    assert.deepEqual(q.gradingRule, before);
  } finally {
    globalThis.fetch = previous;
    installAIEnvironment(() => '');
  }
});
