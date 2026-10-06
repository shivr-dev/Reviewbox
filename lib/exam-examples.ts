import {DET_TASKS} from './det-model';
import {DET_TEMPLATES} from './det-templates';
import {EXAM_TASK_TEMPLATES} from './import-templates';
const choice={id:'q1',type:'mcq',skill:'Subject–verb agreement',difficulty:2,prompt:'Choose the correct verb.',passage:'The library ___ at nine every morning.',choices:['opens','open','opening','have opened'],correct:0,explanation:'The singular subject library takes opens in the present simple.'};
const reading={...choice,id:'q2',skill:'Find explicit information',passage:'The library opens at nine on weekdays and at ten on Saturdays.',prompt:'When does the library open on Saturday?',choices:['At eight.','At nine.','At ten.','At eleven.'],correct:2,explanation:'The passage explicitly gives ten as the Saturday opening time.'};
const essay={id:'q3',type:'essay',skill:'Develop and support a thesis',difficulty:3,prompt:'Should public libraries extend their opening hours? Discuss the view that longer hours improve access, the view that they increase costs, and your own position.',answer:'Libraries should extend evening hours on selected days because students and workers need access outside working hours. A limited trial would control staffing costs while measuring demand.',explanation:'State a position, engage with the competing views, and support the argument with reasons and examples.',rubric:[{id:'argument',title:'Argument and support',max:6,description:'Presents a clear position, addresses competing perspectives and supports the reasoning.',skillId:'apply'}]};
const stage=(id:string,label:string,type:string,count:number,durationSeconds:number)=>({id,label,section:label,type,count,durationSeconds});
export const EXAM_SKILL_EXAMPLES:Record<string,any>={
 'SAT：两模块固定路线专项练习':{schemaVersion:1,id:'sat-example',exam:'SAT',title:'SAT 固定路线专项练习（每模块1题）',flow:[stage('rw1','Reading and Writing','bluebook',1,120),stage('rw2','Reading and Writing','bluebook',1,120)],sectionsInline:{rw1:{questions:[choice]},rw2:{questions:[reading]}}},
 'SAT：第二模块分流专项练习':{schemaVersion:1,id:'sat-adaptive-example',exam:'SAT',title:'SAT 分流专项练习（每模块1题）',flow:[stage('rw1','Reading and Writing','bluebook',1,120),stage('rw2','Reading and Writing','bluebook',1,120)],sectionsInline:{rw1:{questions:[choice]},rw2_easy:{questions:[{...reading,id:'easy-1',difficulty:1}]},rw2_hard:{questions:[{...reading,id:'hard-1',difficulty:4}]}}},
 'ACT：English、Reading、可选Writing与休息':{schemaVersion:1,id:'act-example',exam:'ACT',title:'ACT 英语专项练习（每部分1题，含写作）',flow:[stage('english','English','act',1,120),stage('reading','Reading','act',1,120),{id:'writing-break',label:'Break',type:'break',durationSeconds:300},stage('writing','Writing','act-writing',1,2400)],sectionsInline:{english:{questions:[choice]},reading:{questions:[reading]},writing:{questions:[essay]}}},
 'TOEFL：四部分题型示例专项练习':{schemaVersion:1,id:'toefl-example',exam:'TOEFL',title:'TOEFL 题型示例专项练习',flow:[stage('reading','Reading','toefl-reading',2,180),stage('listening','Listening','toefl-listening',4,240),stage('writing','Writing','toefl-writing',3,1380),stage('speaking','Speaking','toefl-speaking',2,120)],sectionsInline:{}},
 'MAP：Language Usage 六种题型':{schemaVersion:1,id:'map-language-example',exam:'MAP',title:'MAP Language Usage 6题专项练习',grade:8,testCount:6,flow:[stage('map','Language Usage','map',6,0)],sectionsInline:{map:{questions:[
  {...choice,skill:'Verb agreement',answer:'opens'},
  {id:'m2',type:'multi_select',prompt:'Choose the two correctly capitalized words.',choices:['Monday','January','tuesday','march'],answer:['Monday','January'],selectCount:2,skill:'Capitalization',difficulty:2,explanation:'Days and months begin with capital letters.'},
  {id:'m3',type:'two_part',prompt:'Answer Part A and then Part B.',passage:'Lee checked his work twice before handing it in. He wanted to avoid careless mistakes.',parts:[{prompt:'How does Lee approach his work?',choices:['Carefully.','Carelessly.'],answer:'Carefully.'},{prompt:'Which detail supports Part A?',choices:['He checked his work twice.','He handed it in.'],answer:'He checked his work twice.'}],answer:['Carefully.','He checked his work twice.'],skill:'Inference and supporting evidence',difficulty:2,explanation:'Checking twice shows care and provides the direct supporting evidence.'},
  {id:'m4',type:'gap_match',prompt:'Move the transition into the blank.',passage:'It was raining. {{1}}, we stayed inside.',choices:['Therefore','Likewise'],answer:['Therefore'],skill:'Transitions',difficulty:2,explanation:'Therefore introduces a result.'},
  {id:'m5',type:'hot_text',prompt:'Choose the incorrect pronoun, then correct it.',passage:'[She] gave the books to [I].',tokens:['She','I'],answer:'I',correction:'me',skill:'Pronoun case',difficulty:2,explanation:'The object of to must use the object pronoun me.'},
  {id:'m6',type:'text_entry',prompt:'Complete the sentence with the plural of child: The ____ are reading.',answer:'children',acceptedAnswers:['Children'],skill:'Irregular plurals',difficulty:2,explanation:'The irregular plural of child is children.'}
 ]}}},
 'MAP：Reading 专项练习':{schemaVersion:1,id:'map-reading-example',exam:'MAP',title:'MAP Reading 1题专项练习',grade:8,testCount:1,flow:[stage('map','Reading','map',1,0)],sectionsInline:{map:{questions:[{...reading,answer:'At ten.'}]}}},
 'Duolingo：可直接导入的混合题型专项练习':{schemaVersion:1,id:'det-example',exam:'DET',title:'Duolingo 7题专项练习',flow:[stage('det','Mixed Tasks','det',7,780)],sectionsInline:{det:{questions:['det_read_select','det_fill_blanks','det_read_complete','det_listen_type','det_writing','det_writing_followup','det_read_speak'].map((type,i)=>({id:'d'+(i+1),type,skill:type,difficulty:2,prompt:'Complete the task.',...DET_TEMPLATES[type]}))}}}
};
const toefl=EXAM_SKILL_EXAMPLES['TOEFL：四部分题型示例专项练习'];
for(const [section,types] of Object.entries({reading:['mcq','complete_words'],listening:['listen_response','conversation','announcement','lecture'],writing:['build_sentence','write_email','academic_discussion'],speaking:['listen_repeat','interview']}))toefl.sectionsInline[section]={questions:types.map((type,i)=>({id:section+'-'+i,type,skill:type,difficulty:2,...EXAM_TASK_TEMPLATES[type]}))};
const json=(v:unknown)=>'```json\n'+JSON.stringify(v,null,2)+'\n```';
export const EXAM_EXAMPLE_GUIDE=`
## 如何使用示例
以下是可直接粘贴导入的完整专项练习包；小题量用于说明格式，不能称作完整官方考试。要生成整卷，保留外层结构，按要求增补不同题目并同步修改 count。不要将这些示例循环复制凑题。
共享阅读材料可以放在 sectionsInline.阶段id.passage；同一部分涉及多篇材料时，每题在 passage 中附对应的完整原文。ACT 的 section 必须明确写 English、Reading 或 Writing；Writing 可选，删除写作时同时删除其前的 break。
SAT 全长固定卷为27+27题；分流卷需27道第一模块、27道较易第二模块、27道较难第二模块；实际考54题，导入题池81题。仅 flow 有 rw2，sectionsInline 使用 rw2_easy/rw2_hard；不要把三条路线都列入 flow。
${Object.entries(EXAM_SKILL_EXAMPLES).map(([title,example])=>'### '+title+'\n'+json(example)).join('\n\n')}

## Duolingo 每种任务的题目对象示例
下面每个对象属于 sectionsInline.阶段id.questions 数组，并非完整试卷。保留上面的 DET 外层结构，将对象加入 questions，更新 count。缺少图片资源的两道 photo 示例需要先替换为你实际上传图片的 data URL，或把图片随 ZIP 放入 assets/photo.jpg 并使用顶层 image:"assets/photo.jpg"；占位符不能直接导入。
Interactive Reading 一组6题共享 group、同一完整文章，按说明设置不同任务视图；Interactive Listening 前6题共享 group，摘要另计时。不要把首问和追问分开排列。
${Object.entries(DET_TASKS).map(([type,spec])=>'### '+type+' · '+spec.route+'\n'+json({id:type+'-example',type,prompt:'Complete the task.',skill:type,difficulty:2,...DET_TEMPLATES[type]})).join('\n\n')}

## JSON 与 ZIP 的区别
纯文字、audioText、已嵌入 data URL 的图片：粘贴完整 JSON 即可，不需要音频或图片路径。
真实媒体文件：ZIP 根目录是 manifest.json，其 flow 与 JSON 一致；sections 写文件路径，例如 {"reading":"sections/reading.json"}，该文件内容是 {"questions":[...]}；音频 audio:"assets/listening.mp3"，图片 image:"assets/photo.jpg"。路径须对应 ZIP 内真实文件，不可写电脑路径或编造远程 URL。不要把程序源码 ZIP 当作试卷包。
## 输出前检查
1. 只输出用户要求的一份包，不混合学习包与考试包的外层结构。
2. flow 每个非休息 id 都有对应 sectionsInline，count 与题目数一致；时间单位是秒。
3. 选择答案是正确选项完整文字或 correct 下标（0为第一个），不把选项字母当答案；MAP 多选、DET 多空用数组。
4. 原文、音频文字、图像和评分依据足够作答；补词完整答案与缺失位置一致。
5. 全卷题量符合本文配置；少量题必须标明专项练习；所有题目原创、关联明确能力，提供准确解析。
`;
