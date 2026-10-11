'use client';
import { useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Eye,
  Flag,
  Import,
  ShieldCheck,
  Snowflake,
  Target,
} from 'lucide-react';
import { useReview } from './review-context';
import { SUBJECTS } from '@/lib/model';
import { buildQueue } from '@/lib/engine';
import { dailyStudyPlan } from '@/lib/study-assistant';
import { currentNamespace, loadData, put } from '@/lib/store';
import { Penguin } from './learning-game';
import SubjectIcon from './subject-icon';
import LibraryView from './library-view';
const steps = [
  '欢迎来到 Review',
  '先回忆，再核对',
  '认识几个标志',
  '每天留多少时间？',
  '最重视哪几科？',
  '导入你的学习内容',
  '建立你的能力起点',
];
export default function OnboardingView() {
  const { data, navigate, refresh, notify, start } = useReview();
  const previous = data.settings.assistant;
  const [step, setStep] = useState(() =>
    previous?.onboardingVersion === 2
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
  const [revealed, setRevealed] = useState(false),
    [demoRating, setDemoRating] = useState('');
  const [importOpen, setImportOpen] = useState(false);
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
    if (!total) {
      notify('请至少选择一门学科');
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
          dailyMinutes: minutes,
          assistant: {
            version: 1,
            weights,
            dailyMinutes: minutes,
            onboardingVersion: 2,
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
        'onboarding-page onboarding-simple' +
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
          账户与配置
        </button>
      </header>
      <nav aria-label="新手引导进度">
        <div
          className="onboarding-progress-track"
          role="progressbar"
          aria-label="新手引导进度"
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
                    '先想一想，再看答案。',
                    '这些标志会陪你一起学习。',
                    '选择每天能坚持的时间。',
                    '拖动调整，右侧是计划占比。',
                    '添加教材、笔记或题目。',
                    '用少量题目，找到你的起点。',
                  ][step]
                }
              </p>
            </div>
          </div>
        )}
        <div className="onboarding-step-body" key={step}>
          {step === 0 && (
            <div className="onboarding-welcome">
              <Penguin action="welcome" actionKey="onboarding-welcome" />
              <h1>欢迎来到 Review</h1>
              <p>先做一点设置，再开始学习。</p>
            </div>
          )}
          {step === 1 && (
            <>
              <div className="onboarding-demo">
                <span>试一试 · 不记录成绩</span>
                <strong>{revealed ? '狼藉' : 'láng jí'}</strong>
                {!revealed ? (
                  <button
                    className="secondary"
                    onClick={() => setRevealed(true)}
                  >
                    <Eye size={18} />
                    显示答案
                  </button>
                ) : (
                  <div className="onboarding-demo-ratings">
                    {['答错', '不确定', '答对'].map((r) => (
                      <button
                        key={r}
                        className={
                          demoRating === r ? 'secondary selected' : 'secondary'
                        }
                        onClick={() => setDemoRating(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                <small>
                  {demoRating
                    ? '就是这样。真实练习会记住你的判断。'
                    : '看拼音写汉字由你手动检查。'}
                </small>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="onboarding-symbols">
                {[
                  {
                    Icon: Clock3,
                    title: '到期复习',
                    text: '隔一段时间，再回忆',
                  },
                  { Icon: Flag, title: '能力测试', text: '完成后查看解析' },
                  {
                    Icon: Snowflake,
                    title: '连胜冻结',
                    text: '为休息日保留连胜',
                  },
                  {
                    Icon: ShieldCheck,
                    title: '私有同步',
                    text: '登录后跨设备继续',
                  },
                ].map(({ Icon, title, text }) => (
                  <article key={title}>
                    <Icon />
                    <h3>{title}</h3>
                    <span>{text}</span>
                  </article>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div
                className="onboarding-time-options"
                role="group"
                aria-label="每日可用时间"
              >
                {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                  <button
                    key={n}
                    className="secondary"
                    aria-pressed={minutes === n}
                    onClick={() => setMinutes(n)}
                  >
                    <strong>{n}</strong>
                    <span>分钟</span>
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
                    <strong>{s.name}</strong>
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
              <small>拖到最左侧，可暂停该学科的自动安排。</small>
            </>
          )}
          {step === 5 && (
            <>
              <div className="onboarding-import-choice">
                <Import size={38} />
                <strong>
                  {data.questions.length
                    ? data.questions.length + ' 道题已就绪'
                    : '添加自己的内容'}
                </strong>
                <button
                  className="secondary"
                  onClick={() => setImportOpen(!importOpen)}
                >
                  {importOpen ? '收起导入工具' : '打开导入工具'}
                </button>
                <small>支持手动导入，无需 AI 额度。</small>
              </div>
              {importOpen && <LibraryView />}
            </>
          )}
          {step === 6 && (
            <div className="assistant-initial-test">
              <Target size={42} />
              <strong>{diagnostic.length} 题已就绪</strong>
              <small>未测学科保留“未评估”。</small>
              {!diagnostic.length && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void save(5)}
                >
                  先导入题目
                </button>
              )}
            </div>
          )}
        </div>
        <footer>
          {step > 0 && (
            <button
              className="quiet"
              disabled={busy}
              onClick={() => void save(step - 1)}
            >
              <ArrowLeft size={16} />
              上一步
            </button>
          )}
          {step < 6 ? (
            <button
              className="primary"
              disabled={busy || !total}
              onClick={() => void save(step + 1)}
            >
              {busy ? '正在保存' : '下一步'}
              <ArrowRight size={17} />
            </button>
          ) : (
            <div className="onboarding-final-actions">
              <button
                className="primary"
                disabled={busy || !diagnostic.length}
                onClick={async () => {
                  if (await save(6, true))
                    start(diagnostic, 'test', '首次能力诊断');
                }}
              >
                开始首次测试 <ArrowRight size={18} />
              </button>
              <button
                className="quiet"
                disabled={busy}
                onClick={async () => {
                  if (await save(6, true)) navigate('home');
                }}
              >
                稍后测试
              </button>
            </div>
          )}
        </footer>
      </section>
    </main>
  );
}
