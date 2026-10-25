import { build } from 'esbuild';
import { mkdir,writeFile } from 'node:fs/promises';
await mkdir('work/watch-edge',{recursive:true});
await build({stdin:{contents:"import {createWatchGateway} from './lib/watch-gateway'; Deno.serve(createWatchGateway({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}));",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',target:'es2022',format:'esm',outfile:'work/watch-edge/index.js',minify:true});
await writeFile('work/watch-edge/README.txt','Generated from lib/watch-gateway.ts. Deploy with verify_jwt=false: the gateway verifies web JWTs with Auth and opaque native tokens with the restricted device RPC. No service key is shipped to clients.\n');
