import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/scientific-diagrams.test.tsx'],outfile:'work/scientific-diagrams.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const result=spawnSync(process.execPath,['--test','work/scientific-diagrams.test.mjs'],{stdio:'inherit'});process.exitCode=result.status??1;
