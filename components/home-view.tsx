'use client';
import {tr} from '@/lib/i18n';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useReview } from './review-context';
import { studyAgenda } from '@/lib/study-orchestrator';
import {presentAction} from '@/lib/presentation';
import { Penguin } from './learning-game';
export default function HomeView({
  direct = false,
}: { direct?: boolean } = {}) {
  const [showCompanion, setShowCompanion] = useState(false);
  useEffect(() => setShowCompanion(true), []);
  const { data, navigate } = useReview(),
    next = presentAction(studyAgenda(data).primary);
  return (
    <section className="now-home" aria-label={tr("dashboard:现在应该做什么")}>
      <div className="now-companion" aria-hidden="true">
        {showCompanion && (
          <Penguin skin={data.settings.gameSkin} action="welcome" />
        )}
      </div>
      <span className="now-kicker">{tr("dashboard:现在，先做这一件事")}</span>
      <h1>{next.title}</h1>
      <p>{next.reason}</p>
      <button
        className="primary game-main-action"
        onClick={() =>
          direct
            ? navigate('plan', 'all', 'launch:' + next.id)
            : navigate('plan')
        }
      >
        {direct ? next.label : tr("dashboard:进入学习计划")}
        <ArrowRight size={20} />
      </button>
      <small>
        {next.minutes > 0 ? tr("common:这一段约 {{v0}} 分钟 · ",{v0:(next.minutes)}) : ''}{tr("dashboard:完成后，再决定下一步")}</small>
    </section>
  );
}
