import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/library-v2-ui.test.tsx'],outfile:'work/library-v2-ui.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const r=spawnSync(process.execPath,['--import','./tests/repair-dom-preload.mjs','--test','work/library-v2-ui.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
