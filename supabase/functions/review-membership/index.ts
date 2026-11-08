import {createMembershipGateway} from '../../../lib/membership-gateway';
// This entry is bundled by scripts/build-membership-edge.mjs for deployment.
const env=(name:string)=>Deno.env.get(name)??'';
let tokens:string[]=[];
try{tokens=JSON.parse(env('CF_AI_TOKENS')||'[]');}catch{}
Deno.serve(createMembershipGateway({url:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY'),publishableKey:env('SUPABASE_ANON_KEY'),account:env('CF_ACCOUNT_ID'),tokens}));
