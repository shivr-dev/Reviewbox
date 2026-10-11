import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import HomeCompanion from '../components/home-companion';

test('home penguin finishes frames through rerenders, pauses when hidden, and cleans up activity', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const set = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  let hidden = false,
    reduced = false,
    id = 0,
    time = 1;
  const callbacks = new Map<number, FrameRequestCallback>(),
    listeners = new Set<() => void>();
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node'])
    set(key, dom.window[key]);
  set('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(dom.window.document, 'hidden', {
    get: () => hidden,
    configurable: true,
  });
  dom.window.matchMedia = () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) =>
      listeners.delete(cb),
  });
  set('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const next = ++id;
    callbacks.set(next, callback);
    return next;
  });
  set('cancelAnimationFrame', (key: number) => callbacks.delete(key));
  set(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = async (pose = 'read', key = 'desk') => {
    await act(async () => {
      root.render(
        <svg>
          <HomeCompanion pose={pose} skin="default" activityKey={key} />
        </svg>,
      );
      await Promise.resolve();
    });
  };
  const step = async (ms: number) => {
    for (let n = 0; n < ms; n += 100) {
      time += Math.min(100, ms - n);
      const batch = [...callbacks.values()];
      callbacks.clear();
      await act(async () => {
        for (const cb of batch) cb(time);
      });
    }
  };
  const position = () =>
    dom.window.document
      .querySelector('.home-companion-sprite')
      ?.getAttribute('style');
  try {
    await render();
    await step(1);
    await step(1600);
    assert.match(position() ?? '', /background-position: 100% 0%/);
    const before = position();
    await render();
    assert.equal(position(), before);
    await step(900);
    assert.match(
      position() ?? '',
      /background-position: 66\.66666666666667% 100%/,
    );
    hidden = true;
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    const frozen = position();
    await step(1500);
    assert.equal(position(), frozen);
    hidden = false;
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    await step(1000);
    assert.match(position() ?? '', /background-position: 100% 100%/);
    await render('water', 'plant');
    assert.match(position() ?? '', /background-position: 0% 0%/);
    reduced = true;
    await act(async () => {
      for (const change of listeners) change();
    });
    await step(6000);
    assert.match(position() ?? '', /background-position: 0% 0%/);
    await act(async () => root.unmount());
    assert.equal(callbacks.size, 0);
    assert.equal(listeners.size, 0);
  } finally {
    if (dom.window.document.getElementById('root')?.childNodes.length)
      await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
