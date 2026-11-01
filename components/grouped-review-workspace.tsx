'use client';
import { useEffect, useRef, useState } from 'react';
import type { Pack } from '@/lib/model';
import {
  groupedPackReview,
  confirmReviewGroup,
  diagramSignature,
  type ReviewGroup,
  type EngineCheck,
} from '@/lib/grouped-pack-review';
import { checkScientificEngine } from '@/lib/scientific-engine-check';
import { currentNamespace } from '@/lib/store';
import QuestionVisual from './question-visual';
import MathText from './math-text';
const GROUPS = [
  {
    id: 'errors',
    title: '错误',
    description: '先修复内容或数据问题，本组不能直接确认。',
  },
  {
    id: 'manual',
    title: '待人工确认',
    description: '对照原图与重绘结果，明确选择要使用的版本。',
  },
  {
    id: 'engine',
    title: '引擎未检查',
    description: '先解析化学结构、核对素材文件或检查大分子坐标。',
  },
  {
    id: 'visual',
    title: '仅视觉复核',
    description:
      '已完成当前可用的结构检查，仍请对照题干检查标签、单位、位置和显示阶段。',
  },
] as const;
export default function GroupedReviewWorkspace({
  pack,
  onChange,
  onFix,
}: {
  pack: Pack;
  onChange: (p: Pack) => void;
  onFix: (id: string, kind: 'scoring' | 'diagrams') => void;
}) {
  const [checks, setChecks] = useState<Record<string, EngineCheck>>({}),
    [active, setActive] = useState<ReviewGroup>(
      () =>
        GROUPS.find((g) =>
          groupedPackReview(pack).some((r) => r.group === g.id),
        )?.id ?? 'errors',
    ),
    [selected, setSelected] = useState(''),
    [stage, setStage] = useState<'question' | 'hint' | 'solution'>('question'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const latest = useRef(pack),
    mounted = useRef(true),
    owner = useRef(currentNamespace()),
    cancel = useRef<AbortController | undefined>(undefined);
  latest.current = pack;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current?.abort();
    };
  }, []);
  const rows = groupedPackReview(pack, checks),
    pending = rows.filter((r) => r.group !== 'ready'),
    group = GROUPS.find((g) => g.id === active) ?? GROUPS[0],
    items = rows.filter((r) => r.group === active),
    item = items.find((r) => r.id === selected) ?? items[0];

  function confirm(ids: string[], choice: 'redraw' | 'original' = 'redraw') {
    try {
      if (owner.current !== currentNamespace()) throw Error('账户已切换');
      const next = confirmReviewGroup(latest.current, ids, checks, choice);
      onChange(next);
      setActive(
        GROUPS.find((g) =>
          groupedPackReview(next, checks).some((r) => r.group === g.id),
        )?.id ?? active,
      );
      setNotice(
        `已确认${ids.length}题${choice === 'original' ? '保留原图' : '使用重绘'}，仍需完成学习包更新才生效`,
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function engines(target = items) {
    const abort = new AbortController();
    cancel.current = abort;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (const row of target) {
        if (
          abort.signal.aborted ||
          !mounted.current ||
          owner.current !== currentNamespace()
        )
          return;
        const q = row.question;
        if (q.diagram?.type !== 'semantic') continue;
        try {
          const message = await checkScientificEngine(q.diagram, abort.signal);
          if (
            mounted.current &&
            owner.current === currentNamespace() &&
            diagramSignature(
              latest.current.questions.find((q) => q.id === row.id)!,
            ) === row.signature
          )
            setChecks((c) => ({
              ...c,
              [row.id]: { signature: row.signature, status: 'passed', message },
            }));
        } catch (e) {
          if (abort.signal.aborted) break;
          if (mounted.current && owner.current === currentNamespace())
            setChecks((c) => ({
              ...c,
              [row.id]: {
                signature: row.signature,
                status: 'failed',
                message: (e as Error).message,
              },
            }));
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const confirmable = rows.filter((r) => r.group === 'visual');
  return (
    <section className="group-review-workspace" aria-label="分组审核工作台">
      <header>
        <div>
          <h3>分组审核工作台</h3>
          <p>
            {pending.length
              ? `${pending.length}题待处理`
              : '本轮待确认内容已处理'}{' '}
            · {rows.filter((r) => r.group === 'ready').length}题已就绪
          </p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || !confirmable.length}
          onClick={() => confirm(confirmable.map((r) => r.id))}
        >
          确认全部可确认题 · {confirmable.length}
        </button>
      </header>
      <nav className="group-review-tabs" aria-label="审核问题分组">
        {GROUPS.map((g) => (
          <button
            type="button"
            key={g.id}
            aria-current={active === g.id ? 'page' : undefined}
            onClick={() => {
              setActive(g.id);
              setSelected('');
              setError('');
            }}
          >
            <span>{g.title}</span>
            <b>{rows.filter((r) => r.group === g.id).length}</b>
          </button>
        ))}
      </nav>
      <p className="group-review-description">{group.description}</p>
      {error && (
        <p role="alert" className="pack-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="group-review-notice">
          {notice}
        </p>
      )}
      {busy && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            cancel.current?.abort();
            setNotice('已取消剩余引擎检查');
          }}
        >
          取消检查
        </button>
      )}
      {items.length > 0 && (
        <div className="group-review-actions">
          {active === 'visual' && (
            <button
              type="button"
              className="primary"
              onClick={() => confirm(items.map((r) => r.id))}
            >
              我已浏览，确认本组 {items.length} 题
            </button>
          )}
          {active === 'engine' && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void engines()}
            >
              {busy ? '正在检查…' : `检查本组引擎 · ${items.length}`}
            </button>
          )}
          {active === 'manual' && (
            <>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  confirm(
                    items.map((r) => r.id),
                    'original',
                  )
                }
              >
                本组全部保留原图
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void engines()}
              >
                检查本组重绘引擎
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => confirm(items.map((r) => r.id))}
              >
                本组全部采用重绘
              </button>
              <span>采用重绘前请比较原图；未检查的结构不会被跳过。</span>
            </>
          )}
        </div>
      )}
      {items.length ? (
        <div className="group-review-layout">
          <ol className="group-review-list">
            {items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  aria-current={item?.id === row.id ? 'page' : undefined}
                  onClick={() => {
                    setSelected(row.id);
                    setStage('question');
                  }}
                >
                  <span className="group-review-number">
                    第 {row.index + 1} 题
                  </span>
                  <strong>{row.question.prompt}</strong>
                  <small>{row.reasons.join('；')}</small>
                </button>
              </li>
            ))}
          </ol>
          {item && (
            <article className="group-review-detail">
              <header>
                <h4>第 {item.index + 1} 题</h4>
                <select
                  aria-label="审核预览阶段"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as typeof stage)}
                >
                  <option value="question">作答前</option>
                  <option value="hint">提示</option>
                  <option value="solution">解析</option>
                </select>
              </header>
              <MathText>{item.question.passage ?? ''}</MathText>
              <MathText>{item.question.prompt}</MathText>
              {active === 'manual' ? (
                <div className="pack-compare">
                  <div>
                    <h4>原图</h4>
                    {item.question.media
                      ?.filter((m) => (m.purpose ?? 'question') === 'question')
                      .map((m) => (
                        <img
                          key={m.id}
                          className="import-original-image"
                          src={m.src}
                          alt={m.alt}
                        />
                      ))}
                  </div>
                  <div>
                    <h4>重绘</h4>
                    <QuestionVisual
                      question={{
                        ...item.question,
                        media: [],
                        diagramChoice: 'redraw',
                      }}
                      stage={stage}
                      solution={stage === 'solution'}
                    />
                  </div>
                </div>
              ) : (
                <QuestionVisual
                  question={item.question}
                  stage={stage}
                  solution={stage === 'solution'}
                />
              )}
              <ul>
                {item.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              {checks[item.id]?.message && (
                <p className="settings-caption">{checks[item.id].message}</p>
              )}
              <details>
                <summary>参考答案与解析</summary>
                <MathText>{item.question.answer}</MathText>
                <MathText>{item.question.explanation}</MathText>
              </details>
              <div className="group-review-actions">
                {active === 'errors' &&
                  checks[item.id]?.status === 'failed' && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void engines([item])}
                    >
                      重试此题引擎
                    </button>
                  )}
                {active === 'visual' && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => confirm([item.id])}
                  >
                    确认此题
                  </button>
                )}
                {active === 'manual' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => confirm([item.id], 'original')}
                  >
                    保留此题原图
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    onFix(
                      item.id,
                      item.question.type === 'subjective'
                        ? 'scoring'
                        : 'diagrams',
                    )
                  }
                >
                  定位并修订此题
                </button>
              </div>
            </article>
          )}
        </div>
      ) : (
        <p className="group-review-empty">本组没有待处理题目。</p>
      )}
      <p className="group-review-footnote">
        批量确认记录的是你的人工选择，不会把题目标成已通过学习核验，也不会跳过结构错误或引擎检查。
      </p>
    </section>
  );
}
