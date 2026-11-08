'use client';
import {useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {generateVerified} from '@/lib/ai-client';
import {validatePack} from '@/lib/importer';
import {inspectPackContent} from '@/lib/import-review';
import {installPack,currentNamespace,loadData} from '@/lib/store';
import type {Question,Pack} from '@/lib/model';
import {useReview} from './review-context';
import MathText from './math-text';
import QuestionVisual from './question-visual';

export default function NaviPracticePreview({question:q,threadId,onClose}:{question:Question;threadId:string;onClose:()=>void}){
 const {t}=useTranslation('study'),{data,refresh,aiReady}=useReview(),owner=useRef(currentNamespace()),gate=useRef(false),alive=useRef(true);
 const [stage,setStage]=useState<'confirm'|'generating'|'preview'|'saved'>('confirm'),[question,setQuestion]=useState<Question>(),[error,setError]=useState(''),[saving,setSaving]=useState(false),[destination,setDestination]=useState('new'),[title,setTitle]=useState(t('navi.practice.defaultTitle'));
 const node=data.nodes.find(n=>n.id===q.nodeId),skill=node?.skills.find(s=>s.id===q.skillId),destinations=data.packs.filter(p=>p.id.startsWith('navi-practice:'));
 function close(){alive.current=false;onClose();}
 async function generate(){if(gate.current||!node||!skill)return;gate.current=true;setStage('generating');setError('');try{const ready=await generateVerified(node,skill,q.difficulty,'Navi: analogous practice; preserve source concept, use fresh conditions.',[],()=>{}, {transferFrom:q,previewOnly:true});if(alive.current&&currentNamespace()===owner.current){setQuestion(ready);setStage('preview');}}catch(e){if(alive.current&&currentNamespace()===owner.current){setError(e instanceof Error?e.message:t('navi.error.request'));setStage('confirm');}}finally{gate.current=false;}}
 async function save(){if(!question||!node||gate.current||currentNamespace()!==owner.current)return;gate.current=true;setSaving(true);setError('');try{
  const latest=await loadData(owner.current),existing=destination==='new'?undefined:latest.packs.find(p=>p.id===destination&&p.id.startsWith('navi-practice:'));
  if(destination!=='new'&&!existing)throw new Error(t('navi.error.context'));
  const manifest:Pack['manifest']=existing?{...existing,version:String(Number(existing.version.split('.')[0])+1)+'.0.0',changelog:'Navi verified practice'}:{id:'navi-practice:'+crypto.randomUUID(),title:title.trim()||t('navi.practice.defaultTitle'),version:'1.0.0',subject:node.subject,description:'Personal Navi practice',changelog:'',compatibility:'Reviewbox 2.1'};
  const current=latest.questions.filter(q=>existing?.questionIds?.includes(q.id)),knowledge=latest.nodes.filter(n=>existing?.nodeIds?.includes(n.id)||n.id===node.id);
  const pack=validatePack({schemaVersion:1,manifest,knowledge,questions:[...current,{...question,source:question.source+' · Navi '+threadId}]});
  pack.questions=pack.questions.map(v=>v.id===question.id?{...v,verified:question.verified,verification:question.verification}:({...v,verified:current.find(q=>q.id===v.id)?.verified,verification:current.find(q=>q.id===v.id)?.verification}));
  const report=inspectPackContent(pack);if(report.blocked.length)throw new Error(t('navi.practice.reviewRequired'));
  if(currentNamespace()!==owner.current)return;await installPack(pack,owner.current);if(alive.current&&currentNamespace()===owner.current){await refresh();setStage('saved');}
 }catch(e){if(alive.current&&currentNamespace()===owner.current)setError(e instanceof Error?e.message:t('navi.error.save'));}finally{gate.current=false;setSaving(false);}}
 return <section className="navi-operation-preview" aria-label={t('navi.practice.title')}><header><h3>{t('navi.practice.title')}</h3><button type="button" onClick={close} aria-label={t('navi.close')}>×</button></header><p>{t('navi.practice.description')}</p>{stage==='confirm'&&<button disabled={!aiReady||!node||!skill} className="primary" onClick={()=>void generate()}>{t('navi.practice.generate')}</button>}{stage==='generating'&&<p role="status">{t('navi.practice.checking')}</p>}{stage==='preview'&&question&&<><MathText>{question.prompt}</MathText><QuestionVisual question={question} stage="solution"/><details><summary>{t('navi.practice.answer')}</summary><MathText>{question.answer}</MathText><MathText>{question.explanation}</MathText></details><label>{t('navi.practice.destination')}<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="new">{t('navi.practice.newPack')}</option>{destinations.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label>{destination==='new'&&<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} aria-label={t('navi.practice.packName')}/>}<button disabled={saving} className="primary" onClick={()=>void save()}>{t('navi.practice.confirmSave')}</button></>}{stage==='saved'&&<p role="status">{t('navi.practice.saved')}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
