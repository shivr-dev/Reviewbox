import { openDB } from 'idb';
import { assetPath } from './runtime';

export type PagesConfig = {
  supabaseUrl: string;
  publishableKey: string;
  cloudflareAccountId: string;
  cloudflareTokens: string[];
};
type Sealed = { version: 1; salt: string; iv: string; ciphertext: string };
let cached: PagesConfig | null = null;
export const activePagesConfig = () => cached;
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const database = () => openDB('review-pages-vault', 1, { upgrade(db) { db.createObjectStore('keys'); } });
async function sealed(): Promise<Sealed> {
  const response = await fetch(assetPath('pages-vault.json'), {cache:'no-store'});
  if (!response.ok) throw new Error('站点尚未发布加密配置文件');
  return await response.json();
}
async function decrypt(key: CryptoKey, payload: Sealed): Promise<PagesConfig> {
  if (payload.version !== 1) throw new Error('站点配置版本暂不支持');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},key,bytes(payload.ciphertext));
  const config = JSON.parse(new TextDecoder().decode(plain));
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) ||
      !/^sb_publishable_/.test(config.publishableKey) ||
      !/^[a-f0-9]{32}$/i.test(config.cloudflareAccountId) ||
      !Array.isArray(config.cloudflareTokens)) throw new Error('站点配置内容无效');
  return config;
}
export async function pagesConfig(): Promise<PagesConfig | null> {
  if (cached) return cached;
  try {
    const key = await (await database()).get('keys','active') as CryptoKey | undefined;
    if (key) cached = await decrypt(key, await sealed());
  } catch { /* A changed or missing key requires unlocking again. */ }
  return cached;
}
export async function unlockPages(passphrase: string) {
  if (passphrase.length < 12) throw new Error('解锁口令至少需要 12 个字符');
  const payload = await sealed();
  const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(payload.salt),iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  try { cached = await decrypt(key,payload); }
  catch { throw new Error('口令不正确，或加密配置已更新'); }
  await (await database()).put('keys',key,'active');
  return cached;
}
export async function lockPages() {
  cached = null;
  await (await database()).delete('keys','active');
}
