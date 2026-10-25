import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('work',{recursive:true});
await build({entryPoints:['tests/watch-core.test.ts'],outfile:'work/watch.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm'});
const result=spawnSync(process.execPath,['--test','work/watch.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
