'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import {
  SUBJECTS,
  uid,
  type Pack,
  type Subject,
  type Question,
} from '@/lib/model';
import {
  blankPack,
  blankNode,
  blankQuestion,
  changeQuestion,
  moveItem,
  packFromInstalled,
  readyStudioPack,
  type PackDraft,
} from '@/lib/pack-studio';
import { saveStudioDraft, studioDrafts } from '@/lib/studio-store';
import { currentNamespace, allRecords } from '@/lib/store';
import { packVersions } from '@/lib/pack-versions';
import { downloadPack, extractFile } from '@/lib/importer';
import { QUESTION_TYPES } from '@/lib/question-tools';
import { matchingAnswer, connectMatching } from '@/lib/matching';
import MathText from './math-text';
import { MathAnswerInput } from './math-answer-input';
import QuestionVisual from './question-visual';
import StudioIllustration from './studio-illustration';
import PackUpdateReview from './pack-update-review';
import { RuleEditor } from './pack-content-review';
export default function LearningPackStudio() {
  const { data, subject, navigate, notify } = useReview(),
    ns = currentNamespace(),
    initial = SUBJECTS.some((s) => s.id === subject)
      ? (subject as Subject)
      : 'math';
  const [draft, setDraft] = useState<PackDraft>({
      id: 'pack-draft:' + uid(),
      pack: blankPack(initial),
    }),
    [drafts, setDrafts] = useState<PackDraft[]>([]),
    [selected, setSelected] = useState(''),
    [tab, setTab] = useState<'question' | 'knowledge' | 'details'>('details'),
    [section, setSection] = useState<'content' | 'illustration' | 'grading'>(
      'content',
    ),
    [answerView, setAnswerView] = useState(false),
    [error, setError] = useState(''),
    [status, setStatus] = useState('尚未保存'),
    [candidate, setCandidate] = useState<Pack>(),
    [formula, setFormula] = useState(''),
    [formulaTarget, setFormulaTarget] = useState<
      'prompt' | 'answer' | 'explanation'
    >('prompt'),
    [search, setSearch] = useState(''),
    [undo, setUndo] = useState<{ question: Question; index: number }>();
  const owner = useRef(ns);
  const latest = useRef(draft),
    mounted = useRef(true),
    saving = useRef<Promise<void> | null>(null),
    saved = useRef('');
  latest.current = draft;
  useEffect(() => {
    mounted.current = true;
    if (owner.current !== ns) {
      const fresh = { id: 'pack-draft:' + uid(), pack: blankPack(initial) };
      latest.current = fresh;
      setDraft(fresh);
      saved.current = '';
      setSelected('');
      setDrafts([]);
      owner.current = ns;
    }
    void studioDrafts(ns)
      .then((ds) => {
        if (mounted.current && currentNamespace() === ns) {
          setDrafts(ds);
          if (ds.incompleteCount)
            setError(
              `${ds.incompleteCount}份草稿尚未完整同步，请同步后刷新草稿列表。`,
            );
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      void persist().catch(() => {});
    };
  }, [ns]);
  async function persist() {
    if (saving.current) {
      await saving.current;
      if (JSON.stringify(latest.current.pack) !== saved.current)
        return persist();
      return;
    }
    const snapshot = latest.current;
    if (
      !snapshot.pack.manifest.title &&
      !snapshot.pack.questions.length &&
      !snapshot.pack.knowledge.length
    )
      return;
    const signature = JSON.stringify(snapshot.pack);
    if (signature === saved.current) return;
    if (mounted.current) setStatus('正在保存草稿…');
    saving.current = (async () => {
      try {
        const revision = await saveStudioDraft(snapshot, ns);
        if (currentNamespace() !== ns) return;
        if (latest.current.id === snapshot.id) {
          latest.current = { ...latest.current, revision };
          if (mounted.current)
            setDraft((d) => (d.id === snapshot.id ? { ...d, revision } : d));
        }
        saved.current = signature;
        if (mounted.current) {
          setStatus('草稿已保存');
          setDrafts((ds) => [
            { ...snapshot, revision, savedAt: new Date().toISOString() },
            ...ds.filter((d) => d.id !== snapshot.id),
          ]);
          setError('');
        }
      } catch (e) {
        if (mounted.current) {
          setError((e as Error).message);
          setStatus('保存失败，可下载备份');
        }
        throw e;
      }
    })();
    try {
      await saving.current;
    } finally {
      saving.current = null;
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      void persist().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [draft.pack]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        JSON.stringify(latest.current.pack) !== saved.current &&
        (latest.current.pack.questions.length ||
          latest.current.pack.knowledge.length ||
          latest.current.pack.manifest.title)
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const pack = draft.pack,
    q = pack.questions.find((q) => q.id === selected),
    filtered = pack.questions.filter((q) =>
      (q.prompt + ' ' + q.answer).toLowerCase().includes(search.toLowerCase()),
    );
  function update(pack: Pack) {
    setDraft((d) => ({ ...d, pack }));
    setStatus('有更改，稍后自动保存');
  }
  function change(patch: Partial<Question>) {
    if (q) update(changeQuestion(pack, q.id, patch));
  }
  async function choose(
    pack: Pack,
    id = 'pack-draft:' + uid(),
    revision?: string,
  ) {
    try {
      await persist();
      if (currentNamespace() !== ns) return;
      setDraft({ id, pack, revision });
      latest.current = { id, pack, revision };
      saved.current = revision ? JSON.stringify(pack) : '';
      setSelected(pack.questions[0]?.id ?? '');
      setTab(pack.questions.length ? 'question' : 'details');
      setCandidate(undefined);
      setError('');
      setDrafts(await studioDrafts(ns));
    } catch {}
  }
  async function openInstalled(id: string) {
    try {
      const installed = data.packs.find((p) => p.id === id),
        rows = await allRecords(ns),
        source = packVersions(rows).find(
          (r) => r.id === (installed as any)?.installationId,
        )?.payload.source;
      if (currentNamespace() !== ns) return;
      await choose(packFromInstalled(data, id, source));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      const result = await extractFile(file);
      if (!result.pack) throw Error('请选择JSON或ZIP学习包');
      await choose(result.pack);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function addQuestion() {
    const node =
      pack.knowledge.find((n) => n.id === q?.nodeId) ?? pack.knowledge[0];
    if (!node) {
      setError('请先添加一个知识点');
      setTab('knowledge');
      return;
    }
    const created = blankQuestion(node);
    update({ ...pack, questions: [...pack.questions, created] });
    setSelected(created.id);
    setTab('question');
    setSection('content');
  }
  async function publish() {
    try {
      const checked = readyStudioPack(pack);
      await persist();
      setCandidate(checked);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (candidate)
    return (
      <section className="studio-page">
        <header className="studio-heading">
          <div>
            <p className="eyebrow">LEARNING PACK STUDIO</p>
            <h1>确认学习包更新</h1>
          </div>
        </header>
        <PackUpdateReview
          pack={candidate}
          onDone={() => {
            setCandidate(undefined);
            notify('学习包已应用；历史作答记录保留');
          }}
          onCancel={() => setCandidate(undefined)}
        />
      </section>
    );
  return (
    <section className="studio-page">
      <header className="studio-heading">
        <div>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await persist();
                navigate('subjects', subject, 'materials');
              } catch {}
            }}
          >
            ← 返回资料库
          </button>
          <h1>学习包制作台</h1>
          <p role="status">{status} · 编辑草稿不会改动正式题库</p>
        </div>
        <div className="studio-tools">
          <button
            className="secondary"
            onClick={() => void persist().catch(() => {})}
          >
            保存草稿
          </button>
          <button
            className="secondary"
            onClick={() => {
              try {
                downloadPack(readyStudioPack(pack));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            导出学习包
          </button>
          <button className="primary" onClick={() => void publish()}>
            检查并应用
          </button>
        </div>
      </header>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      <div className="studio-layout">
        <aside className="studio-outline">
          <label>
            继续编辑
            <select
              value=""
              onChange={(e) => {
                const found = drafts.find((d) => d.id === e.target.value);
                if (found)
                  void choose(
                    found.id === latest.current.id
                      ? latest.current.pack
                      : found.pack,
                    found.id,
                    found.id === latest.current.id
                      ? latest.current.revision
                      : found.revision,
                  );
              }}
            >
              <option value="">选择已保存草稿</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.pack.manifest.title || '未命名草稿'}
                </option>
              ))}
            </select>
          </label>
          <label>
            编辑已安装的包
            <select
              value=""
              onChange={(e) => {
                try {
                  void openInstalled(e.target.value);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <option value="">选择学习包</option>
              {data.packs
                .filter(
                  (p) => p.id !== 'review-framework' && p.id !== 'review-core',
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.version}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={async () => {
              try {
                const result = await studioDrafts(ns);
                if (currentNamespace() !== ns) return;
                setDrafts(result);
                setError(
                  result.incompleteCount
                    ? `${result.incompleteCount}份草稿尚未完整同步`
                    : '',
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            刷新草稿列表
          </button>
          <div className="studio-tools">
            <button
              className="secondary"
              onClick={() => void choose(blankPack(initial))}
            >
              新建
            </button>
            <label className="studio-file-button">
              打开文件
              <input
                type="file"
                accept=".json,.zip"
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <nav className="studio-tabs" aria-label="制作内容">
            {[
              ['details', '学习包'],
              ['knowledge', '知识点'],
              ['question', '题目'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id as typeof tab)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="studio-question-tools">
            <input
              type="search"
              aria-label="搜索包内题目"
              placeholder="搜索题目"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="secondary" onClick={addQuestion}>
              ＋ 添加题目
            </button>
          </div>
          <ol className="studio-question-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  aria-current={q?.id === item.id ? 'page' : undefined}
                  onClick={() => {
                    setSelected(item.id);
                    setTab('question');
                  }}
                >
                  <b>{pack.questions.indexOf(item) + 1}</b>
                  <span>{item.prompt || '待填写题干'}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <div className="studio-editor">
          {tab === 'details' ? (
            <div className="studio-form">
              <h2>学习包信息</h2>
              <label>
                名称
                <input
                  value={pack.manifest.title}
                  maxLength={300}
                  onChange={(e) =>
                    update({
                      ...pack,
                      manifest: { ...pack.manifest, title: e.target.value },
                    })
                  }
                />
              </label>
              <div className="studio-field-grid">
                <label>
                  版本
                  <input
                    value={pack.manifest.version}
                    onChange={(e) =>
                      update({
                        ...pack,
                        manifest: { ...pack.manifest, version: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  学科
                  <select
                    value={pack.manifest.subject}
                    onChange={(e) =>
                      update({
                        ...pack,
                        manifest: { ...pack.manifest, subject: e.target.value },
                      })
                    }
                  >
                    <option value="all">多学科</option>
                    {SUBJECTS.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                简介
                <textarea
                  value={pack.manifest.description}
                  onChange={(e) =>
                    update({
                      ...pack,
                      manifest: {
                        ...pack.manifest,
                        description: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label>
                本次改动
                <textarea
                  value={pack.manifest.changelog}
                  onChange={(e) =>
                    update({
                      ...pack,
                      manifest: { ...pack.manifest, changelog: e.target.value },
                    })
                  }
                />
              </label>
              <p className="studio-note">
                {pack.knowledge.length} 个知识点 · {pack.questions.length} 道题
                · 包标识保持不变，更新通过差异检查后生效。
              </p>
            </div>
          ) : tab === 'knowledge' ? (
            <div className="studio-form">
              <div className="studio-heading">
                <h2>知识点与能力</h2>
                <button
                  className="secondary"
                  onClick={() =>
                    update({
                      ...pack,
                      knowledge: [
                        ...pack.knowledge,
                        blankNode(
                          SUBJECTS.some((s) => s.id === pack.manifest.subject)
                            ? (pack.manifest.subject as Subject)
                            : initial,
                        ),
                      ],
                    })
                  }
                >
                  添加知识点
                </button>
              </div>
              {pack.knowledge.map((n) => (
                <fieldset key={n.id}>
                  <legend>{n.title || '新知识点'}</legend>
                  <label>
                    名称
                    <input
                      value={n.title}
                      onChange={(e) =>
                        update({
                          ...pack,
                          knowledge: pack.knowledge.map((x) =>
                            x.id === n.id ? { ...x, title: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <div className="studio-field-grid">
                    <label>
                      章节
                      <input
                        value={n.chapter}
                        onChange={(e) =>
                          update({
                            ...pack,
                            knowledge: pack.knowledge.map((x) =>
                              x.id === n.id
                                ? { ...x, chapter: e.target.value }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      学科
                      <select
                        value={n.subject}
                        disabled={pack.questions.some((q) => q.nodeId === n.id)}
                        onChange={(e) =>
                          update({
                            ...pack,
                            knowledge: pack.knowledge.map((x) =>
                              x.id === n.id
                                ? { ...x, subject: e.target.value as Subject }
                                : x,
                            ),
                          })
                        }
                      >
                        {SUBJECTS.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    知识说明
                    <textarea
                      value={n.description}
                      onChange={(e) =>
                        update({
                          ...pack,
                          knowledge: pack.knowledge.map((x) =>
                            x.id === n.id
                              ? { ...x, description: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  {n.skills.map((skill) => (
                    <label key={skill.id}>
                      能力名称
                      <input
                        value={skill.title}
                        onChange={(e) =>
                          update({
                            ...pack,
                            knowledge: pack.knowledge.map((x) =>
                              x.id === n.id
                                ? {
                                    ...x,
                                    skills: x.skills.map((k) =>
                                      k.id === skill.id
                                        ? { ...k, title: e.target.value }
                                        : k,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="text-button"
                    onClick={() =>
                      update({
                        ...pack,
                        knowledge: pack.knowledge.map((x) =>
                          x.id === n.id
                            ? {
                                ...x,
                                skills: [
                                  ...x.skills,
                                  {
                                    id: 'skill:' + uid(),
                                    title: '',
                                    difficulty: 2,
                                  },
                                ],
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    添加能力
                  </button>
                </fieldset>
              ))}
              {!pack.knowledge.length && (
                <p>先创建本包的知识点，再添加题目。</p>
              )}
            </div>
          ) : q ? (
            <>
              <div className="studio-heading">
                <h2>第 {pack.questions.indexOf(q) + 1} 题</h2>
                <div className="studio-tools">
                  <button
                    aria-label="题目上移"
                    disabled={pack.questions.indexOf(q) === 0}
                    onClick={() =>
                      update({
                        ...pack,
                        questions: moveItem(
                          pack.questions,
                          pack.questions.indexOf(q),
                          pack.questions.indexOf(q) - 1,
                        ),
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    aria-label="题目下移"
                    disabled={
                      pack.questions.indexOf(q) === pack.questions.length - 1
                    }
                    onClick={() =>
                      update({
                        ...pack,
                        questions: moveItem(
                          pack.questions,
                          pack.questions.indexOf(q),
                          pack.questions.indexOf(q) + 1,
                        ),
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setUndo({
                        question: q,
                        index: pack.questions.indexOf(q),
                      });
                      update({
                        ...pack,
                        questions: pack.questions.filter((x) => x.id !== q.id),
                      });
                      setSelected('');
                    }}
                  >
                    移出草稿
                  </button>
                </div>
              </div>
              <nav className="studio-tabs" aria-label="题目编辑区域">
                {[
                  ['content', '题干与答案'],
                  ['illustration', '插图'],
                  ['grading', '评分'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={section === id ? 'page' : undefined}
                    onClick={() => setSection(id as typeof section)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {section === 'content' ? (
                <div className="studio-form">
                  <div className="studio-field-grid">
                    <label>
                      题型
                      <select
                        value={q.type}
                        onChange={(e) => {
                          if (e.target.value === q.type) return;
                          const type = e.target.value,
                            template = blankQuestion(
                              pack.knowledge.find((n) => n.id === q.nodeId)!,
                              type,
                            );
                          change({
                            type,
                            options: template.options,
                            matching: template.matching,
                            answer: '',
                            rubric:
                              type === 'subjective' ? q.rubric : undefined,
                            gradingRule:
                              type === 'subjective' ? q.gradingRule : undefined,
                          });
                        }}
                      >
                        {!QUESTION_TYPES.some((t) => t.id === q.type) && (
                          <option value={q.type}>{q.type}</option>
                        )}
                        {QUESTION_TYPES.map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      知识点
                      <select
                        value={q.nodeId}
                        onChange={(e) => {
                          const n = pack.knowledge.find(
                            (n) => n.id === e.target.value,
                          )!;
                          change({
                            nodeId: n.id,
                            subject: n.subject,
                            skillId: n.skills[0].id,
                          });
                        }}
                      >
                        {pack.knowledge.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.title || '待命名知识点'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      能力
                      <select
                        value={q.skillId}
                        onChange={(e) => change({ skillId: e.target.value })}
                      >
                        {pack.knowledge
                          .find((n) => n.id === q.nodeId)
                          ?.skills.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      难度
                      <select
                        value={q.difficulty}
                        onChange={(e) =>
                          change({ difficulty: Number(e.target.value) })
                        }
                      >
                        {[1, 2, 3, 4, 5].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    阅读材料（可选）
                    <textarea
                      rows={3}
                      value={q.passage ?? ''}
                      onChange={(e) => change({ passage: e.target.value })}
                    />
                  </label>
                  <label>
                    题干
                    <textarea
                      rows={5}
                      value={q.prompt}
                      onChange={(e) => change({ prompt: e.target.value })}
                    />
                  </label>
                  {q.type === 'choice' ? (
                    <fieldset>
                      <legend>选项与正确答案</legend>
                      {q.options?.map((option, i) => (
                        <div className="studio-option" key={i}>
                          <input
                            type="radio"
                            name="studio-correct"
                            aria-label={
                              '选 ' +
                              String.fromCharCode(65 + i) +
                              ' 为正确答案'
                            }
                            checked={!!option && q.answer === option}
                            onChange={() => change({ answer: option })}
                          />
                          <span>{String.fromCharCode(65 + i)}</span>
                          <input
                            aria-label={'选项 ' + String.fromCharCode(65 + i)}
                            value={option}
                            onChange={(e) =>
                              change({
                                options: q.options!.map((x, j) =>
                                  i === j ? e.target.value : x,
                                ),
                                ...(q.answer && q.answer === option
                                  ? { answer: e.target.value }
                                  : {}),
                              })
                            }
                          />
                          <button
                            disabled={q.options!.length <= 2}
                            aria-label={
                              '移除选项 ' + String.fromCharCode(65 + i)
                            }
                            onClick={() =>
                              change({
                                options: q.options!.filter((_, j) => j !== i),
                                ...(q.answer === option ? { answer: '' } : {}),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        className="text-button"
                        disabled={(q.options?.length ?? 0) >= 6}
                        onClick={() =>
                          change({ options: [...(q.options ?? []), ''] })
                        }
                      >
                        添加选项
                      </button>
                    </fieldset>
                  ) : q.type === 'matching' && q.matching ? (
                    <fieldset>
                      <legend>逐行编辑两组内容，选择真实配对</legend>
                      {q.matching.left.map((left, i) => (
                        <div className="studio-field-grid" key={left.id}>
                          <label>
                            左项 {i + 1}
                            <input
                              value={left.text}
                              onChange={(e) =>
                                change({
                                  matching: {
                                    ...q.matching!,
                                    left: q.matching!.left.map((x) =>
                                      x.id === left.id
                                        ? { ...x, text: e.target.value }
                                        : x,
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            右项 {i + 1}
                            <input
                              value={q.matching!.right[i]?.text ?? ''}
                              onChange={(e) =>
                                change({
                                  matching: {
                                    ...q.matching!,
                                    right: q.matching!.right.map((x, j) =>
                                      i === j
                                        ? { ...x, text: e.target.value }
                                        : x,
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            左项正确对应
                            <select
                              value={
                                matchingAnswer(q, q.answer)?.[left.id] ?? ''
                              }
                              onChange={(e) =>
                                change({
                                  answer: connectMatching(
                                    q,
                                    q.answer,
                                    left.id,
                                    e.target.value,
                                  ),
                                })
                              }
                            >
                              <option value="">请选择</option>
                              {q.matching!.right.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.text || '待填写右项'}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ))}
                      <button
                        className="text-button"
                        disabled={q.matching.left.length >= 10}
                        onClick={() =>
                          change({
                            matching: {
                              left: [
                                ...q.matching!.left,
                                { id: 'left:' + uid(), text: '' },
                              ],
                              right: [
                                ...q.matching!.right,
                                { id: 'right:' + uid(), text: '' },
                              ],
                            },
                          })
                        }
                      >
                        添加一组
                      </button>
                    </fieldset>
                  ) : (
                    <label>
                      参考答案
                      <textarea
                        rows={3}
                        value={q.answer}
                        onChange={(e) => change({ answer: e.target.value })}
                      />
                    </label>
                  )}
                  {q.type !== 'choice' && q.type !== 'matching' && (
                    <label>
                      其他可接受答案（每行一个）
                      <textarea
                        value={(q.acceptedAnswers ?? []).join('\n')}
                        onChange={(e) =>
                          change({
                            acceptedAnswers: e.target.value
                              .split('\n')
                              .filter((v) => v.trim()),
                          })
                        }
                      />
                    </label>
                  )}
                  <label>
                    解析
                    <textarea
                      rows={4}
                      value={q.explanation}
                      onChange={(e) => change({ explanation: e.target.value })}
                    />
                  </label>
                  <label>
                    分步解析（每行一步，可选）
                    <textarea
                      rows={3}
                      value={(q.solution ?? []).join('\n')}
                      onChange={(e) =>
                        change({
                          solution: e.target.value
                            .split('\n')
                            .filter((v) => v.trim()),
                        })
                      }
                    />
                  </label>
                  <div className="studio-field-grid">
                    <label>
                      建议用时（秒）
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        value={q.expectedSeconds}
                        onChange={(e) =>
                          change({ expectedSeconds: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      资料来源
                      <input
                        value={q.source}
                        onChange={(e) => change({ source: e.target.value })}
                      />
                    </label>
                  </div>
                  <details>
                    <summary>插入数学公式</summary>
                    <select
                      aria-label="公式插入位置"
                      value={formulaTarget}
                      onChange={(e) =>
                        setFormulaTarget(e.target.value as typeof formulaTarget)
                      }
                    >
                      <option value="prompt">题干</option>
                      <option value="answer">答案</option>
                      <option value="explanation">解析</option>
                    </select>
                    <MathAnswerInput
                      value={formula}
                      onChange={setFormula}
                      label="制作台数学公式"
                    />
                    <button
                      className="secondary"
                      disabled={
                        !formula.trim() ||
                        (q.type === 'choice' && formulaTarget === 'answer') ||
                        (q.type === 'matching' && formulaTarget === 'answer')
                      }
                      onClick={() => {
                        change({
                          [formulaTarget]:
                            q[formulaTarget] +
                            (q[formulaTarget] ? ' ' : '') +
                            '$' +
                            formula +
                            '$',
                        });
                        setFormula('');
                      }}
                    >
                      插入公式
                    </button>
                  </details>
                </div>
              ) : section === 'illustration' ? (
                <StudioIllustration key={q.id} question={q} change={change} />
              ) : (
                <RuleEditor
                  key={q.id}
                  question={q}
                  initial={q.gradingRule}
                  skills={pack.knowledge.find((n) => n.id === q.nodeId)?.skills}
                  onSave={(rule) => {
                    change({ gradingRule: rule, rubric: rule.criteria });
                    notify('评分标准已存入草稿');
                  }}
                  onCancel={() => setSection('content')}
                />
              )}
            </>
          ) : (
            <div className="studio-empty">
              <h2>选择或添加一道题</h2>
              <p>可打开已有学习包继续编辑，原题标识和学习记录会保留。</p>
              <button className="primary" onClick={addQuestion}>
                添加题目
              </button>
            </div>
          )}
          {undo && (
            <p role="status">
              已从草稿移出题目。
              <button
                className="text-button"
                onClick={() => {
                  const questions = pack.questions.slice();
                  if (!questions.some((q) => q.id === undo.question.id))
                    questions.splice(
                      Math.min(undo.index, questions.length),
                      0,
                      undo.question,
                    );
                  update({ ...pack, questions });
                  setUndo(undefined);
                }}
              >
                撤销
              </button>
            </p>
          )}
        </div>
        <aside className="studio-preview">
          <div className="studio-heading">
            <h2>实际题目预览</h2>
            <label>
              <input
                type="checkbox"
                checked={answerView}
                onChange={(e) => setAnswerView(e.target.checked)}
              />{' '}
              显示解析
            </label>
          </div>
          {q ? (
            <article>
              <MathText>{q.passage ?? ''}</MathText>
              <MathText>{q.prompt || '题干尚未填写'}</MathText>
              <QuestionVisual
                question={q}
                solution={answerView}
                stage={answerView ? 'solution' : 'question'}
              />
              {q.options?.map((o, i) => (
                <p key={i}>
                  <b>{String.fromCharCode(65 + i)}.</b> <MathText>{o}</MathText>
                </p>
              ))}
              {q.matching && (
                <div className="studio-matching-preview">
                  {q.matching.left.map((l, i) => (
                    <p key={l.id}>
                      {i + 1}. {l.text}{' '}
                      <span>
                        {String.fromCharCode(65 + i)}.{' '}
                        {q.matching!.right[i]?.text}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              {answerView && (
                <div className="studio-answer">
                  <b>参考答案</b>
                  <MathText>
                    {q.type === 'matching' && q.matching
                      ? q.matching.left
                          .map(
                            (l) =>
                              l.text +
                              ' → ' +
                              (q.matching!.right.find(
                                (r) =>
                                  r.id === matchingAnswer(q, q.answer)?.[l.id],
                              )?.text ?? '未配对'),
                          )
                          .join('；')
                      : q.answer}
                  </MathText>
                  <MathText>{q.explanation}</MathText>
                  {q.solution?.map((step, i) => (
                    <MathText key={i}>{step}</MathText>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <p>选中题目后，在此查看真实公式与题图。</p>
          )}
        </aside>
      </div>
    </section>
  );
}
