import {Document,Packer,Paragraph,TextRun,ImageRun,Math as Equation,MathRun,MathFraction,MathSuperScript,MathSubScript,MathSubSuperScript,MathRadical,MathRoundBrackets,Header,Footer,PageNumber,AlignmentType,HeadingLevel,type MathComponent,type ParagraphChild} from 'docx';
import katex from 'katex';
import {bioAssetCredit} from './bioicons';
import type {Question} from './model';
import {SUBJECTS} from './model';
import {QUESTION_TYPES} from './question-tools';
import {matchingAnswer} from './matching';
import {Table,TableRow,TableCell,WidthType,MathIntegral,MathSum} from 'docx';
export type BookletKind='workbook'|'exam'|'answers'|'solutions'|'teacher';
export type ExportImage={data:Uint8Array;type:'png'|'jpg'|'svg';fallback?:Uint8Array;width:number;height:number;alt:string;stage:'question'|'solution'};
export type BookletOptions={title:string;kind:BookletKind;answerLines:number;groupBy:'none'|'subject'|'type'|'chapter';images:Record<string,ExportImage[]>;examMinutes?:number;chapters?:Record<string,string>};

/** KaTeX parses trusted syntax, not executable markup. MathML is translated to
 * native OMML through docx. Unsupported structures fail explicitly, never flatten. */
