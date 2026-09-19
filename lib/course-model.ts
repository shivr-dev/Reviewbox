import { z } from 'zod';
import { courseErrorMessage } from './course-errors';
import { reconcileCourseQuotes } from './course-sources';
import { SUBJECTS, type Subject, type Question, type Node } from './model';
export const legacyCourseContentSchema = z.object({
  format: z.literal('structured').optional(),
  html: z.undefined().optional(),
  title: z.string().min(2).max(160),
  objectives: z.array(z.string().min(5).max(350)).min(2).max(6),
  concepts: z
    .array(
      z.object({
        title: z.string().min(2).max(160),
        explanation: z.string().min(180).max(6000),
        why: z.string().min(40).max(2000),
        example: z.object({
          prompt: z.string().min(10).max(2000),
          steps: z.array(z.string().min(10).max(1200)).min(3).max(7),
          answer: z.string().min(5).max(1500),
        }),
        misconception: z.string().min(10).max(1000),
        correction: z.string().min(30).max(1500),
      }),
    )
    .min(2)
    .max(5),
  comparison: z.object({
    title: z.string().max(160),
    columns: z.array(z.string()).length(3),
    rows: z
      .array(z.array(z.string().max(700)).length(3))
      .min(2)
      .max(6),
  }),
  process: z.object({
    title: z.string().max(160),
    steps: z
      .array(
        z.object({
          title: z.string().max(150),
          explanation: z.string().min(35).max(1200),
        }),
      )
      .min(3)
      .max(7),
  }),
  checks: z
    .array(
      z.object({
        prompt: z.string().min(8).max(1800),
        options: z.array(z.string().min(1).max(800)).length(4),
        answer: z.string().min(1).max(800),
        explanation: z.string().min(50).max(2000),
        solution: z.array(z.string().min(1).max(1500)).length(5).optional(),
        skill: z.enum(['understand', 'apply', 'explain']),
      }),
    )
    .length(3),
  practice: z
    .array(
      z.object({
        prompt: z.string().min(8).max(2000),
        answer: z.string().min(15).max(2200),
        explanation: z.string().min(50).max(3000),
        solution: z.array(z.string().min(1).max(1500)).length(5).optional(),
        skill: z.enum(['understand', 'apply', 'explain']),
      }),
    )
    .length(2),
  recall: z.array(z.string().min(8).max(600)).min(2).max(5),
  sourceQuotes: z.array(z.string().min(2).max(800)).min(1).max(8),
  uncertainties: z.array(z.string().max(600)).max(8),
});
// Metadata tracks learning; prose length and step count do not establish quality.
// Mathematics still requires five steps in the independent verification stage.
const htmlTaskSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1).max(2200),
  explanation: z.string().trim().min(1).max(3000),
  solution: z
    .array(z.string().trim().min(1).max(1500))
    .min(1)
    .max(20)
    .optional(),
  skill: z.enum(['understand', 'apply', 'explain']),
});
export const htmlCourseSchema = z
  .object({
    format: z.literal('interactive-html'),
    title: z.string().min(2).max(160),
    html: z.string().min(100).max(150000),
    objectives: z.array(z.string().max(350)).max(12).default([]),
    checks: z
      .array(
        htmlTaskSchema.extend({
          options: z.array(z.string().trim().min(1).max(800)).length(4),
          answer: z.string().trim().min(1).max(800),
        }),
      )
      .min(1)
      .max(12),
    practice: z.array(htmlTaskSchema).min(1).max(12),
    sourceQuotes: z
      .array(z.string().trim().min(2).max(800))
      .max(12)
      .default([]),
    sourceWarnings: z.array(z.string().max(800)).max(12).default([]),
    uncertainties: z.array(z.string().max(600)).max(12).default([]),
  })
  .transform((value) => ({
    ...value,
    concepts: [],
    comparison: { title: '', columns: [], rows: [] },
    process: { title: '', steps: [] },
    recall: [],
  }));
export const courseContentSchema = z.union([
  z
    .object({
      format: z.literal('free-html'),
      title: z.string().min(1).max(200),
      html: z.string().min(1).max(200000),
    })
    .transform((value) => ({
      ...value,
      objectives: [],
      checks: [] as (z.infer<typeof htmlTaskSchema> & { options: string[] })[],
      practice: [] as z.infer<typeof htmlTaskSchema>[],
      sourceQuotes: [] as string[],
      uncertainties: [] as string[],
      concepts: [],
      comparison: { title: '', columns: [], rows: [] },
      process: { title: '', steps: [] },
      recall: [],
    })),
  htmlCourseSchema,
  legacyCourseContentSchema,
]);
export type CourseContent = z.infer<typeof courseContentSchema>;
export type CourseSection = {
  id: string;
  source: string;
  title: string;
  content?: CourseContent;
  pendingContent?: CourseContent;
  verification?: Question['verification'];
  draftParts?: Record<string, unknown>;
  draftRepairs?: Record<string, unknown>;
  revision: number;
  history: { content: CourseContent; revision: number; at: string }[];
  passed: string[];
  interactiveState?: Record<string, unknown>;
  completedAt?: string;
  error?: string;
  bookmarked?: boolean;
  studyMemo?: string;
};
export type Course = {
  id: string;
  kind: 'course';
  schemaVersion: 1;
  subject: Subject;
  title: string;
  source: string;
  sourceNames: string[];
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  sections: CourseSection[];
  current: number;
  status: 'preparing' | 'ready';
  chat: {
    role: 'user' | 'assistant';
    text: string;
    sectionId: string;
    at: string;
  }[];
};
export function splitCourseSource(raw: string, max = 3200): string[] {
  const text = raw.trim();
  if (!text) throw new Error('请提供教材内容、笔记或知识点');
  if (text.length > 60000)
    throw new Error('单门课程支持最多 60,000 字，请按章节分别建立课程');
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > max) {
    const cut = Math.max(
      remaining.lastIndexOf('\n', max),
      remaining.lastIndexOf('。', max),
      remaining.lastIndexOf('. ', max),
    );
    const at = cut > max / 2 ? cut + 1 : max;
    chunks.push(remaining.slice(0, at));
    remaining = remaining.slice(at);
  }
  if (remaining.trim()) chunks.push(remaining);
  return chunks;
}
export async function courseFingerprint(subject: Subject, source: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      subject + '\n' + source.trim().replace(/\r\n/g, '\n'),
    ),
  );
  return Array.from(new Uint8Array(hash), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}
