'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Flame,
  Heart,
  Gem,
  Zap,
  Snowflake,
  Trophy,
  Check,
  Volume2,
  VolumeX,
  X,
  ShoppingBag,
} from 'lucide-react';
import {
  learningGame,
  GAME_SHOP,
  type GameItem,
  type GameReward,
} from '@/lib/learning-game';
import { buyGameItem } from '@/lib/game-client';
import { assetPath } from '@/lib/runtime';
import { currentNamespace, loadData, put } from '@/lib/store';
import { Switch } from './ui/switch';
import { useReview } from './review-context';
import {
  companionFrame,
  companionMotion,
  COMPANION_COSTUMES,
  type CompanionAction,
} from '@/lib/companion-motion';

function useGameClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(now, Date.now());
}

export function Penguin({
  skin = 'default',
  className = '',
  action,
  actionKey,
}: {
  skin?: string;
  className?: string;
  action?: CompanionAction;
  actionKey?: string;
}) {
  const [motion, setMotion] = useState<{
      action: CompanionAction;
      frame: number;
      x: number;
      y: number;
    } | null>(null),
    [hover, setHover] = useState(0);
  const playing = useRef(false),
    hoverCooldown = useRef(0);
  useEffect(() => {
    setMotion(null);
    playing.current = false;
    const chosen = action ?? (hover ? 'welcome' : undefined);
    if (
      !chosen ||
      typeof Image === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return;
    let disposed = false,
      raf = 0,
      started = 0,
      last = -1;
    const image = new Image();
    playing.current = true;
    image.onload = () => {
      if (disposed) return;
      const run = (time: number) => {
        if (disposed) return;
        started ||= time;
        const frame = companionFrame(chosen, time - started, skin);
        if (frame.done) {
          setMotion(null);
          playing.current = false;
          hoverCooldown.current = performance.now() + 400;
          return;
        }
        if (frame.frame !== last) {
          last = frame.frame;
          setMotion({ action: chosen, ...frame });
        }
        raf = requestAnimationFrame(run);
      };
      raf = requestAnimationFrame(run);
    };
    image.onerror = () => {
      if (!disposed) {
        setMotion(null);
        playing.current = false;
      }
    };
    image.src = assetPath(companionMotion(chosen, skin).file);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      playing.current = false;
    };
  }, [action, actionKey, hover, skin]);
  const costume =
    skin === 'skin-explorer'
      ? 'explorer'
      : skin === 'skin-graduate'
        ? 'graduate'
        : '';
  const atlas = COMPANION_COSTUMES[skin];
  return (
    <div
      className={
        'learning-penguin ' +
        skin +
        ' ' +
        className +
        (motion ? ' motion-' + motion.action : '')
      }
      onMouseEnter={() => {
        if (!playing.current && performance.now() >= hoverCooldown.current)
          setHover((v) => v + 1);
      }}
    >
      {motion || (atlas && !costume) ? (
        <span
          className="penguin-sprite"
          role="img"
          aria-label={
            motion?.action === 'thinking'
              ? '企鹅在认真思考'
              : (atlas?.label ??
                (motion?.action === 'combo'
                  ? '企鹅展开双翅庆祝连对'
                  : '企鹅开心地跳跃庆祝'))
          }
          style={{
            backgroundImage: `url("${assetPath(motion ? companionMotion(motion.action, skin).file : atlas.file)}")`,
            backgroundSize: '400% 200%',
            backgroundPosition: `${motion?.x ?? 0}% ${motion?.y ?? 0}%`,
          }}
        />
      ) : (
        <img
          src={assetPath(`learning-penguin${costume ? '-' + costume : ''}.png`)}
          alt={
            costume === 'explorer'
              ? '探险家企鹅学习伙伴'
              : costume === 'graduate'
                ? '毕业礼企鹅学习伙伴'
                : '企鹅学习伙伴'
          }
          width={1280}
          height={1280}
        />
      )}
    </div>
  );
}
export function GameStatus() {
  const { data, navigate } = useReview(),
    g = learningGame(data, useGameClock());
  return (
    <button
      className="game-status"
      onClick={() => navigate('shop')}
      aria-label={`等级 ${g.level}，连续学习 ${g.streak} 天，${g.coins} 点数，${g.hearts} 生命值。打开商店`}
    >
      <span className="game-fire">
        <Flame size={20} />
        {g.streak}
      </span>
      <span className="game-gems">
        <Gem size={20} />
        {g.coins}
      </span>
      {data.settings.gameHearts !== false && (
        <span className="game-heart">
          <Heart size={20} fill="currentColor" />
          {g.hearts}
        </span>
      )}
      <span className="game-level">LV {g.level}</span>
    </button>
  );
}
export type RewardFeedback = GameReward & {
  id: string;
  goalDone?: boolean;
  levelUp?: number;
};
export function RewardFlash({ reward }: { reward: RewardFeedback | null }) {
  const { data } = useReview(),
    skin = learningGame(data).skin;
  const [visible, setVisible] = useState<RewardFeedback | null>(null);
  useEffect(() => {
    if (!reward) return;
    setVisible(reward);
    const id = setTimeout(() => setVisible(null), 2300);
    return () => clearTimeout(id);
  }, [reward?.id]);
  return visible ? (
    <div
      className={'game-reward ' + (visible.correct ? 'success' : 'effort')}
      key={visible.id}
      role="status"
    >
      <Penguin
        skin={skin}
        action={
          visible.levelUp ? 'levelup' : visible.correct ? 'correct' : 'thinking'
        }
        actionKey={visible.id}
      />
      <div>
        <strong>{visible.xp ? `+${visible.xp} XP` : '记录已保存'}</strong>
        <span>
          {visible.levelUp
            ? `升级至 LV ${visible.levelUp}`
            : visible.goalDone
              ? '每日目标达成！'
              : visible.combo > 1
                ? `${visible.combo} 连对 · +${visible.coins} 点数`
                : visible.correct
                  ? '回忆成功！'
                  : '认真复盘，也在进步'}
        </span>
      </div>
    </div>
  ) : null;
}
export function ComboCelebration({
  reward,
}: {
  reward: RewardFeedback | null;
}) {
  const { data } = useReview(),
    skin = learningGame(data).skin;
  const [active, setActive] = useState<RewardFeedback | null>(null);
  useEffect(() => {
    if (
      !reward?.correct ||
      !reward.counted ||
      ![3, 5, 10, 15, 20].includes(reward.combo)
    )
      return;
    setActive(reward);
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const t = setTimeout(() => setActive(null), reduced ? 700 : 1700);
    return () => clearTimeout(t);
  }, [reward?.id]);
  useEffect(() => {
    if (!active) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [active]);
  return active
    ? createPortal(
        <div
          className="combo-screen"
          key={active.id}
          role="dialog"
          aria-label={`${active.combo} 连对`}
          aria-modal="true"
          onClick={() => setActive(null)}
        >
          <button
            className="combo-skip"
            autoFocus
            onClick={() => setActive(null)}
          >
            <X size={18} />
            跳过
          </button>
          <div className="combo-orbit" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    '--angle': `${i * 22.5}deg`,
                    '--delay': `${(i % 4) * 30}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="combo-stage">
            <div className="combo-numeral">
              {active.combo}
              <span>连对</span>
            </div>
            <Penguin skin={skin} action="combo" actionKey={active.id} />
            <h2>
              {active.combo >= 10
                ? '势不可挡！'
                : active.combo >= 5
                  ? '进入状态了！'
                  : '漂亮的开始！'}
            </h2>
            <p>每次独立回忆，都让记忆更牢固</p>
          </div>
        </div>,
        document.body,
      )
    : null;
}
export function GameProfile({ shopOnly = false }: { shopOnly?: boolean } = {}) {
  const { data, refresh, notify, navigate } = useReview(),
    g = learningGame(data, useGameClock());
  const [busy, setBusy] = useState(''),
    [previews, setPreviews] = useState<Record<string, number>>({});
  const lock = useRef(false);
  async function setting(patch: Partial<typeof data.settings>) {
    const ns = currentNamespace();
    try {
      const latest = await loadData(ns);
      if (ns !== currentNamespace()) return;
      await put(
        'setting',
        { ...latest.settings, ...patch },
        'settings',
        false,
        ns,
      );
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '设置未保存');
    }
  }
  async function buy(id: GameItem) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    const ns = currentNamespace();
    try {
      await buyGameItem(id, ns);
      if (ns !== currentNamespace()) return;
      await refresh();
      notify('兑换成功，已加入你的学习空间');
    } catch (e) {
      notify(e instanceof Error ? e.message : '兑换未完成');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  return (
    <section
      className={'panel game-profile ' + (shopOnly ? 'standalone-shop' : '')}
    >
      <div className="game-profile-header">
        <Penguin skin={g.skin} />
        <div className="grow">
          <span className="game-level">LV {g.level} · 知识探险者</span>
          <h2>{data.settings.name}</h2>
          <div
            className="game-level-track"
            role="progressbar"
            aria-label="等级进度"
            aria-valuenow={g.levelXP}
            aria-valuemin={0}
            aria-valuemax={g.levelTarget}
          >
            <i style={{ width: `${(g.levelXP / g.levelTarget) * 100}%` }} />
          </div>
          <small>
            {g.levelXP} / {g.levelTarget} XP 距离下一级
          </small>
        </div>
        <span className="game-gems">
          <Gem />
          {g.coins}
          <small>点数</small>
        </span>
      </div>
      {!shopOnly && (
        <div className="game-tabs" role="group" aria-label="学习奖励">
          <span className="game-tab-current">
            <Trophy size={18} />
            成就与目标
          </span>
          <button onClick={() => navigate('shop')}>
            <ShoppingBag size={18} />
            点数商店 <span>→</span>
          </button>
        </div>
      )}
      {!shopOnly ? (
        <>
          <div className="game-stat-grid">
            <div>
              <Flame />
              <strong>{g.streak}</strong>
              <span>连续学习天数</span>
            </div>
            <div>
              <Zap />
              <strong>{g.totalXP}</strong>
              <span>累计 XP</span>
            </div>
            <div>
              <Snowflake />
              <strong>{g.freezes}</strong>
              <span>连胜冻结储备</span>
            </div>
          </div>
          <div className="game-goal-settings">
            <label>
              每日题目目标
              <select
                aria-label="每日题目目标"
                value={g.goal}
                onChange={(e) =>
                  void setting({ dailyQuestionGoal: Number(e.target.value) })
                }
              >
                {[5, 10, 15, 20, 30].map((v) => (
                  <option key={v} value={v}>
                    {v} 题
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-switch">
              <span>
                <Volume2 size={16} />
                作答音效
              </span>
              <Switch
                aria-label="作答音效"
                checked={data.settings.gameSound !== false}
                onCheckedChange={(value) => void setting({ gameSound: value })}
              />
            </label>
            <label className="setting-switch">
              <span>
                <Heart size={16} />
                生命值挑战
              </span>
              <Switch
                aria-label="生命值挑战"
                checked={data.settings.gameHearts !== false}
                onCheckedChange={(value) => void setting({ gameHearts: value })}
              />
            </label>
          </div>
          <div className="game-badges">
            {g.badges.map((b, i) => (
              <div
                key={b.id}
                className={b.earned ? 'earned' : ''}
                title={b.description}
              >
                <span>
                  <Trophy size={25} />
                  {b.earned && <Check size={12} />}
                </span>
                <strong>{b.title}</strong>
                <small>{b.description}</small>
              </div>
            ))}
          </div>
          <details className="game-week">
            <summary>个人周榜 · 与自己的进步相比</summary>
            <p className="muted">
              仅使用你最近七天的真实记录。XP 代表投入，掌握度仍需间隔验证。
            </p>
            {[...g.week]
              .sort((a, b) => b.xp - a.xp || b.day.localeCompare(a.day))
              .map((d, i) => (
                <div key={d.day}>
                  <b>{i + 1}</b>
                  <span>
                    {d.day.slice(5)}
                    {d.day === g.today ? ' · 今天' : ''}
                    {d.frozen ? ' · 冻结保护' : ''}
                  </span>
                  <strong>{d.xp} XP</strong>
                  <small>{d.count} 题</small>
                </div>
              ))}
          </details>
        </>
      ) : (
        <>
          <p className="muted">
            有效练习每题获得 3 点数，同一题当天仅奖励一次。无现金购买。
          </p>
          <div className="game-shop">
            {GAME_SHOP.map((item) => {
              const owned = g.owned.has(item.id),
                full =
                  (item.type === 'freeze' && g.freezes >= 3) ||
                  (item.type === 'hearts' && g.hearts === g.maxHearts);
              return (
                <article key={item.id} className="game-shop-item">
                  {item.type === 'skin' ? (
                    <Penguin
                      skin={item.id}
                      action={previews[item.id] ? 'combo' : undefined}
                      actionKey={String(previews[item.id] ?? 0)}
                    />
                  ) : (
                    <span className={'game-shop-icon ' + item.type}>
                      {item.type === 'freeze' ? (
                        <Snowflake size={44} />
                      ) : (
                        <Heart size={44} fill="currentColor" />
                      )}
                    </span>
                  )}
                  <h3>{item.name}</h3>
                  {owned && (
                    <span className="shop-owned-label">
                      <Check size={13} />
                      已拥有
                    </span>
                  )}
                  {item.type === 'freeze' && (
                    <span className="shop-inventory">
                      当前拥有 {g.freezes} 枚
                    </span>
                  )}
                  <p>{item.description}</p>
                  {item.type === 'skin' && (
                    <button
                      className="quiet companion-preview"
                      onClick={() =>
                        setPreviews((v) => ({
                          ...v,
                          [item.id]: (v[item.id] ?? 0) + 1,
                        }))
                      }
                      aria-label={`预览${item.name}的动作`}
                    >
                      查看动作
                    </button>
                  )}
                  {owned ? (
                    <button
                      className="secondary"
                      disabled={g.skin === item.id || !!busy}
                      onClick={() => void setting({ gameSkin: item.id })}
                    >
                      {g.skin === item.id ? '正在使用' : '使用皮肤'}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={g.coins < item.cost || !!busy || full}
                      onClick={() => void buy(item.id)}
                    >
                      <Gem size={16} />
                      {busy === item.id
                        ? '正在兑换'
                        : full
                          ? item.type === 'hearts'
                            ? '生命值已满'
                            : '储备已满'
                          : `${item.cost} 点数`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          {g.skin !== 'default' && (
            <button
              className="secondary"
              onClick={() => void setting({ gameSkin: 'default' })}
            >
              使用原版企鹅
            </button>
          )}
          <details>
            <summary>奖励规则</summary>
            <p className="muted">
              连胜冻结在漏学一天后自动使用。生命值每日恢复，也会每 30
              分钟补回一颗；答错会消耗一颗，通过三道恢复练习可补回一颗。考试不消耗生命值。纠错撤销的学习记录，其奖励也会重新核算。
            </p>
          </details>
        </>
      )}
    </section>
  );
}
