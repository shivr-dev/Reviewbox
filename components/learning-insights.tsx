'use client';
import { useMemo, useState } from 'react';
import { useReview } from './review-context';
import {
  cognitiveDiagnosis,
  memoryFingerprint,
  policyEvolution,
  flowDifficulty,
  transferCandidates,
  transferProgress,
  CONCEPT_NAMES,
  type MemoryFamily,
} from '@/lib/learning-intelligence';
import { subjectName, keyOf } from '@/lib/model';
import MathText from './math-text';
import PressureLab from './pressure-lab';
import { directProcessEvidence } from '@/lib/process-diagnosis';

export default function LearningInsights({ subject }: { subject?: string }) {
  const { data, states, start } = useReview();
  const [family, setFamily] = useState<MemoryFamily>('formula');
  const insights = useMemo(
    () => ({
      diagnosis: cognitiveDiagnosis(data, subject),
      fingerprints: memoryFingerprint(data),
      policies: policyEvolution(data),
      transfers: transferCandidates(data, subject),
      transferProgress: transferProgress(data, subject),
    }),
    [data, subject],
  );
  const fingerprint = insights.fingerprints.find((f) => f.family === family)!;
  const processEvidence = directProcessEvidence(data, subject);
  const suspects = data.events.filter(
    (e) =>
      !e.voidedBy &&
      (!subject || e.subject === subject) &&
      e.learningEvidence?.suspect,
  );
  const verified = suspects.filter((e) =>
    data.events.some((x) => x.learningEvidence?.verificationOf === e.id),
  );
  const transferEvents = data.events.filter(
    (e) =>
      (!subject || e.subject === subject) &&
      (e.learningEvidence?.transferFrom ||
        e.reason === '跨语境迁移' ||
        data.questions.find((q) => q.id === e.questionId)?.transferFrom),
  );
  const leaders = insights.diagnosis
    .filter((d) => d.identifiable && d.deficit >= 0.65)
    .slice(0, 4);
  const target = data.nodes
    .filter((n) => (!subject || n.subject === subject) && n.skills.length)
    .flatMap((n) =>
      n.skills.map((s) => ({ n, s, state: states[keyOf(n.id, s.id)] })),
    )
    .filter((x) => x.state?.attemptCount)
    .sort((a, b) => a.state.mastery - b.state.mastery)[0];
  const flow = target
    ? flowDifficulty(data, target.n.id, target.s.id, target.state.mastery)
    : undefined;
  return (
    <section className="panel learning-intelligence">
      <div className="section-head">
        <div>
          <p className="eyebrow">PERSONAL LEARNING MODEL</p>
          <h2>学习洞察与验证</h2>
        </div>
        <span className="reason-pill">根据作答证据持续更新</span>
      </div>
      <p className="muted">
        掌握度之外，识别影响作答的能力、记忆节奏与不同情境下的表现。
      </p>
      <div className="intelligence-summary">
        <div>
          <small>待交叉验证</small>
          <strong>{suspects.length - verified.length}</strong>
          <span>仅使用已核验变式</span>
        </div>
        <div>
          <small>跨语境记录</small>
          <strong>{transferEvents.length}</strong>
          <span>分别更新目标能力</span>
        </div>
        <div>
          <small>有效间隔证据</small>
          <strong>
            {insights.fingerprints.reduce((s, f) => s + f.trials, 0)}
          </strong>
          <span>同日连对不计入</span>
        </div>
      </div>
      {processEvidence.length > 0 && (
        <details className="intelligence-detail">
          <summary>
            草稿中的直接证据 <span>{processEvidence.length} 份过程记录</span>
          </summary>
          {processEvidence.slice(0, 8).map((j) => (
            <article className="diagnosis-row" key={j.id}>
              <b>
                第 {(j.result.firstStep ?? 0) + 1} 步 ·{' '}
                {j.result.status === 'gap' ? '依据缺口' : '可能的首个错误'}
              </b>
              <blockquote>
                <MathText>{j.result.quote}</MathText>
              </blockquote>
              <p>
                <MathText>{j.result.explanation}</MathText>
              </p>
              <small className="muted">
                来自实际步骤，仅作为过程证据，不替代独立作答成绩。
              </small>
            </article>
          ))}
        </details>
      )}
      <details className="intelligence-detail" open={leaders.length > 0}>
        <summary>
          认知诊断{' '}
          <span>
            {leaders.length
              ? `${leaders.length} 项能力值得优先巩固`
              : '积累与区分底层能力'}
          </span>
        </summary>
        {leaders.length ? (
          leaders.map((d) => (
            <article className="diagnosis-row" key={d.subject + d.attribute}>
              <div>
                <h3>
                  {subjectName(d.subject)} · {d.title}
                </h3>
                <p className="muted">
                  模型归因比例约 {Math.round(d.errorShare * 100)}% ·{' '}
                  {d.distinctTasks} 道题 · {d.days} 个学习日
                </p>
              </div>
              <details>
                <summary>查看依据</summary>
                {d.evidenceIds.map((id) => {
                  const e = data.events.find((e) => e.id === id),
                    q = data.questions.find((q) => q.id === e?.questionId);
                  return (
                    <p key={id}>
                      <MathText>{q?.prompt ?? '题目已移除'}</MathText> · 得分率{' '}
                      {Math.round((e?.score ?? 0) * 100)}%
                    </p>
                  );
                })}
                <p className="muted">
                  这是能力模型对错误的解释，不代表已观察到具体的跳步行为。
                </p>
              </details>
            </article>
          ))
        ) : (
          <p>
            至少需要同能力 6 次记录、3 道不同题及 2
            个学习日。总是同时出现的能力暂不单独归因；不会仅凭一道错题认定缺陷。
          </p>
        )}
        {insights.diagnosis.some((d) => !d.identifiable) && (
          <p className="muted">
            仍待区分：
            {[
              ...new Set(
                insights.diagnosis
                  .filter((d) => !d.identifiable)
                  .map((d) => d.title),
              ),
            ].join('、')}
            。
          </p>
        )}
        <p className="muted">
          题目所需能力由内容标注或知识与能力名称识别；作答模式推断能力缺口。诊断信号会提高相关题目的复习优先级。
        </p>
      </details>
      <details className="intelligence-detail">
        <summary>
          记忆指纹 <span>按照内容类型调整复习间隔</span>
        </summary>
        <div className="fingerprint-tabs">
          {insights.fingerprints.map((f) => (
            <button
              key={f.family}
              aria-pressed={family === f.family}
              className={family === f.family ? 'selected' : ''}
              onClick={() => setFamily(f.family)}
            >
              {f.title}
            </button>
          ))}
        </div>
        <div className="fingerprint-chart">
          <svg
            viewBox="0 0 600 175"
            role="img"
            aria-label={`${fingerprint.title}的回忆保持率估计曲线`}
          >
            {[0, 0.5, 1].map((v) => (
              <g key={v}>
                <line x1="42" x2="575" y1={140 - v * 110} y2={140 - v * 110} />
                <text x="4" y={145 - v * 110}>
                  {Math.round(v * 100)}%
                </text>
              </g>
            ))}
            <polyline
              points={fingerprint.curve
                .map(
                  (p) =>
                    `${42 + (p.days / 30) * 533},${140 - p.retention * 110}`,
                )
                .join(' ')}
              className={fingerprint.ready ? 'ready' : 'provisional'}
            />
            {fingerprint.curve.map((p) => (
              <g key={p.days}>
                <circle
                  cx={42 + (p.days / 30) * 533}
                  cy={140 - p.retention * 110}
                  r="3"
                />
                <text x={42 + (p.days / 30) * 533} y="166" textAnchor="middle">
                  {p.days}天
                </text>
              </g>
            ))}
          </svg>
        </div>
        <p>
          <b>{fingerprint.shape}</b> · {fingerprint.trials} 次间隔回忆 ·{' '}
          {fingerprint.days} 个学习日
          {fingerprint.ready
            ? ` · 新复习间隔系数 ${fingerprint.factor.toFixed(2)}`
            : ' · 证据不足，保持基础间隔'}
        </p>
        <p className="muted">
          虚线表示先验估计，实线表示已达到个性化门槛；曲线由不同间隔的得分拟合，并非对未来表现的保证。
        </p>
        <div className="memory-bins">
          {fingerprint.bins.map((b) => (
            <span key={b.days}>
              ≤{b.days}天：{b.count} 次
            </span>
          ))}
        </div>
      </details>
      <details className="intelligence-detail">
        <summary>
          复习策略演化 <span>{insights.policies.status}</span>
        </summary>
        <p>
          三种间隔策略按知识点与能力稳定分组，观察下一次跨天回忆。每组至少 20
          次有效回忆、4 种能力，且优势超出不确定区间，才统一采用优胜策略。
        </p>
        <div className="policy-arms">
          {insights.policies.arms.map((p) => (
            <div key={p.id}>
              <h3>
                {p.title}
                {insights.policies.winner === p.id ? ' · 当前采用' : ''}
              </h3>
              <strong>{p.count ? `${Math.round(p.score * 100)}%` : '—'}</strong>
              <p className="muted">
                {p.count} 次 · {p.skills} 种能力 · 间隔 ×{p.factor}
              </p>
            </div>
          ))}
        </div>
        <p className="muted">
          不同能力分组仍可能存在难度差异，结果仅作个人策略比较，不宣称严格因果实验。旧记录没有策略分配，不计入效果比较。
        </p>
      </details>
      <details className="intelligence-detail">
        <summary>
          挑战区与跨语境迁移 <span>优先使用现有题目</span>
        </summary>
        <p>
          {flow
            ? `${target!.n.title} · ${target!.s.title}：建议难度 ${flow.difficulty}，预计答对率 ${Math.round(flow.probability * 100)}%，来自 ${flow.samples} 次近期表现。`
            : '开始练习后，系统会估计各能力的挑战难度。'}
          目标答对率约 75%；不足以精确判断时使用保守估计。
        </p>
        {insights.transfers.slice(0, 3).map((t) => (
          <div className="intelligence-action-row" key={t.target.id}>
            <div>
              <h3>{CONCEPT_NAMES[t.concept] ?? t.concept}</h3>
              <p className="muted">
                {subjectName(t.source.subject)} →{' '}
                {subjectName(t.target.subject)} ·{' '}
                {t.crossSubject ? '跨学科' : '更换情境'}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                start([
                  {
                    question: { ...t.target, transferFrom: t.source.id },
                    reason: '跨语境迁移',
                    priority: 1,
                  },
                ])
              }
            >
              开始挑战
            </button>
          </div>
        ))}
        {!insights.transfers.length && (
          <p className="muted">
            暂无就绪的迁移题。共享概念、不同情境的题目核验通过后会自动进入候选；不会为了展示此功能自动调用
            AI。
          </p>
        )}
        {insights.transferProgress.map((p) => (
          <p key={p.concept}>
            <b>
              {p.title} · {p.ready ? '已跨情境验证' : '尚待验证'}
            </b>{' '}
            · {p.contexts} 种成功情境 · {p.subjects} 门学科 · {p.days} 个学习日
          </p>
        ))}
        <p className="muted">
          迁移成功仍需多次、跨天检验。共同概念不代表所有相关知识均已掌握。
        </p>
      </details>
      <PressureLab subject={subject} />
      <details className="intelligence-detail intelligence-method">
        <summary>模型与数据说明</summary>
        <p>
          诊断采用 DINA
          思路的组合能力模型，猜测与失误率为固定先验，尚未用群体数据校准。题目映射不完整、能力混淆或记录不足时仅显示待验证信号。自评证据权重低于客观作答和评分点批改。所有分析从当前学习空间的事件记录重建，重复事件不会重复计分。
        </p>
        <p>
          <a
            href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5965550/"
            target="_blank"
            rel="noreferrer"
          >
            认知诊断模型研究依据
          </a>
        </p>
      </details>
    </section>
  );
}
