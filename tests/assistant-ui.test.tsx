import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { ReviewContext } from '../components/review-context';
import OnboardingView from '../components/onboarding-view';
import DailyAssistant from '../components/daily-assistant';
import { loadData, put, switchAccount } from '../lib/store';
import { parseImportText } from '../lib/import-skill';
import { learningTemplate } from '../lib/import-templates';
import { furnitureCenter, iso } from '../lib/home-catalog';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
test('onboarding saves weights, imports first diagnostic without generation; weekly card and plan launch real tasks', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
      writable: true,
      configurable: true,
    });
  }
  const root = createRoot(document.getElementById('root')!),
    fetchBefore = globalThis.fetch;
  let requests = 0,
    view = 'onboarding',
    data: any,
    started: any,
    notice = '';
  globalThis.fetch = async () => {
    requests++;
    throw new Error('No generation in UI checks');
  };
  async function render() {
    data = await loadData();
    await act(async () =>
      root.render(
        <ReviewContext.Provider
          value={{
            data,
            states: {},
            refresh: render,
            notify: (m) => (notice = m),
            navigate: () => {},
            start: (items, mode, title) => (started = { items, mode, title }),
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
          {view === 'onboarding' ? <OnboardingView /> : <DailyAssistant />}
        </ReviewContext.Provider>,
      ),
    );
  }
  async function click(label: string) {
    const b = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    );
    assert.ok(b, label);
    await act(async () => {
      b.click();
      await new Promise((r) => setTimeout(r, 25));
    });
  }
  try {
    await switchAccount('assistant-ui');
    await render();
    assert.match(document.body.textContent!, /欢迎来到 Review/);
    await click('下一步');
    assert.match(document.body.textContent!, /先回忆，再核对/);
    await click('显示答案');
    assert.match(document.body.textContent!, /狼藉/);
    assert.equal(document.querySelectorAll('input').length, 0);
    await click('答对');
    assert.equal((await loadData()).events.length, 0);
    await click('下一步');
    assert.match(document.body.textContent!, /认识几个标志/);
    await click('下一步');
    assert.match(document.body.textContent!, /每天留多少时间/);
    await click('下一步');
    const select: any = document.querySelector('[aria-label="数学学习权重"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(select, '5');
      select.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.equal(
      [...document.querySelectorAll('.onboarding-weight-share')].reduce(
        (sum, el) => sum + Number(el.textContent?.replace('%', '')),
        0,
      ),
      100,
    );
    await click('下一步');
    assert.equal((await loadData()).settings.assistant?.weights.math, 5);
    assert.match(document.body.textContent!, /导入你的学习内容/);
    await click('打开导入工具');
    const imported = parseImportText(learningTemplate('choice'));
    for (const n of imported.nodes) await put('node', n);
    for (const q of imported.questions) await put('question', q);
    await render();
    await click('下一步');
    assert.match(document.body.textContent!, /建立你的能力起点/);
    await click('开始首次测试');
    assert.ok(started.items.length);
    assert.equal(started.mode, 'test');
    assert.equal(started.title, '首次能力诊断');
    assert.ok((await loadData()).settings.assistant?.onboardedAt);
    assert.equal(notice, '');
    view = 'assistant';
    await render();
    assert.match(document.body.textContent!, /暂未形成 GPA/);
    await click('按计划开始');
    assert.ok(started.items.length);
    assert.equal(requests, 0);
  } finally {
    await act(async () => root.unmount());
    await switchAccount(null);
    globalThis.fetch = fetchBefore;
    dom.window.close();
    for (const [key, p] of previous) {
      if (p) Object.defineProperty(globalThis, key, p);
      else delete (globalThis as any)[key];
    }
  }
});
test('furniture rotates around its full footprint centre rather than the first tile', () => {
  const p = {
    id: 'desk',
    item: 'furniture-desk',
    x: 1,
    y: 2,
    rotation: 0 as const,
  };
  assert.deepEqual(furnitureCenter(p), { x: 2, y: 2.5, depth: 4.5 });
  assert.deepEqual(furnitureCenter({ ...p, rotation: 1 }), {
    x: 1.5,
    y: 3,
    depth: 4.5,
  });
  assert.equal(iso(2, 2.5).y, iso(1.5, 3).y);
});
