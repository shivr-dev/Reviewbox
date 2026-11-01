'use client';
import {tr} from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import type { Pack, Question } from '@/lib/model';
import {
  gradingModes,
  gradingRuleSchema,
  ruleForQuestion,
  soloNames,
  type GradingRule,
} from '@/lib/grading-rules';
import { inspectPackContent } from '@/lib/import-review';
import {inspectScientificDiagram} from '@/lib/scientific-inspector';
import { proposeGradingRule } from '@/lib/ai-client';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import Diagram from './diagram';
import GroupedReviewWorkspace from './grouped-review-workspace';
import ScientificAuthoring from './scientific-authoring';
import {validateChemicalDiagram} from '@/lib/chemical-engine';
import {bioAsset} from '@/lib/bioicons';
import {
  semanticDiagramSchema,
  type SemanticDiagram,
} from '@/lib/diagram-spec';

export function RuleEditor({
  question: q,
  initial,
  skills,
  onSave,
  onCancel,
}: {
  question: Question;
  initial?: GradingRule;
  skills?: {id:string;title:string}[];
  onSave: (r: GradingRule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<GradingRule>(() => {
      if (initial) return structuredClone(initial);
      try {
        return structuredClone(ruleForQuestion(q));
      } catch {
        return {
          id: 'rule:' + q.id,
          version: '1',
          mode: 'points',
          maxScore: 5,
          criteria: [
            {
              id: 'criterion-1',
              title: '',
              max: 5,
              description: '',
              skillId: q.skillId,
            },
          ],
        };
      }
    }),
    [error, setError] = useState('');
  function changeCriterion(
    index: number,
    changes: Partial<GradingRule['criteria'][number]>,
  ) {
    const criteria = draft.criteria.map((c, i) =>
      i === index ? { ...c, ...changes } : c,
    );
    setDraft({
      ...draft,
      criteria,
      maxScore: criteria.reduce((n, c) => n + c.max, 0),
    });
  }
  return (
    <section className="rule-editor" aria-label={tr("library:评分标准编辑")}>
      <div className="rule-editor-head">
        <label>{tr("library:评分方式")}<select
            value={draft.mode}
            onChange={(e) => {
              const mode = e.target.value as GradingRule['mode'];
              setDraft({
                ...draft,
                mode,
                ...(['solo', 'rubric-solo'].includes(mode)
                  ? {
                      solo: draft.solo ?? {
                        levels: Object.entries(soloNames).map(([level]) => ({
                          level: level as 'L1',
                          description: '',
                        })),
                        fullCreditLevel: 'L4',
                      },
                    }
                  : { solo: undefined }),
              });
            }}
          >
            {gradingModes
              .filter(([id]) => id !== 'auto')
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <span>{tr("library:满分")}<b>{draft.maxScore}</b>
        </span>
      </div>
      {draft.criteria.map((c, i) => (
        <fieldset className="rubric-criterion-editor" key={c.id}>
          <legend>{tr("library:评分点")}{i + 1}</legend>
          <div className="criterion-heading">
            <label>{tr("library:名称")}<input
                aria-label={tr("common:评分点 {{v0}} 名称",{v0:(i + 1)})}
                value={c.title}
                onChange={(e) => changeCriterion(i, { title: e.target.value })}
              />
            </label>
            <label>{tr("library:分值")}<input
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={c.max}
                onChange={(e) =>
                  changeCriterion(i, { max: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label>{tr("library:得分依据")}<textarea
              rows={2}
              value={c.fullCredit ?? c.description}
              onChange={(e) =>
                changeCriterion(i, {
                  description: e.target.value,
                  fullCredit: e.target.value,
                })
              }
            />
          </label>
          <details>
            <summary>{tr("library:部分得分、等价答案与过程分")}</summary>
            <label>{tr("library:部分得分条件")}<textarea
                rows={2}
                value={c.partialCredit ?? ''}
                onChange={(e) =>
                  changeCriterion(i, { partialCredit: e.target.value })
                }
              />
            </label>
            <label>{tr("library:扣分条件")}<input
                value={c.deductions ?? ''}
                onChange={(e) =>
                  changeCriterion(i, { deductions: e.target.value })
                }
              />
            </label>
            <label>{tr("library:等价答案（每行一个）")}<textarea
                rows={2}
                value={(c.equivalentAnswers ?? []).join('\n')}
                onChange={(e) =>
                  changeCriterion(i, {
                    equivalentAnswers: e.target.value
                      .split('\n')
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!c.independentCredit}
                onChange={(e) =>
                  changeCriterion(i, { independentCredit: e.target.checked })
                }
              />{tr("library:本步骤可独立得分")}</label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={!!c.carryForward}
                onChange={(e) =>
                  changeCriterion(i, { carryForward: e.target.checked })
                }
              />{tr("library:允许前一步计算错误的合理后续过程分")}</label>
            <label>评分对应能力{skills?<select value={c.skillId} onChange={e=>changeCriterion(i,{skillId:e.target.value})}>{!skills.some(s=>s.id===c.skillId)&&<option value={c.skillId}>原能力（请重新选择）</option>}{skills.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select>:<span>{c.skillId}</span>}</label>
          </details>
          {draft.criteria.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const criteria = draft.criteria.filter((_, j) => j !== i);
                setDraft({
                  ...draft,
                  criteria,
                  maxScore: criteria.reduce((n, c) => n + c.max, 0),
                });
              }}
            >{tr("library:移除此评分点")}</button>
          )}
        </fieldset>
      ))}
      {draft.criteria.length < 20 && (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            const criteria = [
              ...draft.criteria,
              {
                id: 'criterion-' + crypto.randomUUID(),
                title: '',
                max: 1,
                description: '',
                skillId: q.skillId,
              },
            ];
            setDraft({
              ...draft,
              criteria,
              maxScore: criteria.reduce((n, c) => n + c.max, 0),
            });
          }}
        >{tr("library:添加评分点")}</button>
      )}
      {draft.solo && (
        <fieldset>
          <legend>{tr("library:本题的 SOLO 描述")}</legend>
          {draft.solo.levels.map((l, i) => (
            <label key={l.level}>
              {l.level} · {soloNames[l.level]}
              <textarea
                rows={2}
                value={l.description}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    solo: {
                      ...draft.solo!,
                      levels: draft.solo!.levels.map((v, j) =>
                        j === i ? { ...v, description: e.target.value } : v,
                      ),
                    },
                  })
                }
              />
            </label>
          ))}
          <label>{tr("library:本题达到哪个等级即可满足满分要求？")}<select
              value={draft.solo.fullCreditLevel}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  solo: {
                    ...draft.solo!,
                    fullCreditLevel: e.target.value as 'L1',
                  },
                })
              }
            >
              {Object.entries(soloNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {id} · {name}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-caption">{tr("library:思维等级单独评价，不按字数判断，也不额外改变评分点总分。")}</p>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="pack-error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="secondary" onClick={onCancel}>{tr("library:取消编辑")}</button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const result = gradingRuleSchema.safeParse(draft);
            if (
              !result.success ||
              draft.criteria.some(
                (c) => !c.description.trim() && !c.fullCredit?.trim(),
              )
            ) {
              setError(
                tr("library:请填写评分点名称、分值和得分依据；SOLO 模式还需要完整的五级描述。"),
              );
              return;
            }
            onSave({ ...result.data, version: crypto.randomUUID() });
          }}
        >{tr("library:确认评分标准")}</button>
      </div>
    </section>
  );
}

