import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewContext } from '../components/review-context';

import { put, switchAccount, loadData } from '../lib/store';
import { computeMastery } from '../lib/engine';
import { learningTemplate } from '../lib/import-templates';
import { parseImportText } from '../lib/import-skill';
import type { StudyData, AnswerEvent } from '../lib/model';

test('manual item: pause/resume modal, persisted steps with mocked failure/retry, report to remediation and original-skill practice; zero external requests', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'https://review.test/', pretendToBeVisual: true },
  );
  const keys = [
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
  ] as const;
  const descriptors = keys.map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  for (const key of keys)
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
  dom.window.HTMLCanvasElement.prototype.getContext = () =>
    ({ fillRect() {}, drawImage() {} }) as any;
  const fetchBefore = globalThis.fetch;
  let mockedCalls = 0,
    externalCalls = 0,
    assisted = false;
  globalThis.fetch = async (url, init) => {
    if (url !== '/api/ai') {
      externalCalls++;
      throw new Error('External calls forbidden');
    }
    mockedCalls++;
    assert.equal(JSON.parse(String(init?.body)).action, 'diagnose-process');
    return mockedCalls === 1
      ? Response.json({ error: '测试：服务暂时不可用' }, { status: 503 })
      : Response.json({
          diagnosis: {
            status: 'first-error',
            firstStep: 1,
            quote: 'x=6-2',
            attribute: 'symbolic',
            explanation: '第二步将除法写成了减法',
            suggestion: '等式两边同时除以2，得到x=3',
            confidence: 0.9,
          },
        });
  };
  const root = createRoot(document.getElementById('root')!);
  let view = 'quality',
    route = '',
    started: any[] = [];
  try {
    const { default: QuestionReviewButton } =
      await import('../components/question-review');
    const { default: ProcessNotebook } =
      await import('../components/process-notebook');
    const { default: RemediationCourse, RemediationLauncher } =
      await import('../components/remediation-course');
    await switchAccount('repair-ui');
    const manual = JSON.parse(learningTemplate('choice'));
    Object.assign(manual.questions[0], {
      subject: 'math',
      prompt: '2x=6，求x。',
      options: ['1', '2', '3', '4'],
      answer: '3',
      explanation: '等式两边同时除以2，x=3。',
    });
    const parsed = parseImportText(JSON.stringify(manual));
    const q = parsed.questions[0],
      n = parsed.nodes[0];
    await put('node', n);
    await put('question', q);
    const e: AnswerEvent = {
      id: 'ui-missed',
      questionId: q.id,
      nodeId: n.id,
      skillId: q.skillId,
      subject: q.subject,
      outcome: 'wrong',
      score: 0,
      source: 'test',
      answer: '4',
      occurredAt: new Date().toISOString(),
      displayedAt: new Date().toISOString(),
      revealedAt: new Date().toISOString(),
      activeThinkMs: 30000,
      expectedSeconds: 30,
      difficulty: 2,
      variant: q.variant,
      usedHint: false,
      reason: '测试',
      sessionId: 'ui-report',
      localDay: '2026-10-07',
      version: 1,
    };
    await put('event', e);
    await put('job', {
      id: 'process-draft:ui-work:' + q.id,
      kind: 'process-draft',
      text: '2x=6\nx=6-2\nx=4',
      image: '',
      afterReveal: false,
    });
    const initial = await loadData();
    function Harness() {
      const [d, setD] = useState<StudyData>(initial),
        [page, setPage] = useState(view);
      const context: any = {
        data: d,
        states: computeMastery(d.nodes, d.events),
        refresh: async () => setD(await loadData()),
        notify: () => {},
        aiReady: true,
        start: (items: any[]) => {
          started = items;
        },
        navigate: (p: string, id: string) => {
          route = id;
          setPage(p);
        },
      };
      return (
        <ReviewContext.Provider value={context}>
          {page === 'quality' ? (
            <QuestionReviewButton question={q} />
          ) : page === 'process' ? (
            <ProcessNotebook
              question={q}
              sessionId="ui-work"
              revealed={false}
              onAssistance={() => {
                assisted = true;
              }}
              onClose={() => {}}
            />
          ) : page === 'remedy' ? (
            <RemediationCourse courseId={route} />
          ) : (
            <RemediationLauncher sessionId="ui-report" title="手动导入测试" />
          )}
        </ReviewContext.Provider>
      );
    }
    const click = async (text: string) => {
      const b = [...document.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === text,
      );
      assert.ok(b, `missing ${text}`);
      await act(async () => {
        b!.click();
        await new Promise((r) => setTimeout(r, 35));
      });
    };
    await act(async () => root.render(<Harness key="quality" />));
    await click('题目有误？');
    await click('暂停这道题');
    assert.ok((await loadData()).events.find((x) => x.id === e.id)?.voidedBy);
    await click('核对无误，恢复原题');
    assert.equal(
      (await loadData()).events.find((x) => x.id === e.id)?.voidedBy,
      undefined,
    );
    view = 'process';
    await act(async () => root.render(<Harness key="process" />));
    assert.equal(
      (document.querySelector('textarea') as HTMLTextAreaElement).value,
      '2x=6\nx=6-2\nx=4',
    );
    await click('分析首个出错步骤');
    assert.match(document.body.textContent!, /服务暂时不可用/);
    await click('分析首个出错步骤');
    assert.match(document.body.textContent!, /第 2 步/);
    assert.equal(assisted, true);
    assert.equal(
      (await loadData()).jobs?.filter((j) => j.kind === 'process-evidence')
        .length,
      1,
    );
    view = 'launcher';
    await act(async () => root.render(<Harness key="launcher" />));
    await click('建立补救课程');
    assert.match(route, /^remediation:/);
    assert.match(document.body.textContent!, /讲清问题/);
    await click('已理解，进行对比');
    assert.match(document.body.textContent!, /原作答/);
    await click('已完成对比，进入巩固');
    await click('开始巩固练习');
    assert.equal(started.length, 1);
    assert.equal(started[0].question.nodeId, n.id);
    assert.equal(started[0].question.skillId, q.skillId);
    assert.ok(started[0].scaffold);
    assert.equal(mockedCalls, 2);
    assert.equal(externalCalls, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = fetchBefore;
    for (const [k, d] of descriptors) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as any)[k];
    }
    dom.window.close();
  }
});
