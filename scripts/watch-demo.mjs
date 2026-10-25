/** Isolated authored examples. Never uploaded or installed into an authenticated account. */
export function watchDemo(pack, now = Date.now()) {
  const subjects = ['chinese','math','english','ce','physics','chemistry','biology','history'];
  const nodes = subjects.flatMap(subject => pack.knowledge.filter(n => n.subject === subject).slice(0, 3));
  const ids = new Set(nodes.map(n => n.id));
  const questions = pack.questions.filter(q => ids.has(q.nodeId) && q.type === 'recall').map(q => ({...q, verified:true}));
  const authored = [
    ['math','2x + 3 = 11，x 等于多少？',['2','3','4','7'],'4','两边减 3，再同时除以 2，得 x = 4。'],
    ['english','Which word means a clue about a later event?',['Flashback','Foreshadowing','Dialogue','Setting'],'Foreshadowing','Foreshadowing hints at what will happen later.'],
    ['ce','Choose the correct sentence.',['She go to school.','She goes to school.','She going to school.'],'She goes to school.','一般现在时中，第三人称单数主语使用 goes。'],
    ['physics','力的国际单位是什么？',['焦耳','瓦特','牛顿','帕斯卡'],'牛顿','力的国际单位是牛顿，符号 N。'],
    ['chemistry','水的化学式是什么？',['CO₂','H₂O','O₂','NaCl'],'H₂O','一个水分子由两个氢原子和一个氧原子构成。'],
    ['biology','植物细胞进行光合作用的主要场所是？',['细胞核','线粒体','叶绿体','细胞壁'],'叶绿体','叶绿体含叶绿素，是光合作用的主要场所。'],
    ['history','第一次工业革命中，改良蒸汽机的重要人物是谁？',['瓦特','牛顿','达尔文','哥白尼'],'瓦特','瓦特改良蒸汽机，促进了工业动力技术的发展。'],
    ['chinese','“首屈一指”最恰当的意思是？',['最先受到冲击','位居第一，出类拔萃','紧急危险','手指弯曲'],'位居第一，出类拔萃','“首屈一指”用于称赞第一或最好；“首当其冲”指最先受到冲击。'],
  ].map(([subject,prompt,options,answer,explanation], index) => {
    const node = nodes.find(n=>n.subject===subject);
    return {schemaVersion:1,id:'watch-demo-choice-'+index,nodeId:node.id,skillId:node.skills[0].id,subject,type:'choice',prompt,options,answer,explanation,
      difficulty:1,expectedSeconds:30,variant:'watch-authored-demo-'+index,source:'Reviewbox 手表原创演示题',tags:['演示'],version:'1',verified:true};
  });
  const day = offset => new Date(now + offset * 86400000).toISOString().slice(0,10);
  const exams = [
    {id:'watch-demo-exam-math',title:'数学月考（演示）',subject:'math',date:day(-4),scope:[],target:85,dailyMinutes:10,result:{score:82,maxScore:100,credits:2,recordedAt:new Date(now-3*86400000).toISOString()}},
    {id:'watch-demo-exam-english',title:'英语小测（演示）',subject:'english',date:day(-2),scope:[],target:85,dailyMinutes:10,result:{score:88,maxScore:100,credits:1,recordedAt:new Date(now-86400000).toISOString()}},
    {id:'watch-demo-exam-next',title:'下周数学测验（演示）',subject:'math',date:day(6),scope:[],target:90,dailyMinutes:10},
  ];
  return [...nodes.map(payload=>({id:payload.id,kind:'node',payload})), ...[...questions,...authored].map(payload=>({id:payload.id,kind:'question',payload})),
    ...exams.map(payload=>({id:payload.id,kind:'exam',payload})),
    {id:'settings',kind:'setting',payload:{name:'企鹅演示空间',dailyMinutes:10,surprise:false}},
    {id:'watch-demo-note',kind:'note',payload:{id:'watch-demo-note',subject:'math',name:'先理解，再练习',text:'先尝试独立回忆；对照答案后真实自评。不会的内容先阅读讲解，再做巩固。演示资料仅保存在本机，不参与个人成绩。'}}
  ].map(r=>({...r,updated_at:new Date(now).toISOString(),deleted:false}));
}
