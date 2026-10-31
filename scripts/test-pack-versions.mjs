import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/pack-versions.test.ts'],outfile:'work/pack-versions.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm'});
const r=spawnSync(process.execPath,['--test','work/pack-versions.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
