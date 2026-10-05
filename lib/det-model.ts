import type {Question} from './model';
import {questionSchema} from './importer';
import {examNode,type ExamSlot,type ExamStage} from './exam-model';
export const DET_TASKS:Record<string,{route:string;seconds:number;type:'choice'|'blank'|'subjective'}>={
 det_read_select:{route:'read-select',seconds:5,type:'choice'},
 det_fill_blanks:{route:'fill-blanks',seconds:20,type:'blank'},
 det_read_complete:{route:'read-complete',seconds:180,type:'blank'},
 det_listen_type:{route:'listen-type',seconds:60,type:'blank'},
 det_reading_sentences:{route:'reading-sentences',seconds:480,type:'blank'},
 det_reading_passage:{route:'reading-passage',seconds:480,type:'choice'},
 det_reading_highlight:{route:'reading-highlight-1',seconds:480,type:'blank'},
 det_reading_idea:{route:'reading-idea',seconds:480,type:'choice'},
 det_reading_title:{route:'reading-title',seconds:480,type:'choice'},
 det_listening_complete:{route:'listening-complete',seconds:390,type:'blank'},
 det_listening_respond:{route:'listening-respond',seconds:390,type:'choice'},
 det_listening_summary:{route:'listening-summary',seconds:75,type:'subjective'},
 det_write_photo:{route:'write-photo',seconds:60,type:'subjective'},
 det_writing:{route:'writing',seconds:300,type:'subjective'},
 det_writing_followup:{route:'writing-followup',seconds:180,type:'subjective'},
 det_speak_photo:{route:'speak-photo',seconds:90,type:'subjective'},
 det_read_speak:{route:'read-speak',seconds:90,type:'subjective'},
 det_conversation:{route:'conversation',seconds:35,type:'subjective'},
 det_writing_sample:{route:'writing-sample',seconds:300,type:'subjective'},
 det_speaking_sample:{route:'speaking-sample',seconds:180,type:'subjective'},
};
export const DET_ORAL=['det_speak_photo','det_read_speak','det_conversation','det_speaking_sample'];
export function detDefinitions(){
 const reading=['det_reading_sentences','det_reading_passage','det_reading_highlight','det_reading_highlight','det_reading_idea','det_reading_title'];
 const listening=['det_listening_complete',...Array(5).fill('det_listening_respond'),'det_listening_summary'];
 return [
  {title:'Read and Select',types:Array(15).fill('det_read_select')},
  {title:'Fill in the Blanks / Read and Complete',types:[...Array(6).fill('det_fill_blanks'),...Array(3).fill('det_read_complete')]},
  {title:'Listen and Type',types:Array(6).fill('det_listen_type')},
  {title:'Interactive Reading',types:[...reading,...reading]},
  {title:'Interactive Listening',types:[...listening,...listening]},
  {title:'Writing',types:[...Array(3).fill('det_write_photo'),'det_writing','det_writing_followup']},
  {title:'Speaking',types:['det_speak_photo','det_read_speak',...Array(6).fill('det_conversation')]},
  {title:'Samples',types:['det_writing_sample','det_speaking_sample']},
 ];
}
const text=(v:unknown)=>typeof v==='string'?v:'';
export function parseDetQuestion(item:any,id:string,slot:ExamSlot,stage:ExamStage){
 const spec=DET_TASKS[item?.type];if(!spec)throw Error('不支持的 Duolingo 题型：'+text(item?.type));
 const n=structuredClone(item.native??{}),type=item.type;
 const choices=type==='det_read_select'?['Yes','No']:item.choices??item.options;
 let answer=typeof item.correct==='number'?choices?.[item.correct]:typeof item.correct==='string'&&/^[A-F]$/i.test(item.correct)?choices?.[item.correct.toUpperCase().charCodeAt(0)-65]:item.answer;
 if(Array.isArray(answer))answer=JSON.stringify(answer);
 if(type==='det_read_select'){n.word=text(n.word)||text(item.word);if(!/^[a-zA-Z-]{1,60}$/.test(n.word)||!['Yes','No'].includes(answer))throw Error('Read and Select 需要 word 和 Yes / No 答案。');}
 if(type==='det_fill_blanks'){
  n.prefix=text(n.prefix);n.before=text(n.before);n.after=text(n.after);n.missingLength=Number(n.missingLength??text(answer).length-n.prefix.length);
  if(!/^[a-z]+$/i.test(text(answer))||!text(answer).toLowerCase().startsWith(n.prefix.toLowerCase())||n.missingLength<1||n.missingLength>30||n.prefix.length+n.missingLength!==answer.length)throw Error('补词前缀、缺失长度和完整答案不一致。');
 }
 if(type==='det_read_complete'){
  const gaps=text(item.passage).match(/[A-Za-z]+\{[A-Za-z]+\}/g)??[];let values:any[]=[];try{values=JSON.parse(answer);}catch{}
  if(!gaps.length||gaps.length>30||values.length!==gaps.length||gaps.some((g:string,i:number)=>{const [p,m]=g.replace('}','').split('{');return !/^[a-z]+$/i.test(values[i])||!values[i].startsWith(p)||values[i].length!==p.length+m.length;}))throw Error('Read and Complete 原文用前缀{缺失字母}标空，answer 为完整单词数组。');
 }
 if(type.startsWith('det_reading_')&&!text(item.passage))throw Error('Interactive Reading 需要完整阅读原文。');
 if(type==='det_reading_highlight'&&!text(item.passage).includes(text(answer)))throw Error('高亮答案必须来自原文。');
 if(type==='det_reading_sentences'){
  const blanks=[...text(item.passage).matchAll(/\[(\d+)\]/g)].map(m=>Number(m[1]));
  let values:any[]=[];try{values=JSON.parse(answer);}catch{}
  if(!blanks.length||!Array.isArray(n.options)||n.options.length!==blanks.length||values.length!==blanks.length||blanks.some((b,i)=>b!==i)||n.options.some((opts:any,i:number)=>!Array.isArray(opts)||opts.length<2||opts.length>8||!opts.includes(values[i])||opts.some((v:any)=>typeof v!=='string')))throw Error('句子补全用 [0]、[1] 顺序标空，native.options 为各空选项数组，answer 为正确词数组。');
 }
 if(type==='det_listening_complete'){
  let values:any[]=[];try{values=JSON.parse(answer);}catch{}
  if(!Array.isArray(n.blanks)||!n.blanks.length||n.blanks.length>6||n.blanks.length!==values.length||n.blanks.some((b:any)=>!text(b.text))||values.some(v=>typeof v!=='string'))throw Error('Listen and Complete 需要 native.blanks:[{text}] 和等长答案数组。');
  n.questions=Array.isArray(n.questions)?n.questions:n.blanks.map(()=> 'Complete the information.');
 }
 if(/det_listen|det_conversation/.test(type)&&!text(item.audioText)&&!text(item.audio)&&type!=='det_listening_summary')throw Error('听力题需要 audioText 或 ZIP 中的真实音频。');
 if(/_photo$/.test(type)){
  n.image=text(n.image)||text(item.image);if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.image)||n.image.length>1800000)throw Error('图片题需要有效的 PNG / JPEG / WebP data:image 图片，最多约 1.3 MB。');
  n.imageAlt=text(n.imageAlt)||'Question image';
 }
 if(spec.type==='choice'&&(!Array.isArray(choices)||choices.length<2||choices.length>6||!choices.every((s:any)=>typeof s==='string'&&s.trim())||new Set(choices).size!==choices.length||!choices.includes(answer)))throw Error('选择题需要 2–6 个不同选项，答案必须匹配完整选项。');
 const rubric=spec.type==='subjective'?(item.rubric??[{id:'communication',title:'Communication',max:4,description:'Assess relevance, completeness, language accuracy and clarity against the reference response.',skillId:'apply'}]).map((r:any)=>({...r,skillId:'apply'})):undefined;
 const node=examNode('DET',slot,stage);
 const question:Question=questionSchema.parse({schemaVersion:1,id,subject:'ce',nodeId:node.id,skillId:'apply',type:spec.type,prompt:text(item.prompt),passage:text(item.passage)||undefined,options:spec.type==='choice'?choices:undefined,answer,explanation:text(item.explanation),rubric,difficulty:item.difficulty??3,expectedSeconds:spec.seconds,source:'Duolingo 个人模拟',variant:type+'-'+slot.index,tags:['exam-only','DET'],version:'1.0.0',verified:false,examTask:{type,native:n,audioText:text(item.audioText)||undefined,audio:text(item.audio)||undefined,responseSeconds:spec.seconds}});
 return {question,node};
}
