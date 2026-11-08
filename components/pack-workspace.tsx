'use client';
import {NaviButton} from './navi-workspace';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import {ChevronRight} from 'lucide-react';
import {useEffect,useState} from 'react';
import {useReview} from './review-context';
import {type Pack} from '@/lib/model';
import {watchRequest} from '@/lib/watch-client';
import {downloadPack,validatePack} from '@/lib/importer';
import {installedWatchPackage} from '@/lib/watch-package';
import {undoPackUpdate,allRecords,currentNamespace,getMeta,inspectPackRemoval,removeInstalledPack,undoPackRemoval} from '@/lib/store';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {packVersions} from '@/lib/pack-versions';
import PackUpdateReview from './pack-update-review';
import PublicPackLibrary from './public-pack-library';
import WatchPackageCard from './watch-package-card';
export default function PackWorkspace({onImport,request=watchRequest}:{onImport:()=>void;request?:typeof watchRequest}) {
  const {data,refresh,cloudUser,section}=useReview();
  const [view,setView]=useState(section==='discover'?'discover':'installed'),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[sort,setSort]=useState('name'),[page,setPage]=useState(0),[candidate,setCandidate]=useState<Pack|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [updates,setUpdates]=useState<Record<string,string>>({});
  const [history,setHistory]=useState<any[]>([]);
  const [failures,setFailures]=useState<Record<string,string>>({});
  const [removal,setRemoval]=useState<Awaited<ReturnType<typeof inspectPackRemoval>>|null>(null),[removed,setRemoved]=useState('');
  useEffect(()=>{let live=true;const ns=currentNamespace();void Promise.all(data.packs.map(async p=>[p.id,await getMeta('pack-update-error:'+ns+':'+p.id)])).then(entries=>{if(live&&ns===currentNamespace())setFailures(Object.fromEntries(entries));});return()=>{live=false;};},[data.packs,candidate]);
  useEffect(()=>{setCandidate(null);setUpdates({});setError('');},[cloudUser?.id]);
  useEffect(()=>{let live=true;const ns=currentNamespace();void allRecords(ns).then(rows=>{if(live&&ns===currentNamespace())setHistory(packVersions(rows).map(r=>r.payload));});return()=>{live=false;};},[data.packs,cloudUser?.id]);
  useEffect(()=>{let live=true;if(cloudUser)void request('pack-list').then(r=>{if(live)setUpdates(Object.fromEntries(r.packs.map((p:any)=>[p.id,p.version])));}).catch(()=>{});return()=>{live=false;};},[cloudUser?.id]);
  const all=data.packs.filter(p=>!['review-core','review-framework'].includes(p.id));
  const rows=all.filter(p=>(filter==='all'||p.subject===filter)&&(p.title+' '+p.description).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='version'?b.version.localeCompare(a.version,undefined,{numeric:true}):a.title.localeCompare(b.title,'zh-CN'));
  const total=Math.max(1,Math.ceil(rows.length/12)),current=Math.min(page,total-1);
  async function act(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="pack-workspace"><nav className="pack-subnav" aria-label={tr("library:学习包视图")}>{[['installed',tr("library:已安装")],['discover',tr("library:发现")],['devices',tr("library:设备同步")]].map(([id,label])=><button key={id} aria-current={view===id?'page':undefined} onClick={()=>setView(id)}>{label}{id==='installed'?` · ${all.length}`:''}</button>)}</nav>
    {error&&<p role="alert" className="pack-error">{error}</p>}
    {removed&&<div role="status" className="pack-removal-result">{tr("library:学习包已移除，学习历史和成绩已保留。")}<button disabled={busy} onClick={()=>void act(async()=>{await undoPackRemoval(removed);setRemoved('');await refresh();})}>{tr("library:撤销删除（10 分钟内）")}</button></div>}
    <Dialog open={!!removal} onOpenChange={open=>{if(!open&&!busy)setRemoval(null);}}><DialogContent><DialogTitle>{tr("library:移除学习包")}</DialogTitle><DialogDescription>{tr("library:只移除此包独有的学习内容。历史作答、成绩、个人笔记和版本历史会保留。")}</DialogDescription>{removal&&<><h3>{removal.manifest.payload.title} · v{removal.manifest.payload.version}</h3><dl className="pack-removal-counts"><dt>{tr("library:移出题库")}</dt><dd>{removal.questions.length}{tr("library:题")}</dd><dt>{tr("library:移除独有知识点 / 资料")}</dt><dd>{removal.nodes.length} / {removal.materials.length}</dd><dt>{tr("library:保留共享题目")}</dt><dd>{removal.sharedQuestionCount}{tr("library:题")}</dd><dt>{tr("library:保留历史作答")}</dt><dd>{removal.eventCount}{tr("library:条")}</dd><dt>{tr("library:保留关联课程")}</dt><dd>{removal.courses.length}{tr("library:门")}</dd></dl><p>{tr("library:此包独有题目将退出后续练习和未完成任务。其他设备联网同步后也会移除。")}</p>{error&&<p role="alert">{error}</p>}<div className="button-row"><button className="secondary" disabled={busy} onClick={()=>setRemoval(null)}>{tr("library:取消")}</button><button className="destructive" disabled={busy} onClick={()=>void act(async()=>{const id=await removeInstalledPack(removal);setRemoved(id);setRemoval(null);await refresh();})}>{busy?tr("library:正在移除…"):tr("library:确认移除")}</button></div></>}</DialogContent></Dialog>
    {candidate?<PackUpdateReview pack={candidate} onCancel={()=>setCandidate(null)} onDone={()=>setCandidate(null)}/>:view==='discover'?<PublicPackLibrary request={request}/>:view==='devices'?<WatchPackageCard request={request}/>:<>
      <div className="pack-toolbar"><input aria-label={tr("library:搜索学习包")} placeholder={tr("library:搜索我的学习包")} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label={tr("library:筛选学科")} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">{tr("library:全部学科")}</option>{[...new Set(all.map(p=>p.subject))].map(s=><option key={s} value={s}>{subjectName(s)}</option>)}</select><select aria-label={tr("library:学习包排序")} value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="name">{tr("library:按名称")}</option><option value="version">{tr("library:按版本")}</option></select></div>
      {!rows.length&&<div className="pack-empty"><h3>{all.length?tr("library:没有匹配的学习包"):tr("library:你的学习包会出现在这里")}</h3><p>{tr("library:导入自己的内容，或前往「发现」安装公共学习包。")}</p><button className="secondary" onClick={onImport}>{tr("library:导入学习包")}</button></div>}
      <div className="pack-installed-list">{rows.slice(current*12,current*12+12).map(p=>{
        const versions=history.filter(j=>j.packId===p.id).sort((a,b)=>b.at.localeCompare(a.at));
        const count=(p.questionIds??[]).filter(id=>data.questions.some(q=>q.id===id)).length;
        return <details key={p.id} className="pack-installed-row"><summary><span className="pack-row-title"><strong>{p.title}</strong><small>v{p.version} · {p.questionIds?tr("common:{{v0}} 题",{v0:(count)}):tr("library:题目清单待补全")}</small></span><span className={'pack-status '+(failures[p.id]?'pack-status-error':updates[(p as any).publicId]&&updates[(p as any).publicId]!==p.version?'pack-status-update':'')}>{failures[p.id]?tr("library:更新失败"):updates[(p as any).publicId]&&updates[(p as any).publicId]!==p.version?tr("common:有更新"):tr("common:已安装")}</span><ChevronRight className="pack-chevron" aria-hidden="true"/></summary><div className="pack-row-body"><NaviButton target={{type:"pack",id:p.id}}/><p>{p.description}</p>{failures[p.id]&&<p role="alert" className="pack-error">{failures[p.id]}{tr("library:。原版本已保留。")}</p>}{p.changelog&&<p className="muted">{tr("library:更新记录：")}{p.changelog}</p>}<div className="button-row">{(p as any).publicId&&<button className="primary" disabled={busy} onClick={()=>void act(async()=>{const r=await request('pack-get',{id:(p as any).publicId});const next=validatePack(r.pack);setCandidate({...next,manifest:{...next.manifest,publicId:(p as any).publicId} as any});})}>{tr("library:检查公共更新")}</button>}<button className="secondary" onClick={onImport}>{tr("library:导入新版 / 检查更新")}</button><button className="secondary" disabled={busy} onClick={()=>void act(async()=>downloadPack(installedWatchPackage(data,p.id)))}>{tr("library:导出此包")}</button><button className="text-button danger" disabled={busy} onClick={()=>void act(async()=>setRemoval(await inspectPackRemoval(p.id)))}>{tr("library:移除学习包")}</button></div>{!!versions.length&&<details><summary>{tr("library:版本历史（")}{versions.length}）</summary>{versions.map((v:any)=><div className="pack-history" key={v.id}><span>v{v.version} · {new Date(v.at).toLocaleDateString()}</span><button className="text-button" disabled={busy||v.incomplete} onClick={()=>setCandidate(v.source)}>{tr("library:预览 / 回滚此版本")}</button>{(p as any).installationId===v.id&&<button className="text-button" disabled={busy} onClick={()=>void act(async()=>{await undoPackUpdate(v.id);await refresh();})}>{tr("library:撤销这次更新")}</button>}</div>)}</details>}</div></details>;
      })}</div><footer className="pack-pagination"><button disabled={current===0} onClick={()=>setPage(current-1)}>{tr("library:上一页")}</button><span>{current+1} / {total}</span><button disabled={current+1>=total} onClick={()=>setPage(current+1)}>{tr("library:下一页")}</button></footer>
    </>}
  </section>;
}
