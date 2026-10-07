'use client';
import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  Flag,
  Gem,
  Plus,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import { useReview } from './review-context';
import { SUBJECTS } from '@/lib/model';
import { buildQueue, nodeMastery } from '@/lib/engine';
import { learningGame } from '@/lib/learning-game';
import { questionTopicTitle } from '@/lib/pinyin-collections';
import SubjectIcon from './subject-icon';
import { Penguin } from './learning-game';
export default function HomeView() {
  const { data, states, start, navigate, prepare, preparing, aiReady } =
    useReview();
  const [subject, setSubject] = useState('all'),
    [expanded, setExpanded] = useState(false);
  const g = learningGame(data),
    queue = buildQueue(data, { subjects: subject === 'all' ? [] : [subject] });
  const active = data.jobs?.find(
    (j) =>
      j.kind === 'session' &&
      j.status === 'active' &&
      data.events.filter((e) => !e.voidedBy && e.sessionId === j.id).length <
        j.items?.length,
  );
  const content = data.questions.filter(
    (q) =>
      q.reviewStatus !== 'paused' &&
      (subject === 'all' || q.subject === subject),
  );
  const ids = [
    ...new Set([
      ...queue.map((i) => i.question.nodeId),
      ...content.map((q) => q.nodeId),
    ]),
  ];
  const lessons = ids
    .map((id) => data.nodes.find((n) => n.id === id))
    .filter((n) => !!n);
  const upcoming = data.exams
    .filter((e) => Date.parse(e.date + 'T23:59:59') >= Date.now())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const examNodes = upcoming
    ? data.nodes.filter(
        (n) =>
          n.subject === upcoming.subject &&
          (!upcoming.scope.length || upcoming.scope.includes(n.id)),
      )
    : [];
  const examValues = examNodes.map((n) => nodeMastery(n, states));
  const assessed = examValues.filter((v) => v !== null).length;
  const estimate = examValues.length
    ? examValues.reduce<number>((sum, v) => sum + (v ?? 0), 0) /
      examValues.length
    : null;
  return (
    <div className="learning-home">
      <div className="learning-home-title">
        <div>
          <h1>{g.goalDone ? '今日目标达成！' : '开始今天的冒险'}</h1>
          <p>
            {new Date().toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}{' '}
            · 每一小步，都在向前
          </p>
        </div>
        <button className="quiet" onClick={() => navigate('you')}>
          我的成就 <ArrowRight size={16} />
        </button>
      </div>
      <section className="learning-hero">
        <div>
          <span className="game-unit-label">DAILY QUEST · 每日挑战</span>
          <h2>
            {!data.questions.length
              ? '和企鹅一起，迈出第一步'
              : g.goalDone
                ? '把今天的努力，变成明天的底气'
                : '找回记忆，点亮下一站'}
          </h2>
          <p>
            {!data.questions.length
              ? '导入教材、字词或题目，即可开启你的个人学习路线。'
              : queue.length
                ? '路线会优先安排薄弱能力和到期知识。奖励每次认真尝试，掌握仍靠真实验证。'
                : '到期复习已经完成。可以进行专项巩固，也可以让记忆沉淀。'}
          </p>
          <div className="daily-quest-progress">
            <div>
              <strong>
                {g.daily.count} / {g.goal} 题
              </strong>
              <span>
                {g.goalDone
                  ? '已完成'
                  : `还差 ${Math.max(0, g.goal - g.daily.count)} 题`}
              </span>
            </div>
            <div
              className="quest-track"
              role="progressbar"
              aria-label="每日目标"
              aria-valuemin={0}
              aria-valuemax={g.goal}
              aria-valuenow={Math.min(g.goal, g.daily.count)}
            >
              <i
                style={{
                  width: `${Math.min(100, (g.daily.count / g.goal) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="hero-action">
            <button
              className="primary game-main-action"
              onClick={() => {
                if (!data.questions.length) navigate('library');
                else if (active) navigate('study');
                else if (queue.length) start(queue);
                else navigate('subjects');
              }}
            >
              {!data.questions.length
                ? '导入我的第一份内容'
                : active
                  ? '继续上次冒险'
                  : queue.length
                    ? '开始今日挑战'
                    : '选择专项练习'}
              <ArrowRight size={20} />
            </button>
            {queue.length > 0 && (
              <span className="muted">
                <Clock3 size={14} />约{' '}
                {Math.max(
                  1,
                  Math.ceil(
                    queue.reduce((a, i) => a + i.question.expectedSeconds, 0) /
                      60,
                  ),
                )}{' '}
                分钟
              </span>
            )}
          </div>
        </div>
        <div className="hero-companion">
          <div className="penguin-bubble">
            {g.goalDone
              ? '今天的你，值得一颗星！'
              : g.streak > 1
                ? `第 ${g.streak} 天，我们继续！`
                : '准备好了吗？'}
          </div>
          <Penguin
            skin={g.skin}
            action={g.goalDone ? 'combo' : 'welcome'}
            actionKey={g.today + g.daily.count}
          />
          <span className="companion-ground" />
        </div>
      </section>
      <div className="learning-grid">
        <section className="learning-path-section">
          <div className="section-head">
            <h2>你的学习路线</h2>
            <button className="quiet" onClick={() => navigate('study')}>
              自由练习 <ArrowRight size={15} />
            </button>
          </div>
          <div
            className="learning-subjects"
            role="group"
            aria-label="学习路线学科"
          >
            <button
              aria-pressed={subject === 'all'}
              onClick={() => {
                setSubject('all');
                setExpanded(false);
              }}
            >
              全部
            </button>
            {SUBJECTS.map((s) => (
              <button
                key={s.id}
                aria-pressed={subject === s.id}
                title={s.name}
                onClick={() => {
                  setSubject(s.id);
                  setExpanded(false);
                }}
              >
                <SubjectIcon subject={s.id} size={19} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          {lessons.length ? (
            <div className="learning-path">
              {lessons.slice(0, expanded ? 24 : 8).map((n, i) => {
                const value = nodeMastery(n!, states);
                const stable =
                  n!.skills.length > 0 &&
                  n!.skills.every((sk) => {
                    const s = states[n!.id + '::' + sk.id];
                    return s?.mastery >= 0.9 && s.stage === 3;
                  });
                const items = queue.filter((q) => q.question.nodeId === n!.id);
                const practice = buildQueue(data, {
                  scope: [n!.id],
                  practice: true,
                  limit: 5,
                });
                const visited = data.events.some(
                  (e) => !e.voidedBy && e.nodeId === n!.id,
                );
                return (
                  <div
                    className={
                      'path-stop ' +
                      (stable
                        ? 'stable'
                        : items.length
                          ? 'due'
                          : visited
                            ? 'visited'
                            : 'new')
                    }
                    key={n!.id}
                    style={
                      {
                        '--path-shift': `${Math.sin((i * Math.PI) / 2) * 65}px`,
                      } as React.CSSProperties
                    }
                  >
                    <div className="path-line" aria-hidden="true" />
                    <button
                      className="path-node"
                      title={`练习 ${n!.title}`}
                      aria-label={`${n!.title}，${stable ? '稳定掌握' : items.length ? '待复习' : visited ? '继续巩固' : '初次学习'}`}
                      onClick={() => start(items.length ? items : practice)}
                      disabled={!practice.length}
                    >
                      {stable ? (
                        <Check size={30} />
                      ) : i === 0 && items.length ? (
                        <Flag size={27} />
                      ) : (
                        <SubjectIcon subject={n!.subject} size={29} />
                      )}
                    </button>
                    <div className="path-caption">
                      <strong>
                        {questionTopicTitle(
                          content.find((q) => q.nodeId === n!.id)!,
                          n,
                        )}
                      </strong>
                      <span>
                        {stable
                          ? '稳定掌握'
                          : items.length
                            ? `${items.length} 题待复习`
                            : visited
                              ? '继续巩固'
                              : '初次学习'}
                        {value !== null
                          ? ` · 掌握估计 ${Math.round(value * 100)}%`
                          : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              {lessons.length > 8 && !expanded && (
                <button
                  className="secondary path-more"
                  onClick={() => setExpanded(true)}
                >
                  展开后续路线
                </button>
              )}
              <div className="path-finish">
                <Star size={28} />
                <span>下一站，由你的学习表现决定</span>
              </div>
            </div>
          ) : (
            <div className="path-onboarding">
              <Penguin />
              <h3>
                {data.questions.length
                  ? '这门学科的旅程还未开始'
                  : '从自己的学习内容出发'}
              </h3>
              <p>导入内容 → 独立回忆 → 间隔验证</p>
              <button
                className="primary"
                onClick={() =>
                  navigate(
                    data.questions.length ? 'subjects' : 'library',
                    subject,
                  )
                }
              >
                添加学习内容 <Plus size={17} />
              </button>
              <button
                className="quiet"
                onClick={() => navigate('subjects', subject)}
              >
                也可以先从课程复习开始 <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>
        <aside className="learning-sidebar">
          <section className="panel quest-card">
            <span className="game-quest-icon">
              <Target size={28} />
            </span>
            <h3>今天的小目标</h3>
            <p>完成 {g.goal} 道有效练习</p>
            <div className="quest-count">
              <strong>{Math.min(g.daily.count, g.goal)}</strong>
              <span>/ {g.goal}</span>
              {g.goalDone && <Check size={22} />}
            </div>
            <div className="quest-track">
              <i
                style={{
                  width: `${Math.min(100, (g.daily.count / g.goal) * 100)}%`,
                }}
              />
            </div>
            <small>
              <Zap size={14} />
              {g.daily.xp} XP <Gem size={14} />
              {g.daily.coins} 点数 · 今日获得
            </small>
            <button className="quiet" onClick={() => navigate('you')}>
              调整目标与奖励 <ArrowRight size={14} />
            </button>
          </section>
          <section className="panel exam-goal-card">
            <div className="section-head">
              <h3>下一场考试</h3>
              <Flag size={21} />
            </div>
            {upcoming ? (
              <>
                <h4>{upcoming.title}</h4>
                <p>
                  {upcoming.date} · 目标掌握度 {upcoming.target}%
                </p>
                <div
                  className="quest-track"
                  role="progressbar"
                  aria-label="考试范围掌握度估计"
                  aria-valuenow={Math.round((estimate ?? 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i style={{ width: `${(estimate ?? 0) * 100}%` }} />
                </div>
                <strong>
                  {assessed
                    ? `${Math.round((estimate ?? 0) * 100)}%`
                    : '待首次评估'}
                </strong>
                <small>
                  {assessed} / {examNodes.length}{' '}
                  个知识点已评估。此估计不代表官方考试成绩。
                </small>
                <button className="secondary" onClick={() => navigate('you')}>
                  管理考试目标
                </button>
              </>
            ) : (
              <>
                <p>设置日期与范围，让每一步都有方向。</p>
                <button className="secondary" onClick={() => navigate('you')}>
                  <Plus size={16} />
                  设置考试目标
                </button>
              </>
            )}
          </section>
          <details className="learning-tools">
            <summary>更多学习工具</summary>
            <button className="secondary" onClick={() => navigate('analytics')}>
              查看掌握度与遗忘分析
            </button>
            <button className="secondary" onClick={() => navigate('library')}>
              导入与管理题目
            </button>
            {aiReady && (
              <button
                className="secondary"
                disabled={!!preparing}
                onClick={() => void prepare()}
              >
                {preparing || '按当前能力准备新练习'}
              </button>
            )}
            <p>新题只在你主动准备时生成；已有题目可反复使用。</p>
          </details>
        </aside>
      </div>
    </div>
  );
}
