'use client';
import {useEffect,useState} from 'react';
import type {Pack} from '@/lib/model';
import {previewInstallPack,commitPackUpdate,setMeta} from '@/lib/store';
import type {PackChoices} from '@/lib/pack-versions';
import {useReview} from './review-context';
function VersionFields({value}:{value:any}){if(!value)return null;return <>{Array.isArray(value.options)&&<ul aria-label="选项">{value.options.map((v:any,i:number)=><li key={i}>{typeof v==='string'?v:v.text??v.label??`选项 ${i+1}`}</li>)}</ul>}{Array.isArray(value.skills)&&<p>能力：{value.skills.map((s:any)=>s.title).join('、')}</p>}{value.type&&<p className="muted">难度 {value.difficulty} · 建议用时 {value.expectedSeconds} 秒</p>}{Array.isArray(value.tags)&&!!value.tags.length&&<p className="muted">{value.tags.join(' · ')}</p>}</>;}
export default function PackUpdateReview({pack,onDone,onCancel}:{pack:Pack;onDone:()=>void;onCancel:()=>void}) {
  const {refresh}=useReview();
  const [preview,setPreview]=useState<Awaited<ReturnType<typeof previewInstallPack>>>(),[choices,setChoices]=useState<PackChoices>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>();
  useEffect(()=>{let live=true;void previewInstallPack(pack).then(p=>{if(live)setPreview(p);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[pack]);
  async function apply(){if(!preview)return;setBusy(true);setError('');let counts;try{counts=await commitPackUpdate(preview,choices);}catch(e){setError((e as Error).message);await setMeta('pack-update-error:'+preview.namespace+':'+pack.manifest.id,(e as Error).message).catch(()=>{});setBusy(false);return;}await setMeta('pack-update-error:'+preview.namespace+':'+pack.manifest.id,null).catch(()=>{});setResult(counts);try{await refresh();}catch{setError('内容已保存，请重新打开资料库刷新显示。');}setBusy(false);}
  const changes=preview?.changes.filter(c=>c.action!=='same')??[],questions=changes.filter(c=>c.kind==='question');
  return <section className="pack-update-review" aria-label="学习包版本差异"><header><span className="muted">{preview?.manifest?'查看版本更新':'安装学习包'}</span><h2>{pack.manifest.title}</h2><p>{preview?.manifest?.version??'未安装'} → {pack.manifest.version}</p></header>
    {error&&<p role="alert" className="pack-error">{error}</p>}
    {!preview&&!error&&<p role="status">正在核对本地内容…</p>}
    {result?<><p role="status">已完成：新增 {result.added} 题，修改 {result.modified} 题，归档 {result.archived} 题；{result.reverify?`${result.reverify} 题需要重新核验`:'原有核验状态已保留'}。{result.retained?`另保留 ${result.retained} 项个人内容。`:''}</p><button className="primary" onClick={onDone}>完成</button></>:preview&&<>
      <div className="pack-diff-summary">新增 {questions.filter(c=>c.action==='add').length} · 修改 {questions.filter(c=>c.action==='modify').length} · 移除 {questions.filter(c=>c.action==='remove').length} · 冲突 {changes.filter(c=>c.conflict).length}</div>
      {preview.status==='installed'?<p>版本和内容一致，无需重新安装。核验状态与作答记录已保留。</p>:<p className="muted">只对内容变化的题目重新核验。移除的题目安全归档，历史作答继续保留。</p>}
      <div className="pack-change-list">{changes.map(c=><details key={c.kind+c.id} open={c.conflict}><summary>{c.kind==='node'?'知识点':'题目'} · {c.after?.prompt??c.after?.title??c.before?.prompt??c.id} <small>{c.conflict?'需要选择':{add:'新增',modify:'修改',remove:'归档',same:'一致'}[c.action]}</small></summary><div className="pack-compare">{[['当前内容',c.before],['新版内容',c.after]].map(([label,v])=><div key={String(label)}><h4>{String(label)}</h4><p>{(v as any)?.prompt??(v as any)?.title??'无'}</p><p>{(v as any)?.answer??(v as any)?.description??''}</p><p className="muted">{(v as any)?.explanation??''}</p><VersionFields value={v}/></div>)}</div>{c.conflict&&<fieldset><legend>如何处理？</legend><label><input type="radio" name={c.id} checked={choices[c.id]==='keep'} onChange={()=>setChoices({...choices,[c.id]:'keep'})}/>{c.action==='remove'?'保留为个人内容':'保留我的内容'}</label><label><input type="radio" name={c.id} checked={choices[c.id]==='replace'} onChange={()=>setChoices({...choices,[c.id]:'replace'})}/>{c.action==='remove'?'归档并保留历史':'使用新版内容'}</label></fieldset>}</details>)}</div>
      <div className="button-row"><button className="secondary" disabled={busy} onClick={onCancel}>取消</button><button className="primary" disabled={busy||changes.some(c=>c.conflict&&!choices[c.id])} onClick={apply}>{busy?'正在保存…':preview.status==='installed'?'确认一致':preview.manifest?'确认更新':'确认安装'}</button></div>
    </>}
  </section>;
}