export function courseNode(course: Course, section: CourseSection): Node {
  return {
    id: 'lesson-node:' + section.id,
    subject: course.subject,
    course: course.title,
    unit: '课程复习',
    chapter: section.title,
    title: section.content?.title ?? section.title,
    description:
      section.content?.objectives.join('；') || section.source.slice(0, 400),
    prerequisites: [],
    relatedNodes: [],
    importance: 0.8,
    examWeight: 0.7,
    skills: [
      { id: 'understand', title: '概念理解', difficulty: 2 },
      { id: 'apply', title: '迁移应用', difficulty: 3 },
      { id: 'explain', title: '解释与论证', difficulty: 3 },
    ],
    source: '个人课程资料',
    version: '1.0.0',
  };
}
export function courseQuestions(
  course: Course,
  section: CourseSection,
  kind: 'checks' | 'practice',
): Question[] {
  const content = section.content;
  if (!content) return [];
  const node = courseNode(course, section);
  return content[kind].map((q, i) => ({
    id: `lesson-q:${section.id}:${section.revision}:${kind}:${i}`,
    schemaVersion: 1,
    nodeId: node.id,
    skillId: q.skill,
    subject: course.subject,
    type: kind === 'checks' ? 'choice' : 'recall',
    prompt: q.prompt,
    answer: q.answer,
    explanation: q.explanation,
    solution: q.solution,
    verified: !!section.verification,
    verification: section.verification,
    options: 'options' in q ? q.options : undefined,
    difficulty: kind === 'checks' ? 2 : 3,
    expectedSeconds: kind === 'checks' ? 45 : 90,
    variant: section.id + ':' + kind + ':' + i,
    source: course.title + ' · ' + content.title,
    tags: [
      'course-content',
      kind === 'checks' ? 'course-check' : 'course-practice',
    ],
    version: String(section.revision),
  }));
}
export function validateCourseContent(input: unknown, source: string) {
  const schema =
    (input as { format?: unknown } | null)?.format === 'interactive-html'
      ? htmlCourseSchema
      : courseContentSchema;
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(courseErrorMessage(result.error));
  const c = result.data;
  if (
    new Set(c.concepts.map((x) => x.title.trim())).size !== c.concepts.length ||
    new Set(c.checks.map((x) => x.prompt.trim())).size !== c.checks.length
  )
    throw new Error('课件包含重复讲解或检验题，未予采用；可继续编制');
  for (const q of c.checks)
    if (new Set(q.options).size !== 4 || !q.options.includes(q.answer))
      throw new Error('课程检验题的答案或选项不完整，请重试');
  const references = reconcileCourseQuotes(
    [...c.sourceQuotes, ...('sourceWarnings' in c ? c.sourceWarnings : [])],
    source,
  );
  if (c.format === 'interactive-html') {
    // An unmatched quotation is not evidence. Keep it visibly pending review,
    // without discarding the lesson or fabricating a replacement quotation.
    c.sourceQuotes = references.matched.slice(0, 12);
    c.sourceWarnings = references.unmatched.slice(0, 12);
  } else if (references.unmatched.length) {
    throw new Error('教材引文与原始资料不一致，请核对引用内容。');
  }
  return c;
}
export function replaceCourseSection(
  course: Course,
  sectionId: string,
  content: CourseContent,
) {
  return {
    ...course,
    updatedAt: new Date().toISOString(),
    sections: course.sections.map((s) =>
      s.id !== sectionId
        ? s
        : {
            ...s,
            title: content.title,
            content,
            revision: s.revision + 1,
            history: s.content
              ? [
                  ...s.history,
                  {
                    content: s.content,
                    revision: s.revision,
                    at: new Date().toISOString(),
                  },
                ].slice(-5)
              : s.history,
            passed: [],
            interactiveState: undefined,
            completedAt: undefined,
          },
    ),
  };
}
export const courseSubjectSchema = z.enum(
  SUBJECTS.map((s) => s.id) as [Subject, ...Subject[]],
);
