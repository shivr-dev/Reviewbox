import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewContext } from '../components/review-context';
import PressureLab from '../components/pressure-lab';
import StudyView from '../components/study-view';
import { put, switchAccount, loadData } from '../lib/store';
import { computeMastery } from '../lib/engine';
import { parseImportText } from '../lib/import-skill';
import { learningTemplate } from '../lib/import-templates';
import { type StudyData } from '../lib/model';

test('manually imported pressure item saves, resumes, scores once, reports and handles an expired recovery without any AI call', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'https://review.test/' },
  );
  const globals = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
  ] as const;
  const descriptors = globals.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of globals)
    Object.defineProperty(globalThis, key, {
      value:
        key === 'IS_REACT_ACT_ENVIRONMENT' ? true : (dom.window as any)[key],
      configurable: true,
      writable: true,
    });
  const priorFetch = globalThis.fetch;
  let aiCalls = 0;
  globalThis.fetch = async () => {
    aiCalls++;
    throw new Error('No AI calls permitted in verification');
  };
  const messages: string[] = [];
  const root = createRoot(document.getElementById('root')!);
  try {
    await switchAccount('intelligence-ui-manual');
    const manual = JSON.parse(learningTemplate('choice'));
    Object.assign(manual.questions[0], {
      prompt: '2×3等于多少？',
      options: ['3', '5', '6', '8'],
      answer: '6',
      explanation: '2×3=6',
    });
    const parsed = parseImportText(JSON.stringify(manual));
    assert.equal(parsed.questions.length, 1);
    for (const n of parsed.nodes) await put('node', n, n.id);
    for (const q of parsed.questions) await put('question', q, q.id);
    let initial = await loadData();
    function Harness() {
      const [data, setData] = useState<StudyData>(initial);
      const value: any = {
        data,
        states: computeMastery(data.nodes, data.events),
        refresh: async () => setData(await loadData()),
        notify: (m: string) => messages.push(m),
        start: () => {},
        navigate: () => {},
        aiReady: false,
      };
      return (
        <ReviewContext.Provider value={value}>
          <PressureLab subject="math" />
        </ReviewContext.Provider>
      );
    }
    await act(async () => root.render(<Harness />));
    const click = async (text: string) => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
      );
      assert.ok(button, `button missing: ${text}`);
      await act(async () => {
        button!.click();
        await new Promise((r) => setTimeout(r, 30));
      });
    };
    await click('开始压力测试');
    assert.match(document.body.textContent!, /答案在交卷后公开/);
    assert.doesNotMatch(document.body.textContent!, /参考答案：/);
    const option = Array.from(
      document.querySelectorAll('.question-options button'),
    ).find((b) => b.textContent?.trim() === '6');
    assert.ok(option);
    await act(async () => {
      (option as HTMLButtonElement).click();
    });
    await click('保存并退出');
    assert.ok(
      (await loadData()).jobs?.some(
        (j) => j.kind === 'pressure' && j.status === 'active',
      ),
    );
    await click('恢复测试');
    assert.equal(
      document.querySelector('.question-options .chosen')?.textContent,
      '6',
    );
    await click('交卷');
    assert.match(document.body.textContent!, /压力下的能力表现/);
    const snapshot = await loadData();
    const scored = snapshot.events.filter((e) => e.learningEvidence?.pressure);
    assert.equal(scored.length, 1);
    assert.equal(scored[0].score, 1);
    assert.equal(
      snapshot.tests.filter((t) => t.sessionId === scored[0].sessionId).length,
      1,
    );
    await click('关闭报告');
    await act(async () => root.unmount());
    const active = snapshot.jobs!.find((j) => j.kind === 'pressure');
    await put(
      'job',
      {
        ...active,
        id: 'expired-run',
        status: 'active',
        deadline: Date.now() - 1000,
        answers: {},
        eventIds: undefined,
      },
      'pressure:active:math',
    );
    initial = await loadData();
    const expiredRoot = createRoot(document.getElementById('root')!);
    await act(async () => expiredRoot.render(<Harness />));
    await click('恢复测试');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const expired = (await loadData()).events.find(
      (e) => e.sessionId === 'expired-run',
    );
    assert.ok(expired?.learningEvidence?.timedOut);
    assert.equal(expired?.score, 0);
    await act(async () => expiredRoot.unmount());
    await switchAccount('intelligence-ui-study');
    for (const n of parsed.nodes) await put('node', n, n.id);
    const original = parsed.questions[0],
      variant = {
        ...original,
        id: 'ui-variant',
        prompt: '3×2等于多少？',
        variant: 'swapped-operation',
        verified: true,
      };
    await put('question', original, original.id);
    await put('question', variant, variant.id);
    const studySession = {
      id: 'ui-guessing',
      mode: 'review' as const,
      title: '验证练习',
      items: [{ question: original, reason: '专项练习', priority: 1 }],
    };
    const studyRoot = createRoot(document.getElementById('root')!);
    initial = await loadData();
    function StudyHarness() {
      const [data, setData] = useState(initial);
      const value: any = {
        data,
        states: computeMastery(data.nodes, data.events),
        refresh: async () => setData(await loadData()),
        notify: (m: string) => messages.push(m),
        aiReady: false,
      };
      return (
        <ReviewContext.Provider value={value}>
          <StudyView session={studySession} finish={() => {}} />
        </ReviewContext.Provider>
      );
    }
    await act(async () => studyRoot.render(<StudyHarness />));
    await click('6');
    await click('猜测');
    await click('显示答案');
    const rating = Array.from(
      document.querySelectorAll('.rating-actions button'),
    ).find((b) => b.textContent?.includes('答对'))!;
    await act(async () => {
      (rating as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 40));
    });
    assert.match(document.body.textContent!, /交叉验证/);
    const studySaved = await loadData(),
      sourceEvent = studySaved.events.find(
        (e) => e.sessionId === 'ui-guessing',
      )!;
    assert.equal(sourceEvent.learningEvidence?.suspect, true);
    assert.equal(
      studySaved.jobs!.find((j) => j.id === 'ui-guessing').items.length,
      2,
    );
    // Simulate interruption: restore the appended question from the persisted session.
    await act(async () => studyRoot.unmount());
    const resumedRoot = createRoot(document.getElementById('root')!);
    const restored = studySaved.jobs!.find((j) => j.id === 'ui-guessing');
    initial = studySaved;
    function ResumeHarness() {
      const [data, setData] = useState(initial);
      const value: any = {
        data,
        states: computeMastery(data.nodes, data.events),
        refresh: async () => setData(await loadData()),
        notify: (m: string) => messages.push(m),
        aiReady: false,
      };
      return (
        <ReviewContext.Provider value={value}>
          <StudyView session={restored} finish={() => {}} />
        </ReviewContext.Provider>
      );
    }
    await act(async () => resumedRoot.render(<ResumeHarness />));
    assert.match(document.body.textContent!, /3×2等于多少/);
    await click('6');
    await click('有把握');
    await click('显示答案');
    const confirm = Array.from(
      document.querySelectorAll('.rating-actions button'),
    ).find((b) => b.textContent?.includes('答对'))!;
    await act(async () => {
      (confirm as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 40));
    });
    const linked = (await loadData()).events.filter(
      (e) => e.learningEvidence?.verificationOf === sourceEvent.id,
    );
    assert.equal(linked.length, 1);
    assert.equal(linked[0].score, 1);
    assert.match(document.body.textContent!, /SESSION COMPLETE/);
    await act(async () => resumedRoot.unmount());
    assert.equal(aiCalls, 0);
    assert.deepEqual(messages, []);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.window.close();
  }
});
