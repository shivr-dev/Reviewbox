import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/product-locales.test.tsx'],outfile:'work/product-locales.test.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const result=spawnSync(process.execPath,['--test','work/product-locales.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status??1;
