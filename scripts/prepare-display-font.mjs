import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const local = new URL('../public/fonts/reviewbox/alimama-fang-yuan-ti-v1.000.woff2', import.meta.url);
const sources = [
  'https://cdn.yuntower.com/font/AlimamaFangYuanTiVF/AlimamaFangYuanTiVF-Thin.woff2',
  'https://unpkg.com/@fontpkg/alimama-fang-yuan-ti-vf@1.0.5/AlimamaFangYuanTiVF-Thin.woff2',
];
const checksum = '8d359c38cf2530a066abdfa0cd7302c94f840b2aea0e34c44dd25aff5660b117';
const matches = (bytes) => createHash('sha256').update(bytes).digest('hex') === checksum;

const existing = await readFile(local).catch(() => undefined);
if (!existing || !matches(existing)) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(sources[attempt % sources.length], {
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
