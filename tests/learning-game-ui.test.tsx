import test from 'node:test';
import assert from 'node:assert/strict';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { ReviewContext } from '../components/review-context';
import StudyView from '../components/study-view';
import ShopView from '../components/shop-view';
import YouView from '../components/you-view';
import ChestView from '../components/chest-view';
import { ComboCelebration, Penguin } from '../components/learning-game';
import { loadData, put, switchAccount } from '../lib/store';
import { learningTemplate } from '../lib/import-templates';
import { parseImportText } from '../lib/import-skill';
import { computeMastery } from '../lib/engine';
import { localDay, type AnswerEvent } from '../lib/model';

test('manually imported item: reveal, XP persistence, standalone recovery and shop, combo skip; no external AI', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const names = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'Document',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'MutationObserver',
    'getComputedStyle',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
    'ResizeObserver',
  ];
  const previous = names.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of names)
    Object.defineProperty(globalThis, key, {
      value:
        key === 'IS_REACT_ACT_ENVIRONMENT'
          ? true
          : key === 'ResizeObserver'
            ? class {
                observe() {}
                unobserve() {}
                disconnect() {}
              }
            : key === 'getComputedStyle'
              ? dom.window.getComputedStyle.bind(dom.window)
              : (dom.window as any)[key],
      configurable: true,
      writable: true,
    });
  const fetchBefore = globalThis.fetch;
  let network = 0;
  globalThis.fetch = async () => {
    network++;
    throw new Error('No real AI allowed');
  };
  const root = createRoot(document.getElementById('root')!);
  let view = 'study',
    route = '',
    current: any,
    notice = '';
  try {
    await switchAccount('game-ui');
    const parsed = parseImportText(learningTemplate('choice'));
    const q = {
      ...parsed.questions[0],
      type: 'recall',
      prompt: '回忆：二次函数的顶点是什么？',
    };
    await put('node', parsed.nodes[0]);
    await put('question', q);
    await put(
      'setting',
      {
        name: '手动导入测试',
        dailyMinutes: 20,
        surprise: true,
        gameSound: false,
      },
      'settings',
    );
    const session = {
      id: 'game-ui-session',
      mode: 'review' as const,
      title: '手动练习',
      items: [{ question: q, priority: 1, reason: '手动导入' }],
    };
    const click = async (text: string) => {
      const el = [...document.querySelectorAll('button')].find(
        (el) => el.textContent?.trim() === text,
      );
      assert.ok(el, `button ${text}`);
      await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, view === 'chest' ? 700 : 160));
      });
      assert.equal(notice, '');
    };
    function Harness() {
      const [data, setData] = useState(current);
      return (
        <ReviewContext.Provider
          value={{
            data,
            states: computeMastery(data.nodes, data.events),
            refresh: async () => {
              current = await loadData();
              setData(current);
            },
            start: () => {},
            navigate: (page) => (route = page),
            notify: (text) => (notice = text),
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
          {view === 'you' ? (
            <YouView />
          ) : view === 'chest' ? (
            <ChestView sessionId="ui-chest" />
          ) : view === 'penguin' ? (
            <Penguin />
          ) : view === 'shop' ? (
            <ShopView />
          ) : view === 'combo' ? (
            <ComboCelebration
              reward={{
                id: 'combo-ui',
                xp: 15,
                coins: 3,
                combo: 3,
                counted: true,
                correct: true,
              }}
            />
          ) : (
            <StudyView session={session} finish={() => (route = 'home')} />
          )}
        </ReviewContext.Provider>
      );
    }
    const render = async () => {
      current = await loadData();
      await act(async () => root.render(<Harness key={view} />));
    };
    await render();
    assert.match(document.body.textContent!, /回忆：二次函数/);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    await click('显示答案');
    assert.ok(
      document.querySelector('[role="dialog"]') ||
        document.querySelector('.answer-modal'),
    );
    await click('答对3');
    assert.match(document.body.textContent!, /12 XP/);
    assert.equal((await loadData()).events.length, 1);
    // Recovery is a separate screen: original question and card are absent, not overlaid.
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const e: AnswerEvent = {
        ...(await loadData()).events[0],
        id: 'wrong-ui' + i,
        questionId: 'w' + i,
        sessionId: 'other',
        score: 0,
        outcome: 'wrong',
        occurredAt: new Date(now - 50 + i).toISOString(),
        localDay: localDay(),
      };
      await put('event', e);
    }
    view = 'recovery';
    session.id = 'next-ui-session';
    await render();
    assert.ok(document.querySelector('.game-recovery-screen'));
    assert.equal(document.querySelector('.question-card'), null);
    await click('打开点数商店');
    assert.equal(route, 'shop');
    await click('开始恢复练习');
    assert.equal(document.querySelector('.game-recovery-screen'), null);
    assert.match(document.body.textContent!, /恢复练习/);
    assert.equal(
      (await loadData()).jobs?.find((j) => j.id === session.id)?.items.length,
      4,
    );
    view = 'shop';
    await render();
    assert.equal(document.querySelectorAll('.game-shop-item').length, 14);
    assert.match(document.body.textContent!, /探险家企鹅/);
    assert.match(document.body.textContent!, /毕业礼企鹅/);
    view = 'combo';
    await render();
    assert.ok(document.querySelector('.combo-screen'));
    await click('跳过');
    assert.equal(document.querySelector('.combo-screen'), null);
    view = 'you';
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    assert.ok(
      document.querySelector('input[name="passphrase"]'),
      'unlock field exists in native preview',
    );
    await put(
      'job',
      { id: 'ui-chest', kind: 'session', status: 'complete', mode: 'review' },
      'active-session',
    );
    await put('event', {
      ...(await loadData()).events[0],
      id: 'ui-chest-event',
      sessionId: 'ui-chest',
    });
    view = 'chest';
    await render();
    assert.ok(document.querySelector('.chest-illustration'));
    assert.equal(document.querySelector('.question-card'), null);
    await click('点击开箱 · 1 / 3');
    await click('点击开箱 · 2 / 3');
    await click('最后一次，开启！');
    assert.ok(document.querySelector('.stage-3 .treasure-prize'));
    const before = {
      Image: Object.getOwnPropertyDescriptor(globalThis, 'Image'),
      raf: globalThis.requestAnimationFrame,
      cancel: globalThis.cancelAnimationFrame,
    };
    const callbacks = new Map<number, FrameRequestCallback>();
    let images = 0,
      frameId = 0;
    class MockImage {
      onload?: () => void;
      onerror?: () => void;
      set src(value: string) {
        images++;
        this.onload?.();
      }
    }
    Object.defineProperty(globalThis, 'Image', {
      value: MockImage,
      configurable: true,
      writable: true,
    });
    globalThis.requestAnimationFrame = (cb) => {
      callbacks.set(++frameId, cb);
      return frameId;
    };
    globalThis.cancelAnimationFrame = (id) => {
      callbacks.delete(id);
    };
    try {
      view = 'penguin';
      await render();
      const penguin = document.querySelector('.learning-penguin')!;
      const enter = () =>
        penguin.dispatchEvent(
          new dom.window.MouseEvent('mouseover', {
            bubbles: true,
            relatedTarget: document.body,
          }),
        );
      const tick = async (time: number) => {
        const pending = [...callbacks.values()];
        callbacks.clear();
        await act(async () => pending.forEach((cb) => cb(time)));
      };
      await act(async () => {
        enter();
      });
      await tick(100);
      await tick(513);
      assert.equal(
        (document.querySelector('.penguin-sprite') as HTMLElement).style
          .backgroundPosition,
        '100% 0%',
      );
      await act(async () => {
        enter();
        enter();
      });
      assert.equal(images, 1, 'hover must not restart active animation');
      await tick(750);
      assert.equal(
        (document.querySelector('.penguin-sprite') as HTMLElement).style
          .backgroundPosition,
        '0% 100%',
      );
      await tick(1250);
      assert.equal(
        document.querySelector('.penguin-sprite'),
        null,
        'motion completes once',
      );
    } finally {
      globalThis.requestAnimationFrame = before.raf;
      globalThis.cancelAnimationFrame = before.cancel;
      if (before.Image)
        Object.defineProperty(globalThis, 'Image', before.Image);
      else delete (globalThis as any).Image;
    }
    assert.equal(network, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = fetchBefore;
    dom.window.close();
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
  }
});
