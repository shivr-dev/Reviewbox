// Initialize browser feature detection before external UI modules are imported.
import { JSDOM } from 'jsdom';
import * as fake from 'fake-indexeddb';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://review.test/',
});
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
for (const [key, value] of Object.entries(fake))
  if (key.startsWith('IDB') || key === 'indexedDB') globalThis[key] = value;
globalThis.requestAnimationFrame = (cb) =>
  setTimeout(() => cb(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
