import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin });
let password = '';
for await (const line of input) {
  password = line;
  break;
}
input.close();
const source = process.argv[2];
const payload = JSON.parse(
  source?.startsWith('https://')
    ? await (await fetch(source)).text()
    : await readFile(source || 'public/pages-vault.json', 'utf8'),
);
const encrypted = Buffer.from(payload.ciphertext, 'base64');
const key = pbkdf2Sync(
  password,
  Buffer.from(payload.salt, 'base64'),
  310000,
  32,
  'sha256',
);
const decipher = createDecipheriv(
  'aes-256-gcm',
  key,
  Buffer.from(payload.iv, 'base64'),
);
decipher.setAuthTag(encrypted.subarray(-16));
const config = JSON.parse(
  Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)),
    decipher.final(),
  ]).toString('utf8'),
);
if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) ||
  !/^sb_publishable_/.test(config.publishableKey) ||
  !/^[a-f0-9]{32}$/i.test(config.cloudflareAccountId) ||
  !Array.isArray(config.cloudflareTokens) ||
  !config.cloudflareTokens.every((token) =>
    /^cfut_[A-Za-z0-9]{20,160}$/.test(token),
  )
)
  throw new Error('Decrypted configuration is invalid');
console.log(
  JSON.stringify({
    valid: true,
    projectHost: new URL(config.supabaseUrl).host,
    tokenCount: config.cloudflareTokens.length,
  }),
);
