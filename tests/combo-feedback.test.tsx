import test from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createRequire } from 'node:module';
import {
  ComboCelebration,
  ComboIndicator,
  type RewardFeedback,
} from '../components/learning-game';
import { ReviewContext } from '../components/review-context';
import { fixture } from './study-plan-fixtures';
import {
  COMBO_MOTION,
  comboMilestone,
  nextComboMilestone,
} from '../lib/combo-feedback';
const { JSDOM } = createRequire(import.meta.url)('jsdom');

test('combo milestones continue beyond twenty and expose the next predictable milestone', () => {
  assert.deepEqual(
    Array.from({ length: 31 }, (_, i) => i).filter(comboMilestone),
    [3, 5, 10, 15, 20, 25, 30],
  );
  assert.deepEqual(
    [0, 2, 3, 4, 5, 26].map(nextComboMilestone),
    [3, 3, 5, 5, 10, 30],
  );
  assert.equal(comboMilestone(3.5), false);
});
test('Alpha combo enters and exits smoothly, survives ordinary reward updates, and never replays the same event', async (t) => {
  const dom = new JSDOM(
    '<body><button id="before">作答</button><div id="root"></div></body>',
    { url: 'https://review.test/' },
  );
  const keys = [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'Image',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const before = keys.map(
    (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const,
  );
  for (const k of keys)
    Object.defineProperty(globalThis, k, {
      value: k === 'IS_REACT_ACT_ENVIRONMENT' ? true : (dom.window as any)[k],
      configurable: true,
      writable: true,
    });
  dom.window.matchMedia = () => ({ matches: false }) as any;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const root = createRoot(document.getElementById('root')!);
  const data = fixture();
  data.settings.alphaPreview = true;
  const reward = (combo: number): RewardFeedback => ({
    id: 'attempt:' + combo,
    combo,
    correct: true,
    counted: true,
    xp: 15,
    coins: 3,
  });
  const render = async (r: RewardFeedback | null) =>
    act(async () =>
      root.render(
        <ReviewContext.Provider value={{ data } as any}>
          <ComboCelebration reward={r} />
          <ComboIndicator reward={r} />
        </ReviewContext.Provider>,
      ),
    );
  try {
    document.getElementById('before')!.focus();
    await render(reward(2));
    assert.equal(document.querySelector('.combo-screen'), null);
    assert.match(
      document.querySelector('.combo-progress')!.textContent!,
      /下个里程碑 3/,
    );
    await render(reward(3));
    assert.ok(document.querySelector('.phase-enter'));
    await act(async () => t.mock.timers.tick(COMBO_MOTION.enter));
    assert.ok(document.querySelector('.phase-hold'));
    await render(reward(4));
    assert.ok(document.querySelector('[aria-label="3 连对，学习里程碑"]'));
    await act(async () =>
      t.mock.timers.tick(COMBO_MOTION.hold - COMBO_MOTION.enter),
    );
    assert.ok(document.querySelector('.phase-exit'));
    await act(async () => t.mock.timers.tick(COMBO_MOTION.exit));
    assert.equal(document.querySelector('.combo-screen'), null);
    assert.equal(document.activeElement?.id, 'before');
    await render(reward(3));
    assert.equal(document.querySelector('.combo-screen'), null);
    await render(reward(25));
    assert.ok(document.querySelector('[aria-label="25 连对，学习里程碑"]'));
    await act(async () =>
      window.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape' }),
      ),
    );
    assert.ok(document.querySelector('.phase-exit'));
    await act(async () => t.mock.timers.tick(COMBO_MOTION.exit));
    assert.equal(document.querySelector('.combo-screen'), null);
    await render({ ...reward(30), counted: false });
    assert.equal(document.querySelector('.combo-screen'), null);
    await render({ ...reward(35), correct: false });
    assert.equal(document.querySelector('.combo-screen'), null);
  } finally {
    await act(async () => root.unmount());
    t.mock.timers.reset();
    dom.window.close();
    for (const [k, d] of before)
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (globalThis as any)[k];
  }
});
