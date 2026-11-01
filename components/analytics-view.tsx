'use client';
import {tr} from '@/lib/i18n';
import { useReview } from './review-context';
import { SUBJECTS, keyOf } from '@/lib/model';
import { computeMastery, forgettingRisk, DAY } from '@/lib/engine';
import { masteryStatus, effectiveAnswerTime } from '@/lib/learning-evidence';
import { Heading, Empty, Meter, dateLabel } from './shared';
import LearningInsights from './learning-insights';
import { RemediationLauncher } from './remediation-course';
export default function AnalyticsView({
  subject,
  embedded = false,
}: {
  subject?: string;
  embedded?: boolean;
}) {
  const { data, states, navigate } = useReview();
  const nodes = data.nodes.filter((n) => !subject || n.subject === subject),
    events = data.events.filter(
      (e) => !e.voidedBy && (!subject || e.subject === subject),
    );
  const skills = Object.values(states).filter(
    (s) => s.attemptCount && nodes.some((n) => n.id === s.nodeId),
  );
  const before = computeMastery(
    nodes,
    events.filter((e) => Date.parse(e.occurredAt) < Date.now() - 7 * DAY),
  );
  const weak = [...skills].sort((a, b) => a.mastery - b.mastery).slice(0, 6),
    forget = [...skills]
      .filter((s) => forgettingRisk(s) > 0.4)
      .sort((a, b) => forgettingRisk(b) - forgettingRisk(a))
      .slice(0, 5),
    stable = skills.filter((s) =>
      ['已保持', '已验证'].includes(masteryStatus(s)),
    );
  const improving = [...skills]
    .map((s) => ({
      ...s,
      gain: s.mastery - (before[keyOf(s.nodeId, s.skillId)]?.mastery ?? 0.35),
    }))
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY);
    return {
      date: d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      events: events.filter(
        (e) => new Date(e.occurredAt).toDateString() === d.toDateString(),
      ),
    };
  });
  const row = (
    s: (typeof skills)[number],
    metric: number,
    detail: string,
    label = masteryStatus(s),
  ) => {
    const n = nodes.find((n) => n.id === s.nodeId);
    return (
      <button
        className="weak-row"
        key={s.nodeId + s.skillId}
        onClick={() => navigate('subjects', n?.subject)}
      >
        <div className="grow">
          <h3>{n?.title}</h3>
          <p className="muted">
            {n?.skills.find((x) => x.id === s.skillId)?.title} · {detail}
          </p>
        </div>
        <Meter value={metric} label={label} />
      </button>
    );
  };
  return (
    <>
      {!embedded && (
        <Heading
          eyebrow="LEARNING INSIGHTS"
          title={tr("results:看见知识真正的变化。")}
          description={tr("results:找到薄弱能力、遗忘风险与经过时间验证的掌握。")}
        />
      )}
      <LearningInsights subject={subject} />
      {!events.length ? (
        <section className="panel">
          <Empty title={tr("results:第一条学习记录，会让这里开始生长")}>{tr("results:完成一次复习，就能看到能力掌握和复习建议。")}</Empty>
        </section>
      ) : (
        <>
          <div className="subject-stat-row">
            <div>
              <span>{tr("results:已练习能力")}</span>
              <strong>{skills.length}</strong>
            </div>
            <div>
              <span>{tr("results:稳定掌握")}</span>
              <strong>{stable.length}</strong>
            </div>
            <div>
              <span>{tr("results:遗忘风险较高")}</span>
              <strong>{forget.length}</strong>
            </div>
            <div>
              <span>{tr("results:累计练习")}</span>
              <strong>{events.length}</strong>
            </div>
          </div>
          <section className="panel">
            <div className="section-head">
              <h2>{tr("results:最近两周 · 回忆质量")}</h2>
              <span className="muted">{tr("results:柱高表示当日平均答题得分率")}</span>
            </div>
            <div className="history-chart">
              {days.map((d) => {
                const score = d.events.length
                  ? d.events.reduce((a, e) => a + e.score, 0) / d.events.length
                  : 0;
                return (
                  <div key={d.date}>
                    <span>
                      {d.events.length ? Math.round(score * 100) + '%' : ''}
                    </span>
                    <div className="bar-track">
                      <i
                        style={{
                          height:
                            Math.max(d.events.length ? 3 : 0, score * 100) +
                            '%',
                        }}
                        title={tr("common:{{v0}}：{{v1}} 次练习",{v0:(d.date),v1:(d.events.length)})}
                      />
                    </div>
                    <small>{d.date}</small>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="home-columns">
            <section className="panel">
              <h2>{tr("results:优先巩固的能力")}</h2>
              {weak.map((s) => row(s, s.mastery, `${s.errorCount} 次错误`))}
            </section>
            <section className="panel">
              <h2>{tr("results:正在遗忘")}</h2>
              {forget.length ? (
                forget.map((s) =>
                  row(
                    s,
                    forgettingRisk(s),
                    '上次 ' + dateLabel(s.lastReviewed),
                    '不稳定',
                  ),
                )
              ) : (
                <Empty title={tr("results:目前没有明显遗忘信号")}>{tr("results:间隔越久，系统会更关注回忆风险。")}</Empty>
              )}
            </section>
            <section className="panel">
              <h2>{tr("results:最近进步")}</h2>
              {improving
                .filter((s) => s.gain > 0)
                .map((s) =>
                  row(
                    s,
                    s.mastery,
                    masteryStatus(before[keyOf(s.nodeId, s.skillId)]) ===
                      masteryStatus(s)
                      ? '近期学习证据有所改善'
                      : `${masteryStatus(before[keyOf(s.nodeId, s.skillId)])} → ${masteryStatus(s)}`,
                  ),
                )}
              {!improving.some((s) => s.gain > 0) && (
                <Empty title={tr("results:让进步经过时间验证")}>{tr("results:持续练习后，会显示具体能力的变化。")}</Empty>
              )}
            </section>
            <section className="panel">
              <h2>{tr("results:稳定掌握")}</h2>
              {stable.length ? (
                stable.map((s) =>
                  row(
                    s,
                    s.mastery,
                    `保持间隔参考 ${s.stability.toFixed(0)} 天`,
                  ),
                )
              ) : (
                <Empty title={tr("results:真正的掌握，需要几次重逢")}>{tr("results:通过跨天、变式验证的知识会出现在这里。")}</Empty>
              )}
            </section>
          </div>
          <section className="panel">
            <h2>{tr("results:值得调整学习方法的能力")}</h2>
            {skills
              .filter((s) => s.attemptCount >= 5 && s.mastery < 0.5)
              .map((s) =>
                row(s, s.mastery, '多次练习后仍需巩固，建议检查前置知识'),
              )}
            {!skills.some((s) => s.attemptCount >= 5 && s.mastery < 0.5) && (
              <p className="muted">{tr("results:目前没有长期停滞的能力。")}</p>
            )}
          </section>
          <section className="panel">
            <h2>{tr("results:模拟测试趋势")}</h2>
            {data.tests.map((t) => {
              const es = events.filter((e) => t.eventIds.includes(e.id));
              return es.length ? (
                <div key={t.id}>
                  <div className="queue-row">
                    <div className="grow">
                      <h3>{t.title}</h3>
                      <p className="muted">
                        {dateLabel(t.at)} · {es.length}{tr("results:题 · 思考")}{' '}
                        {Math.round(
                          es.reduce((a, e) => a + effectiveAnswerTime(e), 0) /
                            1000,
                        )}{' '}{tr("results:秒")}</p>
                    </div>
                    <b>
                      {Math.round(
                        (es.reduce((a, e) => a + e.score, 0) / es.length) * 100,
                      )}
                      %
                    </b>
                  </div>
                  <RemediationLauncher
                    sessionId={t.sessionId}
                    title={t.title}
                  />
                </div>
              ) : null;
            })}
            {!data.tests.length && (
              <p className="muted">{tr("results:完成模拟测试后，查看得分和时间趋势。")}</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
