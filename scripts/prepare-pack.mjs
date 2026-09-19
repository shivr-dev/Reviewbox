import fs from 'node:fs';
import { build } from 'esbuild';
await build({
  entryPoints: ['lib/seed.ts'],
  outfile: 'work/seed.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const { corePack } = await import('../work/seed.mjs');
fs.writeFileSync('../core-pack.json', JSON.stringify(corePack));
console.log(
  'Pack prepared:',
  corePack.knowledge.length,
  'nodes and',
  corePack.questions.length,
  'questions',
);
