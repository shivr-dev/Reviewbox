export const EXAM_IMPORT_SKILL = `# CE 考试包出题 Skill · schemaVersion 1
为 Review 生成可导入的 TOEFL、SAT 或 ACT 英语试卷。输出完整 JSON，或 ZIP（根目录 manifest.json、各 sections JSON、音频资源）。不要输出代码程序或安装包。
JSON 顶层为 {schemaVersion:1,id,title,exam,flow,sectionsInline}。exam 为 TOEFL / SAT / ACT，兼容 TOFEL 拼写。
flow 每项 {id,label,type,durationSeconds,count}。id 唯一。count 必须等于题目数组长度；时间为秒。休息项 type=break。
type 为 bluebook（SAT）、act 或 act-writing（ACT）、toefl-reading / toefl-listening / toefl-writing / toefl-speaking。
sectionsInline 为 {阶段id:{passage?:共享阅读材料,questions:[...]}}。ZIP 的 manifest 使用 sections:{阶段id:"sections/reading.json"}。
所有题目必须包含 id、type、prompt、answer 或 correct、explanation、skill。每道题自动关联 CE Knowledge Node × Skill；skill 应明确具体能力，不能只写考试名称。
选择题：type=mcq / daily_life / academic_passage / listen_response / conversation / announcement / lecture，choices 为 2–6 个不重复的完整选项字符串，correct 为从 0 开始的正确选项下标，答案唯一。
TOEFL 补词：type=complete_words（兼容 fill_letters），passage 用英文前缀加下划线标空，parts:[{visiblePrefix:"dig",missingLength:4,answer:"digital"}]；完整词与前缀和缺失长度必须一致。也可 answer:"digital|example" 与空格逐一对应。
TOEFL 组句：type=build_sentence，words 为词块数组，slots 为需要的词块数，answerLead / answerTail 可选，answer 为含前后固定文字的完整句子。可以含干扰词块。
TOEFL 写作：type=write_email（兼容 email）或 academic_discussion，提供参考 answer、explanation 和 rubric:[{id,title,max,description,skillId:"apply"}]；邮件可含 to、subject、instructions；讨论可含 professorPrompt、posts:[{name,text}]。
TOEFL 听力及口语必须提供 audio:"assets/xxx.mp3"（ZIP内真实音频，支持 mp3/wav/ogg/webm/m4a），或 audioText 供设备朗读。不要编造不存在的音频地址。可含 dialogue:[{speaker,text}]。
口语 type=listen_repeat / interview，responseSeconds 为 1–180 秒，answer 为参考表达，explanation 为自评要点。系统保存录音供回听和自评，不冒充官方口语评分。
SAT 默认英语专项两个 Reading and Writing 模块，各 27 题、1920 秒。固定路线导入必须注明固定卷；第二模块自适应导入使用 flow id=rw1/rw2，sectionsInline 包含 rw1、rw2_easy、rw2_hard（各27题），无需 rw2；系统按第一模块本卷正确率65%模拟分流。
ACT 英语专项 English 50题2100秒、Reading36题2400秒；Writing 可选1篇2400秒，在其前加入300秒break。不要生成数学或科学部分。
TOEFL 2026练习包括阅读补词/生活阅读/学术阅读，听力回应/对话/通知/讲座，写作组句/邮件/讨论，口语跟读/访谈。全卷基线 Reading 50项约1800秒、Listening47项约1740秒、Writing12项1380秒、Speaking11项约480秒。补词页面可含多个作答空，因此页面数和计分项数须区分。小卷明确标为专项练习，不声称完整官方试卷。写作沿用分题型6/7/10分钟；口语逐题计时。
所有题目附准确解析、难度1–5，原创或有使用权限，不标为官方原题。不伪造官方量表分数。禁止外部脚本、HTML、远程资源执行。普通语文拼音题仍采用揭晓后手动检查，不要求输入汉字。
可直接导入的最小示例：
{"schemaVersion":1,"id":"sample-reading","title":"TOEFL 阅读专项练习","exam":"TOEFL","flow":[{"id":"reading","label":"Reading","type":"toefl-reading","durationSeconds":90,"count":1}],"sectionsInline":{"reading":{"questions":[{"id":"q1","type":"daily_life","skill":"Identify purpose","passage":"The library will close at 6 p.m. on Friday for maintenance.","prompt":"Why will the library close early?","choices":["For repairs.","For a celebration."],"correct":0,"explanation":"The notice says maintenance, which means work to keep the facility in good condition."}]}}}
`;
