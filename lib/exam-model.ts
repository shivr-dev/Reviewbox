import type { Node, Question } from './model';
import { objectiveScore } from './question-tools';
export const EXAM_FORMAT = 'english-v1' as const;
export type ExamKind = 'SAT' | 'ACT' | 'TOEFL';
export type ExamOptions = {
  writing: boolean;
  stages?: ExamStage[];
  practice?: boolean;
};
export type ExamTask = {
  native?: Record<string, unknown>;
  type: string;
  audio?: string;
  audioText?: string;
  parts?: { visiblePrefix: string; missingLength: number; answer: string }[];
  words?: string[];
  responseSeconds?: number;
};
export type ExamSlot = {
  id: string;
  stage: number;
  index: number;
  domain: string;
  type: 'choice' | 'subjective' | 'blank';
  group?: string;
  route: 'standard' | 'lower' | 'higher';
};
export type ExamStage = {
  id: string;
  title: string;
  section: string;
  count: number;
  seconds: number;
  breakAfter: number;
  adaptive: boolean;
  slots: ExamSlot[];
};
export type ExamPaper = {
  id: string;
  kind: 'exam-paper';
  format: typeof EXAM_FORMAT;
  exam: ExamKind;
  options: ExamOptions;
  createdAt: string;
  status: 'preparing' | 'ready';
  questions: Record<string, string>;
  passages: Record<string, string>;
  error?: string;
  title?: string;
  origin?: 'imported';
};
export type ExamRun = {
  id: string;
  kind: 'exam-run';
  paperId: string;
  exam: ExamKind;
  status: 'active' | 'break' | 'complete';
  stage: number;
  index: number;
  deadline: number;
  startedAt: string;
  completedAt?: string;
  routes: Record<number, string>;
  answers: Record<string, string>;
  flags: Record<string, boolean>;
  eliminated: Record<string, string[]>;
  notes: Record<string, string>;
  highlights?: Record<string, string[]>;
  times: Record<string, number>;
  graded?: boolean;
  audioPlayed?: Record<string, boolean>;
  selfScores?: Record<string, number>;
  native?: any;
};
const rw = [
  'Craft and Structure',
  'Information and Ideas',
  'Standard English Conventions',
  'Expression of Ideas',
];
export function examStages(exam: ExamKind, options: ExamOptions): ExamStage[] {
  if (options.stages) return options.stages;
  const definitions: [string, number, number, number, boolean][] =
    exam === 'SAT'
      ? [
          ['Reading and Writing · Module 1', 27, 32, 0, false],
          ['Reading and Writing · Module 2', 27, 32, 0, true],
        ]
      : exam === 'TOEFL'
        ? [
            ['Reading', 50, 30, 0, false],
            ['Listening', 47, 29, 0, false],
            ['Writing', 12, 23, 0, false],
            ['Speaking', 11, 8, 0, false],
          ]
        : [
            ['English', 50, 35, 0, false],
            ['Reading', 36, 40, options.writing ? 5 : 0, false],
            ...(options.writing
              ? [
                  ['Writing', 1, 40, 0, false] as [
                    string,
                    number,
                    number,
                    number,
                    boolean,
                  ],
                ]
              : []),
          ];
  return definitions.map(([title, count, minutes, rest, adaptive], stage) => {
    const section = title.split(' · ')[0],
      slots: ExamSlot[] = [];
    for (const route of (adaptive
      ? ['lower', 'higher']
      : ['standard']) as ExamSlot['route'][])
      for (let index = 0; index < count; index++) {
        let domain = section,
          group: string | undefined;
        if (exam === 'SAT')
          domain =
            index < 8 ? rw[0] : index < 15 ? rw[1] : index < 22 ? rw[2] : rw[3];
        else if (section === 'English') {
          const g =
            index < 40
              ? Math.floor(index / 10)
              : 4 + Math.floor((index - 40) / 5);
          group = 'english-' + g;
          domain =
            index % 5 < 3
              ? 'Conventions of Standard English'
              : index % 5 === 3
                ? 'Production of Writing'
                : 'Knowledge of Language';
        } else if (section === 'Reading') {
          group = 'reading-' + Math.floor(index / 9);
          domain =
            index % 9 < 4
              ? 'Key Ideas and Details'
              : index % 9 < 7
                ? 'Craft and Structure'
                : 'Integration of Knowledge and Ideas';
        }
        slots.push({
          id: stage + '-' + route + '-' + index,
          stage,
          index,
          domain,
          type: section === 'Writing' ? 'subjective' : 'choice',
          group,
          route,
        });
      }
    return {
      id: String(stage),
      title,
      section,
      count,
      seconds: minutes * 60,
      breakAfter: rest * 60,
      adaptive,
      slots,
    };
  });
}
export function examNode(
  exam: ExamKind,
  slot: ExamSlot,
  stage: ExamStage,
): Node {
  return {
    id:
      'exam-' +
      exam.toLowerCase() +
      '-' +
      slot.domain.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-'),
    subject: 'ce',
    course: exam + ' 英语专项模拟',
    unit: stage.section,
    chapter: slot.domain,
    title: slot.domain,
    description: exam + ' · ' + slot.domain,
    skills: [{ id: 'apply', title: slot.domain, difficulty: 3 }],
    prerequisites: [],
    relatedNodes: [],
    importance: 0.8,
    examWeight: 0.8,
    source: exam + ' 知识框架',
    version: '1.0.0',
    tags: ['exam'],
  };
}
export const allSlots = (paper: ExamPaper) =>
  examStages(paper.exam, paper.options).flatMap((s) => s.slots);
