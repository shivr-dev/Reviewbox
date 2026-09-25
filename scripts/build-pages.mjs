import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
await build({ configFile: 'vite.pages.config.ts' });
await writeFile('pages-dist/.nojekyll', '');
await writeFile('pages-dist/version.json', JSON.stringify({
  commit: process.env.GITHUB_SHA || 'local',
  builtAt: new Date().toISOString(),
}));
console.log(
  'GitHub Pages 静态文件已生成到 pages-dist。没有包含服务器密钥或个人学习数据。',
);
