'use client';
import {useTranslation} from 'react-i18next';
import {ProductLocale} from '@/components/product-locale';
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
  ShoppingBag,
  Armchair,
} from 'lucide-react';
import { ReviewContext } from '@/components/review-context';
import AssessmentRoom from '@/components/assessment-room';
import ExamRoom from '@/components/exam-room';
import CourseRoom from '@/components/course-room';
import RemediationCourse from '@/components/remediation-course';
import HomeView from '@/components/home-view';
import StudyView from '@/components/study-view';
import YouView from '@/components/you-view';
import ProductInsights from '@/components/product-insights';
import { trackProductEvent } from '@/lib/product-insights';
import WatchDevices from '@/components/watch-devices';
import WorkshopExperience from '@/components/workshop-experience';
import ProductShell, { ProductHome } from '@/components/product-shell';
import {
  ProductSubjects,
  ProductResults,
  ProductShop,
} from '@/components/product-workspaces';
import OnboardingView from '@/components/onboarding-view';
import StudyPlanView from '@/components/study-plan-view';
import RewardsView, {
  RewardsBridge,
  SuperPromo,
} from '@/components/rewards-view';
import ChestView from '@/components/chest-view';
import { assetPath } from '@/lib/runtime';
import { parseWorkspaceRoute, workspaceHash } from '@/lib/workspace-route';
import { sessionForView } from '@/lib/session-view';
import { SUBJECTS, uid, type StudyData, type QueueItem } from '@/lib/model';

