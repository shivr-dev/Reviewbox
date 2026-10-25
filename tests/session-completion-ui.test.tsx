import test from 'node:test';
import assert from 'node:assert/strict';
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import StudyView from '../components/study-view';
import { ReviewContext } from '../components/review-context';
import { sessionForView, type StudySessionView } from '../lib/session-view';
import { loadData, put, switchAccount } from '../lib/store';
import { parseImportText } from '../lib/import-skill';
import { learningTemplate } from '../lib/import-templates';
import { computeMastery } from '../lib/engine';
import {advanceChest} from '../lib/game-client';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('saving the final real answer keeps the settlement visible and opens the chest only on request', async () => {
  const dom = new JSDOM('<body><div id="root"></div></body>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const keys = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'Document',
    'MutationObserver',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'Image',
    'getComputedStyle',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const before = keys.map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  for (const k of keys)
    Object.defineProperty(globalThis, k, {
      value:
        k === 'IS_REACT_ACT_ENVIRONMENT'
          ? true
          : k === 'getComputedStyle'
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as any)[k],
      configurable: true,
      writable: true,
    });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error('External AI forbidden in regression');
  };
  const root = createRoot(document.getElementById('root')!);
  let route = '',
    notice = '';
  try {
    await switchAccount('completion-regression');
    const imported = parseImportText(learningTemplate('choice'));
    const q = {
      ...imported.questions[0],
      type: 'recall' as const,
      prompt: '回忆本题定义',
    };
    await put('node', imported.nodes[0]);
    await put('question', q);
    await put(
      'setting',
      {
        name: '结算测试',
        dailyMinutes: 20,
        gameHearts: false,
        gameSound: false,
        alphaPreview: true,
      },
      'settings',
    );
    const session: StudySessionView = {
      id: 'completion-regression-session',
      mode: 'review',
      title: '完成流程',
      items: [{ question: q, priority: 1, reason: '回归检查' }],
    };
    await put(
      'job',
      { ...session, kind: 'session', status: 'active' },
      'active-session',
    );
    const initial = await loadData();
    function Harness() {
      const [data, setData] = useState(initial),
        [current, setCurrent] = useState<StudySessionView | null>(session);
      useEffect(
        () => setCurrent((c) => sessionForView(data.jobs, c, true)),
        [data.jobs],
      );
      return (
        <ReviewContext.Provider
          value={
            {
              data,
              states: computeMastery(data.nodes, data.events),
              subject: 'all',
              navigate: (p: string, id?: string) => {
                route = p + ':' + (id ?? '');
              },
              refresh: async () => {
                setData(await loadData());
              },
              notify: (s: string) => {
                notice = s;
              },
            } as any
          }
        >
          <StudyView
            session={current}
            finish={() => {
              setCurrent(null);
              route = 'home:';
            }}
          />
        </ReviewContext.Provider>
      );
    }
    await act(async () => root.render(<Harness />));
    const click = async (text: RegExp) => {
      const b = [...document.querySelectorAll('button')].find((b) =>
        text.test(b.textContent ?? ''),
      );
      assert.ok(b, text.source);
      await act(async () => {
        b.click();
        await new Promise((r) => setTimeout(r, 80));
      });
    };
    await act(async()=>{await new Promise(r=>setTimeout(r,1700))});
    await click(/^显示答案$/);
    await click(/^答对/);
    for (let i = 0; i < 30 && !document.querySelector('.session-summary'); i++)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    assert.equal(notice, '');
    assert.ok(
      document.querySelector('.session-summary'),
      'completion must remain visible after refresh',
    );
    assert.doesNotMatch(document.body.textContent!, /给回忆，一点专注/);
    assert.equal(route, '', 'no automatic redirect away from settlement');
    assert.equal((await loadData()).events.length, 1);
    assert.equal(
      (await loadData()).jobs?.find((j) => j.id === session.id)?.status,
      'complete',
    );
    await click(/^打开练习宝箱/);
    assert.equal(route, 'chest:' + session.id);
    assert.equal((await advanceChest(session.id)).stage,1);
    await advanceChest(session.id);
    assert.equal((await advanceChest(session.id)).stage,3);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = oldFetch;
    await switchAccount(null);
    dom.window.close();
    for (const [k, d] of before)
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as any)[k];
  }
});
