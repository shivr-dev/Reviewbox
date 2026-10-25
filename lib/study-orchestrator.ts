import { isExamScheduled } from './model';
import { DAY, computeMastery } from './engine';
import {
  assistantObservations,
  reliableAssistantEvent,
  assistantSettings,
  dailyStudyPlan,
  weeklyLearningGpa,
} from './study-assistant';
import {
  EXAM_FORMAT,
  examStages,
  paperReady,
  type ExamKind,
  type ExamPaper,
} from './exam-model';
import { examGpa, pendingExamScores, validExamDate } from './exam-outcomes';
import {
  memoryFingerprint,
  objective,
  policyEvolution,
  pressureQuestions,
  reusable,
} from './learning-intelligence';
import { isPinyin } from './question-tools';
import { cachedStudyAdvice } from './study-advice';
import { scoreStudyActions } from './study-utility';
import { policyFor } from './policy-config';
import { courseLearningTasks } from './course-lifecycle';
import { metadataQuality, fatigueState } from './learning-signals';
import {
  buildRemediation,
  remedyProgress,
  type Remediation,
} from './remediation';
import {
  keyOf,
  localDay,
  subjectName,
  type Exam,
  type QueueItem,
  type StudyData,
  type Subject,
} from './model';

export type StudyActionKind =
  | 'resume'
  | 'score'
  | 'initial'
  | 'test'
  | 'pressure'
  | 'simulation'
  | 'import-exam'
  | 'course'
  | 'remedy'
  | 'practice'
  | 'report'
  | 'teach'
  | 'verify'
  | 'rest'
  | 'import';
export type StudyAction = {
  id: string;
  kind: StudyActionKind;
  title: string;
  reason: string;
  label: string;
  minutes: number;
  utility?: number;
  informationValue?: number;
  decisionFactors?: Record<string, number>;
  coursePhase?: 'practice' | 'verify';
  courseId?: string;
  subject?: Subject | 'all';
  items?: QueueItem[];
  page?: string;
  target?: string;
  examId?: string;
  paperId?: string;
  examKind?: ExamKind;
  scope?: string[];
  sourceSessionId?: string;
};
export type StudyDecision = {
  id: string;
  kind: 'study-decision';
  actionId: string;
  choice: 'defer' | 'seen';
  at: string;
  until: string;
};
const time = (s?: string) => (s ? Date.parse(s) : NaN);
const recent = (s: string | undefined, now: number, days: number) =>
  Number.isFinite(time(s)) && time(s) <= now && now - time(s) < days * DAY;
const qMinutes = (items: QueueItem[]) =>
  Math.max(
    1,
    Math.ceil(
      items.reduce(
        (s, i) =>
          s + Math.max(15, Math.min(1200, i.question.expectedSeconds || 60)),
        0,
      ) / 60,
    ),
  );
const dateDays = (date: string, now: number) =>
  validExamDate(date)
    ? Math.round(
        (Date.parse(date + 'T12:00:00') -
          new Date(
            new Date(now).getFullYear(),
            new Date(now).getMonth(),
            new Date(now).getDate(),
            12,
          ).getTime()) /
          DAY,
      )
    : Infinity;
