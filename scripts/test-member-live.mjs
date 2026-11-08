import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/learning-twin.test.ts'],outfile:'work/learning-twin.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
await build({entryPoints:['tests/navi-science-live.test.tsx'],outfile:'work/navi-science-live.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
let code=spawnSync(process.execPath,['--test','work/learning-twin.test.mjs'],{stdio:'inherit'}).status??1;
code||=spawnSync(process.execPath,['--import','./tests/repair-dom-preload.mjs','--test','work/navi-science-live.test.mjs'],{stdio:'inherit'}).status??1;process.exitCode=code;
