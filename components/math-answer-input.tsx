'use client';
import {tr} from '@/lib/i18n';
import {useEffect,useRef,useState} from 'react';
import type {MathfieldElement} from 'mathlive';
import {assetPath} from '@/lib/runtime';
import {mathInputProblem,type MathAnswerFormat} from '@/lib/math-input-format';

export function MathAnswerInput({value,onChange,disabled=false,readOnly=false,placeholder='输入公式',label='数学答案'}:{value:string;onChange:(v:string)=>void;disabled?:boolean;readOnly?:boolean;placeholder?:string;label?:string}){
 const host=useRef<HTMLDivElement>(null),field=useRef<MathfieldElement|null>(null),callback=useRef(onChange),latest=useRef(value),[state,setState]=useState<'loading'|'ready'|'fallback'>('loading'),[problem,setProblem]=useState(''),[keyboardHeight,setKeyboardHeight]=useState(0);
 callback.current=onChange;latest.current=value;
 useEffect(()=>{
  let cancelled=false,cleanup=()=>{};
  async function load(){
   const {MathfieldElement}=await import('mathlive');if(cancelled||!host.current)return;
   MathfieldElement.fontsDirectory=assetPath('vendor/mathlive/fonts');MathfieldElement.soundsDirectory=null;MathfieldElement.computeEngine=null;
   const mf=new MathfieldElement();field.current=mf;
   mf.setAttribute('aria-label',label);mf.setAttribute('placeholder',placeholder);mf.mathVirtualKeyboardPolicy='manual';mf.macros={};mf.readOnly=disabled||readOnly;
   mf.value=mathInputProblem(latest.current)?'':latest.current;
   const mounted=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('公式编辑器挂载超时')),2500);mf.addEventListener('mount',()=>{clearTimeout(timer);resolve();},{once:true});});
   host.current.replaceChildren(mf);await mounted;if(cancelled){mf.remove();return;}
   // menuItems is only available after MathLive's public mount event.
   mf.menuItems=[];
   const input=()=>{const raw=mf.value,error=mathInputProblem(raw);if(error){setProblem(error);mf.setValue(latest.current,{silenceNotifications:true});return;}setProblem(mf.errors.length?'公式尚未完整，请检查括号、分母和占位符':'');callback.current(raw);};
   const keyboard=()=>{const vk=window.mathVirtualKeyboard;const height=vk.visible?vk.boundingRect.height:0;setKeyboardHeight(height);host.current?.style.setProperty('--math-keyboard-height',height+'px');document.documentElement.style.setProperty('--review-math-keyboard-height',height+'px');};
   const vk=window.mathVirtualKeyboard;vk.addEventListener('geometrychange',keyboard);vk.addEventListener('virtual-keyboard-toggle',keyboard);
   const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&vk.visible){vk.hide();setKeyboardHeight(0);event.stopPropagation();}};mf.addEventListener('keydown',escape);
   const paste=(event:ClipboardEvent)=>{const error=mathInputProblem(event.clipboardData?.getData('text/plain')??'');if(error){event.preventDefault();setProblem(error);}};
   mf.addEventListener('paste',paste);
   mf.addEventListener('input',input);setState('ready');
   cleanup=()=>{mf.removeEventListener('input',input);mf.removeEventListener('paste',paste);mf.removeEventListener('keydown',escape);vk.removeEventListener('geometrychange',keyboard);vk.removeEventListener('virtual-keyboard-toggle',keyboard);vk.hide();document.documentElement.style.removeProperty('--review-math-keyboard-height');mf.remove();field.current=null;};
  }
  load().catch(e=>{if(!cancelled){setProblem(e instanceof Error?e.message:'数学输入加载失败');setState('fallback');}});return()=>{cancelled=true;cleanup();};
 },[label,placeholder]);
 useEffect(()=>{const mf=field.current;if(mf){mf.readOnly=disabled||readOnly;if(mf.value!==value&&!mathInputProblem(value))mf.setValue(value,{silenceNotifications:true});}},[value,disabled,readOnly]);
 const commands=[['分数','\\frac{#0}{#?}'],['根号','\\sqrt{#0}'],['指数','{#0}^{#?}'],['下标','{#0}_{#?}'],['绝对值','\\left|#0\\right|'],['方程组','\\begin{cases}#0&#?\\\\#?&#?\\end{cases}'],['单位','\\mathrm{#0}']] as const;
 return <div className="math-answer-input">
  {state!=='fallback'&&<div ref={host} className="mathlive-host"/>}
  {state==='loading'&&<span role="status">{tr("study:数学输入加载中…")}</span>}
  {state==='fallback'&&<><p role="status">{tr("study:数学输入暂不可用，可继续输入文字或 LaTeX。")}</p><textarea aria-label={label} value={value} disabled={disabled} readOnly={readOnly} placeholder={placeholder} onChange={e=>onChange(e.target.value)} maxLength={4000}/></>}
  {state==='ready'&&<div className="math-input-tools">{commands.map(([name,latex])=><button type="button" key={name} disabled={disabled||readOnly} onClick={()=>{field.current?.focus();field.current?.insert(latex);}}>{name}</button>)}<button type="button" disabled={disabled||readOnly} onClick={()=>field.current?.executeCommand('undo')}>{tr("study:撤销")}</button><button type="button" disabled={disabled||readOnly} onClick={()=>field.current?.executeCommand('redo')}>{tr("study:重做")}</button><button type="button" disabled={disabled||readOnly} onClick={()=>{field.current?.focus();window.mathVirtualKeyboard.visible?window.mathVirtualKeyboard.hide():window.mathVirtualKeyboard.show();}}>{tr("study:数学键盘")}</button></div>}
  {problem&&<p className="math-input-problem" role="status">{problem}</p>}
  {keyboardHeight>0&&<button type="button" className="math-keyboard-dismiss" style={{bottom:keyboardHeight+10}} aria-label={tr("study:收起数学键盘")} onClick={()=>{window.mathVirtualKeyboard.hide();setKeyboardHeight(0);field.current?.blur();}}>{tr("study:收起键盘 ⌄")}</button>}
 </div>;
}
export default function MathAnswerComposer({value,format,onChange,onFormatChange,disabled=false,defaultMixed=false,name}:{value:string;format:MathAnswerFormat;onChange:(v:string)=>void;onFormatChange:(f:MathAnswerFormat)=>void;disabled?:boolean;defaultMixed?:boolean;name?:string}){
 const [fragment,setFragment]=useState('');
 return <div className="math-answer-composer">
  <div className="math-format-picker" role="group" aria-label={tr("study:答案输入方式")}>{([['text',tr("study:文字")],['latex',tr("study:公式")],['mixed',tr("study:文字与公式")]] as const).map(([id,title])=><button type="button" key={id} aria-pressed={format===id} disabled={disabled} onClick={()=>onFormatChange(id)}>{title}</button>)}</div>
  {name&&<input type="hidden" name={name} value={value}/>}<input type="hidden" name="answerFormat" value={format}/>
  {format==='latex'?<MathAnswerInput value={value} onChange={onChange} disabled={disabled}/>:<textarea aria-label={tr("study:你的回答")} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} rows={defaultMixed?6:3} maxLength={16000} placeholder={format==='mixed'?tr("study:用文字说明过程，公式可在下方输入后插入。"):tr("study:输入答案；原有文字不会被自动转换。")}/>}
  {format==='mixed'&&<div className="mixed-math-fragment"><MathAnswerInput value={fragment} onChange={setFragment} disabled={disabled} label={tr("study:插入到回答中的公式")}/><button type="button" disabled={disabled||!fragment.trim()||!!mathInputProblem(fragment)} onClick={()=>{onChange(value+(value?' ':'')+'$'+fragment+'$');setFragment('');}}>{tr("study:插入公式到回答")}</button></div>}
 </div>;
}
