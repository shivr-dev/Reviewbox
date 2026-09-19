'use client';
import ManualImport from './manual-import';
import { parseImportText } from '@/lib/import-skill';
import {
  assertQuestionFormat,
  QUESTION_TYPES,
  wrongQuestions as getWrongQuestions,
} from '@/lib/question-tools';
import WrongNotebook from './wrong-notebook';
import ImportTemplates from './import-templates';
import MathText from './math-text';
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Plus,
  Search,
  ArrowRight,
  Download,
  FileText,
  Database,
  Package,
  Check,
  FolderOpen,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useReview } from './review-context';
import {
  SUBJECTS,
  uid,
  subjectName,
  type Subject,
  type Node,
  type Question,
  type Pack,
} from '@/lib/model';
import {
  put,
  saveRecords,
  installPack,
  exportBackup,
  restoreBackup,
} from '@/lib/store';
import {
  smartParse,
  extractFile,
  guessSubject,
  download,
  downloadPack,
  validatePack,
  questionSchema,
} from '@/lib/importer';
import { corePack } from '@/lib/seed';
import { Choice, Empty, Heading, SubjectChoice, dateLabel } from './shared';
export default function LibraryView() {
  const { data, refresh, start, notify } = useReview();
  const [tab, setTab] = useState('materials'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [importOpen, setImportOpen] = useState(false),
    [editorOpen, setEditorOpen] = useState(false),
    [text, setText] = useState(''),
    [name, setName] = useState('我的学习资料'),
    [subject, setSubject] = useState<Subject>('chinese'),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState<{
      nodes: Node[];
      questions: Question[];
      pack?: Pack;
      backup?: any;
    } | null>(null),
    [remotePacks, setRemotePacks] = useState<Pack[]>([]),
    [nodeId, setNodeId] = useState(''),
    [skillId, setSkillId] = useState(''),
    [type, setType] = useState('recall'),
    [difficulty, setDifficulty] = useState('2'),
    [newNodeTitle, setNewNodeTitle] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const chosenNode = data.nodes.find((n) => n.id === nodeId);
  const visibleNodes = data.nodes.filter((n) => n.subject === subject);
  const questions = data.questions.filter(
    (q) =>
      (filter === 'all' || q.subject === filter) &&
      (q.prompt + q.answer + data.nodes.find((n) => n.id === q.nodeId)?.title)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const wrongQuestions = getWrongQuestions(data);

  async function file(file?: File) {
    if (!file) return;
    setBusy(true);
    setName(file.name);
    try {
      const v = await extractFile(file);
      if (v.pack) {
        setStage({
          nodes: v.pack.knowledge,
          questions: v.pack.questions,
          pack: v.pack,
        });
        setText('');
      } else if (v.backup) {
        setStage({ nodes: [], questions: [], backup: v.backup });
      } else {
        setText(v.text ?? '');
        setSubject(guessSubject(v.text ?? ''));
        setStage(null);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '文件解析失败');
    } finally {
      setBusy(false);
    }
  }
  async function acceptImport() {
    if (!stage) return;
    setBusy(true);
    try {
      if (stage.backup) {
        const count = await restoreBackup(stage.backup);
        notify(`已合并 ${count} 条备份记录`);
      } else if (stage.pack) {
        await installPack(stage.pack);
        notify('学习包已安装，个人学习记录已保留');
      } else {
        const now = new Date().toISOString();
        const material = {
          id: uid(),
          name,
          subject,
          text: text.slice(0, 300000),
          nodeIds: stage.nodes.map((n) => n.id),
          date: now,
          type: 'import',
        };
        await saveRecords([
          ...stage.nodes.map((payload) => ({
            id: payload.id,
            kind: 'node' as const,
            payload,
            updated_at: now,
            deleted: false,
          })),
          ...stage.questions.map((payload) => ({
            id: payload.id,
            kind: 'question' as const,
            payload,
            updated_at: now,
            deleted: false,
          })),
          {
            id: material.id,
            kind: 'material',
            payload: material,
            updated_at: now,
            deleted: false,
          },
        ]);
        notify(
          `已导入 ${stage.nodes.length} 个知识点与 ${stage.questions.length} 道题目`,
        );
      }
      await refresh();
      setImportOpen(false);
      setStage(null);
      setText('');
    } catch (e) {
      notify(e instanceof Error ? e.message : '导入未完成');
    } finally {
      setBusy(false);
    }
  }
  async function saveQuestion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      let n = chosenNode;
      if (!n) {
        if (!newNodeTitle.trim())
          throw new Error('请选择知识点或输入新知识点名称');
        n = {
          id: uid(),
          subject,
          course: '我的课程',
          unit: '自建内容',
          chapter: '自建内容',
          title: newNodeTitle.trim(),
          description: String(form.get('explanation') ?? ''),
          prerequisites: [],
          relatedNodes: [],
          importance: 0.7,
          examWeight: 0.7,
          skills: [{ id: 'recall', title: '内容理解', difficulty: 1 }],
          source: '我的题目',
          version: '1.0.0',
        };
      }
      const skill = skillId || n.skills[0].id;
      const prompt = String(form.get('prompt') ?? '').trim(),
        answer = String(form.get('answer') ?? '').trim();
      const explanation = String(form.get('explanation') ?? '').trim();
      const raw = {
        schemaVersion: 1,
        id: uid(),
        nodeId: n.id,
        skillId: skill,
        subject: n.subject,
        type,
        prompt,
        answer,
        explanation,
        difficulty: Number(difficulty),
        expectedSeconds: type === 'subjective' ? 120 : 30,
        variant: 'user-' + type,
        source: String(form.get('source') ?? '') || '我的题目',
        tags: String(form.get('tags') ?? '')
          .split(/[,，]/)
          .filter(Boolean),
        version: '1.0.0',
        ...(type === 'choice'
          ? {
              options: String(form.get('options') ?? '')
                .split('\n')
                .filter(Boolean),
            }
          : {}),
        ...(type === 'subjective'
          ? {
              passage: String(form.get('passage') ?? ''),
              rubric: String(form.get('rubric') ?? '')
                .split('\n')
                .filter(Boolean)
                .map((r, i) => ({
                  id: 'criterion-' + i,
                  title: r,
                  max: 2,
                  description: r,
                  skillId: skill,
                })),
            }
          : {}),
      };
      if (type === 'matching') {
        const pairs = String(form.get('pairs') ?? '')
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('=>').map((x) => x.trim()));
        if (
          pairs.length < 2 ||
          pairs.some((x) => x.length !== 2 || !x[0] || !x[1])
        )
          throw new Error('每行填写 左侧 => 右侧，至少两组');
        Object.assign(raw, {
          matching: {
            left: pairs.map((x, i) => ({ id: 'L' + i, text: x[0] })),
            right: pairs.map((x, i) => ({ id: 'R' + i, text: x[1] })).reverse(),
          },
          answer: JSON.stringify(
            Object.fromEntries(pairs.map((_, i) => ['L' + i, 'R' + i])),
          ),
          explanation:
            pairs.map((x) => x[0] + ' → ' + x[1]).join('\n') +
            (explanation ? '\n' + explanation : ''),
        });
      }
      const q = questionSchema.parse(raw) as Question;
      assertQuestionFormat(q);
      if (type === 'subjective' && !q.rubric?.length)
        throw new Error('请填写至少一个评分点');
      if (
        type === 'choice' &&
        (!q.options?.length || !q.options.includes(answer))
      )
        throw new Error('选择题答案必须与某一选项完全一致');
      const now = new Date().toISOString();
      await saveRecords([
        { id: n.id, kind: 'node', payload: n, updated_at: now, deleted: false },
        {
          id: q.id,
          kind: 'question',
          payload: q,
          updated_at: now,
          deleted: false,
        },
      ]);
      await refresh();
      setEditorOpen(false);
      notify('题目已保存并关联知识能力');
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存未完成');
    } finally {
      setBusy(false);
    }
  }
  const packs = [
    corePack,
    ...remotePacks.filter((p) => p.manifest.id !== corePack.manifest.id),
  ];
  return (
    <>
      <Heading
        eyebrow="YOUR LEARNING LIBRARY"
        title="把资料，变成自己的知识。"
        description="个人资料和学习记录只同步到自己的云端账户。"
        action={
          <div className="button-row">
            <ManualImport />
            <button
              className="primary"
              onClick={() => {
                setStage(null);
                setImportOpen(true);
              }}
            >
              <Upload size={16} />
              智能导入
            </button>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="page-tabs">
          <TabsTrigger value="materials">学习资料</TabsTrigger>
          <TabsTrigger value="questions">题目库</TabsTrigger>
          <TabsTrigger value="content">我的学习包</TabsTrigger>
          <TabsTrigger value="data">数据中心</TabsTrigger>
        </TabsList>
        <TabsContent value="materials">
          <div
            className="import-callout"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setImportOpen(true);
              void file(e.dataTransfer.files[0]);
            }}
          >
            <span className="import-icon">
              <Upload size={25} />
            </span>
            <div className="grow">
              <h2>课件、笔记、字词，都可以从这里开始</h2>
              <p className="muted">
                PDF · DOCX · PPTX · 图片 · 文本 · JSON · CSV · Excel
              </p>
            </div>
            <button className="secondary" onClick={() => setImportOpen(true)}>
              选择文件或粘贴文字
              <ArrowRight size={16} />
            </button>
          </div>
          {data.materials.length ? (
            <div className="material-grid">
              {data.materials.map((m) => (
                <section className="panel" key={m.id}>
                  <FileText size={21} />
                  <h3>{m.name}</h3>
                  <p className="muted">
                    {subjectName(m.subject)} · {m.nodeIds.length} 个知识点 ·{' '}
                    {dateLabel(m.date)}
                  </p>
                  <details>
                    <summary>查看提取内容</summary>
                    <p className="pre-wrap">{m.text}</p>
                  </details>
                  <button
                    className="quiet"
                    onClick={() => {
                      const qs = data.questions.filter((q) =>
                        m.nodeIds.includes(q.nodeId),
                      );
                      start(
                        qs.slice(0, 12).map((q) => ({
                          question: q,
                          reason: '资料复习',
                          priority: 1,
                        })),
                      );
                    }}
                  >
                    复习这份资料
                    <ArrowRight size={14} />
                  </button>
                </section>
              ))}
            </div>
          ) : (
            <section className="panel">
              <Empty title="你的课程资料，在这里相遇">
                导入后先检查识别内容，再加入自己的知识地图。
              </Empty>
            </section>
          )}
        </TabsContent>
        <TabsContent value="questions">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索题目或知识点"
                aria-label="搜索题目"
              />
            </div>
            <SubjectChoice value={filter} onChange={setFilter} all />
            <button className="secondary" onClick={() => setEditorOpen(true)}>
              <Plus size={16} />
              新建题目
            </button>
          </div>
          <p className="inline-hint">
            共 {questions.length} 道题目 · 每道题都关联一个知识点与具体能力
          </p>
          <div className="panel question-list">
            {questions.slice(0, 100).map((q) => (
              <details key={q.id}>
                <summary>
                  <span className="grow">
                    <b>
                      <MathText>{q.prompt}</MathText>
                    </b>
                    <small>
                      {subjectName(q.subject)} ·{' '}
                      {data.nodes.find((n) => n.id === q.nodeId)?.title} ·{' '}
                      {QUESTION_TYPES.find((t) => t.id === q.type)?.label ??
                        '回忆题'}
                    </small>
                  </span>
                  <span className="reason-pill">难度 {q.difficulty}</span>
                </summary>
                <div className="question-list-answer">
                  <p className="pre-wrap">
                    <MathText>
                      {q.type === 'matching' ? '配对结果见下方解析' : q.answer}
                    </MathText>
                  </p>
                  <p className="muted">
                    <MathText>{q.explanation}</MathText>
                  </p>
                  <div className="button-row">
                    <button
                      className="quiet"
                      onClick={() =>
                        start([
                          { question: q, reason: '自由练习', priority: 1 },
                        ])
                      }
                    >
                      练习这道题
                      <ArrowRight size={14} />
                    </button>
                    <span className="muted">
                      {q.source}
                      {q.verified ? ' · 已核验' : ''}
                    </span>
                  </div>
                </div>
              </details>
            ))}
            {!questions.length && (
              <Empty title="没有找到题目">
                可以导入资料，或用表单建立第一道题。
              </Empty>
            )}
          </div>
        </TabsContent>
        <TabsContent value="content">
          <div className="content-heading">
            <h2>学习包</h2>
            <p className="muted">个人学习包与可选示例；不会公开上传或分享。</p>
          </div>
          <div className="pack-grid">
            {packs.map((p) => {
              const installed = data.packs.find((x) => x.id === p.manifest.id);
              return (
                <section className="panel pack-card" key={p.manifest.id}>
                  <div className="section-head">
                    <span className="pack-icon">
                      <Package size={24} />
                    </span>
                    <span className="subtle-badge">v{p.manifest.version}</span>
                  </div>
                  <h2>{p.manifest.title}</h2>
                  <p className="muted">{p.manifest.description}</p>
                  <div className="pack-meta">
                    <span>{p.knowledge.length} 个知识点</span>
                    <span>{p.questions.length} 道题目</span>
                    <span>{p.manifest.compatibility}</span>
                  </div>
                  <details>
                    <summary>更新说明</summary>
                    <p>{p.manifest.changelog}</p>
                  </details>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={data.questions.some(
                        (q) => q.id === p.questions[0]?.id,
                      )}
                      onClick={async () => {
                        await installPack(p);
                        await refresh();
                        notify('学习包已安装');
                      }}
                    >
                      {installed?.version === p.manifest.version ? (
                        <>
                          <Check size={15} />
                          已安装
                        </>
                      ) : installed ? (
                        '更新学习包'
                      ) : (
                        '安装学习包'
                      )}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => downloadPack(p)}
                    >
                      <Download size={15} />
                      下载
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
          <section className="panel">
            <h2>打包自己的课程</h2>
            <p className="muted">
              导出题目、知识点和评分标准，保存在自己的设备中，或用于私有云端备份。
            </p>
            <button
              className="secondary"
              onClick={() => {
                const ns = data.nodes.filter((n) => !n.id.startsWith('core-'));
                if (!ns.length) {
                  notify('先导入或创建一些自己的内容');
                  return;
                }
                downloadPack({
                  schemaVersion: 1,
                  manifest: {
                    id: 'my-learning-pack',
                    title: '我的学习包',
                    subject: 'all',
                    version: '1.0.0',
                    description: '个人整理的学习内容',
                    changelog: '自建学习内容',
                    compatibility: 'Review 1.x',
                  },
                  knowledge: ns,
                  questions: data.questions.filter((q) =>
                    ns.some((n) => n.id === q.nodeId),
                  ),
                });
              }}
            >
              <Download size={15} />
              导出自建学习包
            </button>
          </section>
        </TabsContent>
        <TabsContent value="data">
          <WrongNotebook />
          <div className="subject-stat-row">
            {[
              [
                '个人题目',
                data.questions.filter((q) => !q.id.startsWith('core-')).length,
              ],
              ['学习记录', data.events.length],
              ['错题', wrongQuestions.length],
              ['笔记', data.notes.length],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="home-columns">
            <section className="panel">
              <h2>我的备份</h2>
              <p className="muted">
                导出本设备完整学习数据，包括知识、掌握记录、笔记和计划。
              </p>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={async () =>
                    download(
                      'review-backup-' +
                        new Date().toISOString().slice(0, 10) +
                        '.json',
                      await exportBackup(),
                    )
                  }
                >
                  <Download size={16} />
                  导出完整备份
                </button>
                <button
                  className="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  <Upload size={16} />
                  恢复备份
                </button>
              </div>
              <p className="inline-hint">
                备份含个人作答内容，请保存在自己的设备中。
              </p>
            </section>
            <section className="panel">
              <h2>错题再看</h2>
              <p className="muted">只保留仍未通过后续练习巩固的题目。</p>
              <div className="practice-count">
                {wrongQuestions.length}
                <span>道需要回看</span>
              </div>
              <button
                className="secondary"
                disabled={!wrongQuestions.length}
                onClick={() =>
                  start(
                    wrongQuestions.slice(0, 15).map((q) => ({
                      question: q,
                      reason: '错题复习',
                      priority: 1,
                    })),
                  )
                }
              >
                开始错题复习
                <ArrowRight size={16} />
              </button>
            </section>
          </div>
          <section className="panel">
            <div className="section-head">
              <h2>最近学习记录</h2>
              <span className="muted">记录保存在本地，同步后可跨设备查看</span>
            </div>
            {data.events
              .slice(-40)
              .reverse()
              .map((e) => (
                <div className="queue-row" key={e.id}>
                  <div className="grow">
                    <h3>{data.nodes.find((n) => n.id === e.nodeId)?.title}</h3>
                    <p className="muted">
                      {dateLabel(e.occurredAt)} · 思考{' '}
                      {(e.activeThinkMs / 1000).toFixed(1)} 秒 ·{' '}
                      {e.source === 'rubric' ? '评分标准批改' : '自主判断'}
                    </p>
                  </div>
                  <span className={'outcome ' + e.outcome}>
                    {e.outcome === 'correct'
                      ? '答对'
                      : e.outcome === 'unsure'
                        ? '不确定'
                        : '答错'}
                  </span>
                </div>
              ))}
            {!data.events.length && (
              <Empty title="每一次复习，都会被认真记录" />
            )}
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="import-dialog">
          <DialogTitle>智能导入</DialogTitle>
          <DialogDescription>
            粘贴内容或选择文件，确认识别结果后加入学习。
          </DialogDescription>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv,.tsv,.xlsx,.xls,.zip,image/*"
            onChange={(e) => void file(e.target.files?.[0])}
          />
          {stage ? (
            <>
              <div className="import-result">
                <Check size={21} />
                <div>
                  <h3>
                    {stage.backup
                      ? '准备恢复学习备份'
                      : stage.pack
                        ? stage.pack.manifest.title
                        : `识别到 ${stage.nodes.length} 个知识点`}
                  </h3>
                  <p className="muted">
                    {stage.backup
                      ? '按记录合并，不重复计算答题事件'
                      : `${stage.questions.length} 道相关练习 · 检查后确认导入`}
                  </p>
                </div>
              </div>
              <div className="import-preview">
                {stage.nodes.slice(0, 40).map((n) => (
                  <div key={n.id}>
                    <b>{n.title}</b>
                    <small>
                      {subjectName(n.subject)} ·{' '}
                      {n.skills.map((s) => s.title).join(' / ')}
                    </small>
                    <p>
                      <MathText>{n.description.slice(0, 160)}</MathText>
                    </p>
                  </div>
                ))}
              </div>
              <div className="button-row">
                <button className="secondary" onClick={() => setStage(null)}>
                  返回编辑
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={acceptImport}
                >
                  {busy ? '正在保存…' : '确认导入'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} />
                  {busy ? '正在识别文件…' : '选择文件'}
                </button>
                <span className="muted">最多 15 MB · 图片识别首次需要联网</span>
              </div>
              <label>
                资料名称
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label>
                粘贴学习内容（也支持按模板手动填写 JSON）
                <textarea
                  rows={8}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSubject(guessSubject(e.target.value));
                  }}
                  maxLength={300000}
                  placeholder={
                    '例如：\n沮丧 jǔ sàng\n狼藉 láng jí\n蹒跚 pán shān\n\n或：Suspense: uncertainty and anticipation about what happens next.'
                  }
                />
              </label>
              <label>
                识别学科，可调整
                <SubjectChoice
                  value={subject}
                  onChange={(s) => setSubject(s as Subject)}
                />
              </label>
              <ImportTemplates
                onUse={(value) => {
                  setText(value);
                  setSubject(guessSubject(value));
                }}
              />
              <p className="inline-hint">
                基础识别按段落、词条和问答结构提取；复杂课件请在确认前检查。整套课程可导入带版本的学习包。
              </p>
              <button
                className="primary"
                disabled={!text.trim() || busy}
                onClick={() => {
                  try {
                    const result = parseImportText(text, subject);
                    if (!result.nodes.length)
                      throw new Error('没有识别到有效内容');
                    setStage(result);
                  } catch (e) {
                    notify(String(e));
                  }
                }}
              >
                识别并预览
                <ArrowRight size={16} />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="editor-dialog">
          <DialogTitle>新建题目</DialogTitle>
          <DialogDescription>
            题目、知识点与能力连接后，练习才会影响掌握度。
          </DialogDescription>
          <form onSubmit={saveQuestion}>
            <div className="form-grid">
              <label>
                学科
                <SubjectChoice
                  value={subject}
                  onChange={(v) => {
                    setSubject(v as Subject);
                    setNodeId('');
                    setSkillId('');
                  }}
                />
              </label>
              <label>
                知识点
                <Choice
                  label="知识点"
                  value={nodeId}
                  onChange={(v) => {
                    setNodeId(v);
                    setSkillId('');
                  }}
                  options={[
                    { value: '', label: '建立新知识点' },
                    ...visibleNodes.map((n) => ({
                      value: n.id,
                      label: n.title,
                    })),
                  ]}
                />
              </label>
              {!nodeId && (
                <label>
                  新知识点名称
                  <input
                    required
                    value={newNodeTitle}
                    onChange={(e) => setNewNodeTitle(e.target.value)}
                    maxLength={100}
                  />
                </label>
              )}
              {chosenNode && (
                <label>
                  能力
                  <Choice
                    label="能力"
                    value={skillId || chosenNode.skills[0].id}
                    onChange={setSkillId}
                    options={chosenNode.skills.map((s) => ({
                      value: s.id,
                      label: s.title,
                    }))}
                  />
                </label>
              )}
              <label>
                题目类型
                <Choice
                  label="题目类型"
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'recall', label: '回忆题' },
                    { value: 'blank', label: '填空题' },
                    { value: 'matching', label: '连线题' },
                    { value: 'pinyin', label: '看拼音写汉字' },
                    { value: 'choice', label: '选择题' },
                    { value: 'subjective', label: '主观题' },
                  ]}
                />
              </label>
              <label>
                难度
                <Choice
                  label="题目难度"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={['1', '2', '3', '4', '5'].map((n) => ({
                    value: n,
                    label: n,
                  }))}
                />
              </label>
            </div>
            <label>
              题干
              <textarea name="prompt" required rows={3} maxLength={12000} />
            </label>
            {type === 'matching' && (
              <label>
                配对内容（每行：左侧 =&gt; 右侧）
                <textarea
                  name="pairs"
                  rows={5}
                  required
                  placeholder={'Suspense => 悬念\nImagery => 意象'}
                />
              </label>
            )}
            {type === 'choice' && (
              <label>
                选项（每行一个，含 A. / B. 等标签）
                <textarea name="options" required rows={4} />
              </label>
            )}
            <label>
              标准答案
              <textarea
                name="answer"
                required={type !== 'matching'}
                disabled={type === 'matching'}
                placeholder={type === 'matching' ? '根据配对内容自动生成' : ''}
                rows={3}
                maxLength={12000}
              />
            </label>
            <label>
              解释或解题过程
              <textarea name="explanation" rows={3} maxLength={12000} />
            </label>
            {type === 'subjective' && (
              <>
                <label>
                  原文或材料
                  <textarea name="passage" rows={3} />
                </label>
                <label>
                  评分点（每行一项，每项 2 分）
                  <textarea
                    name="rubric"
                    required
                    rows={3}
                    placeholder={'核心观点准确\n使用具体证据\n分析清晰'}
                  />
                </label>
              </>
            )}
            <div className="form-grid">
              <label>
                标签
                <input name="tags" placeholder="用逗号分隔" />
              </label>
              <label>
                来源
                <input name="source" placeholder="教材、笔记或自编" />
              </label>
            </div>
            <button className="primary" disabled={busy} type="submit">
              {busy ? '正在保存…' : '保存题目'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
