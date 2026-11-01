import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import { ReviewContext } from '../components/review-context';
import OnboardingView from '../components/onboarding-view';
import DailyAssistant from '../components/daily-assistant';
import HomeView from '../components/home-view';
import StudyPlanView from '../components/study-plan-view';
import ExamResults from '../components/exam-results';
import { loadData, put, switchAccount } from '../lib/store';
import { parseImportText } from '../lib/import-skill';
import { learningTemplate } from '../lib/import-templates';
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
    'Document',
    'MutationObserver',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'Image',
    'FormData',
    'getComputedStyle',
    'localStorage',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value:
        key === 'IS_REACT_ACT_ENVIRONMENT'
          ? true
          : key === 'getComputedStyle'
            ? dom.window.getComputedStyle.bind(dom.window)
            : dom.window[key],
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
    navigated = '',
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
            navigate: (p) => {
              navigated = p;
            },
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
          {view === 'onboarding' ? (
            <OnboardingView />
          ) : view === 'home' ? (
            <HomeView />
          ) : view === 'plan' ? (
            <StudyPlanView />
          ) : view === 'scores' ? (
            <ExamResults />
          ) : (
            <DailyAssistant />
          )}
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
    for (
      let i = 0;
      i < 100 &&
      document.querySelector(
        '.onboarding-content footer .primary:disabled,.exam-results-dialog button[type="submit"]:disabled',
      );
      i++
    )
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
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
    const time = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.onboarding-time-options button',
      ),
    ].find((b) => b.querySelector('strong')?.textContent === '45')!;
    assert.ok(time);
    await act(async () => time.click());
    assert.equal(time.getAttribute('aria-pressed'), 'true');
    assert.equal(
      document.querySelectorAll(
        '.onboarding-time-options button[aria-pressed="true"]',
      ).length,
      1,
    );
    await click('下一步');
    assert.equal((await loadData()).settings.dailyMinutes, 45);
    assert.equal((await loadData()).settings.assistant?.dailyMinutes, 45);
    const select: any = document.querySelector('[aria-label="数学学习权重"]')!;
    assert.ok(select, '权重步骤在保存完成后显示');
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
    const date = new Date(Date.now() - 2 * 86400000).toLocaleDateString(
      'en-CA',
    );
    await put('exam', {
      id: 'ui-exam',
      title: '数学月考',
      subject: 'math',
      date,
      scope: [],
      target: 80,
      dailyMinutes: 20,
    });
    view = 'home';
    await render();
    assert.equal(document.querySelectorAll('.game-main-action').length, 1);
    assert.equal(document.querySelectorAll('.quest-card').length, 0);
    assert.equal(document.querySelectorAll('.now-home button').length, 1);
    assert.equal(
      document.querySelectorAll(
        '.daily-assistant,.learning-grid,.exam-result-entry,.hero-plan-meta',
      ).length,
      0,
    );
    assert.doesNotMatch(
      document.body.textContent!,
      /PERSONAL STUDY PLAN|DAILY QUEST/,
    );
    await click('进入学习计划');
    assert.equal(navigated, 'plan');
    view = 'plan';
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    assert.match(document.body.textContent!, /考后成绩记录/);
    assert.ok(
      document.querySelector('.exam-results-dialog'),
      '到登记时间后主动打开成绩填写',
    );
    function fill(label: string, value: string) {
      const el = document.querySelector<HTMLInputElement>(
        '[aria-label="' + label + '"]',
      )!;
      assert.ok(el, label);
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      )!.set!.call(el, value);
      el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }
    await act(async () => {
      fill('实际得分', '120');
      fill('试卷满分', '150');
      fill('学分或权重', '2');
    });
    await click('保存成绩');
    assert.match(notice, /成绩已保存/);
    assert.equal(
      (await loadData()).exams.find((e) => e.id === 'ui-exam')!.result!.score,
      120,
    );
    assert.match(
      document.querySelector('.real-gpa-summary')!.textContent!,
      /3.20/,
    );
    await click('GPA 公式');
    await act(async () => {
      fill('GPA 满分', '5');
      fill('GPA 换算公式', 'ratio * scale');
    });
    await click('保存公式');
    assert.match(notice, /公式已保存/);
    assert.match(
      document.querySelector('.real-gpa-summary')!.textContent!,
      /4.00 \/ 5.00/,
    );
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
