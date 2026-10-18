import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import StudyPlanView from '../components/study-plan-view';
import { ReviewContext } from '../components/review-context';
import { fixture, attempt, practiced, schoolExam } from './study-plan-fixtures';
import { loadData, put, switchAccount, currentNamespace } from '../lib/store';
import { computeMastery } from '../lib/engine';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
test('central entry offers a real short test or continued practice, remembers deferral, and launches/resumes pressure without AI', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const k of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'Document',
    'HTMLInputElement',
    'MutationObserver',
    'Image',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    old.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
    Object.defineProperty(globalThis, k, {
      value: k === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[k],
      configurable: true,
      writable: true,
    });
  }
  const root = createRoot(document.getElementById('root')!),
    before = globalThis.fetch;
  let requests = 0,
    started: any,
    notice = '',
    navigated = '';
  globalThis.fetch = async () => {
    requests++;
    throw new Error('No AI in UI validation');
  };
  async function seed(d: ReturnType<typeof fixture>) {
    for (const n of d.nodes) await put('node', n);
    for (const q of d.questions) await put('question', q);
    for (const e of d.events) await put('event', e);
    for (const e of d.exams) await put('exam', e);
    await put('setting', d.settings, 'settings');
  }
  async function render() {
    const data = await loadData();
    await act(async () =>
      root.render(
        <ReviewContext.Provider
          value={{
            data,
            states: computeMastery(data.nodes, data.events),
            refresh: render,
            notify: (m) => {
              notice = m;
            },
            navigate: (p) => {
              navigated = p;
            },
            start: (items, mode, title) => {
              started = { items, mode, title };
            },
            subject: 'all',
            cloudUser: null,
            setCloudUser: () => {},
            aiReady: false,
            sync: async () => {},
            pending: 0,
            syncing: false,
            prepare: async () => {},
            preparing: '',
          }}
        >
          <StudyPlanView key={currentNamespace()} />
        </ReviewContext.Provider>,
      ),
    );
  }
  async function settle(ms = 550) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  }
  async function click(text: string) {
    const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === text,
    );
    assert.ok(b, text);
    await act(async () => {
      b.click();
      await new Promise((r) => setTimeout(r, 100));
    });
    for(let i=0;i<100&&document.querySelector('.director-actions button:disabled');i++)await act(async()=>{await new Promise(r=>setTimeout(r,25));});
    assert.equal(notice, '');
  }
  try {
    await switchAccount('plan-ui-test');
    await seed(practiced(fixture(), Date.now()));
    await render();
    await settle();
    assert.match(
      document.body.textContent!,
      /用一次短测/,
    );
    await click('参加阶段短测');
    assert.equal(started.mode, 'test');
    assert.ok(started.items.length >= 3);
    await click('先继续练习');
    assert.equal(started.mode, 'review');
    assert.ok(started.items.length <= 6);
    assert.ok(
      (await loadData()).jobs!.some((j) => j.kind === 'study-decision'),
    );
    await render();
    assert.doesNotMatch(
      document.querySelector('.director-current')!.textContent!,
      /用一次短测/,
    );
    await switchAccount('plan-ui-pressure');
    const now = Date.now(),
      d = fixture();
    d.exams = [schoolExam(d, now, 4)];
    d.events = [
      attempt(d, 0, now - 3 * 86400000),
      attempt(d, 1, now - 2 * 86400000),
      attempt(d, 8, now - 3 * 86400000),
      attempt(d, 9, now - 2 * 86400000),
    ];
    await seed(d);
    await render();
    await settle();
    assert.match(
      document.body.textContent!,
      /压力测试/,
    );
    await click('参加压力测试');
    await settle(100);
    assert.ok(
      document.querySelector('[role="dialog"][aria-label="考前压力测试"]'),
    );
    const run = (await loadData()).jobs!.find((j) => j.kind === 'pressure');
    assert.ok(run);
    await click('保存并退出');
    await settle(100);
    assert.match(
      document.querySelector('.director-current')!.textContent!,
      /继续未完成的压力测试/,
    );
    await click('恢复压力测试');
    assert.ok(
      document.querySelector('[role="dialog"][aria-label="考前压力测试"]'),
    );
    assert.equal(
      (await loadData()).jobs!.find((j) => j.kind === 'pressure').deadline,
      run.deadline,
    );
    await click('保存并退出');
    assert.equal(requests, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = before;
    await switchAccount(null);
    dom.window.close();
    for (const [k, p] of old) {
      if (p) Object.defineProperty(globalThis, k, p);
      else delete (globalThis as any)[k];
    }
  }
});
