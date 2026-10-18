import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import CourseRoom from '../components/course-room';
import { ReviewContext } from '../components/review-context';
import { courseFixture } from './course-lifecycle.test';
import { saveCourse } from '../lib/course-client';
import { currentNamespace, loadData, switchAccount } from '../lib/store';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('free HTML cannot complete a newly created course by invoking its practice bridge on load', async () => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
    url: 'https://review.test/',
    pretendToBeVisual: true,
  });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
      configurable: true,
      writable: true,
    });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const root = createRoot(document.getElementById('root')!),
    ns = currentNamespace();
  let navigated = '',
    calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('/api/')) calls++;
    throw new Error('No generation in UI validation');
  };
  try {
    await switchAccount('course-bridge-ui-' + crypto.randomUUID());
    const course = courseFixture();
    course.sections[0].completedAt = undefined;
    course.sections[0].content!.checks = [];
    await saveCourse(course);
    const render = async () => {
      const data = await loadData();
      await act(async () =>
        root.render(
          <ReviewContext.Provider
            value={{
              data,
              states: {},
              refresh: render,
              navigate: (p) => {
                navigated = p;
              },
              notify: () => {},
              start: () => {
                throw new Error('Must use atomic course session');
              },
              subject: 'english',
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
            <CourseRoom courseId={course.id} />
          </ReviewContext.Provider>,
        ),
      );
    };
    await render();
    const frame = document.querySelector('iframe')!;
    const channel = JSON.parse(
      frame.srcdoc.match(/const channel=("[^"]+")/)![1],
    );
    await act(async () => {
      window.dispatchEvent(
        new dom.window.MessageEvent('message', {
          data: { courseBridge: 1, channel, method: 'practice', id: '1' },
          source: frame.contentWindow,
        }),
      );
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(
      (await loadData()).jobs?.find((j) => j.id === course.id)?.sections[0]
        .completedAt,
      undefined,
    );
    assert.equal(navigated, '');
    assert.match(document.body.textContent!, /课件已就绪/);
    await act(async () => {
      (
        document.querySelector('.lesson-footer .primary') as HTMLButtonElement
      ).click();
    });
    for (
      let attempt = 0;
      attempt < 100 && String(navigated) !== 'study';
      attempt++
    ) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });
    }
    assert.equal(navigated, 'study');
    assert.equal(
      (await loadData()).jobs?.find((j) => j.kind === 'session')?.items.length,
      1,
    );
    assert.equal(calls, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await switchAccount(ns === 'local' ? null : ns);
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    dom.window.close();
  }
});
