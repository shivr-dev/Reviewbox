'use client';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useReview } from './review-context';
import { studyAgenda } from '@/lib/study-orchestrator';
import { Penguin } from './learning-game';
export default function HomeView() {
  const [showCompanion, setShowCompanion] = useState(false);
  useEffect(() => setShowCompanion(true), []);
  const { data, navigate } = useReview(),
    next = studyAgenda(data).primary;
  return (
    <section className="now-home" aria-label="现在应该做什么">
      <div className="now-companion" aria-hidden="true">
        {showCompanion && (
          <Penguin skin={data.settings.gameSkin} action="welcome" />
        )}
      </div>
      <span className="now-kicker">现在，先做这一件事</span>
      <h1>{next.title}</h1>
      <p>{next.reason}</p>
      <button
        className="primary game-main-action"
        onClick={() => navigate('plan')}
      >
        进入学习计划
        <ArrowRight size={20} />
      </button>
      <small>
        {next.minutes > 0 ? `这一段约 ${next.minutes} 分钟 · ` : ''}
        完成后，再决定下一步
      </small>
    </section>
  );
}
