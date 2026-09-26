export const SUBJECTS = [
  {
    id: 'chinese',
    name: '语文',
    en: 'Chinese',
    glyph: '文',
    course: '初中语文',
    color: '#ac5a4c',
  },
  {
    id: 'math',
    name: '数学',
    en: 'Mathematics',
    glyph: '𝑥',
    course: '初中数学',
    color: '#626bb0',
  },
  {
    id: 'english',
    name: '英语',
    en: 'English',
    glyph: 'En',
    course: 'Keyterms & Writing',
    color: '#8b789b',
  },
  {
    id: 'ce',
    name: '中教英语 CE',
    en: 'Chinese English',
    glyph: 'CE',
    course: 'SAT / ACT · Grammar',
    color: '#5893a6',
  },
  {
    id: 'physics',
    name: '物理',
    en: 'Physics',
    glyph: 'φ',
    course: '大陆初中物理',
    color: '#508686',
  },
  {
    id: 'chemistry',
    name: '化学',
    en: 'Chemistry',
    glyph: '化',
    course: '九年级化学',
    color: '#5b987c',
  },
  {
    id: 'biology',
    name: '生物',
    en: 'Biology',
    glyph: '生',
    course: '初中生物学',
    color: '#697c52',
  },
  {
    id: 'history',
    name: '历史',
    en: 'History',
    glyph: '史',
    course: '历史与社会',
    color: '#aa8b57',
  },
] as const;
export type Subject = (typeof SUBJECTS)[number]['id'];
export type Skill = { id: string; title: string; difficulty: number };
export type Node = {
  id: string;
  subject: Subject;
  course: string;
  unit: string;
  chapter: string;
  title: string;
  description: string;
  prerequisites: string[];
  relatedNodes: string[];
  importance: number;
  examWeight: number;
  skills: Skill[];
  source: string;
  version: string;
  tags?: string[];
};
export type Diagram = {
  type: 'geometry' | 'function_graph' | 'physics';
  canvas?: { width: number; height: number };
  points?: { id: string; x: number; y: number }[];
  segments?: string[][];
  labels?: boolean;
  functions?: { expression: string; label: string }[];
  xRange?: number[];
  yRange?: number[];
  showGrid?: boolean;
  showAxes?: boolean;
  circles?: { x: number; y: number; r: number; label?: string }[];
  arrows?: { x1: number; y1: number; x2: number; y2: number; label?: string }[];
  polygons?: { points: number[][]; fill?: string }[];
  angles?: {
    x: number;
    y: number;
    r: number;
    start: number;
    end: number;
    label?: string;
  }[];
  labelsText?: { x: number; y: number; text: string }[];
  rects?: {
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string;
    liquid?: boolean;
  }[];
};
export type RubricItem = {
  id: string;
  title: string;
  max: number;
  description: string;
  skillId: string;
};
export type Question = {
  examTask?: import('./exam-model').ExamTask;
  schemaVersion: 1;
  id: string;
  nodeId: string;
  skillId: string;
  subject: Subject;
  type: string;
  prompt: string;
  answer: string;
  explanation: string;
  difficulty: number;
  expectedSeconds: number;
  variant: string;
  options?: string[];
  acceptedAnswers?: string[];
  matching?: {
    left: { id: string; text: string }[];
    right: { id: string; text: string }[];
  };
  transferFrom?: string;
  collectionId?: string;
  collectionTitle?: string;
  passage?: string;
  rubric?: RubricItem[];
  solution?: string[];
  diagram?: Diagram;
  source: string;
  tags: string[];
  verified?: boolean;
  verification?: { method: string; solverCount: number; at: string };
  expiresAt?: string;
  version: string;
};
export type Grade = {
  criteria: {
    id: string;
    score: number;
    evidence: string;
    missing: string;
    suggestion: string;
  }[];
  score: number;
  maxScore: number;
  label: string;
  exampleAnswer: string;
  feedback: string;
  model: string;
};
export type AnswerEvent = {
  id: string;
  questionId: string;
  nodeId: string;
  skillId: string;
  subject: Subject;
  outcome: 'correct' | 'unsure' | 'wrong';
  score: number;
  source: 'self' | 'rubric' | 'test';
  grade?: Grade;
  answer?: string;
  occurredAt: string;
  displayedAt: string;
  revealedAt: string;
  activeThinkMs: number;
  expectedSeconds: number;
  difficulty: number;
  variant: string;
  usedHint: boolean;
  reason: string;
  sessionId: string;
  localDay: string;
  version: 1;
  targets?: { skillId: string; score: number; weight: number }[];
  evidenceWeight?: number;
  predictedConfidence?: 'sure' | 'unsure' | 'guess';
};
export type Mastery = {
  nodeId: string;
  skillId: string;
  mastery: number;
  stability: number;
  confidence: number;
  lastReviewed: string | null;
  lastSuccess: string | null;
  checkpoint: string | null;
  checkpointVariant: string;
  stage: number;
  nextReview: string | null;
  attemptCount: number;
  errorCount: number;
  gainDay: string;
  dailyGain: number;
  lastFailure: string | null;
};
export type Exam = {
  id: string;
  title: string;
  subject: Subject;
  date: string;
  scope: string[];
  target: number;
  dailyMinutes: number;
};
export type Note = { id: string; nodeId: string; body: string };
export type Material = {
  id: string;
  name: string;
  subject: Subject;
  text: string;
  nodeIds: string[];
  date: string;
  type: string;
};
export type TestResult = {
  id: string;
  title: string;
  subject: Subject | 'all';
  sessionId: string;
  eventIds: string[];
  at: string;
  scope: string[];
};
export type Pack = {
  schemaVersion: 1;
  manifest: {
    id: string;
    title: string;
    version: string;
    subject: string;
    description: string;
    changelog: string;
    compatibility: string;
  };
  knowledge: Node[];
  questions: Question[];
  keyterms?: unknown[];
  rubrics?: unknown[];
};
export type RecordKind =
  | 'node'
  | 'question'
  | 'event'
  | 'exam'
  | 'note'
  | 'material'
  | 'setting'
  | 'test'
  | 'pack'
  | 'job';
export type LocalRecord = {
  id: string;
  kind: RecordKind;
  payload: any;
  updated_at: string;
  deleted: boolean;
};
export type StudyData = {
  jobs?: any[];
  nodes: Node[];
  questions: Question[];
  events: AnswerEvent[];
  exams: Exam[];
  notes: Note[];
  materials: Material[];
  tests: TestResult[];
  packs: Pack['manifest'][];
  settings: { dailyMinutes: number; name: string; surprise: boolean };
};
export type QueueItem = {
  question: Question;
  reason: string;
  priority: number;
  scaffold?: string;
};
export const keyOf = (nodeId: string, skillId: string) =>
  `${nodeId}::${skillId}`;
export const subjectName = (id: string) =>
  SUBJECTS.find((s) => s.id === id)?.name ?? id;
export const uid = () => crypto.randomUUID();
export const localDay = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
