import { buildQueue, computeMastery, nodeMastery } from './engine';
import { validExamDate, validResult } from './exam-outcomes';
import { dependencyLinks } from './learning-evidence';
import { objective } from './learning-intelligence';
import { isExamScheduled, localDay, type Exam, type QueueItem, type StudyData } from './model';
import { policyFor } from './policy-config';

export const SPRINT_TIMES = [5, 10, 15, 20, 30, 45, 60] as const;
export const SPRINT_GOALS = ['consolidate', 'weakness', 'check', 'review'] as const;
export type SprintGoal = typeof SPRINT_GOALS[number];
export type SprintPhase = { kind: 'recall' | 'practice' | 'check'; seconds: number; ids: string[] };
export type SprintPlan = {
  examId: string;
  examTitle: string;
  subject: Exam['subject'];
  scope: string[];
  minutes: number;
  goal: SprintGoal;
  phases: SprintPhase[];
};
export type ExamSprint = SprintPlan & {
  id: string;
  kind: 'exam-sprint';
  status: 'running' | 'paused' | 'complete';
  startedAt: string;
  endedAt?: string;
  phase: number;
  budgetUsedMs: number;
  lastTick?: number;
  timerOwner?: string;
};

export const sprintPhaseId = (sprint: ExamSprint, phase = sprint.phase) =>
  sprint.id + ':phase:' + phase;
export const sprintTimeLeft = (s: ExamSprint, now = Date.now()) =>
  Math.max(0, s.minutes * 60_000 - s.budgetUsedMs - (
    s.status === 'running' && s.lastTick !== undefined
      ? Math.min(6000, Math.max(0, now - s.lastTick)) : 0
  ));

