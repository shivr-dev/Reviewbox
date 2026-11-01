'use client';
import {tr} from '@/lib/i18n';
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
import {LanguageSelect} from './product-locale';
import i18n from '@/lib/i18n';
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
import WatchDeviceManager from './watch-device-manager';
import { GameProfile } from './learning-game';
import ProductDataSettings from './product-data-settings';
import BugFeedback from './bug-feedback';
import AgreementSettings from './usage-agreement';
const titles: Record<string, string> = {
  account: '账户管理',
  preferences: '学习偏好',
  appearance: '外观设置',
  devices: '我的设备',
  data: '数据与隐私',
  feedback: '反馈',
  agreement: '使用协议与隐私说明',
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
        <strong>{tr('settings:'+title)}</strong>
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
      setNotice(tr("settings:外观已保存"));
    } catch {
      setError(tr("settings:无法保存外观，请检查浏览器存储权限"));
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
      notify(tr("settings:已登录，将本地学习记录加入你的云端账户"));
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
            onClick={() => open(['danger', 'feedback', 'agreement'].includes(view) ? 'data' : 'home')}
          >
            <ArrowLeft size={17} />{tr("settings:返回")}{['danger', 'feedback', 'agreement'].includes(view) ? tr("settings:数据与隐私") : tr("settings:我的")}
          </button>
        )}
        <h1 tabIndex={-1} ref={heading}>
          {tr('settings:'+(view === 'home' ? '我的' : titles[view]))}
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
            aria-label={tr("settings:进入账户管理")}
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
            <h2>{tr("settings:学习与个性化")}</h2>
            <Entry
              title={tr("settings:学习偏好")}
              note={
                data.settings.dailyMinutes + ' 分钟 / 天 · 学科重点与学习安排'
              }
              onClick={() => open('preferences')}
            />
            <Entry
              title={tr("settings:外观设置")}
              note={
                { playful: '冒险', editorial: '暖纸', classic: '经典' }[
                  visualTheme
                ]
              }
              onClick={() => open('appearance')}
            />
          </section>
          <section className="settings-group">
            <h2>{tr("settings:设备与数据")}</h2>
            <Entry
              title={tr("settings:我的设备")}
              note={tr("settings:手表配对、授权与同步")}
              onClick={() => open('devices')}
            />
            <Entry
              title={tr("settings:数据与隐私")}
              note={status}
              onClick={() => open('data')}
            />
          </section>
          <div className="profile-footer-links">
            <Entry
              title={tr("settings:企鹅空间")}
              note={tr("settings:形象、成就与成长记录")}
              onClick={() => open('partner')}
              quiet
            />
            <Entry
              title={tr("settings:高级设置与实验功能")}
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
          <label className="settings-field">{tr("settings:学习空间名称")}<input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== data.settings.name)
                  void task(() => setting({ name: name.trim() }), tr("common:名称已保存"));
              }}
            />
          </label>
          {cloudUser ? (
            <>
              <p className="settings-caption">{tr("settings:本机保留此账户的离线学习记录。")}</p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setRegister(false);
                  setAccountOpen(true);
                }}
              >{tr("settings:切换账户")}</button>
              <button
                className="text-button settings-signout"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await signOut();
                    setCloudUser(null);
                    await refresh();
                  }, tr("common:已退出账户，原账户数据仍保留在对应学习空间。"))
                }
              >
                <LogOut size={16} />{tr("settings:退出登录")}</button>
            </>
          ) : (
            <div className="button-row">
              <button
                className="primary"
                onClick={() => {
                  setRegister(false);
                  setAccountOpen(true);
                }}
              >{tr("settings:登录账户")}</button>
              <button
                className="secondary"
                onClick={() => {
                  setRegister(true);
                  setAccountOpen(true);
                }}
              >{tr("settings:注册账户")}</button>
            </div>
          )}
        </div>
      )}
      {view === 'preferences' && (
        <div className="settings-detail">
          <label className="settings-field">{tr("settings:每日目标时间")}<select
              aria-label={tr("settings:每日目标时间")}
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
                }, tr("common:每日学习时间已保存"));
              }}
            >
              {[10, 15, 20, 30, 45, 60, 90, 120].map((v) => (
                <option value={v} key={v}>
                  {v}{tr("settings:分钟")}</option>
              ))}
            </select>
          </label>
          <section className="settings-group">
            <h2>{tr("settings:学科重点")}</h2>
            <p className="settings-caption">{tr("settings:比重越高，计划越重视这门学科。0 表示暂不安排。")}</p>
            {SUBJECTS.map((s) => (
              <label className="weight-row" key={s.id}>
                <span>{tr('subjects:'+s.name)}</span>
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
                }, tr("common:学科比重已保存"))
              }
            >{tr("settings:保存学科比重")}</button>
          </section>
          <div className="settings-toggle">
            <span>
              <strong>{tr("settings:已掌握知识随机抽查")}</strong>
              <small>{tr("settings:少量回顾，确认长期保持。")}</small>
            </span>
            <Switch
              aria-label={tr("settings:随机抽查")}
              disabled={busy}
              checked={data.settings.surprise}
              onCheckedChange={(v) =>
                void task(() => setting({ surprise: v }), tr("common:抽查偏好已保存"))
              }
            />
          </div>
          <div className="settings-toggle">
            <span>
              <strong>{tr("settings:智能计划检查")}</strong>
              <small>{tr("settings:只在考前、成绩更新等关键时刻复核。")}</small>
            </span>
            <Switch
              aria-label={tr("settings:智能计划检查")}
              disabled={busy}
              checked={data.settings.assistantAi !== false}
              onCheckedChange={(v) =>
                void task(
                  () => setting({ assistantAi: v }),
                  tr("common:计划检查偏好已保存"),
                )
              }
            />
          </div>
          <Entry
            title={tr("settings:重新进行能力诊断")}
            note={tr("settings:保留已有学习记录")}
            onClick={() => {
              const items = buildQueue(data, {
                practice: true,
                test: true,
                limit: 12,
              });
              if (items.length) {
                startDiagnostic(items);
              } else setError(tr("settings:还没有可用题目，请先在资料库导入并核验。"));
            }}
          />
          <Entry title={tr("settings:查看学习计划")} onClick={() => navigate('plan')} />
        </div>
      )}
      {view === 'appearance' && (
        <div className="settings-detail"><LanguageSelect disabled={busy} save={locale=>task(async()=>{const ns=currentNamespace();await setting({locale});if(ns===currentNamespace()){localStorage.setItem('review-locale:'+ns,locale);await i18n.changeLanguage(locale);document.documentElement.lang=locale;}},tr('common:保存'))}/><h2>{tr("settings:界面主题")}</h2>
          <div
            className="profile-theme-options"
            role="group"
            aria-label={tr("settings:界面风格")}
          >
            {[
              ['playful', tr("settings:冒险"), tr("settings:清爽明亮")],
              ['editorial', tr("settings:暖纸"), tr("settings:柔和阅读")],
              ['classic', tr("settings:经典"), tr("settings:简洁专注")],
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
          <p className="settings-caption">{tr("settings:立即生效，刷新后保留。学习中的沉浸模式仍可单独切换。")}</p>
          <p className="settings-caption">{tr("settings:阅读与显示：练习页可切换沉浸模式、打开草稿纸。")}</p>
        </div>
      )}
      {view === 'devices' &&
        (cloudUser ? (
          <WatchDeviceManager key={cloudUser.id} />
        ) : (
          <div className="settings-empty">
            <h2>{tr("settings:连接你的手表")}</h2>
            <p>{tr("settings:登录学习账户后，可配对设备并同步学习记录。")}</p>
            <button className="primary" onClick={() => open('account')}>{tr("settings:前往账户管理")}</button>
          </div>
        ))}
      {view === 'data' && (
        <div className="settings-detail">
          <ProductDataSettings />
          <div className="settings-list">
            <Entry title="反馈" note={tr('settings:提交 Bug、建议或问题，自动发布到 GitHub Issues')} onClick={() => open('feedback')} />
            <Entry title="使用协议与隐私说明" onClick={() => open('agreement')} />
          </div>
          <div className="settings-sync-line">
            <span>
              <strong>{tr("settings:数据库同步")}</strong>
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
                }, tr("common:同步检查完成"))
              }
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              {syncing ? tr("settings:同步中…") : tr("settings:立即同步")}
            </button>
          </div>
          {ownSync?.error && (
            <p role="alert" className="settings-error">
              {ownSync.error}
            </p>
          )}
          {ownSync?.lastSyncAt && (
            <p className="settings-caption">{tr("settings:最近成功同步：")}{new Date(ownSync.lastSyncAt).toLocaleString()}
            </p>
          )}
          <div className="settings-list">
            <Entry
              title={tr("settings:导出完整备份")}
              note={tr("settings:保存题目、笔记、计划和作答记录")}
              onClick={() =>
                void task(
                  async () =>
                    download('review-backup.json', await exportBackup()),
                  tr("common:备份已导出"),
                )
              }
            />
            <Entry
              title={tr("settings:恢复备份")}
              note={tr("settings:先检查文件，再合并记录")}
              onClick={() => restoreInput.current?.click()}
            />
            <Entry
              title={tr("settings:本地数据管理")}
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
                }, tr("common:已读取备份，请确认合并"));
            }}
          />
          {backup && (
            <div className="settings-restore">
              <h3>{tr("settings:合并")}{backup.value.records.length}{tr("settings:条备份记录？")}</h3>
              <p>{tr("settings:保留现有记录，不重复计算已存在的作答。")}</p>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await restoreBackup(backup.value, backup.namespace);
                      setBackup(null);
                      await refresh();
                    }, tr("common:备份已恢复"))
                  }
                >{tr("settings:确认恢复")}</button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setBackup(null)}
                >{tr("settings:取消")}</button>
              </div>
            </div>
          )}
          <p className="settings-caption">{tr("settings:个人内容先保存在本设备。登录后仅同步到自己的账户；公开分享需要单独确认。")}</p>
          <Entry
            title={tr("settings:危险操作")}
            note={tr("settings:清理学习数据")}
            onClick={() => open('danger')}
            quiet
          />
        </div>
      )}
      {view === 'danger' && <ClearDataCard />}
      {view === 'feedback' && <BugFeedback key={currentNamespace()} />}
      {view === 'agreement' && <AgreementSettings key={currentNamespace()} />}
      {view === 'advanced' && (
        <div className="settings-detail advanced-settings">
          {' '}
          <section className="panel private-config-panel">
            <h2>{tr("settings:连接配置")}</h2>
            {vaultReady ? (
              <>
                <p>{tr("settings:当前设备的私有配置已解锁，AI 与账户可使用同一份配置连接。")}</p>
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
                  {checkingAI ? tr("settings:正在检查连接") : tr("settings:检查智能服务")}
                </button>
                {aiCheck && (
                  <p role="status">
                    {aiCheck}{' '}
                    <button
                      className="text-button"
                      onClick={() => setAiCheck('')}
                    >{tr("settings:关闭")}</button>
                  </p>
                )}
                <button
                  className="secondary"
                  onClick={async () => {
                    await lockPages();
                    localStorage.removeItem('review-private-cloud');
                    location.reload();
                  }}
                >{tr("settings:锁定当前设备")}</button>
              </>
            ) : (
              <>
                <p>{tr("settings:输入网站配置口令，解锁 GitHub Pages 的私有云连接。口令不是 Supabase token，也不是账户密码。")}</p>
                <form onSubmit={unlock} className="pages-unlock-form">
                  <input
                    type="password"
                    name="passphrase"
                    aria-label={tr("settings:网站配置口令")}
                    minLength={12}
                    autoComplete="off"
                    placeholder={tr("settings:网站配置口令")}
                    required
                  />
                  <button className="primary" disabled={busy}>{tr("settings:解锁连接配置")}</button>
                </form>
              </>
            )}
            {vaultReady && (
              <details className="config-reunlock">
                <summary>{tr("settings:重新输入网站配置口令")}</summary>
                <form onSubmit={unlock} className="pages-unlock-form">
                  <input
                    type="password"
                    name="passphrase"
                    aria-label={tr("settings:网站配置口令")}
                    minLength={12}
                    autoComplete="off"
                    placeholder={tr("settings:网站配置口令")}
                    required
                  />
                  <button className="primary" disabled={busy}>{tr("settings:重新解锁")}</button>
                </form>
              </details>
            )}
          </section>
          <section className="settings-group">
            <h2>{tr("settings:学习服务状态")}</h2>
            <div className="settings-line">
              <span>{tr("settings:本地学习与离线复习")}</span>
              <small>{tr("settings:可用")}</small>
            </div>
            <div className="settings-line">
              <span>{tr("settings:智能学习服务")}</span>
              <small>{aiReady ? tr("settings:配置可用，需检查连接") : tr("settings:尚未连接")}</small>
            </div>
            <p className="settings-caption">{tr("settings:连接检查不会生成题目；技术诊断只在这里显示。")}</p>
          </section>
        </div>
      )}
      {view === 'partner' && <GameProfile />}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="account-dialog profile-account-dialog settings-scope">
          <DialogTitle>
            {register ? tr("settings:创建学习账户") : tr("settings:登录学习账户")}
          </DialogTitle>
          <DialogDescription>{tr("settings:登录账户以备份学习记录并同步至其他设备。")}</DialogDescription>
          <form onSubmit={login}>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
            <label>{tr("settings:邮箱")}<input name="email" type="email" autoComplete="email" required />
            </label>
            <label>{tr("settings:密码")}<input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy ? tr("settings:正在连接…") : register ? tr("common:注册账户") : tr("common:登录")}
            </button>
          </form>
          <button className="quiet" onClick={() => setRegister(!register)}>
            {register ? tr("settings:已有账户，去登录") : tr("settings:还没有账户，创建一个")}
          </button>
          <p className="inline-hint">{tr("settings:注册可能需要邮件确认。密码与会话通过加密连接发送。")}</p>
        </DialogContent>
      </Dialog>
    </section>
  );
  function startDiagnostic(items: any) {
    return start(items, 'test', '能力诊断');
  }
}
