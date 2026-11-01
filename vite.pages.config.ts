import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import {watchDownloadMarkup,watchDownloadStyle,watchBootstrap} from './scripts/watch-download-page.mjs';
const project = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: project + 'static-pages',
  base: './',
  publicDir: project + 'public',
  plugins: [react(), {
    name: 'watch-static-download-fallback',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('<head>', '<head><script>'+watchBootstrap+'</script><style>'+watchDownloadStyle+'</style>')
          .replace('<div id="root"></div>', '<div id="root">'+watchDownloadMarkup()+'<p id="review-boot-status" role="status">正在打开 Reviewbox…</p></div>');
      },
    },
  }],
  resolve: { alias: [
    { find: /^\.\/server$/, replacement: project + 'lib/pages-server-shim.ts' },
    { find: '@', replacement: project },
  ] },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: project + 'pages-dist',
    emptyOutDir: true,
    sourcemap: false,
    license: { fileName: 'assets/third-party-licenses.txt' },
  },
});
