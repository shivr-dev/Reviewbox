'use client';

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Compass,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { tr } from '@/lib/i18n';
import { localDay, SUBJECTS, uid, type Subject } from '@/lib/model';
import {
  CHECK_IN_GOALS,
  STUDY_MODES,
  checkInWeights,
  learningProfile,
  recommendStudyMode,
  type CheckInDraft,
  type LearningProfile,
} from '@/lib/learning-check-in';
import { saveLearningCheckIn } from '@/lib/learning-check-in-client';
import { validateExamDetails } from '@/lib/exam-schedule';
import { hasAcceptedAgreement } from '@/lib/product-agreement';
import { collectionEnabled, trackProductEvent } from '@/lib/product-insights';
import { currentNamespace } from '@/lib/store';
import { dailyStudyPlan } from '@/lib/study-assistant';
import { buildQueue } from '@/lib/engine';
import { useReview } from './review-context';
import ExamScopePicker from './exam-scope-picker';
import OnboardingAccount from './onboarding-account';
import { UsageAgreement } from './usage-agreement';
import { Penguin } from './learning-game';
import SubjectIcon from './subject-icon';
import { CheckInOptions } from './check-in-options';
import {
  OnboardingWelcome,
  OnboardingDemo,
  OnboardingSymbols,
  OnboardingImport,
  OnboardingDiagnostic,
  OnboardingBeta,
} from './onboarding-sections';

const t = (key: string, values?: Record<string, unknown>) =>
  tr('dashboard:checkin.' + key, values);
type Step = CheckInDraft['step'];
const introSteps = ['welcome', 'demo', 'symbols'] as const;
const coreSteps = [
  'profile',
  'routine',
  'rhythm',
  'method',
  'mode-adjust',
  'mode-result',
  'review-format',
  'navi-help',
  'subjects',
  'weights',
] as const;
const fieldTitles: Partial<Record<Step, [string, string?]>> = {
  demo: ['planner:先回忆，再核对', 'planner:先想一想，再看答案。'],
  symbols: ['planner:认识几个标志', 'planner:这些标志会陪你一起学习。'],
  routine: ['planner:每天留多少时间？', 'planner:选择每天能坚持的时间。'],
  rhythm: ['dashboard:checkin.step.routine'],
  subjects: ['dashboard:checkin.subjects'],
  weights: ['planner:最重视哪几科？', 'planner:拖动调整，右侧是计划占比。'],
  method: ['dashboard:checkin.scenario.start'],
  'mode-adjust': ['dashboard:checkin.scenario.adjust'],
  'mode-result': [
    'dashboard:checkin.scenario.result',
    'dashboard:checkin.scenario.resultHint',
  ],
  'review-format': ['dashboard:checkin.scenario.review'],
  'navi-help': ['dashboard:checkin.scenario.help'],
  goals: ['dashboard:checkin.step.goals'],
  gpa: ['dashboard:checkin.schoolGrading'],
  materials: ['planner:导入你的学习内容', 'planner:添加教材、笔记或题目。'],
  diagnostic: [
    'planner:建立你的能力起点',
    'planner:用少量题目，找到你的起点。',
  ],
  agreement: [
    'settings:使用协议与隐私说明',
    'settings:了解版权和数据使用，你可以关闭可选统计。',
  ],
  account: [
    'settings:连接你的学习账户',
    'settings:连接账户不是必选项，你也可以稍后再登录。',
  ],
};
type SaveAction =
  | 'complete'
  | 'diagnostic'
  | 'discover'
  | 'gpa'
  | 'feedback'
  | 'skip';
const toggle = <T,>(values: T[], value: T) =>
  values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];

