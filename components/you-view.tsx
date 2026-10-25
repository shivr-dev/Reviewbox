'use client';
import { isStaticSite } from '@/lib/runtime';
import { pagesConfig, unlockPages, lockPages } from '@/lib/pages-vault';
import { checkPagesAI } from '@/lib/pages-ai-check';
import ClearDataCard from './clear-data-card';
import AlphaPreviewCard from './alpha-preview-card';
import ImportSkillCard from './import-skill-card';
import ExamSchedule from './exam-schedule';
import { saveDailyTime } from '@/lib/exam-outcome-client';
import { GameProfile } from './learning-game';
import { useEffect, useState } from 'react';
import {
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
import {
  put,
  signIn,
  signOut,
  switchAccount,
  uploadLocalToAccount,
  exportBackup,
} from '@/lib/store';
import { download } from '@/lib/importer';
import { Heading, Choice } from './shared';
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
  } = useReview();
  const [visualTheme, setVisualTheme] = useState<
      'editorial' | 'classic' | 'playful'
    >('playful'),
    [vaultReady, setVaultReady] = useState<boolean | null>(null),
    [checkingAI, setCheckingAI] = useState(false),
    [aiCheck, setAiCheck] = useState(''),
    [accountOpen, setAccountOpen] = useState(false),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [minutes, setMinutes] = useState(String(data.settings.dailyMinutes));
  useEffect(() => {
    void pagesConfig().then((value) => setVaultReady(!!value));
    const saved = localStorage.getItem('review-visual-theme');
    setVisualTheme(
      saved === 'classic' || saved === 'editorial' ? saved : 'playful',
    );
  }, []);
  const chooseTheme = (theme: 'editorial' | 'classic' | 'playful') => {
    setVisualTheme(theme);
    localStorage.setItem('review-visual-theme', theme);
    document.documentElement.dataset.reviewTheme = theme;
  };
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
      notify(e instanceof Error ? e.message : '登录未完成');
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
      <section className="panel">
        <h2>私人学习助理</h2>
        <p>
          调整学科权重、每日时间与首次能力诊断。成绩回顾与所有学习方式集中在学习计划中。
        </p>
        <button className="secondary" onClick={() => navigate('onboarding')}>
          学习重点与新手引导 <ArrowRight size={16} />
        </button>
        <label className="setting-row">
          <span>
            关键节点 Qwen 计划复核
            <small>
              考前、真实成绩更新或有足够记录的周回顾。每天最多 1 次，七天最多 2
              次。
            </small>
          </span>
          <Switch
            aria-label="关键节点 Qwen 计划复核"
            checked={data.settings.assistantAi !== false}
            onCheckedChange={async (value) => {
              await put(
                'setting',
                { ...data.settings, assistantAi: value },
                'settings',
              );
              await refresh();
            }}
          />
        </label>
      </section>
      {
        <section className="panel private-config-panel">
          <h2>私有学习配置</h2>
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
                {checkingAI ? '正在检查连接' : '检查 AI 连接'}
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
                  解锁云端配置
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
      }
      <section className="panel appearance-card">
        <div>
          <h2>界面风格</h2>
          <p className="muted">
            选择适合自己的阅读环境。复习时还可单独切换沉浸模式。
          </p>
        </div>
        <div className="appearance-options" role="group" aria-label="界面风格">
          <button
            aria-pressed={visualTheme === 'playful'}
            className={visualTheme === 'playful' ? 'selected' : ''}
            onClick={() => chooseTheme('playful')}
          >
            冒险
          </button>
          <button
            aria-pressed={visualTheme === 'editorial'}
            className={visualTheme === 'editorial' ? 'selected' : ''}
            onClick={() => chooseTheme('editorial')}
          >
            暖纸
          </button>
          <button
            aria-pressed={visualTheme === 'classic'}
            className={visualTheme === 'classic' ? 'selected' : ''}
            onClick={() => chooseTheme('classic')}
          >
            经典
          </button>
        </div>
      </section>
      <AlphaPreviewCard />
      <section className="panel"><h2>手表与设备</h2><p className="muted">配对手表、管理授权，查看圆屏交互预览。</p><button className="secondary" onClick={()=>navigate('devices')}>管理手表与设备 <ArrowRight/></button></section>
      <GameProfile />
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
                try {
                  await saveDailyTime(Number(v));
                  await refresh();
                  notify('每日复习安排已更新');
                } catch (e) {
                  notify(e instanceof Error ? e.message : '未能保存时间');
                }
              }}
              options={['10', '15', '20', '30', '45', '60', '90', '120'].map(
                (v) => ({
                  value: v,
                  label: v + ' 分钟',
                }),
              )}
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
      <ExamSchedule />
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
              ? isStaticSite()
                ? '配置已解锁'
                : '已连接'
              : isStaticSite()
                ? '请先解锁私有配置'
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
    </>
  );
}
