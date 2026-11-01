'use client';
import {tr} from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Gift,
  Gem,
  Snowflake,
  Heart,
  Crown,
  X,
  ArrowRight,
  ShieldCheck,
  Copy,
} from 'lucide-react';
import { useReview } from './review-context';
import { Penguin } from './learning-game';
import { learningGame, GAME_SHOP } from '@/lib/learning-game';
import type { CompanionAction } from '@/lib/companion-motion';
import {
  rewardsRequest,
  describeReward,
  type RewardsState,
  type RewardContents,
} from '@/lib/rewards-client';
import {
  currentNamespace,
  loadData,
  put,
  signIn,
  switchAccount,
} from '@/lib/store';
import { uid } from '@/lib/model';

export function RewardsBridge() {
  const { cloudUser, refresh } = useReview();
  useEffect(() => {
    if (!cloudUser) return;
    let alive = true;
    const run = async () => {
      if (!navigator.onLine) return;
      try {
        await rewardsRequest('state');
        if (alive) await refresh();
      } catch {
        /* Learning remains available offline. */
      }
    };
    void run();
    const t = setInterval(() => void run(), 60000);
    window.addEventListener('online', run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('online', run);
    };
  }, [cloudUser?.id]);
  return null;
}
export function SuperPromo() {
  const { data, navigate, refresh, notify } = useReview(),
    g = learningGame(data);
  if (g.superPlan.active || data.settings.superPromoDismissed) return null;
  return (
    <aside className="super-promo">
      <Crown size={18} />
      <span>
        <b>SuperReview</b>{tr("workshop:· 专属动作、10 颗生命值与每周补给")}</span>
      <button onClick={() => navigate('super')}>{tr("workshop:了解计划")}<ArrowRight size={14} />
      </button>
      <button
        className="super-promo-close"
        aria-label={tr("workshop:关闭 SuperReview 推广")}
        onClick={() => {
          const ns = currentNamespace();
          void loadData(ns)
            .then((d) =>
              put(
                'setting',
                { ...d.settings, superPromoDismissed: true },
                'settings',
                false,
                ns,
              ),
            )
            .then(refresh)
            .catch((e) => notify(e instanceof Error ? e.message : '保存失败'));
        }}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
export default function RewardsView({
  mode = 'redeem',
}: {
  mode?: 'redeem' | 'admin' | 'super';
}) {
  const { data, cloudUser, setCloudUser, refresh, navigate, notify } =
      useReview(),
    game = learningGame(data);
  const [state, setState] = useState<RewardsState | null>(null),
    [receipt, setReceipt] = useState<RewardContents | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [code, setCode] = useState(''),
    [preview, setPreview] = useState(0),
    [motion, setMotion] = useState<CompanionAction>('welcome');
  const lock = useRef(false),
    request = useRef({ code: '', id: '' });
  const load = async () => {
    setError('');
    try {
      setState(await rewardsRequest(mode === 'admin' ? 'admin-list' : 'state'));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接奖励服务');
    }
  };
  useEffect(() => {
    setState(null);
    if (cloudUser) void load();
  }, [cloudUser?.id, mode]);
  async function submit(action: string, payload: Record<string, unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await rewardsRequest(action, payload);
      setState(result);
      await refresh();
      setSuccess(
        action === 'redeem'
          ? '兑换成功，奖品已加入你的学习空间'
          : '兑换码配置已保存',
      );
      if (action === 'redeem') {
        setReceipt(result.redeemedReward ?? null);
        setSuccess('兑换成功：' + describeReward(result.redeemedReward ?? {}));
        setCode('');
        request.current = { code: '', id: '' };
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求未完成');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget);
    try {
      const result = await signIn(
        String(f.get('email')),
        String(f.get('password')),
      );
      if (!result.user) throw new Error('请先确认邮箱');
      await switchAccount(result.user.id);
      setCloudUser(result.user);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录未完成');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className={'rewards-page ' + mode}>
      <div className="rewards-nav">
        <button className="quiet" onClick={() => navigate('shop')}>{tr("workshop:返回商店")}</button>
        <div>
          <button className="quiet" onClick={() => navigate('redeem')}>{tr("workshop:兑换码")}</button>
          <button className="quiet" onClick={() => navigate('super')}>
            SuperReview
          </button>
          <button className="quiet" onClick={() => navigate('admin')}>{tr("workshop:管理员")}</button>
        </div>
      </div>
      {error && (
        <div className="rewards-message error" role="alert">
          <span>{error}</span>
          <button aria-label={tr("workshop:关闭错误提示")} onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {success && (
        <div className="rewards-message success" role="status">
          {success}
          <button aria-label={tr("workshop:关闭成功提示")} onClick={() => setSuccess('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {receipt && (
        <section
          className="redemption-receipt"
          role="region"
          aria-label={tr("workshop:本次兑换奖品")}
        >
          <Gift size={34} />
          <h2>{tr("workshop:奖品已送达")}</h2>
          <p>{describeReward(receipt)}</p>
          {receipt.superUntil && (
            <p className="receipt-validity">{tr("workshop:SuperReview 有效至")}{' '}
              {new Date(receipt.superUntil).toLocaleString('zh-CN')}
            </p>
          )}
          <small>{tr("workshop:点数、冻结储备和已拥有的服装已同步到商店。")}</small>
          <button className="secondary" onClick={() => navigate('shop')}>{tr("workshop:查看我的奖品")}<ArrowRight size={16} />
          </button>
        </section>
      )}
      {mode === 'super' ? (
        <section className="super-plan panel">
          <div className="super-emblem">
            <Crown />
            SUPERREVIEW
          </div>
          <h1>{tr("workshop:让每一段冒险，都有特别的陪伴。")}</h1>
          <Penguin
            skin="skin-super"
            action={motion}
            actionKey={String(preview)}
          />
          <div className="super-motion-picker" aria-label={tr("workshop:专属动作预览")}>
            {(
              [
                ['welcome', tr("workshop:欢迎登场")],
                ['correct', tr("workshop:答对庆祝")],
                ['thinking', tr("workshop:思考鼓励")],
                ['combo', tr("workshop:连对大招")],
                ['chest', tr("workshop:开箱惊喜")],
                ['levelup', tr("workshop:升级飞跃")],
              ] as [CompanionAction, string][]
            ).map(([action, label]) => (
              <button
                key={action}
                className={motion === action ? 'selected' : ''}
                onClick={() => {
                  setMotion(action);
                  setPreview((v) => v + 1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="super-benefits">
            <div>
              <Heart />
              <strong>{tr("workshop:10 颗生命值")}</strong>
              <p>{tr("workshop:保留恢复练习与自动恢复")}</p>
            </div>
            <div>
              <Snowflake />
              <strong>{tr("workshop:每周三枚冻结")}</strong>
              <p>{tr("workshop:每周联网自动领取，不重复发放")}</p>
            </div>
            <div>
              <Crown />
              <strong>{tr("workshop:极光披风与专属动作")}</strong>
              <p>{tr("workshop:欢迎、庆祝、鼓励、连对、开箱与升级")}</p>
            </div>
          </div>
          <p>
            {game.superPlan.active
              ? tr("common:会员有效至 {{v0}}",{v0:(new Date(game.superPlan.until!).toLocaleDateString('zh-CN'))})
              : tr("workshop:使用兑换码激活，会员天数由兑换码设定。")}
          </p>
          <button className="primary" onClick={() => navigate('redeem')}>{tr("workshop:使用兑换码激活")}<Gift size={18} />
          </button>
          {game.superPlan.active && (
            <button
              className="secondary"
              onClick={() => {
                const ns = currentNamespace();
                void loadData(ns)
                  .then((d) =>
                    put(
                      'setting',
                      { ...d.settings, gameSkin: 'skin-super' },
                      'settings',
                      false,
                      ns,
                    ),
                  )
                  .then(refresh)
                  .catch((e) =>
                    notify(e instanceof Error ? e.message : '保存失败'),
                  );
              }}
            >{tr("workshop:使用专属企鹅")}</button>
          )}
        </section>
      ) : !cloudUser ? (
        <section className="panel redeem-card">
          <ShieldCheck className="reward-large-icon" />
          <h1>{mode === 'admin' ? tr("workshop:管理员登录") : tr("workshop:登录后兑换奖品")}</h1>
          <p>{tr("workshop:奖品与会员权益绑定到学习账户，可在其他设备使用。")}</p>
          <form onSubmit={login}>
            <label>{tr("workshop:邮箱")}<input
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={mode === 'admin' ? 'shivrdream@gmail.com' : ''}
              />
            </label>
            <label>{tr("workshop:密码")}<input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? tr("workshop:正在登录") : tr("workshop:登录学习账户")} <ArrowRight size={18} />
            </button>
          </form>
          <button className="quiet" onClick={() => navigate('you')}>{tr("workshop:站点配置与账号设置")}</button>
        </section>
      ) : mode === 'redeem' ? (
        <section className="panel redeem-card">
          <Gift className="reward-large-icon" />
          <h1>{tr("workshop:开启一份特别奖励")}</h1>
          <p>{tr("workshop:输入兑换码，领取点数、服装或 SuperReview 权益。")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const normalized = code.trim().toUpperCase();
              if (request.current.code !== normalized)
                request.current = { code: normalized, id: uid() };
              void submit('redeem', {
                code: normalized,
                requestId: request.current.id,
              });
            }}
          >
            <label className="sr-only" htmlFor="reward-code">{tr("workshop:兑换码")}</label>
            <input
              id="reward-code"
              className="redeem-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={tr("workshop:输入兑换码")}
              autoComplete="off"
              maxLength={64}
              required
            />
            <button className="primary" disabled={busy || !code.trim()}>
              {busy ? tr("workshop:正在核验") : tr("workshop:兑换奖品")} <Gift size={18} />
            </button>
          </form>
          <small>{tr("workshop:兑换需联网，使用次数和有效期以兑换码配置为准。")}</small>
        </section>
      ) : state?.admin ? (
        <section className="panel admin-rewards">
          <h1>{tr("workshop:兑换码管理")}</h1>
          <p>{tr("workshop:为兑换码配置奖品与使用限制。已发出的奖品不会被后续修改影响。")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit('admin-save', {
                code: f.get('code'),
                maxUses: Number(f.get('maxUses')),
                perUserLimit: Number(f.get('perUserLimit')),
                expiresAt: f.get('expiresAt')
                  ? new Date(String(f.get('expiresAt'))).toISOString()
                  : null,
                rewards: {
                  coins: Number(f.get('coins')),
                  freezes: Number(f.get('freezes')),
                  superDays: Number(f.get('superDays')),
                  skin: f.get('skin') || null,
                  refill: f.get('refill') === 'on',
                },
              });
            }}
          >
            <div className="admin-code-input">
              <label>{tr("workshop:兑换码")}<input
                  name="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  minLength={6}
                  maxLength={64}
                  pattern="[A-Za-z0-9-]+"
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setCode(
                    'RV-' + uid().replace(/-/g, '').slice(0, 12).toUpperCase(),
                  )
                }
              >{tr("workshop:随机生成")}</button>
            </div>
            <div className="admin-fields">
              <label>{tr("workshop:总使用次数")}<input
                  type="number"
                  name="maxUses"
                  defaultValue={10}
                  min={1}
                  max={1000000}
                  required
                />
              </label>
              <label>{tr("workshop:每账号可用次数")}<input
                  type="number"
                  name="perUserLimit"
                  defaultValue={1}
                  min={1}
                  max={1000000}
                  required
                />
              </label>
              <label>{tr("workshop:点数")}<input
                  type="number"
                  name="coins"
                  defaultValue={0}
                  min={0}
                  max={100000}
                />
              </label>
              <label>{tr("workshop:连胜冻结数量")}<input
                  type="number"
                  name="freezes"
                  defaultValue={0}
                  min={0}
                  max={1000}
                />
              </label>
              <label>{tr("workshop:SuperReview 天数")}<input
                  type="number"
                  name="superDays"
                  defaultValue={0}
                  min={0}
                  max={3650}
                />
              </label>
              <label>{tr("workshop:到期时间（可选）")}<input type="datetime-local" name="expiresAt" />
              </label>
              <label>{tr("workshop:服装或背景")}<select name="skin">
                  <option value="">{tr("workshop:不赠送皮肤")}</option>
                  {GAME_SHOP.filter((i) => i.type === 'skin').map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-checkbox">
                <input type="checkbox" name="refill" />{tr("workshop:生命值补给")}</label>
            </div>
            <button className="primary" disabled={busy}>
              {busy ? tr("workshop:正在保存") : tr("workshop:保存兑换码")}
            </button>
          </form>
          <div className="admin-code-list">
            {state.codes?.map((c) => (
              <article key={c.code}>
                <div>
                  <strong>{c.code}</strong>
                  <p>{describeReward(c.rewards)}</p>
                  <small>
                    {c.used} / {c.max_uses}{tr("workshop:次 · 每账号")}{c.per_user_limit}{tr("workshop:次")}{c.expires_at
                      ? ' · ' + new Date(c.expires_at).toLocaleString('zh-CN')
                      : ''}
                  </small>
                </div>
                <button
                  className="quiet"
                  aria-label={'复制 ' + c.code}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(c.code)
                      .then(() => notify(tr("workshop:兑换码已复制")))
                  }
                >
                  <Copy size={16} />
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void submit('admin-disable', {
                      code: c.code,
                      active: !c.active,
                    })
                  }
                >
                  {c.active ? tr("workshop:停用") : tr("workshop:启用")}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel redeem-card">
          <ShieldCheck className="reward-large-icon" />
          <h1>{state ? tr("workshop:此账户没有管理权限") : tr("workshop:正在核验管理员权限")}</h1>
          <p>{tr("workshop:请使用已授权的管理员学习账户。")}</p>
          <button className="secondary" onClick={() => void load()}>{tr("workshop:重新连接")}</button>
          <button className="quiet" onClick={() => navigate('you')}>{tr("workshop:切换学习账户")}</button>
        </section>
      )}
    </div>
  );
}
