'use client';
import { isStaticSite } from '@/lib/runtime';
import { pagesConfig, unlockPages, lockPages } from '@/lib/pages-vault';
import ClearDataCard from './clear-data-card';
import ImportSkillCard from './import-skill-card';
import { useEffect, useState } from 'react';
import {
  Plus,
  Cloud,
  RefreshCw,
  Check,
  CalendarDays,
  LogOut,
  Download,
  ArrowRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useReview } from './review-context';
import { uid, type Subject, subjectName } from '@/lib/model';
import {
  put,
  signIn,
  signOut,
  switchAccount,
  uploadLocalToAccount,
  exportBackup,
} from '@/lib/store';
import { download } from '@/lib/importer';
import { Heading, SubjectChoice, Choice, Empty, dateLabel } from './shared';
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
  } = useReview();
  const [examOpen, setExamOpen] = useState(false),
    [visualTheme, setVisualTheme] = useState<'editorial' | 'classic'>('editorial'),
    [vaultReady, setVaultReady] = useState<boolean | null>(null),
    [subject, setSubject] = useState<Subject>('math'),
    [scope, setScope] = useState<string[]>([]),
    [accountOpen, setAccountOpen] = useState(false),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [minutes, setMinutes] = useState(String(data.settings.dailyMinutes));
  const nodes = data.nodes.filter((n) => n.subject === subject);
  useEffect(() => {
    if (isStaticSite()) void pagesConfig().then((value) => setVaultReady(!!value));
    setVisualTheme(localStorage.getItem('review-visual-theme') === 'classic' ? 'classic' : 'editorial');
  }, []);
  const chooseTheme = (theme:'editorial'|'classic') => {
    setVisualTheme(theme);
    localStorage.setItem('review-visual-theme',theme);
    document.documentElement.dataset.reviewTheme=theme;
  };
  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await unlockPages(String(new FormData(e.currentTarget).get('passphrase')));
      location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法解锁站点配置');
    } finally { setBusy(false); }
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
      notify(e instanceof Error ? e.message : '登录未完成');
    } finally {
      setBusy(false);
    }
  }
  async function saveExam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const date = String(f.get('date'));
      if (Date.parse(date + 'T23:59:59') < Date.now())
        throw new Error('考试日期不能早于今天');
      await put('exam', {
        id: uid(),
        title: String(f.get('title')),
        subject,
        date,
        scope,
        target: Number(f.get('target')),
        dailyMinutes: Number(f.get('minutes')),
      });
      await refresh();
      setExamOpen(false);
      notify('考试已添加，今日复习优先级已调整');
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="YOUR PERSONAL SPACE"
        title="学习，按自己的节奏。"
        description="管理考试计划、每日学习目标与个人数据。"
      />
      {isStaticSite() && (
        <section className="panel">
          <h2>私有学习配置</h2>
          {vaultReady ? <>
            <p>当前设备已解锁。登录后可将学习记录同步到你的私有账户。</p>
            <button className="secondary" onClick={async () => { await lockPages(); location.reload(); }}>锁定当前设备</button>
          </> : <>
            <p>首次在此设备使用时，输入网站配置口令。口令不会上传至 GitHub。</p>
            <form onSubmit={unlock} className="pages-unlock-form">
              <input type="password" name="passphrase" minLength={12} autoComplete="off" placeholder="网站配置口令" required />
              <button className="primary" disabled={busy}>解锁云端配置</button>
            </form>
          </>}
        </section>
      )}
      <section className="panel appearance-card">
        <div><h2>界面风格</h2><p className="muted">选择适合自己的阅读环境。复习时还可单独切换沉浸模式。</p></div>
        <div className="appearance-options" role="group" aria-label="界面风格">
          <button aria-pressed={visualTheme==='editorial'} className={visualTheme==='editorial'?'selected':''} onClick={()=>chooseTheme('editorial')}>暖纸</button>
          <button aria-pressed={visualTheme==='classic'} className={visualTheme==='classic'?'selected':''} onClick={()=>chooseTheme('classic')}>经典</button>
        </div>
      </section>
      <section className="panel account-card">
        <div className="account-avatar">
          {(data.settings.name || 'K').slice(0, 1)}
        </div>
        <div className="grow">
          <h2>{data.settings.name}</h2>
          <p className="muted">
            {cloudUser?.email ?? '本地学习空间 · 无需登录即可复习'}
          </p>
        </div>
        {cloudUser ? (
          <button
            className="secondary"
            onClick={async () => {
              await signOut();
              setCloudUser(null);
              await refresh();
              notify('已退出云端账户，数据保留在对应的本地空间');
            }}
          >
            <LogOut size={16} />
            退出
          </button>
        ) : (
          <button className="primary" onClick={() => setAccountOpen(true)}>
            登录并同步
            <ArrowRight size={16} />
          </button>
        )}
      </section>
      <div className="home-columns">
        <section className="panel">
          <div className="section-head">
            <h2>每日学习设置</h2>
            <CalendarDays size={18} />
          </div>
          <label>
            学习空间名称
            <input
              defaultValue={data.settings.name}
              maxLength={60}
              onBlur={async (e) => {
                if (e.target.value.trim()) {
                  await put(
                    'setting',
                    { ...data.settings, name: e.target.value.trim() },
                    'settings',
                  );
                  await refresh();
                }
              }}
            />
          </label>
          <label>
            每日目标时间
            <Choice
              label="每日目标时间"
              value={minutes}
              onChange={async (v) => {
                setMinutes(v);
                await put(
                  'setting',
                  { ...data.settings, dailyMinutes: Number(v) },
                  'settings',
                );
                await refresh();
                notify('每日复习安排已更新');
              }}
              options={['10', '15', '20', '30', '45', '60'].map((v) => ({
                value: v,
                label: v + ' 分钟',
              }))}
            />
          </label>
          <div className="setting-switch">
            <div>
              <b>已掌握知识随机抽查</b>
              <p className="muted">少量抽查，帮助发现假掌握。</p>
            </div>
            <Switch
              checked={data.settings.surprise}
              onCheckedChange={async (value) => {
                await put(
                  'setting',
                  { ...data.settings, surprise: value },
                  'settings',
                );
                await refresh();
              }}
              aria-label="随机抽查"
            />
          </div>
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>云同步与备份</h2>
            <Cloud size={20} />
          </div>
          <div className="sync-status">
            <span className="status-dot" />
            <div>
              <h3>
                {cloudUser
                  ? pending
                    ? `${pending} 条记录等待同步`
                    : '学习记录已同步'
                  : '记录已保存在本设备'}
              </h3>
              <p className="muted">
                {cloudUser
                  ? '先保存到本地，再同步到你的 Supabase 账户。'
                  : '登录后，可在其他设备继续学习。'}
              </p>
            </div>
          </div>
          <button
            className="secondary"
            disabled={syncing || !cloudUser}
            onClick={sync}
          >
            <RefreshCw size={15} className={syncing ? 'spin' : ''} />
            {syncing ? '正在同步…' : '立即同步'}
          </button>
          <button
            className="quiet"
            onClick={async () =>
              download('review-backup.json', await exportBackup())
            }
          >
            <Download size={15} />
            导出备份
          </button>
          <p className="inline-hint">断网时继续学习。网络恢复后会自动重试。</p>
        </section>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>考试与学习计划</h2>
          <button className="secondary" onClick={() => setExamOpen(true)}>
            <Plus size={16} />
            添加考试
          </button>
        </div>
        {data.exams.length ? (
          data.exams
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((e) => (
              <div className="exam-full" key={e.id}>
                <span className="exam-calendar">
                  <b>{new Date(e.date).getDate()}</b>
                  <small>{new Date(e.date).getMonth() + 1}月</small>
                </span>
                <div className="grow">
                  <h3>{e.title}</h3>
                  <p className="muted">
                    {subjectName(e.subject)} ·{' '}
                    {e.scope.length ? `${e.scope.length} 个知识点` : '全部知识'}{' '}
                    · 目标 {e.target}%
                  </p>
                  <p className="muted">
                    {e.date} · 建议每日 {e.dailyMinutes} 分钟
                  </p>
                </div>
                <button
                  className="quiet"
                  onClick={async () => {
                    await put('exam', e, e.id, true);
                    await refresh();
                    notify('考试已移出计划');
                  }}
                >
                  移出计划
                </button>
              </div>
            ))
        ) : (
          <Empty title="下一场考试，提前从容准备">
            指定日期、知识范围与目标，复习优先级会随表现变化。
          </Empty>
        )}
      </section>
      <section className="panel">
        <h2>学习服务</h2>
        <div className="service-row">
          <span>本地学习与离线复习</span>
          <span className="outcome correct">
            <Check size={14} />
            可用
          </span>
        </div>
        <div className="service-row">
          <span>动态题目与评分标准批改</span>
          <span className={aiReady ? 'outcome correct' : 'muted'}>
            {aiReady
              ? '已连接'
              : isStaticSite()
                ? '请先解锁配置并登录'
                : '等待 Cloudflare 账户配置'}
          </span>
        </div>
        <p className="inline-hint">
          掌握度是用于安排复习的估计值，会随着间隔回忆和真实作答逐步调整。
        </p>
      </section>
      <ImportSkillCard />
      <ClearDataCard />
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="account-dialog">
          <DialogTitle>
            {register ? '创建学习账户' : '登录学习账户'}
          </DialogTitle>
          <DialogDescription>
            登录账户以备份学习记录并同步至其他设备。
          </DialogDescription>
          <form onSubmit={login}>
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
      <Dialog open={examOpen} onOpenChange={setExamOpen}>
        <DialogContent className="editor-dialog">
          <DialogTitle>添加考试</DialogTitle>
          <DialogDescription>
            设置具体范围，系统会优先安排其中的薄弱知识。
          </DialogDescription>
          <form onSubmit={saveExam}>
            <label>
              考试名称
              <input
                name="title"
                required
                placeholder="例如：数学第一单元测试"
                maxLength={100}
              />
            </label>
            <div className="form-grid">
              <label>
                学科
                <SubjectChoice
                  value={subject}
                  onChange={(v) => {
                    setSubject(v as Subject);
                    setScope([]);
                  }}
                />
              </label>
              <label>
                日期
                <input
                  name="date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label>
                目标得分率（%）
                <input
                  name="target"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={85}
                  required
                />
              </label>
              <label>
                每日学习时间（分钟）
                <input
                  name="minutes"
                  type="number"
                  min={5}
                  max={180}
                  defaultValue={20}
                  required
                />
              </label>
            </div>
            <label>
              考试范围 <span className="muted">不选表示本学科全部</span>
            </label>
            <div className="scope-list">
              {nodes.map((n) => (
                <label key={n.id}>
                  <input
                    type="checkbox"
                    checked={scope.includes(n.id)}
                    onChange={(e) =>
                      setScope(
                        e.target.checked
                          ? [...scope, n.id]
                          : scope.filter((id) => id !== n.id),
                      )
                    }
                  />
                  {n.title}
                </label>
              ))}
            </div>
            <button className="primary" disabled={busy} type="submit">
              保存考试计划
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