export default function LearningCheckInView({
  editing = false,
}: {
  editing?: boolean;
}) {
  useTranslation();
  const { data, cloudUser, navigate, refresh, start } = useReview();
  const [draft, setDraft] = useState<CheckInDraft>(
    () =>
      data.settings.learningCheckIn ?? {
        step: editing ? 'profile' : 'welcome',
        profile: learningProfile(data),
        examKey: 'check-in-exam:' + uid(),
      },
  );
  const [busy, setBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const entered = useRef(false);
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);
  const [sharing, setSharing] = useState(() =>
    collectionEnabled(currentNamespace(), data.settings.productDataCollection),
  );
  const lock = useRef(false);
  const dirty = useRef(false);
  const ns = useRef(currentNamespace());
  const { profile, exam } = draft;
  const inferredMode = recommendStudyMode(draft.modeAnswers);
  const suggestedMode = inferredMode ?? profile.mode;
  const chosenMode = draft.modeAnswers?.confirmed ?? suggestedMode;
  const accepted = hasAcceptedAgreement(data.settings.termsAcceptance);
  const showExam = profile.goals.includes('exam');
  const showGpa = profile.goals.includes('gpa');
  const steps: Step[] = [
    ...(editing ? [] : introSteps),
    ...coreSteps,
    ...(showExam ? ['goals' as const] : []),
    ...(showGpa ? ['gpa' as const] : []),
    ...(editing ? [] : (['materials', 'diagnostic'] as const)),
    ...(!editing || !accepted ? (['agreement', 'account'] as const) : []),
    'ready',
  ];
  // Older Check-in drafts combined the agreement and account into one screen.
  const requested =
    draft.step === 'account' && !accepted
      ? 'agreement'
      : draft.step === 'goals' && !showExam && showGpa
        ? 'gpa'
        : draft.step;
  const step = steps.includes(requested)
    ? requested
    : editing
      ? 'profile'
      : 'welcome';
  const index = steps.indexOf(step);
  useEffect(() => {
    if (entered.current) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    entered.current = true;
  }, [step]);
  const weights = { ...checkInWeights(data, profile), ...draft.weights };
  const total = SUBJECTS.reduce((sum, s) => sum + (weights[s.id] ?? 1), 0);
  function change(patch: Partial<CheckInDraft>) {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  }
  function set<K extends keyof LearningProfile>(
    key: K,
    value: LearningProfile[K],
  ) {
    dirty.current = true;
    setDraft((d) => ({ ...d, profile: { ...d.profile, [key]: value } }));
  }
  function answerScenario(
    key: 'start' | 'adjust',
    value: LearningProfile['mode'],
  ) {
    if (draft.modeAnswers?.[key] === value) return;
    change({
      modeAnswers: { ...draft.modeAnswers, [key]: value, confirmed: undefined },
    });
  }
  useEffect(() => {
    if (!dirty.current || busy || accountBusy) return;
    const save = () =>
      void saveLearningCheckIn(draft, {}, ns.current).catch(() =>
        setError(t('saveError')),
      );
    const timer = setTimeout(save, 400);
    const leave = () => {
      clearTimeout(timer);
      save();
    };
    window.addEventListener('pagehide', leave);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pagehide', leave);
    };
  }, [draft, busy, accountBusy]);
  const applicable = !!exam && profile.goals.includes('exam');
  function verify() {
    if (!exam || !applicable) return true;
    try {
      validateExamDetails(
        { ...exam, dailyMinutes: profile.minutes },
        data.nodes,
      );
      return true;
    } catch {
      setError(t('examInvalid'));
      return false;
    }
  }
  function nextStep(direction: number) {
    if (editing && step === 'agreement' && direction > 0) return 'ready';
    return steps[index + direction] ?? step;
  }
  async function move(next: Step, action?: SaveAction) {
    if (
      lock.current ||
      accountBusy ||
      (step === 'goals' && steps.indexOf(next) > index && !verify())
    )
      return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const completed = !!action && action !== 'skip';
      if (completed && !total) throw new Error('subjects');
      const advancing = steps.indexOf(next) > index;
      const nextDraft: CheckInDraft = {
        ...draft,
        step: next,
        profile:
          step === 'mode-result' && advancing
            ? { ...profile, mode: chosenMode }
            : profile,
      };
      await saveLearningCheckIn(
        nextDraft,
        {
          complete: completed,
          skip: action === 'skip',
          ...(step === 'agreement' &&
          (next === 'account' || next === 'ready') &&
          (accepted || agree)
            ? { sharing }
            : {}),
        },
        ns.current,
      );
      if (ns.current !== currentNamespace()) return;
      dirty.current = false;
      setDraft(nextDraft);
      await refresh();
      if (!action) return;
      if (completed && !editing)
        trackProductEvent('onboarding_complete', 'profile');
      if (action === 'skip' || (editing && action === 'complete'))
        navigate('you', 'all', 'preferences');
      else if (action === 'discover') navigate('subjects', 'all', 'discover');
      else if (action === 'gpa') navigate('results', 'all', 'scores');
      else if (action === 'feedback') navigate('you', 'all', 'feedback');
      else if (action === 'diagnostic') {
        if (diagnosticItems.length)
          start(diagnosticItems, 'test', tr('planner:开始首次测试'));
        else navigate('subjects', 'all', 'materials');
      } else if (!data.questions.length)
        navigate('subjects', 'all', 'materials');
      else navigate('home');
    } catch {
      setError(t('saveError'));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const diagnosticItems = useMemo(() => {
    if (step !== 'diagnostic' && step !== 'ready') return [];
    const settings = {
      ...data.settings,
      dailyMinutes: profile.minutes,
      assistant: {
        ...data.settings.assistant,
        version: 1 as const,
        dailyMinutes: profile.minutes,
        weights,
      },
    };
    const plan = dailyStudyPlan({ ...data, settings });
    return (
      plan.recommendations.find((r) => r.mode === 'initial')?.questions ??
      buildQueue(data, {
        subjects: SUBJECTS.filter((s) => (weights[s.id] ?? 1) > 0).map(
          (s) => s.id,
        ),
        practice: true,
        test: true,
        limit: 12,
      })
    );
  }, [
    data,
    step,
    profile.minutes,
    draft.weights,
    profile.subjects,
    profile.priorities,
  ]);
  const diagnostics =
    !editing && diagnosticItems.length > 0 && profile.diagnostic;
  const title = fieldTitles[step]?.[0]
    ? tr(fieldTitles[step]![0])
    : t('step.' + step);
  const caption =
    step === 'mode-result' && !inferredMode
      ? undefined
      : fieldTitles[step]?.[1]
        ? tr(fieldTitles[step]![1]!)
        : step === 'profile'
          ? t('intro')
          : undefined;
  const choose = <K extends 'stage' | 'routine' | 'format' | 'grading'>(
    key: K,
    values: LearningProfile[K][],
  ) => (
    <fieldset className="learning-group">
      <legend>{t(key)}</legend>
      <CheckInOptions
        compact
        label={t(key)}
        disabled={busy}
        selected={[profile[key]]}
        onSelect={(value) => set(key, value)}
        choices={values.map((value) => ({
          value,
          label: t(key + '.' + (value || 'unset')),
        }))}
      />
    </fieldset>
  );
  return (
    <main
      className={
        'onboarding-page onboarding-simple onboarding-check-in' +
        (step === 'account' ? ' onboarding-account-step' : '') +
        (step === 'materials' && importOpen
          ? ' onboarding-import-expanded'
          : '')
      }
      aria-labelledby="onboarding-title"
    >
      <header>
        <span className="onboarding-brand">
          review<span>.</span>
        </span>
        <button
          className="quiet"
          disabled={busy || accountBusy}
          onClick={async () => {
            if (dirty.current) {
              try {
                await saveLearningCheckIn(draft, {}, ns.current);
              } catch {
                setError(t('saveError'));
                return;
              }
            }
            if (ns.current === currentNamespace())
              navigate('you', 'all', editing ? 'preferences' : 'account');
          }}
        >
          {tr('planner:账户与配置')}
        </button>
      </header>
      <nav aria-label={tr('planner:新手引导进度')}>
        <div
          className="onboarding-progress-track"
          role="progressbar"
          aria-label={tr('planner:新手引导进度')}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
        >
          <span style={{ width: ((index + 1) / steps.length) * 100 + '%' }} />
        </div>
        <small aria-hidden="true">
          {index + 1} / {steps.length}
        </small>
      </nav>
      <section className="onboarding-content">
        {step !== 'welcome' && (
          <div className="onboarding-coach" key={'coach:' + step}>
            <Penguin action="welcome" actionKey={'guide:' + step} />
            <div>
              <h1 id="onboarding-title" ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {caption && <p>{caption}</p>}
            </div>
          </div>
        )}
        <div
          className={
            'onboarding-step-body' +
            ([
              'profile',
              'routine',
              'rhythm',
              'method',
              'mode-adjust',
              'mode-result',
              'review-format',
              'navi-help',
              'subjects',
              'weights',
              'goals',
              'gpa',
              'ready',
            ].includes(step)
              ? ' check-in-body'
              : '')
          }
          key={step}
        >
          {step === 'welcome' && <OnboardingWelcome />}
          {step === 'demo' && <OnboardingDemo />}
          {step === 'symbols' && <OnboardingSymbols />}
          {step === 'profile' && (
            <>
              {choose('stage', ['', 'middle', 'high', 'higher', 'other'])}
              <fieldset className="learning-group">
                <legend>{t('goals')}</legend>
                <CheckInOptions
                  compact
                  label={t('goals')}
                  disabled={busy}
                  selected={profile.goals}
                  onSelect={(value) =>
                    set('goals', toggle(profile.goals, value))
                  }
                  choices={CHECK_IN_GOALS.map((value) => ({
                    value,
                    label: t('goal.' + value),
                  }))}
                />
              </fieldset>
            </>
          )}
          {step === 'subjects' && (
            <>
              <fieldset className="learning-group">
                <legend>{t('subjects')}</legend>
                <CheckInOptions
                  compact
                  label={t('subjects')}
                  disabled={busy}
                  selected={profile.subjects}
                  choices={SUBJECTS.map((s) => ({
                    value: s.id,
                    label: tr('subjects:' + s.name),
                  }))}
                  onSelect={(value) => {
                    const subjects = toggle(profile.subjects, value);
                    change({
                      weights: undefined,
                      profile: {
                        ...profile,
                        subjects,
                        priorities: profile.priorities.filter((id) =>
                          subjects.includes(id),
                        ),
                      },
                    });
                  }}
                />
              </fieldset>
              {!!profile.subjects.length && (
                <fieldset className="learning-group">
                  <legend>{t('priorities')}</legend>
                  <CheckInOptions
                    compact
                    label={t('priorities')}
                    disabled={busy}
                    selected={profile.priorities}
                    choices={SUBJECTS.filter((s) =>
                      profile.subjects.includes(s.id),
                    ).map((s) => ({
                      value: s.id,
                      label: tr('subjects:' + s.name),
                    }))}
                    onSelect={(value) =>
                      change({
                        weights: undefined,
                        profile: {
                          ...profile,
                          priorities: toggle(profile.priorities, value),
                        },
                      })
                    }
                  />
                </fieldset>
              )}
            </>
          )}
          {step === 'weights' && (
            <>
              <div className="assistant-weights">
                {SUBJECTS.map((s) => {
                  const weight = weights[s.id] ?? 1;
                  const share = total ? Math.round((weight / total) * 100) : 0;
                  return (
                    <label key={s.id}>
                      <SubjectIcon subject={s.id} />
                      <strong>{tr('subjects:' + s.name)}</strong>
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={0.1}
                        value={weight}
                        aria-label={tr('subjects:' + s.name)}
                        aria-valuetext={share + '%'}
                        style={
                          {
                            '--weight-fill': (weight / 5) * 100 + '%',
                          } as CSSProperties
                        }
                        onChange={(e) =>
                          change({
                            weights: {
                              ...draft.weights,
                              [s.id]: Number(e.target.value),
                            },
                          })
                        }
                      />
                      <output className="onboarding-weight-share">
                        {share}%
                      </output>
                    </label>
                  );
                })}
              </div>
              <small>
                {tr('planner:拖到最左侧，可暂停该学科的自动安排。')}
              </small>
            </>
          )}
          {step === 'routine' && (
            <>
              <div
                className="onboarding-time-options"
                role="group"
                aria-label={t('minutes')}
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                  <button
                    key={n}
                    className="secondary"
                    aria-pressed={profile.minutes === n}
                    onClick={() => set('minutes', n)}
                  >
                    <strong>{n}</strong>
                    <span>{tr('planner:分钟')}</span>
                  </button>
                ))}
                <label className="check-in-custom-time">
                  <span>{t('minutes')}</span>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={profile.minutes || ''}
                    onChange={(e) => set('minutes', Number(e.target.value))}
                  />
                </label>
              </div>
            </>
          )}
          {step === 'rhythm' && (
            <div className="check-in-fields">
              {choose('routine', ['', 'school', 'home', 'flexible'])}
              <label>
                {t('days')}
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={profile.days || ''}
                  onChange={(e) => set('days', Number(e.target.value))}
                />
              </label>
            </div>
          )}
          {(step === 'method' || step === 'mode-adjust') &&
            (() => {
              const scenario = step === 'method' ? 'start' : 'adjust';
              const answer = draft.modeAnswers?.[scenario];
              return (
                <CheckInOptions
                  label={title}
                  disabled={busy}
                  selected={answer ? [answer] : []}
                  onSelect={(value) => answerScenario(scenario, value)}
                  choices={STUDY_MODES.map((value) => ({
                    value,
                    label: t('scenario.' + scenario + '.' + value),
                  }))}
                />
              );
            })()}
          {step === 'mode-result' && (
            <CheckInOptions
              label={title}
              disabled={busy}
              selected={[chosenMode]}
              onSelect={(value) =>
                change({
                  modeAnswers: { ...draft.modeAnswers, confirmed: value },
                })
              }
              choices={[
                suggestedMode,
                ...STUDY_MODES.filter((mode) => mode !== suggestedMode),
              ].map((value) => {
                const Icon = {
                  auto: Compass,
                  guided: ListChecks,
                  manual: SlidersHorizontal,
                }[value];
                return {
                  value,
                  label:
                    t('mode.' + value) +
                    (value === inferredMode
                      ? ' · ' + t('scenario.recommended')
                      : ''),
                  note: t('scenario.result.' + value),
                  icon: <Icon size={20} aria-hidden="true" />,
                };
              })}
            />
          )}
          {step === 'review-format' &&
            choose('format', ['concept', 'practice', 'mixed'])}
          {step === 'navi-help' && (
            <>
              <CheckInOptions
                label={title}
                disabled={busy}
                selected={[profile.independent ? 'independent' : profile.help]}
                choices={
                  [
                    { value: 'independent', label: t('independent') },
                    { value: 'hint', label: t('help.hint') },
                    { value: 'steps', label: t('help.steps') },
                  ] as const
                }
                onSelect={(value) =>
                  change({
                    profile: {
                      ...profile,
                      independent: value === 'independent',
                      help: value === 'steps' ? 'steps' : 'hint',
                    },
                  })
                }
              />
              {editing && (
                <CheckInOptions
                  compact
                  label={t('edit')}
                  disabled={busy}
                  selected={(['materials', 'diagnostic'] as const).filter(
                    (key) => profile[key],
                  )}
                  choices={(['materials', 'diagnostic'] as const).map(
                    (value) => ({ value, label: t(value) }),
                  )}
                  onSelect={(key) => set(key, !profile[key])}
                />
              )}
            </>
          )}
          {step === 'goals' && (
            <>
              {showExam && (
                <section className="check-in-subsection">
                  <h2>
                    <CalendarDays size={19} />
                    {t('exam')}
                  </h2>
                  {!exam ? (
                    <button
                      className="secondary"
                      onClick={() =>
                        change({
                          exam: {
                            title: '',
                            subject:
                              profile.priorities[0] ??
                              profile.subjects[0] ??
                              'math',
                            date: localDay(),
                            scope: [],
                            target: 80,
                            dailyMinutes: profile.minutes,
                            scoreReminder: true,
                          },
                        })
                      }
                    >
                      {t('addExam')}
                    </button>
                  ) : (
                    <>
                      <div className="check-in-fields">
                        <label>
                          {t('examTitle')}
                          <input
                            maxLength={100}
                            value={exam.title}
                            onChange={(e) =>
                              change({
                                exam: { ...exam, title: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('examSubject')}
                          <select
                            value={exam.subject}
                            onChange={(e) =>
                              change({
                                exam: {
                                  ...exam,
                                  subject: e.target.value as Subject,
                                  scope: [],
                                },
                              })
                            }
                          >
                            {SUBJECTS.map((s) => (
                              <option key={s.id} value={s.id}>
                                {tr('subjects:' + s.name)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t('examDate')}
                          <input
                            type="date"
                            min={localDay()}
                            value={exam.date}
                            onChange={(e) =>
                              change({
                                exam: { ...exam, date: e.target.value },
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('target')}
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={exam.target || ''}
                            onChange={(e) =>
                              change({
                                exam: {
                                  ...exam,
                                  target: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                      {data.nodes.some((n) => n.subject === exam.subject) && (
                        <ExamScopePicker
                          subject={exam.subject}
                          value={exam.scope}
                          onChange={(scope) =>
                            change({ exam: { ...exam, scope } })
                          }
                          disabled={busy}
                        />
                      )}
                      <div className="learning-chips">
                        <label>
                          <input
                            type="checkbox"
                            checked={exam.scoreReminder}
                            onChange={(e) =>
                              change({
                                exam: {
                                  ...exam,
                                  scoreReminder: e.target.checked,
                                },
                              })
                            }
                          />
                          {t('reminder')}
                        </label>
                        <button
                          className="quiet"
                          onClick={() => change({ exam: undefined })}
                        >
                          {t('laterExam')}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {step === 'gpa' && (
            <>
              {choose('grading', [
                '',
                'percent',
                'letter',
                'four',
                'five',
                'custom',
              ])}
              <CheckInOptions
                label={t('schoolGrading')}
                disabled={busy}
                selected={(
                  ['credits', 'trackGpa', 'schoolRules'] as const
                ).filter((key) => profile[key])}
                choices={(['credits', 'trackGpa', 'schoolRules'] as const).map(
                  (value) => ({ value, label: t(value) }),
                )}
                onSelect={(key) => set(key, !profile[key])}
              />
              <p>{t('gpaLater')}</p>
            </>
          )}
          {step === 'materials' && (
            <>
              <OnboardingImport
                count={data.questions.length}
                open={importOpen}
                toggle={() => setImportOpen(!importOpen)}
              />
              <div className="onboarding-optional-choice">
                <CheckInOptions
                  compact
                  label={t('materials')}
                  disabled={busy}
                  selected={profile.materials ? ['materials'] : []}
                  choices={
                    [{ value: 'materials', label: t('materials') }] as const
                  }
                  onSelect={() => set('materials', !profile.materials)}
                />
              </div>
            </>
          )}
          {step === 'diagnostic' && (
            <>
              <OnboardingDiagnostic
                count={diagnosticItems.length}
                disabled={busy}
                back={() => void move('materials')}
              />
              {!!diagnosticItems.length && (
                <div className="onboarding-optional-choice">
                  <CheckInOptions
                    compact
                    label={t('diagnostic')}
                    disabled={busy}
                    selected={profile.diagnostic ? ['diagnostic'] : []}
                    choices={
                      [{ value: 'diagnostic', label: t('diagnostic') }] as const
                    }
                    onSelect={() => set('diagnostic', !profile.diagnostic)}
                  />
                </div>
              )}
            </>
          )}
          {step === 'agreement' && (
            <div className="onboarding-agreement">
              <div
                className="agreement-scroll"
                tabIndex={0}
                role="region"
                aria-label={tr('settings:协议正文')}
              >
                <UsageAgreement />
              </div>
              <label className="feedback-check">
                <input
                  type="checkbox"
                  checked={sharing}
                  disabled={busy}
                  onChange={(e) => setSharing(e.target.checked)}
                />
                <span>
                  {tr(
                    'settings:帮助改进 Reviewbox：收集不含学习内容的使用统计（可随时关闭）',
                  )}
                </span>
              </label>
              <label className="feedback-check">
                <input
                  type="checkbox"
                  checked={accepted || agree}
                  disabled={accepted || busy}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>{tr('settings:我已阅读并同意使用协议与隐私说明')}</span>
              </label>
            </div>
          )}
          {step === 'account' && (
            <OnboardingAccount onBusyChange={setAccountBusy} />
          )}
          {step === 'ready' && (
            <>
              <dl className="sprint-metrics">
                <div>
                  <dt>{t('minutes')}</dt>
                  <dd>{profile.minutes}</dd>
                </div>
                <div>
                  <dt>{t('days')}</dt>
                  <dd>{profile.days}</dd>
                </div>
                <div>
                  <dt>{t('mode')}</dt>
                  <dd>{t('mode.' + profile.mode)}</dd>
                </div>
              </dl>
              {applicable && (
                <p>
                  <strong>{exam.title}</strong> · {exam.date}
                </p>
              )}
              <p>
                {t(
                  diagnostics
                    ? 'diagnosticNext'
                    : data.questions.length
                      ? 'readyNext'
                      : 'importNext',
                )}
              </p>
              {!editing && (
                <section className="onboarding-beta-section">
                  <h2>{tr('settings:一起打磨 Reviewbox 测试版')}</h2>
                  <OnboardingBeta
                    disabled={busy}
                    feedback={() => void move('ready', 'feedback')}
                  />
                </section>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="settings-error">
              {error}
            </p>
          )}
        </div>
        <footer className="onboarding-footer">
          {index > 0 && (
            <button
              className="quiet"
              disabled={busy || accountBusy}
              onClick={() => void move(nextStep(-1))}
            >
              <ArrowLeft size={16} />
              {tr('planner:上一步')}
            </button>
          )}
          {editing && (
            <button
              className="quiet"
              disabled={busy || accountBusy}
              onClick={() => void move(step, 'skip')}
            >
              {t('skip')}
            </button>
          )}
          {step === 'ready' ? (
            <div className="onboarding-final-actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void move(
                    'ready',
                    editing
                      ? 'complete'
                      : diagnostics
                        ? 'diagnostic'
                        : 'complete',
                  )
                }
              >
                {editing
                  ? t('save')
                  : diagnostics
                    ? tr('planner:开始首次测试')
                    : data.questions.length
                      ? t('learn')
                      : t('import')}
                <ArrowRight size={18} />
              </button>
              {!editing && !data.questions.length && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void move('ready', 'discover')}
                >
                  {t('discover')}
                </button>
              )}
              {!editing && diagnostics && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => void move('ready', 'complete')}
                >
                  {tr('planner:稍后测试')}
                </button>
              )}
              {showGpa && profile.trackGpa && profile.schoolRules && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => void move('ready', 'gpa')}
                >
                  {t('configureGpa')}
                </button>
              )}
            </div>
          ) : (
            <button
              className={
                step === 'account' && !cloudUser ? 'secondary' : 'primary'
              }
              disabled={
                busy ||
                accountBusy ||
                (step === 'agreement' && !accepted && !agree) ||
                (step === 'weights' && !total) ||
                (step === 'routine' &&
                  (!Number.isInteger(profile.minutes) ||
                    profile.minutes < 5 ||
                    profile.minutes > 120)) ||
                (step === 'rhythm' &&
                  (!Number.isInteger(profile.days) ||
                    profile.days < 1 ||
                    profile.days > 7))
              }
              onClick={() => void move(nextStep(1))}
            >
              {busy
                ? tr('planner:正在保存')
                : step === 'account' && !cloudUser
                  ? tr('settings:暂时跳过，继续')
                  : tr('planner:下一步')}
              <ArrowRight size={17} />
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