export function latexToOmml(latex:string):MathComponent[]{
 const html=katex.renderToString(latex,{output:'mathml',throwOnError:true,trust:false,strict:'error'});
 const doc=new DOMParser().parseFromString(html,'text/html'),root=doc.querySelector('math');if(!root)throw new Error('公式未能解析');
 const walk=(e:Element):MathComponent[]=>{
  const children=[...e.children],parts=(i:number)=>walk(children[i]),all=()=>children.flatMap(walk);
  switch(e.localName){
   case 'math':case 'mrow':case 'mstyle':case 'mpadded':return all();
   case 'semantics':return parts(0);
   case 'annotation':case 'mphantom':return [];
   case 'mi':case 'mn':case 'mo':return [new MathRun(e.textContent??'')];
   case 'mtext':return [new MathRun({text:e.textContent??'',normalText:true})];
   case 'mspace':return [new MathRun({text:' ',normalText:true})];
   case 'mfrac':return [new MathFraction({numerator:parts(0),denominator:parts(1)})];
   case 'msup':return [new MathSuperScript({children:parts(0),superScript:parts(1)})];
   case 'msub':return [new MathSubScript({children:parts(0),subScript:parts(1)})];
   case 'msubsup':case 'munderover':{
    const op=children[0]?.textContent;
    if(op==='∫')return [new MathIntegral({children:[new MathRun('')],subScript:parts(1),superScript:parts(2)})];
    if(op==='∑')return [new MathSum({children:[new MathRun('')],subScript:parts(1),superScript:parts(2)})];
    return [new MathSubSuperScript({children:parts(0),subScript:parts(1),superScript:parts(2)})];
   }
   case 'munder':case 'mover':throw new Error('带上划线、向量或括号标记的公式暂不能无损转换，请保留原公式图片');
   case 'msqrt':return [new MathRadical({children:all()})];
   case 'mroot':return [new MathRadical({children:parts(0),degree:parts(1)})];
   case 'mfenced':return [new MathRoundBrackets({children:all()})];
   default:throw new Error(`此公式结构暂不能无损导出（${e.localName}），请先保留原公式图片`);
  }
 };return walk(root);
}
export function documentRuns(text:string):ParagraphChild[]{
 const pattern=/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g,items:ParagraphChild[]=[];let cursor=0;
 for(const m of text.matchAll(pattern)){if(m.index!>cursor)items.push(new TextRun(text.slice(cursor,m.index)));const token=m[0],latex=token.startsWith('$$')?token.slice(2,-2):token.startsWith('$')?token.slice(1,-1):token.slice(2,-2);items.push(new Equation({children:latexToOmml(latex)}));cursor=m.index!+token.length;}
 if(cursor<text.length)items.push(new TextRun(text.slice(cursor)));return items.length?items:[new TextRun('')];
}
export function bookletDocument(questions:Question[],options:BookletOptions){
 if(!questions.length)throw new Error('请先选择题目');if(questions.length>200)throw new Error('一次最多导出 200 题，请缩小范围');
 const {kind}=options,answers=['answers','solutions','teacher'].includes(kind),detail=['solutions','teacher'].includes(kind);
 const paragraphs:(Paragraph|Table)[]=[];
 const para=(text:string,extra:object={})=>new Paragraph({children:documentRuns(text),spacing:{after:110,line:300},...extra});
 paragraphs.push(new Paragraph({text:options.title.trim()||'学习题目册',heading:HeadingLevel.TITLE}));
 paragraphs.push(para(({workbook:'学生练习册',exam:'试卷',answers:'答案册',solutions:'解析册',teacher:'教师评分参考'} as const)[kind]+' · '+questions.length+' 题'));
 const points=(q:Question)=>(q.gradingRule?.criteria??q.rubric??[]).reduce((sum,r)=>sum+r.max,0)||1;
 if(!answers){paragraphs.push(para('姓名 ______________    班级 ______________    日期 ______________'));
  if(kind==='exam')paragraphs.push(para(`考试时间：${options.examMinutes??60} 分钟    总分：${questions.reduce((sum,q)=>sum+points(q),0)} 分`));
 }
 let lastGroup='';
 for(const [index,q] of questions.entries()){
  const group=options.groupBy==='subject'?(SUBJECTS.find(s=>s.id===q.subject)?.name??q.subject):options.groupBy==='type'?(QUESTION_TYPES.find(t=>t.id===q.type)?.label??q.type):options.groupBy==='chapter'?(options.chapters?.[q.nodeId]??'未分章节'):'';
  if(group&&group!==lastGroup){paragraphs.push(new Paragraph({text:group,heading:HeadingLevel.HEADING_1}));lastGroup=group;}
  if(q.passage&&kind!=='answers')for(const line of q.passage.split('\n'))paragraphs.push(para(line));
  paragraphs.push(para(`${index+1}. ${kind==='answers'?'':q.prompt+'（'+points(q)+' 分）'}`,{keepNext:true}));
  if(q.matching&&kind!=='answers')paragraphs.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:q.matching.left.map((l,i)=>new TableRow({cantSplit:true,children:[new TableCell({children:[para(`${i+1}. ${l.text}`)]}),new TableCell({children:[para(q.matching!.right[i]?`${String.fromCharCode(65+i)}. ${q.matching!.right[i].text}`:'')]})]}))}));
  const images=(options.images[q.id]??[]).filter(i=>i.stage==='question'||detail);
  if(kind!=='answers')for(const image of images){const factor=Math.min(1,540/image.width,340/image.height),width=image.width*factor,height=image.height*factor;
   const base={transformation:{width,height},altText:{title:image.alt,description:image.alt,name:image.alt}};
   const run=image.type==='svg'?new ImageRun({...base,type:'svg',data:image.data,fallback:{type:'png',data:image.fallback!}}):new ImageRun({...base,type:image.type,data:image.data});
   paragraphs.push(new Paragraph({children:[run],alignment:AlignmentType.CENTER,spacing:{after:120}}));
   if(q.diagram?.type==='semantic'&&q.diagram.kind==='bioasset')paragraphs.push(para(bioAssetCredit(q.diagram.assetId)));
   if(q.diagram?.type==='semantic'&&(q.diagram.kind==='chemistry'||q.diagram.kind==='macromolecule'))paragraphs.push(para(q.diagram.source.citation+(q.diagram.source.url?' · '+q.diagram.source.url:'')));
  }
  if(kind!=='answers')for(const [i,option] of (q.options??[]).entries())paragraphs.push(para(`${String.fromCharCode(65+i)}. ${option}`));
  const pairing=q.matching?matchingAnswer(q,q.answer,true):null;
  const answer=pairing&&q.matching?q.matching.left.map((l,i)=>`${i+1} → ${String.fromCharCode(65+q.matching!.right.findIndex(r=>r.id===pairing[l.id]))}（${l.text} → ${q.matching!.right.find(r=>r.id===pairing[l.id])?.text??''}）`).join('；'):q.answer;
  if(answers){paragraphs.push(para(`答案：${answer}`));if(detail){for(const line of (q.solution?.length?q.solution:[q.explanation]))for(const part of line.split('\n'))paragraphs.push(para(part));}}
  else for(let i=0;i<options.answerLines;i++)paragraphs.push(new Paragraph({text:'',spacing:{after:80,line:380}}));
  if(detail){
   const rule=q.gradingRule,criteria=rule?.criteria??q.rubric??[];
   if(criteria.length)paragraphs.push(para('评分标准',{keepNext:true}));
   for(const r of criteria)paragraphs.push(para(`${r.title}（${r.max} 分）：${r.description}${r.fullCredit?'；满分：'+r.fullCredit:''}${r.partialCredit?'；部分得分：'+r.partialCredit:''}${r.deductions?'；扣分：'+r.deductions:''}`));
   if(rule?.solo){paragraphs.push(para('SOLO 结构评价',{keepNext:true}));for(const level of rule.solo.levels)paragraphs.push(para(level.level+'：'+level.description));}
  }
  if(detail){paragraphs.push(para(`来源：${q.source} · 题目 ${q.id}`,{style:'SourceNote'}));if(q.referenceProvenance)for(const s of q.referenceProvenance.sources)paragraphs.push(para(`原创变式参考：${s.source} · ${s.sourceId} · ${s.url} · ${s.license}`,{style:'SourceNote'}));}
 }
 return new Document({creator:'Reviewbox',title:options.title,description:'从已有学习内容导出的题目册；不调用 AI 生成新题。',styles:{default:{document:{run:{font:{ascii:'Times New Roman',eastAsia:'宋体',hAnsi:'Times New Roman',cs:'Times New Roman'},size:22,color:'000000'},paragraph:{spacing:{line:300,after:100}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{size:32,bold:true,color:'000000'},paragraph:{spacing:{after:180}}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',run:{size:26,bold:true,color:'000000'},paragraph:{spacing:{before:160,after:120},keepNext:true}},{id:'SourceNote',name:'Source note',basedOn:'Normal',run:{size:17,color:'555555'},paragraph:{spacing:{after:180}}}]},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1134,right:1134}}},headers:{default:new Header({children:[new Paragraph({text:'Reviewbox',alignment:AlignmentType.RIGHT,style:'SourceNote'})]})},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT]})]})]})},children:paragraphs}]});
}
export async function exportBooklet(questions:Question[],options:BookletOptions){return Packer.toBlob(bookletDocument(questions,options));}

