'use client';
import {useEffect,useRef,useState} from 'react';
import {useReview} from './review-context';
import {put,saveRecords,currentNamespace} from '@/lib/store';
import {assetPath} from '@/lib/runtime';
import {actPackage,actSnapshot,saveActSnapshot} from '@/lib/act-native';
import {detPackage,detSnapshot,saveDetSnapshot} from '@/lib/det-native';
import type {ExamRun,ExamPaper} from '@/lib/exam-model';
export default function SuppliedExamRoom({run:initial,paper}:{run:ExamRun;paper:ExamPaper}){
 const {data,refresh,navigate}=useReview(),context=useRef({data,refresh,navigate});context.current={data,refresh,navigate};
 const frame=useRef<HTMLIFrameElement>(null),run=useRef(initial),ns=useRef(currentNamespace()),writes=useRef(Promise.resolve()),nonce=useRef('');
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[connection,setConnection]=useState(0);
 const det=paper.exam==='DET',channel='review-'+(det?'det':'act');
 const send=(type:string,extra:Record<string,unknown>={})=>frame.current?.contentWindow?.postMessage({channel,nonce:nonce.current,type,...extra},location.origin);
 useEffect(()=>{
  nonce.current=crypto.randomUUID();let active=true,initialized=false,seen=-1;setLoading(true);
  const enqueue=(fn:()=>Promise<void>)=>{writes.current=writes.current.catch(()=>{}).then(async()=>{if(currentNamespace()!==ns.current)throw Error('账户已切换，请返回 CE。');await fn();}).catch(e=>{if(active){setError(e.message);send('error',{message:e.message});}});};
  async function persist(snapshot:any,complete=false){if(!snapshot||JSON.stringify(snapshot).length>1500000)throw Error('考试记录无效或超过保存限制。');const next=(det?saveDetSnapshot:saveActSnapshot)(run.current,paper,context.current.data.questions,snapshot,complete);await put('job',next,next.id,false,ns.current);run.current=next;}
  function receive(e:MessageEvent){
   if(e.source!==frame.current?.contentWindow||e.origin!==location.origin||e.data?.channel!==channel)return;
   const m=e.data;
   if(m.type==='ready'&&!initialized){try{const d=context.current.data;send('init',{pack:det?detPackage(paper,d.questions,d.jobs??[],d.settings.name):actPackage(paper,d.questions,d.settings.name),snapshot:(det?detSnapshot:actSnapshot)(run.current,paper,d.questions)});}catch(e){setError(e instanceof Error?e.message:'试卷未就绪。');}return;}
   if(m.nonce!==nonce.current)return;
   if(m.type==='initialized'){initialized=true;setLoading(false);clearTimeout(timeout);clearInterval(probe);return;}
   if(!initialized)return;
   if(m.type==='snapshot'){if(!Number.isInteger(m.sequence)||m.sequence<=seen)return;seen=m.sequence;enqueue(()=>persist(m.snapshot));}
   if(m.type==='submit')enqueue(async()=>{await persist(m.snapshot,true);send('submitted',{cloud:'local'});});
   if(m.type==='exit'||m.type==='report')enqueue(async()=>{
    if(m.snapshot)await persist(m.snapshot);
    if(m.type==='report'){if(run.current.status!=='complete')throw Error('请完成考试后查看解析。');const next={...run.current,native:{...run.current.native,showReport:true}};await put('job',next,next.id,false,ns.current);run.current=next;}
    await context.current.refresh();if(m.type==='exit')context.current.navigate('subjects','ce');
   });
   if(m.type==='recording')enqueue(async()=>{
    try{
     if(!(m.blob instanceof Blob)||!m.blob.size||m.blob.size>15000000)throw Error('录音为空或超过 15 MB。');
     const pack=detPackage(paper,context.current.data.questions,[],'');if(!pack.items.some(q=>q.key===m.key))throw Error('录音位置无效。');
     const bytes=new Uint8Array(await m.blob.arrayBuffer());let bin='';for(const b of bytes)bin+=String.fromCharCode(b);const b64=btoa(bin),id='exam-recording:'+initial.id+':'+m.key,parts:string[]=[],payloads:any[]=[];
     for(let i=0;i<b64.length;i+=700000){const part=id+':'+parts.length;parts.push(part);payloads.push({id:part,kind:'exam-asset-chunk',data:b64.slice(i,i+700000)});}payloads.push({id,kind:'exam-asset',mime:m.blob.type,parts});
     await saveRecords(payloads.map(payload=>({id:payload.id,kind:'job' as const,payload,updated_at:new Date().toISOString(),deleted:false})),true,ns.current);send('recording-saved',{id:m.id});
    }catch(e){send('recording-saved',{id:m.id,error:e instanceof Error?e.message:'录音未能保存。'});throw e;}
   });
  }
  const probe=setInterval(()=>{if(!initialized)send('ping');},1000),timeout=setTimeout(()=>{if(!initialized){setLoading(false);setError('考试界面未能加载，请重新连接。已保存的作答会保留。');}},12000);
  window.addEventListener('message',receive);return()=>{active=false;clearInterval(probe);clearTimeout(timeout);window.removeEventListener('message',receive);};
 },[paper.id,connection]);
 return <main className="map-native-host"><iframe key={connection} ref={frame} src={assetPath((det?'det-player':'act-player')+'/index.html')} title={det?'Duolingo English Test 个人模拟':'ACT 英语专项模拟'} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" allow="microphone; camera; autoplay; fullscreen" onLoad={()=>send('ping')}/><button className="native-exam-exit" aria-label="保存并返回 CE" onClick={()=>send('request-exit')}>×</button>{loading&&<div className="map-native-error" role="status">正在打开考试界面…</div>}{error&&<div className="map-native-error" role="alert">{error}<button onClick={()=>setError('')}>关闭</button><button onClick={()=>{setError('');setConnection(c=>c+1);}}>重新连接</button><button onClick={()=>navigate('subjects','ce')}>返回 CE</button></div>}</main>;
}
