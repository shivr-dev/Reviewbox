'use client';
import {useEffect,useRef,useState} from 'react';
import {Download} from 'lucide-react';
import {useReview} from './review-context';
import {installedWatchPackage,watchDownloadRequest} from '@/lib/watch-package';
import {watchRequest} from '@/lib/watch-client';
import {downloadPack} from '@/lib/importer';
import {currentNamespace,saveRecords,pendingCount} from '@/lib/store';
export default function WatchPackageCard({request=watchRequest}:{request?:typeof watchRequest}){
 const {data,cloudUser,sync,refresh,navigate}=useReview(),owner=cloudUser?.id;
 const [selected,setSelected]=useState<string[]>([]),[devices,setDevices]=useState<any[]>([]),[loading,setLoading]=useState(false),[deviceError,setDeviceError]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),account=useRef(owner);account.current=owner;
 const packs=data.packs.filter(p=>!['review-core','review-framework'].includes(p.id));
 useEffect(()=>{let live=true;setDevices([]);setSelected([]);setError('');setStatus('');setDeviceError('');setBusy(false);lock.current=false;if(owner){setLoading(true);void request('list').then(r=>{if(live)setDevices((r.devices??[]).filter((d:any)=>!d.revokedAt));}).catch(e=>{if(live)setDeviceError((e as Error).message);}).finally(()=>{if(live)setLoading(false);});}else setLoading(false);return()=>{live=false;};},[owner]);
 async function send(){if(lock.current||!selected.length)return;if(!owner){setError('请先登录账户');return;}lock.current=true;setBusy(true);setError('');setStatus('');const ns=currentNamespace();
 try{const jobs=selected.map(id=>watchDownloadRequest(installedWatchPackage(data,id)));if(currentNamespace()!==ns)throw new Error('账户已切换');const at=new Date().toISOString();await saveRecords(jobs.map(job=>({kind:'job' as const,id:job.id,payload:job,updated_at:at,deleted:false})),true,ns);if(currentNamespace()!==ns)throw new Error('账户已切换');const ok=await sync();if(currentNamespace()!==ns)throw new Error('账户已切换');await refresh();if(ok===false)throw new Error('已保存同步请求，数据库同步失败。请检查连接后重试。');setStatus(await pendingCount()?'已保存请求，仍有待同步记录。联网后可重试。':`已同步 ${jobs.length} 个学习包到数据库。请在手表「离线内容」下载。`);
 }catch(e){if(account.current===owner)setError((e as Error).message);}finally{if(account.current===owner){setBusy(false);lock.current=false;}}}
 return <section className="watch-package-card" aria-label="学习包设备同步"><header className="device-sync-header"><div><h2>关联设备</h2><p>{!owner?'登录后同步个人学习包':loading?'正在读取设备…':devices.length?devices.map(d=>d.name||d.deviceName||'手表').join('、')+' · 已授权':deviceError?'暂时无法读取设备':'尚未连接手表'}</p></div><button className="text-button" onClick={()=>navigate('you','all','devices')}>管理设备</button></header>
 {deviceError&&<p className="settings-error" role="alert">{deviceError}。可前往设备管理重试。</p>}{error&&<p role="alert" className="settings-error">{error}</p>}{status&&<p role="status" className="settings-notice">{status}</p>}
 {!packs.length?<p className="settings-empty-inline">还没有学习包。先导入自己的内容，或前往「发现」安装。</p>:<><div className="sync-pack-list">{packs.map(p=><div className="sync-pack-row" key={p.id}><label><input type="checkbox" disabled={busy} checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/><span><strong>{p.title}</strong><small>v{p.version} · {p.questionIds?.length??0} 题</small></span></label><details><summary>更多</summary><button className="text-button" onClick={()=>{try{downloadPack(installedWatchPackage(data,p.id));}catch(e){setError((e as Error).message);}}}><Download size={14}/>导出 ZIP</button></details></div>)}</div><footer className="device-sync-actions"><span>已选 {selected.length} 个 · 同步后需在手表下载</span><button className="primary" disabled={busy||!selected.length||!owner} onClick={()=>void send()}>{busy?'同步中…':'同步所选学习包'}</button></footer></>}
 </section>;
}
