import {z} from 'zod';
import {runJSON} from './ai-server';
import {DET_TASKS,parseDetQuestion} from './det-model';
import {DET_TEMPLATES} from './det-templates';
import {examStages,EXAM_FORMAT} from './exam-model';
import {questionSchema} from './importer';
import {objectiveScore} from './question-tools';
export async function detPassage(b:any){
 if(b.format!==EXAM_FORMAT||!/^det-(reading|listening)-\d+$/.test(b.group))throw Error('Duolingo 共享材料组无效。');
 const reading=b.group.includes('reading');
 const v=await runJSON(reading?'Write an original coherent 180-250-word informational or literary passage, with 4 paragraphs separated by double newlines, sufficient evidence for missing word, missing paragraph, main idea, title and two evidence highlight questions. Return {passage:string}.':'Write one original complete college conversation, 180-250 words, with scenario, speakers, concrete information and 5 conversational response turns, followed by an outcome. Return {passage:string}.', {group:b.group,seed:crypto.randomUUID()},0,false,4000);
 return {passage:z.string().min(300).max(16000).parse(v.passage)};
}
export async function detGenerate(b:any){
 if(b.format!==EXAM_FORMAT)throw Error('请选择 Duolingo 试卷。');
 const stages=examStages('DET',{writing:false}),ids=z.array(z.string()).min(1).max(3).parse(b.slots),slots=ids.map(id=>stages.flatMap(s=>s.slots).find(s=>s.id===id));
 if(slots.some(s=>!s))throw Error('Duolingo 题组位置无效。');
 const targets=slots.map(s=>({slotId:s!.id,type:s!.domain,shape:DET_TEMPLATES[s!.domain]}));
 const v=await runJSON(`Generate entirely ORIGINAL Duolingo English Test personal practice tasks. Return {questions:[{slotId,item:{type,prompt,passage?,native?,choices?,correct?,answer,explanation,skill,difficulty,audioText?,rubric?}}]}. Produce exactly the requested types and slots. Use the supplied shapes for field structure only; never copy their sample content. Choice answers must match complete option text. Read-select answer Yes or No and word must be a real word or a plausible pseudoword. Missing letter answers are FULL words and counts agree. Read-complete has prefix{missing_letters} in passage and answer an ordered array of full words. Reading-sentences uses [0], [1] blanks, native.options arrays and correct words array. Listening-complete uses native.blanks:[{text}], native.questions and answer string array. All subjective tasks need a detailed example answer and meaningful rubric. Oral tasks are original prompts with assessment guidance, not claimed official scores. Listening/conversation audioText must be complete English speech. For reading/listening groups base EVERY task on the supplied complete shared passage, preserving factual evidence. Do not duplicate adjacent questions. For photo tasks use only these verified visible facts: two people are reading a map at a picnic table in a green park, trees and a path are visible; provide accurate descriptive reference language without inventing people or actions. Do not output the image; the system attaches the supplied image. Native fields contain DATA only, no HTML or executable code.`,{targets,sharedPassage:b.passage??'',previousPrompts:b.previousPrompts??[],seed:crypto.randomUUID()},0,false,8000);
 if(!Array.isArray(v.questions)||v.questions.length!==slots.length)throw Error('Duolingo 题组不完整。');
 return {questions:slots.map(s=>{
  const slot=s!,raw=v.questions.find((q:any)=>q.slotId===slot.id)?.item;if(!raw||raw.type!==slot.domain)throw Error('Duolingo 题型不匹配。');
  if(/_photo$/.test(raw.type)){if(!/^data:image\/jpeg;base64,/.test(b.photo??''))throw Error('图片素材未能加载，请重试准备。');raw.native={...raw.native,image:b.photo,imageAlt:'Two people reading a map at a picnic table in a green park.'};}
  const q=parseDetQuestion(raw,crypto.randomUUID(),slot,stages[slot.stage]).question;
  q.expectedSeconds=DET_TASKS[raw.type].seconds;return {slotId:slot.id,question:q};
 })};
}
const batch=z.array(z.object({slotId:z.string(),question:questionSchema})).min(1).max(3);
export async function detSolve(b:any){
 const qs=batch.parse(b.questions);
 const v=await runJSON('Independently check and solve every Duolingo practice task without the author answer key. Evaluate complete passage evidence, natural language, missing letter lengths, choices and ambiguity. Return {solutions:[{slotId,answer:string,wellPosed:boolean,unique:boolean,steps:string[]}]}. For array answers use a JSON array encoded inside answer string. For Yes/No use that exact text; for choice copy complete option text. Open writing/speaking tasks are not unique: return unique:false, an example response, and assess sufficient prompt context.',{questions:qs.map(({slotId,question:q})=>({slotId,type:q.examTask?.type,prompt:q.prompt,passage:q.passage,options:q.options,native:q.examTask?.native,audioText:q.examTask?.audioText}))},1,true,6000);
 const solutions=z.array(z.object({slotId:z.string(),answer:z.string(),wellPosed:z.boolean(),unique:z.boolean(),steps:z.array(z.string())})).length(qs.length).parse(v.solutions);
 if(new Set(solutions.map(s=>s.slotId)).size!==qs.length||qs.some(q=>!solutions.some(s=>s.slotId===q.slotId)))throw Error('Duolingo 核验缺项。');return {solutions};
}
export async function detJudge(b:any){
 const qs=batch.parse(b.questions),solvers=z.array(z.array(z.object({slotId:z.string(),answer:z.string(),wellPosed:z.boolean(),unique:z.boolean()}))).min(1).max(3).parse(b.solvers);
 for(const {slotId,question:q} of qs)for(const run of solvers){const s=run.find(s=>s.slotId===slotId);if(!s?.wellPosed||(q.type!=='subjective'&&(!s.unique||objectiveScore(q,s.answer)!==1)))return {pass:false,reason:'答案、条件或唯一性未通过核验。'};}
 const v=await runJSON('Audit the original Duolingo personal practice tasks against independent solutions. Check accurate answers, full contextual evidence, natural language, realistic distractors, missing letter lengths, assessment rubrics and complete instructions. If any question is unreliable reject the batch. Never pass solely because answers agree. Return {pass:boolean,reason:string}.',{questions:qs,solvers},0,true,5000);
 return z.object({pass:z.boolean(),reason:z.string()}).parse(v);
}
