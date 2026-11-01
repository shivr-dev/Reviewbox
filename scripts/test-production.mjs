import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('work',{recursive:true});
await writeFile('work/production-tests.ts', ['matching-integrity.test.tsx','pack-removal.test.ts','pack-versions.test.ts','production-data.test.ts','production-integrations.test.ts','export-docx.test.ts'].map(f=>`import '../tests/${f}';`).join('\n'));
await build({entryPoints:['work/production-tests.ts'],outfile:'work/production-tests.mjs',bundle:true,platform:'node',packages:'external',format:'esm',jsx:'automatic'});
const result=spawnSync(process.execPath,['--test','work/production-tests.mjs'],{stdio:'inherit'});process.exitCode=result.status??1;
