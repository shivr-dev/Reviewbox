'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Home,
  Layers3,
  Library,
  UserRound,
  BarChart3,
  Search,
  X,
  Check,
  RefreshCw,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { ReviewContext } from '@/components/review-context';
import AssessmentRoom from '@/components/assessment-room';
import ExamRoom from '@/components/exam-room';
import CourseRoom from '@/components/course-room';
import HomeView from '@/components/home-view';
import StudyView from '@/components/study-view';
import SubjectsView from '@/components/subjects-view';
import LibraryView from '@/components/library-view';
import YouView from '@/components/you-view';
import { assetPath } from '@/lib/runtime';
import AnalyticsView from '@/components/analytics-view';
import { SUBJECTS, uid, type StudyData, type QueueItem } from '@/lib/model';
import { seedNodes, seedQuestions } from '@/lib/seed';
import { generateVerified } from '@/lib/ai-client';
import { computeMastery, buildQueue, priority, initial } from '@/lib/engine';
import {
  restoreNamespace,
  loadData,
  account,
  syncCloud,
  pendingCount,
  switchAccount,
  put,
  currentNamespace,
} from '@/lib/store';
const base: StudyData = {
  nodes: seedNodes,
  questions: [],
  events: [],
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { dailyMinutes: 20, name: '我的学习空间', surprise: true },
};
const navigation = [
  { id: 'home', label: '今天', Icon: Home },
  { id: 'study', label: '复习', Icon: BookOpen },
  { id: 'subjects', label: '学科', Icon: Layers3 },
  { id: 'library', label: '资料库', Icon: Library },
  { id: 'you', label: '我的', Icon: UserRound },
];
function CloseMobileNavigation({
  page,
  subject,
}: {
  page: string;
  subject: string;
}) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => setOpenMobile(false), [page, subject, setOpenMobile]);
  return null;
}
export default function Workspace() {
  useEffect(() => {
    document.documentElement.dataset.reviewTheme = localStorage.getItem('review-visual-theme') || 'editorial';
  }, []);
  const [data, setData] = useState<StudyData>(base),
    [page, setPage] = useState('home'),
    [subject, setSubject] = useState('all'),
    [cloudUser, setCloudUser] = useState<any>(null),
    [aiReady, setAiReady] = useState(false),
    [pending, setPending] = useState(0),
    [syncing, setSyncing] = useState(false),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(true),
    [session, setSession] = useState<{
      id: string;
      items: QueueItem[];
      mode: 'review' | 'test';
      title: string;
    } | null>(null);
  const [preparing, setPreparing] = useState('');
  const prepareLock = useRef(false);
  const prepare = useCallback(async () => {
    if (prepareLock.current) return;
    prepareLock.current = true;
    try {
      const snapshot = await loadData();
      const sm = computeMastery(snapshot.nodes, snapshot.events);
      const namespaceAtStart = currentNamespace();
      const now = Date.now();
      const ranked = snapshot.nodes
        .flatMap((n) =>
          n.skills.map((sk) => {
            const state = sm[n.id + '::' + sk.id] ?? initial(n.id, sk.id);
            return {
              n,
              sk,
              state,
              rank: priority(n, state, snapshot.events, snapshot.exams, now),
            };
          }),
        )
        .filter(
          (t) =>
            !(
              t.state.mastery >= 0.9 &&
              t.state.nextReview &&
              Date.parse(t.state.nextReview) > now
            ),
        )
        .sort((a, b) => b.rank - a.rank);
      const candidates = SUBJECTS.map((s) =>
        ranked.find((t) => t.n.subject === s.id),
      ).filter(Boolean);
      let cursor = 0,
        completed = 0,
        failed = 0;
      const worker = async () => {
        while (cursor < candidates.length) {
          if (currentNamespace() !== namespaceAtStart)
            throw new Error('账户已切换，已暂停准备新题');
          const t = candidates[cursor++]!;
          setPreparing(
            '正在准备今日练习 · ' + completed + '/' + candidates.length,
          );
          try {
            await generateVerified(
              t.n,
              t.sk,
              t.state.mastery < 0.5 ? 2 : 3,
              t.n.subject === 'ce' ? 'SAT' : '自适应复习',
              snapshot.events
                .filter(
                  (e) =>
                    e.nodeId === t.n.id &&
                    e.skillId === t.sk.id &&
                    e.score < 0.6,
                )
                .slice(-4)
                .map(
                  (e) =>
                    snapshot.questions.find((q) => q.id === e.questionId)
                      ?.prompt ?? '',
                ),
              () => {},
            );
          } catch {
            failed++;
          }
          completed++;
          if (currentNamespace() === namespaceAtStart)
            setData(await loadData());
        }
      };
      await Promise.all([worker(), worker()]);
      if (failed)
        setMessage(
          '已完成 ' +
            (completed - failed) +
            ' 道练习，其余题目可在学科中心继续准备',
        );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : '题目准备暂未完成，可在学科练习中继续',
      );
    } finally {
      setPreparing('');
      prepareLock.current = false;
    }
  }, []);
  function safename(id: string) {
    return SUBJECTS.find((s) => s.id === id)?.name ?? id;
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((msg: string) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 8000);
  }, []);
  const refresh = useCallback(async () => {
    setData(await loadData());
    setPending(await pendingCount());
  }, []);
  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncCloud();
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '云端暂时不可用，本地学习正常');
    } finally {
      setSyncing(false);
    }
  }, [notify, refresh]);
  const navigate = useCallback((p: string, s = 'all') => {
    setPage(p);
    setSubject(s);
    history.replaceState(null, '', '#' + p + (s !== 'all' ? '/' + s : ''));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  const start = useCallback(
    (
      items: QueueItem[],
      mode: 'review' | 'test' = 'review',
      title = '模拟测试',
    ) => {
      if (!items.length) {
        notify('当前没有可用题目，请选择其他范围或导入内容');
        return;
      }
      const next = { id: uid(), items, mode, title };
      void put(
        'job',
        {
          ...next,
          kind: 'session',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
        'active-session',
      )
        .then(() => {
          setSession(next);
          navigate('study');
        })
        .catch(() => notify('未能保存复习进度，请检查设备存储'));
    },
    [navigate, notify],
  );
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        let d = await restoreNamespace();
        if (alive) {
          setData(d);
          setReady(true);
        }
        try {
          const v = await account();
          if (alive) {
            d = await switchAccount(v.user?.id ?? null);
            if (alive) {
              setData(d);
              setCloudUser(v.user);
              setAiReady(v.aiReady);
            }
          }
        } catch {}
      } catch {
        notify('无法打开本地数据库，请检查浏览器存储权限');
      }
    })();
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    const onHash = () => {
      const [p, s] = location.hash.slice(1).split('/');
      if (
        [
          ...navigation.map((x) => x.id),
          'analytics',
          'exam',
          'assessment',
          'course',
        ].includes(p)
      ) {
        setPage(p);
        setSubject(
          p === 'exam' || p === 'assessment' || p === 'course'
            ? s
            : SUBJECTS.some((x) => x.id === s)
              ? s
              : 'all',
        );
      }
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    if ('serviceWorker' in navigator && location.hostname !== 'localhost')
      navigator.serviceWorker.register(assetPath('sw.js')).catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('hashchange', onHash);
    };
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    const active = data.jobs
      ?.filter(
        (j) =>
          j.kind === 'session' &&
          j.status === 'active' &&
          Array.isArray(j.items),
      )
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
    if (active) setSession(active);
    else setSession(null);
  }, [ready, cloudUser?.id]);
  useEffect(() => {
    if (!ready || !cloudUser || !online) return;
    void sync();
    const id = setInterval(() => void sync(), 60000);
    return () => clearInterval(id);
  }, [ready, cloudUser?.id, online, sync]);
  const states = useMemo(
    () => computeMastery(data.nodes, data.events),
    [data.nodes, data.events],
  );
  const queue = useMemo(() => buildQueue(data), [data]);
  const stateRef = useRef({ data, start, navigate });
  stateRef.current = { data, start, navigate };
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    const register = (tool: any) =>
      Promise.resolve(
        ctx.registerTool(tool, { signal: controller.signal }),
      ).catch(() => {});
    void register({
      name: 'get_review_plan',
      title: '查看今日复习计划',
      description:
        'Read the current daily review plan and weak skill targets without changing records.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: any) {
        if (!input || Object.keys(input).length)
          throw new Error('No input fields expected');
        return {
          plan: buildQueue(stateRef.current.data).map((x) => ({
            questionId: x.question.id,
            nodeId: x.question.nodeId,
            skillId: x.question.skillId,
            reason: x.reason,
          })),
        };
      },
    });
    void register({
      name: 'start_review_session',
      title: '开始复习',
      description:
        'Start a visible review session from the daily plan. This does not submit answers or modify mastery.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string', enum: SUBJECTS.map((s) => s.id) },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: any) {
        if (
          !input ||
          Object.keys(input).some((k) => k !== 'subject') ||
          (input.subject && !SUBJECTS.some((s) => s.id === input.subject))
        )
          throw new Error('Invalid subject');
        const items = buildQueue(stateRef.current.data, {
          subject: input.subject,
        });
        if (!items.length) throw new Error('No questions due');
        stateRef.current.start(items);
        return { started: true, questionCount: items.length };
      },
    });
    return () => controller.abort();
  }, []);
  return (
    <ReviewContext.Provider
      value={{
        data,
        states,
        refresh,
        navigate,
        start,
        notify,
        subject,
        cloudUser,
        setCloudUser,
        aiReady,
        sync,
        pending,
        syncing,
        prepare,
        preparing,
      }}
    >
      {page === 'exam' && ready ? (
        <ExamRoom key={subject + currentNamespace()} runId={subject} />
      ) : (
        <SidebarProvider
          style={{ '--sidebar-width': '228px' } as React.CSSProperties}
        >
          <CloseMobileNavigation page={page} subject={subject} />
          <Sidebar>
            <SidebarHeader>
              <button
                className="brand"
                onClick={() => navigate('home')}
                aria-label="Review 首页"
              >
                <span className="brand-mark">
                  <Layers3 size={21} />
                </span>
                review<span className="brand-dot">.</span>
              </button>
            </SidebarHeader>
            <SidebarContent>
              <p className="nav-label">学习工作台</p>
              <nav>
                {navigation.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    className={'nav-item ' + (page === id ? 'selected' : '')}
                    onClick={() => navigate(id)}
                  >
                    <Icon size={18} />
                    {label}
                    {id === 'home' && queue.length > 0 && (
                      <span className="nav-count">{queue.length}</span>
                    )}
                  </button>
                ))}
              </nav>
              <p className="nav-label">我的学科</p>
              {SUBJECTS.map((s, i) => (
                <button
                  className={
                    'subject-nav ' +
                    (subject === s.id && page === 'subjects' ? 'active' : '')
                  }
                  key={s.id}
                  onClick={() => navigate('subjects', s.id)}
                >
                  <span className={'subject-dot s' + i} />
                  {s.name}
                </button>
              ))}
              <div className="sidebar-spacer" />
              <button
                className={
                  'nav-item ' + (page === 'analytics' ? 'selected' : '')
                }
                onClick={() => navigate('analytics')}
              >
                <BarChart3 size={18} />
                学习分析
              </button>
            </SidebarContent>
            <SidebarFooter>
              <div className="local-indicator">
                <span />
                {!online
                  ? '离线学习，自动保存'
                  : syncing
                    ? '正在同步学习记录'
                    : cloudUser
                      ? pending
                        ? '有记录等待同步'
                        : '已同步到云端'
                      : '学习数据保存在本地'}
              </div>
              <button className="profile" onClick={() => navigate('you')}>
                <span className="avatar">{data.settings.name.slice(0, 1)}</span>
                <div>
                  {data.settings.name}
                  <small>个人学习档案</small>
                </div>
              </button>
            </SidebarFooter>
          </Sidebar>
          <main className="workspace">
            <header className="topbar">
              <div>
                <SidebarTrigger
                  aria-label="收起或展开侧边栏"
                  title="收起 / 展开侧边栏"
                />
                <span>学习工作台</span>
                <span className="slash">/</span>
                <b>
                  {page === 'analytics'
                    ? '学习分析'
                    : navigation.find((n) => n.id === page)?.label}
                </b>
                {page === 'subjects' && subject !== 'all' && (
                  <>
                    <span className="slash">/</span>
                    <b>{SUBJECTS.find((s) => s.id === subject)?.name}</b>
                  </>
                )}
              </div>
              <span className="muted">自主学习 · 持续复习</span>
            </header>
            <div
              className={
                'page ' + (page === 'study' && session ? 'study-page' : '')
              }
            >
              {!ready && (
                <div className="storage-loading">正在读取本地学习数据…</div>
              )}
              {page === 'home' && <HomeView />}
              {page === 'course' && ready && (
                <CourseRoom
                  key={subject + currentNamespace()}
                  courseId={subject}
                />
              )}
              {page === 'assessment' &&
                ready &&
                (() => {
                  const draft = data.jobs?.find(
                    (j) => j.id === subject && j.kind === 'assessment',
                  );
                  return draft?.session ? (
                    <AssessmentRoom
                      key={subject + currentNamespace()}
                      session={draft.session}
                      finish={() =>
                        navigate(
                          'subjects',
                          draft.session.items[0]?.question.subject ?? 'all',
                        )
                      }
                    />
                  ) : (
                    <div className="panel">
                      <h2>此测试尚未同步完整</h2>
                      <button className="secondary" onClick={() => void sync()}>
                        同步后重试
                      </button>
                    </div>
                  );
                })()}
              {page === 'study' && session?.mode === 'test' && (
                <AssessmentRoom
                  key={session.id + currentNamespace()}
                  session={session}
                  finish={() => {
                    if (
                      data.events.filter((e) => e.sessionId === session.id)
                        .length >= session.items.length
                    )
                      setSession(null);
                    navigate('home');
                  }}
                />
              )}
              {page === 'study' && session?.mode !== 'test' && (
                <StudyView
                  session={session}
                  finish={() => {
                    if (
                      session &&
                      data.events.filter((e) => e.sessionId === session.id)
                        .length >= session.items.length
                    )
                      setSession(null);
                    navigate('home');
                  }}
                />
              )}
              {page === 'subjects' && <SubjectsView key={subject} />}{' '}
              {page === 'library' && <LibraryView />}
              {page === 'you' && <YouView />}
              {page === 'analytics' && <AnalyticsView />}
            </div>
          </main>
          {message && (
            <div className="toast" role="status">
              <span>{message}</span>
              <button aria-label="关闭通知" onClick={() => setMessage('')}>
                <X size={16} />
              </button>
            </div>
          )}
        </SidebarProvider>
      )}
    </ReviewContext.Provider>
  );
}
