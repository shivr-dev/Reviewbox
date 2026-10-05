import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('work',{recursive:true});
await build({entryPoints:['tests/sat-native.test.ts'],outfile:'work/sat.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
const result=spawnSync(process.execPath,['--test','work/sat.test.mjs','tests/sat-player-flow.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
