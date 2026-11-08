import { naviUnderstandingCheck } from './navi-understanding';
import { naviQuoteMatches } from './navi-model-response';
import { naviConfigurationAction } from './navi-configuration';
import { z } from 'zod';
import type { StudyData } from './model';
import { naviUIAction } from './navi-ui';
import { retrieveMaterial, selectRelated } from './navi-retrieval';

export const NAVI_BRAND = {
  name: 'Navi',
  icon: 'compass',
  version: 1,
} as const;
export const naviContextSchema = z
  .object({
    context_type: z.enum([
      'question',
      'course',
      'pack',
      'material',
      'plan',
      'subject',
      'web',
    ]),
    source_id: z.string().min(1).max(200),
    source_version: z.string().max(120),
    title: z.string().max(300),
    relevant_content: z.string().max(16000),
    selected_text: z.string().max(1800).default(''),
    related_question_ids: z.array(z.string().max(200)).max(6),
    knowledge_refs: z.array(z.string().max(200)).max(12),
    source_location: z
      .object({
        page: z.number().int().positive().optional(),
        external_url: z.string().url().max(1000).optional(),
        section_id: z.string().max(200).optional(),
        section_title: z.string().max(300).optional(),
        package_id: z.string().max(200).optional(),
        package_version: z.string().max(120).optional(),
      })
      .strict(),
    provenance: z.enum([
      'learning-pack',
      'original-material',
      'course',
      'question',
      'learning-evidence',
      'learning-plan',
      'web-reference',
    ]),
  })
  .strict();
export type NaviContext = z.infer<typeof naviContextSchema>;
export type NaviTarget = {
  type: Exclude<NaviContext['context_type'], 'web'>;
  id: string;
  sectionId?: string;
  selectedText?: string;
  questionId?: string;
  page?: number;
};
export function naviContentVersion(value: unknown) {
  let hash = 2166136261;
  for (const ch of JSON.stringify(value)) {
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  }
  return 'content-' + (hash >>> 0).toString(16);
}
export class NaviError extends Error {
  constructor(
    public code:
      | 'context'
      | 'timeout'
      | 'format'
      | 'citation'
      | 'save'
      | 'request',
    cause?: unknown,
  ) {
    super(code);
    this.name = 'NaviError';
    this.cause = cause;
  }
}
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';
const bounded = (value: unknown, max = 16000) =>
  JSON.stringify(value).slice(0, max);
