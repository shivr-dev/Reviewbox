import { isExamScheduled } from './model';
import {
  assistantObservations,
  reliableAssistantEvent,
} from './study-assistant';
import { validExamDate, validResult } from './exam-outcomes';
import { localDay, type StudyData } from './model';
import type { StudyAction } from './study-orchestrator';
import { verifiedHypothesis, type StudyHypothesis } from './learning-signals';
const DAY = 86400000;
export type StudyAdvice = {
  id: string;
  kind: 'study-advice';
  milestone: string;
  status: 'pending' | 'complete' | 'error';
  at: string;
  expires: string;
  actionIds: string[];
  actionId?: string;
  hypothesis?: StudyHypothesis;
  explanation?: string;
  method?: string;
  error?: string;
};
export function adviceOpportunity(
  data: StudyData,
  actions: StudyAction[],
  now = Date.now(),
) {
  if (data.settings.assistantAi === false) return null;
  const candidates = actions
    .filter((a) =>
      [
        'practice',
        'initial',
        'test',
        'pressure',
        'simulation',
        'course',
        'remedy',
        'report',
      ].includes(a.kind),
    )
    .slice(0, 6);
  if (!candidates.length) return null;
  const records = (data.jobs ?? []).filter(
    (j): j is StudyAdvice =>
      j.kind === 'study-advice' &&
      Number.isFinite(Date.parse(j.at)) &&
      Date.parse(j.at) <= now,
  );
  const rows = assistantObservations(data, now).filter(reliableAssistantEvent);
  const e = data.exams
    .filter(
      (e) =>
        validResult(e.result) &&
        Date.parse(e.result!.recordedAt) <= now &&
        now - Date.parse(e.result!.recordedAt) < 7 * DAY,
    )
    .sort((a, b) =>
      b.result!.recordedAt.localeCompare(a.result!.recordedAt),
    )[0];
  const exam = data.exams
    .filter(
      (e) =>
        isExamScheduled(e) &&
        validExamDate(e.date) &&
        Date.parse(e.date + 'T00:00:00') - now >= DAY &&
        Date.parse(e.date + 'T00:00:00') - now <= 7 * DAY,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const thisWeek = rows.filter((e) => now - Date.parse(e.occurredAt) < 7 * DAY);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const milestone = e
    ? 'result:' + e.id + ':' + e.result!.recordedAt
    : exam && rows.length >= 4
      ? 'pre-exam:' + exam.id
      : thisWeek.length >= 12 &&
          new Set(thisWeek.map((e) => e.localDay)).size >= 3
        ? 'week:' + localDay(monday)
        : null;
  if (
    !milestone ||
    records.some(
      (r) =>
        r.milestone === milestone &&
        ((r.status === 'complete' && Date.parse(r.expires) > now) ||
          (r.status !== 'complete' && now - Date.parse(r.at) < 6 * 3600000)),
    )
  )
    return null;
  if (
    records.some((r) => now - Date.parse(r.at) < DAY) ||
    records.filter((r) => now - Date.parse(r.at) < 7 * DAY).length >= 2
  )
    return null;
  return {
    milestone,
    reason: e
      ? '真实考试成绩已更新'
      : exam
        ? '考试进入一周倒计时'
        : '本周已有足够学习记录',
    candidates,
  };
}
export function cachedStudyAdvice(
  data: StudyData,
  _actions: StudyAction[],
  now = Date.now(),
) {
  const advice = (data.jobs ?? [])
    .filter(
      (j): j is StudyAdvice =>
        j.kind === 'study-advice' &&
        j.status === 'complete' &&
        Date.parse(j.at) <= now &&
        Date.parse(j.expires) > now &&
        typeof j.explanation === 'string' &&
        j.explanation.length <= 600 &&
        j.hypothesis &&
        ['speed', 'retention', 'concept', 'fatigue'].includes(
          j.hypothesis.type,
        ) &&
        (!j.hypothesis.nodeId ||
          data.nodes.some((n) => n.id === j.hypothesis.nodeId)),
    )
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  return advice
    ? {
        ...advice,
        verification: verifiedHypothesis(data, advice.hypothesis!, now),
      }
    : undefined;
}
export function adviceSummary(
  data: StudyData,
  candidates: StudyAction[],
  now = Date.now(),
) {
  const events = assistantObservations(data, now)
    .filter(reliableAssistantEvent)
    .filter((e) => now - Date.parse(e.occurredAt) < 14 * DAY);
  return {
    dailyMinutes:
      data.settings.assistant?.dailyMinutes ?? data.settings.dailyMinutes,
    observations: events.length,
    days: new Set(events.map((e) => e.localDay)).size,
    meanScore: events.length
      ? events.reduce((s, e) => s + e.score, 0) / events.length
      : null,
    exams: data.exams
      .filter(
        (e) =>
          validExamDate(e.date) &&
          (isExamScheduled(e) || validResult(e.result)),
      )
      .slice(-8)
      .map((e) => ({
        title: e.title.slice(0, 100),
        date: e.date,
        subject: e.subject,
        target: e.target,
        score: validResult(e.result)
          ? e.result.score / e.result.maxScore
          : null,
      })),
    actions: candidates.map((a) => ({
      id: a.id.slice(0, 240),
      kind: a.kind,
      title: a.title.slice(0, 140),
      reason: a.reason.slice(0, 400),
      minutes: a.minutes,
    })),
  };
}
