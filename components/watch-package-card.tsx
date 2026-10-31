'use client';
import {useState} from 'react';
import {Watch,Download,Package} from 'lucide-react';
import {useReview} from './review-context';
import {installedWatchPackage,watchDownloadRequest} from '@/lib/watch-package';
import {downloadPack} from '@/lib/importer';
import {currentNamespace,put,pendingCount} from '@/lib/store';
export default function WatchPackageCard(){
  const {data,cloudUser,sync,refresh,notify}=useReview();
  const [busy,setBusy]=useState('');
  async function add(packId:string){
    if(!cloudUser){notify('请先登录，再同步个人学习包到手表');return;}
    setBusy(packId);const ns=currentNamespace();
    try{const job=watchDownloadRequest(installedWatchPackage(data,packId));await put('job',job,job.id,false,ns);
      if(currentNamespace()!==ns)throw new Error('账户已切换');await sync();await refresh();
      if(currentNamespace()!==ns)throw new Error('账户已切换');
      notify(await pendingCount()?'已保存，联网同步后可在手表下载':'已同步到云端，请在手表“离线内容”同步列表后下载');
    }catch(e){notify((e as Error).message);}finally{setBusy('');}
  }
  const packs=data.packs.filter(p=>!['review-core','review-framework'].includes(p.id));
  return <section className="panel watch-package-card"><h2><Watch size={20}/>我的学习包 · 带到手表</h2>
    <p className="muted">按整份学习包下载，保留包名与版本。题目仍需通过核验才会进入练习。</p>
    {!packs.length&&<p>还没有安装学习包。请使用资料库顶部的“导入”，或前往“发现”安装公共学习包。</p>}
    <div className="pack-grid">{packs.map(p=><article className="pack-card" key={p.id}><Package size={22}/><h3>{p.title}</h3><p className="muted">v{p.version}{p.questionIds?` · ${p.questionIds.length} 题`:''}</p><div className="button-row">
      <button className="secondary" disabled={!!busy} onClick={()=>{try{downloadPack(installedWatchPackage(data,p.id));}catch(e){notify((e as Error).message);}}}><Download size={16}/>下载 ZIP</button>
      <button className="primary" disabled={!!busy} onClick={()=>void add(p.id)}><Watch size={16}/>{busy===p.id?'同步中…':'加入手表复习'}</button>
    </div></article>)}</div></section>;
}
