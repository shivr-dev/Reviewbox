'use client';
import ManualImport from './manual-import';
import { pinyinCollections, pinyinPracticeQueue } from '@/lib/pinyin-collections';
import {
  wrongQuestions,
  isPinyin,
  QUESTION_TYPES,
  blindSpots,
} from '@/lib/question-tools';
import { FullExamHub } from './exam-hub';
import ToeflPractice from './toefl-practice';
import PeriodicTable from './periodic-table';
import CourseHub from './course-hub';
import { useState } from 'react';
import {
  ArrowRight,
  Plus,
  Search,
  Network,
  Check,
  ArrowUpRight,
  BookOpen,
  FileText,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useReview } from './review-context';
import { SUBJECTS, keyOf, uid, type Node, type Subject } from '@/lib/model';
import { nodeMastery, buildQueue, forgettingRisk } from '@/lib/engine';
import { put } from '@/lib/store';
import { generateVerified, resumeVerifiedJob } from '@/lib/ai-client';
import { reactions } from '@/lib/seed';
import {
  Choice,
  Empty,
  Heading,
  Meter,
  SubjectChoice,
  dateLabel,
} from './shared';
import AnalyticsView from './analytics-view';
export default function SubjectsView() {
  const { data, states, subject, navigate, start, refresh, notify, aiReady } =
    useReview();
  const [tab, setTab] = useState('review'),
    [search, setSearch] = useState(''),
    [node, setNode] = useState<Node | null>(null),
    [note, setNote] = useState(''),
    [noteNode, setNoteNode] = useState(''),
    [difficulty, setDifficulty] = useState('2'),
    [style, setStyle] = useState('SAT'),
    [count, setCount] = useState('5'),
    [skillId, setSkillId] = useState(''),
    [generating, setGenerating] = useState(''),
    [generationNodeId, setGenerationNodeId] = useState(''),
    [scope, setScope] = useState<string[]>([]),
    [testType, setTestType] = useState('chapter'),
    [reaction, setReaction] = useState(reactions[0]);
  const [practiceSource, setPracticeSource] = useState('all'),
    [practiceType, setPracticeType] = useState('all'),
    [pinyinCollection, setPinyinCollection] = useState('all'),
    [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const s = SUBJECTS.find((s) => s.id === subject);
  const nodes = data.nodes.filter((n) => !s || n.subject === s.id);
  const selectedQuestions = (
    practiceSource === 'wrong'
      ? wrongQuestions(data)
      : practiceSource === 'blind'
        ? blindSpots(data)
        : data.questions
  ).filter(
    (q) =>
      practiceType === 'all' ||
      (practiceType === 'pinyin' ? isPinyin(q) : q.type === practiceType),
  );
  const subjectQuestions = selectedQuestions.filter((q) => !s || q.subject === s.id);
  const collections = s?.id === 'chinese' ? pinyinCollections(data.questions, data.nodes) : [];
  const fullPinyin = s?.id === 'chinese' && subjectQuestions.length > 0 &&
    (practiceType === 'pinyin' || subjectQuestions.every(isPinyin));
  const queue = fullPinyin
    ? pinyinPracticeQueue(subjectQuestions, pinyinCollection).map((item) => ({
        ...item,
        reason: practiceSource === 'wrong' ? '错题专项' : practiceSource === 'blind' ? '信心校准' : '篇目字词',
      }))
    : practiceSource === 'all'
      ? buildQueue(
          { ...data, questions: selectedQuestions },
          { subject: s?.id, practice: true },
        )
      : subjectQuestions
          .slice(0, 20)
          .map((q) => ({
            question: q,
            reason: practiceSource === 'blind' ? '信心校准' : '错题专项',
            priority: 1,
          }));
  async function transfer() {
    const q =
      wrongQuestions(data).find((q) => q.subject === s?.id) ??
      data.questions.find((q) => q.subject === s?.id);
    const n = data.nodes.find((n) => n.id === q?.nodeId);
    if (!q || !n) {
      notify('先完成一道练习，再进行迁移挑战');
      return;
    }
    try {
      setGenerating('正在准备迁移挑战');
      const next = await generateVerified(
        n,
        n.skills.find((sk) => sk.id === q.skillId)!,
        q.difficulty,
        '迁移挑战',
        [q.prompt],
        setGenerating,
        { questionType: q.type, transferFrom: q },
      );
      await refresh();
      start([{ question: next, reason: '迁移挑战', priority: 1 }]);
    } catch (e) {
      notify(e instanceof Error ? e.message : '暂未完成');
    } finally {
      setGenerating('');
    }
  }

  async function generateSet(forTest = false) {
    if (!s || !nodes.length) return;
    const eligible =
      forTest && testType !== 'subject'
        ? nodes.filter((n) => scope.includes(n.id))
        : nodes.slice();
    if (!eligible.length) {
      notify('请先选择测试范围');
      return;
    }
    try {
      let made = 0;
      for (let i = 0; i < Number(count); i++) {
        const n =
          (!forTest
            ? eligible.find((n) => n.id === generationNodeId)
            : undefined) ??
          eligible.sort(
            (a, b) =>
              (nodeMastery(a, states) ?? 0.35) -
              (nodeMastery(b, states) ?? 0.35),
          )[i % eligible.length];
        const sk =
          n.skills.find((x) => x.id === skillId) ??
          n.skills[i % n.skills.length];
        await generateVerified(
          n,
          sk,
          Number(difficulty),
          s.id === 'ce' ? style : '专项训练',
          data.events
            .filter((e) => e.nodeId === n.id && e.score < 0.6)
            .slice(-5)
            .map(
              (e) =>
                data.questions.find((q) => q.id === e.questionId)?.prompt ?? '',
            ),
          (msg) => setGenerating(`${msg} · ${made + 1}/${count}`),
          {
            questionType: questionTypes.length
              ? questionTypes[i % questionTypes.length]
              : undefined,
          },
        );
        made++;
        await refresh();
      }
      notify(`已准备 ${made} 道核验练习`);
    } catch (e) {
      notify(
        e instanceof Error ? e.message : '准备未完成，已通过的题目保留在题池中',
      );
    } finally {
      setGenerating('');
    }
  }
  if (!s)
    return (
      <>
        <Heading
          eyebrow="YOUR SUBJECTS"
          title="八门学科，一张知识地图。"
          description="从章节走向知识点，再找到具体需要练习的能力。"
        />
        <div className="subject-large-grid">
          {SUBJECTS.map((s, i) => {
            const ns = data.nodes.filter((n) => n.subject === s.id);
            const assessed = ns
              .map((n) => nodeMastery(n, states))
              .filter((x) => x !== null) as number[];
            return (
              <button
                className="panel subject-large"
                key={s.id}
                onClick={() => navigate('subjects', s.id)}
              >
                <div className="section-head">
                  <span className={'subject-icon s' + i}>{s.glyph}</span>
                  <ArrowUpRight size={17} />
                </div>
                <h2>{s.name}</h2>
                <p className="muted">{s.course}</p>
                <Meter
                  value={
                    assessed.length
                      ? assessed.reduce((a, b) => a + b, 0) / assessed.length
                      : null
                  }
                  color={s.color}
                />
                <div className="subject-large-bottom">
                  <span>{ns.length} 个知识点</span>
                  <span>
                    {data.questions.filter((q) => q.subject === s.id).length}{' '}
                    道练习
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  const chooseNode = (n: Node) => {
    setNode(n);
    setSkillId(n.skills[0].id);
  };
  return (
    <>
      <Heading
        eyebrow={s.en.toUpperCase()}
        title={s.name}
        description={s.course + ' · 课程、练习与能力评估'}
        action={
          <div className="button-row">
            <ManualImport key={s.id} subject={s.id} />
            <button
              className="primary"
              disabled={!queue.length}
              onClick={() => start(queue)}
            >
              开始专项练习
              <ArrowRight size={16} />
            </button>
          </div>
        }
      />
      <div className="subject-stat-row">
        <div>
          <span>知识点</span>
          <strong>{nodes.length}</strong>
        </div>
        <div>
          <span>已评估</span>
          <strong>
            {nodes.filter((n) => nodeMastery(n, states) !== null).length}
          </strong>
        </div>
        <div>
          <span>薄弱能力</span>
          <strong>
            {
              Object.values(states).filter(
                (st) =>
                  nodes.some((n) => n.id === st.nodeId) &&
                  st.attemptCount &&
                  st.mastery < 0.6,
              ).length
            }
          </strong>
        </div>
        <div>
          <span>最近练习</span>
          <strong className="date-stat">
            {dateLabel(
              data.events.filter((e) => e.subject === s.id).at(-1)
                ?.occurredAt ?? null,
            )}
          </strong>
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="page-tabs">
          {[
            ['review', '复习'],
            ['practice', '练习'],
            ['notes', '笔记'],
            ['tests', '测试'],
            ['knowledge', '知识与分析'],
            ['materials', '资料'],
            ...(s.id === 'chemistry' ? [['periodic', '元素周期表']] : []),
          ].map(([id, title]) => (
            <TabsTrigger key={id} value={id}>
              {title}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="review">
          <CourseHub subject={s.id} />
        </TabsContent>
        <TabsContent value="knowledge">
          <details className="panel subject-analysis-summary">
            <summary>能力表现与遗忘风险</summary>
            <AnalyticsView subject={s.id} embedded />
          </details>
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="搜索知识点"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索知识点、章节或能力"
              />
            </div>
            <span className="muted">
              {nodes.length} 个知识点 ·{' '}
              {nodes.reduce((a, n) => a + n.skills.length, 0)} 种能力
            </span>
          </div>
          <div className="panel knowledge-list">
            {nodes
              .filter((n) =>
                (n.title + n.chapter + n.skills.map((s) => s.title).join(' '))
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((n) => (
                <button
                  className="knowledge-row"
                  key={n.id}
                  onClick={() => chooseNode(n)}
                >
                  <span className="node-tree-icon">
                    <Network size={16} />
                  </span>
                  <div className="grow">
                    <h3>{n.title}</h3>
                    <p className="muted">
                      {n.chapter} · {n.skills.length} 种能力
                      {n.prerequisites.length ? ' · 含前置知识' : ''}
                    </p>
                  </div>
                  <Meter value={nodeMastery(n, states)} color={s.color} />
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
          {s.id === 'chemistry' && (
            <section className="panel">
              <div className="section-head">
                <h2>化学反应图谱</h2>
                <span className="muted">点击反应，查看条件与现象</span>
              </div>
              <div className="reaction-map">
                {reactions.map((r) => (
                  <button
                    key={r.id}
                    className={reaction.id === r.id ? 'active' : ''}
                    onClick={() => setReaction(r)}
                  >
                    <b>{r.from}</b>
                    <span>
                      <small>{r.condition}</small>⟶
                    </span>
                    <b>{r.to}</b>
                  </button>
                ))}
              </div>
              <div className="reaction-detail">
                <h3>{reaction.equation}</h3>
                <p>
                  反应物：{reaction.reactants}　生成物：{reaction.products}
                </p>
                <p>
                  条件：{reaction.condition}　现象：{reaction.phenomenon}
                </p>
                <button
                  className="quiet"
                  onClick={() =>
                    chooseNode(
                      data.nodes.find((n) => n.id === reaction.nodeId)!,
                    )
                  }
                >
                  查看关联知识
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          )}
          {s.id === 'history' && (
            <section className="panel">
              <h2>历史时间线</h2>
              <div className="timeline">
                {[
                  ['15–16 世纪', '新航路的开辟', 'core-history-2'],
                  ['18 世纪 60 年代', '工业革命兴起', 'core-history-1'],
                  ['19 世纪 60–90 年代', '洋务运动', 'core-history-3'],
                ].map(([date, title, id]) => (
                  <button
                    key={id}
                    onClick={() =>
                      chooseNode(data.nodes.find((n) => n.id === id)!)
                    }
                  >
                    <time>{date}</time>
                    <h3>{title}</h3>
                    <span className="muted">时间 · 原因 · 影响</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </TabsContent>
        <TabsContent value="practice">
          {s.id === 'chinese' && collections.length > 0 && (
            <section className="panel pinyin-collections-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">CHINESE WORD SETS</p>
                  <h2>字词篇目</h2>
                </div>
                <span className="muted">按篇目完整练习</span>
              </div>
              <p className="muted">篇目是字词集合；每个字词单独记录掌握度。整篇练习会覆盖全部字词，不受每日推荐题量限制。</p>
              <div className="pinyin-collection-list">
                {collections.map((collection) => (
                  <div className="pinyin-collection-row" key={collection.id}>
                    <div><strong>{collection.title}</strong><span>{collection.count} 个字词</span></div>
                    <button className="secondary" onClick={() => start(pinyinPracticeQueue(data.questions, collection.id))}>
                      练完整篇 <ArrowRight size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {s.id === 'ce' && <ToeflPractice />}
          <div className="home-columns">
            <section className="panel">
              <div className="section-head">
                <h2>自适应专项练习</h2>
                <BookOpen size={20} />
              </div>
              <p className="muted">
                按能力掌握度选择难度，同一知识点交错出现。
              </p>
              <div className="practice-filters">
                <Choice
                  label="练习来源"
                  value={practiceSource}
                  onChange={setPracticeSource}
                  options={[
                    { value: 'all', label: '全部练习' },
                    { value: 'wrong', label: '只练错题本' },
                    { value: 'blind', label: '信心校准 · 自信却答错' },
                  ]}
                />
                <Choice
                  label="练习题型"
                  value={practiceType}
                  onChange={setPracticeType}
                  options={[
                    { value: 'all', label: '全部题型' },
                    ...QUESTION_TYPES.filter(
                      (t) => s.id === 'chinese' || t.id !== 'pinyin',
                    ).map((t) => ({ value: t.id, label: t.label })),
                  ]}
                />
                {s.id === 'chinese' && fullPinyin && collections.length > 1 && (
                  <Choice
                    label="字词篇目"
                    value={pinyinCollection}
                    onChange={setPinyinCollection}
                    options={[{ value: 'all', label: '全部篇目' }, ...collections.map((collection) => ({ value: collection.id, label: collection.title }))]}
                  />
                )}
              </div>
              <div className="practice-count">
                {queue.length}
                <span>道可练习题目</span>
              </div>
              <button
                className="primary"
                disabled={!queue.length}
                onClick={() => start(queue)}
              >
                开始练习
                <ArrowRight size={16} />
              </button>
              <div className="innovation-action">
                <button
                  className="quiet"
                  disabled={!aiReady || !!generating}
                  onClick={() => void transfer()}
                >
                  迁移挑战 <ArrowUpRight size={15} />
                </button>
                <p className="muted">换个情境，检验同一种能力。</p>
              </div>
            </section>
            <section className="panel">
              <h2>{s.id === 'ce' ? '生成英语专项练习' : '准备新的变式练习'}</h2>
              <p className="muted">准备好的题目会先核验，再加入题池。</p>
              <div className="form-grid">
                <label>
                  知识点
                  <Choice
                    label="生成知识点"
                    value={generationNodeId}
                    onChange={(v) => {
                      setGenerationNodeId(v);
                      setSkillId('');
                    }}
                    options={[
                      { value: '', label: '自动选择薄弱知识' },
                      ...nodes.map((n) => ({ value: n.id, label: n.title })),
                    ]}
                  />
                </label>
                {generationNodeId && (
                  <label>
                    能力
                    <Choice
                      label="生成能力"
                      value={
                        skillId ||
                        (nodes.find((n) => n.id === generationNodeId)?.skills[0]
                          .id ??
                          '')
                      }
                      onChange={setSkillId}
                      options={(
                        nodes.find((n) => n.id === generationNodeId)?.skills ??
                        []
                      ).map((sk) => ({ value: sk.id, label: sk.title }))}
                    />
                  </label>
                )}
                <label>
                  题目数量
                  <Choice
                    label="题目数量"
                    value={count}
                    onChange={setCount}
                    options={['1', '3', '5', '8', '10'].map((n) => ({
                      value: n,
                      label: n + ' 题',
                    }))}
                  />
                </label>
                <label>
                  难度
                  <Choice
                    label="难度"
                    value={difficulty}
                    onChange={setDifficulty}
                    options={['1', '2', '3', '4', '5'].map((n) => ({
                      value: n,
                      label: ['基础', '容易', '标准', '进阶', '综合'][
                        Number(n) - 1
                      ],
                    }))}
                  />
                </label>
                {s.id === 'ce' && (
                  <label>
                    练习风格
                    <Choice
                      label="练习风格"
                      value={style}
                      onChange={setStyle}
                      options={[
                        { value: 'SAT', label: 'SAT 风格' },
                        { value: 'ACT', label: 'ACT 风格' },
                        { value: 'TOEFL', label: 'TOEFL 风格' },
                        { value: 'Grammar', label: 'Grammar' },
                      ]}
                    />
                  </label>
                )}
              </div>
              <details className="generation-types">
                <summary>
                  题型偏好 ·{' '}
                  {questionTypes.length
                    ? questionTypes
                        .map(
                          (t) => QUESTION_TYPES.find((x) => x.id === t)?.label,
                        )
                        .join('、')
                    : '自动选择'}
                </summary>
                <p className="muted">
                  勾选后仅生成所选题型；不选时根据能力自动决定。
                </p>
                <div className="type-checkboxes">
                  {QUESTION_TYPES.filter(
                    (t) => s.id === 'chinese' || t.id !== 'pinyin',
                  ).map((t) => (
                    <label key={t.id}>
                      <input
                        type="checkbox"
                        checked={questionTypes.includes(t.id)}
                        onChange={(e) =>
                          setQuestionTypes(
                            e.target.checked
                              ? [...questionTypes, t.id]
                              : questionTypes.filter((x) => x !== t.id),
                          )
                        }
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </details>
              <button
                className="secondary"
                disabled={!!generating || !aiReady}
                onClick={() => void generateSet(false)}
              >
                {generating || '准备题目'}
                <ArrowRight size={16} />
              </button>
              {!aiReady && (
                <p className="inline-hint">
                  题目生成连接待配置，本地练习可正常进行。
                </p>
              )}
            </section>
          </div>
          {(data.jobs ?? [])
            .filter(
              (j) =>
                j.kind === 'generation' &&
                j.node?.subject === s.id &&
                j.status !== 'ready',
            )
            .map((j) => (
              <section className="panel" key={j.id}>
                <h3>{j.node.title} · 待完成的练习</h3>
                <p className="muted">{j.error || '上次准备尚未完成'}</p>
                <button
                  className="secondary"
                  disabled={!!generating || !aiReady}
                  onClick={async () => {
                    try {
                      setGenerating('继续准备');
                      await resumeVerifiedJob(
                        j.attempt >= 2
                          ? {
                              ...j,
                              attempt: 0,
                              question: undefined,
                              solvers: [],
                            }
                          : j,
                        setGenerating,
                      );
                      await refresh();
                      notify('题目已核验并加入题库');
                    } catch (e) {
                      notify(e instanceof Error ? e.message : '暂时无法继续');
                    } finally {
                      setGenerating('');
                    }
                  }}
                >
                  继续准备
                </button>
              </section>
            ))}
        </TabsContent>
        <TabsContent value="notes">
          <section className="panel">
            <h2>记录课程笔记</h2>
            <div className="form-grid">
              <label>
                关联知识点
                <Choice
                  label="关联知识点"
                  value={noteNode || nodes[0]?.id || ''}
                  onChange={setNoteNode}
                  options={nodes.map((n) => ({ value: n.id, label: n.title }))}
                />
              </label>
            </div>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="用自己的话写下理解、易错原因或新的联系。"
            />
            <button
              className="primary"
              disabled={!note.trim()}
              onClick={async () => {
                try {
                  await put('note', {
                    id: uid(),
                    nodeId: noteNode || nodes[0].id,
                    body: note,
                  });
                  setNote('');
                  await refresh();
                  notify('笔记已保存');
                } catch (e) {
                  notify(String(e));
                }
              }}
            >
              保存笔记
            </button>
          </section>
          {data.notes
            .filter((note) => nodes.some((n) => n.id === note.nodeId))
            .map((note) => (
              <section className="panel" key={note.id}>
                <p className="eyebrow">
                  {nodes.find((n) => n.id === note.nodeId)?.title}
                </p>
                <p className="pre-wrap">{note.body}</p>
              </section>
            ))}
        </TabsContent>
        {s.id === 'chemistry' && (
          <TabsContent value="periodic">
            <PeriodicTable />
          </TabsContent>
        )}
        <TabsContent value="materials">
          {data.materials
            .filter((m) => m.subject === s.id)
            .map((m) => (
              <section className="panel" key={m.id}>
                <div className="section-head">
                  <h2>{m.name}</h2>
                  <span className="muted">{m.nodeIds.length} 个关联知识点</span>
                </div>
                <details>
                  <summary>查看提取内容</summary>
                  <p className="pre-wrap">{m.text}</p>
                </details>
              </section>
            ))}
          <Empty
            title="让课件与笔记进入复习"
            action={
              <button
                className="primary"
                onClick={() => navigate('library', s.id)}
              >
                导入资料
                <Plus size={16} />
              </button>
            }
          >
            导入资料后，确认识别结果即可创建知识与练习。
          </Empty>
        </TabsContent>
        <TabsContent value="tests">
          {s.id === 'ce' && <FullExamHub />}
          <details className="panel custom-test-settings" open={s.id !== 'ce'}>
            <summary>
              {s.id === 'ce' ? '自定义专项测试' : '建立一次专项测试'}
            </summary>
            <section>
              <p className="muted">按章节或能力，自由安排题量。</p>
              <div className="form-grid">
                <label>
                  测试范围类型
                  <Choice
                    label="测试范围类型"
                    value={testType}
                    onChange={setTestType}
                    options={[
                      { value: 'chapter', label: '章节测试' },
                      { value: 'unit', label: '单元测试' },
                      { value: 'subject', label: '学科测试' },
                      { value: 'custom', label: '自定义测试' },
                    ]}
                  />
                </label>
                <label>
                  题目数量
                  <Choice
                    value={count}
                    onChange={setCount}
                    label="题数"
                    options={['5', '8', '10', '20'].map((n) => ({
                      value: n,
                      label: n + ' 题',
                    }))}
                  />
                </label>
              </div>
              {testType !== 'subject' && (
                <div className="scope-list">
                  {nodes.map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        checked={scope.includes(n.id)}
                        onChange={(e) =>
                          setScope(
                            e.target.checked
                              ? [...scope, n.id]
                              : scope.filter((x) => x !== n.id),
                          )
                        }
                      />
                      {n.title}
                    </label>
                  ))}
                </div>
              )}
              <div className="button-row">
                <button
                  className="primary"
                  disabled={testType !== 'subject' && !scope.length}
                  onClick={() => {
                    const qs = buildQueue(data, {
                      subject: s.id,
                      scope: testType === 'subject' ? undefined : scope,
                      limit: Number(count),
                      practice: true,
                      test: true,
                    });
                    if (!qs.length) {
                      notify('所选范围暂无可用题目');
                      return;
                    }
                    start(qs, 'test', s.name + ' · 模拟测试');
                  }}
                >
                  开始测试
                  <ArrowRight size={16} />
                </button>
                <button
                  className="secondary"
                  disabled={
                    !aiReady ||
                    !!generating ||
                    (testType !== 'subject' && !scope.length)
                  }
                  onClick={() => void generateSet(true)}
                >
                  {generating || '先生成新题'}
                </button>
              </div>
              <p className="inline-hint">
                客观题需真实作答；主观题按评分标准批改。测试结果会影响后续复习。
              </p>
            </section>
          </details>
          {data.jobs
            ?.filter(
              (j) =>
                j.kind === 'assessment' &&
                j.session?.items.some((i: any) => i.question.subject === s.id),
            )
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .map((j) => (
              <section className="panel service-row" key={j.id}>
                <div>
                  <h3>{j.session.title}</h3>
                  <p className="muted">
                    {dateLabel(j.startedAt)} · {j.session.items.length} 题 ·{' '}
                    {j.status === 'answering'
                      ? '作答未完成'
                      : j.status === 'grading'
                        ? '等待检查'
                        : '已完成'}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate('assessment', j.id)}
                >
                  {j.status === 'answering'
                    ? '继续测试'
                    : j.status === 'grading'
                      ? '继续检查'
                      : '查看解析'}
                </button>
              </section>
            ))}
          {data.tests
            .filter(
              (t) =>
                (t.subject === s.id || t.subject === 'all') &&
                !data.jobs?.some(
                  (j) => j.kind === 'assessment' && j.sessionId === t.sessionId,
                ),
            )
            .map((t) => (
              <section className="panel" key={t.id}>
                <h3>{t.title}</h3>
                <p className="muted">
                  {dateLabel(t.at)} · {t.eventIds.length} 题
                </p>
              </section>
            ))}
        </TabsContent>
      </Tabs>
      <Dialog open={!!node} onOpenChange={(open) => !open && setNode(null)}>
        <DialogContent className="node-dialog">
          <DialogTitle>{node?.title}</DialogTitle>
          <DialogDescription>
            {node?.course} / {node?.chapter}
          </DialogDescription>
          {node && (
            <>
              <p className="node-description">{node.description}</p>
              {node.prerequisites.length > 0 && (
                <div className="prerequisites">
                  前置知识：
                  {node.prerequisites.map((id) => (
                    <button
                      key={id}
                      className="quiet"
                      onClick={() =>
                        chooseNode(data.nodes.find((n) => n.id === id)!)
                      }
                    >
                      {data.nodes.find((n) => n.id === id)?.title}
                    </button>
                  ))}
                </div>
              )}
              <h3>能力掌握</h3>
              {node.skills.map((sk) => {
                const st = states[keyOf(node.id, sk.id)];
                return (
                  <div className="skill-detail" key={sk.id}>
                    <div className="grow">
                      <h3>{sk.title}</h3>
                      <p className="muted">
                        {st?.attemptCount
                          ? `${st.attemptCount} 次练习 · 下次 ${dateLabel(st.nextReview)} · 稳定度 ${st.stability.toFixed(1)} 天`
                          : '尚未评估'}
                      </p>
                    </div>
                    <Meter
                      value={st?.attemptCount ? st.mastery : null}
                      color={s.color}
                    />
                    <button
                      className="quiet"
                      onClick={() => {
                        const qs = data.questions.filter(
                          (q) => q.nodeId === node.id && q.skillId === sk.id,
                        );
                        if (!qs.length) {
                          setSkillId(sk.id);
                          notify(
                            '该能力还没有题目，可以生成新题或在资料库自建',
                          );
                          return;
                        }
                        setNode(null);
                        start(
                          qs.slice(0, 4).map((q) => ({
                            question: q,
                            reason: '能力专项',
                            priority: 1,
                          })),
                        );
                      }}
                    >
                      练习
                      <ArrowRight size={14} />
                    </button>
                  </div>
                );
              })}
              <div className="dialog-footer-note">
                {node.source} · v{node.version}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
