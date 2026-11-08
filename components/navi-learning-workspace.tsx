'use client';
import {useEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode,type CSSProperties} from 'react';
import {useTranslation} from 'react-i18next';
import {RotateCcw,Undo2,Save,X} from 'lucide-react';
import {NaviUIController,registerNaviUI,panelNames,workspaceModes,type NaviUIAction} from '@/lib/navi-ui';
import type {Question,Grade} from '@/lib/model';
import {currentNamespace,put} from '@/lib/store';
import {useReview} from './review-context';
import MathText from './math-text';
import QuestionVisual from './question-visual';
import {NaviDiagramContext} from './navi-diagram-control';

/** Wrap the real answer form; layout changes never remount or replace its input state. */
export default function NaviLearningWorkspace({question:q,answer,grade,children,onFocus,focused,protected:locked=false,onHelp,onAssistance}:{question:Question;answer:string;grade:Grade|null;children:ReactNode;onFocus:(value:boolean)=>void;focused:boolean;protected?:boolean;onHelp:()=>void;onAssistance:(level:1|2|3|4)=>void}){
 const {t}=useTranslation('study'),{data,refresh,notify}=useReview(),ns=currentNamespace();
 const live=useRef({questionId:q.id,answer,grade:grade??undefined});live.current={questionId:q.id,answer,grade:grade??undefined};
 const controller=useMemo(()=>new NaviUIController({panels:panelNames.filter(p=>p!=='diagram'||!!q.diagram||!!q.media?.length),questionIds:data.questions.map(q=>q.id),molecule:!!((q.diagram as any)?.kind==='chemistry'&&(q.diagram as any).view==='molecule3d'),protected:locked}),[q.id,ns,locked]);
 controller.readEvidence=()=>live.current;
 controller.assistance=onAssistance;
 const layout=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>registerNaviUI(controller),[controller]);
 const baselineFocus=useRef(focused);if(layout.mode==='default'&&!controller.history.length)baselineFocus.current=focused;
 useEffect(()=>{onFocus(layout.mode==='default'?baselineFocus.current:layout.mode==='focus');},[layout.mode]);
 const exec=(actions:NaviUIAction[])=>{const result=controller.execute(actions,'user');setError(result.ok?'':t('navi.live.error.'+result.reason));};
 const other=data.questions.find(v=>v.id===layout.questionId&&v.id!==q.id),node=data.nodes.find(n=>n.id===q.nodeId);
 async function save(){if(saving)return;setSaving(true);try{await put('job',{id:'navi-layout:'+q.subject,kind:'navi-layout',subject:q.subject,layout,updatedAt:new Date().toISOString()},'navi-layout:'+q.subject,false,ns);if(currentNamespace()===ns){await refresh();notify(t('navi.live.saved'));}}catch{setError(t('navi.error.save'));}finally{setSaving(false);}}
 function restoreSaved(){const stored=data.jobs?.find(j=>j.id==='navi-layout:'+q.subject)?.layout;if(!stored)return;const actions:NaviUIAction[]=[{type:'setLayout',mode:stored.mode},{type:'setFontSize',value:stored.fontSize}];if(stored.mode==='board'&&stored.panels?.length)actions.push({type:'arrangeComponents',panels:stored.panels});if(q.diagram)actions.push({type:'setZoom',value:stored.zoom});exec(actions);}
 const component=(name:string)=>{
  switch(name){
   case 'question':return <><MathText>{q.prompt}</MathText><QuestionVisual question={q}/></>;
   case 'explanation':return other?<><MathText>{other.prompt}</MathText><QuestionVisual question={other}/><MathText>{other.explanation}</MathText></>:<><MathText>{q.answer}</MathText><MathText>{q.explanation}</MathText></>;
   case 'diagram':return q.diagram||q.media?.length?<QuestionVisual question={q} stage="question"/>:<p>{t('navi.live.noDiagram')}</p>;
   case 'steps':return <><ol>{q.solution?.slice(0,layout.visibleSteps).map((s,i)=><li key={i}><MathText>{s}</MathText></li>)}</ol>{!q.solution?.length&&<button className="text-button" onClick={onHelp}>{t('navi.live.askDerivation')}</button>}{(q.solution?.length??0)>layout.visibleSteps&&<button onClick={()=>exec([{type:'configureComponent',component:'steps',visibleSteps:Math.min(50,layout.visibleSteps+1)}])}>{t('navi.live.nextStep')}</button>}</>;
   case 'answer':return <><MathText>{answer||t('navi.live.noAnswer')}</MathText>{grade&&<><p>{t('navi.live.officialGrade')} · {grade.score}/{grade.maxScore}</p><MathText>{grade.feedback}</MathText>{grade.criteria.map(c=><p key={c.id}><b>{c.score}</b> · {c.evidence} · {c.missing}</p>)}</>}</>;
   case 'rubric':return <>{(grade?.ruleSnapshot?.criteria??q.rubric)?.map(r=><div key={r.id}><b>{r.title} · {r.max}</b><MathText>{r.description??''}</MathText></div>)}{!(q.rubric?.length||grade?.ruleSnapshot)&&<p>{t('navi.live.noRubric')}</p>}{grade?.solo&&<p>SOLO {grade.solo.level} · {grade.solo.evidence}</p>}</>;
   case 'source':return <><p>{q.source||t('navi.live.noSource')}</p><small>{q.id} · {q.version}</small></>;
   case 'knowledge':return <><h4>{node?.title}</h4>{node?.skills.map(s=><p key={s.id}>{s.title}</p>)}</>;
   case 'notes':return <>{data.notes.filter(n=>n.nodeId===q.nodeId).map(n=><MathText key={n.id}>{n.body}</MathText>)}<button className="text-button" onClick={onHelp}>{t('navi.live.discuss')}</button></>;
  }
 };
 return <NaviDiagramContext.Provider value={{zoom:layout.zoom,molecule:layout.molecule}}><section className={'navi-live-learning navi-layout-'+layout.mode} style={{'--navi-panel-width':layout.width+'%','--navi-font':layout.fontSize+'px','--navi-zoom':layout.zoom} as CSSProperties}>
 {!locked&&layout.mode!=='default'&&<div className="navi-live-toolbar"><select aria-label={t('navi.live.layout')} value={layout.mode} onChange={e=>exec([{type:'setLayout',mode:e.target.value as typeof layout.mode}])}>{workspaceModes.map(m=><option value={m} key={m}>{t('navi.live.mode.'+m)}</option>)}</select><button onClick={()=>exec([{type:'restoreLayout',target:'undo'}])} aria-label={t('navi.live.undo')}><Undo2 size={16}/></button><button onClick={()=>exec([{type:'restoreLayout',target:'default'}])} aria-label={t('navi.live.reset')}><RotateCcw size={16}/></button><button disabled={saving} onClick={()=>void save()}><Save size={16}/>{t('navi.live.save')}</button>{data.jobs?.some(j=>j.id==='navi-layout:'+q.subject)&&<button onClick={restoreSaved}>{t('navi.live.load')}</button>}{layout.panels.length>0&&<input type="range" min="25" max="75" value={layout.width} aria-label={t('navi.live.width')} onChange={e=>exec([{type:'resizePanel',panel:layout.panels[0],percent:Number(e.target.value)}])}/>}</div>}
 {error&&<p role="alert">{error}</p>}<div className="navi-live-columns"><div className="navi-live-question">{children}</div>{layout.panels.length>0&&<aside className="navi-live-panels" aria-label={t('navi.live.panels')}>{layout.panels.map((name,i)=><section key={name}><header><h3>{t('navi.live.panel.'+name)}</h3><span><button disabled={!i} aria-label={t('navi.live.up')} onClick={()=>{const panels=[...layout.panels];[panels[i-1],panels[i]]=[panels[i],panels[i-1]];exec([{type:'arrangeComponents',panels}]);}}>↑</button><button aria-label={t('navi.close')} onClick={()=>exec([{type:'removeRegisteredComponent',component:name}])}><X size={14}/></button></span></header>{component(name)}</section>)}</aside>}</div>
 </section></NaviDiagramContext.Provider>;
}
