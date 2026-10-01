'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { put, currentNamespace } from '@/lib/store';
import { assetPath } from '@/lib/runtime';
import { type ExamPaper, type ExamRun } from '@/lib/exam-model';
import { advanceMap, mapAnswered, mapAnswerText, mapScore } from '@/lib/map-model';
import { nativeMapQuestion, responseFromMapState, initialMapState } from '@/lib/map-native';

export default function MapExamRoom({run:initial,paper}:{run:ExamRun;paper:ExamPaper}) {
  const {data,refresh,navigate}=useReview();
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [connection,setConnection]=useState(0);
  const frame=useRef<HTMLIFrameElement>(null), run=useRef(initial), namespace=useRef(currentNamespace()),
    writes=useRef(Promise.resolve()),lock=useRef(false),nonce=useRef(''),timer=useRef(0),visible=useRef(false),active=useRef(true),ready=useRef(false);
  const context=useRef({data,refresh,navigate});context.current={data,refresh,navigate};
  function currentQuestion() {const r=run.current;return context.current.data.questions.find(q=>q.id===paper.questions[r.map?.order[r.index] ?? '']);}
  function send(type:string,payload:Record<string,unknown>={}) {frame.current?.contentWindow?.postMessage({channel:'review-map',nonce:nonce.current,type,...payload},'*');}
  function save(next:ExamRun,confirmed=false) {
    if(currentNamespace()!==namespace.current)return Promise.reject(Error('账户已切换，请返回当前学习空间。'));
    if(!confirmed)run.current=next;
    const task=writes.current.catch(()=>{}).then(async()=>{
      if(currentNamespace()!==namespace.current)throw Error('账户已切换，请返回当前学习空间。');
      await put('job',next,next.id,false,namespace.current);
      if(confirmed)run.current=next;
    });writes.current=task;
    return task;
  }
  function capture() {
    const r=run.current,id=r.map?.order[r.index];
    const elapsed=visible.current && timer.current?Math.max(0,Date.now()-timer.current):0;
    timer.current=Date.now();
    if(!elapsed||!id||r.status!=='active'||!r.map?.entered||r.map.screen==='slow-down'||r.map.checked)return;
    run.current={...r,times:{...r.times,[id]:(r.times[id] ?? 0)+elapsed}};
  }
  function init() {
    const r=run.current,q=currentQuestion();
    if(!q||!r.map)return setError('试卷题目缺失，请返回 CE 检查已保存试卷。');
    send('init',{
      question:nativeMapQuestion(q,paper,r),state:initialMapState(q,r,r.map.order[r.index]),
      student:r.map.studentName || context.current.data.settings.name || 'Student Guest',
      section:paper.options.mapSection ?? 'Reading',grade:paper.options.grade ?? 8,practice:r.map.practice,
      screen:r.status==='complete'?(r.map.practice?'finished':'test-ended'):r.map.entered?(r.map.screen==='slow-down'?'slow-down':'question'):'login',
      checked:!!r.map.checked,feedback:r.map.checked?{correct:mapScore(q,r.answers[r.map.order[r.index]] ?? '')===1,answer:mapAnswerText(q),explanation:q.explanation}:null,
      totalMilliseconds:Object.values(r.times).reduce((a,b)=>a+b,0),completedAt:r.completedAt,
    });
  }
  useEffect(()=>{
    active.current=true;ready.current=false;setLoading(true);nonce.current=crypto.randomUUID();timer.current=Date.now();
    let initialized=false;
    const probe=setInterval(()=>{if(!initialized)send('ping');},1000);
    const timeout=setTimeout(()=>{if(!initialized){setLoading(false);setError('MAP 界面未能加载。请重新连接；已保存的考试与答案不会丢失。');}},12000);
    async function receive(event:MessageEvent) {
      if(event.source!==frame.current?.contentWindow||!event.data||event.data.channel!=='review-map')return;
      const message=event.data;
      if(message.type==='ready'){if(!ready.current){ready.current=true;init();}return;}
      if(message.nonce!==nonce.current)return;
      if(message.type==='initialized'){initialized=true;clearInterval(probe);clearTimeout(timeout);setLoading(false);setError('');return;}
      const q=currentQuestion(),r=run.current,id=r.map?.order[r.index];
      if(!q||!id||!r.map)return;
      let acquired=false;
      try {
        if(message.type==='visible') {capture();visible.current=message.visible===true && !document.hidden;timer.current=Date.now();return;}
        if(message.type==='snapshot') {
          if(lock.current||r.status!=='active'||message.questionId!==q.id)return;
          const parsed=responseFromMapState(q,message.state);
          await save({...r,answers:r.map.checked?r.answers:{...r.answers,[id]:parsed.answer},notes:{...r.notes,[id]:parsed.state.note},map:{...r.map,nativeStates:{...r.map.nativeStates,[id]:parsed.state}}});return;
        }
        if(lock.current)return;
        lock.current=true;acquired=true;capture();await writes.current;
        const current=run.current;
        if(message.type==='prepare') {
          await save({...current,map:{...current.map!,studentName:String(message.student ?? '').slice(0,80),screen:'confirmed'}},true);send('confirmed');
        } else if(message.type==='start') {
          await save({...current,map:{...current.map!,entered:true,screen:'question'}},true);timer.current=Date.now();init();
        } else if(message.type==='pause') {
          await save({...current,map:{...current.map!,screen:'slow-down'}},true);
        } else if(message.type==='resume') {
          await save({...current,map:{...current.map!,screen:'question'}},true);timer.current=Date.now();init();
        } else if(message.type==='next') {
          if(current.status==='complete'||message.questionId!==q.id)throw Error('本题已提交，请等待下一题加载。');
          const parsed=responseFromMapState(q,message.state);
          const answered={...current,answers:current.map?.checked?current.answers:{...current.answers,[id]:parsed.answer},notes:{...current.notes,[id]:parsed.state.note},map:{...current.map!,nativeStates:{...current.map!.nativeStates,[id]:parsed.state}}};
          if(!mapAnswered(q,answered.answers[id] ?? ''))throw Error('请完成本题后继续。');
          if(answered.map.practice&&!answered.map.checked) {
            await save({...answered,map:{...answered.map,checked:true}},true);init();
          } else {
            await save(advanceMap(paper,answered,context.current.data.questions),true);timer.current=Date.now();init();
          }
        } else if(message.type==='report') {
          if(current.status!=='complete')throw Error('请完成考试后查看报告。');
          await save({...current,map:{...current.map!,showReport:true}},true);await context.current.refresh();
        } else if(message.type==='exit') {
          await save(current,true);await context.current.refresh();context.current.navigate('subjects','ce');
        }
      } catch(e) {
        if(active.current){const text=e instanceof Error?e.message:'保存未完成，请重试。';setError(text);send('error',{message:text});}
      } finally {if(acquired)lock.current=false;}
    }
    const tick=setInterval(()=>{if(lock.current)return;capture();void save(run.current).catch(e=>setError(e.message));},10000);
    function visibility(){capture();if(document.hidden)visible.current=false;timer.current=Date.now();}
    function hide(){if(lock.current)return;capture();void save(run.current).catch(()=>{});}
    window.addEventListener('message',receive);window.addEventListener('pagehide',hide);document.addEventListener('visibilitychange',visibility);
    return()=>{hide();active.current=false;clearInterval(tick);clearInterval(probe);clearTimeout(timeout);window.removeEventListener('message',receive);window.removeEventListener('pagehide',hide);document.removeEventListener('visibilitychange',visibility);};
  },[connection]);
  return <main className="map-native-host">
    {/* This is the trusted bundled renderer, not imported or AI-authored HTML.
        Same-origin requests retain the private Sites session for scripts/assets. */}
    <iframe key={connection} ref={frame} title="MAP 考试" src={assetPath('map-player/index.html')} sandbox="allow-scripts allow-same-origin allow-modals allow-popups" allow="fullscreen" onLoad={()=>send('ping')} />
    {loading&&<div className="map-native-error" role="status">正在加载 MAP 考试界面…<button onClick={()=>navigate('subjects','ce')}>返回 CE</button></div>}
    {error&&<div className="map-native-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="关闭错误提示">×</button><button onClick={()=>{setError('');setConnection(n=>n+1);}}>重新连接</button><button onClick={()=>navigate('subjects','ce')}>返回 CE</button></div>}
  </main>;
}
