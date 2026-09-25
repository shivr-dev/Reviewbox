import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: project + 'static-pages',
  base: './',
  publicDir: project + 'public',
  plugins: [react()],
  resolve: { alias: [
    { find: /^\.\/server$/, replacement: project + 'lib/pages-server-shim.ts' },
    { find: '@', replacement: project },
  ] },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: project + 'pages-dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