/** Resolve only a selected source in the active account snapshot. Never accept arbitrary content from an event. */
export function resolveNaviContext(
  data: StudyData,
  target: NaviTarget,
  message = '',
): NaviContext {
  const base = {
    context_type: target.type,
    source_id: target.id,
    source_version: '',
    title: '',
    relevant_content: '',
    related_question_ids: [] as string[],
    knowledge_refs: [] as string[],
    source_location: {} as NaviContext['source_location'],
    selected_text: text(target.selectedText, 1800),
    provenance: 'question' as NaviContext['provenance'],
  };
  if (target.type === 'question') {
    const q = data.questions.find((q) => q.id === target.id);
    if (!q) throw new NaviError('context');
    base.title = text(q.prompt, 120);
    base.source_version = naviContentVersion(q);
    base.related_question_ids = [q.id];
    base.knowledge_refs = [q.nodeId];
    const pack = data.packs.find((p) => p.questionIds?.includes(q.id));
    if (pack)
      base.source_location = {
        package_id: pack.id,
        package_version: pack.version,
      };
    base.relevant_content = bounded({
      id: q.id,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      solution: q.solution,
      rubric: (q as any).rubric,
      gradingRules: (q as any).gradingRules,
      diagram: q.diagram,
      images: (q as any).images,
      source: q.source,
    });
    base.provenance = 'question';
  } else if (target.type === 'course') {
    const course = data.jobs?.find(
      (c) => c.kind === 'course' && c.id === target.id,
    );
    const section = course?.sections?.find(
      (s: any) =>
        s.id === (target.sectionId ?? course.sections[course.current]?.id),
    );
    if (!course || !section) throw new NaviError('context');
    base.title = text(section.title ?? course.title, 300);
    base.source_version = String(section.revision ?? 1);
    base.provenance = 'course';
    base.source_location = {
      section_id: section.id,
      section_title: base.title,
    };
    base.relevant_content = bounded(
      { source: text(section.source, 6000), content: section.content },
      16000,
    );
    base.knowledge_refs = ['lesson-node:' + section.id];
  } else if (target.type === 'material') {
    const m = data.materials.find((m) => m.id === target.id);
    if (!m) throw new NaviError('context');
    base.title = m.name;
    base.source_version = m.date;
    base.knowledge_refs = m.nodeIds.slice(0, 12);
    base.provenance = 'original-material';
    // Do not invent page numbers: extracted material currently stores no page map.
    const retrieved = retrieveMaterial(
      m.text,
      [message, target.selectedText].filter(Boolean).join(' '),
    );
    base.relevant_content = bounded(
      {
        fileName: m.name,
        originalType: m.type,
        retrieval: {
          method: retrieved.method,
          totalSegments: retrieved.totalSegments,
          matched: retrieved.matched,
        },
        excerpts: retrieved.items,
      },
      16000,
    );
  } else if (target.type === 'subject') {
    const nodes = data.nodes.filter(
      (n) => target.id === 'all' || n.subject === target.id,
    );
    base.title = target.id;
    base.source_version = naviContentVersion(
      nodes.map((n) => ({ id: n.id, title: n.title })),
    );
    base.provenance = 'learning-pack';
    const selected = selectRelated(
      nodes,
      message,
      (n) => n.title + ' ' + n.skills.map((s) => s.title).join(' '),
      12,
    ).items;
    base.knowledge_refs = selected.map((n) => n.id);
    base.relevant_content = bounded({
      subject: target.id,
      knowledge: selected.map((n) => ({
        id: n.id,
        title: n.title,
        chapter: n.chapter,
        skills: n.skills,
      })),
      notice: 'Subject directory only. No mastery or score inferred.',
    });
  } else if (target.type === 'plan') {
    // An already-computed recommendation is supplied by the caller, not recalculated by AI.
    base.title = 'Study Director';
    base.provenance = 'learning-plan';
    base.source_version = naviContentVersion(data.settings.assistant ?? {});
    const latest = (data.jobs ?? [])
      .filter((j) => j.kind === 'study-recommendation')
      .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))[0];
    base.relevant_content = bounded({
      dailyMinutes:
        data.settings.assistant?.dailyMinutes ?? data.settings.dailyMinutes,
      studyMode: data.settings.studyMode,
      recommendation: latest
        ? {
            at: latest.at,
            selectedId: latest.selectedId,
            candidates: latest.candidates?.slice(0, 3).map((c: any) => ({
              id: c.id,
              kind: c.kind,
              reasons: c.reasons,
              estimatedMinutes: c.estimatedMinutes,
              rejection: c.rejection,
            })),
          }
        : null,
      notice:
        'Read-only planning evidence. No replacement scheduling or mastery calculation.',
    });
  } else {
    const pack = data.packs.find(
      (p) => p.id === target.id || (p as any).publicId === target.id,
    );
    if (!pack) throw new NaviError('context');
    base.title = pack.title;
    base.source_version = pack.version;
    base.provenance = 'learning-pack';
    const ids = new Set(pack.questionIds ?? []);
    const questions = data.questions.filter((q) => ids.has(q.id));
    const nodes = data.nodes.filter(
        (n) =>
          pack.nodeIds?.includes(n.id) ||
          questions.some((q) => q.nodeId === n.id),
      ),
      directory = nodes.map((n) => ({
        id: n.id,
        title: n.title,
        chapter: n.chapter,
        skills: n.skills.map((s) => s.title),
      }));
    const retrieved = selectRelated(
      questions,
      message,
      (q) =>
        [
          q.id,
          q.prompt,
          q.explanation,
          q.tags?.join(' '),
          directory.find((n) => n.id === q.nodeId)?.title,
        ].join(' '),
      4,
      (q) => q.nodeId,
    );
    const selected = target.questionId
      ? questions.filter((q) => q.id === target.questionId)
      : message
        ? retrieved.items
        : [];
    if (target.questionId && !selected.length) throw new NaviError('context');
    base.related_question_ids = selected.map((q) => q.id);
    base.knowledge_refs = [...new Set(selected.map((q) => q.nodeId))].slice(
      0,
      12,
    );
    base.source_location = {
      package_id: pack.id,
      package_version: pack.version,
    };
    const excerpts = selected.map((q) => ({
      package_id: pack.id,
      package_version: pack.version,
      question_id: q.id,
      question_version: q.version,
      nodeId: q.nodeId,
      prompt: q.prompt.slice(0, 1600),
      options: q.options,
      answer: q.answer.slice(0, 1200),
      explanation: q.explanation.slice(0, 1800),
      solution: q.solution?.slice(0, 8),
      diagram:
        q.diagram && JSON.stringify(q.diagram).length < 2500
          ? q.diagram
          : undefined,
      diagramOmitted: !!q.diagram && JSON.stringify(q.diagram).length >= 2500,
      source: q.source,
    }));
    const result = {
      manifest: {
        id: pack.id,
        title: pack.title,
        version: pack.version,
        description: pack.description,
        subject: pack.subject,
      },
      directory: selectRelated(directory, message, (n) => JSON.stringify(n), 16)
        .items,
      retrieval: {
        totalQuestions: questions.length,
        matched: retrieved.matched,
        method: retrieved.method,
        selectedQuestionIds: selected.map((q) => q.id),
        coverage:
          'Only the directory and selected excerpts were retrieved; this is not a full-pack review.',
      },
      questions: excerpts,
    };
    while (JSON.stringify(result).length > 16000 && result.questions.length)
      result.questions.pop();
    base.related_question_ids = result.questions.map((q) => q.question_id);
    base.relevant_content = bounded(result);
  }
  return naviContextSchema.parse(base);
}
export const naviTutorAction = z
  .object({
    type: z.enum([
      'openCourse',
      'openQuestion',
      'openKnowledgeNode',
      'openLearningPack',
      'locateMaterialSource',
    ]),
    id: z.string().min(1).max(200),
  })
  .strict();
