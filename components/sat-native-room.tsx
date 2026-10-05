'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { put, currentNamespace } from '@/lib/store';
import { assetPath } from '@/lib/runtime';
import { satPackage, satSnapshot, saveSatSnapshot, satRoute } from '@/lib/sat-native';
import type { ExamRun, ExamPaper } from '@/lib/exam-model';

export default function SatExamRoom({run:initial,paper}:{run:ExamRun;paper:ExamPaper}) {
  const {data,refresh,navigate} = useReview();
  const context=useRef({data,refresh,navigate});context.current={data,refresh,navigate};
  const frame=useRef<HTMLIFrameElement>(null),run=useRef(initial),ns=useRef(currentNamespace()),writes=useRef(Promise.resolve()),nonce=useRef('');
  const [connection,setConnection]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  function send(type:string,extra:Record<string,unknown>={}){frame.current?.contentWindow?.postMessage({channel:'review-sat',nonce:nonce.current,type,...extra},location.origin);}
  useEffect(()=>{
    nonce.current=crypto.randomUUID();let active=true,initialized=false,seen=-1;
    setLoading(true);
    const enqueue=(job:()=>Promise<void>)=>{writes.current=writes.current.catch(()=>{}).then(async()=>{
      if(currentNamespace()!==ns.current)throw Error('账户已切换，请返回 CE。');await job();
    }).catch(e=>{if(active){setError(e.message);send('error',{message:e.message});}});};
    async function persist(snapshot:any,complete=false) {
      if(!snapshot||JSON.stringify(snapshot).length>1500000)throw Error('SAT 考试记录过大或无效，暂未保存。');
      if(run.current.native?.satVersion===1&&snapshot.module<run.current.native.module)throw Error('上一模块已经锁定，请重新连接当前模块。');
      const next=saveSatSnapshot(run.current,paper,context.current.data.questions,snapshot,complete);
      await put('job',next,next.id,false,ns.current);run.current=next;
    }
    function receive(event:MessageEvent){
      if(event.source!==frame.current?.contentWindow||event.origin!==location.origin||event.data?.channel!=='review-sat')return;
      const message=event.data;
      if(message.type==='ready'&&!initialized){try{send('init',{pack:satPackage(paper,context.current.data.questions,context.current.data.settings.name),snapshot:satSnapshot(run.current,paper,context.current.data.questions)});}catch(e){setError(e instanceof Error?e.message:'试卷未就绪。');}return;}
      if(message.nonce!==nonce.current)return;
      if(message.type==='initialized'){initialized=true;clearInterval(probe);clearTimeout(timeout);setLoading(false);setError('');return;}
      if(!initialized)return;
      if(message.type==='error'){setError(String(message.message).slice(0,400));return;}
      if(message.type==='snapshot'){
        if(!Number.isInteger(message.sequence)||message.sequence<=seen)return;seen=message.sequence;
        enqueue(()=>persist(message.snapshot));
      }else if(message.type==='advance')enqueue(async()=>{
        if(message.snapshot?.module!==0)throw Error('模块切换无效，请重新连接。');
        await persist(message.snapshot);send('routed',{route:satRoute(paper,run.current,context.current.data.questions)});
      });
      else if(message.type==='submit')enqueue(async()=>{
        if(message.snapshot?.module!==satPackage(paper,context.current.data.questions,'').modules.length-1)throw Error('请先完成所有模块。');
        await persist(message.snapshot,true);send('submitted');
      });
      else if(message.type==='report'||message.type==='exit')enqueue(async()=>{
        if(message.type==='report'){
          if(run.current.status!=='complete')throw Error('完成考试后可以查看解析。');
          const next={...run.current,native:{...run.current.native,showReport:true}};
          await put('job',next,next.id,false,ns.current);run.current=next;
        }
        await context.current.refresh();if(message.type==='exit')context.current.navigate('subjects','ce');
      });
    }
    const probe=setInterval(()=>{if(!initialized)send('ping');},1000);
    const timeout=setTimeout(()=>{if(!initialized){setLoading(false);setError('SAT 界面未能加载，请重新连接。已保存的答案会保留。');}},12000);
    function keyboard(e:KeyboardEvent){if(e.altKey&&e.key==='Escape'){e.preventDefault();send('pause');}}
    window.addEventListener('message',receive);window.addEventListener('keydown',keyboard);
    return()=>{active=false;clearInterval(probe);clearTimeout(timeout);window.removeEventListener('message',receive);window.removeEventListener('keydown',keyboard);};
  },[connection,paper.id]);
  return <main className="map-native-host sat-native-host">
    <iframe key={connection} ref={frame} title="SAT 英语专项模拟" src={assetPath('sat-player/index.html')} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups" allow="fullscreen" onLoad={()=>send('ping')} />
    <button className="native-exam-exit" aria-label="保存并返回 CE" onClick={()=>send('request-exit')}>×</button>
    {loading&&<div className="map-native-error" role="status">正在打开 SAT 界面…</div>}
    {error&&<div className="map-native-error" role="alert">{error}<button aria-label="关闭错误提示" onClick={()=>setError('')}>×</button><button onClick={()=>{setError('');setConnection(c=>c+1);}}>重新连接</button><button onClick={()=>navigate('subjects','ce')}>返回 CE</button></div>}
  </main>;
}
