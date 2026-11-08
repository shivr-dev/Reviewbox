'use client';
import {parseWorkspaceRoute} from '@/lib/workspace-route';
import {NaviButton} from './navi-workspace';
import NaviSourceWorkspace from './navi-source-workspace';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import {lazy,Suspense,useMemo,useSyncExternalStore,useLayoutEffect} from 'react';
import {NaviUIController,registerNaviUI} from '@/lib/navi-ui';
const BookletExport=lazy(()=>import('./booklet-export'));
import type {watchRequest} from '@/lib/watch-client';
import ManualImport from './manual-import';
import ImportSkillCard from './import-skill-card';
import PackWorkspace from './pack-workspace';
import PackUpdateReview from './pack-update-review';
import ImportRepairReview from './import-repair-review';
import MathAnswerComposer from './math-answer-input';
import {supportsMathInput,type MathAnswerFormat} from '@/lib/math-input-format';
import {repairImportJson,type JsonRepairResult} from '@/lib/import-json-repair';

import QuestionReviewButton from './question-review';
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
import {SUBJECTS,uid,type Subject,type Node,type Question,type Pack} from '@/lib/model';
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

import { Choice, Empty, Heading, SubjectChoice, dateLabel } from './shared';
export default function LibraryView({
  initialTab = 'materials',packageRequest,
}: { initialTab?: string;packageRequest?:typeof watchRequest } = {}) {
  const { data, refresh, start, notify, navigate, subject: routeSubject } = useReview();
  const collection=useMemo(()=>{const c=new NaviUIController({panels:[],questionIds:[],molecule:false,protected:false,collection:true});c.state.collection={query:'',subject:SUBJECTS.some(s=>s.id===routeSubject)?routeSubject as any:'all',sort:'new'};return c;},[routeSubject]);
  const collectionState=useSyncExternalStore(collection.subscribe,collection.snapshot,collection.snapshot);
  const search=collectionState.collection?.query??'',filter=collectionState.collection?.subject??(SUBJECTS.some(s=>s.id===routeSubject)?routeSubject:'all');
  const setSearch=(query:string)=>collection.execute([{type:'setFilter',query}], 'user');
  const setFilter=(subject:string)=>collection.execute([{type:'setFilter',subject:subject as any}], 'user');
  const materialOrder=collectionState.collection?.sort??'new';
  const setMaterialOrder=(value:string)=>collection.execute([{type:'setSort',value:value as any}], 'user');
  useEffect(()=>registerNaviUI(collection,15),[collection]);
  collection.target={type:'subject',id:routeSubject};
  collection.capabilities.scrollTargets=[...data.materials.map(m=>'material:'+m.id),...data.questions.map(q=>'question:'+q.id)];
  const rowRefs=useRef(new Map<string,HTMLElement>());
  const initialSubject = SUBJECTS.some((s) => s.id === routeSubject)
    ? (routeSubject as Subject)
    : 'chinese';
  const [tab, setTab] = useState(initialTab),

    [importOpen, setImportOpen] = useState(false),
    [bookletOpen,setBookletOpen]=useState(false),
    [editorOpen, setEditorOpen] = useState(false),
    [text, setText] = useState(''),
    [name, setName] = useState('我的学习资料'),
    [subject, setSubject] = useState<Subject>(initialSubject),
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
  const [routeFocus,setFocusId]=useState(()=>parseWorkspaceRoute(location.hash).target??'');
  const focusId=collectionState.collectionFocus?.slice(collectionState.collectionFocus.indexOf(':')+1)??routeFocus;
  const focusFilter=useRef(search+'|'+filter);
  useEffect(()=>{const next=search+'|'+filter;if(next!==focusFilter.current){focusFilter.current=next;setFocusId('');}},[search,filter]);
  useEffect(()=>{const focus=(e:Event)=>{const value=(e as CustomEvent).detail;if(!value||!['question','material'].includes(value.type)||typeof value.id!=='string')return;focusFilter.current='|all';setSearch('');setFilter('all');setFocusId(value.id);setMaterialPage(0);setQuestionPage(0);};window.addEventListener('review:focus-source',focus);return()=>window.removeEventListener('review:focus-source',focus);},[]);
  const [materialPage,setMaterialPage]=useState(0),[questionPage,setQuestionPage]=useState(0);
  useEffect(()=>{setMaterialPage(0);setQuestionPage(0);},[search,filter]);
  const materials=data.materials.filter(m=>(!focusId||m.id===focusId)&&(filter==='all'||m.subject===filter)&&m.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>materialOrder==='name'?a.name.localeCompare(b.name,'zh-CN'):b.date.localeCompare(a.date));
  const fileInput = useRef<HTMLInputElement>(null);
  const chosenNode = data.nodes.find((n) => n.id === nodeId);
  const visibleNodes = data.nodes.filter((n) => n.subject === subject);
  const questions = data.questions.filter(
    (q) =>
      (!focusId||q.id===focusId) && (filter === 'all' || q.subject === filter) &&
      (q.prompt + q.answer + data.nodes.find((n) => n.id === q.nodeId)?.title)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const materialPages=Math.max(1,Math.ceil(materials.length/12)),questionPages=Math.max(1,Math.ceil(questions.length/20));
  const mp=Math.min(materialPage,materialPages-1),qp=Math.min(questionPage,questionPages-1);
  useLayoutEffect(()=>{
    const target=collectionState.scroll?.target;if(!target)return;
    const question=target.startsWith('question:'),id=target.slice(target.indexOf(':')+1);
    setTab(question?'questions':'materials');
    const rows=question?data.questions:[...data.materials].sort((a,b)=>materialOrder==='name'?a.name.localeCompare(b.name,'zh-CN'):b.date.localeCompare(a.date));
    const index=rows.findIndex(r=>r.id===id);if(index<0)return;
    if(question)setQuestionPage(0);else setMaterialPage(0);
  },[collectionState.scroll?.revision]);
  useLayoutEffect(()=>{
    const target=collectionState.scroll?.target;if(!target)return;
    const row=rowRefs.current.get(target);if(!row)return;
    if(row instanceof HTMLDetailsElement)row.open=true;
    const frame=requestAnimationFrame(()=>{row.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});row.tabIndex=-1;row.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);
  },[collectionState.scroll,tab,mp,qp,search,filter,focusId]);
  const wrongQuestions = getWrongQuestions(data);
  const [editorAnswer,setEditorAnswer]=useState(''),[editorAnswerFormat,setEditorAnswerFormat]=useState<MathAnswerFormat>('text');
  const [repairs,setRepairs]=useState<JsonRepairResult[]>([]),[pendingStage,setPendingStage]=useState<typeof stage>(null);
  function reviewStage(result:NonNullable<typeof stage>,reports:JsonRepairResult[]=[]){
    if(reports.length){setRepairs(reports);setPendingStage(result);setStage(null);}else{setRepairs([]);setPendingStage(null);setStage(result);}
  }

  async function file(file?: File) {
    if (!file) return;
    setBusy(true);
    setName(file.name);
    try {
      const v = await extractFile(file,{repairJson:true});
      if (v.pack) {
        reviewStage({
          nodes: v.pack.knowledge,
          questions: v.pack.questions,
          pack: v.pack,
        },v.repairs);
        setText('');
      } else if (v.backup) {
        reviewStage({ nodes: [], questions: [], backup: v.backup },v.repairs);
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
        notify(tr("library:学习包已安装，个人学习记录已保留"));
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
          skills: [{ id: 'recall', title: tr("common:内容理解"), difficulty: 1 }],
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
        answerFormat:String(form.get('answerFormat')??'text'),
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
      notify(tr("library:题目已保存并关联知识能力"));
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存未完成');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="library-page settings-scope">
      <Heading
        eyebrow="YOUR LEARNING LIBRARY"
        title={tr("library:资料库")}
        description={tr("library:管理自己的资料、题目与学习包。")}
        action={
          <div className="button-row">
            <details className="library-studio-menu"><summary>制作与排版</summary><div><button onClick={()=>navigate('subjects',routeSubject,'studio')}>学习包制作台</button><button onClick={()=>navigate('subjects',routeSubject,'publish')}>试卷排版工作台</button><button onClick={()=>setBookletOpen(true)}>快速导出 Word</button></div></details>
            <button className="secondary" onClick={()=>setTab('data')}>{tr("library:导入工具")}</button>
            <button
              className="primary"
              onClick={() => {
                setStage(null);
                setImportOpen(true);
              }}
            >
              <Upload size={16} />{tr("library:导入")}</button>
          </div>
        }
      />
      {bookletOpen&&<Suspense fallback={<p role="status">{tr("library:导出工具加载中…")}</p>}><BookletExport close={()=>setBookletOpen(false)}/></Suspense>}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="page-tabs">
          <TabsTrigger value="materials">{tr("library:学习资料")}</TabsTrigger>
          <TabsTrigger value="questions">{tr("library:题目库")}</TabsTrigger>
          <TabsTrigger value="content">{tr("library:学习包")}</TabsTrigger>

        </TabsList>
        <TabsContent value="materials">
          <div className="pack-toolbar"><input aria-label={tr("library:搜索资料")} placeholder={tr("library:搜索我的资料")} value={search} onChange={e=>setSearch(e.target.value)}/><SubjectChoice value={filter} onChange={setFilter} all/><select aria-label={tr("library:资料排序")} value={materialOrder} onChange={e=>setMaterialOrder(e.target.value)}><option value="new">{tr("library:最近添加")}</option><option value="name">{tr("library:按名称")}</option></select></div>
          {materials.length ? (
            <div className="material-grid">
              {materials.slice(mp*12,mp*12+12).map((m) => (
                <section className="panel" key={m.id} ref={el=>{if(el)rowRefs.current.set("material:"+m.id,el);else rowRefs.current.delete("material:"+m.id);}}>
                  <FileText size={21} />
                  <h3>{m.name}</h3>
                  <p className="muted">
                    {subjectName(m.subject)} · {m.nodeIds.length}{tr("library:个知识点 ·")}{' '}
                    {dateLabel(m.date)}
                  </p>
                  <details>
                    <summary>{tr("library:查看提取内容")}</summary>
                    <NaviSourceWorkspace target={{type:'material',id:m.id}} subject={m.subject}><NaviButton target={{type:'material',id:m.id}}/><p className="pre-wrap">{m.text}</p></NaviSourceWorkspace>
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
                  >{tr("library:复习这份资料")}<ArrowRight size={14} />
                  </button>
                </section>
              ))}
            </div>
          ) : (
            <section className="panel">
              <Empty title={tr("library:你的课程资料，在这里相遇")}>{tr("library:导入后先检查识别内容，再加入自己的知识地图。")}</Empty>
            </section>
          )}
          <footer className="pack-pagination"><button disabled={mp===0} onClick={()=>setMaterialPage(mp-1)}>{tr("library:上一页")}</button><span>{mp+1} / {materialPages}</span><button disabled={mp+1>=materialPages} onClick={()=>setMaterialPage(mp+1)}>{tr("library:下一页")}</button></footer>
        </TabsContent>
        <TabsContent value="questions">
          <div className="toolbar">
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("library:搜索题目或知识点")}
                aria-label={tr("library:搜索题目")}
              />
            </div>
            <SubjectChoice value={filter} onChange={setFilter} all />
            <button className="secondary" onClick={() => setEditorOpen(true)}>
              <Plus size={16} />{tr("library:新建题目")}</button>
          </div>
          <p className="inline-hint">{tr("library:共")}{questions.length}{tr("library:道题目 · 每道题都关联一个知识点与具体能力")}</p>
          <div className="panel question-list">
            {questions.slice(qp*20,qp*20+20).map((q) => (
              <details key={q.id} ref={el=>{if(el)rowRefs.current.set("question:"+q.id,el);else rowRefs.current.delete("question:"+q.id);}}>
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
                  <span className="reason-pill">{tr("library:难度")}{q.difficulty}</span>
                </summary>
                <div className="question-list-answer">
                  <p className="pre-wrap">
                    <MathText>
                      {q.type === 'matching' ? tr("library:配对结果见下方解析") : q.answer}
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
                    >{tr("library:练习这道题")}<ArrowRight size={14} />
                    </button>
                    <QuestionReviewButton question={q} />
                    <span className="muted">
                      {q.source}
                      {q.verified ? tr("library: · 已核验") : ''}
                    </span>
                  </div>
                </div>
              </details>
            ))}
            {!questions.length && (
              <Empty title={tr("library:没有找到题目")}>{tr("library:可以导入资料，或用表单建立第一道题。")}</Empty>
            )}
          </div>
          <footer className="pack-pagination"><button disabled={qp===0} onClick={()=>setQuestionPage(qp-1)}>{tr("library:上一页")}</button><span>{qp+1} / {questionPages}</span><button disabled={qp+1>=questionPages} onClick={()=>setQuestionPage(qp+1)}>{tr("library:下一页")}</button></footer>
        </TabsContent>
        <TabsContent value="content"><PackWorkspace request={packageRequest} onImport={()=>{setStage(null);setImportOpen(true);}}/><details className="pack-export"><summary>{tr("library:导出我整理的内容")}</summary>          <section className="panel">
            <h2>{tr("library:打包自己的课程")}</h2>
            <p className="muted">{tr("library:导出题目、知识点和评分标准，保存在自己的设备中，或用于私有云端备份。")}</p>
            <button
              className="secondary"
              onClick={() => {
                const ns = data.nodes.filter((n) => !n.id.startsWith('core-'));
                if (!ns.length) {
                  notify(tr("library:先导入或创建一些自己的内容"));
                  return;
                }
                downloadPack({
                  schemaVersion: 1,
                  manifest: {
                    id: 'my-learning-pack',
                    title: tr("common:我的学习包"),
                    subject: 'all',
                    version: '1.0.0',
                    description: tr("common:个人整理的学习内容"),
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
              <Download size={15} />{tr("library:导出自建学习包")}</button>
          </section>
</details></TabsContent>
        <TabsContent value="data"><ImportSkillCard/>
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
            <section className="panel"><h2>{tr("library:备份与恢复")}</h2><button className="text-button" onClick={()=>navigate('you','all','data')}>{tr("library:前往数据与隐私 →")}</button></section>
            <section className="panel">
              <h2>{tr("library:错题再看")}</h2>
              <p className="muted">{tr("library:只保留仍未通过后续练习巩固的题目。")}</p>
              <div className="practice-count">
                {wrongQuestions.length}
                <span>{tr("library:道需要回看")}</span>
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
              >{tr("library:开始错题复习")}<ArrowRight size={16} />
              </button>
            </section>
          </div>
          <section className="panel">
            <div className="section-head">
              <h2>{tr("library:最近学习记录")}</h2>
              <span className="muted">{tr("library:记录保存在本地，同步后可跨设备查看")}</span>
            </div>
            {data.events
              .slice(-40)
              .reverse()
              .map((e) => (
                <div className="queue-row" key={e.id}>
                  <div className="grow">
                    <h3>{data.nodes.find((n) => n.id === e.nodeId)?.title}</h3>
                    <p className="muted">
                      {dateLabel(e.occurredAt)}{tr("library:· 思考")}{' '}
                      {(e.activeThinkMs / 1000).toFixed(1)}{tr("library:秒 ·")}{' '}
                      {e.source === 'rubric' ? tr("library:评分标准批改") : tr("library:自主判断")}
                    </p>
                  </div>
                  <span className={'outcome ' + e.outcome}>
                    {e.outcome === 'correct'
                      ? tr("library:答对")
                      : e.outcome === 'unsure'
                        ? tr("common:不确定")
                        : tr("common:答错")}
                  </span>
                </div>
              ))}
            {!data.events.length && (
              <Empty title={tr("library:每一次复习，都会被认真记录")} />
            )}
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="import-dialog">
          <DialogTitle>{tr("library:智能导入")}</DialogTitle>
          <DialogDescription>{tr("library:粘贴内容或选择文件，确认识别结果后加入学习。")}</DialogDescription>
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv,.tsv,.xlsx,.xls,.zip,image/*"
            onChange={(e) => void file(e.target.files?.[0])}
          />
          {pendingStage&&repairs.length ? <ImportRepairReview reports={repairs} onCancel={()=>{if(repairs.length===1)setText(repairs[0].original);setPendingStage(null);setRepairs([]);}} onConfirm={()=>{setStage(pendingStage);setPendingStage(null);setRepairs([]);}}/> : stage?.pack ? <PackUpdateReview pack={stage.pack} onCancel={()=>setStage(null)} onDone={()=>{setStage(null);setImportOpen(false);setText('');}}/> : stage ? (
            <>
              <div className="import-result">
                <Check size={21} />
                <div>
                  <h3>
                    {stage.backup
                      ? tr("library:准备恢复学习备份")
                      : stage.pack
                        ? stage.pack.manifest.title
                        : tr("common:识别到 {{v0}} 个知识点",{v0:(stage.nodes.length)})}
                  </h3>
                  <p className="muted">
                    {stage.backup
                      ? tr("library:按记录合并，不重复计算答题事件")
                      : tr("common:{{v0}} 道相关练习 · 检查后确认导入",{v0:(stage.questions.length)})}
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
                <button className="secondary" onClick={() => setStage(null)}>{tr("library:返回编辑")}</button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={acceptImport}
                >
                  {busy ? tr("library:正在保存…") : tr("library:确认导入")}
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
                  {busy ? tr("library:正在识别文件…") : tr("library:选择文件")}
                </button>
                <ManualImport subject={initialSubject}/><span className="muted">{tr("library:最多 15 MB · 图片识别首次需要联网")}</span>
              </div>
              <label>{tr("library:资料名称")}<input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label>{tr("library:粘贴学习内容（也支持按模板手动填写 JSON）")}<textarea
                  rows={8}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setSubject(guessSubject(e.target.value));
                  }}
                  maxLength={300000}
                  placeholder={
                    tr("library:例如：\n沮丧 jǔ sàng\n狼藉 láng jí\n蹒跚 pán shān\n\n或：Suspense: uncertainty and anticipation about what happens next.")
                  }
                />
              </label>
              <label>{tr("library:识别学科，可调整")}<SubjectChoice
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
              <p className="inline-hint">{tr("library:基础识别按段落、词条和问答结构提取；复杂课件请在确认前检查。整套课程可导入带版本的学习包。")}</p>
              <button
                className="primary"
                disabled={!text.trim() || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    let input=text,reports:JsonRepairResult[]=[];
                    if(/^\s*(?:[\[{]|```|[\w$]+\s*:)/.test(text)){
                      const r=await repairImportJson(text);if(r.error)throw new Error(r.error);input=r.text;if(r.repaired)reports=[r];
                    }
                    const result = parseImportText(input, subject);
                    if (!result.nodes.length)
                      throw new Error('没有识别到有效内容');
                    reviewStage(result,reports);
                  } catch (e) {
                    notify(String(e));
                  }finally{setBusy(false);}
                }}
              >{tr("library:识别并预览")}<ArrowRight size={16} />
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="editor-dialog">
          <DialogTitle>{tr("library:新建题目")}</DialogTitle>
          <DialogDescription>{tr("library:题目、知识点与能力连接后，练习才会影响掌握度。")}</DialogDescription>
          <form onSubmit={saveQuestion}>
            <div className="form-grid">
              <label>{tr("library:学科")}<SubjectChoice
                  value={subject}
                  onChange={(v) => {
                    setSubject(v as Subject);
                    setNodeId('');
                    setSkillId('');
                  }}
                />
              </label>
              <label>{tr("library:知识点")}<Choice
                  label={tr("library:知识点")}
                  value={nodeId}
                  onChange={(v) => {
                    setNodeId(v);
                    setSkillId('');
                  }}
                  options={[
                    { value: '', label: tr("common:建立新知识点") },
                    ...visibleNodes.map((n) => ({
                      value: n.id,
                      label: n.title,
                    })),
                  ]}
                />
              </label>
              {!nodeId && (
                <label>{tr("library:新知识点名称")}<input
                    required
                    value={newNodeTitle}
                    onChange={(e) => setNewNodeTitle(e.target.value)}
                    maxLength={100}
                  />
                </label>
              )}
              {chosenNode && (
                <label>{tr("library:能力")}<Choice
                    label={tr("library:能力")}
                    value={skillId || chosenNode.skills[0].id}
                    onChange={setSkillId}
                    options={chosenNode.skills.map((s) => ({
                      value: s.id,
                      label: s.title,
                    }))}
                  />
                </label>
              )}
              <label>{tr("library:题目类型")}<Choice
                  label={tr("library:题目类型")}
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'recall', label: tr("common:回忆题") },
                    { value: 'blank', label: tr("common:填空题") },
                    { value: 'matching', label: tr("common:连线题") },
                    { value: 'pinyin', label: tr("common:看拼音写汉字") },
                    { value: 'choice', label: tr("common:选择题") },
                    { value: 'subjective', label: tr("common:主观题") },
                  ]}
                />
              </label>
              <label>{tr("library:难度")}<Choice
                  label={tr("library:题目难度")}
                  value={difficulty}
                  onChange={setDifficulty}
                  options={['1', '2', '3', '4', '5'].map((n) => ({
                    value: n,
                    label: n,
                  }))}
                />
              </label>
            </div>
            <label>{tr("library:题干")}<textarea name="prompt" required rows={3} maxLength={12000} />
            </label>
            {type === 'matching' && (
              <label>{tr("library:配对内容（每行：左侧 =&gt; 右侧）")}<textarea
                  name="pairs"
                  rows={5}
                  required
                  placeholder={tr("library:Suspense => 悬念\nImagery => 意象")}
                />
              </label>
            )}
            {type === 'choice' && (
              <label>{tr("library:选项（每行一个，含 A. / B. 等标签）")}<textarea name="options" required rows={4} />
              </label>
            )}
            <label>{tr("library:标准答案")}{supportsMathInput(subject,type)?<MathAnswerComposer name="answer" value={editorAnswer} format={editorAnswerFormat} onChange={setEditorAnswer} onFormatChange={setEditorAnswerFormat}/>:<textarea
                  name="answer"
                required={type !== 'matching'}
                disabled={type === 'matching'}
                placeholder={type === 'matching' ? tr("library:根据配对内容自动生成") : ''}
                rows={3}
                  maxLength={12000}
                />}
            </label>
            <label>{tr("library:解释或解题过程")}<textarea name="explanation" rows={3} maxLength={12000} />
            </label>
            {type === 'subjective' && (
              <>
                <label>{tr("library:原文或材料")}<textarea name="passage" rows={3} />
                </label>
                <label>{tr("library:评分点（每行一项，每项 2 分）")}<textarea
                    name="rubric"
                    required
                    rows={3}
                    placeholder={tr("library:核心观点准确\n使用具体证据\n分析清晰")}
                  />
                </label>
              </>
            )}
            <div className="form-grid">
              <label>{tr("library:标签")}<input name="tags" placeholder={tr("library:用逗号分隔")} />
              </label>
              <label>{tr("library:来源")}<input name="source" placeholder={tr("library:教材、笔记或自编")} />
              </label>
            </div>
            <button className="primary" disabled={busy} type="submit">
              {busy ? tr("library:正在保存…") : tr("library:保存题目")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
