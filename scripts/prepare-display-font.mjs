import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const local = new URL('../public/fonts/reviewbox/alimama-fang-yuan-ti-v1.004.woff2', import.meta.url);
const source = 'https://fonts.alibabadesign.com/AlimamaFangYuanTiVF/AlimamaFangYuanTiVF-Thin/AlimamaFangYuanTiVF-Thin.woff2';
const checksum = '2f36da22906ae5d601ce4af009cea08e8b538a9da47e9762c5dd520ac2f3e08f';
const matches = (bytes) => createHash('sha256').update(bytes).digest('hex') === checksum;

const existing = await readFile(local).catch(() => undefined);
if (!existing || !matches(existing)) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(source, {
        headers: { Referer: 'https://www.alibabafonts.com/', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Font download returned HTTP ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!matches(bytes)) throw new Error('Alimama FangYuanTi checksum mismatch');
      await writeFile(local, bytes);
      break;
    } catch (error) {
      if (attempt === 2) {
        // Keep builds available if the upstream site is temporarily offline.
        console.warn('Alimama FangYuanTi unavailable at build time. Using the font fallback.', error);
        break;
      }
    }
  }
}
