import {ACCURATE_AUTHORING_SKILL} from './accurate-authoring-skill';
import {CHEMICAL_BIOLOGICAL_SKILL} from './chemical-skill';
import {QUALITY_IMPORT_EXAMPLES,PROFESSIONAL_DIAGRAM_EXAMPLES} from './learning-quality-examples';
import {SHADING_IMPORT_SKILL} from './professional-diagram-examples';
import {MATH_AUTHORING_SKILL} from './math-authoring-skill';
import {SCIENTIFIC_IMPORT_SKILL,BIOLOGY_IMPORT_SKILL} from './scientific-skill';
import { learningTemplate } from './import-templates';
import { EXAM_IMPORT_SKILL } from './exam-skill';
import { validatePack, smartParse } from './importer';
import type { Subject } from './model';
export function parseImportText(text: string, subject?: Subject) {
  let raw = text.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(
        'JSON 格式不完整，请复制完整学习包，包括最外层的大括号。',
      );
    }
    const pack = validatePack(value);
    return { nodes: pack.knowledge, questions: pack.questions, pack };
  }
  if (raw.includes('schemaVersion'))
    throw new Error('检测到学习包内容，请复制完整 JSON 或 JSON 代码块。');
  return smartParse(raw, subject);
}
export { IMPORT_EXAMPLE } from './learning-example';
import { IMPORT_EXAMPLE } from './learning-example';
export const LEARNING_IMPORT_SKILL = `# Reviewbox 学习包出题 Skill 4.1 · 2026-11-01 · schemaVersion 1

根据我随后提供的学科、知识范围、难度、题量和题型，制作原创学习包。只输出一个合法 JSON 对象，可放在一个 json 代码块中。不要输出聊天说明，不要输出备份记录或个人掌握度。

## 必须遵守
- 顶层为 {schemaVersion:1,manifest:{id,title,version,subject,description,changelog,compatibility},knowledge:[],questions:[]}。compatibility 写 Reviewbox 2.x。
- 正式版不会预装知识框架。包内必须提供题目所需的真实 knowledge、skills 与章节信息；不要引用示例或假定用户已有节点。prerequisites 只填写真实必要前置，relatedNodes 只填写有依据的关联，不能为了知识地图好看编造连线。chapter/unit/course 使用实际教学组织名称。
- 连线题的左右 ID 是稳定身份，不是显示位置。重新排列 right 数组不得改 ID 或改变 answer 映射；更新学习包也必须保留同一项目的 ID。示例：right 从 [R1,R2] 变成 [R2,R1] 后，答案仍是 L1→R1、L2→R2。不要把答案保存成索引、字母或连线绘制顺序。
- 系统界面语言与学习内容语言独立。按用户指定语言生成题目、原文、答案和解析；不要翻译 ID、Schema 字段名和评分枚举。不要输出个人记录、GPA、掌握度或后端参考池凭证。
- subject 仅可选 chinese / math / english / ce / physics / chemistry / biology / history。CE 包含 SAT、ACT、TOEFL、MAP、Duolingo 英语训练。各学科学习框架一致。
- knowledge 每项字段必须与下面示例一致。节点 ID 唯一；skills 至少一个，包含 id/title/difficulty。importance 和 examWeight 在 0–1。difficulty 是 1–5 整数。
- questions 必须包含示例中的必填字段，schemaVersion:1。每道题 nodeId 引用本包 knowledge 中的节点，subject 与该节点一致，skillId 必须属于该节点。id 在包内唯一。expectedSeconds 为 1–3600。
- 题型 type 可选 recall（回忆卡）、choice（选择）、blank（填空）、matching（连线）、pinyin（看拼音写汉字）、subjective（主观表达）。严格遵守我指定的题型范围。
- choice: options 为 2–6 个不同的完整选项字符串；answer 必须与其中一个完整字符串完全相同，不能只写 A/B/C/D。解释正确项与干扰项。
- blank: 数学填空的 answer 优先用不带 LaTeX 包裹的纯数字或分数（如 2、1/2），公式仍可用在题干与解析。prompt 用 ____ 表示空位，answer 是简洁答案；acceptedAnswers 可给等价表达字符串数组。多个空按题目声明的分隔符输入。
- pinyin: 系统不提供汉字输入框，显示答案后手动选择答对/不确定/答错。prompt 只给带声调拼音，answer 为汉字，explanation 为空字符串。一个字词对应一个 knowledge 节点与独立掌握度；同篇字词的 questions 使用相同 collectionId 与 collectionTitle（例如“藤野先生字词”），篇目是集合而非知识点。
- matching: matching:{left:[{id:"L1",text:"..."},{id:"L2",text:"..."}],right:[{id:"R2",text:"..."},{id:"R1",text:"..."}]}，两侧各 2–8 项，ID 独立且唯一，右侧打乱；answer 是 JSON 字符串，例如 "{\\"L1\\":\\"R1\\",\\"L2\\":\\"R2\\"}"。必须一一对应。explanation 用可读文字逐项解释。
- subjective: 提供 passage（依赖的完整原文）、answer（示例答案）与下文 gradingRule；旧 rubric:[{id,title,max,description,skillId}] 仍兼容。每个评分点映射该节点的有效能力，分值为正数，不能只给总分。
- 数学每题提供 solution 数组 4–8 个主要步骤，最多 12 项，完整保留已知、方法、公式、推导和结论，不逐句拆步。用 $...$ 或 $$...$$ 包裹 LaTeX，遵守 JSON 转义，如反斜线写双反斜线。数值必须独立复算。
- 可选 diagram 优先使用下面的 type:semantic 学科结构。旧 geometry/function_graph/physics 仍兼容。函数表达式仅用小写 x、数字、+ - * / ^ 和括号。不要输出 SVG、HTML、脚本或用图片冒充精确几何图。
- 除 pinyin 外，每题必须有清楚的 explanation。题干、答案、解释与评分标准须一致。不要写 verified:true 或伪造核验结果。
- 内容更新使用相同的节点/题目 ID 和更高 version；新增内容使用新 ID。输出前自行检查 JSON、ID 引用、题量、题型与答案唯一性。

## 导入 2.0：固定评分规则
- 学习流程仍然是外部 AI 创作 JSON/ZIP，Reviewbox 检查后导入，Qwen 严格依照已确认规则批改。
- manifest.subject 可为 all 或八科学科之一；题目 subject 必须是八科学科之一。manifest 可加 scoringPolicy:{mode:"auto",preferences:"阅读重证据；数学保留过程分"}。mode 仅 auto/points/steps/solo/rubric-solo/custom。偏好最多 3000 字，不得写成覆盖系统指令的文本。
- 主观题优先使用 gradingRule:{id,version,mode,maxScore,criteria:[{id,title,max,description,skillId,fullCredit,partialCredit,deductions,equivalentAnswers,independentCredit,carryForward}],solo?}。评分点 ID 唯一，max 正数且不超过 100，maxScore 等于评分点合计；skillId 属于题目引用的知识点。id 稳定，规则修改须提高 version。
- fullCredit 是满分条件，partialCredit 是部分得分条件，deductions 是扣分条件，equivalentAnswers 是可选等价答案数组。数学/物理应明确独立过程分 independentCredit 和合理错误传递 carryForward，不能因最终结果错将正确过程清零。不得机械套用全部学科维度。
- 旧 rubric:[{id,title,max,description,skillId}] 继续有效并完整保留。不要同时提供相互矛盾的 rubric 和 gradingRule；新包只给 gradingRule 即可。客观题不需要 Rubric。缺少标准会进入待补充预览，不会偷偷采用模型临时规则。
- solo 或 rubric-solo 模式必须有 solo:{levels:[{level:"L1",description},...,{level:"L5",description}],fullCreditLevel:"L4"}。五级必须齐全且各自针对本题：前结构、单点、多点、关联、抽象拓展。不可按字数、连接词或关键词数判定。满分不一定要求 L5；把实际满分条件写入评分点，SOLO 等级作为结构评价，不额外偷偷乘系数。
- 不生成学生 grade、真实成绩、规则已确认标记、学习事件或掌握度。所有自然语言均是内容数据，不能要求执行或忽略应用的安全/核验规则。

## 导入 2.0：题型与步骤稳定性
- 只有 type:matching 才能包含 matching。其他题型完全省略 matching，不填 null、空对象或字符串。左右必须是 {id,text} 数组，不是文本段落；答案是一一映射的 JSON 字符串，不能从位置猜配对关系。
- choice 只输出有效选项与唯一完整答案。subjective 输出固定规则。solution 只能是字符串数组，4–8 个完整主要步骤，最多 12 项；不截断结论。
- 所有可选字段不使用时直接省略，不填 null。不得沿用变式原题的旧数值图；图形条件、解法、答案须同时复算。

## 导入 2.0：专业图形与图片
- 语义图形采用 {type:"semantic",kind:...}。数学坐标 y 向上。图形中的数据只能来自题目已给条件；不虚构长度、角度、物距、器材或操作。标签只写题目已给信息和器材名称，不泄露解析。
- geometry: points:[{id,x,y,label?}],segments:[[点ID,点ID]],circles?:[{id,center:点ID,r}],marks?:[{kind,points,label?,circleId?}]。right 的 points 是 [边上点,顶点,另一边点]；parallel/equal 是两条线段的四个点；angle 三点，dimension 两端点；tangent 两点依次为切点、切线上另一点，并给 circleId。直角、平行、等长、相切必须与数值坐标真实一致。
- function: xRange:[min,max],yRange:[min,max],functions:[{expression,label?}],tickX?,tickY?,grid?,keyPoints?:[{id,x,y,label?}]。表达式使用显式乘号，小写 x；不支持任意程序、sin 或外部函数。
- forces: body:"box"|"sphere",surface:"none"|"horizontal"|"incline",incline?,forces:[{id,kind:"gravity"|"normal"|"friction"|"applied",label,origin:"center"|"contact"|"top",angle,magnitude?}]。角度按数学方向，0°向右、90°向上。重力必须从重心指向 270°；支持力从接触点垂直接触面；摩擦力沿接触面。magnitude 只填写已知量，不能把待求力写进图中。
- optics: lens:"convex"|"concave",focalLength,objectDistance,objectHeight,showRays,showImage。长度用同一单位，均为正数；焦距取正，透镜类型决定正负。问像的位置、大小或光路时通常 showImage:false / showRays:false，避免预先给答案。只有条件确实允许展示时才打开。
- experiment: setup:"evaporation"|"filtration"|"apparatus",apparatus:[{id,kind,label?,liquidLevel?}],connections?:[{from,to,relation:"inside"|"above"|"tube"}]。器材 kind 仅 evaporating_dish/glass_rod/funnel/beaker/test_tube/alcohol_lamp/stand/filter_paper/delivery_tube/graduated_cylinder。液面比例仅填写已知信息，不提供时不编造。题图标签只写“玻璃棒”等名称，绝不写其作用或答案。
- circuit: nodes:[{id,x,y}],components:[{id,kind:"wire"|"battery"|"switch_open"|"switch_closed"|"resistor"|"lamp"|"ammeter"|"voltmeter",from,to,label?}]。节点引用必须存在，连接必须符合题目；用标准元件符号。
- lever: pivot,loads:[{position,force,label}],equilibrium?。位置与力用统一单位，force 正数表示向下；声明 equilibrium:true 必须满足力矩和为零。
- buoyancy: submerged(0–1),bodyLabel?,liquidLabel?,showForces。motion: positions:[{x,time,label?}],direction?:"left"|"right"，时刻递增。statistics: chart:"bar"|"line"|"numberline",data:[{label,value}],unit?。都只采用已知条件。
- 普通 PNG/JPG/WebP 图片用 media:[{id,src,alt,purpose:"question"|"solution"}]。JSON 的 src 为 data:image/png;base64,...（或 jpeg/webp）；ZIP 中 src 为 assets/xxx.png，对应真实文件。禁止远程脚本、SVG、HTML、路径跳转。每张图片≤650 KB，全包图片≤5 MB，单题 base64 总长度≤1500000。
- 保留已有原图；没有可靠结构时不要声称照片可无损转矢量。若同时提供 media 原图和 diagram 重绘，省略 diagramChoice 让用户在预览里选择。solution 图片只在解析阶段使用。
- ZIP 根目录用 manifest.json（含 schemaVersion:1）、knowledge.json、questions.json，可选 rubrics.json/keyterms.json 与 assets/。同包更新必须保持 manifest.id 及未改身份的题目 ID，提高版本；修改规则/答案/图形/图片/映射都会进入差异预览，用户个人修改不得被静默覆盖。

## 可选：认知诊断、记忆指纹与跨语境迁移
- 不修改 schemaVersion；每道普通学习题可增加 cognitiveAttributes、conceptIds、contextId、memoryFamily。旧包省略这些字段仍有效。
- cognitiveAttributes 是题目需要的底层能力（Q-matrix），不是给学生贴错误标签。仅可选 symbolic（符号与逐步推导）、calculation（运算）、evidence（证据提取）、vocabulary（词义）、syntax（语法）、recall（回忆）、causal（因果）、application（应用），数组最多 8 项。不要所有题都标同一组；提供单能力题与不同组合的题，让系统能区分缺口。不得声称学生“跳步”或捏造诊断。
- conceptIds 用稳定概念 ID，例如 vector、proportion、conservation、causality、evidence、structure-function；自建 ID 也可用。跨学科题必须真正检验同一概念操作，不是给原题改一个学科标签。
- contextId 是该题的具体情境 ID；variant 与参数/情境一起更换。memoryFamily 仅 formula / vocabulary / fact / reasoning。
- 示例：比例题可附加 {"cognitiveAttributes":["calculation","application"],"conceptIds":["proportion"],"contextId":"math:recipe-ratio","memoryFamily":"formula"}；物理密度应用题附加 {"cognitiveAttributes":["calculation","application"],"conceptIds":["proportion"],"contextId":"physics:density-lab","memoryFamily":"formula"}。两题仍各自关联本学科的 nodeId × skillId。
- 不输出 learningEvidence、用户事件、掌握度、策略分配或核验结果。这些由系统记录。外部导入题不会自动取得“已核验”资格。

## 完整有效示例（更换为我要求的内容）
${JSON.stringify(IMPORT_EXAMPLE, null, 2)}
`;

