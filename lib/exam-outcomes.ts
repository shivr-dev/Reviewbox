import { isExamScheduled } from './model';
import { localDay, type Exam, type StudyData } from './model';
export type GpaConfig = {
  scale: number;
  formula: string;
  weighted: boolean;
  from?: string;
  to?: string;
};
export const DEFAULT_GPA: GpaConfig = {
  scale: 4,
  formula: 'ratio * scale',
  weighted: true,
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validExamDate(date: string) {
  if (!datePattern.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}
export function validResult(
  result: Exam['result'],
): result is NonNullable<Exam['result']> {
  return (
    !!result &&
    Number.isFinite(result.score) &&
    Number.isFinite(result.maxScore) &&
    Number.isFinite(result.credits) &&
    result.maxScore > 0 &&
    result.maxScore <= 100000 &&
    result.score >= 0 &&
    result.score <= result.maxScore &&
    result.credits > 0 &&
    result.credits <= 100 &&
    Number.isFinite(Date.parse(result.recordedAt))
  );
}
/** Tiny arithmetic grammar; never executes code, property access, or arbitrary functions. */
export function gradePoint(
  formula: string,
  variables: Record<string, number>,
): number {
  if (!formula.trim() || formula.length > 240)
    throw new Error('公式长度应为 1–240 个字符');
  const tokens =
    formula.match(/\d+(?:\.\d+)?|\.\d+|[a-zA-Z]+|[+\-*/^(),]|\S/g) ?? [];
  if (tokens.length > 120) throw new Error('公式过于复杂');
  let i = 0,
    depth = 0;
  const take = (s: string) => (tokens[i] === s ? (i++, true) : false);
  function atom(): number {
    if (++depth > 20) throw new Error('公式括号过多');
    let v: number;
    if (take('(')) {
      v = expression();
      if (!take(')')) throw new Error('公式缺少右括号');
    } else {
      const token = tokens[i++];
      if (token && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token)) v = Number(token);
      else if (token && Object.hasOwn(variables, token)) v = variables[token];
      else if (
        token &&
        ['min', 'max', 'floor', 'ceil', 'round'].includes(token) &&
        take('(')
      ) {
        const args = [expression()];
        while (take(',')) args.push(expression());
        if (
          !take(')') ||
          args.length !== (token === 'min' || token === 'max' ? 2 : 1)
        )
          throw new Error('函数参数不正确');
        v =
          token === 'min'
            ? Math.min(...args)
            : token === 'max'
              ? Math.max(...args)
              : token === 'floor'
                ? Math.floor(args[0])
                : token === 'ceil'
                  ? Math.ceil(args[0])
                  : Math.round(args[0]);
      } else
        throw new Error(
          '公式仅支持数字、四则运算、ratio / percent / score / maxScore / scale 和 min、max、floor、ceil、round',
        );
    }
    depth--;
    return v;
  }
  function power(): number {
    let v = atom();
    if (take('^')) v = v ** unary();
    return v;
  }
  function unary(): number {
    if (take('+')) return unary();
    if (take('-')) return -unary();
    return power();
  }
  function product(): number {
    let v = unary();
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++],
        n = unary();
      if (op === '/' && n === 0) throw new Error('公式不能除以零');
      v = op === '*' ? v * n : v / n;
    }
    return v;
  }
  function expression(): number {
    let v = product();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++],
        n = product();
      v = op === '+' ? v + n : v - n;
    }
    return v;
  }
  const result = expression();
  if (i !== tokens.length || !Number.isFinite(result))
    throw new Error('公式无效或结果不是有限数字');
  return result;
}
export function validateGpaConfig(raw: GpaConfig): GpaConfig {
  if (!Number.isFinite(raw.scale) || raw.scale < 1 || raw.scale > 10)
    throw new Error('GPA 满分应为 1–10');
  if (typeof raw.formula !== 'string') throw new Error('请输入公式');
  if (
    (raw.from && !validExamDate(raw.from)) ||
    (raw.to && !validExamDate(raw.to)) ||
    (raw.from && raw.to && raw.from > raw.to)
  )
    throw new Error('统计日期范围无效');
  const config = {
    scale: raw.scale,
    formula: raw.formula.trim(),
    weighted: raw.weighted !== false,
    from: raw.from || undefined,
    to: raw.to || undefined,
  };
  for (const maxScore of [100, 150])
    for (let p = 0; p <= 100; p += 1)
      gradePoint(config.formula, {
        ratio: p / 100,
        percent: p,
        score: (p / 100) * maxScore,
        maxScore,
        scale: config.scale,
      });
  return config;
}
export function gpaConfig(data: StudyData): GpaConfig {
  try {
    return validateGpaConfig(data.settings.examGpa ?? DEFAULT_GPA);
  } catch {
    return { ...DEFAULT_GPA };
  }
}
export function completedExams(data: StudyData, now = Date.now()) {
  const today = localDay(new Date(now));
  return data.exams
    .filter((e) => validExamDate(e.date) && e.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
}
export function pendingExamScores(data: StudyData, now = Date.now()) {
  const today = localDay(new Date(now));
  return completedExams(data, now).filter(
    (e) =>
      isExamScheduled(e) &&
      e.date < today &&
      !validResult(e.result) &&
      (!e.scoreReminderAfter ||
        Date.parse(e.scoreReminderAfter) <= now ||
        !Number.isFinite(Date.parse(e.scoreReminderAfter))),
  );
}
export function examGpa(data: StudyData, now = Date.now()) {
  const config = gpaConfig(data),
    seen = new Set<string>(),
    excluded: string[] = [];
  const rows = completedExams(data, now).flatMap((e) => {
    if (
      seen.has(e.id) ||
      !validResult(e.result) ||
      Date.parse(e.result.recordedAt) > now ||
      (config.from && e.date < config.from) ||
      (config.to && e.date > config.to)
    )
      return [];
    seen.add(e.id);
    try {
      const percent = (e.result.score / e.result.maxScore) * 100;
      const point = Math.max(
        0,
        Math.min(
          config.scale,
          gradePoint(config.formula, {
            ratio: percent / 100,
            percent,
            score: e.result.score,
            maxScore: e.result.maxScore,
            scale: config.scale,
          }),
        ),
      );
      return [
        {
          exam: e,
          percent,
          point,
          weight: config.weighted ? e.result.credits : 1,
        },
      ];
    } catch {
      excluded.push(e.id);
      return [];
    }
  });
  const weight = rows.reduce((s, r) => s + r.weight, 0);
  return {
    config,
    rows,
    excluded,
    value: weight
      ? rows.reduce((s, r) => s + r.point * r.weight, 0) / weight
      : null,
  };
}
/** Aggregate school scores flag a subject/range for verification; never fabricate skill evidence. */
export function examFeedback(
  data: StudyData,
  subject: string,
  nodeId?: string,
  now = Date.now(),
) {
  const latest = completedExams(data, now).find(
    (e) =>
      e.subject === subject &&
      validResult(e.result) &&
      Date.parse(e.result.recordedAt) <= now &&
      (!nodeId || !e.scope.length || e.scope.includes(nodeId)),
  );
  if (!latest || !validResult(latest.result)) return null;
  const age = Math.max(
    0,
    (now - Date.parse(latest.date + 'T00:00:00')) / 86400000,
  );
  if (age > 90) return null;
  const percent = (latest.result.score / latest.result.maxScore) * 100,
    target = Number.isFinite(latest.target) ? latest.target : 80;
  return {
    exam: latest,
    percent,
    target,
    gap: Math.max(0, target - percent) / 100,
    boost:
      Math.min(0.35, (Math.max(0, target - percent) / 100) * 0.7) *
      (1 - age / 90),
    reason:
      latest.title +
      '：' +
      Math.round(percent) +
      '%，目标 ' +
      target +
      '%；用相关练习确认失分原因。',
  };
}
