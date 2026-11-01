'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { apiFetch, isStaticSite } from '@/lib/runtime';
import { unlockPages } from '@/lib/pages-vault';
import {
  currentNamespace,
  signIn,
  switchAccount,
  syncCloud,
  uploadLocalToAccount,
  loadData,
  put,
} from '@/lib/store';
import { tr } from '@/lib/i18n';
import { trackProductEvent } from '@/lib/product-insights';
export default function OnboardingAccount({
  onBusyChange,
}: {
  onBusyChange: (busy: boolean) => void;
}) {
  const { cloudUser, setCloudUser, refresh, notify } = useReview();
  const [register, setRegister] = useState(false),
    [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    let checking = true;
    void apiFetch('/api/account')
      .then((r) => r.json())
      .then((v: any) => {
        if (checking) setReady(v.cloudReady !== false);
      })
      .catch(() => {
        if (checking) setReady(false);
      });
    return () => {
      checking = false;
    };
  }, []);
  useEffect(
    () => () => {
      active.current = false;
      onBusyChange(false);
    },
    [onBusyChange],
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setMessage('');
    const form = e.currentTarget,
      fields = new FormData(form),
      original = currentNamespace();
    try {
      const localSettings = (await loadData(original)).settings;
      if (!ready) {
        await unlockPages(String(fields.get('connectionPassphrase') ?? ''));
        if (!active.current || original !== currentNamespace()) return;
        if (!isStaticSite()) localStorage.setItem('review-private-cloud', '1');
        setReady(true);
      }
      const result = await signIn(
        String(fields.get('email')),
        String(fields.get('password')),
        register,
      );
      if (!active.current) return;
      form.reset(); // Never retain or persist the submitted password.
      if (original !== currentNamespace())
        throw new Error(tr('settings:账户已切换，请重新打开引导。'));
      if (result.confirmationRequired) {
        trackProductEvent('registration_confirmation', 'profile');
        setMessage(tr('settings:' + result.message));
        setRegister(false);
        return;
      }
      await switchAccount(result.user.id);
      // Fetch existing account settings before merging a local starter profile.
      await syncCloud();
      if (currentNamespace() !== result.user.id) return;
      await uploadLocalToAccount(result.user.id);
      const fresh = await loadData(result.user.id);
      if (currentNamespace() !== result.user.id) return;
      const profile = fresh.settings.assistant ?? localSettings.assistant;
      await put(
        'setting',
        {
          ...fresh.settings,
          termsAcceptance: localSettings.termsAcceptance,
          productDataCollection: {
            enabled:
              localSettings.productDataCollection?.enabled !== false &&
              fresh.settings.productDataCollection?.enabled !== false,
            updatedAt: new Date().toISOString(),
          },
          assistant: {
            ...profile,
            version: 1,
            onboardingVersion: 3,
            onboardingStep: 9,
            weights: profile?.weights ?? {},
            dailyMinutes: profile?.dailyMinutes ?? fresh.settings.dailyMinutes,
          },
        },
        'settings',
        false,
        result.user.id,
      );
      setCloudUser(result.user);
      await refresh();
      trackProductEvent('login_complete', 'profile');
      notify(tr('settings:已连接账户，可以跨设备继续学习。'));
      await syncCloud();
    } catch (e) {
      if (currentNamespace() !== original) {
        const account = (await apiFetch('/api/account')
          .then((r) => r.json())
          .catch(() => null)) as any;
        if (account?.user?.id === currentNamespace()) {
          setCloudUser(account.user);
          await refresh();
        }
      }
      setError(
        e instanceof Error
          ? tr('settings:' + e.message)
          : tr('settings:连接未完成，请稍后重试。'),
      );
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  }
  if (cloudUser)
    return (
      <div className="onboarding-account">
        <strong>{tr('settings:已登录')}</strong>
        <p>{cloudUser.email}</p>
        <p className="settings-caption">
          {tr('settings:账户已经连接，继续下一步即可。')}
        </p>
      </div>
    );
  return (
    <div className="onboarding-account">
      <p className="settings-caption">
        {tr('settings:登录后跨设备同步。也可以跳过，先在本设备学习。')}
      </p>
      {ready === null ? (
        <p role="status">{tr('settings:正在检查账户服务…')}</p>
      ) : (
        <>
          <form onSubmit={submit}>
            {!ready && <label>{tr('settings:连接口令')}<input type="password" name="connectionPassphrase" autoComplete="off" minLength={12} maxLength={256} required disabled={busy} />
              <small className="settings-caption">{tr('settings:首次连接本设备时输入，和账号密码不同。')}</small>
            </label>}
            <label>
              {tr('settings:邮箱')}
              <input
                type="email"
                name="email"
                autoComplete="email"
                maxLength={254}
                required
                disabled={busy}
              />
            </label>
            <label>
              {tr('settings:密码')}
              <input
                type="password"
                name="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={128}
                required
                disabled={busy}
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              {busy
                ? tr('settings:正在连接…')
                : !ready
                  ? register ? tr('settings:解锁并注册') : tr('settings:解锁并登录')
                : register
                  ? tr('common:注册账户')
                  : tr('common:登录')}
            </button>
          </form>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRegister(!register)}
          >
            {register
              ? tr('settings:已有账户，去登录')
              : tr('settings:还没有账户，创建一个')}
          </button>
          <p className="settings-caption">
            {tr('settings:注册可能需要邮件确认。密码与会话通过加密连接发送。')}
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
    </div>
  );
}
