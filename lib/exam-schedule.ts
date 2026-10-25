import { SUBJECTS, localDay, type Exam, type Node } from './model';
import { validExamDate } from './exam-outcomes';

/** Cancellation affects scheduling only. Historical results remain valid GPA evidence. */
export { isExamScheduled } from './model';
export type ExamDetails = Pick<
  Exam,
  | 'title'
  | 'subject'
  | 'date'
  | 'scope'
  | 'target'
  | 'dailyMinutes'
  | 'simulation'
>;
export function validateExamDetails(
  input: ExamDetails,
  nodes: Node[],
  previous?: Exam,
  now = Date.now(),
): ExamDetails {
  if (!input.title.trim() || input.title.trim().length > 100)
    throw new Error('考试名称应为 1–100 个字符');
  if (!SUBJECTS.some((s) => s.id === input.subject))
    throw new Error('请选择有效学科');
  if (!validExamDate(input.date)) throw new Error('请填写有效考试日期');
  const today = localDay(new Date(now));
  if (!previous && input.date < today)
    throw new Error('新考试日期不能早于今天');
  if (previous?.result && input.date > today)
    throw new Error('已有成绩的考试不能改到未来日期，请保留真实考试日期');
  if (!Number.isFinite(input.target) || input.target < 1 || input.target > 100)
    throw new Error('目标得分率应为 1–100%');
  if (
    !Number.isFinite(input.dailyMinutes) ||
    input.dailyMinutes < 5 ||
    input.dailyMinutes > 180
  )
    throw new Error('每日建议时间应为 5–180 分钟');
  const scope = [...new Set(input.scope)];
  if (
    scope.some(
      (id) => !nodes.some((n) => n.id === id && n.subject === input.subject),
    )
  )
    throw new Error('范围中有已删除或不属于该学科的知识点，请重新选择');
  const simulation = input.subject === 'ce' ? input.simulation : undefined;
  if (
    simulation &&
    !['SAT', 'ACT', 'TOEFL', 'MAP', 'DET'].includes(simulation.exam)
  )
    throw new Error('请选择有效的模拟考试类型');
  if (
    simulation?.exam === 'MAP' &&
    (!['Reading', 'Language Usage'].includes(simulation.mapSection ?? '') ||
      !Number.isInteger(simulation.grade) ||
      simulation.grade! < 2 ||
      simulation.grade! > 12)
  )
    throw new Error('MAP 需选择科目及 2–12 年级');
  return {
    title: input.title.trim(),
    subject: input.subject,
    date: input.date,
    target: input.target,
    dailyMinutes: input.dailyMinutes,
    scope,
    simulation,
  };
}
