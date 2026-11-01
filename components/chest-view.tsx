'use client';
import {tr} from '@/lib/i18n';
import { useRef, useState } from 'react';
import { Gem, Snowflake, ArrowRight, X } from 'lucide-react';
import { useReview } from './review-context';
import { Penguin } from './learning-game';
import { advanceChest } from '@/lib/game-client';
import { learningGame, type GameChest } from '@/lib/learning-game';
import ChestIllustration from './chest-illustration';
import { currentNamespace } from '@/lib/store';
import { CHEST_TIERS } from '@/lib/home-catalog';
import { ItemArt } from './home-item-art';
export default function ChestView({ sessionId }: { sessionId: string }) {
  const { data, navigate, refresh } = useReview(),
    game = learningGame(data);
  const [chest, setChest] = useState<GameChest | null>(
      data.jobs?.find(
        (j) => j.kind === 'game-chest' && j.sessionId === sessionId,
      ) ?? null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tap, setTap] = useState(0);
  const lock = useRef(false);
  const stage = chest?.stage ?? 0;
  const boost = chest
    ? (chest.boostTier ?? null)
    : ([2, 1, 0].find((t) => game.adventure.tickets[t] > 0) ?? null);
  const tier = boost === null ? null : CHEST_TIERS[boost];
  async function open() {
    if (lock.current || stage === 3) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const ns = currentNamespace();
    try {
      const result = await advanceChest(sessionId, ns);
      if (ns !== currentNamespace()) return;
      setChest(result);
      setTap((v) => v + 1);
      await refresh();
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (e) {
      setError(e instanceof Error ? e.message : '未能开启宝箱');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={'treasure-page stage-' + stage}>
      <button className="quiet treasure-exit" onClick={() => navigate('home')}>{tr("workshop:回到学习路线")}<X size={18} />
      </button>
      <div className="treasure-heading">
        <span>ADVENTURE REWARD</span>
        <h1>{stage === 3 ? tr("workshop:一份努力，一份惊喜") : tr("workshop:你的练习宝箱已送达")}</h1>
        <p>
          {stage === 3
            ? tr("workshop:奖励已保存到你的学习空间")
            : tr("workshop:连续点击三次，打开这份冒险奖励。")}
        </p>
        {tier && (
          <div className="chest-boost-badge">
            <ItemArt kind="ticket" tier={boost!} />
            {tier.name} ·{' '}
            {stage === 0 ? tr("workshop:首次点击自动使用") : tr("workshop:已使用，奖励已锁定")}
          </div>
        )}
      </div>
      <div className="treasure-stage">
        <div className="chest-aura" aria-hidden="true" />
        <button
          className={'treasure-chest ' + (busy ? 'struck' : '')}
          key={tap}
          onClick={() => void open()}
          disabled={busy || stage === 3}
          aria-label={
            stage === 3 ? tr("workshop:宝箱已打开") : tr("common:开启宝箱，第 {{v0}} 次点击",{v0:(stage + 1)})
          }
        >
          <ChestIllustration stage={stage} boost={boost} />
        </button>
        <Penguin
          skin={game.skin}
          className="chest-penguin"
          action={stage === 3 ? 'chest' : 'welcome'}
          actionKey={String(stage)}
        />
      </div>
      <div className="chest-taps" aria-label={tr("common:开箱进度 {{v0}}/3",{v0:(stage)})}>
        {[1, 2, 3].map((v) => (
          <i className={stage >= v ? 'done' : ''} key={v} />
        ))}
      </div>
      {stage === 3 ? (
        <>
          <div className="treasure-prize" role="status">
            {chest!.reward.freezes ? (
              <>
                <Snowflake />
                <strong>{tr("workshop:连胜冻结 × 1")}</strong>
              </>
            ) : (
              <>
                <Gem />
                <strong>+{chest!.reward.coins}{tr("workshop:点数")}</strong>
              </>
            )}
          </div>
          <button className="primary" onClick={() => navigate('plan')}>{tr("workshop:看看下一步")}<ArrowRight size={18} />
          </button>
          <button className="secondary" onClick={()=>navigate('equipment')}>{tr("workshop:查看装备战利品")}<ArrowRight size={16}/></button>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={() => void open()}>
          {busy
            ? tr("workshop:宝箱正在响应…")
            : stage === 2
              ? tr("common:最后一次，开启！")
              : tr("common:点击开箱 · {{v0}} / 3",{v0:(stage + 1)})}
        </button>
      )}
      {error && (
        <div className="rewards-message error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label={tr("workshop:关闭开箱错误")}>
            <X size={16} />
          </button>
        </div>
      )}
      <small>{tr("workshop:连胜冻结 × 1：10% ·")}{tier ? `${tier.min}–${tier.max}` : '50–100'}{' '}{tr("workshop:点数：90%")}<br />{tr("workshop:每段完成的练习仅可领取一次，刷新会保留进度。")}</small>
    </section>
  );
}
