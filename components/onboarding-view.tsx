'use client';
import { tr } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import { useReview } from './review-context';
import { SUBJECTS } from '@/lib/model';
import { buildQueue } from '@/lib/engine';
import { dailyStudyPlan } from '@/lib/study-assistant';
import { currentNamespace, loadData, put } from '@/lib/store';
import { Penguin } from './learning-game';
import SubjectIcon from './subject-icon';
import { UsageAgreement } from './usage-agreement';
import {
  AGREEMENT_VERSION,
  hasAcceptedAgreement,
} from '@/lib/product-agreement';
import { collectionEnabled, trackProductEvent } from '@/lib/product-insights';
import OnboardingAccount from './onboarding-account';
import LearningCheckInView from './learning-check-in-view';
import { OnboardingWelcome, OnboardingDemo, OnboardingSymbols, OnboardingImport, OnboardingDiagnostic, OnboardingBeta } from './onboarding-sections';
export default function OnboardingView() {
  const {data,section} = useReview();
  const existing = data.settings.assistant;
  const editing = section === 'preferences' || !!existing?.onboardedAt;
  if (!editing && !data.settings.learningCheckIn && existing?.onboardingVersion === 3)
    return <LegacyOnboardingView/>;
  return <LearningCheckInView editing={editing}/>;
}
function LegacyOnboardingView() {
  useTranslation();
  const steps = ['planner:欢迎来到 Review','planner:先回忆，再核对','planner:认识几个标志','planner:每天留多少时间？',
    'planner:最重视哪几科？','planner:导入你的学习内容','planner:建立你的能力起点','settings:使用协议与隐私说明',
    'settings:连接你的学习账户','settings:一起打磨 Reviewbox 测试版'].map(key => tr(key));
  const { data, navigate, refresh, notify, start, cloudUser } = useReview();
  const previous = data.settings.assistant;
  const [step, setStep] = useState(() =>
    previous?.onboardingVersion === 3
      ? Math.min(9, Math.max(0, previous.onboardingStep ?? 0))
      : previous?.onboardingVersion === 2
        ? Math.min(6, Math.max(0, previous.onboardingStep ?? 0))
        : [0, 3, 5, 6][Math.min(3, Math.max(0, previous?.onboardingStep ?? 0))],
  );
  const [minutes, setMinutes] = useState(
    previous?.dailyMinutes ?? data.settings.dailyMinutes,
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      SUBJECTS.map((s) => [s.id, previous?.weights?.[s.id] ?? 1]),
    ),
  );
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [agreed, setAgreed] = useState(() =>
    hasAcceptedAgreement(data.settings.termsAcceptance),
  );
  const [sharing, setSharing] = useState(() =>
    collectionEnabled(currentNamespace(), data.settings.productDataCollection),
  );
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const shares = Object.fromEntries(
    SUBJECTS.map((s) => [
      s.id,
      total ? Math.floor((weights[s.id] / total) * 100) : 0,
    ]),
  );
  if (total) {
    const fractions = [...SUBJECTS].sort(
      (a, b) =>
        (weights[b.id] / total) * 100 -
        shares[b.id] -
        ((weights[a.id] / total) * 100 - shares[a.id]),
    );
    const remainder = 100 - Object.values(shares).reduce((a, b) => a + b, 0);
    for (let i = 0; i < remainder; i++) shares[fractions[i].id]++;
  }
  async function save(next: number, complete = false) {
    if (lock.current) return false;
    if (
      (next > 7 || complete) &&
      !hasAcceptedAgreement(data.settings.termsAcceptance) &&
      !(step === 7 && agreed)
    ) {
      notify(tr('settings:请先阅读并同意使用协议。'));
      setStep(7);
      return false;
    }
    if (!total) {
      notify(tr('planner:请至少选择一门学科'));
      return false;
    }
    lock.current = true;
    setBusy(true);
    const ns = currentNamespace();
    try {
      const fresh = await loadData(ns);
      if (ns !== currentNamespace())
        throw new Error('学习空间已切换，请重新打开引导');
      await put(
        'setting',
        {
          ...fresh.settings,
          ...(step === 7 && next > 7 && agreed
            ? {
                termsAcceptance: {
                  version: AGREEMENT_VERSION,
                  acceptedAt: new Date().toISOString(),
                },
                productDataCollection: {
                  enabled: sharing,
                  updatedAt: new Date().toISOString(),
                },
              }
            : {}),
          dailyMinutes: minutes,
          assistant: {
            version: 1,
            weights,
            dailyMinutes: minutes,
            onboardingVersion: 3,
            onboardingStep: next,
            onboardedAt: complete
              ? new Date().toISOString()
              : fresh.settings.assistant?.onboardedAt,
          },
        },
        'settings',
        false,
        ns,
      );
      if (ns !== currentNamespace()) return false;
      await refresh();
      if (complete) trackProductEvent('onboarding_complete', 'profile');
      setStep(next);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : '未能保存设置');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const initialPlan = dailyStudyPlan({
    ...data,
    settings: {
      ...data.settings,
      assistant: { version: 1, weights, dailyMinutes: minutes },
    },
  });
  const diagnostic =
    initialPlan.recommendations.find((r) => r.mode === 'initial')?.questions ??
    buildQueue(data, {
      subjects: SUBJECTS.filter((s) => weights[s.id] > 0).map((s) => s.id),
      practice: true,
      test: true,
      limit: 12,
    });
  return (
    <main
      className={
        'onboarding-page onboarding-simple' + (step === 8 ? ' onboarding-account-step' : '') +
        (importOpen && step === 5 ? ' onboarding-import-expanded' : '')
      }
    >
      <header>
        <span className="onboarding-brand">
          review<span>.</span>
        </span>
        <button
          className="quiet"
          disabled={busy}
          onClick={() => navigate('you')}
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
          aria-valuenow={step + 1}
        >
          <span style={{ width: ((step + 1) / steps.length) * 100 + '%' }} />
        </div>
        <small>
          {step + 1} / {steps.length}
        </small>
      </nav>
      <section className="onboarding-content">
        {step > 0 && (
          <div className="onboarding-coach">
            <Penguin action="welcome" actionKey={'guide:' + step} />
            <div>
              <h1>{steps[step]}</h1>
              <p>
                {
                  [
                    '',
                    tr('planner:先想一想，再看答案。'),
                    tr('planner:这些标志会陪你一起学习。'),
                    tr('planner:选择每天能坚持的时间。'),
                    tr('planner:拖动调整，右侧是计划占比。'),
                    tr('planner:添加教材、笔记或题目。'),
                    tr('planner:用少量题目，找到你的起点。'),
                    tr('settings:了解版权和数据使用，你可以关闭可选统计。'),
                    tr('settings:连接账户不是必选项，你也可以稍后再登录。'),
                    tr('settings:发现问题，欢迎通过 反馈告诉我们。'),
                  ][step]
                }
              </p>
            </div>
          </div>
        )}
        <div className="onboarding-step-body" key={step}>
          {step === 0 && <OnboardingWelcome />}
          {step === 1 && <OnboardingDemo />}
          {step === 2 && <OnboardingSymbols />}
          {step === 3 && (
            <>
              <div
                className="onboarding-time-options"
                role="group"
                aria-label={tr('planner:每日可用时间')}
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                  <button
                    key={n}
                    className="secondary"
                    aria-pressed={minutes === n}
                    onClick={() => setMinutes(n)}
                  >
                    <strong>{n}</strong>
                    <span>{tr('planner:分钟')}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div className="assistant-weights">
                {SUBJECTS.map((s) => (
                  <label key={s.id}>
                    <SubjectIcon subject={s.id} />
                    <strong>{tr('subjects:' + s.name)}</strong>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      aria-label={s.name + '学习权重'}
                      aria-valuetext={shares[s.id] + '% 计划占比'}
                      style={
                        {
                          '--weight-fill': (weights[s.id] / 5) * 100 + '%',
                        } as CSSProperties
                      }
                      value={weights[s.id]}
                      onChange={(e) =>
                        setWeights({
                          ...weights,
                          [s.id]: Number(e.target.value),
                        })
                      }
                    />
                    <output className="onboarding-weight-share">
                      {shares[s.id]}%
                    </output>
                  </label>
                ))}
              </div>
              <small>
                {tr('planner:拖到最左侧，可暂停该学科的自动安排。')}
              </small>
            </>
          )}
          {step === 5 && <OnboardingImport count={data.questions.length} open={importOpen} toggle={() => setImportOpen(!importOpen)} />}
          {step === 6 && <OnboardingDiagnostic count={diagnostic.length} disabled={busy} back={() => void save(5)} />}
          {step === 7 && (
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
                  onChange={(e) => setSharing(e.target.checked)}
                  disabled={busy}
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
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={busy}
                />
                <span>{tr('settings:我已阅读并同意使用协议与隐私说明')}</span>
              </label>
            </div>
          )}
          {step === 8 && <OnboardingAccount onBusyChange={setAccountBusy} />}
          {step === 9 && <OnboardingBeta disabled={busy} feedback={async () => {
            if (await save(9, true)) navigate('you', 'all', 'feedback');
          }} />}
        </div>
        <footer>
          {step > 0 && (
            <button
              className="quiet"
              disabled={busy}
              onClick={() => void save(step - 1)}
            >
              <ArrowLeft size={16} />
              {tr('planner:上一步')}
            </button>
          )}
          {step < 9 ? (
            <button
              className={step === 8 && !cloudUser ? 'secondary' : 'primary'}
              disabled={
                busy || accountBusy || !total || (step === 7 && !agreed)
              }
              onClick={() => void save(step + 1)}
            >
              {busy
                ? tr('planner:正在保存')
                : step === 8 && !cloudUser
                  ? tr('settings:暂时跳过，继续')
                  : tr('planner:下一步')}
              <ArrowRight size={17} />
            </button>
          ) : (
            <div className="onboarding-final-actions">
              <button
                className="primary"
                disabled={busy || !diagnostic.length}
                onClick={async () => {
                  if (await save(9, true))
                    start(diagnostic, 'test', '首次能力诊断');
                }}
              >
                {tr('planner:开始首次测试')}
                <ArrowRight size={18} />
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={async () => {
                  if (await save(9, true)) navigate('home');
                }}
              >
                {tr('planner:稍后测试')}
              </button>
            </div>
          )}
        </footer>
      </section>
    </main>
  );
}
