import { build } from 'vite';
import { writeFile } from 'node:fs/promises';
await build({ configFile: 'vite.pages.config.ts' });
await writeFile('pages-dist/.nojekyll', '');
console.log(
  'GitHub Pages 静态文件已生成到 pages-dist。没有包含服务器密钥或个人学习数据。',
);
