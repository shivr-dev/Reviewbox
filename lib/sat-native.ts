import { nativeExamPackage, applyNativeAnswers } from './exam-native';
import { examStages, nextStage, type ExamPaper, type ExamRun } from './exam-model';
import type { Question } from './model';

// Keep the supplied renderer independent of the answer key and personal database.
export function satPackage(paper: ExamPaper, questions: Question[], name: string) {
  const html = (value: string) => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)).replaceAll('\n','<br>');
  const pack = nativeExamPackage(paper, questions, [], name);
  const sections = Object.fromEntries(Object.entries(pack.sections).map(([key, section]) => [key, {
    questions: section.questions.map((q: any, index: number) => ({
      id: key.split('_')[0] + ':' + index, prompt: html(q.prompt), passage: html(q.passage ?? ''),
      choices: (q.choices ?? []).map(html), type: q.type,
    })),
  }]));
  return {student: name || 'Student Guest', title: paper.title || 'SAT English Simulation',
    date: new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'}),
    modules: pack.manifest.flow.filter(f => f.type !== 'break').map((f, index) => ({
      section: 'Reading and Writing', number: index + 1, minutes: f.durationSeconds / 60,
      questions: sections[f.id]?.questions ?? [], id: f.id,
    })), sections};
}

export function satSnapshot(run: ExamRun, paper: ExamPaper, questions: Question[], now = Date.now()) {
  if (run.native?.satVersion === 1) return run.native;
  const old = run.native ?? {}, stages = examStages('SAT', paper.options);
  const module = Math.max(0, Math.min(stages.length - 1, old.stepIndex ?? run.stage));
  const started = !old.fresh && (old.stepIndex >= 0 || Object.keys(run.answers).length > 0);
  const answers: Record<string, number | string> = {...old.answers}, flags = {...old.flags}, times = {...old.times}, notes = {...old.notes};
  const routes = {...old.routes};
  if (run.routes[1]) routes.rw2 = run.routes[1] === 'higher' ? 'hard' : 'easy';
  for (const [i, stage] of stages.entries()) for (const s of stage.slots) {
    if (s.route !== (run.routes[i] ?? 'standard')) continue;
    const key = `rw${i + 1}:${s.index}`, q = questions.find(q => q.id === paper.questions[s.id]);
    if (q && run.answers[s.id] !== undefined) answers[key] = q.options?.indexOf(run.answers[s.id]) ?? run.answers[s.id];
    flags[key] ??= run.flags[s.id]; times[key] ??= run.times[s.id] ?? 0; notes[key] ??= run.notes[s.id] ?? '';
  }
  const deadline = started ? old.clockEnd || (old.seconds !== undefined ? now + old.seconds * 1000 : run.deadline) : 0;
  return {satVersion:1, version:1, route:run.status === 'complete' ? 'complete' : started ? 'resume' : 'login',
    module,index:old.qIndex ?? run.index,started,finished:run.status === 'complete',setup:started,
    remaining:deadline ? Math.max(0, Math.ceil((deadline-now)/1000)) : stages[module].seconds,deadline,
    answers,flags,times,notes,routes,eliminated:old.eliminated ?? {},highlights:{},extendedReview:true};
}

export function saveSatSnapshot(run: ExamRun, paper: ExamPaper, questions: Question[], snapshot: any, complete = false): ExamRun {
  if (!snapshot || snapshot.satVersion !== 1 || !Number.isInteger(snapshot.module) || snapshot.module < 0 || snapshot.module >= examStages('SAT',paper.options).length)
    throw Error('SAT 考试记录无效，请重新连接。');
  const clean = {...snapshot,finished:complete || run.status === 'complete'};
  const next = applyNativeAnswers(run,paper,questions,clean);
  const stage = examStages('SAT',paper.options)[snapshot.module], route = snapshot.routes?.rw2 === 'hard' ? 'higher' : 'lower';
  for (const s of stage.slots.filter(s => s.route === (stage.adaptive ? route : 'standard'))) {
    const key = `rw${snapshot.module+1}:${s.index}`;
    if (snapshot.answers?.[key] === undefined) delete next.answers[s.id];
    next.notes[s.id] = String(snapshot.notes?.[key] ?? '').slice(0,20000);
    const q = questions.find(q => q.id === paper.questions[s.id]);
    next.eliminated[s.id] = (snapshot.eliminated?.[key] ?? []).map((i:number) => q?.options?.[i]).filter(Boolean);
  }
  next.stage = snapshot.module; next.index = snapshot.index; next.deadline = complete ? 0 : snapshot.deadline || 0;
  return next;
}

export function satRoute(paper: ExamPaper, run: ExamRun, questions: Question[]) {
  return nextStage(paper,{...run,stage:0,status:'active'},questions).routes[1] === 'higher' ? 'hard' : 'easy';
}
