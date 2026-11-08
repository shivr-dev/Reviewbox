import { z } from 'zod';
import { localDay, SUBJECTS, type StudyData } from './model';
import { gpaConfig } from './exam-outcomes';

const subject = z.enum([
  'chinese',
  'math',
  'english',
  'ce',
  'physics',
  'chemistry',
  'biology',
  'history',
]);
const examFields = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    subject: subject.optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    target: z.number().min(1).max(100).optional(),
    dailyMinutes: z.number().min(5).max(180).optional(),
    scope: z.array(z.string().min(1).max(200)).max(500).optional(),
  })
  .strict();
/** Proposals only. No grade, mastery, deletion, credentials or arbitrary setting keys. */
export const naviConfigurationAction = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('setGpaRule'),
      changes: z
        .object({
          scale: z.number().min(1).max(10).optional(),
          formula: z.string().trim().min(1).max(240).optional(),
          weighted: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('createExam'), changes: examFields }).strict(),
  z
    .object({
      type: z.literal('updateExam'),
      examId: z.string().min(1).max(200),
      changes: examFields,
    })
    .strict(),
  z
    .object({
      type: z.literal('setDailyTime'),
      minutes: z.number().int().min(10).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal('setLearningPreferences'),
      changes: z
        .object({
          mode: z.enum(['auto', 'guided', 'manual']).optional(),
          weights: z
            .partialRecord(subject, z.number().min(0).max(5))
            .optional(),
        })
        .strict()
        .refine(
          (v) =>
            v.mode !== undefined ||
            (!!v.weights && Object.keys(v.weights).length > 0),
        ),
    })
    .strict(),
  z
    .object({
      type: z.literal('setExamScheduled'),
      examId: z.string().min(1).max(200),
      enabled: z.boolean(),
    })
    .strict(),
]);
export type NaviConfigurationAction = z.infer<typeof naviConfigurationAction>;
export function learningPreferences(data: StudyData) {
  return {
    mode: data.settings.studyMode ?? 'guided',
    weights: Object.fromEntries(
      SUBJECTS.map((s) => [
        s.id,
        data.settings.assistant?.weights?.[s.id] ?? 3,
      ]),
    ),
  };
}
/** Offline fallback opens an editable tool; it does not pretend to understand missing details. */
export function offlineConfigurationRequest(
  text: string,
): NaviConfigurationAction | undefined {
  if (/不要|别|別|什么|什麼|如何|怎么|怎麼|what|how|don.t|do not/i.test(text))
    return;
  if (
    /^(?:请|請|帮我|幫我|please\s*)?(?:修改|调整|調整|设置|設定|change|set|edit)\s*(?:GPA|gpa)/i.test(
      text,
    )
  )
    return { type: 'setGpaRule', changes: {} };
  if (
    /^(?:请|請|帮我|幫我|please\s*)?(?:添加|新增|新建|安排|add|create|schedule)\s*(?:一个|一個|一场|一場|an?\s*)?(?:考试|考試|exam)/i.test(
      text,
    )
  )
    return { type: 'createExam', changes: {} };
  const time = text
    .trim()
    .match(/^(?:每天|每日)(?:学习|學習)\s*(\d{1,3})\s*分钟[。！!]?$/);
  if (time) {
    const minutes = Number(time[1]);
    if (minutes >= 10 && minutes <= 120)
      return { type: 'setDailyTime', minutes };
  }
}
export const configurationIntent = (text: string) =>
  /gpa|考试|考試|期中|期末|exam\b|examen|épreuve|試験|시험|экзамен|(?:每天|每日|毎日).*?(?:分钟|分鐘|時間|时间|分)|daily.*(?:minutes|time)|quotidien|diari|매일|ежеднев|学科.*(?:重点|比重|权重)|學科.*(?:重點|比重|權重)|学习模式|學習模式|study mode|subject.*(?:weight|priority)|guided|manual|auto|モード|모드|poids|modo|режим/i.test(
    text,
  );
/** Send a small configuration catalogue only for an explicit configuration request. Never grades/history. */
export function configurationContext(data: StudyData, text: string) {
  if (!configurationIntent(text)) return undefined;
  return {
    today: localDay(new Date()),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    gpa: gpaConfig(data),
    dailyMinutes: data.settings.dailyMinutes,
    preferences: learningPreferences(data),
    exams: data.exams
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40)
      .map((e) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        date: e.date,
        target: e.target,
        dailyMinutes: e.dailyMinutes,
        scope: e.scope,
        scheduled: e.scheduleStatus !== 'cancelled',
      })),
    nodes: /范围|範圍|scope|topic|章节|章節/.test(text)
      ? data.nodes
          .slice(0, 150)
          .map((n) => ({ id: n.id, title: n.title, subject: n.subject }))
      : [],
  };
}
/** Immutable target fingerprint, rechecked within the eventual write transaction. */
export function configurationBaseline(
  data: StudyData,
  action: NaviConfigurationAction,
) {
  if (action.type === 'setGpaRule') return JSON.stringify(gpaConfig(data));
  if (action.type === 'setDailyTime')
    return JSON.stringify(data.settings.dailyMinutes ?? null);
  if (action.type === 'setLearningPreferences')
    return JSON.stringify(learningPreferences(data));
  if (action.type === 'updateExam' || action.type === 'setExamScheduled')
    return JSON.stringify(
      data.exams.find((e) => e.id === action.examId) ?? null,
    );
  return 'new';
}
