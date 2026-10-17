import {
  localDay,
  type StudyData,
  type Subject,
  type AnswerEvent,
} from '../lib/model';
import {
  EXAM_FORMAT,
  allSlots,
  type ExamKind,
  type ExamPaper,
} from '../lib/exam-model';
export function fixture(subject: Subject = 'math'): StudyData {
  const nodes = Array.from({ length: 3 }, (_, i) => ({
    id: 'plan-' + subject + '-' + i,
    subject,
    title: '能力 ' + i,
    course: subject,
    unit: '',
    chapter: '',
    description: '',
    importance: 0.8,
    examWeight: 0.8,
    prerequisites: [],
    relatedNodes: [],
    skills: [{ id: 's', title: '应用', difficulty: 2 }],
    source: 'manual',
    version: '1',
  }));
  return {
    nodes,
    questions: nodes.flatMap((n, i) =>
      Array.from({ length: 8 }, (_, j) => ({
        schemaVersion: 1 as const,
        id: n.id + '-q' + j,
        nodeId: n.id,
        skillId: 's',
        subject,
        type: 'choice' as const,
        prompt: '手动导入例题 ' + i + '-' + j,
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        explanation: '测试用解析',
        expectedSeconds: 60,
        difficulty: 2,
        variant: 'variant-' + i + '-' + j,
        tags: [],
        source: 'manual',
        version: '1',
        verified: true,
      })),
    ),
    events: [],
    exams: [],
    tests: [],
    jobs: [],
    notes: [],
    materials: [],
    packs: [],
    settings: { dailyMinutes: 90, name: '学习计划测试', surprise: false },
  };
}
export function attempt(
  d: StudyData,
  index: number,
  at: number,
  extra: Partial<AnswerEvent> = {},
): AnswerEvent {
  const q = d.questions[index],
    iso = new Date(at).toISOString();
  return {
    id: 'plan-event-' + index + '-' + at,
    questionId: q.id,
    nodeId: q.nodeId,
    skillId: q.skillId,
    subject: q.subject,
    score: 1,
    outcome: 'correct',
    source: 'self',
    answer: q.answer,
    occurredAt: iso,
    displayedAt: iso,
    revealedAt: iso,
    activeThinkMs: 30000,
    expectedSeconds: 60,
    difficulty: 2,
    variant: q.variant,
    usedHint: false,
    reason: '独立练习',
    sessionId: 'session-' + at,
    localDay: localDay(new Date(at)),
    version: 1,
    learningEvidence: { version: 1, assessment: 'objective' },
    ...extra,
  };
}
export function practiced(d: StudyData, now: number) {
  d.events = [0, 1, 2, 3, 8, 9, 10, 11].map((i, j) =>
    attempt(d, i, now - 3600000 - j * 60000),
  );
  return d;
}
export function schoolExam(d: StudyData, now: number, days = 4) {
  const at = new Date(now);
  at.setDate(at.getDate() + days);
  return {
    id: 'school-exam',
    title: d.nodes[0].subject === 'ce' ? 'SAT正式考试' : '数学月考',
    subject: d.nodes[0].subject,
    date: localDay(at),
    scope: [],
    target: 85,
    dailyMinutes: 30,
  };
}
export function importedPaper(
  d: StudyData,
  kind: ExamKind = 'SAT',
  now = Date.now(),
) {
  const p: ExamPaper = {
    id: 'paper-' + kind,
    kind: 'exam-paper',
    format: EXAM_FORMAT,
    exam: kind,
    options: {
      writing: false,
      ...(kind === 'MAP'
        ? { mapSection: 'Reading' as const, grade: 8, count: 3, poolSize: 3 }
        : {}),
    },
    origin: 'imported',
    createdAt: new Date(now - 86400000).toISOString(),
    status: 'ready',
    questions: {},
    passages: {},
  };
  for (const slot of allSlots(p)) {
    const q = {
      ...d.questions[slot.index % d.questions.length],
      id: 'paper-item-' + slot.id,
      variant: slot.id,
    };
    d.questions.push(q);
    p.questions[slot.id] = q.id;
  }
  d.jobs!.push(p);
  return p;
}