export function upcomingSchoolExams(data: StudyData, now = Date.now()) {
  const today = localDay(new Date(now));
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 30);
  return data.exams.filter((e) => isExamScheduled(e) && !e.simulation &&
    validExamDate(e.date) && e.date >= today && !validResult(e.result) &&
    e.date <= localDay(horizon)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export const sprintJobs = (data: StudyData): ExamSprint[] =>
  (data.jobs ?? []).filter((j): j is ExamSprint => j.kind === 'exam-sprint' &&
    Array.isArray(j.phases) && ['running', 'paused', 'complete'].includes(j.status))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

export const expectedSprintSeconds = (item: QueueItem) =>
  Number.isFinite(item.question.expectedSeconds) ? Math.max(15, item.question.expectedSeconds) : 60;

export function planExamSprint(data: StudyData, exam: Exam, minutes: number, goal: SprintGoal,
  selected?: string[], now = Date.now(),
): SprintPlan | null {
  if (!upcomingSchoolExams(data, now).some(e => e.id === exam.id) ||
      !Number.isInteger(minutes) || minutes < 5 || minutes > 60 || !SPRINT_GOALS.includes(goal)) return null;
  const nodes = data.nodes.filter(n => n.subject === exam.subject);
  const scope = nodes.filter(n => (!exam.scope.length || exam.scope.includes(n.id)) &&
    (!selected || selected.includes(n.id))).map(n => n.id);
  if (!scope.length) return null;
  const states = computeMastery(data.nodes, data.events, policyFor(data));
  const byId = new Map(data.nodes.map(n => [n.id,n]));
  const required = new Map<string, string[]>();
  const missing = (id: string) => {
    const node = byId.get(id);
    return node ? dependencyLinks(node).filter(d => d.kind === 'requires' && d.weight >= .8)
      .filter(d => {
        const pre = byId.get(d.nodeId);
        return !pre || (nodeMastery(pre, states) ?? 0) < .45;
      }).map(d => d.nodeId) : [];
  };
  const visit = (id: string) => {
    if (required.has(id)) return;
    const links = missing(id);
    required.set(id, links);
    links.forEach(visit);
  };
  scope.forEach(visit);
  const focus = new Set([...scope, ...required.keys()]);
  const feedback = data.exams
    .filter(e => e.id !== exam.id && e.subject === exam.subject && e.date <= exam.date && validResult(e.result))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.review;
  const feedbackNodes = new Set(feedback?.nodeIds ?? []);
  const total = minutes * 60;
  const recent = new Set(data.events.filter(e => e.localDay === localDay(new Date(now))).map(e => e.questionId));
  const queue = buildQueue({
    ...data,
    settings: { ...data.settings, dailyMinutes: minutes },
    questions: data.questions.filter(q => focus.has(q.nodeId) && !recent.has(q.id) && !q.examTask),
  }, { scope: [...focus], practice: true, limit: 60, now });
  const prerequisites = queue.filter(i => !scope.includes(i.question.nodeId));
  const direct = queue.filter(i => scope.includes(i.question.nodeId));
  // A missing prerequisite can be reinforced in practice. It does not qualify its
  // dependent question for independent checking until there is real evidence.
  const eligibleCheck = direct.filter(i => objective(i.question) && !(required.get(i.question.nodeId)?.length));
  const blockedRecall = [...required.values()].flat().filter(id => byId.get(id)?.description.trim());
  const recallIds = [...new Set([
    ...blockedRecall,
    ...direct.map(i => i.question.nodeId),
    ...scope,
  ])].filter(id => byId.get(id)?.description.trim()).slice(0, minutes < 15 ? 2 : 4);
  const recallSeconds = recallIds.length ? Math.min(total * .15, recallIds.length * 45) : 0;
  const summarySeconds = Math.min(120, Math.round(total * .08));
  const taskBudget = Math.floor(total - recallSeconds - summarySeconds);
  const checkShare = goal === 'check' ? .72 : goal === 'weakness' ? .2 : .32;
  const seen = new Set<string>();
  function pick(items: QueueItem[], budget: number) {
    let seconds = 0;
    const ids: string[] = [];
    const usedNodes = new Set<string>();
    const ordered = [...items];
    while (ordered.length) {
      const freshIndex = ordered.findIndex(i => !usedNodes.has(i.question.nodeId));
      const [item] = ordered.splice(freshIndex === -1 ? 0 : freshIndex, 1);
      const estimated = expectedSprintSeconds(item);
      if (seen.has(item.question.id) || seconds + estimated > budget) continue;
      usedNodes.add(item.question.nodeId);
      seen.add(item.question.id);
      ids.push(item.question.id);
      seconds += estimated;
    }
    return { ids, seconds };
  }
  const firstDependent = direct.find(i => !(required.get(i.question.nodeId)?.length));
  const examPractice = direct.filter(i => !(required.get(i.question.nodeId)?.length));
  const neededIds = new Set([...required.values()].flat());
  const prep = queue.filter(i => neededIds.has(i.question.nodeId));
  const practiceItems = [...prep, ...prerequisites, ...examPractice].sort((a,b) =>
    Number(neededIds.has(b.question.nodeId)) - Number(neededIds.has(a.question.nodeId)) ||
    Number(feedbackNodes.has(b.question.nodeId)) - Number(feedbackNodes.has(a.question.nodeId)));
  const reserve = goal !== 'check' && firstDependent && eligibleCheck.length <= 1;
  const check = reserve ? {ids: [], seconds: 0} : pick(eligibleCheck, Math.floor(taskBudget * checkShare));
  const practice = pick(practiceItems, taskBudget - check.seconds);
  if (!practice.ids.length && !check.ids.length) return null;
  const phases: SprintPhase[] = [];
  if (recallIds.length) phases.push({ kind: 'recall', ids: recallIds, seconds: Math.round(recallSeconds) });
  if (practice.ids.length) phases.push({ kind: 'practice', ...practice });
  if (check.ids.length) phases.push({ kind: 'check', ...check });
  return { examId: exam.id, examTitle: exam.title, subject: exam.subject, scope, minutes, goal, phases };
}

export function sprintSummary(data: StudyData, sprint: ExamSprint) {
  const phases = new Set(sprint.phases.map((_, index) => sprintPhaseId(sprint, index)));
  const answers = data.events.filter(e => phases.has(e.sessionId));
  return {
    answers,
    nodeIds: [...new Set(answers.map(e => e.nodeId))],
    effectiveMs: answers.reduce((total, e) => total + Math.max(0, e.activeThinkMs || 0), 0),
    elapsedMs: sprint.endedAt ? Math.max(0, Date.parse(sprint.endedAt) - Date.parse(sprint.startedAt)) : 0,
    needsReview: answers.filter(e => e.score < .85),
  };
}