import { generateVerified } from '@/lib/ai-client';
import { flowDifficulty } from '@/lib/learning-intelligence';
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
  nodes: [],
  questions: [],
  events: [],
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { dailyMinutes: 20, name: '我的学习空间', surprise: true },
};
export default function Workspace() {
  useTranslation();
  useEffect(() => {
    if (!localStorage.getItem('review-playful-intro-v1')) {
      localStorage.setItem('review-visual-theme', 'playful');
      localStorage.setItem('review-playful-intro-v1', '1');
    }
    document.documentElement.dataset.reviewTheme =
      localStorage.getItem('review-visual-theme') || 'playful';
    const font = new FontFace(
      'Review Duo',
      `url("${assetPath('det-player/assets/fonts/DuolingoSansVF.woff2')}")`,
    );
    void font
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => {});
  }, []);
  const [data, setData] = useState<StudyData>(base),
    [page, setPage] = useState('home'),
    [subject, setSubject] = useState('all'),
    [section, setSection] = useState(''),
    [cloudUser, setCloudUser] = useState<any>(null),
    [aiReady, setAiReady] = useState(false),
    [pending, setPending] = useState(0),
    [syncing, setSyncing] = useState(false),
    [message, setMessage] = useState(''),
    [ready, setReady] = useState(false),
    [identityReady, setIdentityReady] = useState(false),
    [online, setOnline] = useState(true),
    [session, setSession] = useState<{
      id: string;
      items: QueueItem[];
      mode: 'review' | 'test';
      title: string;
    } | null>(null);
  const [preparing, setPreparing] = useState('');
  const sessionNamespace = useRef(currentNamespace());
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
              flowDifficulty(snapshot, t.n.id, t.sk.id, t.state.mastery)
                .difficulty,
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
  const [syncStatus,setSyncStatus]=useState<{account:string|null;lastSyncAt?:string;error?:string}>({account:null});
  useEffect(()=>{setSyncStatus({account:cloudUser?.id??null});},[cloudUser?.id]);
  const sync = useCallback(async () => {
    const syncNamespace=currentNamespace();
    setSyncing(true);
    try {
      if(syncNamespace==='local')throw new Error('请先登录学习账户');
      if(!navigator.onLine)throw new Error('当前离线，联网后可同步');
      await syncCloud();
      if(syncNamespace!==currentNamespace())return false;
      await refresh();
      if(syncNamespace!==currentNamespace())return false;
      setSyncStatus({account:syncNamespace,lastSyncAt:new Date().toISOString()});
      return true;
    } catch (e) {
      if(syncNamespace===currentNamespace())setSyncStatus({account:syncNamespace,error:e instanceof Error?e.message:'同步未完成'});
      notify(e instanceof Error ? e.message : '云端暂时不可用，本地学习正常');
      return false;
    } finally {
      setSyncing(false);
    }
  }, [notify, refresh]);
  const navigate = useCallback((p: string, s = 'all', view = '') => {
    setPage(p);
    setSubject(s);
    setSection(view);
    const next = workspaceHash({ page: p, subject: s, section: view });
    if (location.hash !== next)
      history.pushState({ ...history.state, reviewRoute: next }, '', next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  useEffect(() => {
    if (
      ready &&
      identityReady &&
      page === 'home' &&
      !data.settings.assistant?.onboardedAt &&
      !data.events.length
    )
      navigate('onboarding');
  }, [
    ready,
    identityReady,
    page,
    data.settings.assistant?.onboardedAt,
    data.events.length,
    navigate,
  ]);
  const start = useCallback(
    (
      items: QueueItem[],
      mode: 'review' | 'test' = 'review',
      title = '模拟测试',
      recommendation?: {
        trace: import('@/lib/study-utility').DecisionTrace;
        actionId: string;
      },
    ) => {
      items = items.filter((x) => x.question.reviewStatus !== 'paused');
      if (!items.length) {
        notify('当前没有可用题目，请选择其他范围或导入内容');
        return;
      }
      const next = {
        id: uid(),
        items,
        mode,
        title,
        ...(recommendation
          ? {
              recommendationId: recommendation.trace.id,
              recommendationActionId: recommendation.actionId,
            }
          : {}),
      };
      const sessionNamespace = currentNamespace();
      void put(
        'job',
        {
          ...next,
          kind: 'session',
          status: 'active',
          createdAt: new Date().toISOString(),
        },
        'active-session',
        false,
        sessionNamespace,
      )
        .then(() => {
          if (sessionNamespace !== currentNamespace()) return;
          if (recommendation)
            void import('@/lib/study-trace-client')
              .then((m) =>
                m.recordRecommendationOutcome(
                  recommendation.trace,
                  recommendation.actionId,
                  'started',
                  next.id,
                  sessionNamespace,
                ),
              )
              .catch(() => {});
          setSession(next);
          if (mode === 'review') trackProductEvent('study_start', 'study');
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
        } catch {
        } finally {
          if (alive) setIdentityReady(true);
        }
      } catch {
        notify('无法打开本地数据库，请检查浏览器存储权限');
      }
    })();
    const updateNetwork = () => setOnline(navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    const onHash = () => {
      const route = parseWorkspaceRoute(location.hash);
      setPage(route.page);
      setSubject(route.subject);
      setSection(route.section);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    if ('serviceWorker' in navigator && location.hostname !== 'localhost')
      navigator.serviceWorker.register(assetPath('sw.js')).catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [notify]);
  useEffect(() => {
    if (!ready) return;
    const sameAccount = sessionNamespace.current === currentNamespace();
    sessionNamespace.current = currentNamespace();
    setSession((current) =>
      sessionForView(data.jobs, current, sameAccount && page === 'study'),
    );
  }, [ready, cloudUser?.id, data.jobs]);
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
        section,
        cloudUser,
        setCloudUser,
        aiReady,
        sync,
        pending,
        syncing,
        syncStatus,
        prepare,
        preparing,
      }}
    >
      <ProductLocale locale={data.settings.locale} ready={ready}/>
      {ready && <ProductInsights page={page} />}
      {ready && <RewardsBridge />}
      {ready &&
      [
        'home',
        'devices',
        'plan',
        'subjects',
        'library',
        'results',
        'analytics',
        'workshop',
        'forge',
        'enchant',
        'equipment',
        'shop',
        'redeem',
        'super',
        'admin',
        'you',
        'study',
        'chest',
      ].includes(page) ? (
        <ProductShell key={currentNamespace()} page={page}>
          {page === 'home' ? (
            <ProductHome />
          ) : page === 'plan' ? (
            <StudyPlanView key={currentNamespace()} />
          ) : page === 'study' ? (
            session?.mode === 'test' ? (
              <AssessmentRoom
                key={session.id + currentNamespace()}
                session={session}
                finish={() => {
                  if (
                    data.jobs?.some(
                      (j) =>
                        j.kind === 'session' &&
                        j.id === session.id &&
                        j.status === 'complete',
                    )
                  )
                    setSession(null);
                  navigate('plan');
                }}
              />
            ) : (
              <div className="alpha-workspace">
                <StudyView
                  session={session}
                  finish={() => {
                    if (
                      session &&
                      data.jobs?.some(
                        (j) =>
                          j.kind === 'session' &&
                          j.id === session.id &&
                          j.status === 'complete',
                      )
                    )
                      setSession(null);
                    navigate('home');
                  }}
                />
              </div>
            )
          ) : page === 'chest' ? (
            <ChestView key={subject + currentNamespace()} sessionId={subject} />
          ) : page === 'subjects' || page === 'library' ? (
            <ProductSubjects
              key={page + subject}
              initialView={page === 'library' ? 'materials' : 'subjects'}
            />
          ) : page === 'results' || page === 'analytics' ? (
            <ProductResults
              initialView={page === 'analytics' ? 'analysis' : 'scores'}
            />
          ) : page === 'devices' ? (
            <div className="alpha-workspace"><WatchDevices key={currentNamespace()}/></div>
          ) : page === 'you' ? (
            <div className="alpha-workspace">
              <YouView />
            </div>
          ) : ['shop', 'redeem', 'super', 'admin'].includes(page) ? (
            <div className="alpha-workspace">
              <nav className="alpha-secondary" aria-label="工坊功能">
                {[
                  ['forge', '铁匠铺'],
                  ['enchant', '附魔师与图鉴'],
                  ['equipment', '装备与搭配'],
                  ['shop', '材料与商店'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={page === id ? 'page' : undefined}
                    onClick={() => navigate(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {page === 'shop' ? (
                <ProductShop />
              ) : (
                <RewardsView
                  key={page + currentNamespace()}
                  mode={page as 'redeem' | 'admin' | 'super'}
                />
              )}
            </div>
          ) : (
            <WorkshopExperience page={page} selection={subject} />
          )}
        </ProductShell>
      ) : page === 'course' && ready ? <CourseRoom key={subject+currentNamespace()} courseId={subject}/> : page === 'remedy' && ready ? <RemediationCourse key={subject+currentNamespace()} courseId={subject}/> : page === 'onboarding' && ready ? <OnboardingView key={currentNamespace()}/> : page === 'exam' && ready ? <ExamRoom key={subject+currentNamespace()} runId={subject}/> : page === 'assessment' && ready ? (()=>{const draft=data.jobs?.find(j=>j.id===subject&&j.kind==='assessment');return draft?.session?<AssessmentRoom key={subject+currentNamespace()} session={draft.session} finish={()=>navigate('results')}/>:<div role="status">此测试尚未同步完整<button onClick={()=>void sync()}>同步后重试</button></div>})() : <div role="status">正在读取学习记录…</div>}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="关闭通知" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </ReviewContext.Provider>
  );
}
