import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Existing test harness uses jsdom without its optional declaration package.
import {JSDOM} from 'jsdom';
import {Packer} from 'docx';
import {unzipSync,strFromU8} from 'fflate';
import {bookletDocument,latexToOmml,type BookletKind} from '../lib/export-docx';
globalThis.DOMParser=new JSDOM('').window.DOMParser;
const question:any={schemaVersion:1,id:'export-qa',nodeId:'math',skillId:'solve',subject:'math',difficulty:2,type:'subjective',prompt:'求解 $\\frac{x+1}{2}=3$。',answer:'ANSWER_SECRET x=5',explanation:'SOLUTION_SECRET 两边同乘2再减1',expectedSeconds:90,variant:'qa',source:'Isolated test',tags:[],version:'1',gradingRule:{id:'r',version:'1',mode:'rubric-solo',maxScore:4,criteria:[{id:'r1',skillId:'solve',title:'RUBRIC_SECRET',max:4,description:'有效推导',fullCredit:'满分证据',partialCredit:'部分得分证据',deductions:'扣分证据'}],solo:{fullCreditLevel:'L4',levels:['L1','L2','L3','L4','L5'].map(level=>({level,description:'描述'+level}))}}};
async function xml(kind:BookletKind,q=question){const zipped=await Packer.toBuffer(bookletDocument([q],{title:'Export integrity',kind,answerLines:2,groupBy:'none',images:{}}));return strFromU8(unzipSync(zipped)['word/document.xml']);}
test('student and exam exports do not leak answers, solution text or grading criteria',async()=>{for(const kind of ['workbook','exam'] as BookletKind[]){const value=await xml(kind);assert.doesNotMatch(value,/ANSWER_SECRET|SOLUTION_SECRET|RUBRIC_SECRET/);assert.match(value,/<m:f>/);assert.match(value,/w:w="11906" w:h="16838"/);}});
test('answer, solution and teacher editions include only the intended level of detail',async()=>{const answer=await xml('answers');assert.match(answer,/ANSWER_SECRET/);assert.doesNotMatch(answer,/SOLUTION_SECRET|RUBRIC_SECRET/);const solution=await xml('solutions');assert.match(solution,/SOLUTION_SECRET/);const teacher=await xml('teacher');for(const text of ['ANSWER_SECRET','SOLUTION_SECRET','RUBRIC_SECRET','SOLO','L1','L5','满分证据','部分得分证据','扣分证据'])assert.ok(teacher.includes(text),text);});
test('matching question export preserves visible item text and resolves stable ID answers to text',async()=>{const q={...question,type:'matching',prompt:'配对',matching:{left:[{id:'leftOpaque',text:'三角形'}],right:[{id:'rightOpaque',text:'半底乘高'}]},answer:'{"leftOpaque":"rightOpaque"}'};const student=await xml('workbook',q);assert.match(student,/三角形/);assert.match(student,/半底乘高/);assert.doesNotMatch(student,/leftOpaque|rightOpaque/);const answer=await xml('answers',q);assert.match(answer,/三角形/);assert.match(answer,/半底乘高/);assert.doesNotMatch(answer,/leftOpaque|rightOpaque/);});
test('native equations cover fractions, roots and sub/superscripts and reject executable-like input',()=>{for(const latex of ['\\frac{a}{b}','\\sqrt{x}','x^2','a_1','a_1^2'])assert.ok(latexToOmml(latex).length);assert.throws(()=>latexToOmml('\\htmlClass{bad}{x}'));});
test('SVG figures keep aspect ratio, carry PNG fallback and do not leak solution-stage artwork',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lR8AAAAASUVORK5CYII=','base64');
 const image=(stage:'question'|'solution')=>({type:'svg' as const,data:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><text>${stage==='question'?'QUESTION_FIGURE':'SOLUTION_FIGURE_SECRET'}</text></svg>`),fallback:png,width:600,height:300,alt:'isolated image test',stage});
 for(const kind of ['workbook','teacher'] as BookletKind[]){
  const files=unzipSync(await Packer.toBuffer(bookletDocument([question],{title:'Image stage test',kind,answerLines:0,groupBy:'none',images:{[question.id]:[image('question'),image('solution')]}})));
  const svgFiles=Object.entries(files).filter(([name])=>name.startsWith('word/media/')&&name.endsWith('.svg'));
  assert.equal(svgFiles.length,kind==='workbook'?1:2);
  assert.ok(Object.keys(files).some(name=>name.startsWith('word/media/')&&name.endsWith('.png')));
  const xml=strFromU8(files['word/document.xml']);assert.match(xml,/cx="5143500" cy="2571750"/);
  const artwork=svgFiles.map(([,data])=>strFromU8(data)).join('');assert.match(artwork,/QUESTION_FIGURE/);
  if(kind==='workbook')assert.doesNotMatch(artwork,/SOLUTION_FIGURE_SECRET/);else assert.match(artwork,/SOLUTION_FIGURE_SECRET/);
 }
});
test('unsupported matrix expressions fail explicitly instead of silently flattening layout',()=>{assert.throws(()=>latexToOmml('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'),/mtable/);});
