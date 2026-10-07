'use client';
import { useRef, useState } from 'react';
import { Gem, Snowflake, ArrowRight, X } from 'lucide-react';
import { useReview } from './review-context';
import { Penguin } from './learning-game';
import { advanceChest } from '@/lib/game-client';
import { learningGame, type GameChest } from '@/lib/learning-game';
import ChestIllustration from './chest-illustration';
import { currentNamespace } from '@/lib/store';
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
      <button className="quiet treasure-exit" onClick={() => navigate('home')}>
        回到学习路线 <X size={18} />
      </button>
      <div className="treasure-heading">
        <span>ADVENTURE REWARD</span>
        <h1>{stage === 3 ? '一份努力，一份惊喜' : '你的练习宝箱已送达'}</h1>
        <p>
          {stage === 3
            ? '奖励已保存到你的学习空间'
            : '连续点击三次，打开这份冒险奖励。'}
        </p>
      </div>
      <div className="treasure-stage">
        <div className="chest-aura" aria-hidden="true" />
        <button
          className={'treasure-chest ' + (busy ? 'struck' : '')}
          key={tap}
          onClick={() => void open()}
          disabled={busy || stage === 3}
          aria-label={
            stage === 3 ? '宝箱已打开' : `开启宝箱，第 ${stage + 1} 次点击`
          }
        >
          <ChestIllustration stage={stage} />
        </button>
        <Penguin
          skin={game.skin}
          className="chest-penguin"
          action={stage === 3 ? 'chest' : 'welcome'}
          actionKey={String(stage)}
        />
      </div>
      <div className="chest-taps" aria-label={`开箱进度 ${stage}/3`}>
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
                <strong>连胜冻结 × 1</strong>
              </>
            ) : (
              <>
                <Gem />
                <strong>+{chest!.reward.coins} 点数</strong>
              </>
            )}
          </div>
          <button className="primary" onClick={() => navigate('home')}>
            继续下一段冒险 <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={() => void open()}>
          {busy
            ? '宝箱正在响应…'
            : stage === 2
              ? '最后一次，开启！'
              : `点击开箱 · ${stage + 1} / 3`}
        </button>
      )}
      {error && (
        <div className="rewards-message error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="关闭开箱错误">
            <X size={16} />
          </button>
        </div>
      )}
      <small>
        连胜冻结 × 1：10% · 50–100 点数：90%
        <br />
        每段完成的练习仅可领取一次，刷新会保留进度。
      </small>
    </section>
  );
}
