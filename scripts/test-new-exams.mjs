import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('work',{recursive:true});
await build({entryPoints:['tests/new-exams.test.ts'],outfile:'work/new-exams.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const r=spawnSync(process.execPath,['--test','work/new-exams.test.mjs','tests/new-exam-players.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
