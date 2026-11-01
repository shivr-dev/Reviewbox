'use client';
import {tr} from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { trackProductEvent } from '@/lib/product-insights';
import type { Pack } from '@/lib/model';
import { previewInstallPack, commitPackUpdate, setMeta } from '@/lib/store';
import type { PackChoices } from '@/lib/pack-versions';
import { stable } from '@/lib/pack-versions';
import { inspectPackContent } from '@/lib/import-review';
import { useReview } from './review-context';
import PackContentReview, { RuleSummary } from './pack-content-review';
import QuestionVisual from './question-visual';
function VersionFields({ value }: { value: any }) {
  if (!value) return null;
  return (
    <>
      {Array.isArray(value.options) && (
        <ul aria-label={tr("library:选项")}>
          {value.options.map((v: any, i: number) => (
            <li key={i}>
              {typeof v === 'string'
                ? v
                : (v.text ?? v.label ?? '选项 ' + (i + 1))}
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(value.skills) && (
        <p>{tr("library:能力：")}{value.skills.map((s: any) => s.title).join('、')}</p>
      )}
      {value.type && (
        <>
          <p className="settings-caption">{tr("library:难度")}{value.difficulty}{tr("library:· 建议用时")}{value.expectedSeconds}{tr("library:秒")}</p>
          <p className="settings-caption">{tr("library:知识点：")}{value.nodeId}{tr("library:· 能力：")}{value.skillId}
          </p>
        </>
      )}
      {value.type === 'subjective' && (
        <details>
          <summary>{tr("library:评分标准")}</summary>
          <RuleSummary question={value} />
        </details>
      )}
      {(value.diagram || value.media?.length) && (
        <QuestionVisual question={value} />
      )}
    </>
  );
}
function changedLabels(before: any, after: any) {
  if (!before || !after) return [];
  return [
    ['prompt', tr("library:题干")],
    ['answer', tr("library:参考答案")],
    ['rubric', tr("library:评分点")],
    ['gradingRule', tr("library:评分规则")],
    ['diagram', tr("library:图形数据")],
    ['media', tr("library:插图资源")],
    ['diagramChoice', tr("library:图形选择")],
    ['nodeId', tr("library:知识点")],
    ['skillId', tr("library:能力")],
  ]
    .filter(([field]) => stable(before[field]) !== stable(after[field]))
    .map(([, label]) => label);
}
export default function PackUpdateReview({
  pack,
  onDone,
  onCancel,
}: {
  pack: Pack;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { refresh, data } = useReview();
  const reviewLogged = useRef(false);
  const [candidate, setCandidate] = useState(pack),
    [preview, setPreview] =
      useState<Awaited<ReturnType<typeof previewInstallPack>>>(),
    [choices, setChoices] = useState<PackChoices>({}),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<any>(),
    [changeFilter, setChangeFilter] = useState('all');
  useEffect(() => {
    reviewLogged.current = false;
    setCandidate(pack);
    setChoices({});
    setResult(undefined);
  }, [pack]);
  useEffect(() => {
    let live = true;
    setPreview(undefined);
    void previewInstallPack(candidate)
      .then((p) => {
        if (live) {
          setPreview(p);
          if (!reviewLogged.current) {
            trackProductEvent(inspectPackContent(candidate).blocked.length ? 'import_review_required' : 'import_ready', 'subjects');
            reviewLogged.current = true;
          }
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [candidate]);
  function edit(next: Pack) {
    setPreview(undefined);
    setError('');
    setChoices({});
    setCandidate(next);
  }
  async function apply() {
    if (!preview || preview.pack !== candidate || pending) return;
    setBusy(true);
    setError('');
    let counts;
    try {
      counts = await commitPackUpdate(preview, choices);
      trackProductEvent('import_complete', 'subjects');
    } catch (e) {
      trackProductEvent('import_apply_error', 'subjects');
      setError((e as Error).message);
      await setMeta(
        'pack-update-error:' + preview.namespace + ':' + candidate.manifest.id,
        (e as Error).message,
      ).catch(() => {});
      setBusy(false);
      return;
    }
    await setMeta(
      'pack-update-error:' + preview.namespace + ':' + candidate.manifest.id,
      null,
    ).catch(() => {});
    setResult(counts);
    try {
      await refresh();
    } catch {
      setError(tr("library:内容已保存，请重新打开资料库刷新显示。"));
    }
    setBusy(false);
  }
  const changes = preview?.changes.filter((c) => c.action !== 'same') ?? [],
    questions = changes.filter((c) => c.kind === 'question'),
    report = inspectPackContent(
      {...candidate,knowledge:candidate.knowledge.map(n=>choices[n.id]==='keep'?(preview?.changes.find(c=>c.kind==='node'&&c.id===n.id)?.before??n):n),questions:candidate.questions.map(q=>choices[q.id]==='keep'?(preview?.changes.find(c=>c.kind==='question'&&c.id===q.id)?.before??q):q)},
      data.nodes.map((n) => n.id),
    );
  return (
    <section
      className="pack-update-review settings-scope"
      aria-label={tr("library:学习包版本差异")}
    >
      <header>
        <span className="muted">
          {preview?.manifest ? tr("library:查看版本更新") : tr("library:智能导入检查")}
        </span>
        <h2>{candidate.manifest.title}</h2>
        <p className="diff-version">
          <span>{preview?.manifest?.version ?? '未安装'}</span> →{' '}
          <strong>{candidate.manifest.version}</strong>
        </p>
      </header>
      {error && (
        <p role="alert" className="pack-error">
          {error}
        </p>
      )}
      {result ? (
        <>
          <h3 role="status">{tr("library:学习包已更新")}</h3>
          <div className="update-result-grid">
            {[
              ['新增', result.added],
              ['修改', result.modified],
              ['归档', result.archived],
            ].map(([label, n]) => (
              <span key={String(label)}>
                <b>{n}</b>
                {label}
              </span>
            ))}
          </div>
          <p className="settings-caption">
            {result.reverify
              ? result.reverify + ' 题需要核验'
              : tr("library:原有核验状态已保留")}
            {result.retained
              ? ' · 保留 ' + result.retained + ' 项个人内容'
              : ''}
          </p>
          <button className="primary" onClick={onDone}>{tr("library:完成")}</button>
        </>
      ) : (
        <>
          <PackContentReview
            pack={candidate}
            onChange={edit}
            busy={busy}
            onPendingChange={setPending}
          />
          {!preview && !error && <p role="status">{tr("library:正在核对本地版本…")}</p>}
          {preview && (
            <>
              <div className="pack-diff-summary">
                {[
                  ['新增', questions.filter((c) => c.action === 'add').length],
                  [
                    '修改',
                    questions.filter((c) => c.action === 'modify').length,
                  ],
                  [
                    '移除',
                    questions.filter((c) => c.action === 'remove').length,
                  ],
                  ['冲突', changes.filter((c) => c.conflict).length],
                ].map(([label, n]) => (
                  <span className="diff-count" key={String(label)}>
                    {label}
                    <b>{n}</b>
                  </span>
                ))}
              </div>
              {preview.manifest?.scoringPolicy &&
                stable(preview.manifest.scoringPolicy) !==
                  stable(candidate.manifest.scoringPolicy) && (
                  <p className="settings-caption">{tr("library:学习包评分偏好有变化，已确认的逐题规则不会自动重写。")}</p>
                )}
              <div className="diff-toolbar">
                <label>{tr("library:查看变化")}{' '}
                  <select
                    aria-label={tr("library:变化类型")}
                    value={changeFilter}
                    onChange={(e) => setChangeFilter(e.target.value)}
                  >
                    <option value="all">{tr("library:全部变化")}</option>
                    <option value="add">{tr("library:新增")}</option>
                    <option value="modify">{tr("library:修改")}</option>
                    <option value="remove">{tr("library:移除")}</option>
                    <option value="conflict">{tr("library:需要处理的冲突")}</option>
                  </select>
                </label>
                <span className="settings-caption">{tr("library:只对变化的题目重新核验")}</span>
              </div>
              {preview.status === 'installed' && (
                <p>{tr("library:版本和内容一致，无需重新安装。核验状态与作答记录已保留。")}</p>
              )}
              <div className="pack-change-list">
                {changes
                  .filter(
                    (c) =>
                      changeFilter === 'all' ||
                      (changeFilter === 'conflict'
                        ? c.conflict
                        : c.action === changeFilter),
                  )
                  .map((c) => (
                    <details key={c.kind + c.id} open={c.conflict}>
                      <summary>
                        {c.kind === 'node' ? tr("library:知识点") : tr("library:题目")} ·{' '}
                        {c.after?.prompt ??
                          c.after?.title ??
                          c.before?.prompt ??
                          c.id}{' '}
                        <small>
                          {c.conflict
                            ? tr("library:需要选择")
                            : {
                                add: '新增',
                                modify: '修改',
                                remove: '归档',
                                same: '一致',
                              }[c.action]}
                        </small>
                      </summary>
                      {c.action === 'modify' && (
                        <p className="change-fields">{tr("library:变化：")}{changedLabels(c.before, c.after).join('、') ||
                            '内容与说明'}
                        </p>
                      )}
                      <div className="pack-compare">
                        {[
                          ['当前内容', c.before],
                          ['新版内容', c.after],
                        ].map(([label, v]) => (
                          <div key={String(label)}>
                            <h4>{String(label)}</h4>
                            <p>
                              {(v as any)?.prompt ?? (v as any)?.title ?? '无'}
                            </p>
                            <p>
                              {(v as any)?.answer ??
                                (v as any)?.description ??
                                ''}
                            </p>
                            <p className="muted">
                              {(v as any)?.explanation ?? ''}
                            </p>
                            <VersionFields value={v} />
                          </div>
                        ))}
                      </div>
                      {c.conflict && (
                        <fieldset>
                          <legend>{tr("library:如何处理？")}</legend>
                          <label>
                            <input
                              type="radio"
                              name={c.id}
                              checked={choices[c.id] === 'keep'}
                              onChange={() =>
                                setChoices({ ...choices, [c.id]: 'keep' })
                              }
                            />
                            {c.action === 'remove'
                              ? tr("library:保留为个人内容")
                              : tr("library:保留我的内容")}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={c.id}
                              checked={choices[c.id] === 'replace'}
                              onChange={() =>
                                setChoices({ ...choices, [c.id]: 'replace' })
                              }
                            />
                            {c.action === 'remove'
                              ? tr("library:归档并保留历史")
                              : tr("library:使用新版内容")}
                          </label>
                        </fieldset>
                      )}
                    </details>
                  ))}
              </div>
            </>
          )}
          <div className="pack-update-actions">
            <button className="secondary" disabled={busy} onClick={onCancel}>{tr("library:取消")}</button>
            <button
              className="primary"
              disabled={
                busy ||
                pending ||
                !preview ||
                !!report.blocked.length ||
                changes.some((c) => c.conflict && !choices[c.id])
              }
              onClick={apply}
            >
              {busy
                ? tr("library:正在保存…")
                : preview?.status === 'installed'
                  ? tr("common:确认一致")
                  : preview?.manifest
                    ? tr("common:确认更新")
                    : tr("common:确认安装")}
            </button>
          </div>
          {(!!report.blocked.length || pending) && (
            <p className="settings-caption">
              {pending
                ? tr("library:请确认或取消待审阅的评分建议。")
                : report.blocked.length + ' 题的评分标准或插图需要先确认。'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