export const naviAnswerSchema = z
  .object({
    reply: z.string().min(1).max(12000),
    citations: z
      .array(
        z
          .object({
            source_id: z.string(),
            source_version: z.string(),
            quote: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(8),
    supplementary: z.boolean(),
    understanding_check: naviUnderstandingCheck.optional(),
    ui_actions: z.array(naviUIAction).max(12).optional(),
    tutor_actions: z.array(naviTutorAction).max(5).optional(),
    configuration_actions: z.array(naviConfigurationAction).max(1).optional(),
  })
  .strict();
export function verifyNaviAnswer(input: unknown, contexts: NaviContext[]) {
  const parsed = naviAnswerSchema.safeParse(input);
  if (!parsed.success) throw new NaviError('format');
  for (const citation of parsed.data.citations) {
    const source = contexts.find(
      (c) =>
        c.source_id === citation.source_id &&
        c.source_version === citation.source_version,
    );
    if (!source || !naviQuoteMatches(source.relevant_content, citation.quote))
      throw new NaviError('citation');
  }
  if (!parsed.data.citations.length) parsed.data.supplementary = true;
  return parsed.data;
}
export function naviSearchConditions(context: NaviContext, data: StudyData) {
  const nodes = data.nodes.filter((n) => context.knowledge_refs.includes(n.id));
  return {
    keyword: nodes
      .slice(0, 3)
      .map((n) => n.title)
      .join(' '),
    subject: nodes[0]?.subject ?? '',
  };
}
