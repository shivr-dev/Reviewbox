import { examStages, type ExamPaper, type ExamRun } from './exam-model';
import type { Question } from './model';

export function nativeExamPackage(
  paper: ExamPaper,
  questions: Question[],
  assets: any[],
  name: string,
) {
  const stages = examStages(paper.exam, paper.options),
    sections: Record<string, any> = {},
    flow: any[] = [];
  for (const [i, stage] of stages.entries()) {
    const id = paper.exam === 'SAT' ? 'rw' + (i + 1) : stage.id;
    const sectionName = stage.section.toLowerCase();
    flow.push({
      id,
      stageIndex: i,
      label:
        paper.exam === 'SAT' ? 'Section 1: Reading and Writing' : stage.section,
      sub: paper.exam === 'SAT' ? 'Module ' + (i + 1) : '',
      count: stage.count,
      durationSeconds: stage.seconds,
      duration: stage.seconds,
      type:
        paper.exam === 'SAT'
          ? 'bluebook'
          : paper.exam === 'ACT'
            ? /writing/.test(sectionName)
              ? 'act-writing'
              : 'act'
            : 'toefl-' +
              (/listen/.test(sectionName)
                ? 'listening'
                : /writ/.test(sectionName)
                  ? 'writing'
                  : /speak/.test(sectionName)
                    ? 'speaking'
                    : 'reading'),
    });
    for (const route of stage.adaptive ? ['lower', 'higher'] : ['standard']) {
      const key = stage.adaptive
        ? id + (route === 'higher' ? '_hard' : '_easy')
        : id;
      sections[key] = {
        questions: stage.slots
          .filter((s) => s.route === route)
          .map((s) => {
            const q = questions.find((q) => q.id === paper.questions[s.id]);
            if (!q) throw new Error('试卷缺少本地题目');
            const task = q.examTask;
            const type =
              task?.type === 'complete_words'
                ? 'fill_letters'
                : task?.type === 'write_email'
                  ? 'email'
                  : (task?.type ??
                    (q.type === 'subjective'
                      ? 'free_response'
                      : q.type === 'blank'
                        ? 'numeric'
                        : 'mcq'));
            let passage = q.passage;
            if (task?.parts?.length && !passage?.includes('_'))
              passage = task.parts
                .map((p) => p.visiblePrefix + '_'.repeat(p.missingLength))
                .join(' ');
            return {
              ...task?.native,
              id: q.id,
              slotId: s.id,
              type,
              prompt: q.prompt,
              passage,
              choices: q.options,
              correct: q.options?.indexOf(q.answer),
              answer: task?.parts
                ? task.parts.map((p) => p.answer).join('|')
                : q.answer,
              audio: task?.audio,
              audioText: task?.audioText,
              words: task?.words,
              slots: task?.words
                ? (task.native?.slots ?? task.words.length)
                : undefined,
              missingLengths: task?.parts?.map((p) => p.missingLength),
              responseSeconds: task?.responseSeconds,
            };
          }),
      };
    }
    if (stage.breakAfter)
      flow.push({
        id: 'break-' + i,
        label: 'Break',
        type: 'break',
        durationSeconds: stage.breakAfter,
        duration: stage.breakAfter,
      });
  }
  const media: Record<string, string> = {};
  for (const asset of assets.filter((a) => a.kind === 'exam-asset')) {
    const data = asset.parts
      .map((id: string) => assets.find((a) => a.id === id)?.data ?? '')
      .join('');
    if (data) media[asset.id] = `data:${asset.mime};base64,${data}`;
  }
  return {
    manifest: {
      id: paper.id,
      title: paper.title ?? paper.exam + ' 英语专项模拟',
      exam: paper.exam,
      settings: { candidateName: name || 'Test Taker' },
      routingThreshold: 0.65,
      flow,
    },
    sections,
    media,
  };
}
export function applyNativeAnswers(
  run: ExamRun,
  paper: ExamPaper,
  questions: Question[],
  snapshot: any,
): ExamRun {
  const next = {
    ...run,
    native: snapshot,
    answers: { ...run.answers },
    flags: { ...run.flags },
    times: { ...run.times },
    routes: { ...run.routes },
  };
  const stages = examStages(paper.exam, paper.options);
  stages.forEach((stage, i) => {
    const id = paper.exam === 'SAT' ? 'rw' + (i + 1) : stage.id;
    const route = stage.adaptive
      ? snapshot.routes?.[id] === 'hard'
        ? 'higher'
        : 'lower'
      : 'standard';
    if (stage.adaptive && snapshot.routes?.[id]) next.routes[i] = route;
    for (const slot of stage.slots.filter((s) => s.route === route)) {
      const key = id + ':' + slot.index;
      next.flags[slot.id] = !!snapshot.flags?.[key];
      if (Number.isFinite(snapshot.times?.[key]))
        next.times[slot.id] = snapshot.times[key];
      const raw = snapshot.answers?.[key];
      const q = questions.find((q) => q.id === paper.questions[slot.id]);
      if (!q || raw === undefined) continue;
      let value =
        typeof raw === 'number'
          ? (q.options?.[raw] ?? '')
          : Array.isArray(raw)
            ? raw.join(' ')
            : typeof raw === 'string'
              ? raw
              : raw?.recorded
                ? '[口语录音已保存]'
                : JSON.stringify(raw);
      if (q.examTask?.parts && typeof raw === 'string')
        value = JSON.stringify(
          q.examTask.parts.map(
            (p, index) => p.visiblePrefix + (raw.split('|')[index] ?? ''),
          ),
        );
      if (q.examTask?.type === 'build_sentence' && Array.isArray(raw))
        value = [
          q.examTask.native?.answerLead,
          ...raw,
          q.examTask.native?.answerTail,
        ]
          .filter(Boolean)
          .join(' ');
      next.answers[slot.id] = value.slice(0, 20000);
      next.flags[slot.id] = !!snapshot.flags?.[id + ':' + slot.index];
    }
  });
  if (snapshot.finished) {
    next.status = 'complete';
    next.completedAt ??= new Date().toISOString();
    next.deadline = 0;
  }
  return next;
}
