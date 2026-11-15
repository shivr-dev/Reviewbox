import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { GEMMA, GLM, GPT_OSS } from '../supabase/functions/_shared/workers-ai-models.ts';

const account = process.env.CF_ACCOUNT_ID;
let tokens;
try { tokens = JSON.parse(process.env.CF_AI_TOKENS || '[]'); }
catch { console.error('CF_AI_TOKENS must be a JSON array.'); process.exit(2); }
if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !Array.isArray(tokens) || !tokens.length) {
  console.error('Set CF_ACCOUNT_ID and CF_AI_TOKENS in the test environment before running inference.');
  process.exit(2);
}

await mkdir('work', { recursive: true });
await build({
  stdin: { contents: "export { runJSON } from './lib/ai-server';", resolveDir: process.cwd() },
  outfile: 'work/workers-ai-evaluation-runtime.mjs',
  bundle: true, platform: 'node', format: 'esm', packages: 'external',
});
const { runJSON } = await import('../work/workers-ai-evaluation-runtime.mjs');
const cases = [
  { id: 'power-sum', prompt: '设 a,b,c 是 x³−4x²+3x−1=0 的三个复根（按重数计）。求 a⁷+b⁷+c⁷。说明递推和初始条件。', answer:3063 },
  { id: 'prime-exponents', prompt: '求乘积为 2⁸·3⁶·5⁴ 且 gcd(a,b,c)=1 的有序正整数三元组 (a,b,c) 的个数。说明质因数指数约束。', answer:5184 },
  { id: 'sum-of-squares', prompt: '求满足 x²+y²=325² 的有序正整数对 (x,y) 的个数。说明如何处理零坐标、正负号及顺序。', answer:14 },
  { id: 'fixed-points', prompt: '对 1 到 9 的排列中恰有 2 个不动点的排列有多少个？给出错排推导。', answer:66744 },
];
const schema = {
  type:'object', additionalProperties:false, required:['answer','explanation'],
  properties:{ answer:{type:'integer'}, explanation:{type:'string'} },
};
for (const model of process.argv.includes('--include-light') ? [GEMMA, GLM, GPT_OSS] : [GEMMA, GPT_OSS]) {
  for (const { id, prompt, answer } of cases) {
    const start = performance.now();
    try {
      const result = await runJSON('Solve the math problem in Simplified Chinese. Return the exact integer and a concise, checkable derivation.', { prompt }, 0, true, 5500, schema,
        { temperature: 0.15, top_p: 1 }, false, { evaluationModel: model });
      const valid = Number.isInteger(result?.answer) && typeof result?.explanation === 'string' && !!result.explanation.trim();
      console.log(JSON.stringify({ model, case:id, valid, exact:valid && result.answer === answer,
        expected:answer, answer:result?.answer, explanation:result?.explanation, elapsedMs:Math.round(performance.now() - start) }));
    } catch (error) {
      console.log(JSON.stringify({ model, case:id, error:error?.diagnostic?.code ?? error?.name ?? 'error',
        elapsedMs:Math.round(performance.now() - start) }));
    }
  }
}
