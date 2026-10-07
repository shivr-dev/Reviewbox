'use client';
import { useRef, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace, loadData, put } from '@/lib/store';
import {
  buildRemediation,
  remedyPractice,
  remedyProgress,
  remedySource,
  type Remediation,
  type RemedyGroup,
} from '@/lib/remediation';
import { courseCall } from '@/lib/course-client';
import { validateCourseContent, splitCourseSource } from '@/lib/course-model';
import { generateVerified } from '@/lib/ai-client';
import HtmlCourse from './html-course';
import MathText from './math-text';
import QuestionReviewButton from './question-review';
export function RemediationLauncher({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  const { data, refresh, navigate, notify } = useReview(),
    lock = useRef(false);
  const saved = data.jobs?.find((j) => j.id === 'remediation:' + sessionId);
  const count = data.events.filter(
    (e) => e.sessionId === sessionId && !e.voidedBy && e.score < 0.85,
  ).length;
  if (!saved && !count) return null;
  return (
    <section className="remedy-launch">
      <div>
        <h3>把失分转化为下一步学习</h3>
        <p className="muted">
          按同一能力合并问题，依次讲解、对比、巩固并安排隔天验证。
        </p>
      </div>
      <button
        className="secondary"
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          const ns = currentNamespace();
          try {
            const fresh = await loadData(ns),
              old = fresh.jobs?.find(
                (j) => j.id === 'remediation:' + sessionId,
              ),
              job = old ?? buildRemediation(fresh, sessionId, title);
            if (!job.groups.length)
              throw new Error('没有可用于补救课程的有效失分题目');
            if (ns !== currentNamespace()) throw new Error('账户已切换');
            if (!old) await put('job', job, job.id, false, ns);
            await refresh();
            navigate('remedy', job.id);
          } catch (e) {
            notify(e instanceof Error ? e.message : '课程未建立');
          } finally {
            lock.current = false;
          }
        }}
      >
        {saved ? '继续补救课程' : '建立补救课程'}
      </button>
    </section>
  );
}
export default function RemediationCourse({ courseId }: { courseId: string }) {
  const { data, refresh, start, navigate, notify, aiReady } = useReview();
  const job = data.jobs?.find(
    (j) => j.id === courseId && j.kind === 'remediation',
  ) as Remediation | undefined;
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [reply, setReply] = useState('');
  const ns = useRef(currentNamespace()),
    gate = useRef(false);
  if (!job)
    return (
      <section className="panel">
        <h2>补救课程未找到</h2>
        <button className="secondary" onClick={() => navigate('study')}>
          返回复习
        </button>
      </section>
    );
  const g = job.groups[selected],
    p = remedyProgress(job, g, data.events),
    q = g.sources[0].question;
  const htmlParts = g.htmlSections?.length
    ? g.htmlSections
    : g.html
      ? [g.html]
      : [];
  const relevant = g.sources.filter(
    (s) =>
      !data.events.find((e) => e.id === s.eventId)?.voidedBy &&
      data.questions.find((q) => q.id === s.question.id)?.reviewStatus !==
        'paused',
  );
  async function patch(changes: Partial<RemedyGroup>) {
    if (currentNamespace() !== ns.current) throw new Error('账户已切换');
    const fresh = await loadData(ns.current),
      current = fresh.jobs?.find((j) => j.id === courseId) as Remediation;
    if (!current) throw new Error('课程已移除');
    if (currentNamespace() !== ns.current) throw new Error('账户已切换');
    await put(
      'job',
      {
        ...current,
        groups: current.groups.map((x) =>
          x.id === g.id
            ? {
                ...x,
                ...changes,
                ...(changes.interactiveState
                  ? {
                      interactiveState: {
                        ...x.interactiveState,
                        ...changes.interactiveState,
                      },
                    }
                  : {}),
              }
            : x,
        ),
      },
      current.id,
      false,
      ns.current,
    );
    await refresh();
  }
  async function work(label: string, fn: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true;
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成');
    } finally {
      setBusy('');
      gate.current = false;
    }
  }
  async function practice(phase: 'practice' | 'verify') {
    if (!relevant.length)
      throw new Error('来源题目已撤销，请从修订后的考试结果重新建立课程');
    const fresh = await loadData(ns.current),
      items = remedyPractice(fresh, job!, g, phase);
    if (!items.length)
      throw new Error(
        phase === 'verify'
          ? '暂时没有未见过的核验变式，可选择准备一题'
          : '暂无可用练习',
      );
    if (phase === 'practice')
      await patch({
        stage: 3,
        lessonCompletedAt: g.lessonCompletedAt ?? new Date().toISOString(),
      });
    if (currentNamespace() !== ns.current) throw new Error('账户已切换');
    start(items, 'review', g.title + ' · 补救课程');
  }
  const next = () =>
    void work('保存进度', () => patch({ stage: Math.min(3, g.stage + 1) }));
  return (
    <div className="remediation-course">
      <button className="quiet" onClick={() => navigate('subjects', q.subject)}>
        返回学科
      </button>
      <p className="eyebrow">REPAIR · PRACTICE · VERIFY</p>
      <h1>{job.title}</h1>
      <p className="muted">
        保留原 Knowledge Node × Skill 关联，课程练习会反馈到相同能力。
      </p>
      <nav className="remedy-groups" aria-label="补救能力">
        {job.groups.map((x, i) => (
          <button
            key={x.id}
            className={i === selected ? 'selected' : ''}
            onClick={() => {
              setSelected(i);
              setError('');
            }}
          >
            {x.title}
            {remedyProgress(job, x, data.events).successful ? ' · 已验证' : ''}
          </button>
        ))}
      </nav>
      <section className="panel remedy-lesson">
        <h2>{g.title}</h2>
        <ol className="remedy-stage">
          <li className={g.stage === 0 ? 'active' : ''}>讲清问题</li>
          <li className={g.stage === 1 ? 'active' : ''}>对比例题</li>
          <li className={g.stage === 2 ? 'active' : ''}>巩固练习</li>
          <li className={g.stage === 3 ? 'active' : ''}>隔天验证</li>
        </ol>
        {!relevant.length ? (
          <p role="alert">
            来源题目的证据已撤销，当前课程暂停。请核对原题或修订后重新建立课程。
          </p>
        ) : (
          <>
            {g.stage === 0 && (
              <>
                <p>
                  本组 {relevant.length} 道失分题都要求「{g.title}
                  」。下面依据原题解析检查方法与条件；同类失分并不意味着错误原因完全相同。
                </p>
                {relevant.map((s) => (
                  <article key={s.eventId} className="remedy-example">
                    <h3>
                      <MathText>{s.question.prompt}</MathText>
                    </h3>
                    {s.question.passage && (
                      <details>
                        <summary>原文或已知条件</summary>
                        <MathText>{s.question.passage}</MathText>
                      </details>
                    )}
                    <p>
                      <MathText>
                        {s.question.explanation ||
                          '该题暂无完整解析。请先补充解析，或选择编制互动课件。'}
                      </MathText>
                    </p>
                    {s.question.solution?.map((step, i) => (
                      <p key={i}>
                        步骤 {i + 1}：<MathText>{step}</MathText>
                      </p>
                    ))}
                    <QuestionReviewButton question={s.question} />
                  </article>
                ))}
                <button className="primary" disabled={!!busy} onClick={next}>
                  已理解，进行对比
                </button>
              </>
            )}
            {g.stage === 1 && (
              <>
                {relevant.map((s) => (
                  <article key={s.eventId} className="remedy-example">
                    <h3>
                      <MathText>{s.question.prompt}</MathText>
                    </h3>
                    <div className="remedy-compare">
                      <div>
                        <small>原作答</small>
                        <MathText>{s.answer}</MathText>
                      </div>
                      <div>
                        <small>参考答案</small>
                        <MathText>{s.question.answer}</MathText>
                      </div>
                    </div>
                    <details>
                      <summary>检查差异与正确方法</summary>
                      <MathText>{s.question.explanation}</MathText>
                      {s.question.solution?.map((x, i) => (
                        <p key={i}>
                          <MathText>{x}</MathText>
                        </p>
                      ))}
                    </details>
                  </article>
                ))}
                <p className="muted">
                  先指出两种思路的差异，再独立复述正确方法。步骤省略是否成立，需要依据题目条件判断。
                </p>
                <button className="primary" disabled={!!busy} onClick={next}>
                  已完成对比，进入巩固
                </button>
              </>
            )}
            {g.stage === 2 && (
              <>
                <p>
                  优先使用同一能力的未见练习。若暂时没有变式，可用原题巩固；已讲解原题不会作为独立掌握验证。
                </p>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() =>
                    void work('开始练习', () => practice('practice'))
                  }
                >
                  开始巩固练习
                </button>
              </>
            )}
            {g.stage === 3 && (
              <>
                <h3>
                  {p.successful
                    ? '隔天变式验证已通过'
                    : p.failed
                      ? '仍需巩固正确方法'
                      : p.ready
                        ? '可以进行隔天验证'
                        : p.due
                          ? '等待间隔验证'
                          : '尚未完成巩固练习'}
                </h3>
                <p className="muted">
                  {p.due && !p.ready
                    ? '最早验证时间：' + new Date(p.due).toLocaleString()
                    : '验证采用未见过的不同题目，至少间隔 24 小时。长期掌握仍需后续复习。'}
                </p>
                {!p.successful && (
                  <div className="button-row">
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        void work('开始练习', () => practice('practice'))
                      }
                    >
                      重新巩固
                    </button>
                    <button
                      className="primary"
                      disabled={!!busy || !p.ready}
                      onClick={() =>
                        void work('开始验证', () => practice('verify'))
                      }
                    >
                      进行隔天验证
                    </button>
                  </div>
                )}
              </>
            )}
            <details className="remedy-extra">
              <summary>互动课件与新练习（可选）</summary>
              <p className="muted">
                原题讲解和已有练习可直接使用。只有点击下面的编制或准备按钮才调用
                AI。长资料分节完整编制，已完成小节会保留供失败后继续。
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={!!busy || !aiReady}
                  onClick={() =>
                    void work('正在编制互动课件', async () => {
                      const source = remedySource({ ...g, sources: relevant }),
                        chunks = splitCourseSource(source),
                        parts =
                          g.htmlSource === source
                            ? [...(g.htmlSections ?? [])]
                            : [];
                      for (let i = parts.length; i < chunks.length; i++) {
                        if (currentNamespace() !== ns.current)
                          throw new Error('账户已切换，编制已停止');
                        setBusy(`正在编制第 ${i + 1}/${chunks.length} 节`);
                        const value = await courseCall({
                          action: 'generate',
                          subject: q.subject,
                          title: g.title + ' · 补救课程 · ' + (i + 1),
                          source: chunks[i],
                          index: i,
                          total: chunks.length,
                        });
                        const content = validateCourseContent(
                          value.content,
                          chunks[i],
                        );
                        if (!content.html) throw new Error('未返回互动课件');
                        parts.push(content.html);
                        await patch({
                          htmlSections: [...parts],
                          htmlSource: source,
                        });
                      }
                    })
                  }
                >
                  编制或继续互动课件
                </button>
                <button
                  className="secondary"
                  disabled={!!busy || !aiReady}
                  onClick={() =>
                    void work('正在准备核验变式', async () => {
                      const n = data.nodes.find((n) => n.id === g.nodeId),
                        s = n?.skills.find((s) => s.id === g.skillId);
                      if (!n || !s) throw new Error('知识点或能力已移除');
                      await generateVerified(
                        n,
                        s,
                        q.difficulty,
                        '补救课程：更换情境，验证同一种能力',
                        relevant.map((x) => x.question.prompt),
                        (m) => setBusy(m),
                      );
                      if (currentNamespace() !== ns.current)
                        throw new Error('账户已切换');
                      await refresh();
                    })
                  }
                >
                  准备一题核验变式
                </button>
              </div>
            </details>
            {htmlParts.map((html, i) => (
              <HtmlCourse
                key={g.id + ':' + i}
                html={html}
                title={g.title + ' · ' + (i + 1)}
                checks={[]}
                passed={[]}
                freeForm
                state={
                  (g.interactiveState?.[String(i)] ?? {}) as Record<
                    string,
                    unknown
                  >
                }
                locked={!!busy}
                onCheck={async () => {
                  throw new Error('请通过平台练习完成检验');
                }}
                onState={(state) =>
                  patch({ interactiveState: { [String(i)]: state } })
                }
                onPractice={() => practice('practice')}
                onAsk={(text) => {
                  void work('正在解释', async () => {
                    const source =
                        splitCourseSource(g.htmlSource ?? remedySource(g))[i] ??
                        '',
                      content = validateCourseContent(
                        { format: 'free-html', title: g.title, html },
                        source,
                      ),
                      v = await courseCall({
                        action: 'chat',
                        subject: q.subject,
                        title: g.title,
                        source,
                        content,
                        message: text,
                        history: [],
                      });
                    if (currentNamespace() !== ns.current)
                      throw new Error('账户已切换');
                    setReply(v.reply);
                  });
                }}
              />
            ))}
            {reply && (
              <aside className="process-result">
                <div className="section-head">
                  <h3>课程答疑</h3>
                  <button className="quiet" onClick={() => setReply('')}>
                    关闭
                  </button>
                </div>
                <MathText>{reply}</MathText>
              </aside>
            )}
          </>
        )}
        {busy && <p role="status">{busy}</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}
