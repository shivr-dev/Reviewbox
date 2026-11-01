'use client';
import {tr} from '@/lib/i18n';
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
  comboMilestone,
  nextComboMilestone,
  COMBO_MOTION,
} from '@/lib/combo-feedback';
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
              ? tr("workshop:企鹅在认真思考")
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
              ? tr("workshop:探险家企鹅学习伙伴")
              : costume === 'graduate'
                ? tr("common:毕业礼企鹅学习伙伴")
                : tr("common:企鹅学习伙伴")
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
      aria-label={tr("common:等级 {{v0}}，连续学习 {{v1}} 天，{{v2}} 点数，{{v3}} 生命值。打开商店",{v0:(g.level),v1:(g.streak),v2:(g.coins),v3:(g.hearts)})}
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
        <strong>{visible.xp ? `+${visible.xp} XP` : tr("workshop:记录已保存")}</strong>
        <span>
          {visible.levelUp
            ? tr("common:升级至 LV {{v0}}",{v0:(visible.levelUp)})
            : visible.goalDone
              ? tr("common:每日目标达成！")
              : visible.combo > 1
                ? tr("common:{{v0}} 连对 · +{{v1}} 点数",{v0:(visible.combo),v1:(visible.coins)})
                : visible.correct
                  ? tr("common:回忆成功！")
                  : tr("common:认真复盘，也在进步")}
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
  return <SoftComboCelebration reward={reward} />;
}
function SoftComboCelebration({ reward }: { reward: RewardFeedback | null }) {
  const { data } = useReview(),
    skin = learningGame(data).skin;
  const [active, setActive] = useState<RewardFeedback | null>(null),
    [phase, setPhase] = useState('enter');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    seen = useRef(new Set<string>()),
    skip = useRef<HTMLButtonElement>(null);
  const reduced =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    const atlas = new Image();
    atlas.src = assetPath(companionMotion('combo', skin).file);
  }, [skin]);
  useEffect(() => {
    if (!reward) {
      setActive(null);
      return;
    }
    if (
      !reward.correct ||
      !reward.counted ||
      !comboMilestone(reward.combo) ||
      seen.current.has(reward.id)
    )
      return;
    seen.current.add(reward.id);
    setPhase('enter');
    setActive(reward);
  }, [reward?.id]);
  // Lifetime belongs to the active celebration, not to the next reward object.
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    skip.current?.focus({ preventScroll: true });
    timers.current = [
      setTimeout(() => setPhase('hold'), reduced ? 0 : COMBO_MOTION.enter),
      setTimeout(() => setPhase('exit'), COMBO_MOTION.hold),
      setTimeout(
        () => setActive(null),
        COMBO_MOTION.hold + (reduced ? 0 : COMBO_MOTION.exit),
      ),
    ];
    return () => {
      timers.current.forEach(clearTimeout);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active?.id, reduced]);
  function dismiss() {
    timers.current.forEach(clearTimeout);
    setPhase('exit');
    timers.current = [
      setTimeout(() => setActive(null), reduced ? 0 : COMBO_MOTION.exit),
    ];
  }
  useEffect(() => {
    if (!active) return;
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        skip.current?.focus();
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [active?.id, reduced]);
  return active
    ? createPortal(
        <div
          className={
            'combo-screen combo-soft phase-' +
            phase +
            (reduced ? ' reduced' : '')
          }
          role="dialog"
          aria-modal="true"
          aria-label={tr("common:{{v0}} 连对，学习里程碑",{v0:(active.combo)})}
          onClick={dismiss}
        >
          <button
            className="combo-skip"
            ref={skip}
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
          >
            <X size={17} />{tr("workshop:继续学习")}</button>
          <div className="combo-orbit" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <i
                key={i}
                style={
                  {
                    '--angle': `${i * 30}deg`,
                    '--delay': `${180 + (i % 3) * 60}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="combo-stage">
            <span className="combo-soft-kicker">{tr("workshop:一步一步，进入状态")}</span>
            <div className="combo-numeral">
              {active.combo}
              <span>{tr("workshop:连续答对")}</span>
            </div>
            <Penguin skin={skin} action="combo" actionKey={active.id} />
            <h2>
              {active.combo >= 10
                ? tr("workshop:这份专注，真不错。")
                : active.combo >= 5
                  ? tr("common:找到自己的节奏了。")
                  : tr("common:漂亮的开始。")}
            </h2>
            <p>{tr("workshop:先收下这份鼓励，再继续下一步。")}</p>
          </div>
        </div>,
        document.body,
      )
    : null;
}
export function ComboIndicator({ reward }: { reward: RewardFeedback | null }) {
  return reward?.counted && reward.correct && reward.combo >= 2 ? (
    <span
      className="combo-progress"
      role="status"
      title={tr("workshop:重复作答、猜测和过快揭晓不累计连对；全屏庆祝在 3、5 及之后每 5 次连对时出现。")}
    >
      <Flame size={15} />
      <b>{reward.combo}{tr("workshop:连对")}</b>
      <small>{tr("workshop:下个里程碑")}{nextComboMilestone(reward.combo)}</small>
    </span>
  ) : null;
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
      notify(tr("workshop:兑换成功，已加入你的学习空间"));
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
          <span className="game-level">LV {g.level}{tr("workshop:· 知识探险者")}</span>
          <h2>{data.settings.name}</h2>
          <div
            className="game-level-track"
            role="progressbar"
            aria-label={tr("workshop:等级进度")}
            aria-valuenow={g.levelXP}
            aria-valuemin={0}
            aria-valuemax={g.levelTarget}
          >
            <i style={{ width: `${(g.levelXP / g.levelTarget) * 100}%` }} />
          </div>
          <small>
            {g.levelXP} / {g.levelTarget}{tr("workshop:XP 距离下一级")}</small>
        </div>
        <span className="game-gems">
          <Gem />
          {g.coins}
          <small>{tr("workshop:点数")}</small>
        </span>
      </div>
      {!shopOnly && (
        <div className="game-tabs" role="group" aria-label={tr("workshop:学习奖励")}>
          <span className="game-tab-current">
            <Trophy size={18} />{tr("workshop:成就与目标")}</span>
          <button onClick={() => navigate('shop')}>
            <ShoppingBag size={18} />{tr("workshop:点数商店")}<span>→</span>
          </button>
        </div>
      )}
      {!shopOnly ? (
        <>
          <div className="game-stat-grid">
            <div>
              <Flame />
              <strong>{g.streak}</strong>
              <span>{tr("workshop:连续学习天数")}</span>
            </div>
            <div>
              <Zap />
              <strong>{g.totalXP}</strong>
              <span>{tr("workshop:累计 XP")}</span>
            </div>
            <div>
              <Snowflake />
              <strong>{g.freezes}</strong>
              <span>{tr("workshop:连胜冻结储备")}</span>
            </div>
          </div>
          <div className="game-goal-settings">
            <label>{tr("workshop:每日题目目标")}<select
                aria-label={tr("workshop:每日题目目标")}
                value={g.goal}
                onChange={(e) =>
                  void setting({ dailyQuestionGoal: Number(e.target.value) })
                }
              >
                {[5, 10, 15, 20, 30].map((v) => (
                  <option key={v} value={v}>
                    {v}{tr("workshop:题")}</option>
                ))}
              </select>
            </label>
            <label className="setting-switch">
              <span>
                <Volume2 size={16} />{tr("workshop:作答音效")}</span>
              <Switch
                aria-label={tr("workshop:作答音效")}
                checked={data.settings.gameSound !== false}
                onCheckedChange={(value) => void setting({ gameSound: value })}
              />
            </label>
            <label className="setting-switch">
              <span>
                <Heart size={16} />{tr("workshop:生命值挑战")}</span>
              <Switch
                aria-label={tr("workshop:生命值挑战")}
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
            <summary>{tr("workshop:个人周榜 · 与自己的进步相比")}</summary>
            <p className="muted">{tr("workshop:仅使用你最近七天的真实记录。XP 代表投入，掌握度仍需间隔验证。")}</p>
            {[...g.week]
              .sort((a, b) => b.xp - a.xp || b.day.localeCompare(a.day))
              .map((d, i) => (
                <div key={d.day}>
                  <b>{i + 1}</b>
                  <span>
                    {d.day.slice(5)}
                    {d.day === g.today ? tr("workshop: · 今天") : ''}
                    {d.frozen ? tr("workshop: · 冻结保护") : ''}
                  </span>
                  <strong>{d.xp} XP</strong>
                  <small>{d.count}{tr("workshop:题")}</small>
                </div>
              ))}
          </details>
        </>
      ) : (
        <>
          <p className="muted">{tr("workshop:有效练习每题获得 3 点数，同一题当天仅奖励一次。无现金购买。")}</p>
          <div className="game-shop">
            {GAME_SHOP.filter((item) =>
              ['skin', 'freeze', 'hearts'].includes(item.type),
            ).map((item) => {
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
                      <Check size={13} />{tr("workshop:已拥有")}</span>
                  )}
                  {item.type === 'freeze' && (
                    <span className="shop-inventory">{tr("workshop:当前拥有")}{g.freezes}{tr("workshop:枚")}</span>
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
                      aria-label={tr("common:预览{{v0}}的动作",{v0:(item.name)})}
                    >{tr("workshop:查看动作")}</button>
                  )}
                  {owned ? (
                    <button
                      className="secondary"
                      disabled={g.skin === item.id || !!busy}
                      onClick={() => void setting({ gameSkin: item.id })}
                    >
                      {g.skin === item.id ? tr("workshop:正在使用") : tr("workshop:使用皮肤")}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={g.coins < item.cost || !!busy || full}
                      onClick={() => void buy(item.id)}
                    >
                      <Gem size={16} />
                      {busy === item.id
                        ? tr("workshop:正在兑换")
                        : full
                          ? item.type === 'hearts'
                            ? tr("common:生命值已满")
                            : tr("common:储备已满")
                          : tr("common:{{v0}} 点数",{v0:(item.cost)})}
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
            >{tr("workshop:使用原版企鹅")}</button>
          )}
          <details>
            <summary>{tr("workshop:奖励规则")}</summary>
            <p className="muted">{tr("workshop:连胜冻结在漏学一天后自动使用。生命值每日恢复，也会每 30 分钟补回一颗；答错会消耗一颗，通过三道恢复练习可补回一颗。考试不消耗生命值。纠错撤销的学习记录，其奖励也会重新核算。")}</p>
          </details>
        </>
      )}
    </section>
  );
}