export function inferredSimulation(exam: Exam): Exam['simulation'] {
  if (exam.simulation) return exam.simulation;
  if (exam.subject !== 'ce') return undefined;
  const title = exam.title.toUpperCase();
  const kind =
    (['SAT', 'ACT', 'TOEFL', 'MAP', 'DET'] as const).find((k) =>
      new RegExp('(?:^|[^A-Z])' + k + '(?:$|[^A-Z])').test(title),
    ) ??
    (/托福|TOFEL/.test(title)
      ? 'TOEFL'
      : /多邻国|DUOLINGO/.test(title)
        ? 'DET'
        : undefined);
  return kind
    ? {
        exam: kind,
        mapSection:
          kind === 'MAP' && /LANGUAGE|语言/.test(title)
            ? 'Language Usage'
            : kind === 'MAP'
              ? 'Reading'
              : undefined,
      }
    : undefined;
}
export function simulationMatches(
  p: ExamPaper,
  spec: NonNullable<Exam['simulation']>,
) {
  return (
    p.exam === spec.exam &&
    (!spec.paperId || p.id === spec.paperId) &&
    (p.exam !== 'MAP' ||
      ((p.options.mapSection ?? 'Reading') === (spec.mapSection ?? 'Reading') &&
        (!spec.grade || p.options.grade === spec.grade)))
  );
}
function deferred(data: StudyData, id: string, now: number) {
  return data.jobs?.some(
    (j) =>
      j.kind === 'study-decision' &&
      j.actionId === id &&
      ['defer', 'seen'].includes(j.choice) &&
      Number.isFinite(time(j.at)) &&
      time(j.at) <= now &&
      time(j.until) > now &&
      time(j.until) - time(j.at) <= 8 * DAY,
  );
}
function representative(
  data: StudyData,
  subject: string,
  scope: string[],
  events: ReturnType<typeof assistantObservations>,
  now: number,
  max = 8,
) {
  const last = new Map(events.map((e) => [e.questionId, time(e.occurredAt)])),
    counts = new Map<string, number>();
  return data.questions
    .filter(
      (q) =>
        reusable(q, now) &&
        (objective(q) || isPinyin(q)) &&
        (subject === 'all' || q.subject === subject) &&
        (!scope.length || scope.includes(q.nodeId)) &&
        data.nodes.some(
          (n) =>
            n.id === q.nodeId &&
            n.subject === q.subject &&
            n.skills.some((s) => s.id === q.skillId),
        ),
    )
    .sort(
      (a, b) =>
        (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) ||
        a.id.localeCompare(b.id),
    )
    .filter((q) => {
      const k = keyOf(q.nodeId, q.skillId),
        n = counts.get(k) ?? 0;
      if (n >= 2) return false;
      counts.set(k, n + 1);
      return true;
    })
    .slice(0, max)
    .map((question) => ({
      question,
      reason: '独立作答，检验近期学习效果',
      priority: 1,
    }));
}

