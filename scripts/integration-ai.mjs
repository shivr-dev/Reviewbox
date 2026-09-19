import fs from 'node:fs/promises';
const origin = 'http://localhost:3000';
const auth = await fetch(origin + '/signin-with-chatgpt?return_to=/', {
  redirect: 'manual',
});
const cookie = auth.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ');
if (!cookie) throw new Error('Local sign-in did not return a session');
async function call(body) {
  const response = await fetch(origin + '/api/ai', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
const pack = JSON.parse(await fs.readFile('../core-pack.json', 'utf8'));
const node = pack.knowledge.find((n) => n.id === 'core-math-2');
let generated, solvers, verdict;
let graded;
const rejectedQuestions = [];
if (!process.argv.includes('--ce-only')) {
  for (let attempt = 0; attempt < 2; attempt++) {
    generated = await call({
      action: 'generate',
      node,
      skill: node.skills[2],
      difficulty: 2,
      style: '初中数学',
      previousErrors: [],
      rejectedQuestions,
    });
    console.log(
      'Math generation succeeded:',
      generated.question.prompt.slice(0, 100),
    );
    solvers = await Promise.all(
      [1, 2, 3].map((slot) =>
        call({ action: 'solve', question: generated.question, slot }).then(
          (r) => r.solver,
        ),
      ),
    );
    console.log(
      'Independent solvers:',
      solvers.map((s) => ({
        answer: s.answer,
        wellPosed: s.wellPosed,
        unique: s.unique,
      })),
    );
    verdict = await call({
      action: 'judge',
      question: generated.question,
      solvers,
    });
    if (verdict.pass) break;
    rejectedQuestions.push({
      prompt: generated.question.prompt,
      reason: verdict.reason,
    });
    console.log('Rejected and regenerating:', verdict.reason);
  }
  if (!verdict.pass) throw new Error('Both attempts rejected');
  console.log('Math verification PASS');
  const subjective = pack.questions.find(
    (q) =>
      q.nodeId === 'core-history-1' &&
      q.rubric?.some((r) => r.id === 'production'),
  );
  graded = await call({
    action: 'grade',
    question: subjective,
    answer:
      '工业革命使机器生产逐步代替手工劳动，工厂制度发展，生产力显著提高。城市人口增加，推动城市化，同时带来工人劳动条件恶劣和环境污染等问题。',
  });
  if (
    !graded.grade.criteria.length ||
    graded.grade.score > graded.grade.maxScore
  )
    throw new Error('Invalid grade');
  console.log(
    'Rubric grading succeeded:',
    graded.grade.score + '/' + graded.grade.maxScore,
    graded.grade.label,
  );
}
const ceNode = pack.knowledge.find((n) => n.id === 'core-ce-6');
let ce, ceVerdict;
const ceRejected = [];
for (let attempt = 0; attempt < 2; attempt++) {
  ce = await call({
    action: 'generate',
    node: ceNode,
    skill: ceNode.skills[1],
    difficulty: 2,
    style: 'SAT',
    previousErrors: [],
    rejectedQuestions: ceRejected,
  });
  console.log(
    'CE question:',
    ce.question.prompt,
    ce.question.options,
    'answer',
    ce.question.answer,
  );
  const ceSolver = await call({
    action: 'solve',
    question: ce.question,
    slot: 1,
  });
  ceVerdict = await call({
    action: 'judge',
    question: ce.question,
    solvers: [ceSolver.solver],
  });
  if (ceVerdict.pass) break;
  ceRejected.push({ prompt: ce.question.prompt, reason: ceVerdict.reason });
  console.log('Rejected:', ceVerdict.reason);
}
if (!ceVerdict.pass)
  throw new Error('CE verification rejected: ' + ceVerdict.reason);
console.log('CE generation and independent review PASS');
await fs.mkdir('work', { recursive: true });
await fs.writeFile(
  'work/integration-ai.json',
  JSON.stringify(
    {
      math: generated
        ? { question: generated.question, solvers, verdict }
        : undefined,
      grade: graded?.grade,
      ce: { question: ce.question, verdict: ceVerdict },
    },
    null,
    2,
  ),
);
