import { z } from 'zod';
import type { Question } from './model';
import type { ExamPaper, ExamRun } from './exam-model';
export const nativeMapStateSchema = z.object({
  answers:z.record(z.string().max(12),z.array(z.number().int().min(0).max(11)).max(6)),
  gaps:z.record(z.string().max(12),z.number().int().min(0).max(11)),
  pronoun:z.string().max(12).nullable(),text:z.string().max(1000),
  zoom:z.number().int().min(100).max(200),note:z.string().max(10000),
  eliminated:z.array(z.string().max(25)).max(12),marks:z.array(z.string().max(1500)).max(100),
});
export type NativeMapState = z.infer<typeof nativeMapStateSchema>;
const html=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const lines=(s:string)=>html(s).replace(/\n/g,'<br>');
export function nativeMapQuestion(q:Question,paper:ExamPaper,run:ExamRun) {
  const m=q.examTask?.map;
  if(!m)throw Error('MAP 题目内容缺失');
  const type = ({mcq:'single-choice',multi_select:'split-multiple',two_part:'split-parts',gap_match:'gap-match',hot_text:'pronoun',text_entry:'text-entry'} as const)[m.type];
  const passage = lines(m.passage ?? '');
  const title=html(m.passageTitle ?? '');
  return {
    id:q.id,type:m.layout==='word-table'?'word-table':type,number:run.index+1,
    subject:paper.options.mapSection ?? 'Reading',grade:paper.options.grade ?? 8,
    instruction:html(m.instruction ?? (m.passage?'Read the passage.':'')),
    title,prompt:lines(m.prompt),choices:m.choices?.map(html) ?? [],
    image:m.image?`<img class="imported-image" src="${m.image}" alt="${html(m.imageAlt ?? '')}">`:'',
    paragraphs:(m.passage ?? '').split(/\n\s*\n/).filter(Boolean).map(lines),
    passage:(m.type==='hot_text' ? passage.replace(/\[([^\]]+)\]/g,(whole,word)=>{
      const i=m.tokens?.findIndex(t=>html(t)===word) ?? -1;return i<0?whole:`{{${i}}}`;
    }) : m.type==='gap_match' ? passage.replace(/\{\{(\d+)\}\}/g,(_,n)=>`{{${Number(n)-1}}}`) : `<h1 class="passage-title">${title}</h1>${m.image?`<img class="imported-image" src="${m.image}" alt="${html(m.imageAlt ?? '')}">`:''}<div class="imported-passage">${passage}</div>`),
    preamble:m.type==='two_part'?'This question has two parts. Answer Part A, and then answer Part B.':'',
    parts:m.parts?.map((p,i)=>({label:'Part '+(i?'B':'A'),prompt:lines(p.prompt),choices:p.choices.map(html)})),
    maxSelections:m.selectCount ?? (Array.isArray(m.answer)?m.answer.length:1),
    gapCount:Array.isArray(m.answer)?m.answer.length:1,
    word:html(m.word ?? ''),tokens:m.tokens?.map(html),requiresCorrection:!!m.correction,
    secondaryPrompt:'Enter a word that will correct the error.',attribution:'',
  };
}
export function responseFromMapState(q:Question,input:unknown) {
  const state=nativeMapStateSchema.parse(input),m=q.examTask!.map!;
  const choice=(group:string,choices:string[])=>{
    const indices=state.answers[group] ?? [];
    if(new Set(indices).size!==indices.length||indices.some(i=>!choices[i]))throw Error('选项状态无效');
    return indices.map(i=>choices[i]);
  };
  let answer='';
  if(m.type==='mcq')answer=choice('main',m.choices!)[0] ?? '';
  if(m.type==='multi_select')answer=JSON.stringify(choice('main',m.choices!));
  if(m.type==='two_part')answer=JSON.stringify(m.parts!.map((p,i)=>choice(String(i),p.choices)[0] ?? ''));
  if(m.type==='gap_match')answer=JSON.stringify((m.answer as string[]).map((_,i)=>m.choices![state.gaps[i]] ?? ''));
  if(m.type==='hot_text') {
    const word=state.pronoun===null?'':m.tokens![Number(state.pronoun)] ?? '';
    answer=m.correction?JSON.stringify([word,state.text]):word;
  }
  if(m.type==='text_entry')answer=state.text;
  return {state,answer};
}
export function initialMapState(q:Question,run:ExamRun,slot:string):NativeMapState {
  if(run.map?.nativeStates?.[slot])return run.map.nativeStates[slot];
  const m=q.examTask!.map!,answer=run.answers[slot] ?? '';
  let values:string[]=[];try{const a=JSON.parse(answer);if(Array.isArray(a))values=a;}catch{}
  const state:NativeMapState={answers:{},gaps:{},pronoun:null,text:'',zoom:run.map?.tools?.zoom ?? 100,note:run.notes[slot] ?? '',eliminated:[],marks:run.highlights?.[slot] ?? []};
  if(m.type==='mcq'&&answer){const n=m.choices!.indexOf(answer);if(n>=0)state.answers.main=[n];}
  if(m.type==='multi_select')state.answers.main=values.map(v=>m.choices!.indexOf(v)).filter(n=>n>=0);
  if(m.type==='two_part')m.parts!.forEach((p,i)=>{const n=p.choices.indexOf(values[i]);if(n>=0)state.answers[i]=[n];});
  if(m.type==='gap_match')values.forEach((v,i)=>{const n=m.choices!.indexOf(v);if(n>=0)state.gaps[i]=n;});
  if(m.type==='hot_text'){const word=m.correction?values[0]:answer;const n=m.tokens!.indexOf(word);if(n>=0)state.pronoun=String(n);state.text=m.correction?(values[1] ?? ''):'';}
  if(m.type==='text_entry')state.text=answer;
  return state;
}
