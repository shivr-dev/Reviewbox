import test from 'node:test';
import assert from 'node:assert/strict';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import ExamSchedule from '../components/exam-schedule';
import AutoPracticeStart from '../components/auto-practice-start';
import { ReviewContext } from '../components/review-context';
import { fixture, schoolExam } from './study-plan-fixtures';
import { loadData, put, switchAccount } from '../lib/store';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
async function browserTest(
  run: (dom: any, root: ReturnType<typeof createRoot>) => Promise<void>,
) {
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
    'FormData',
    'Image',
    'getComputedStyle',
    'localStorage',
    'ResizeObserver',
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
          : k === 'ResizeObserver'
            ? class {
                observe() {}
                unobserve() {}
                disconnect() {}
              }
            : k === 'getComputedStyle'
              ? dom.window.getComputedStyle.bind(dom.window)
              : (dom.window as any)[k],
      configurable: true,
      writable: true,
    });
  const root = createRoot(document.getElementById('root')!);
  try {
    await run(dom, root);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [k, d] of before)
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as any)[k];
  }
}
const settle = () => new Promise((r) => setTimeout(r, 100));
async function click(text: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  assert.ok(b, 'button ' + text);
  assert.equal(b.disabled, false);
  await act(async () => {
    b.click();
    await settle();
  });
}

test('exam UI edits real records, selects chapters, separates cancellation from confirmed deletion, and preserves a retry after failure', async () => {
  await browserTest(async (dom, root) => {
    await switchAccount('exam-schedule-ui');
    try {
      const d = fixture();
      for (const n of d.nodes) await put('node', n);
      const exam = {
        ...schoolExam(d, Date.now(), -3),
        id: 'exam-ui',
        title: '期中考试',
        result: {
          score: 80,
          maxScore: 100,
          credits: 1,
          recordedAt: new Date(Date.now() - 1000).toISOString(),
        },
      };
      await put('exam', exam);
      const initial = await loadData();
      function Harness() {
        const [data, setData] = useState(initial);
        return (
          <ReviewContext.Provider
            value={
              {
                data,
                refresh: async () => setData(await loadData()),
                notify: () => {},
                subject: 'all',
              } as any
            }
          >
            <ExamSchedule />
          </ReviewContext.Provider>
        );
      }
      await act(async () => root.render(<Harness />));
      await click('取消学习安排');
      assert.match(document.body.textContent!, /已取消安排/);
      assert.match(document.body.textContent!, /80 \/ 100，成绩仍计入 GPA/);
      await click('编辑考试');
      assert.match(
        document.querySelector('[role="dialog"]')!.textContent!,
        /已有成绩不会被编辑表单覆盖/,
      );
      const title = document.querySelector<HTMLInputElement>(
        'input[name="title"]',
      )!;
      assert.equal(title.value, '期中考试');
      title.value = '修订期中考试';
      const chapter = document.querySelector<HTMLButtonElement>(
        '[aria-label="全选章节 math"]',
      );
      assert.ok(chapter);
      await act(async () => {
        chapter.click();
        await settle();
      });
      assert.match(
        document.querySelector('.exam-scope-picker')!.textContent!,
        /已选 3 个知识点/,
      );
      const form = title.closest('form')!;
      await act(async () => {
        form.dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true }),
        );
        await settle();
      });
      assert.equal(
        (await loadData()).exams.find((e) => e.id === exam.id)?.title,
        '修订期中考试',
      );
      assert.equal(
        (await loadData()).exams.find((e) => e.id === exam.id)?.result?.score,
        80,
      );
      await click('删除记录');
      assert.ok(
        (await loadData()).exams.some((e) => e.id === exam.id),
        'first click must only request confirmation',
      );
      // Another writer removes the record before confirmation; UI must retain the failed dialog.
      const latest = (await loadData()).exams.find((e) => e.id === exam.id)!;
      await put('exam', latest, latest.id, true);
      await click('确认删除记录');
      assert.match(
        document.querySelector('[role="alert"]')!.textContent!,
        /考试记录已变更或删除/,
      );
      assert.ok(document.querySelector('[role="dialog"]'));
      await put('exam', latest);
      await click('确认删除记录');
      assert.ok(!(await loadData()).exams.some((e) => e.id === exam.id));
      await click('撤销删除');
      assert.equal(
        (await loadData()).exams.find((e) => e.id === exam.id)?.result?.score,
        80,
      );
      assert.match(document.body.textContent!, /修订期中考试/);
    } finally {
      await switchAccount(null);
    }
  });
});
test('Auto requires an explicit preference, offers a five-second opt-out, never starts tests, and starts ordinary practice only once', async (t) => {
  await browserTest(async (dom, root) => {
    const data = fixture();
    data.settings.studyMode = 'auto';
    let starts = 0;
    const action = {
      id: 'practice',
      kind: 'practice' as const,
      title: '当前练习',
      reason: '到期复习',
      label: '开始',
      minutes: 5,
    };
    t.mock.timers.enable({ apis: ['setInterval'] });
    const render = async (key: string, kind: string = 'practice') =>
      act(async () =>
        root.render(
          <ReviewContext.Provider
            value={{ data, refresh: async () => {} } as any}
          >
            <AutoPracticeStart
              key={key}
              ready
              pageMode="agenda"
              action={{ ...action, kind } as any}
              blocked={false}
              onStart={() => {
                starts++;
              }}
            />
          </ReviewContext.Provider>,
        ),
      );
    try {
      await render('first');
      assert.match(document.body.textContent!, /由你决定是否自动开始/);
      await act(async () => t.mock.timers.tick(10000));
      assert.equal(starts, 0);
      await click('本次不自动开始');
      await act(async () => t.mock.timers.tick(10000));
      assert.equal(starts, 0);
      data.settings.studyAutoStart = {
        enabled: true,
        acknowledgedAt: new Date().toISOString(),
      };
      await render('enabled');
      assert.match(document.body.textContent!, /5\s*秒后开始/);
      await act(async () => t.mock.timers.tick(4000));
      assert.equal(starts, 0);
      await click('本次不自动开始');
      await act(async () => t.mock.timers.tick(10000));
      assert.equal(starts, 0);
      await render('enabled-again');
      await act(async () => t.mock.timers.tick(5000));
      assert.equal(starts, 1);
      await act(async () => t.mock.timers.tick(20000));
      assert.equal(starts, 1);
      await render('assessment', 'test');
      await act(async () => t.mock.timers.tick(20000));
      assert.equal(starts, 1);
      data.settings.studyAutoStart.enabled = false;
      await render('disabled');
      await act(async () => t.mock.timers.tick(20000));
      assert.equal(starts, 1);
    } finally {
      t.mock.timers.reset();
    }
  });
});
