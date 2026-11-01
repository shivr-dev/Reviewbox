import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/profile-library-ux.test.tsx'],outfile:'work/profile-library-ux.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const r=spawnSync(process.execPath,['--import','./tests/repair-dom-preload.mjs','--test','work/profile-library-ux.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;
