import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/learning-experience.test.ts','tests/exam-outcomes.test.ts'],
  outdir:'work/learning-experience-tests',outExtension:{'.js':'.mjs'},
  bundle:true,platform:'node',packages:'external',format:'esm'});
const result=spawnSync(process.execPath,['--import','fake-indexeddb/auto','--test',
  'work/learning-experience-tests/learning-experience.test.mjs',
  'work/learning-experience-tests/exam-outcomes.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
