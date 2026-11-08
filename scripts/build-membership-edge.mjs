import {build} from 'esbuild';
await build({entryPoints:['supabase/functions/review-membership/index.ts'],outfile:'work/membership-edge/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',alias:{zod:'npm:zod@4.1.12'},external:['npm:*'],minify:true});
console.log('Membership Edge bundle prepared. It contains no credentials.');
