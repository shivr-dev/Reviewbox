import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'public', 'ocr');
const core = join(root, 'core');
const lang = join(root, 'lang');
await Promise.all([mkdir(core, { recursive: true }), mkdir(lang, { recursive: true })]);

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', join(root, 'worker.min.js')],
  ...['tesseract-core-lstm', 'tesseract-core-simd-lstm'].flatMap(name => [
    [`node_modules/tesseract.js-core/${name}.wasm.js`, join(core, `${name}.wasm.js`)],
    [`node_modules/tesseract.js-core/${name}.wasm`, join(core, `${name}.wasm`)],
  ]),
  ...['chi_sim', 'eng'].map(name => [
    `node_modules/@tesseract.js-data/${name}/4.0.0_best_int/${name}.traineddata.gz`,
    join(lang, `${name}.traineddata.gz`),
  ]),
];
await Promise.all(copies.map(([source, target]) => copyFile(source, target)));
console.log('本地 OCR 资源已准备完成（简体中文、英文）。');
