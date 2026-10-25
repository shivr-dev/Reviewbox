'use client';
import {useEffect,useRef,useState} from 'react';
import {Globe,Upload,Download,Check} from 'lucide-react';
import {useReview} from './review-context';
import {watchRequest} from '@/lib/watch-client';
import {extractFile,downloadPack,validatePack} from '@/lib/importer';
import {preparePublicPack} from '@/lib/public-pack';
import {installedWatchPackage} from '@/lib/watch-package';
import {currentNamespace,installPack} from '@/lib/store';
import type {Pack} from '@/lib/model';
type Entry={id:string;title:string;description:string;version:string;question_count:number;updated_at:string};
export default function PublicPackLibrary(){
  const {data,cloudUser,refresh,notify}=useReview();
  const [rows,setRows]=useState<Entry[]>([]),[mine,setMine]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[candidate,setCandidate]=useState<Pack|null>(null),[consent,setConsent]=useState(false);
  const input=useRef<HTMLInputElement>(null),account=useRef(cloudUser?.id);account.current=cloudUser?.id;
  const owner=cloudUser?.id;
  async function load(){setError('');try{const r=await watchRequest('pack-list');if(account.current===owner){setRows(r.packs);setMine(r.mine);}}catch(e){if(account.current===owner)setError((e as Error).message);}}
  useEffect(()=>{setRows([]);setMine([]);setCandidate(null);setConsent(false);if(owner)void load();},[owner]);
  async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function get(id:string){const r=await watchRequest('pack-get',{id});return validatePack(r.pack);}
  return <section className="panel public-pack-library"><div className="section-head"><h2><Globe size={21}/>公共学习包</h2><button className="secondary" disabled={busy||!owner} onClick={()=>input.current?.click()}><Upload size={16}/>上传学习包给所有用户</button></div>
    <p className="muted">主动发布的内容可被其他 Reviewbox 用户浏览和安装。个人资料默认仍为私有。</p>
    {!owner&&<p>登录账户后即可浏览、上传和管理公共学习包。</p>}
    {error&&<p role="alert">{error} <button className="text-button" onClick={()=>void load()}>重试</button></p>}
    <input ref={input} type="file" accept=".zip,.json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void action(async()=>{if(f.size>10000000)throw new Error('请上传 10 MB 以内的学习包');const parsed=await extractFile(f);if(!parsed.pack)throw new Error('请选择带 manifest 的学习包，不能发布个人备份');if(account.current!==owner)return;setCandidate(preparePublicPack(parsed.pack));setConsent(false);});}}/>
    {owner&&!!data.packs.length&&<details><summary>或选择已安装的学习包发布</summary><div className="button-row">{data.packs.map(p=><button className="secondary" disabled={busy} key={p.id} onClick={()=>{try{setCandidate(preparePublicPack(installedWatchPackage(data,p.id)));setConsent(false);}catch(e){setError((e as Error).message);}}}>{p.title}</button>)}</div></details>}
    {candidate&&<div className="import-callout"><h3>发布前确认：{candidate.manifest.title}</h3><p>{candidate.knowledge.length} 个知识点 · {candidate.questions.length} 题 · v{candidate.manifest.version}</p><p>其他用户将看到包内知识、题干、答案和解析。不会上传成绩、作答记录、账户或游戏数据。</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我有权分享这些内容，并同意公开给所有 Reviewbox 用户。</label><div className="button-row"><button className="primary" disabled={busy||!consent} onClick={()=>void action(async()=>{await watchRequest('pack-publish',{pack:candidate});setCandidate(null);setConsent(false);notify('学习包已公开发布');await load();})}>确认公开发布</button><button className="secondary" disabled={busy} onClick={()=>setCandidate(null)}>取消</button></div></div>}
    <div className="pack-grid">{rows.map(p=><article className="pack-card" key={p.id}><h3>{p.title}</h3><p className="muted">{p.description}</p><p>{p.question_count} 题 · v{p.version}</p><div className="button-row"><button className="primary" disabled={busy} onClick={()=>void action(async()=>{const ns=currentNamespace(),pack=await get(p.id);if(currentNamespace()!==ns)throw new Error('账户已切换');await installPack(pack);await refresh();notify('已安装到“我的学习包”；题目核验后可用于练习');})}><Check size={15}/>安装学习包</button><button className="secondary" disabled={busy} onClick={()=>void action(async()=>downloadPack(await get(p.id)))}><Download size={15}/>下载 ZIP</button></div></article>)}</div>
    {owner&&!rows.length&&!error&&<p className="muted">还没有公共学习包，你可以发布第一份。</p>}
    {!!mine.length&&<details><summary>我发布的学习包（{mine.length}）</summary>{mine.map(p=><div className="button-row" key={p.id}><span>{p.title} · v{p.version}</span><button className="secondary" disabled={busy} onClick={()=>void action(async()=>{await watchRequest('pack-withdraw',{id:p.id});notify('已撤回公开发布；已安装副本不会被删除');await load();})}>撤回公开发布</button></div>)}</details>}
  </section>;
}
