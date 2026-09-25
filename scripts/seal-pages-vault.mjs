import { randomBytes, pbkdf2Sync, createCipheriv } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

let source = '';
for await (const chunk of process.stdin) source += chunk;
const config = JSON.parse(source);
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) ||
    !/^sb_publishable_/.test(config.publishableKey) ||
    !/^[a-f0-9]{32}$/i.test(config.cloudflareAccountId) ||
    !Array.isArray(config.cloudflareTokens) ||
    !config.cloudflareTokens.every(token => /^cfut_[A-Za-z0-9]{20,160}$/.test(token)))
  throw new Error('Configuration is incomplete');
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16), iv = randomBytes(12);
const key = pbkdf2Sync(password,salt,310000,32,'sha256');
const cipher = createCipheriv('aes-256-gcm',key,iv);
const encrypted = Buffer.concat([cipher.update(JSON.stringify(config),'utf8'),cipher.final(),cipher.getAuthTag()]);
await writeFile('public/pages-vault.json',JSON.stringify({version:1,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:encrypted.toString('base64')}));
console.log('CONFIG_PASSPHRASE='+password);