export const paperReady = (p: ExamPaper, questions?: Question[]) =>
  p.format === EXAM_FORMAT &&
  allSlots(p).length > 0 &&
  allSlots(p).every(
    (s) =>
      typeof p.questions[s.id] === 'string' &&
      (!questions ||
        questions.some(
          (q) =>
            q.id === p.questions[s.id] &&
            (q.verified || p.origin === 'imported'),
        )),
  );
export function stageSlots(paper: ExamPaper, run: ExamRun, stage = run.stage) {
  const s = examStages(paper.exam, paper.options)[stage];
  return (
    s?.slots.filter((x) => x.route === (run.routes[stage] ?? 'standard')) ?? []
  );
}
export function createRun(p: ExamPaper, now = Date.now()): ExamRun {
  if (!paperReady(p)) throw new Error('英语专项完整试卷尚未准备好');
  return {
    id: 'exam-run:' + crypto.randomUUID(),
    native: { fresh: true },
    kind: 'exam-run',
    paperId: p.id,
    exam: p.exam,
    status: 'active',
    stage: 0,
    index: 0,
    deadline: now + examStages(p.exam, p.options)[0].seconds * 1000,
    startedAt: new Date(now).toISOString(),
    routes: {},
    answers: {},
    flags: {},
    eliminated: {},
    notes: {},
    highlights: {},
    times: {},
  };
}
export function nextStage(
  p: ExamPaper,
  run: ExamRun,
  questions: Question[],
  now = Date.now(),
): ExamRun {
  if (run.status === 'complete') return run;
  const stages = examStages(p.exam, p.options),
    current = stages[run.stage];
  const next = { ...run, routes: { ...run.routes }, index: 0 };
  if (run.status === 'active' && current.breakAfter)
    return {
      ...next,
      status: 'break',
      deadline: now + current.breakAfter * 1000,
    };
  if (run.stage + 1 >= stages.length)
    return {
      ...next,
      status: 'complete',
      completedAt: new Date(now).toISOString(),
      deadline: 0,
    };
  next.stage++;
  next.status = 'active';
  next.deadline = now + stages[next.stage].seconds * 1000;
  if (stages[next.stage].adaptive) {
    const items = stageSlots(p, run);
    const correct = items.reduce((n, s) => {
      const q = questions.find((q) => q.id === p.questions[s.id]);
      return n + (q ? objectiveScore(q, run.answers[s.id] ?? '') : 0);
    }, 0);
    next.routes[next.stage] =
      correct / items.length >= 0.65 ? 'higher' : 'lower';
  }
  return next;
}
export function expireRun(
  p: ExamPaper,
  run: ExamRun,
  questions: Question[],
  now = Date.now(),
) {
  if (p.options.practice) return run;
  let next = run;
  let guard = 0;
  while (next.status !== 'complete' && now >= next.deadline && guard++ < 12)
    next = nextStage(p, next, questions, next.deadline);
  return next;
}
