'use client';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  ArrowUpRight,
  Plus,
  Target,
} from 'lucide-react';
import { useReview } from './review-context';
import { SUBJECTS, localDay } from '@/lib/model';
import { buildQueue, nodeMastery, forgettingRisk } from '@/lib/engine';
import { Meter, Empty, Heading, dateLabel } from './shared';
export default function HomeView() {
  const { data, states, start, navigate, prepare, preparing, aiReady } =
    useReview();
  const queue = buildQueue(data);
  const activeSession = data.jobs?.find(
    (j) =>
      j.kind === 'session' &&
      j.status === 'active' &&
      data.events.filter((e) => e.sessionId === j.id).length < j.items?.length,
  );
  const todayEvents = data.events.filter((e) => e.localDay === localDay());
  const avg = data.nodes
    .map((n) => nodeMastery(n, states))
    .filter((x) => x !== null) as number[];
  const overall = avg.length
    ? avg.reduce((a, b) => a + b, 0) / avg.length
    : null;
  const weak = Object.values(states)
    .filter((s) => s.attemptCount && s.mastery < 0.6)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 4);
  const upcoming = data.exams
    .filter((e) => Date.parse(e.date + 'T23:59:59') > Date.now())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const planned = [...new Set(queue.map((q) => q.question.subject))];
  const duration = Math.ceil(
    queue.reduce((a, q) => a + q.question.expectedSeconds, 0) / 60,
  );
  return (
    <>
      <Heading
        eyebrow="YOUR DAILY REVIEW"
        title="今日复习"
        description="根据掌握程度、遗忘风险与考试范围安排复习。"
        action={
          <span className="date-pill">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
        }
      />
      <section className="today-card">
        <div>
          <div className="section-kicker">
            <span className="status-dot" />
            今日复习
            <span className="subtle-badge">
              {todayEvents.length ? '计划已更新' : '今日计划'}
            </span>
          </div>
          <h2>
            {queue.length
              ? '今日复习内容'
              : data.questions.length
                ? '今日计划已完成'
                : '准备今日练习'}
          </h2>
          <p className="muted">
            {queue.length
              ? data.events.length
                ? '优先复习薄弱能力与遗忘风险较高的知识。'
                : '完成初次诊断后，系统将按实际表现调整复习计划。'
              : data.questions.length
                ? '留一点空间给记忆沉淀，下一次复习会按时安排。'
                : '根据你的知识与能力准备练习，核验通过后即可开始。'}
          </p>
          <div className="hero-metrics">
            <div>
              <strong>{queue.length}</strong>
              <span>待复习题目</span>
            </div>
            <div>
              <strong>
                {duration}
                <span> 分钟</span>
              </strong>
              <span>预计用时</span>
            </div>
            <div>
              <strong>
                {planned.length}
                <span> 门</span>
              </strong>
              <span>今日学科</span>
            </div>
          </div>
          <div className="hero-action">
            <button
              className="primary"
              disabled={
                (!!preparing && !queue.length) ||
                (!queue.length && !data.questions.length && !aiReady)
              }
              onClick={() =>
                queue.length
                  ? start(queue)
                  : data.questions.length
                    ? navigate('subjects')
                    : void prepare()
              }
            >
              {(preparing && !queue.length ? preparing : '') ||
                (queue.length
                  ? '开始复习'
                  : data.questions.length
                    ? '浏览我的学科'
                    : '准备今日练习')}
              <ArrowRight size={17} />
            </button>
            {activeSession && (
              <button className="secondary" onClick={() => navigate('study')}>
                继续上次复习
              </button>
            )}
            <span className="muted">
              {todayEvents.length
                ? `今天已完成 ${todayEvents.length} 次练习`
                : '按自己的节奏来'}
            </span>
          </div>
        </div>
        <div className="focus-visual">
          <div className="focus-circle">
            <BookOpen size={24} />
            <strong>{queue.length}</strong>
            <span>一次专注，一点进步</span>
          </div>
          <div className="orbit-tag">
            <Check size={14} />
            每次回忆，都有意义
          </div>
        </div>
      </section>
      <div className="home-columns">
        <section className="panel review-plan">
          <div className="section-head">
            <h2>今天的学习路线</h2>
            <button className="quiet" onClick={() => navigate('study')}>
              查看全部
              <ArrowUpRight size={14} />
            </button>
          </div>
          {queue.length ? (
            <div>
              {planned.slice(0, 4).map((id, i) => {
                const subject = SUBJECTS.find((s) => s.id === id)!;
                const items = queue.filter((q) => q.question.subject === id);
                const nodes = [
                  ...new Set(
                    items.map(
                      (q) =>
                        data.nodes.find((n) => n.id === q.question.nodeId)
                          ?.title,
                    ),
                  ),
                ];
                return (
                  <button
                    className="plan-row"
                    key={id}
                    onClick={() => start(items)}
                  >
                    <span
                      className={
                        'subject-icon s' +
                        SUBJECTS.findIndex((s) => s.id === id)
                      }
                    >
                      {subject.glyph}
                    </span>
                    <div className="grow">
                      <h3>
                        {subject.name}
                        <span className="row-meta">{items.length} 题</span>
                      </h3>
                      <p>{nodes.join(' · ')}</p>
                    </div>
                    <span className="reason-pill">{items[0].reason}</span>
                    <ArrowRight size={15} />
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty
              title={
                data.questions.length
                  ? '给记忆一点时间'
                  : '练习准备好后，会出现在这里'
              }
            >
              {data.questions.length
                ? '下次到期的知识会自动回到这里。'
                : '可以准备今日练习，或到资料库导入自己的内容。'}
            </Empty>
          )}
        </section>
        <section className="panel exam-preview">
          <div className="section-head">
            <h2>近期考试</h2>
            <button
              className="quiet"
              aria-label="添加考试"
              onClick={() => navigate('you')}
            >
              <Plus size={17} />
            </button>
          </div>
          {upcoming.length ? (
            upcoming.map((e) => (
              <button
                className="exam-mini"
                key={e.id}
                onClick={() => navigate('you')}
              >
                <span className="exam-calendar">
                  <b>{new Date(e.date).getDate()}</b>
                  <small>{new Date(e.date).getMonth() + 1}月</small>
                </span>
                <div>
                  <h3>{e.title}</h3>
                  <p className="muted">
                    {SUBJECTS.find((s) => s.id === e.subject)?.name} · 目标{' '}
                    {e.target}%
                  </p>
                </div>
                <span className="days-left">
                  {Math.max(
                    0,
                    Math.ceil((Date.parse(e.date) - Date.now()) / 86400000),
                  )}{' '}
                  天
                </span>
              </button>
            ))
          ) : (
            <Empty
              title="设置考试计划"
              action={
                <button className="secondary" onClick={() => navigate('you')}>
                  <Plus size={14} />
                  添加考试
                </button>
              }
            >
              设置日期和范围，自动调整每天的重点。
            </Empty>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="section-head">
          <h2>我的学科</h2>
          <button className="quiet" onClick={() => navigate('subjects')}>
            学科中心
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="subjects-grid">
          {SUBJECTS.map((s, i) => {
            const nodes = data.nodes.filter((n) => n.subject === s.id);
            const values = nodes
              .map((n) => nodeMastery(n, states))
              .filter((x) => x !== null) as number[];
            return (
              <button
                className="subject-tile"
                key={s.id}
                onClick={() => navigate('subjects', s.id)}
              >
                <span className={'subject-icon s' + i}>{s.glyph}</span>
                <h3>{s.name}</h3>
                <p className="muted">{nodes.length} 个知识点</p>
                <Meter
                  value={
                    values.length
                      ? values.reduce((a, b) => a + b, 0) / values.length
                      : null
                  }
                  color={s.color}
                />
              </button>
            );
          })}
        </div>
      </section>
      <div className="home-columns">
        <section className="panel">
          <div className="section-head">
            <h2>值得多看一眼</h2>
            <span className="muted">聚焦薄弱能力</span>
          </div>
          {weak.length ? (
            weak.map((s) => {
              const node = data.nodes.find((n) => n.id === s.nodeId);
              return (
                <button
                  className="weak-row"
                  key={s.nodeId + s.skillId}
                  onClick={() => navigate('subjects', node?.subject)}
                >
                  <div className="grow">
                    <h3>{node?.title}</h3>
                    <p className="muted">
                      {node?.skills.find((x) => x.id === s.skillId)?.title} ·{' '}
                      {forgettingRisk(s) > 0.6 ? '有遗忘风险' : '需要巩固'}
                    </p>
                  </div>
                  <Meter value={s.mastery} />
                </button>
              );
            })
          ) : (
            <Empty title="尚无薄弱能力记录">
              完成复习后，这里会呈现具体需要巩固的能力。
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="section-head">
            <h2>掌握概览</h2>
            <button className="quiet" onClick={() => navigate('analytics')}>
              学习分析
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="overview-stat">
            <strong>
              {overall === null ? '—' : Math.round(overall * 100) + '%'}
            </strong>
            <div>
              <span>已评估知识掌握度</span>
              <p>
                {avg.length} / {data.nodes.length} 个知识点已开始学习
              </p>
            </div>
          </div>
          <div className="overview-bottom">
            <div>
              <span className="legend-dot" />
              稳定掌握{' '}
              <b>
                {
                  Object.values(states).filter(
                    (s) => s.mastery >= 0.9 && s.stage === 3,
                  ).length
                }
              </b>
            </div>
            <div>
              <span className="legend-dot amber" />
              待巩固{' '}
              <b>
                {
                  Object.values(states).filter(
                    (s) => s.attemptCount && s.mastery < 0.6,
                  ).length
                }
              </b>
            </div>
          </div>
        </section>
      </div>
      <div className="gentle-note">
        <Clock3 size={15} />
        熟悉的内容少一点重复，薄弱的地方多一点理解。
      </div>
    </>
  );
}
