'use client';
import { courseErrorMessage } from '@/lib/course-errors';
import { CourseSources, CourseStudyTools } from './course-tools';
import HtmlCourse from './html-course';
import { verifyCourseQuestions } from '@/lib/course-verification';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Send,
  X,
  RotateCcw,
  FileText,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useReview } from './review-context';
import { currentNamespace, put } from '@/lib/store';
import {
  courseCall,
  saveCourse,
  prepareCourse,
  prepareFreeCoursePractice,
  recordCourseCheck,
} from '@/lib/course-client';
import {
  courseQuestions,
  replaceCourseSection,
  validateCourseContent,
  type Course,
  type CourseContent,
  type CourseSection,
} from '@/lib/course-model';
import { type Question } from '@/lib/model';
import MathText from './math-text';
function ProcessExplorer({ content }: { content: CourseContent }) {
  const [step, setStep] = useState(0);
  return (
    <section className="lesson-process">
      <p className="eyebrow">PROCESS</p>
      <h2>
        <MathText>{content.process.title}</MathText>
      </h2>
      <div className="lesson-process-tabs">
        {content.process.steps.map((s, i) => (
          <button
            key={i}
            className={i === step ? 'active' : ''}
            onClick={() => setStep(i)}
            aria-label={'过程步骤 ' + (i + 1)}
          >
            <span>{i + 1}</span>
            <MathText>{s.title}</MathText>
          </button>
        ))}
      </div>
      <article key={step}>
        <span>
          步骤 {step + 1} / {content.process.steps.length}
        </span>
        <h3>
          <MathText>{content.process.steps[step].title}</MathText>
        </h3>
        <p>
          <MathText>{content.process.steps[step].explanation}</MathText>
        </p>
      </article>
      <div className="button-row">
        <button
          className="quiet"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ChevronLeft size={16} />
          上一步
        </button>
        <button
          className="quiet"
          disabled={step === content.process.steps.length - 1}
          onClick={() => setStep(step + 1)}
        >
          下一步
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  );
}
function Checkpoint({
  q,
  passed,
  locked,
  onResult,
}: {
  q: Question;
  passed: boolean;
  locked: boolean;
  onResult: (q: Question, answer: string, at: number) => Promise<void>;
}) {
  const [answer, setAnswer] = useState(''),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const element = useRef<HTMLDivElement>(null),
    shown = useRef(Date.now());
  useEffect(() => {
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          shown.current = Date.now();
          ob.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    if (element.current) ob.observe(element.current);
    return () => ob.disconnect();
  }, [q.id]);
  const correct = answer === q.answer;
  return (
    <div className="lesson-check" ref={element}>
      <div className="section-head">
        <span>理解检验</span>
        {passed && (
          <span className="course-passed">
            <Check size={14} />
            已通过
          </span>
        )}
      </div>
      <h3>
        <MathText>{q.prompt}</MathText>
      </h3>
      <div className="lesson-check-options">
        {q.options?.map((o, i) => (
          <button
            key={i}
            disabled={locked || busy || checked || passed}
            className={
              (answer === o ? 'chosen ' : '') +
              (checked && o === q.answer ? 'correct' : '')
            }
            onClick={() => setAnswer(o)}
          >
            <b>{String.fromCharCode(65 + i)}</b>
            <MathText>{o}</MathText>
          </button>
        ))}
      </div>
      {!checked && !passed && (
        <button
          className="secondary"
          disabled={!answer || busy || locked}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onResult(q, answer, shown.current);
              setChecked(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : '记录未保存');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '正在保存' : '检查答案'}
        </button>
      )}
      {(checked || passed) && (
        <div className="lesson-check-feedback">
          <b>
            {passed || correct ? '理解检验已通过' : '请根据解析重新检查推理。'}
          </b>
          <p>
            <MathText>{q.explanation}</MathText>
          </p>
          {!correct && !passed && (
            <button
              className="quiet"
              onClick={() => {
                setChecked(false);
                setAnswer('');
                shown.current = Date.now();
              }}
            >
              重新作答
            </button>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function CourseRoom({ courseId }: { courseId: string }) {
  const { data, refresh, navigate, notify, start, aiReady } = useReview();
  const initial = data.jobs?.find(
    (j) => j.id === courseId && j.kind === 'course',
  ) as Course | undefined;
  const [course, setCourse] = useState(initial),
    [navOpen, setNavOpen] = useState(true),
    [bookmarksOnly, setBookmarksOnly] = useState(false),
    [chatOpen, setChatOpen] = useState(false),
    [message, setMessage] = useState(''),
    [selection, setSelection] = useState(''),
    [working, setWorking] = useState(''),
    [proposal, setProposal] = useState<{
      content: CourseContent;
      sectionId: string;
      revision: number;
      verification?: Question['verification'];
    } | null>(null),
    [error, setError] = useState('');
  const ref = useRef(course),
    ns = useRef(currentNamespace()),
    queue = useRef(Promise.resolve()),
    stop = useRef(false),
    lock = useRef(false);
  useEffect(() => {
    if (!ref.current && initial) {
      ref.current = initial;
      setCourse(initial);
    }
  }, [initial]);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );
  const section = course?.sections[course.current],
    content = section?.content;
  function update(next: Course) {
    ref.current = next;
    setCourse(next);
    const nextValue = structuredClone(next);
    queue.current = queue.current
      .catch(() => {})
      .then(() => saveCourse(nextValue, ns.current));
    queue.current.catch(() =>
      setError('课程进度未能保存，请检查设备存储后重试。'),
    );
    return queue.current;
  }
  async function flush() {
    await queue.current.catch(() => {});
    const c = ref.current;
    if (c) await saveCourse(c, ns.current);
  }
  async function leave() {
    try {
      await flush();
      await refresh();
      navigate('subjects', course?.subject);
    } catch {
      setError('请先完成本地保存后再退出。');
    }
  }
  function select(index: number) {
    if (working || !ref.current) return;
    void update({ ...ref.current, current: index }).catch(() => {});
    setProposal(null);
    setSelection('');
    document
      .querySelector('.lesson-article')
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function result(q: Question, answer: string, at: number) {
    if (!ref.current || working) return;
    await recordCourseCheck(ref.current, q, answer, at, ns.current);
    if (answer === q.answer) {
      const c = ref.current;
      await update({
        ...c,
        sections: c.sections.map((s) =>
          s.id === section?.id
            ? { ...s, passed: [...new Set([...s.passed, q.id])] }
            : s,
        ),
      });
    }
    await refresh();
  }
  async function resume() {
    if (!ref.current || lock.current) return;
    lock.current = true;
    stop.current = false;
    setWorking('正在继续编制课程');
    try {
      await flush();
      const next = await prepareCourse(
        ref.current,
        (c, s) => {
          ref.current = c;
          setCourse(c);
          setWorking(s);
        },
        stop,
        ns.current,
      );
      ref.current = next;
      setCourse(next);
      await refresh();
    } catch (e) {
      setError(courseErrorMessage(e));
      await refresh();
    } finally {
      setWorking('');
      lock.current = false;
    }
  }
  async function complete() {
    const c = ref.current;
    const currentSection = c?.sections[c.current];
    if (!c || !currentSection || working || lock.current) return;
    const checks = courseQuestions(c, currentSection, 'checks');
    if (checks.some((q) => !currentSection.passed.includes(q.id))) {
      notify('请先完成本节的全部理解检验');
      return;
    }
    const next = {
      ...c,
      sections: c.sections.map((s) =>
        s.id === currentSection.id
          ? { ...s, completedAt: new Date().toISOString() }
          : s,
      ),
    };
    lock.current = true;
    try {
      await update(next);
      await refresh();
      const nextIndex = next.sections.findIndex((s) => !s.completedAt);
      if (nextIndex >= 0) {
        select(nextIndex);
      } else {
        const practice = next.sections.flatMap((s) =>
          courseQuestions(next, s, 'practice'),
        );
        practice.push(
          ...(await prepareFreeCoursePractice(next, setWorking, ns.current)),
        );
        await refresh();
        if (currentNamespace() !== ns.current)
          throw new Error('账户已切换，请重新打开课程');
        start(
          practice.map((question) => ({
            question,
            reason: '课程巩固与迁移',
            priority: 1,
          })),
          'review',
          next.title + ' · 巩固练习',
        );
      }
    } catch (e) {
      setError(courseErrorMessage(e));
    } finally {
      lock.current = false;
      setWorking('');
    }
  }
  function ask() {
    const selected = window.getSelection()?.toString().trim().slice(0, 1800);
    if (selected) setSelection(selected);
    setChatOpen(true);
  }
  async function send(mode: 'chat' | 'revise', overrideMessage?: string) {
    const c = ref.current;
    if (
      !c ||
      !section?.content ||
      !(overrideMessage ?? message).trim() ||
      lock.current
    )
      return;
    const currentSection = section,
      requestMessage = overrideMessage ?? message;
    lock.current = true;
    setWorking(mode === 'chat' ? '正在组织解释' : '正在准备修改预览');
    setError('');
    try {
      await flush();
      const response = await courseCall({
        action: mode,
        subject: c.subject,
        title: c.title,
        source: currentSection.source,
        content: currentSection.content,
        message: requestMessage,
        selection,
        history: c.chat
          .filter((m) => m.sectionId === currentSection.id)
          .slice(-8)
          .map(({ role, text }) => ({ role, text })),
      });
      if (currentNamespace() !== ns.current) return;
      const current = ref.current!;
      if (mode === 'revise') {
        const revised = validateCourseContent(
          response.content,
          currentSection.source,
        );
        const verification = await verifyCourseQuestions(
          current,
          {
            ...currentSection,
            content: revised,
            revision: currentSection.revision + 1,
          },
          setWorking,
          ns.current,
        );
        setProposal({
          content: revised,
          sectionId: currentSection.id,
          revision: currentSection.revision,
          verification,
        });
      } else {
        const at = new Date().toISOString();
        await update({
          ...current,
          chat: [
            ...current.chat,
            {
              role: 'user' as const,
              text: requestMessage,
              sectionId: currentSection.id,
              at,
            },
            {
              role: 'assistant' as const,
              text: response.reply,
              sectionId: currentSection.id,
              at,
            },
          ].slice(-60),
        });
        setMessage('');
      }
    } catch (e) {
      setError(courseErrorMessage(e));
    } finally {
      lock.current = false;
      setWorking('');
    }
  }
  async function apply() {
    if (!ref.current || !proposal) return;
    const s = ref.current.sections.find((s) => s.id === proposal.sectionId);
    if (!s || s.revision !== proposal.revision) {
      setError('课件版本已经变化，请重新生成修改预览');
      return;
    }
    try {
      const next = replaceCourseSection(ref.current, s.id, proposal.content);
      next.sections = next.sections.map((section) =>
        section.id === s.id
          ? { ...section, verification: proposal.verification }
          : section,
      );
      await update(next);
      await refresh();
      setProposal(null);
      setMessage('');
      notify('修改已应用，原版本已保留');
    } catch {
      setError('修改未保存，请重试。');
    }
  }
  async function undo() {
    if (!ref.current || !section?.history.length) return;
    const old = section.history.at(-1)!;
    try {
      await update({
        ...ref.current,
        sections: ref.current.sections.map((s) =>
          s.id === section.id
            ? {
                ...s,
                content: old.content,
                title: old.content.title,
                revision: s.revision + 1,
                history: s.history.slice(0, -1),
                passed: [],
                interactiveState: undefined,
                completedAt: undefined,
              }
            : s,
        ),
      });
      await refresh();
      notify('已恢复上一版本；理解检验将重新记录。');
    } catch {
      setError('恢复未完成，请重试。');
    }
  }
  if (!course)
    return (
      <section className="panel">
        <h2>正在读取课程</h2>
        <button onClick={() => navigate('subjects')}>返回学科</button>
      </section>
    );
  const checks = section ? courseQuestions(course, section, 'checks') : [];
  const completed = course.sections.filter((s) => s.completedAt).length;
  return (
    <div className="course-room">
      <header className="course-topbar">
        <button className="quiet" onClick={() => void leave()}>
          <ArrowLeft size={16} />
          返回学科
        </button>
        <div>
          <b>{course.title}</b>
          <span>
            {completed} / {course.sections.length} 节已完成
          </span>
        </div>
        <button
          className="quiet"
          aria-label="切换课程目录"
          onClick={() => setNavOpen(!navOpen)}
        >
          {navOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </header>
      {error && (
        <div className="course-error" role="alert">
          {error}
          <button
            onClick={() =>
              void flush()
                .then(() => setError(''))
                .catch(() => {})
            }
          >
            重试保存
          </button>
        </div>
      )}
      <div
        className={'course-workspace ' + (navOpen ? '' : 'directory-collapsed')}
      >
        {navOpen && (
          <aside className="course-directory">
            <p>课程目录</p>
            <label className="course-bookmark-filter">
              <input
                type="checkbox"
                checked={bookmarksOnly}
                onChange={(e) => setBookmarksOnly(e.target.checked)}
              />
              只看书签
            </label>
            {bookmarksOnly && !course.sections.some((s) => s.bookmarked) && (
              <p className="muted">尚未添加书签，可在小节顶部添加。</p>
            )}
            <nav>
              {course.sections.map(
                (s, i) =>
                  (!bookmarksOnly || s.bookmarked) && (
                    <button
                      key={s.id}
                      disabled={!!working}
                      className={i === course.current ? 'active' : ''}
                      onClick={() => select(i)}
                    >
                      <span>
                        {s.completedAt ? (
                          <Check size={14} />
                        ) : (
                          String(i + 1).padStart(2, '0')
                        )}
                      </span>
                      <div>
                        {s.title}
                        {s.bookmarked && <small>已加入书签</small>}
                        <small>
                          {s.completedAt
                            ? '已完成'
                            : s.content
                              ? '可以学习'
                              : '等待编制'}
                        </small>
                      </div>
                    </button>
                  ),
              )}
            </nav>
            <details>
              <summary>
                <FileText size={14} />
                教材与笔记依据
              </summary>
              <p>{course.sourceNames.join('、') || '直接输入的学习资料'}</p>
              <pre>{section?.source}</pre>
            </details>
            {course.status !== 'ready' && (
              <button
                className="secondary"
                disabled={!aiReady || !!working}
                onClick={() => void resume()}
              >
                继续编制剩余课程
              </button>
            )}
            {working && (
              <p className="muted" role="status">
                {working}
              </p>
            )}
          </aside>
        )}
        <main
          className="lesson-article"
          key={section?.id + ':' + section?.revision}
        >
          {!content ? (
            <section className="lesson-wait">
              <BookOpen size={32} />
              <h2>本节课件尚未编制</h2>
              <p>已经完成的课件已保存在本地。继续编制时只处理缺少的章节。</p>
              {section?.error && (
                <p role="alert">{courseErrorMessage(section.error)}</p>
              )}
              <button
                className="primary"
                disabled={!aiReady || !!working}
                onClick={() => void resume()}
              >
                {working || '继续编制课程'}
              </button>
            </section>
          ) : (
            <>
              <CourseStudyTools
                key={section!.id}
                section={section!}
                onSave={async (changes) => {
                  const c = ref.current;
                  if (!c || currentNamespace() !== ns.current)
                    throw new Error('账户已切换，请重新打开课程');
                  await update({
                    ...c,
                    sections: c.sections.map((s) =>
                      s.id === section!.id ? { ...s, ...changes } : s,
                    ),
                  });
                }}
              />
              {content.format !== 'free-html' && (
                <CourseSources content={content} source={section!.source} />
              )}
              {content.html ? (
                <HtmlCourse
                  html={content.html}
                  freeForm={content.format === 'free-html'}
                  title={content.title}
                  checks={checks}
                  passed={section!.passed}
                  state={section!.interactiveState}
                  locked={!!working}
                  onCheck={result}
                  onState={async (state) => {
                    const c = ref.current;
                    if (c)
                      await update({
                        ...c,
                        sections: c.sections.map((s) =>
                          s.id === section!.id
                            ? { ...s, interactiveState: state }
                            : s,
                        ),
                      });
                  }}
                  onPractice={complete}
                  onAsk={(text) => {
                    setSelection(text);
                    setChatOpen(true);
                  }}
                />
              ) : (
                <>
                  <button
                    className="quiet"
                    disabled={!!working || !aiReady}
                    onClick={() => {
                      setChatOpen(true);
                      void send(
                        'revise',
                        '将此课件升级为自由布局的互动 HTML 教件。根据知识特点设计可操作的演示和解释动画，保留全部教材内容与练习衔接。',
                      );
                    }}
                  >
                    升级为互动课件
                  </button>
                  <div className="lesson-heading">
                    <p className="eyebrow">
                      LESSON {String(course.current + 1).padStart(2, '0')} ·
                      课程复习
                    </p>
                    <h1>
                      <MathText>{content.title}</MathText>
                    </h1>
                    <div className="lesson-objectives">
                      <b>学习目标</b>
                      <ul>
                        {content.objectives.map((o, i) => (
                          <li key={i}>
                            <MathText>{o}</MathText>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {content.uncertainties.length > 0 && (
                    <details className="lesson-source-gap">
                      <summary>需要核对的教材信息</summary>
                      {content.uncertainties.map((s, i) => (
                        <p key={i}>
                          <MathText>{s}</MathText>
                        </p>
                      ))}
                    </details>
                  )}
                  {content.concepts.map((concept, i) => (
                    <section className="lesson-concept" key={i}>
                      <div className="lesson-section-heading">
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <h2>
                          <MathText>{concept.title}</MathText>
                        </h2>
                      </div>
                      <div className="lesson-prose">
                        <MathText>{concept.explanation}</MathText>
                      </div>
                      <div className="lesson-why">
                        <b>理解其原理</b>
                        <p>
                          <MathText>{concept.why}</MathText>
                        </p>
                      </div>
                      <div className="lesson-example">
                        <p className="eyebrow">WORKED EXAMPLE</p>
                        <h3>
                          <MathText>{concept.example.prompt}</MathText>
                        </h3>
                        <details>
                          <summary>展开完整分析过程</summary>
                          <ol>
                            {concept.example.steps.map((s, j) => (
                              <li key={j}>
                                <MathText>{s}</MathText>
                              </li>
                            ))}
                          </ol>
                          <p className="lesson-conclusion">
                            <b>结论</b>
                            <MathText>{concept.example.answer}</MathText>
                          </p>
                        </details>
                      </div>
                      <details className="lesson-misconception">
                        <summary>
                          辨析易错理解：
                          <MathText>{concept.misconception}</MathText>
                        </summary>
                        <p>
                          <MathText>{concept.correction}</MathText>
                        </p>
                      </details>
                      {checks[i] && (
                        <Checkpoint
                          key={checks[i].id}
                          q={checks[i]}
                          passed={section!.passed.includes(checks[i].id)}
                          locked={!!working}
                          onResult={result}
                        />
                      )}
                    </section>
                  ))}
                  <section className="lesson-comparison">
                    <h2>
                      <MathText>{content.comparison.title}</MathText>
                    </h2>
                    <div className="course-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {content.comparison.columns.map((c, i) => (
                              <th key={i}>
                                <MathText>{c}</MathText>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {content.comparison.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((c, j) => (
                                <td key={j}>
                                  <MathText>{c}</MathText>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <ProcessExplorer content={content} />
                  {checks.slice(content.concepts.length).map((q) => (
                    <Checkpoint
                      key={q.id}
                      q={q}
                      passed={section!.passed.includes(q.id)}
                      locked={!!working}
                      onResult={result}
                    />
                  ))}
                  <section className="lesson-recall">
                    <p className="eyebrow">RETRIEVAL</p>
                    <h2>闭卷回顾</h2>
                    <p className="muted">
                      暂时离开讲解，尝试完整说明以下问题。需要时可以返回相关段落，或在课程答疑中请求进一步解释。
                    </p>
                    <ol>
                      {content.recall.map((r, i) => (
                        <li key={i}>
                          <MathText>{r}</MathText>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <details className="lesson-evidence">
                    <summary>本节教材依据与版本</summary>
                    {content.sourceQuotes.map((q, i) => (
                      <blockquote key={i}>
                        <MathText>{q}</MathText>
                      </blockquote>
                    ))}
                    <p>
                      第 {section!.revision} 版 · 原始资料与历史作答均保留。
                    </p>
                    {section!.history.length > 0 && (
                      <button
                        className="secondary"
                        disabled={!!working}
                        onClick={() => void undo()}
                      >
                        <RotateCcw size={15} />
                        恢复上一版本
                      </button>
                    )}
                  </details>
                </>
              )}
              <footer className="lesson-footer">
                <div>
                  {content.format === 'free-html' ? (
                    <b>完成互动学习后，进入巩固练习</b>
                  ) : (
                    <b>
                      {
                        checks.filter((q) => section!.passed.includes(q.id))
                          .length
                      }{' '}
                      / {checks.length} 项理解检验已通过
                    </b>
                  )}
                  <p>完成本节后继续下一节；课程结束后进入巩固练习。</p>
                </div>
                <button
                  className="primary"
                  disabled={
                    !!working ||
                    checks.some((q) => !section!.passed.includes(q.id))
                  }
                  onClick={() => void complete()}
                >
                  {course.current === course.sections.length - 1
                    ? '完成课程并练习'
                    : '完成本节并继续'}
                  <ArrowRight size={16} />
                </button>
              </footer>
            </>
          )}
        </main>
      </div>
      <button className="course-chat-launcher" onClick={ask}>
        <MessageSquare size={20} />
        <span>课程答疑</span>
      </button>
      {chatOpen && (
        <aside className="course-chat" aria-label="课程答疑">
          <header>
            <div>
              <b>课程答疑</b>
              <span>{content?.title ?? section?.title}</span>
            </div>
            <button
              aria-label="关闭课程答疑"
              onClick={() => setChatOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="course-chat-messages">
            {selection && (
              <div className="course-chat-selection">
                <b>选中的内容</b>
                <p>
                  <MathText>{selection}</MathText>
                </p>
                <button onClick={() => setSelection('')}>取消引用</button>
              </div>
            )}
            {!course.chat.some((m) => m.sectionId === section?.id) && (
              <p className="muted">
                可以引用页面中的一段内容，要求解释原理、补充例题或调整当前课件。修改将先显示预览。
              </p>
            )}
            {course.chat
              .filter((m) => m.sectionId === section?.id)
              .map((m, i) => (
                <article key={i} className={m.role}>
                  <small>{m.role === 'user' ? '提问' : '解释'}</small>
                  <p>
                    <MathText>{m.text}</MathText>
                  </p>
                  {m.role === 'assistant' && (
                    <button
                      className="quiet"
                      onClick={() =>
                        void put('note', {
                          id: crypto.randomUUID(),
                          nodeId: 'lesson-node:' + section?.id,
                          subject: course.subject,
                          title: '课程答疑 · ' + section?.title,
                          body: m.text,
                          updatedAt: new Date().toISOString(),
                        }).then(() => {
                          notify('答疑内容已加入学科笔记');
                          return refresh();
                        })
                      }
                    >
                      保存至笔记
                    </button>
                  )}
                </article>
              ))}
            {proposal && (
              <section className="course-edit-preview">
                <b>课件修改预览</b>
                <h3>{proposal.content.title}</h3>
                <ul>
                  {proposal.content.objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                {proposal.content.html && (
                  <HtmlCourse
                    html={proposal.content.html}
                    freeForm={proposal.content.format === 'free-html'}
                    title="修改预览"
                    checks={courseQuestions(
                      course,
                      {
                        ...section!,
                        content: proposal.content,
                        revision: proposal.revision + 1,
                      },
                      'checks',
                    )}
                    passed={[]}
                    preview
                    onCheck={async () => {}}
                    onState={async () => {}}
                    onPractice={async () => {}}
                    onAsk={(text) => setSelection(text)}
                  />
                )}
                {proposal.content.concepts.map((c, i) => (
                  <details key={i}>
                    <summary>{c.title}</summary>
                    <p>
                      <MathText>{c.explanation}</MathText>
                    </p>
                  </details>
                ))}
                <p className="muted">
                  应用后保留上一版本，并重新开放本节理解检验。此前的学习记录不变。
                </p>
                <div className="button-row">
                  <button className="primary" onClick={() => void apply()}>
                    应用修改
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setProposal(null)}
                  >
                    取消
                  </button>
                </div>
              </section>
            )}
            {working && (
              <p className="muted" role="status">
                {working}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send('chat');
            }}
          >
            <textarea
              aria-label="课程答疑问题"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2500}
              rows={3}
              placeholder="说明需要解释或修改的内容"
            />
            <div>
              <button
                type="button"
                className="quiet"
                disabled={!message.trim() || !!working || !content || !aiReady}
                onClick={() => void send('revise')}
              >
                修改当前课件
              </button>
              <button
                type="submit"
                className="primary"
                disabled={!message.trim() || !!working || !content || !aiReady}
              >
                <Send size={15} />
                发送
              </button>
            </div>
          </form>
        </aside>
      )}
    </div>
  );
}
