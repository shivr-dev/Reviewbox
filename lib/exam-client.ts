import { apiFetch } from './runtime';
import { put, currentNamespace, loadData, saveRecords } from './store';
import {
  EXAM_FORMAT,
  allSlots,
  examStages,
  examNode,
  paperReady,
  type ExamPaper,
  type ExamSlot,
  type ExamKind,
  type ExamOptions,
  type ExamRun,
  stageSlots,
} from './exam-model';
import type { Question, AnswerEvent } from './model';
import { localDay } from './model';
import { objectiveScore } from './question-tools';
import { gradeAnswer } from './ai-client';
async function call(body: unknown) {
  const r = await apiFetch('/api/exam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(80000),
  });
  const v = (await r.json()) as any;
  if (!r.ok) throw new Error(v.error ?? '试卷准备暂未完成');
  return v;
}
export async function newPaper(
  exam: ExamKind,
  options: ExamOptions,
  ns = currentNamespace(),
): Promise<ExamPaper> {
  const paper: ExamPaper = {
    id: 'exam-paper:' + crypto.randomUUID(),
    kind: 'exam-paper',
    format: EXAM_FORMAT,
    exam,
    options: exam === 'SAT' ? { writing: false } : options,
    createdAt: new Date().toISOString(),
    status: 'preparing',
    questions: {},
    passages: {},
  };
  await put('job', paper, paper.id, false, ns);
  return paper;
}
export async function preparePaper(
  original: ExamPaper,
  progress: (p: ExamPaper, message: string) => void,
  stop: { current: boolean },
  originNamespace = currentNamespace(),
) {
  if (original.format !== EXAM_FORMAT)
    throw new Error('请重新准备英语专项试卷');
  const ns = originNamespace;
  if (currentNamespace() !== ns) throw new Error('账户已切换，准备已暂停');
  const work = async () => {
    const snapshot = await loadData(ns);
    if (currentNamespace() !== ns || stop.current) return original;
    let paper: ExamPaper = structuredClone(
      snapshot.jobs?.find((j) => j.id === original.id) ?? original,
    );
    const stages = examStages(paper.exam, paper.options);
    const slots = allSlots(paper);
    for (const slot of slots) {
      if (
        !snapshot.questions.some(
          (q) => q.id === paper.questions[slot.id] && q.verified,
        )
      ) {
        if (
          snapshot.jobs?.some(
            (j) => j.kind === 'exam-run' && j.paperId === paper.id,
          )
        )
          throw new Error(
            '这份试卷已经用于考试，请先同步恢复原题，或另准备新试卷',
          );
        delete paper.questions[slot.id];
      }
    }
    let serial = Promise.resolve();
    const save = () => {
      const p = structuredClone(paper);
      serial = serial.then(async () => {
        await put('job', p, p.id, false, ns);
      });
      return serial;
    };
    const stopped = () => stop.current || currentNamespace() !== ns;
    const update = (message: string) =>
      progress(structuredClone(paper), message);
    const groups = [
      ...new Set(slots.map((s) => s.group).filter(Boolean)),
    ] as string[];
    try {
      for (const group of groups) {
        if (stopped()) return paper;
        if (paper.passages[group]) continue;
        update('正在准备共享材料 · ' + group);
        const v = await call({
          action: 'passage',
          exam: paper.exam,
          format: paper.format,
          options: paper.options,
          group,
        });
        paper.passages[group] = v.passage;
        await save();
      }
      const tasks: ExamSlot[][] = [];
      for (const stage of stages) {
        for (const route of ['standard', 'lower', 'higher']) {
          const pending = stage.slots.filter(
            (s) => s.route === route && !paper.questions[s.id],
          );
          let current: ExamSlot[] = [];
          for (const slot of pending) {
            if (
              current.length &&
              (current.length === 3 || current[0].group !== slot.group)
            ) {
              tasks.push(current);
              current = [];
            }
            current.push(slot);
          }
          if (current.length) tasks.push(current);
        }
      }
      let cursor = 0;
      const errors: string[] = [];
      const prompts: string[] = [];
      const worker = async () => {
        while (cursor < tasks.length && !stopped()) {
          const batch = tasks[cursor++];
          const draftId = paper.id + ':batch:' + batch[0].id;
          let draft = snapshot.jobs?.find((j) => j.id === draftId) ?? {
            id: draftId,
            kind: 'exam-batch',
            questions: null,
            solvers: [],
          };
          try {
            let passed = false;
            for (
              let attempt = 0;
              attempt < 3 && !passed && !stopped();
              attempt++
            ) {
              update(
                '准备与核验 · ' +
                  Object.keys(paper.questions).length +
                  '/' +
                  slots.length,
              );
              if (!draft.questions) {
                try {
                  const v = await call({
                    action: 'generate',
                    exam: paper.exam,
                    format: paper.format,
                    options: paper.options,
                    slots: batch.map((s) => s.id),
                    passage: paper.passages[batch[0].group ?? ''] ?? '',
                    previousPrompts: prompts.slice(-12),
                  });
                  draft.questions = v.questions;
                  draft.solvers = [];
                  await put('job', draft, draftId, false, ns);
                } catch (e) {
                  if (
                    attempt < 2 &&
                    e instanceof Error &&
                    /结构|丢弃|不完整|不匹配|四选一|选择题|阅读材料|题组位置/.test(
                      e.message,
                    )
                  ) {
                    continue;
                  }
                  throw e;
                }
              }
              const solverCount = 1;
              const results = await Promise.allSettled(
                Array.from({ length: solverCount }, (_, i) => i)
                  .filter((i) => !draft.solvers[i])
                  .map(async (i) => ({
                    i,
                    result: (
                      await call({
                        action: 'solve',
                        questions: draft.questions,
                        slot: i + 1,
                      })
                    ).solutions,
                  })),
              );
              for (const r of results)
                if (r.status === 'fulfilled')
                  draft.solvers[r.value.i] = r.value.result;
              await put('job', draft, draftId, false, ns);
              if (results.some((r) => r.status === 'rejected'))
                throw new Error('部分独立核验未完成，可继续准备');
              const verdict = await call({
                action: 'judge',
                questions: draft.questions,
                solvers: draft.solvers,
              });
              if (!verdict.pass) {
                draft.questions = null;
                draft.solvers = [];
                draft.error = verdict.reason;
                await put('job', draft, draftId, false, ns);
                continue;
              }
              const now = new Date().toISOString();
              const records = draft.questions.flatMap(
                ({
                  slotId,
                  question: q,
                }: {
                  slotId: string;
                  question: Question;
                }) => {
                  const slot = batch.find((s) => s.id === slotId)!;
                  const n = examNode(paper.exam, slot, stages[slot.stage]);
                  const question = {
                    ...q,
                    verified: true,
                    verification: {
                      method: 'isolated batch solvers + judge',
                      solverCount,
                      at: now,
                    },
                  };
                  prompts.push(q.prompt.slice(0, 300));
                  return [
                    {
                      id: n.id,
                      kind: 'node' as const,
                      payload: n,
                      updated_at: now,
                      deleted: false,
                    },
                    {
                      id: q.id,
                      kind: 'question' as const,
                      payload: question,
                      updated_at: now,
                      deleted: false,
                    },
                  ];
                },
              );
              await saveRecords(records, true, ns);
              for (const { slotId, question } of draft.questions)
                paper.questions[slotId] = question.id;
              paper.error = undefined;
              paper.status = paperReady(paper) ? 'ready' : 'preparing';
              await save();
              await put('job', { id: draftId }, draftId, true, ns);
              update(
                '已核验 ' +
                  Object.keys(paper.questions).length +
                  '/' +
                  slots.length,
              );
              passed = true;
            }
            if (!passed)
              throw new Error('一个题组未通过核验，已保留其他完成内容');
          } catch (e) {
            errors.push(e instanceof Error ? e.message : '题组未完成');
            if (errors.length >= 3) stop.current = true;
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (errors.length) paper.error = errors[0];
      paper.status = paperReady(paper) ? 'ready' : 'preparing';
      await save();
      update(
        paper.status === 'ready'
          ? '整套试卷已就绪'
          : stopped()
            ? '准备已暂停，进度已保存'
            : '部分题组待继续准备',
      );
      return paper;
    } catch (e) {
      paper.error = e instanceof Error ? e.message : '准备未完成';
      await save();
      throw e;
    }
  };
  if (navigator.locks)
    return navigator.locks.request(
      'prepare:' + ns + ':' + original.id,
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw new Error('另一个页面正在准备这份试卷');
        return work();
      },
    );
  return work();
}
export async function gradeExam(
  paper: ExamPaper,
  run: ExamRun,
  progress: (s: string) => void,
  ns = currentNamespace(),
) {
  if (currentNamespace() !== ns) throw new Error('账户已切换，批改已暂停');
  if (run.status !== 'complete') throw new Error('交卷后才能查看解析');
  const data = await loadData(ns);
  const stages = examStages(paper.exam, paper.options);
  const slots = stages.flatMap((_, i) => stageSlots(paper, run, i));
  const existing = new Set(data.events.map((e) => e.id));
  const events: AnswerEvent[] = [];
  for (const slot of slots) {
    if (currentNamespace() !== ns)
      throw new Error('账户已切换，批改进度已保存');
    const id = 'exam-answer:' + run.id + ':' + slot.id;
    if (existing.has(id)) continue;
    const q = data.questions.find((q) => q.id === paper.questions[slot.id]);
    if (!q) throw new Error('缺少本地试题，请同步后继续');
    const answer = run.answers[slot.id] ?? '';
    progress(
      '整理解析 · ' + stages[slot.stage].section + ' ' + (slot.index + 1),
    );
    const oral =
      ['listen_repeat', 'interview'].includes(q.examTask?.type ?? '') ||
      run.selfScores?.[slot.id] !== undefined;
    if (oral && run.selfScores?.[slot.id] === undefined) continue;
    const grade =
      !oral && q.type === 'subjective' && answer.trim()
        ? await gradeAnswer(q, answer)
        : undefined;
    const score = oral
      ? run.selfScores![slot.id]
      : grade
        ? grade.score / grade.maxScore
        : objectiveScore(q, answer);
    const at = run.completedAt ?? new Date().toISOString();
    const e: AnswerEvent = {
      id,
      questionId: q.id,
      nodeId: q.nodeId,
      skillId: q.skillId,
      subject: q.subject,
      outcome: score >= 0.85 ? 'correct' : score >= 0.4 ? 'unsure' : 'wrong',
      score,
      source: oral ? 'self' : grade ? 'rubric' : 'test',
      grade,
      answer,
      occurredAt: at,
      displayedAt: run.startedAt,
      revealedAt: at,
      activeThinkMs: run.times[slot.id] ?? 0,
      expectedSeconds: q.expectedSeconds,
      difficulty: q.difficulty,
      variant: q.variant,
      usedHint: false,
      reason: paper.exam + ' 英语专项模拟',
      sessionId: run.id,
      localDay: localDay(new Date(at)),
      version: 1,
    };
    await put('event', e, e.id, false, ns);
    events.push(e);
  }
  await put(
    'test',
    {
      id: 'test:' + run.id,
      title: paper.exam + ' 英语专项模拟',
      subject: 'ce',
      sessionId: run.id,
      eventIds: slots.map((s) => 'exam-answer:' + run.id + ':' + s.id),
      at: run.completedAt,
      scope: [
        ...new Set(
          slots.map((s) => examNode(paper.exam, s, stages[s.stage]).id),
        ),
      ],
    },
    'test:' + run.id,
    false,
    ns,
  );
  const pendingOral = slots.some(
    (s) =>
      ['listen_repeat', 'interview'].includes(
        data.questions.find((q) => q.id === paper.questions[s.id])?.examTask
          ?.type ?? '',
      ) && run.selfScores?.[s.id] === undefined,
  );
  const next = { ...run, graded: !pendingOral };
  await put('job', next, next.id, false, ns);
  return next;
}
