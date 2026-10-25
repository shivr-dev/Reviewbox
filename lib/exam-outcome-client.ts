import { currentNamespace, loadData, put } from './store';
import { localDay, type Exam } from './model';
import { updateExamRecord } from './exam-schedule-client';
import {
  validateGpaConfig,
  validResult,
  validExamDate,
  type GpaConfig,
} from './exam-outcomes';
export async function saveExamScore(
  id: string,
  result: NonNullable<Exam['result']>,
  ns = currentNamespace(),
) {
  if (ns !== currentNamespace())
    throw new Error('学习账户已切换，请重新打开成绩录入');
  if (!validResult(result) || Date.parse(result.recordedAt) > Date.now() + 1000)
    throw new Error('请填写有效得分、满分和学分；得分不能超过满分');
  await updateExamRecord(
    id,
    (exam) => {
      if (!validExamDate(exam.date) || exam.date > localDay(new Date()))
        throw new Error('考试日期无效或尚未开始，暂不能录入成绩');
      return { ...exam, result, scoreReminderAfter: undefined };
    },
    ns,
  );
}
export async function deferExamScore(id: string, ns = currentNamespace()) {
  await updateExamRecord(
    id,
    (exam) => ({
      ...exam,
      scoreReminderAfter: new Date(Date.now() + 86400000).toISOString(),
    }),
    ns,
  );
}
export async function saveGpaConfig(raw: GpaConfig, ns = currentNamespace()) {
  const config = validateGpaConfig(raw),
    data = await loadData(ns);
  if (ns !== currentNamespace()) throw new Error('学习账户已切换');
  await put(
    'setting',
    { ...data.settings, examGpa: config },
    'settings',
    false,
    ns,
  );
}
export async function saveDailyTime(minutes: number, ns = currentNamespace()) {
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 120)
    throw new Error('每日时间应为 10–120 分钟');
  const data = await loadData(ns);
  if (ns !== currentNamespace()) throw new Error('学习账户已切换');
  await put(
    'setting',
    {
      ...data.settings,
      dailyMinutes: minutes,
      assistant: data.settings.assistant
        ? { ...data.settings.assistant, dailyMinutes: minutes }
        : undefined,
    },
    'settings',
    false,
    ns,
  );
}
