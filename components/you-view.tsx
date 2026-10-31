'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Download,
  Upload,
  LogOut,
  Check,
} from 'lucide-react';
import { isStaticSite } from '@/lib/runtime';
import { pagesConfig, unlockPages, lockPages } from '@/lib/pages-vault';
import { checkPagesAI } from '@/lib/pages-ai-check';
import {
  put,
  signIn,
  signOut,
  switchAccount,
  uploadLocalToAccount,
  exportBackup,
  restoreBackup,
  currentNamespace,
  loadData,
} from '@/lib/store';
import { download } from '@/lib/importer';
import { saveDailyTime } from '@/lib/exam-outcome-client';
import { SUBJECTS } from '@/lib/model';
import { buildQueue } from '@/lib/engine';
import { Switch } from './ui/switch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import ClearDataCard from './clear-data-card';
import AlphaPreviewCard from './alpha-preview-card';
import WatchDeviceManager from './watch-device-manager';
import { GameProfile } from './learning-game';
const titles: Record<string, string> = {
  account: '账户管理',
  preferences: '学习偏好',
  appearance: '外观设置',
  devices: '我的设备',
  data: '数据与隐私',
  danger: '危险操作',
  advanced: '高级设置与实验功能',
  partner: '企鹅空间',
};
function Entry({
  title,
  note,
  onClick,
  quiet = false,
}: {
  title: string;
  note?: string;
  onClick: () => void;
  quiet?: boolean;
}) {
  return (
    <button
      className={'settings-entry' + (quiet ? ' settings-entry-quiet' : '')}
      onClick={onClick}
    >
      <span>
        <strong>{title}</strong>
        {note && <small>{note}</small>}
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}
export default function YouView() {
  const {
    data,
    refresh,
    cloudUser,
    setCloudUser,
    sync,
    syncing,
    pending,
    notify,
    aiReady,
    navigate,
    start,
    section,
    syncStatus,
  } = useReview();
  const [view, setView] = useState(titles[section ?? ''] ? section! : 'home'),
    [visualTheme, setVisualTheme] = useState<
      'editorial' | 'classic' | 'playful'
    >('playful'),
    [vaultReady, setVaultReady] = useState<boolean | null>(null),
    [checkingAI, setCheckingAI] = useState(false),
    [aiCheck, setAiCheck] = useState(''),
    [accountOpen, setAccountOpen] = useState(false),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [minutes, setMinutes] = useState(String(data.settings.dailyMinutes)),
    [name, setName] = useState(data.settings.name),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [weights, setWeights] = useState<Record<string, number>>(() =>
      Object.fromEntries(
        SUBJECTS.map((s) => [
          s.id,
          data.settings.assistant?.weights?.[s.id] ?? 1,
        ]),
      ),
    ),
    [backup, setBackup] = useState<any>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    homeScroll = useRef(0),
    restoreInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void pagesConfig()
      .then((v) => setVaultReady(!!v))
      .catch(() => setVaultReady(false));
    const saved = localStorage.getItem('review-visual-theme');
    setVisualTheme(
      saved === 'classic' || saved === 'editorial' ? saved : 'playful',
    );
  }, []);
  useEffect(() => {
    setView(titles[section ?? ''] ? section! : 'home');
  }, [section]);
  useEffect(() => {
    setName(data.settings.name);
    setMinutes(String(data.settings.dailyMinutes));
    setWeights(
      Object.fromEntries(
        SUBJECTS.map((s) => [
          s.id,
          data.settings.assistant?.weights?.[s.id] ?? 1,
        ]),
      ),
    );
  }, [data.settings.name, data.settings.dailyMinutes, data.settings.assistant]);
  useEffect(() => {
    setBackup(null);
    setAccountOpen(false);
    setError('');
    setNotice('');
  }, [cloudUser?.id]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (view === 'home')
      requestAnimationFrame(() =>
        window.scrollTo({ top: homeScroll.current, behavior: 'instant' }),
      );
  }, [view]);
  function open(next: string) {
    if (view === 'home') homeScroll.current = window.scrollY;
    setError('');
    setNotice('');
    setView(next);
    navigate('you', 'all', next === 'home' ? '' : next);
  }
  async function task(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : '未能完成，请重试');
    } finally {
      setBusy(false);
    }
  }
  async function setting(patch: any) {
    const ns = currentNamespace(),
      latest = await loadData(ns);
    if (ns !== currentNamespace()) throw new Error('账户已切换，请重新保存');
    await put(
      'setting',
      { ...latest.settings, ...patch },
      'settings',
      false,
      ns,
    );
    if (ns !== currentNamespace()) return;
    await refresh();
  }
  function chooseTheme(theme: 'editorial' | 'classic' | 'playful') {
    try {
      localStorage.setItem('review-visual-theme', theme);
      document.documentElement.dataset.reviewTheme = theme;
      setVisualTheme(theme);
      setNotice('外观已保存');
    } catch {
      setError('无法保存外观，请检查浏览器存储权限');
    }
  }
  const ownSync =
    syncStatus?.account === cloudUser?.id ? syncStatus : undefined;
  const status = !cloudUser
    ? '记录保存在本机'
    : syncing
      ? '正在同步'
      : ownSync?.error
        ? '同步未完成'
        : pending
          ? pending + ' 条记录待同步'
          : ownSync?.lastSyncAt
            ? '已同步'
            : '同步状态待检查';
  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await unlockPages(
        String(new FormData(e.currentTarget).get('passphrase')),
      );
      if (!isStaticSite()) localStorage.setItem('review-private-cloud', '1');
      location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法解锁站点配置');
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const result = await signIn(
        String(f.get('email')),
        String(f.get('password')),
        register,
      );
      if (result.confirmationRequired) {
        notify(result.message);
        setRegister(false);
        return;
      }
      await uploadLocalToAccount(result.user.id);
      await switchAccount(result.user.id);
      setCloudUser(result.user);
      await refresh();
      setAccountOpen(false);
      notify('已登录，将本地学习记录加入你的云端账户');
      await sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录未完成');
      notify(e instanceof Error ? e.message : '登录未完成');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-page settings-scope">
      <header className="profile-heading">
        {view !== 'home' && (
          <button
            className="settings-back"
            onClick={() => open(view === 'danger' ? 'data' : 'home')}
          >
            <ArrowLeft size={17} />
            返回{view === 'danger' ? '数据与隐私' : '我的'}
          </button>
        )}
        <h1 tabIndex={-1} ref={heading}>
          {view === 'home' ? '我的' : titles[view]}
        </h1>
      </header>
      {notice && (
        <p className="settings-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
      {view === 'home' && (
        <>
          <button
            className="profile-identity"
            onClick={() => open('account')}
            aria-label="进入账户管理"
          >
            <span className="profile-monogram">
              {Array.from(data.settings.name || '我')[0]}
            </span>
            <span className="profile-identity-text">
              <strong>{data.settings.name || '我的学习空间'}</strong>
              <span>{cloudUser?.email ?? '本地学习空间'}</span>
              <small className={ownSync?.error ? 'sync-attention' : ''}>
                {status}
              </small>
            </span>
            <ChevronRight size={20} />
          </button>
          <section className="settings-group">
            <h2>学习与个性化</h2>
            <Entry
              title="学习偏好"
              note={
                data.settings.dailyMinutes + ' 分钟 / 天 · 学科重点与学习安排'
              }
              onClick={() => open('preferences')}
            />
            <Entry
              title="外观设置"
              note={
                { playful: '冒险', editorial: '暖纸', classic: '经典' }[
                  visualTheme
                ]
              }
              onClick={() => open('appearance')}
            />
          </section>
          <section className="settings-group">
            <h2>设备与数据</h2>
            <Entry
              title="我的设备"
              note="手表配对、授权与同步"
              onClick={() => open('devices')}
            />
            <Entry
              title="数据与隐私"
              note={status}
              onClick={() => open('data')}
            />
          </section>
          <div className="profile-footer-links">
            <Entry
              title="企鹅空间"
              note="形象、成就与成长记录"
              onClick={() => open('partner')}
              quiet
            />
            <Entry
              title="高级设置与实验功能"
              onClick={() => open('advanced')}
              quiet
            />
          </div>
        </>
      )}
      {view === 'account' && (
        <div className="settings-detail">
          <div className="settings-account-summary">
            <span className="profile-monogram">
              {Array.from(data.settings.name || '我')[0]}
            </span>
            <div>
              <h2>{data.settings.name}</h2>
              <p>{cloudUser?.email ?? '尚未登录 · 本地学习空间'}</p>
            </div>
          </div>
          <label className="settings-field">
            学习空间名称
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== data.settings.name)
                  void task(() => setting({ name: name.trim() }), '名称已保存');
              }}
            />
          </label>
          {cloudUser ? (
            <>
              <p className="settings-caption">本机保留此账户的离线学习记录。</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setRegister(false);
                  setAccountOpen(true);
                }}
              >
                切换账户
              </button>
              <button
                className="text-button settings-signout"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await signOut();
                    setCloudUser(null);
                    await refresh();
                  }, '已退出账户，原账户数据仍保留在对应学习空间。')
                }
              >
                <LogOut size={16} />
                退出登录
              </button>
            </>
          ) : (
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  setRegister(false);
                  setAccountOpen(true);
                }}
              >
                登录账户
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setRegister(true);
                  setAccountOpen(true);
                }}
              >
                注册账户
              </button>
            </div>
          )}
        </div>
      )}
      {view === 'preferences' && (
        <div className="settings-detail">
          <label className="settings-field">
            每日目标时间
            <select
              aria-label="每日目标时间"
              value={minutes}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                setMinutes(v);
                void task(async () => {
                  try {
                    await saveDailyTime(Number(v));
                    await refresh();
                  } catch (e) {
                    setMinutes(String(data.settings.dailyMinutes));
                    throw e;
                  }
                }, '每日学习时间已保存');
              }}
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                <option value={v} key={v}>
                  {v} 分钟
                </option>
              ))}
            </select>
          </label>
          <section className="settings-group">
            <h2>学科重点</h2>
            <p className="settings-caption">
              比重越高，计划越重视这门学科。0 表示暂不安排。
            </p>
            {SUBJECTS.map((s) => (
              <label className="weight-row" key={s.id}>
                <span>{s.name}</span>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  aria-label={s.name + '学习比重'}
                  value={weights[s.id]}
                  onChange={(e) =>
                    setWeights({ ...weights, [s.id]: Number(e.target.value) })
                  }
                />
                <output>{weights[s.id]}</output>
              </label>
            ))}
            <button
              className="secondary"
              disabled={busy || !Object.values(weights).some((v) => v > 0)}
              onClick={() =>
                void task(async () => {
                  const ns = currentNamespace(),
                    latest = await loadData(ns);
                  if (ns !== currentNamespace()) throw new Error('账户已切换');
                  await setting({
                    assistant: {
                      ...latest.settings.assistant,
                      version: 1,
                      weights,
                      dailyMinutes: latest.settings.dailyMinutes,
                    },
                  });
                }, '学科比重已保存')
              }
            >
              保存学科比重
            </button>
          </section>
          <div className="settings-toggle">
            <span>
              <strong>已掌握知识随机抽查</strong>
              <small>少量回顾，确认长期保持。</small>
            </span>
            <Switch
              aria-label="随机抽查"
              disabled={busy}
              checked={data.settings.surprise}
              onCheckedChange={(v) =>
                void task(() => setting({ surprise: v }), '抽查偏好已保存')
              }
            />
          </div>
          <div className="settings-toggle">
            <span>
              <strong>智能计划检查</strong>
              <small>只在考前、成绩更新等关键时刻复核。</small>
            </span>
            <Switch
              aria-label="智能计划检查"
              disabled={busy}
              checked={data.settings.assistantAi !== false}
              onCheckedChange={(v) =>
                void task(
                  () => setting({ assistantAi: v }),
                  '计划检查偏好已保存',
                )
              }
            />
          </div>
          <Entry
            title="重新进行能力诊断"
            note="保留已有学习记录"
            onClick={() => {
              const items = buildQueue(data, {
                practice: true,
                test: true,
                limit: 12,
              });
              if (items.length) {
                startDiagnostic(items);
              } else setError('还没有可用题目，请先在资料库导入并核验。');
            }}
          />
          <Entry title="查看学习计划" onClick={() => navigate('plan')} />
        </div>
      )}
      {view === 'appearance' && (
        <div className="settings-detail">
          <h2>界面主题</h2>
          <div
            className="profile-theme-options"
            role="group"
            aria-label="界面风格"
          >
            {[
              ['playful', '冒险', '清爽明亮'],
              ['editorial', '暖纸', '柔和阅读'],
              ['classic', '经典', '简洁专注'],
            ].map(([id, label, note]) => (
              <button
                key={id}
                aria-pressed={visualTheme === id}
                onClick={() => chooseTheme(id as any)}
              >
                <span className={'theme-sample theme-' + id} />
                <strong>{label}</strong>
                <small>{note}</small>
                {visualTheme === id && <Check size={16} />}
              </button>
            ))}
          </div>
          <p className="settings-caption">
            立即生效，刷新后保留。学习中的沉浸模式仍可单独切换。
          </p>
          <p className="settings-caption">
            阅读与显示：练习页可切换沉浸模式、打开草稿纸。
          </p>
        </div>
      )}
      {view === 'devices' &&
        (cloudUser ? (
          <WatchDeviceManager key={cloudUser.id} />
        ) : (
          <div className="settings-empty">
            <h2>连接你的手表</h2>
            <p>登录学习账户后，可配对设备并同步学习记录。</p>
            <button className="primary" onClick={() => open('account')}>
              前往账户管理
            </button>
          </div>
        ))}
      {view === 'data' && (
        <div className="settings-detail">
          <div className="settings-sync-line">
            <span>
              <strong>数据库同步</strong>
              <small>{status}</small>
            </span>
            <button
              className="secondary"
              disabled={syncing || !cloudUser}
              onClick={() =>
                void task(async () => {
                  const ok = await sync();
                  if (ok === false)
                    throw new Error('同步未完成，请检查连接后重试。');
                }, '同步检查完成')
              }
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              {syncing ? '同步中…' : '立即同步'}
            </button>
          </div>
          {ownSync?.error && (
            <p role="alert" className="settings-error">
              {ownSync.error}
            </p>
          )}
          {ownSync?.lastSyncAt && (
            <p className="settings-caption">
              最近成功同步：{new Date(ownSync.lastSyncAt).toLocaleString()}
            </p>
          )}
          <div className="settings-list">
            <Entry
              title="导出完整备份"
              note="保存题目、笔记、计划和作答记录"
              onClick={() =>
                void task(
                  async () =>
                    download('review-backup.json', await exportBackup()),
                  '备份已导出',
                )
              }
            />
            <Entry
              title="恢复备份"
              note="先检查文件，再合并记录"
              onClick={() => restoreInput.current?.click()}
            />
            <Entry
              title="本地数据管理"
              note={
                data.questions.length +
                ' 题 · ' +
                data.events.length +
                ' 条作答记录'
              }
              onClick={() => navigate('library')}
            />
          </div>
          <input
            hidden
            type="file"
            accept=".json"
            ref={restoreInput}
            onChange={(e) => {
              const f = e.target.files?.[0],
                ns = currentNamespace();
              e.target.value = '';
              if (f)
                void task(async () => {
                  if (f.size > 30 * 1024 * 1024)
                    throw new Error('备份文件超过 30 MB');
                  const value = JSON.parse(await f.text());
                  if (ns !== currentNamespace()) throw new Error('账户已切换');
                  if (
                    value?.schemaVersion !== 1 ||
                    !Array.isArray(value.records)
                  )
                    throw new Error('请选择 Reviewbox 学习备份');
                  setBackup({ value, namespace: ns });
                }, '已读取备份，请确认合并');
            }}
          />
          {backup && (
            <div className="settings-restore">
              <h3>合并 {backup.value.records.length} 条备份记录？</h3>
              <p>保留现有记录，不重复计算已存在的作答。</p>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await restoreBackup(backup.value, backup.namespace);
                      setBackup(null);
                      await refresh();
                    }, '备份已恢复')
                  }
                >
                  确认恢复
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setBackup(null)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
          <p className="settings-caption">
            个人内容先保存在本设备。登录后仅同步到自己的账户；公开分享需要单独确认。
          </p>
          <Entry
            title="危险操作"
            note="清理学习数据"
            onClick={() => open('danger')}
            quiet
          />
        </div>
      )}
      {view === 'danger' && <ClearDataCard />}
      {view === 'advanced' && (
        <div className="settings-detail advanced-settings">
          {' '}
          <section className="panel private-config-panel">
            <h2>连接配置</h2>
            {vaultReady ? (
              <>
                <p>当前设备的私有配置已解锁，AI 与账户可使用同一份配置连接。</p>
                <button
                  className="secondary"
                  disabled={checkingAI}
                  onClick={async () => {
                    setCheckingAI(true);
                    setAiCheck('');
                    try {
                      const count = await checkPagesAI();
                      setAiCheck(
                        '连接正常：' +
                          count +
                          ' 个凭据可访问所选模型。此次检查不生成内容。',
                      );
                    } catch (error) {
                      setAiCheck(
                        error instanceof Error
                          ? error.message
                          : '网络连接未完成，请重试。',
                      );
                    } finally {
                      setCheckingAI(false);
                    }
                  }}
                >
                  {checkingAI ? '正在检查连接' : '检查智能服务'}
                </button>
                {aiCheck && (
                  <p role="status">
                    {aiCheck}{' '}
                    <button
                      className="text-button"
                      onClick={() => setAiCheck('')}
                    >
                      关闭
                    </button>
                  </p>
                )}
                <button
                  className="secondary"
                  onClick={async () => {
                    await lockPages();
                    localStorage.removeItem('review-private-cloud');
                    location.reload();
                  }}
                >
                  锁定当前设备
                </button>
              </>
            ) : (
              <>
                <p>
                  输入网站配置口令，解锁 GitHub Pages 的私有云连接。口令不是
                  Supabase token，也不是账户密码。
                </p>
                <form onSubmit={unlock} className="pages-unlock-form">
                  <input
                    type="password"
                    name="passphrase"
                    aria-label="网站配置口令"
                    minLength={12}
                    autoComplete="off"
                    placeholder="网站配置口令"
                    required
                  />
                  <button className="primary" disabled={busy}>
                    解锁连接配置
                  </button>
                </form>
              </>
            )}
            {vaultReady && (
              <details className="config-reunlock">
                <summary>重新输入网站配置口令</summary>
                <form onSubmit={unlock} className="pages-unlock-form">
                  <input
                    type="password"
                    name="passphrase"
                    aria-label="网站配置口令"
                    minLength={12}
                    autoComplete="off"
                    placeholder="网站配置口令"
                    required
                  />
                  <button className="primary" disabled={busy}>
                    重新解锁
                  </button>
                </form>
              </details>
            )}
          </section>
          <section className="settings-group">
            <h2>实验功能</h2>
            <AlphaPreviewCard />
          </section>
          <section className="settings-group">
            <h2>学习服务状态</h2>
            <div className="settings-line">
              <span>本地学习与离线复习</span>
              <small>可用</small>
            </div>
            <div className="settings-line">
              <span>智能学习服务</span>
              <small>{aiReady ? '配置可用，需检查连接' : '尚未连接'}</small>
            </div>
            <p className="settings-caption">
              连接检查不会生成题目；技术诊断只在这里显示。
            </p>
          </section>
        </div>
      )}
      {view === 'partner' && <GameProfile />}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="account-dialog profile-account-dialog settings-scope">
          <DialogTitle>
            {register ? '创建学习账户' : '登录学习账户'}
          </DialogTitle>
          <DialogDescription>
            登录账户以备份学习记录并同步至其他设备。
          </DialogDescription>
          <form onSubmit={login}>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <label>
              邮箱
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              密码
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? '正在连接…' : register ? '注册账户' : '登录'}
            </button>
          </form>
          <button className="quiet" onClick={() => setRegister(!register)}>
            {register ? '已有账户，去登录' : '还没有账户，创建一个'}
          </button>
          <p className="inline-hint">
            注册可能需要邮件确认。密码与会话通过加密连接发送。
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
  function startDiagnostic(items: any) {
    return start(items, 'test', '能力诊断');
  }
}