/** Decide only from available content and observed evidence. This scheduler never generates a question or a score. */
export function studyAgenda(data: StudyData, now = Date.now()) {
  if (!Number.isFinite(now)) now = Date.now();
  const plan = dailyStudyPlan(data, now),
    events = assistantObservations(data, now),
    reliable = events.filter(reliableAssistantEvent),
    settings = assistantSettings(data),
    safe = { ...data, events },
    today = localDay(new Date(now));
  const jobs = data.jobs ?? [],
    actions: StudyAction[] = [],
    exclusions: { id: string; reason: string }[] = [],
    add = (a: StudyAction) => {
      if (deferred(data, a.id, now)) {
        exclusions.push({ id: a.id, reason: '学习者已暂缓或读过该安排' });
        return;
      }
      if (
        [
          'practice',
          'initial',
          'test',
          'pressure',
          'simulation',
          'course',
          'teach',
          'remedy',
          'verify',
        ].includes(a.kind) &&
        !a.id.startsWith('resume:') &&
        a.minutes * 60 > plan.remainingSeconds
      ) {
        exclusions.push({
          id: a.id,
          reason: '当前剩余时间不足，保留到后续安排',
        });
        return;
      }
      actions.push(a);
    };
  const active = jobs
    .filter(
      (j) =>
        ['session', 'exam-run', 'pressure'].includes(j.kind) &&
        j.status !== 'complete' &&
        recent(j.createdAt ?? j.startedAt, now, 180),
    )
    .sort(
      (a, b) =>
        time(b.createdAt ?? b.startedAt) - time(a.createdAt ?? a.startedAt),
    );
  const resumed = new Set<string>();
  for (const j of active) {
    if (resumed.has(j.kind)) continue;
    resumed.add(j.kind);
    if (
      j.kind === 'session' &&
      j.status === 'active' &&
      Array.isArray(j.items) &&
      j.items.some(
        (i: QueueItem) =>
          data.questions.some(
            (q) => q.id === i.question.id && reusable(q, now),
          ) &&
          !events.some(
            (e) => e.sessionId === j.id && e.questionId === i.question.id,
          ),
      )
    )
      add({
        id: 'resume:' + j.id,
        kind: 'resume',
        title: j.mode === 'test' ? '继续未完成的测试' : '接着上次的学习',
        reason: '当前作答已保存，先完成这一段。',
        label: j.ownerDeviceId ? '在手表继续' : '继续学习',
        minutes: qMinutes(
          j.items.filter(
            (i: QueueItem) =>
              !events.some(
                (e) => e.sessionId === j.id && e.questionId === i.question.id,
              ),
          ),
        ),
        page: j.ownerDeviceId ? 'devices' : 'study',
        target: j.id,
      });
    if (j.kind === 'exam-run' && ['active', 'break'].includes(j.status)) {
      const p = jobs.find((p) => p.kind === 'exam-paper' && p.id === j.paperId);
      if (p && paperReady(p, data.questions))
        add({
          id: 'resume:' + j.id,
          kind: 'resume',
          title: '继续 ' + (p.exam === 'DET' ? 'Duolingo' : p.exam) + ' 模拟',
          reason: '计时与已作答内容会按原考试规则恢复。',
          label: '恢复考试',
          minutes: 0,
          page: 'exam',
          target: j.id,
        });
    }
    if (
      j.kind === 'pressure' &&
      j.status === 'active' &&
      Array.isArray(j.questions) &&
      j.questions.length
    )
      add({
        id: 'resume:' + j.id,
        kind: 'pressure',
        title: '继续未完成的压力测试',
        reason: '作答已保存，原有计时继续生效。',
        label: '恢复压力测试',
        minutes: Math.max(0, Math.ceil((j.deadline - now) / 60000)),
        subject: j.subject,
        scope: [],
        items: j.questions.map((question: any) => ({
          question,
          priority: 1,
          reason: '恢复压力测试',
        })),
      });
  }
  for (const e of pendingExamScores(data, now))
    add({
      id: 'score:' + e.id,
      kind: 'score',
      title: '考试结束了，记录一下成绩',
      reason:
        e.title +
        '已结束 ' +
        Math.max(1, dateDays(today, Date.parse(e.date + 'T12:00:00'))) +
        ' 天。填入得分后，再安排后续巩固。',
      label: '填写考试成绩',
      minutes: 1,
      examId: e.id,
    });
  const tests = data.tests.filter(
    (t) =>
      recent(t.at, now, 180) &&
      t.eventIds.length &&
      t.eventIds.every((id) => events.some((e) => e.id === id)),
  );
  for (const t of [...tests]
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, 3)) {
    if (
      !recent(t.at, now, 14) ||
      jobs.some((j) => j.id === 'remediation:' + t.sessionId)
    )
      continue;
    const job = buildRemediation(
      { ...data, events },
      t.sessionId,
      t.title,
      now,
    );
    const repeated = job.groups.find((g) => g.sources.length >= 2);
    const severe = job.groups.find((g) =>
      g.sources.some(
        (s) =>
          s.score < 0.4 &&
          events.some(
            (e) => e.id === s.eventId && e.predictedConfidence === 'sure',
          ) &&
          data.nodes.some(
            (n) =>
              n.id === g.nodeId &&
              n.skills.some((sk) => sk.id === g.skillId && sk.difficulty <= 2),
          ),
      ),
    );
    if (
      (!repeated && !severe) ||
      (t.subject !== 'all' && !settings.weights[t.subject])
    )
      continue;
    add({
      id: 'remedy-create:' + t.sessionId,
      kind: 'remedy',
      title: '把这次测试的共同失分整理清楚',
      reason:
        (repeated ?? severe)!.title +
        (repeated
          ? '有多道失分题，先对照共同问题，再安排巩固与隔天验证。'
          : '出现有把握却答错的基础题，先做小型补救；尚不据此确认知识缺失。'),
      label: '整理考后补救',
      minutes: 6,
      page: 'remedy',
      target: job.id,
      sourceSessionId: t.sessionId,
    });
  }
  const states = computeMastery(data.nodes, events);
  const policy = policyFor(data);
  const skillHistories = new Map<string, typeof events>();
  for (const e of events) {
    const k = keyOf(e.nodeId, e.skillId),
      rows = skillHistories.get(k) ?? [];
    rows.push(e);
    skillHistories.set(k, rows);
  }
  for (const [key, rows] of skillHistories) {
    const losses = rows.slice(-policy.utility.teachErrorCount);
    if (
      losses.length < policy.utility.teachErrorCount ||
      !losses.every((e) => e.score < 0.4) ||
      new Set(losses.map((e) => e.questionId)).size < 2
    )
      continue;
    const q = data.questions.find((q) => q.id === losses.at(-1)!.questionId);
    if (!q || isPinyin(q) || (!q.explanation && !q.solution?.length)) continue;
    const items = data.questions
      .filter(
        (x) =>
          x.nodeId === q.nodeId &&
          x.skillId === q.skillId &&
          reusable(x, now) &&
          !losses.some((e) => e.questionId === x.id),
      )
      .slice(0, 3)
      .map((question) => ({ question, priority: 1, reason: '对照例题后巩固' }));
    add({
      id: 'teach:' + key + ':' + losses.at(-1)!.id,
      kind: 'teach',
      title: '先看懂' + data.nodes.find((n) => n.id === q.nodeId)?.title,
      reason: '同一能力最近连续失分，先回看分步例题，避免继续重复刷题。',
      label: '回看例题与思路',
      minutes: 3,
      target: q.id,
      subject: q.subject,
      items,
    });
  }
  const initial = plan.recommendations.find(
    (r) => r.mode === 'initial' && r.subject === 'all',
  );
  for (const r of plan.recommendations) {
    if (r.mode === 'initial' && initial && r !== initial) continue;
    const lastTest = Math.max(
      0,
      ...tests.filter((t) => t.subject === r.subject).map((t) => time(t.at)),
    );
    const nearest = data.exams
      .filter(
        (e) =>
          isExamScheduled(e) &&
          (r.subject === 'all' || e.subject === r.subject) &&
          dateDays(e.date, now) >= 0,
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const id =
      r.mode === 'pressure'
        ? 'pressure:' + (nearest?.id ?? r.subject)
        : r.mode === 'initial'
          ? 'initial:' + r.subject
          : 'test:' + r.subject + ':' + lastTest;
    add({
      id,
      kind: r.mode,
      title:
        r.mode === 'pressure'
          ? '来一场考前压力测试？'
          : r.mode === 'test'
            ? '用一次短测确认当前状态'
            : r.title,
      reason: r.reason,
      label:
        r.mode === 'initial'
          ? '进行起点测试'
          : r.mode === 'pressure'
            ? '参加压力测试'
            : '参加阶段短测',
      minutes: qMinutes(r.questions),
      subject: r.subject,
      scope: r.scope,
      items: r.questions,
      informationValue: r.informationValue,
      examId: nearest?.id,
    });
  }
  for (const t of courseLearningTasks(data, now))
    add({
      id: t.id,
      kind: t.phase === 'verify' ? 'verify' : 'practice',
      title:
        t.course.title + (t.phase === 'verify' ? ' · 隔天验证' : ' · 课后巩固'),
      reason:
        t.phase === 'verify'
          ? '教学与当场巩固已完成，现在用间隔作答检验保留。'
          : '课程已完成，先完成这门课程自己的巩固练习。',
      label: t.phase === 'verify' ? '开始课程验证' : '开始课程巩固',
      minutes: policyFor(data).utility.practiceMinutes,
      courseId: t.course.id,
      coursePhase: t.phase,
      subject: t.course.subject,
      informationValue: t.phase === 'verify' ? 1 : undefined,
    });
  const imported = jobs.filter(
    (j): j is ExamPaper =>
      j.kind === 'exam-paper' &&
      j.format === EXAM_FORMAT &&
      j.origin === 'imported',
  );
  for (const e of data.exams.filter(isExamScheduled)) {
    const days = dateDays(e.date, now),
      spec = inferredSimulation(e);
    if (!spec || !settings.weights.ce || days < 2 || days > 21) continue;
    const matches = imported.filter((p) => simulationMatches(p, spec)),
      p = matches
        .filter((p) => paperReady(p, data.questions))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const previous = jobs.filter(
      (j) =>
        j.kind === 'exam-run' &&
        j.status === 'complete' &&
        matches.some((p) => p.id === j.paperId) &&
        recent(j.completedAt, now, 7),
    );
    if (previous.length) continue;
    const mins = p
      ? Math.ceil(
          examStages(p.exam, p.options).reduce(
            (s, stage) =>
              s + (stage.seconds || stage.count * 75) + stage.breakAfter,
            0,
          ) / 60,
        )
      : 0;
    if (
      p &&
      mins <= settings.dailyMinutes &&
      (plan.remainingSeconds >= mins * 60 || plan.completedSeconds === 0)
    )
      add({
        id: 'simulation:' + e.id + ':' + p.id,
        kind: 'simulation',
        title:
          '按考试节奏，完成一场' +
          (p.exam === 'DET' ? 'Duolingo' : p.exam) +
          ' 模拟',
        reason: `距离${e.title}还有 ${days} 天。使用你已导入的试卷，结束后再回到学习计划。`,
        label: '参加英语专项模拟',
        minutes: mins,
        examId: e.id,
        paperId: p.id,
        examKind: p.exam,
        subject: 'ce',
      });
    else if (!p)
      add({
        id: 'import-exam:' + e.id,
        kind: 'import-exam',
        title: '先为' + spec.exam + '准备一份试卷',
        reason:
          '完整且匹配的导入试卷尚未就绪。手动导入即可纳入安排，不会自动调用 AI。',
        label: '导入模拟试卷',
        minutes: 0,
        examKind: spec.exam,
        examId: e.id,
        subject: 'ce',
      });
    else
      add({
        id: 'simulation-time:' + e.id,
        kind: 'import-exam',
        title: '为完整模拟留出时间',
        reason: `已导入试卷约需 ${mins || '不限时'} 分钟，当前剩余时间不足。可以调整时间预算，或先做短练习。`,
        label: '查看模拟安排',
        minutes: mins,
        examKind: p.exam,
        examId: e.id,
        subject: 'ce',
      });
  }
  for (const c of jobs.filter(
    (j) =>
      j.kind === 'course' &&
      j.status === 'ready' &&
      settings.weights[j.subject as Subject] > 0 &&
      Array.isArray(j.sections),
  )) {
    const section = c.sections.find((s: any) => s.content && !s.completedAt);
    if (section)
      add({
        id: 'course:' + c.id + ':' + section.id,
        kind: 'course',
        title: '把' + section.title + '学明白',
        reason: '已有互动课件尚未完成，先理解，再进入练习。',
        label: '进入互动课程',
        minutes: 8,
        page: 'course',
        target: c.id,
        subject: c.subject,
      });
  }
  for (const j of jobs.filter(
    (j): j is Remediation =>
      j.kind === 'remediation' && Array.isArray(j.groups),
  )) {
    const group = j.groups.find((g) => {
      const p = remedyProgress(j, g, events, now);
      return (
        !p.successful &&
        (!g.lessonCompletedAt || !p.practices.length || p.ready) &&
        (g.html || g.htmlSections?.length)
      );
    });
    if (
      group &&
      settings.weights[
        data.nodes.find((n) => n.id === group.nodeId)?.subject ?? 'math'
      ] > 0
    )
      add({
        id: 'remedy:' + j.id + ':' + group.id,
        kind: 'remedy',
        title: '先解决一类反复出现的错误',
        reason: group.title + '已有补救课程，完成后再做变式验证。',
        label: '进入补救课程',
        minutes: 6,
        page: 'remedy',
        target: j.id,
      });
  }
  const practice: QueueItem[] = [];
  let seconds = 0;
  for (const i of plan.queue) {
    const s = Math.max(15, Math.min(1200, i.question.expectedSeconds || 60));
    if (
      practice.length >= 6 ||
      seconds + s > Math.min(480, plan.remainingSeconds)
    )
      break;
    practice.push(i);
    seconds += s;
  }
  if (!practice.length && plan.queue.length && plan.remainingSeconds >= 15)
    practice.push(plan.queue[0]);
  if (practice.length)
    add({
      id: 'practice:' + today,
      kind: 'practice',
      title: '先完成一小段' + (plan.stages[0]?.title ?? '复习'),
      reason: practice[0].reason,
      label: '开始这段学习',
      minutes: qMinutes(practice),
      items: practice,
    });
  const insights = studyInsights(data, now);
  // Rest remains a selectable candidate when fatigue evidence is high, never an exam override.
  const fatigueSignal = fatigueState(data, now);
  if (fatigueSignal.known && fatigueSignal.value >= policy.signals.fatigueHigh)
    add({
      id: 'rest-fatigue:' + today,
      kind: 'rest',
      title: '先休息，再继续学习',
      reason: fatigueSignal.explanation,
      label: '查看轻量学习方式',
      minutes: 0,
    });
  const checkpoint = practiceCheckpoint(data, now);
  if (checkpoint.blocks.length >= 3)
    add({
      id: 'checkpoint:' + checkpoint.blocks[0].sessionId,
      kind: 'report',
      title: '三段练习完成，整理一下当前状态',
      reason: `已完成 ${checkpoint.blocks.length} 段练习、${checkpoint.events.length} 次作答。${checkpoint.weak.length ? '先看看反复出错的能力，再调整下一步。' : '看看哪些已经稳定，哪些还需要隔天验证。'}`,
      label: '查看阶段小结',
      minutes: 2,
    });
  const resultStamp = insights.gpa.rows
    .map((r) => r.exam.result!.recordedAt)
    .sort()
    .at(-1);
  if (resultStamp && recent(resultStamp, now, 2))
    add({
      id: 'score-report:' + resultStamp,
      kind: 'report',
      title: '成绩已经纳入，看看下一步',
      reason:
        '真实考试 GPA 与复习优先级已更新，看看这次考试给后续学习带来的变化。',
      label: '查看考后回顾',
      minutes: 2,
    });
  if (insights.weekCount >= 4)
    add({
      id: 'report:' + weeklyLearningGpa(data, now).period.startDate,
      kind: 'report',
      title: '看看最近的学习变化',
      reason: '这一周的学习记录已整理好，看看保留效果与下一步建议。',
      label: '查看学习回顾',
      minutes: 2,
    });
  if (!actions.length)
    add({
      id: 'rest:' + today,
      kind:
        data.questions.length || jobs.some((j) => j.kind === 'course')
          ? 'rest'
          : 'import',
      title: data.questions.length
        ? '这一段学习可以告一段落了'
        : '从你自己的教材开始',
      reason: data.questions.length
        ? '当前没有更优先的到期任务。可以休息，也可以自主选择学习方式。'
        : '先导入知识、字词、题目或课件，学习计划才有依据安排。',
      label: data.questions.length ? '查看下一步安排' : '导入学习内容',
      minutes: 0,
      page: 'library',
    });
  const ranked = scoreStudyActions(safe, actions, states, now, exclusions);
  actions.splice(0, actions.length, ...ranked.actions);
  const advisor = cachedStudyAdvice(data, actions, now);
  return {
    primary: actions[0],
    decisionTrace: ranked.trace,
    fatigue: ranked.fatigue,
    actions,
    practice,
    plan,
    insights,
    date: today,
    advisor,
    checkpoint,
  };
}

