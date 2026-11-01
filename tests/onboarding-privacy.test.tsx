import test from 'node:test';
import assert from 'node:assert/strict';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import OnboardingView from '../components/onboarding-view';
import OnboardingAccount from '../components/onboarding-account';
import { ReviewContext } from '../components/review-context';
import { loadData, switchAccount, put } from '../lib/store';
import { AGREEMENT_VERSION } from '../lib/product-agreement';
import i18n from '../lib/i18n';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'localStorage', {
  value: window.localStorage,
  configurable: true,
});
window.scrollTo = () => {};
const pause = () => new Promise((r) => setTimeout(r, 15));
async function until(predicate: () => boolean) {
  for (let attempt=0; attempt<120 && !predicate(); attempt++) await act(async()=>{await pause();});
  assert.ok(predicate(), 'Expected the asynchronous UI transition to finish');
}
test('a locked device can enter its connection passphrase and account credentials in one form', async () => {
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ cloudReady: false })) as typeof fetch;
  try {
    await act(async () => { root.render(<ReviewContext.Provider value={{ cloudUser: null } as any}><OnboardingAccount onBusyChange={() => {}} /></ReviewContext.Provider>); await pause(); });
    assert.ok(host.querySelector('form input[name=connectionPassphrase]'));
    assert.ok(host.querySelector('form input[type=email]'));
    assert.ok(host.querySelector('form input[name=password]'));
    assert.match(host.textContent!, /解锁并登录/);
    assert.doesNotMatch(host.textContent!, /高级设置中配置/);
  } finally { globalThis.fetch = original; await act(() => root.unmount()); host.remove(); }
});
test('onboarding requires agreement, permits statistics opt-out, then allows skipping sign-in before beta', async () => {
  await switchAccount('onboarding-privacy-test');
  const empty = await loadData();
  await put(
    'setting',
    {
      ...empty.settings,
      assistant: {
        version: 1,
        onboardingVersion: 3,
        onboardingStep: 7,
        dailyMinutes: 20,
        weights: { math: 1 },
      },
    },
    'settings',
  );
  const initial = await loadData(),
    host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const destinations: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({ cloudReady: true, user: null })) as typeof fetch;
  function Harness() {
    const [data, setData] = useState(initial);
    return (
      <ReviewContext.Provider
        value={
          {
            data,
            states: {},
            cloudUser: null,
            refresh: async () => setData(await loadData()),
            notify: () => {},
            navigate: (page: string) => destinations.push(page),
            start: () => {},
            setCloudUser: () => {},
            syncing: false,
            pending: 0,
            aiReady: false,
            subject: 'all',
          } as any
        }
      >
        <OnboardingView />
      </ReviewContext.Provider>
    );
  }
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(text),
    )!;
  try {
    await act(async () => {
      root.render(<Harness />);
      await pause();
    });
    assert.match(host.textContent!, /使用协议与隐私说明/);
    assert.equal(button('下一步').disabled, true);
    const boxes = host.querySelectorAll<HTMLInputElement>(
      'input[type=checkbox]',
    );
    assert.equal(boxes.length, 2);
    assert.equal(boxes[0].checked, true);
    // This is a disposable JSDOM account, not acceptance on behalf of a real user.
    await act(() => {
      boxes[0].click();
      boxes[1].click();
    });
    await act(async () => {
      button('下一步').click();
      await pause();
    });
    const saved = (await loadData()).settings;
    assert.equal(saved.termsAcceptance?.version, AGREEMENT_VERSION);
    assert.equal(saved.productDataCollection?.enabled, false);
    await until(() => !!host.querySelector('form input[type=email]'));
    assert.match(host.textContent!, /连接你的学习账户/);
    assert.ok(host.querySelector('input[type=email]'));
    assert.ok(host.querySelector('input[type=password]'));
    await act(async()=>{await i18n.changeLanguage('ja');});
    assert.match(host.querySelector('h1')!.textContent!, /学習アカウントを接続/);
    await act(async()=>{await i18n.changeLanguage('zh-CN');});
    await act(async () => {
      button('暂时跳过').click();
      await pause();
    });
    await until(() => !!host.querySelector('.onboarding-beta'));
    assert.match(host.textContent!, /一起打磨 Reviewbox 测试版/);
    assert.match(host.textContent!, /我的 → 数据与隐私 → 反馈/);
    await act(async () => {
      button('稍后测试').click();
      await pause();
    });
    assert.ok((await loadData()).settings.assistant?.onboardedAt);
    await until(() => !!destinations.length);
    assert.deepEqual(destinations, ['home']);
  } finally {
    globalThis.fetch = original;
    await act(() => root.unmount());
    host.remove();
  }
});
