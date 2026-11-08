'use client';
import {useEffect,useState} from 'react';
import {Plus,ChevronRight,Pause,Play,ArrowUpRight} from 'lucide-react';
import {membershipRequest,permitMembership} from '@/lib/membership-client';
import type {MembershipSnapshot} from '@/lib/membership-policy';
import {useReview} from './review-context';
import {currentNamespace} from '@/lib/store';
import {tr} from '@/lib/i18n';
const text=(key:string)=>tr('membership:'+key);
export default function MemberAgentTools({membership,view}:{membership:MembershipSnapshot;view:'workflows'|'twin'}){
 const {data}=useReview(),ns=currentNamespace(),pro=membership.plan==='pro';
 const [workflows,setWorkflows]=useState<any[]>([]),[runs,setRuns]=useState<any[]>([]),[name,setName]=useState(''),[kind,setKind]=useState('weekly-report'),[weekly,setWeekly]=useState(false),[weekday,setWeekday]=useState(1),[hour,setHour]=useState(9);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState<string>(),[twin,setTwin]=useState<any>(null),[minutes,setMinutes]=useState(data.settings.dailyMinutes);
 async function load(){const value=await membershipRequest('workflow-list');if(ns!==currentNamespace())return;setWorkflows(value.workflows);setRuns(value.runs);}
 useEffect(()=>{if(view==='workflows')void load().catch(e=>setError(e.message));},[ns,view]);
 async function act(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();if(view==='workflows')await load();}catch(e){if(ns===currentNamespace())setError((e as Error).message);}finally{if(ns===currentNamespace())setBusy(false);}}
 async function save(w?:any){await membershipRequest('workflow-save',w?{...w,timeZone:w.time_zone}:{id:editing&&editing!=='new'?editing:crypto.randomUUID(),name,kind,schedule:weekly?'weekly':'manual',weekday,hour,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,enabled:true});setEditing(undefined);setName('');}
 return <section className="member-agent-tools">
  <header className="membership-heading"><span className="membership-eyebrow">PRO · {view==='workflows'?'WORKFLOWS':'LEARNING TWIN'}</span><h1>{text(view==='workflows'?'Pro 学习工作流':'Learning Twin · 学习画像')}</h1><p>{text(view==='workflows'?'使用已同步记录生成只读报告。不会修改成绩、掌握度或学习安排。':'复用现有记忆与学习引擎，观察不同时间预算下的安排。仅供参考，不预测或保证分数。')}</p></header>
  {!pro&&<p className="member-access-note">{text('升级到 Pro 后可运行；已有配置与报告保留。')}</p>}
  {view==='workflows'?<>
   <div className="member-section-heading"><h2>{text('我的工作流')}</h2><button className="secondary" disabled={!pro||busy} onClick={()=>{setEditing('new');setName('');setKind('weekly-report');setWeekly(false);}}><Plus size={15}/>{text('新建工作流')}</button></div>
   {editing&&<form className="member-form" onSubmit={e=>{e.preventDefault();void act(()=>save());}}>
    <label>{text('工作流名称')}<input autoFocus required value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
    <label>{text('报告类型')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="weekly-report">{text('每周学习摘要')}</option><option value="exam-readiness">{text('近期考试检查')}</option></select></label>
    <label className="member-checkbox"><input type="checkbox" checked={weekly} onChange={e=>setWeekly(e.target.checked)}/><span>{text('每周自动运行')}</span></label>
    {weekly&&<><label>{text('星期（0 为周日）')}<input type="number" min={0} max={6} value={weekday} onChange={e=>setWeekday(+e.target.value)}/></label><label>{text('小时')}<input type="number" min={0} max={23} value={hour} onChange={e=>setHour(+e.target.value)}/></label></>}
    <div className="member-form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(undefined)}>{text('取消')}</button><button className="primary" disabled={busy||!pro}>{text('保存工作流')}</button></div>
   </form>}
   {!workflows.some(w=>!w.deleted)&&<div className="member-empty member-workflow-empty"><p>{text('还没有工作流')}</p><small>{text('选择报告类型与时间，Reviewbox 会按安排生成报告。')}</small></div>}
   <div className="member-workflows">{workflows.filter(w=>!w.deleted).map(w=><article key={w.id} className="member-workflow">
    <div><strong>{w.name}</strong><small>{text(w.kind)} · {w.schedule==='weekly'?w.weekday+' / '+w.hour+':00 · '+w.time_zone:text('手动运行')} · {text(w.enabled?'运行中':'已暂停')}</small></div>
    <div className="member-workflow-actions"><button className="secondary" disabled={busy||!pro} onClick={()=>void act(async()=>{await membershipRequest('workflow-run',{id:w.id,requestId:crypto.randomUUID()});})}><Play size={14}/>{text('运行 / 重试')}</button><button className="text-button" disabled={busy||!pro} onClick={()=>{setEditing(w.id);setName(w.name);setKind(w.kind);setWeekly(w.schedule==='weekly');setHour(w.hour);setWeekday(w.weekday);}}>{text('编辑')}</button><button className="text-button" disabled={busy||!pro} onClick={()=>void act(()=>save({...w,enabled:!w.enabled}))}>{text(w.enabled?'暂停':'恢复')}</button><button className="text-button" disabled={busy||!pro} onClick={()=>void act(async()=>{await membershipRequest('workflow-delete',{id:w.id});})}>{text('移除')}</button></div>
   </article>)}</div>
   <details className="member-disclosure"><summary><span>{text('工作流报告与运行记录')}</span><ChevronRight size={16}/></summary><div>{!runs.length?<p className="member-empty">{text('暂无报告')}</p>:runs.map(r=><article className="member-run" key={r.id}><strong>{new Date(r.at).toLocaleString()}</strong><small>{text(r.status)}</small>{r.status==='failed'?<p>{text('报告未完成，可手动重试。')}</p>:r.result?.kind==='weekly-report'?<p>{text('近七天已同步作答')} {r.result.answers} · {text('完成课程')} {r.result.courses} · {text('涉及学科')} {r.result.subjects?.length??0}</p>:<ul>{r.result?.exams?.map((e:any)=><li key={e.id}>{e.title} · {e.date} · {text(e.scoreRecorded?'已录入成绩':'尚未录入成绩')}</li>)}</ul>}</article>)}</div></details>
   {workflows.some(w=>w.deleted)&&<details className="member-disclosure"><summary><span>{text('已移除的工作流')}</span><ChevronRight size={16}/></summary><div>{workflows.filter(w=>w.deleted).map(w=><div className="member-code-row" key={w.id}><span>{w.name}</span><button className="secondary" disabled={busy||!pro} onClick={()=>void act(()=>save({...w,enabled:false}))}>{text('恢复')}</button></div>)}</div></details>}
  </>:<>
   <section className="member-twin-controls"><label htmlFor="twin-budget">{text('假设每天学习分钟数')}<output htmlFor="twin-budget">{minutes}</output></label><input id="twin-budget" type="range" min={10} max={120} step={5} value={minutes} onChange={e=>setMinutes(+e.target.value)}/><button className="primary" disabled={busy||!pro} onClick={()=>void act(async()=>{await permitMembership('twin');const {learningTwin}=await import('@/lib/learning-twin');if(ns===currentNamespace())setTwin(learningTwin(data,minutes));})}>{text('查看只读画像 / 比较安排')}<ArrowUpRight size={16}/></button></section>
   {twin&&<section className="member-twin-result"><div className="member-twin-stats"><div><small>{text('真实 GPA')}</small><strong>{twin.gpa.value===null?'—':twin.gpa.value.toFixed(2)}</strong></div><div><small>{text('已有作答证据')}</small><strong>{twin.evidence.answers}</strong></div><div><small>{text('有证据的能力')}</small><strong>{twin.evidence.observed} / {twin.evidence.skills}</strong></div></div><p>{text('假设时间预算')} {twin.assumption.dailyMinutes} · {text('引擎安排分钟')} {twin.plan.minutes} · {text('题目数')} {twin.plan.questions}</p><p>{twin.plan.status}</p><ul>{twin.memory.map((m:any)=><li key={m.family}>{m.family} · {m.shape} · {text('跨日证据')} {m.days}</li>)}</ul><small>{text('这些是当前证据的描述，不是精确掌握概率。没有修改你的正式计划。')}</small></section>}
  </>}
  {error&&<p className="member-error" role="alert">{error}</p>}
 </section>;
}
