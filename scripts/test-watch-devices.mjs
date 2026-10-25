import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/watch-devices-ui.test.tsx'],outfile:'work/watch-devices-ui.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const result=spawnSync(process.execPath,['--import','./tests/repair-dom-preload.mjs','--test','work/watch-devices-ui.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
