import {build} from 'esbuild';import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/membership-gateway.test.ts'],outfile:'work/membership-gateway.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
process.exitCode=spawnSync(process.execPath,['--test','work/membership-gateway.test.mjs'],{stdio:'inherit'}).status??1;
