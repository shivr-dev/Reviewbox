'use client';
import CommunityCatalog from './community-catalog';
import {listCommunity} from '@/lib/community-client';
import {tr} from '@/lib/i18n';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Download} from 'lucide-react';
import {useReview} from './review-context';
import {watchRequest} from '@/lib/watch-client';
import {downloadPack,validatePack} from '@/lib/importer';
import {preparePublicPack} from '@/lib/public-pack';
import {installedWatchPackage} from '@/lib/watch-package';
import {currentNamespace} from '@/lib/store';
import PackUpdateReview from './pack-update-review';
import type {Pack} from '@/lib/model';
type Entry={id:string;title:string;description:string;version:string;question_count:number;updated_at:string};
export default function PublicPackLibrary({request=watchRequest,catalogRequest=listCommunity}:{request?:typeof watchRequest;catalogRequest?:typeof listCommunity}){
 const {data,cloudUser,notify}=useReview(),owner=cloudUser?.id;
 const [rows,setRows]=useState<Entry[]>([]),[mine,setMine]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[candidate,setCandidate]=useState<Pack|null>(null),[consent,setConsent]=useState(false),[installing,setInstalling]=useState<Pack|null>(null),[search,setSearch]=useState(''),[sort,setSort]=useState('new'),[filter,setFilter]=useState('all'),[page,setPage]=useState(0);
 const account=useRef(owner),generation=useRef(0);account.current=owner;
 async function load(){const run=++generation.current;setLoading(true);setError('');try{const r=await request('pack-list');if(account.current===owner&&run===generation.current){setRows(r.packs);setMine(r.mine);}}catch(e){if(account.current===owner&&run===generation.current)setError((e as Error).message);}finally{if(account.current===owner&&run===generation.current)setLoading(false);}}
 useEffect(()=>{setRows([]);setMine([]);setCandidate(null);setInstalling(null);setConsent(false);setError('');setBusy(false);if(owner)void load();else setLoading(false);return()=>{generation.current++;};},[owner]);
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){if(account.current===owner)setError((e as Error).message);}finally{if(account.current===owner)setBusy(false);}}
 async function get(id:string){const ns=currentNamespace(),r=await request('pack-get',{id});if(account.current!==owner||currentNamespace()!==ns)throw new Error('账户已切换');const pack=validatePack(r.pack);return {...pack,manifest:{...pack.manifest,publicId:id}};}
 const installed=(id:string)=>data.packs.some(p=>(p as any).publicId===id);
 const filtered=rows.filter(p=>(p.title+' '+p.description).toLowerCase().includes(search.toLowerCase())&&(filter==='all'||installed(p.id)===(filter==='installed'))).sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,'zh-CN'):b.updated_at.localeCompare(a.updated_at));
 const maxPage=Math.max(1,Math.ceil(filtered.length/12)),current=Math.min(page,maxPage-1),shareable=data.packs.filter(p=>!['review-core','review-framework'].includes(p.id));
 if(installing)return <PackUpdateReview pack={installing} onCancel={()=>setInstalling(null)} onDone={()=>setInstalling(null)}/>;
 return <section className="public-pack-library" aria-label={tr("library:发现公共学习包")}>
 {error&&<p className="settings-error" role="alert">{error}</p>}
 <CommunityCatalog list={catalogRequest} busy={busy} onInstall={id=>void action(async()=>setInstalling(await get(id)))}/>
 {owner&&<>
 {!!shareable.length&&<details className="public-publish-tools"><summary>{tr("library:发布我的学习包")}</summary><p className="settings-caption">{tr("library:先通过资料库的「导入」加入内容，再选择要公开的学习包。")}</p><div className="button-row">{shareable.map(p=><button className="secondary" key={p.id} disabled={busy} onClick={()=>{try{setCandidate(preparePublicPack(installedWatchPackage(data,p.id)));setConsent(false);}catch(e){setError((e as Error).message);}}}>{p.title}</button>)}</div></details>}
 {candidate&&<div className="import-callout"><h3>{tr("library:公开发布：")}{candidate.manifest.title}</h3><p>{candidate.questions.length}{tr("library:题 · v")}{candidate.manifest.version}{tr("library:。将分享知识点、题目及解析，不包含个人记录。")}</p><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{tr("library:我有权分享这些内容，并同意公开给所有用户。")}</label><div className="button-row"><button className="primary" disabled={busy||!consent} onClick={()=>void action(async()=>{await request('pack-publish',{pack:candidate});if(account.current!==owner)return;setCandidate(null);setConsent(false);notify(tr("library:学习包已公开发布"));await load();})}>{tr("library:确认公开发布")}</button><button className="secondary" disabled={busy} onClick={()=>setCandidate(null)}>{tr("library:取消")}</button></div></div>}
 {!!mine.length&&<details className="public-publish-tools"><summary>{tr("library:我发布的学习包 ·")}{mine.length}</summary>{mine.map(p=><div className="settings-line" key={p.id}><span>{p.title} · v{p.version}</span><button className="text-button" disabled={busy} onClick={()=>void action(async()=>{await request('pack-withdraw',{id:p.id});if(account.current!==owner)return;notify(tr("library:已撤回，已安装副本不受影响"));await load();})}>{tr("library:撤回发布")}</button></div>)}</details>}
 </>}
 </section>;
}