export function practiceCheckpoint(data: StudyData, now = Date.now()) {
  const events = assistantObservations(data, now),
    jobs = data.jobs ?? [];
  const after = Math.max(
    0,
    ...jobs
      .filter(
        (j) =>
          j.kind === 'study-decision' &&
          j.choice === 'seen' &&
          j.actionId?.startsWith('checkpoint:') &&
          time(j.at) <= now,
      )
      .map((j) => time(j.at)),
  );
  const seen = new Set<string>();
  const blocks = jobs
    .filter((j) => j.kind === 'study-completion' || j.kind === 'game-chest')
    .map((j) => ({ sessionId: String(j.sessionId), at: j.completedAt ?? j.at }))
    .filter((b) => {
      if (
        seen.has(b.sessionId) ||
        !recent(b.at, now, 30) ||
        time(b.at) <= after ||
        !events.some(
          (e) =>
            e.sessionId === b.sessionId &&
            e.source !== 'test' &&
            !e.learningEvidence?.gameRecovery &&
            e.activeThinkMs >= 1500,
        )
      )
        return false;
      seen.add(b.sessionId);
      return true;
    })
    .sort((a, b) => a.at.localeCompare(b.at));
  const ids = new Set(blocks.map((b) => b.sessionId)),
    rows = events.filter((e) => ids.has(e.sessionId)),
    counts = new Map<string, number>();
  for (const e of rows.filter((e) => e.score < 0.85)) {
    const k = keyOf(e.nodeId, e.skillId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const weak = [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [nodeId, skillId] = key.split('::'),
        n = data.nodes.find((n) => n.id === nodeId);
      return {
        key,
        count,
        title:
          (n?.title ?? '') +
          ' · ' +
          (n?.skills.find((s) => s.id === skillId)?.title ?? '待巩固能力'),
      };
    });
  return { blocks, events: rows, weak };
}

export function studyInsights(data: StudyData, now = Date.now()) {
  const e = assistantObservations(data, now)
      .filter(reliableAssistantEvent)
      .filter((e) => !e.learningEvidence?.pressure),
    last = e.filter((e) => now - time(e.occurredAt) < 7 * DAY),
    prior = e.filter(
      (e) =>
        now - time(e.occurredAt) >= 7 * DAY &&
        now - time(e.occurredAt) < 14 * DAY,
    );
  const mean = (xs: typeof e) =>
    xs.length ? xs.reduce((s, e) => s + e.score, 0) / xs.length : null;
  const current = mean(last),
    before = mean(prior),
    fingerprints = memoryFingerprint({ ...data, events: e }, now),
    fast = fingerprints
      .filter((f) => f.ready && f.factor < 1)
      .sort((a, b) => a.factor - b.factor)[0],
    evolution = policyEvolution({ ...data, events: e }, now);
  return {
    weekCount: last.length,
    days: new Set(last.map((e) => localDay(new Date(e.occurredAt)))).size,
    accuracy: last.length >= 5 ? current : null,
    change: last.length >= 5 && prior.length >= 5 ? current! - before! : null,
    weekly: weeklyLearningGpa(data, now),
    gpa: examGpa(data, now),
    method: evolution.winner
      ? '已有足够间隔记录，继续采用比较中证据更强的策略。'
      : fast
        ? fast.title + '的遗忘较快，缩短该类内容的复习间隔。'
        : '继续主动回忆与间隔验证；证据不足时保持保守安排。',
    methodEvidence: evolution.trials,
    methodSources: [
      'https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2006.01693.x/',
      'https://www.nature.com/articles/s41539-020-00074-4',
    ],
  };
}