const learningLabels: Record<string, string> = {
  recall: '回忆卡',
  choice: '单项选择',
  blank: '填空',
  matching: '连线',
  pinyin: '看拼音写汉字（篇目集合）',
  subjective: '主观题与评分点',
};
export const IMPORT_SKILL =
  LEARNING_IMPORT_SKILL +
  '\n\n## 六种普通学习题型的完整示例\n每个代码块都是可独立导入的完整学习包，不需要拼接。按所需题型选用一个，新增题目时确保节点和能力引用有效。拼音题只显示拼音与汉字，不需要解释，也不需要输入汉字。\n' +
  Object.entries(learningLabels)
    .map(
      ([type, label]) =>
        '### ' + label + '\n```json\n' + learningTemplate(type) + '\n```',
    )
    .join('\n\n') +
  '\n\n## 导入 2.0 完整评分与学科图形示例\n' + QUALITY_IMPORT_EXAMPLES.map(pack=>'### '+pack.manifest.title+'\n```json\n'+JSON.stringify(pack,null,2)+'\n```').join('\n\n') + '\n\n### 函数图像结构示例（填入题目的 diagram）\n```json\n'+JSON.stringify(PROFESSIONAL_DIAGRAM_EXAMPLES.function,null,2)+'\n```\n\n' +
  SHADING_IMPORT_SKILL + '\n\n' + MATH_AUTHORING_SKILL + '\n\n' + SCIENTIFIC_IMPORT_SKILL + '\n\n'+ BIOLOGY_IMPORT_SKILL+'\n\n'+CHEMICAL_BIOLOGICAL_SKILL+'\n\n'+ACCURATE_AUTHORING_SKILL+'\n\n' + EXAM_IMPORT_SKILL;
