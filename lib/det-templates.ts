import {DET_TASKS} from './det-model';
export const DET_TEMPLATES:Record<string,any>={
 det_read_select:{word:'coherent',answer:'Yes',explanation:'Coherent means logical and consistent.'},
 det_fill_blanks:{native:{before:'Please return the book to the',prefix:'lib',missingLength:4,after:'before Friday.'},answer:'library',explanation:'Library fits the context of returning a book.'},
 det_read_complete:{passage:'The mus{eum} is open from Tuesday to Sunday.',answer:['museum'],explanation:'The institution displaying artifacts is a museum.'},
 det_listen_type:{audioText:'The library closes at six today.',answer:'The library closes at six today.',explanation:'Transcribe every word in the recording.'},
 det_reading_sentences:{passage:'The [0] welcomes [1].',native:{options:[['museum','weather'],['visitors','forecasts']]},answer:['museum','visitors'],explanation:'A museum welcomes visitors.'},
 det_reading_passage:{passage:'The museum opened a new exhibit.\n\nMany residents attended.\n\nThe exhibition remained popular for weeks.',native:{gapIndex:1},choices:['Many residents attended.','The building was never opened.'],correct:0,explanation:'Attendance connects the new exhibit to its popularity.'},
 det_reading_highlight:{passage:'The museum is closed on Monday for cleaning.',prompt:'Why is the museum closed on Monday?',answer:'for cleaning',explanation:'The phrase gives the reason for the closure.'},
 det_reading_idea:{passage:'The museum invited students to a free workshop. Students learned to examine historical objects.',choices:['Students learned about history.','Students learned to drive.'],correct:0,explanation:'The workshop concerned historical objects.'},
 det_reading_title:{passage:'Students visited the museum and learned to examine historical objects.',choices:['Learning at the Museum','A Driving Lesson'],correct:0,explanation:'This title captures the main topic.'},
 det_listening_complete:{audioText:'We will meet at the library at six.',native:{blanks:[{text:'We will meet at the'}],questions:['Where will we meet?']},answer:['library'],explanation:'The speaker states the meeting location.'},
 det_listening_respond:{audioText:'Would you like to join our study group?',choices:['Yes, I would be happy to.','The library is a building.'],correct:0,explanation:'Accepting the invitation responds directly to the speaker.'},
 det_listening_summary:{prompt:'Summarize the conversation about joining a study group.',answer:'A classmate invited me to join a study group, and I accepted.',explanation:'Summarize the main topic and outcome.'},
 det_write_photo:{native:{image:'REPLACE_WITH_DATA_IMAGE',imageAlt:'Describe the actual uploaded image.'},answer:'Describe the actual scene with specific details.',explanation:'Mention the main subjects, actions and setting accurately.'},
 det_writing:{prompt:'Describe a place where you enjoy studying and explain why.',answer:'I enjoy studying at the library because the quiet atmosphere helps me focus.',explanation:'Develop your ideas with specific reasons and examples.'},
 det_writing_followup:{prompt:'How would you improve this study space?',answer:'I would add more comfortable seating and brighter reading lamps.',explanation:'Explain concrete changes and connect them to your first response.'},
 det_speak_photo:{native:{image:'REPLACE_WITH_DATA_IMAGE',imageAlt:'Describe the actual uploaded image.'},answer:'Describe the subjects, actions and setting in connected speech.',explanation:'Check relevance, clarity, fluency and language accuracy.'},
 det_read_speak:{prompt:'Describe an important skill you learned. Explain how you learned it.',answer:'I learned to organize my study time by creating a weekly plan.',explanation:'Give details about the skill and the learning process.'},
 det_conversation:{audioText:'What do you enjoy about learning a new language?',answer:'I enjoy being able to communicate with people from different cultures.',explanation:'Answer the specific question and explain your reasoning.'},
 det_writing_sample:{prompt:'What can students gain from volunteering?',answer:'Volunteering helps students develop empathy and practical skills.',explanation:'Organize and develop your argument with examples.'},
 det_speaking_sample:{prompt:'Describe a memorable learning experience.',answer:'A museum workshop helped me understand how historians examine evidence.',explanation:'Give a clear account and explain its significance.'},
};
export function detTemplate(type:string){const spec=DET_TASKS[type];return JSON.stringify({schemaVersion:1,exam:'DET',title:'Duolingo · '+spec.route+' 专项练习',flow:[{id:'det',label:spec.route,type:'det',durationSeconds:spec.seconds,count:1}],sectionsInline:{det:{questions:[{id:'q1',type,prompt:'Complete the task.',skill:type,difficulty:3,...DET_TEMPLATES[type]}]}}},null,2);}
export const DET_SKILL=`
Duolingo English Test（DET）：exam:"DET"，兼容 Duolingo 拼写。按导入题序进行个人模拟，题库可重复使用，不换算官方 10–160 分。现行题型不使用已移除的 Read Aloud。flow 的 type:"det"；考试准备、设备确认、题型介绍、录音、保存动画和完成界面由系统负责，勿生成界面代码。
题目 type 可为 ${Object.keys(DET_TASKS).join(' / ')}。每题含 prompt、answer（参考答案）、explanation、skill、difficulty。客观选择题 choices 与 correct 同其他考试；det_read_select 的 word 为英文真词或伪词，answer 为 Yes / No。
det_fill_blanks：native:{before,prefix,missingLength,after}，answer 为完整单词。det_read_complete：passage 用 mus{eum} 标注缺失字母，answer 为按顺序完整单词数组。det_reading_sentences：passage 用 [0]、[1] 顺序标空；native.options 为各空的选项二维数组，answer 为正确词数组。
Interactive Reading 一组依次为 det_reading_sentences、det_reading_passage、两个 det_reading_highlight、det_reading_idea、det_reading_title，六题使用相同 group ID、完整一致的 passage（段落用双换行分开）。det_reading_passage 的 native.gapIndex 为要挖空的段落下标（从0起），choices 为完整候选段落；highlight 的 answer 是原文中的确切短语。可选 native.title 为文章标题。组内共享480秒；新文章使用新的 group。
Interactive Listening 一组包含 det_listening_complete、5–6道 det_listening_respond、det_listening_summary。前两类共享同一 group 与390秒，summary单独75秒。Complete提供audioText或音频和native:{blanks:[{text:"补全前文"}],questions:["问题"]}，answer为等长答案数组。Respond用choices/correct与audioText或音频；Summary包含完整对话背景与参考摘要、rubric。
听力与互动口语须提供 audioText 或 ZIP 中的真实 audio 音频路径。只给朗读文本时使用设备英文语音，不冒充正式录音。det_conversation 一组6–8题，每题35秒，并用同一group；包含真实问题audioText、参考answer、自评要点explanation。
图片任务 det_write_photo、det_speak_photo 提供 native.image:"data:image/jpeg;base64,..." 和 imageAlt，或 ZIP中的image路径；图片须真实可用，不能编造。det_writing与det_writing_followup为两道关联题：完整首问与根据首问设计的追问，分别300/180秒，后页会展示用户前一回答。
其余写作、口语题提供完整prompt、参考answer、explanation，可含rubric:[{id,title,max,description,skillId:"apply"}]。det_read_speak/图片口语准备20秒、答题90秒；写作/口语sample准备30秒，分别答题300/180秒。口语保存真实录音，交卷后回听并自评。未生成的题目不进入可用试卷；不得循环示例凑题量。
默认练习组卷：Read and Select15题、Fill in the Blanks6题、Read and Complete3题、Listen and Type6题、Interactive Reading2组、Interactive Listening2组、图片写作3题、Interactive Writing首问/追问各1题、图片口语/Read Then Speak各1题、Interactive Speaking6题、Writing/Speaking Sample各1题。官方题量具有区间和自适应变化，此配置仅为完整题型个人模拟。少量题明确标为专项练习。
`;
