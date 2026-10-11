'use client';
import { ArrowRight, Clock3, Settings2 } from 'lucide-react';
import { useReview } from './review-context';
import { dailyStudyPlan, weeklyLearningGpa } from '@/lib/study-assistant';
import { subjectName } from '@/lib/model';
import PressureLab from './pressure-lab';

export default function DailyAssistant() {
  const { data, navigate, start } = useReview(),
    plan = dailyStudyPlan(data),
    weekly = weeklyLearningGpa(data);
  const unknown = plan.skills.filter((s) => s.state === 'unknown').length,
    retained = plan.skills.filter((s) => s.state === 'retained').length;
  return (
    <section className="daily-assistant" aria-label="私人学习助理">
      <div className="assistant-heading">
        <div>
          <span className="assistant-kicker">PERSONAL STUDY PLAN</span>
          <h2>今天，按这个顺序学习</h2>
          <small>{plan.status}</small>
        </div>
        <button className="quiet" onClick={() => navigate('onboarding')}>
          <Settings2 size={15} /> 学习重点与引导
        </button>
      </div>
      <div className="assistant-report-grid">
        <span>时间预算 {plan.settings.dailyMinutes} 分钟</span>
        <span>已观察稳定 {retained} 项</span>
        <span>尚未评估 {unknown} 项</span>
      </div>
      {plan.stages.length ? (
        <ol className="assistant-steps">
          {plan.stages.map((stage, i) => (
            <li key={stage.kind}>
              <span>{i + 1}</span>
              <div>
                <strong>{stage.title}</strong>
                <p>{stage.reasons.slice(0, 2).join('；')}</p>
                <small>
                  {stage.items.length} 题 · 约{' '}
                  {Math.max(1, Math.ceil(stage.seconds / 60))} 分钟
                </small>
              </div>
              <button className="quiet" onClick={() => start(stage.items)}>
                开始 <ArrowRight size={15} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {plan.remainingSeconds
            ? '导入内容后会形成复习顺序；没有到期内容时不必机械重复。'
            : '今天的时间预算已经完成。可以休息，或者自主选择测试。'}
        </p>
      )}
      {!!plan.missingSubjects.length && (
        <p className="assistant-evidence-note">
          尚无可用练习内容：{plan.missingSubjects.map(subjectName).join('、')}
          。导入后才能评估，系统不会把空题库当作未掌握。
        </p>
      )}
      <div className="button-row">
        {plan.queue.length > 0 && (
          <button className="primary" onClick={() => start(plan.queue)}>
            按计划开始 <ArrowRight size={17} />
          </button>
        )}
        <button className="secondary" onClick={() => navigate('library')}>
          添加学习内容
        </button>
      </div>
      {plan.recommendations.slice(0, 3).map((rec) => (
        <div className="assistant-recommendation" key={rec.mode + rec.subject}>
          <strong>{rec.title}</strong>
          <p>{rec.reason}</p>
          {rec.mode === 'pressure' ? (
            <PressureLab subject={rec.subject} />
          ) : (
            <button
              className="secondary"
              onClick={() => start(rec.questions, 'test', rec.title)}
            >
              参加{rec.mode === 'initial' ? '能力诊断' : '阶段短测'} ·{' '}
              {rec.questions.length} 题
            </button>
          )}
        </div>
      ))}
      <aside className="assistant-gpa" aria-label="每周学习 GPA">
        <span className="assistant-kicker">MONDAY REVIEW · 每周一发布</span>
        <strong>
          {weekly.value === null
            ? '暂未形成 GPA'
            : weekly.value.toFixed(2) + ' / 4.00'}
        </strong>
        <span>{weekly.label}</span>
        <p className="assistant-evidence-note">
          {weekly.period.startDate} — {weekly.period.endDate} ·
          本周一发布上周学习报告
        </p>
        <details>
          <summary>查看依据与计算方式</summary>
          <p>{weekly.reason}</p>
          <p>
            {weekly.sample} 次可靠间隔作答 · {weekly.days} 个学习日 · 覆盖{' '}
            {weekly.testedSkills} / {weekly.availableSkills} 项能力
          </p>
          {Object.values(weekly.components).map((c) => (
            <p key={c.title}>
              {c.title}（权重 {Math.round(c.weight * 100)}%）：
              {c.value === null ? '证据不足' : Math.round(c.value * 100) + '%'}
            </p>
          ))}
          <p>{weekly.caveat}</p>
        </details>
      </aside>
      <details className="assistant-evidence-note">
        <summary>计划如何决定下一步</summary>
        <p>
          {plan.methodology}{' '}
          学科权重影响优先顺序，临近考试时加大相关能力的验证；近期失败与前置基础优先，已稳定知识适当减少重复。
        </p>
        <p>
          <a
            href="https://www.nature.com/articles/s41539-020-00074-4"
            target="_blank"
            rel="noreferrer"
          >
            间隔与个人表现研究
          </a>{' '}
          ·{' '}
          <a
            href="https://www.apa.org/pubs/journals/features/xge-xge0000170.pdf"
            target="_blank"
            rel="noreferrer"
          >
            自适应复习与固定间隔研究
          </a>
        </p>
      </details>
    </section>
  );
}
