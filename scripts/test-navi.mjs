import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/navi-context.test.ts'],outfile:'work/navi-context.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
await build({entryPoints:['tests/navi-storage.test.ts'],outfile:'work/navi-storage.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
await build({entryPoints:['tests/navi-ui.test.ts'],outfile:'work/navi-ui.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
process.exitCode=spawnSync(process.execPath,['--test','work/navi-context.test.mjs','work/navi-storage.test.mjs','work/navi-ui.test.mjs'],{stdio:'inherit'}).status??1;
