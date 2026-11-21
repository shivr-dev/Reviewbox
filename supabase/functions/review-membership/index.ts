import {createMembershipGateway} from '../../../lib/membership-gateway';
// This entry is bundled by scripts/build-membership-edge.mjs for deployment.
const env=(name:string)=>Deno.env.get(name)??'';
function managedKey(name: string, prefix: string, legacy: string) {
  try {
    const keys = JSON.parse(env(name) || '{}');
    const candidates = [keys?.default, ...Object.values(keys ?? {})];
    const key = candidates.find((value): value is string => typeof value === 'string' && value.startsWith(prefix));
    if (key) return key;
  } catch {
    // Self-hosted environments may only provide the legacy key.
  }
  return env(legacy);
}
let tokens:string[]=[];
try{tokens=JSON.parse(env('CF_AI_TOKENS')||'[]');}catch{}
Deno.serve(createMembershipGateway({
  url: env('SUPABASE_URL'),
  serviceKey: managedKey('SUPABASE_SECRET_KEYS', 'sb_secret_', 'SUPABASE_SERVICE_ROLE_KEY'),
  publishableKey: managedKey('SUPABASE_PUBLISHABLE_KEYS', 'sb_publishable_', 'SUPABASE_ANON_KEY'),
  account: env('CF_ACCOUNT_ID'),
  tokens,
  aiModel: env('CF_AI_MODEL'),
}));