function diagramSuggestion(q: Question): SemanticDiagram | undefined {
  if (q.diagram?.type === 'semantic') return q.diagram;
  const labels = q.diagram?.labelsText?.map((l) => l.text).join(' ') ?? '',
    text = q.prompt + ' ' + labels;
  if (!/蒸发|evaporat/i.test(text) || !/蒸发皿|evaporating dish/i.test(text))
    return;
  const apparatus: Extract<
    SemanticDiagram,
    { kind: 'experiment' }
  >['apparatus'] = [{ id: 'dish', kind: 'evaporating_dish', label: tr("common:蒸发皿") }];
  for (const [pattern, kind, name] of [
    [/玻璃棒|glass rod/i, 'glass_rod', '玻璃棒'],
    [/酒精灯|alcohol lamp/i, 'alcohol_lamp', '酒精灯'],
    [/铁架台|三脚架|stand|tripod/i, 'stand', '支架'],
  ] as const)
    if (pattern.test(text)) apparatus.push({ id: kind, kind, label: name });
  return {
    type: 'semantic',
    kind: 'experiment',
    setup: 'evaporation',
    apparatus,
  };
}
function DiagramReview({
  q,
  onChange,
}: {
  q: Question;
  onChange: (q: Question) => void;
}) {
  const [checking,setChecking]=useState(false);
  const active=useRef(true),namespace=useRef(currentNamespace());
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [stage,setStage]=useState<'question'|'hint'|'solution'>('question');
  const [confirmed,setConfirmed]=useState(q.diagramChoice==='redraw');
  const [draft, setDraft] = useState<SemanticDiagram | undefined>(() =>
      diagramSuggestion(q),
    ),
    [editing, setEditing] = useState(false),
    [error, setError] = useState('');
  const images =
    q.media?.filter((m) => (m.purpose ?? 'question') === 'question') ?? [];
  const identical =
    !images.length &&
    q.diagram?.type === 'semantic' &&
    JSON.stringify(q.diagram) === JSON.stringify(draft);
  const science=draft?inspectScientificDiagram(draft,q):null;
  return (
    <div className="import-diagram-review">
      <label className="diagram-phase-picker">{tr("library:作者预览阶段")}<select value={stage} onChange={e=>setStage(e.target.value as typeof stage)}><option value="question">{tr("library:题目（作答前）")}</option><option value="hint">{tr("library:提示")}</option><option value="solution">{tr("library:解析")}</option></select></label>
      {science&&<section className="science-review" aria-label={tr('library:图形条件检查')}><div className="science-checks"><span>{tr('library:结构合法')}：{science.schemaValid?tr('common:通过'):tr('common:需检查')}</span><span>{tr('library:科学关系')}：{('enginePending' in science&&science.enginePending)?tr('common:需引擎检查'):science.physicsValid?tr('common:通过'):tr('common:需检查')}</span><span>{tr('library:题干一致性')}：{science.questionConsistent==='inconsistent'?tr('common:存在矛盾'):tr('common:需要人工复核')}</span></div>{science.problems.length>0&&<ul role="alert">{science.problems.map((p,i)=><li key={i}>{p}</li>)}</ul>}<details><summary>{tr('library:查看检查依据')}</summary><ul>{science.checks.map((p,i)=><li key={i}>{p}</li>)}</ul></details></section>}
      <ScientificAuthoring initial={draft} onChoose={diagram=>{setDraft(diagram);setConfirmed(false);setError('');}}/>
      <div className={'pack-compare' + (identical ? ' single-diagram' : '')}>
        {!identical && (
          <div>
            <h4>{tr("library:原有插图")}</h4>
            {images.length ? (
              images.map((m) => (
                <img
                  className="import-original-image"
                  key={m.id}
                  src={m.src}
                  alt={m.alt}
                />
              ))
            ) : q.diagram ? (
              <Diagram spec={q.diagram} stage={stage}/>
            ) : (
              <p className="settings-caption">{tr("library:无插图")}</p>
            )}
          </div>
        )}
        <div>
          <h4>{identical ? tr("library:结构化插图预览") : tr("library:专业重绘预览")}</h4>
          {draft ? (
            <Diagram spec={draft} stage={stage}/>
          ) : (
            <p className="settings-caption">{tr("library:没有足够的结构信息。保留原图；普通照片不会自动转换成精确图形。")}</p>
          )}
        </div>
      </div>
      {science&&<label className="science-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{tr('library:我已核对题图数值、单位与待求量')}</label>}
      <div className="button-row">
        {!!images.length && (
          <button
            type="button"
            className={q.diagramChoice === 'original' ? 'primary' : 'secondary'}
            onClick={() => onChange({ ...q, diagramChoice: 'original' })}
          >{tr("library:保留原图")}</button>
        )}
        {draft && (
          <button
            type="button"
            className="primary"
            disabled={checking}
            onClick={async () => {
              const parsed = semanticDiagramSchema.safeParse(draft);
              if (!parsed.success) {
                setError(parsed.error.issues.map((i) => i.message).join('；'));
                return;
              }
              if(!confirmed){setError(tr('library:请先核对题图条件，再确认使用重绘'));return;}
              if(science?.questionConsistent==='inconsistent'){setError(tr('library:题图与所引条件存在矛盾，请修改结构数据或保留原图'));return;}
              setChecking(true);
              try{
              if(parsed.data.kind==='chemistry')await validateChemicalDiagram(parsed.data);
              if(parsed.data.kind==='bioasset'&&!bioAsset(parsed.data.assetId))throw new Error('素材未在授权目录中登记');
              if(!active.current||namespace.current!==currentNamespace())return;
              onChange({ ...q, diagram: parsed.data, diagramChoice: 'redraw',diagramHistory:[...(q.diagramHistory??[]),...(q.diagram?[{diagram:q.diagram,choice:q.diagramChoice,at:new Date().toISOString()}]:[])].slice(-8) });
              }catch(e){if(active.current)setError((e as Error).message);}finally{if(active.current)setChecking(false);}
            }}
          >{checking?tr('library:正在核验…'):tr("library:使用专业重绘")}</button>
        )}
        {draft && (
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(!editing)}
          >{tr("library:修改标注 / 重新绘制")}</button>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => onChange({ ...q, diagramChoice: 'skip' })}
        >{tr("library:跳过本题图形处理")}</button>
      </div>
      {!!q.diagramHistory?.length&&<details><summary>{tr('library:以前的图形版本')}</summary>{q.diagramHistory.map((h,i)=><button className="text-button" type="button" key={i} onClick={()=>onChange({...q,diagram:h.diagram,diagramChoice:h.choice,diagramHistory:[...q.diagramHistory!.filter((_,j)=>j!==i),...(q.diagram?[{diagram:q.diagram,choice:q.diagramChoice,at:new Date().toISOString()}]:[])].slice(-8)})}>{tr('library:恢复此图形')} · {i+1}</button>)}</details>}
      {editing && draft && (
        <div className="diagram-label-editor">
          <p className="settings-caption">{tr("library:只调整标注。坐标、尺寸与物理条件须由原始结构数据确定。")}</p>
          {draft.kind === 'experiment' ? (
            draft.apparatus.map((a, i) => (
              <label key={a.id}>{tr("library:器材")}{i + 1}
                <input
                  value={a.label ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      apparatus: draft.apparatus.map((v, j) =>
                        i === j ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            ))
          ) : draft.kind === 'geometry' ? (
            draft.points.map((p, i) => (
              <label key={p.id}>{tr("library:点")}{p.id}
                <input
                  value={p.label ?? p.id}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      points: draft.points.map((v, j) =>
                        i === j ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            ))
          ) : draft.kind === 'forces' ? (
            draft.forces.map((f, i) => (
              <label key={f.id}>{tr("library:力")}{i + 1}
                <input
                  value={f.label}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      forces: draft.forces.map((v, j) =>
                        i === j ? { ...v, label: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
            ))
          ) : (
            <label>{tr("library:图注")}<input
                value={draft.caption ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, caption: e.target.value })
                }
              />
            </label>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const result = semanticDiagramSchema.safeParse(draft);
              if (!result.success) {
                setError(result.error.issues.map((i) => i.message).join('；'));
                return;
              }
              setDraft(result.data);
              setError('');
              setEditing(false);
            }}
          >{tr("library:重新绘制预览")}</button>
        </div>
      )}
      {error && (
        <p role="alert" className="pack-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PackContentReview({
  pack,
  onChange,
  busy: outerBusy,
  onPendingChange,
}: {
  pack: Pack;
  onChange: (pack: Pack) => void;
  busy: boolean;
  onPendingChange?: (blocked: boolean) => void;
}) {
  const { data, aiReady } = useReview(),
    report = inspectPackContent(
      pack,
      data.nodes.map((n) => n.id),
    );
  const [selected, setSelected] = useState(
      pack.questions.find((q) => q.type === 'subjective')?.id ?? '',
    ),
    [editor, setEditor] = useState(false),
    [pending, setPending] = useState<Record<string, GradingRule>>({}),
    [failures, setFailures] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<'scoring' | 'diagrams'>('scoring'),
    [diagramId, setDiagramId] = useState('');
  const mounted = useRef(true),
    origin = useRef(currentNamespace()),
    latest = useRef(pack);
  latest.current = pack;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onPendingChange?.(busy || Object.keys(pending).length > 0);
  }, [busy, pending, onPendingChange]);
  const subjective = pack.questions.filter((q) => q.type === 'subjective'),
    illustrated = pack.questions.filter((q) => q.diagram || q.media?.length),
    q = pack.questions.find((q) => q.id === selected),
    dq = illustrated.find((q) => q.id === diagramId) ?? illustrated[0];
  const safe = () => mounted.current && origin.current === currentNamespace();
  const update = (q: Question) => {
    if (safe())
      onChange({
        ...latest.current,
        questions: latest.current.questions.map((v) => (v.id === q.id ? q : v)),
      });
  };
  async function generate(ids: string[]) {
    if (!aiReady || busy) return;
    setBusy(true);
    try {
      for (const id of ids.slice(0, 5)) {
        if (!safe()) return;
        const current = latest.current.questions.find((q) => q.id === id)!;
        try {
          const r = await proposeGradingRule(
            current,
            latest.current.manifest.scoringPolicy,
          );
          if (!safe()) return;
          setPending((p) => ({ ...p, [id]: r }));
          setFailures((f) => {
            const n = { ...f };
            delete n[id];
            return n;
          });
        } catch (e) {
          if (safe())
            setFailures((f) => ({ ...f, [id]: (e as Error).message }));
        }
      }
    } finally {
      if (safe()) setBusy(false);
    }
  }
  function saveRule(rule: GradingRule) {
    if (!q) return;
    update({ ...q, gradingRule: rule, rubric: rule.criteria });
    setPending((p) => {
      const next = { ...p };
      delete next[q.id];
      return next;
    });
    setEditor(false);
  }
  return (
    <section className="pack-content-review" aria-label={tr("library:智能导入内容检查")}>
      <div className="import-check-summary">
        <span>
          {pack.knowledge.length}{tr("library:个知识点 ·")}{pack.questions.length}{tr("library:道题")}</span>
        <span
          className={
            report.blocked.length ? 'pack-status-update' : 'settings-caption'
          }
        >
          {report.blocked.length
            ? tr("common:{{v0}} 题待确认",{v0:(report.blocked.length)})
            : tr("library:内容检查通过")}
        </span>
      </div>
      <GroupedReviewWorkspace key={pack.manifest.id+':'+pack.manifest.version} pack={pack} onChange={onChange} onFix={(id,kind)=>{setTab(kind);if(kind==='scoring'){setSelected(id);setEditor(true);}else setDiagramId(id);requestAnimationFrame(()=>document.querySelector('.pack-content-review .pack-subnav')?.scrollIntoView({behavior:'smooth',block:'start'}));}}/>
      {!!report.missingReferences.length && (
        <details className="import-reference-warning">
          <summary>
            {report.missingReferences.length}{tr("library:处关联知识未在当前资料库找到")}</summary>
          {report.missingReferences.slice(0, 20).map((r, i) => (
            <p key={i}>
              {r.title} → {r.reference}
            </p>
          ))}
          <p className="settings-caption">{tr("library:请补充对应知识点；这些关联不会被编造成已掌握的内容。")}</p>
        </details>
      )}
      <nav className="pack-subnav" aria-label={tr("library:内容检查类型")}>
        <button
          type="button"
          aria-current={tab === 'scoring' ? 'page' : undefined}
          onClick={() => setTab('scoring')}
        >{tr("library:评分标准 ·")}{subjective.length}
        </button>
        <button
          type="button"
          aria-current={tab === 'diagrams' ? 'page' : undefined}
          onClick={() => setTab('diagrams')}
        >{tr("library:插图与图形 ·")}{illustrated.length}
        </button>
      </nav>
      {tab === 'scoring' ? (
        <>
          <div className="import-scoring-policy">
            <label>{tr("library:学习包评分方式")}<select
                disabled={busy || outerBusy}
                value={pack.manifest.scoringPolicy?.mode ?? 'auto'}
                onChange={(e) =>
                  onChange({
                    ...pack,
                    manifest: {
                      ...pack.manifest,
                      scoringPolicy: {
                        mode: e.target.value as 'auto',
                        preferences:
                          pack.manifest.scoringPolicy?.preferences ?? '',
                      },
                    },
                  })
                }
              >
                {gradingModes.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>{tr("library:评分偏好（可选）")}<textarea
                rows={2}
                placeholder={tr("library:例如：阅读题重视文本证据；数学保留合理过程分。")}
                value={pack.manifest.scoringPolicy?.preferences ?? ''}
                onChange={(e) =>
                  onChange({
                    ...pack,
                    manifest: {
                      ...pack.manifest,
                      scoringPolicy: {
                        mode: pack.manifest.scoringPolicy?.mode ?? 'auto',
                        preferences: e.target.value,
                      },
                    },
                  })
                }
              />
            </label>
            <p className="settings-caption">{tr("library:已有标准原样保留。偏好仅用于你主动生成或修订的标准。")}</p>
          </div>
          {!subjective.length ? (
            <p className="settings-caption">{tr("library:本包为客观题，无需主观题评分标准。")}</p>
          ) : (
            <>
              <div className="import-scoring-toolbar">
                <label>{tr("library:查看题目")}<select
                    value={selected}
                    disabled={busy}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setEditor(false);
                    }}
                  >
                    {subjective.map((q, i) => (
                      <option key={q.id} value={q.id}>
                        {i + 1}. {q.prompt.slice(0, 50)}
                        {report.questions.find((r) => r.id === q.id)?.scoring
                          .length
                          ? tr("library: · 待补充")
                          : ''}
                        {pending[q.id] ? tr("library: · 待确认") : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="secondary"
                  disabled={
                    busy ||
                    !aiReady ||
                    !report.questions.some(
                      (r) => r.scoring.length && !pending[r.id],
                    )
                  }
                  onClick={() =>
                    void generate(
                      report.questions
                        .filter((r) => r.scoring.length && !pending[r.id])
                        .map((r) => r.id),
                    )
                  }
                >
                  {busy ? tr("library:正在生成评分建议…") : tr("library:补全缺失标准（每批最多 5 题）")}
                </button>
              </div>
              {!aiReady && (
                <p className="settings-caption">{tr("library:连接智能服务后可补全，或手动填写评分标准。")}</p>
              )}
              {(Object.keys(pending).length > 0 ||
                Object.keys(failures).length > 0) && (
                <p role="status" className="settings-caption">{tr("library:已生成")}{Object.keys(pending).length}{tr("library:· 待确认")}{' '}
                  {Object.keys(pending).length}{tr("library:· 失败")}{' '}
                  {Object.keys(failures).length}
                </p>
              )}
              {q && (
                <article className="import-scoring-question">
                  <h4>{q.prompt}</h4>
                  <details>
                    <summary>{tr("library:参考答案")}</summary>
                    <p>{q.answer}</p>
                  </details>
                  {failures[q.id] && (
                    <p role="alert" className="pack-error">
                      {failures[q.id]}
                    </p>
                  )}
                  {editor || pending[q.id] ? (
                    <RuleEditor
                      key={q.id + String(!!pending[q.id])}
                      question={q}
                      initial={pending[q.id]}
                      onCancel={() => {
                        setEditor(false);
                        setPending((p) => {
                          const n = { ...p };
                          delete n[q.id];
                          return n;
                        });
                      }}
                      onSave={saveRule}
                    />
                  ) : (
                    <>
                      <RuleSummary question={q} />
                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => setEditor(true)}
                        >{tr("library:编辑评分标准")}</button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy || !aiReady}
                          onClick={() => void generate([q.id])}
                        >{tr("library:请 AI 提议新标准")}</button>
                      </div>
                    </>
                  )}
                </article>
              )}
            </>
          )}
        </>
      ) : illustrated.length ? (
        <>
          <label>{tr("library:查看插图")}<select
              value={dq?.id ?? ''}
              onChange={(e) => setDiagramId(e.target.value)}
            >
              {illustrated.map((q, i) => (
                <option key={q.id} value={q.id}>
                  {i + 1}. {q.prompt.slice(0, 50)}
                </option>
              ))}
            </select>
          </label>
          {dq && <DiagramReview key={dq.id} q={dq} onChange={update} />}
        </>
      ) : (
        <p className="settings-caption">{tr("library:本包没有插图。")}</p>
      )}
      {busy && (
        <p role="status">{tr("library:正在根据题目和参考答案准备建议；确认之前不会替换已有规则。")}</p>
      )}
    </section>
  );
}
export function RuleSummary({ question: q }: { question: Question }) {
  let rule: GradingRule;
  try {
    rule = ruleForQuestion(q);
  } catch {
    return <p className="pack-status-update">{tr("library:尚缺评分标准")}</p>;
  }
  return (
    <div className="rule-summary">
      <p>
        <strong>{gradingModes.find(([id]) => id === rule.mode)?.[1]}</strong>{tr("library:· 满分")}{rule.maxScore}
      </p>
      <ol>
        {rule.criteria.map((c) => (
          <li key={c.id}>
            <b>
              {c.title} · {c.max}{tr("library:分")}</b>
            <p>{c.fullCredit ?? c.description}</p>
            {c.partialCredit && (
              <p className="settings-caption">{tr("library:部分得分：")}{c.partialCredit}</p>
            )}
          </li>
        ))}
      </ol>
      {rule.solo && (
        <details>
          <summary>{tr("library:查看本题 SOLO 五级描述")}</summary>
          {rule.solo.levels.map((l) => (
            <p key={l.level}>
              <b>
                {l.level} · {soloNames[l.level]}
              </b>
              ：{l.description}
            </p>
          ))}
          <p>{tr("library:满分要求：")}{rule.solo.fullCreditLevel}</p>
        </details>
      )}
    </div>
  );
}
